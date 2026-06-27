"""PPT generation service — SVG output with PPTX fallback.

Uses PPT-Agent Bento Grid methodology: style YAML → AI outline → Bento Grid layout → SVG output.
"""
import os
import json
import asyncio
import logging
from lxml import etree
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from database import get_db

_logger = logging.getLogger("uvicorn")


def _extract_typography(prs) -> dict:
    """Extract typography info from a PPTX Presentation object."""
    fonts = set()
    sizes = set()
    bold_count = 0
    total_runs = 0
    for slide in prs.slides:
        for shape in slide.shapes:
            if shape.has_text_frame:
                for para in shape.text_frame.paragraphs:
                    for run in para.runs:
                        total_runs += 1
                        f = run.font
                        if f.name:
                            fonts.add(f.name)
                        if f.size:
                            sizes.add(round(f.size / 12700, 1))
                        if f.bold:
                            bold_count += 1
    return {
        "fonts": sorted(list(fonts)),
        "sizes_pt": sorted(list(sizes)),
        "bold_ratio": round(bold_count / total_runs, 2) if total_runs > 0 else 0,
        "total_text_runs": total_runs
    }


def _clean_json_response(response: str) -> str:
    """Strip markdown code fences and extract JSON from AI response."""
    import re
    text = response.strip()
    # Remove markdown code block wrappers
    text = re.sub(r'^```(?:json)?\s*\n?', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\n?```\s*$', '', text)
    # Remove PPT-Agent [PPT_OUTLINE] markers
    text = re.sub(r'\[PPT_OUTLINE\]\s*', '', text)
    text = re.sub(r'\[/PPT_OUTLINE\]\s*', '', text)
    return text.strip()


def _safe_run_async(coro):
    """Run an async coroutine from any thread — works in FastAPI thread pools.

    On Windows, asyncio.run() can leak "Event loop is closed" errors from
    httpx/AsyncOpenAI cleanup callbacks. We always spawn a dedicated daemon
    thread to fully isolate the event loop lifecycle.
    """
    import concurrent.futures
    import threading

    result = [None]
    error = [None]

    def _runner():
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            try:
                result[0] = loop.run_until_complete(coro)
            finally:
                try:
                    loop.call_soon(lambda: None)
                    loop.run_until_complete(asyncio.sleep(0))
                    loop.close()
                except RuntimeError:
                    pass  # Event loop already closed by httpx cleanup on Windows
        except Exception as e:
            error[0] = e

    t = threading.Thread(target=_runner, daemon=True)
    t.start()
    t.join(timeout=300)
    if t.is_alive():
        raise TimeoutError("LLM API call timed out after 300s")
    if error[0]:
        raise error[0]
    return result[0]

_NS = "http://schemas.openxmlformats.org/drawingml/2006/main"


def _set_font_all(run, font_name: str):
    """Set both Latin and East Asian font on a run.

    run.font.name only sets the Latin font. For Chinese characters,
    the East Asian (ea) font must also be set via XML.
    """
    run.font.name = font_name
    rPr = run._r.get_or_add_rPr()
    ea = rPr.find(f"{{{_NS}}}ea")
    if ea is None:
        ea = etree.SubElement(rPr, f"{{{_NS}}}ea")
    ea.set("typeface", font_name)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WORKSPACE_ROOT = os.path.dirname(BASE_DIR)  # d:\YISHAOAGENT
EXPORT_DIR = os.path.join(BASE_DIR, "data", "exports")
os.makedirs(EXPORT_DIR, exist_ok=True)


def _load_style_from_template(template_id: str = None) -> str:
    """Extract style_id from template rules. Defaults to 'business'."""
    if not template_id:
        return "business"
    db = get_db()
    try:
        row = db.execute(
            "SELECT rules FROM templates WHERE id = ?", (template_id,)
        ).fetchone()
        if row and row["rules"]:
            rules = json.loads(row["rules"])
            style_id = rules.get("style_id", "")
            if style_id:
                return style_id
    except Exception:
        pass
    finally:
        db.close()
    return "business"




# In-memory status for PPT generation progress polling
_ppt_status: dict = {}

def get_ppt_status(project_id: str) -> dict | None:
    """Return current PPT generation status for a project, or None if idle."""
    return _ppt_status.get(project_id)


def generate_ppt(content: str, template_id: str = None, branding: dict = None,
                 output_dir: str = None, provider_id: str = "",
                 model: str = "", slide_plan: list = None, format: str = "svg",
                 project_name: str = "", column_id: str = "",
                 temperature: float = 0.3, project_id: str = "",
                 temp_keyword: float = 0, temp_research: float = 0,
                 temp_outline: float = 0, temp_fill: float = 0,
                 temp_cards: float = 0, temp_html: float = 0,
                 temp_svg_batch: float = 0, temp_svg_single: float = 0,
                 temp_review: float = 0, temp_fix: float = 0,
                 temp_holistic: float = 0, temp_holistic_fix: float = 0,
                 temp_stage_outline: float = 0, temp_stage_generation: float = 0,
                 temp_stage_review: float = 0) -> str:
    """Generate presentation from content. Default: SVG (PPT-Agent Bento Grid).

    All 12 stage temperatures follow the pattern: 0 = use `temperature` as fallback."""

    def _t(val, default=0.3):
        return val if val > 0 else temperature

    st = dict(
        keyword=_t(temp_keyword, 0.3),
        research=_t(temp_research, 0.7),
        outline=_t(temp_outline, 1.0),
        fill=_t(temp_fill, 1.0),
        cards=_t(temp_cards, 0.7),
        html=_t(temp_html, 0.8),
        svg_batch=_t(temp_svg_batch, 0.7),
        svg_single=_t(temp_svg_single, 0.7),
        review=_t(temp_review, 0.3),
        fix=_t(temp_fix, 0.7),
        holistic=_t(temp_holistic, 0.3),
        holistic_fix=_t(temp_holistic_fix, 0.7),
    )

    # Stage-level overrides: when set, override all per-step temps in that stage
    if temp_stage_outline > 0:
        st.update(keyword=temp_stage_outline, research=temp_stage_outline,
                  outline=temp_stage_outline, fill=temp_stage_outline)
    if temp_stage_generation > 0:
        st.update(cards=temp_stage_generation, html=temp_stage_generation,
                  svg_batch=temp_stage_generation, svg_single=temp_stage_generation)
    if temp_stage_review > 0:
        st.update(review=temp_stage_review, fix=temp_stage_review,
                  holistic=temp_stage_review, holistic_fix=temp_stage_review)

    # Track status for progress polling
    if project_id:
        _ppt_status[project_id] = {"phase": "generating", "phase_label": "正在生成大纲...", "message": "AI 分析内容中"}

    # Build human-readable dir name: "{项目名}_{类型}" (e.g. "测试1_道术PPT")
    col_label_map = {"col4": "道术PPT", "col5": "研学PPT", "col3": "SOP课件", "col2": "SOP课件"}
    safe_proj = "".join(c for c in project_name if c.isalnum() or c in "._- ()（）").strip() if project_name else ""
    col_label = col_label_map.get(column_id, "PPT")
    dir_name = f"{safe_proj}_{col_label}" if safe_proj else ""
    prs = None
    slide_data = None
    rules = {}
    typography_profile = None
    style_id = "business"

    if slide_plan is not None:
        slide_data = slide_plan

    if template_id:
        db = get_db()
        try:
            row = db.execute(
                "SELECT file_path, rules, typography_profile, branding_config FROM templates WHERE id = ?",
                (template_id,)).fetchone()
            if row:
                if row["file_path"]:
                    fp = row["file_path"]
                    if not os.path.isabs(fp):
                        fp_ws = os.path.join(WORKSPACE_ROOT, fp)
                        fp_be = os.path.join(BASE_DIR, fp)
                        if os.path.exists(fp_ws):
                            fp = fp_ws
                        elif os.path.exists(fp_be):
                            fp = fp_be
                    if os.path.exists(fp) and fp.endswith('.pptx'):
                        prs = Presentation(fp)
                if not branding and row["branding_config"]:
                    try:
                        branding = json.loads(row["branding_config"])
                    except Exception:
                        pass
                if row["typography_profile"]:
                    try:
                        typography_profile = json.loads(row["typography_profile"])
                    except Exception:
                        pass
                if row["rules"]:
                    try:
                        rules = json.loads(row["rules"])
                    except Exception:
                        pass

                # Extract style_id from template rules (for SVG mode)
                style_id = rules.get("style_id", "business")

                print(f"[PPT-DBG] AI check: pid={bool(provider_id)} model={bool(model)} "
                      f"style={style_id} "
                      f"rules_empty={not rules} "
                      f"content_len={len(content.strip()) if content else 0}", flush=True)

                if slide_data is None and provider_id and model and content.strip():
                    print("[PPT-DBG] Using AI staged generation", flush=True)
                    col_prompt = ""
                    col_skill = ""
                    try:
                        # Query the specific column_id passed from frontend (col4=道术, col5=研学)
                        target_col = column_id if column_id in ('col4', 'col5', 'col3', 'col2') else 'col4'
                        cfg2 = db.execute(
                            "SELECT prompt, skill, rules FROM column_configs WHERE column_id = ?",
                            (target_col,)
                        ).fetchone()
                        if cfg2:
                            col_prompt = cfg2["prompt"] or ""
                            col_skill = cfg2["skill"] or ""
                            # Merge column_configs rules into template rules (template wins)
                            try:
                                col_rules = json.loads(cfg2["rules"] or "{}")
                                if col_rules and isinstance(col_rules, dict):
                                    merged = dict(col_rules)
                                    merged.update(rules)
                                    rules = merged
                            except Exception:
                                pass
                    except Exception:
                        pass
                    slide_data = _generate_slides_staged(provider_id, model, rules, content,
                                                         col_prompt, col_skill,
                                                         temperature=temperature,
                                                         st=st)
                    print(f"[PPT-DBG] AI result: {bool(slide_data)}, "
                          f"slides={len(slide_data) if slide_data else 0}", flush=True)
                    if not slide_data:
                        print("[PPT-DBG] AI generation failed — no fallback, returning error", flush=True)
                else:
                    if not slide_data:
                        print("[PPT-DBG] No AI provider/model and no saved plan — cannot generate", flush=True)
        finally:
            db.close()

    # ── HTML path (new two-phase pipeline: slides have 'html' field) ──
    if format != "pptx" and slide_data and isinstance(slide_data, list) and len(slide_data) > 0:
        first = slide_data[0]
        if isinstance(first, dict) and "html" not in first and "heading" in first and provider_id and model:
            # Outline format — need to run Phase 5a (Structure) + Phase 5b (HTML)
            print(f"[PPT-DBG] Outline input detected: {len(slide_data)} slides, running Structure+HTML", flush=True)
            from services.llm_service import generate as llm_generate
            structure = _stage2_structure(provider_id, model, llm_generate,
                                           slide_data, style_id=style_id,
                                           temperature=st['cards'])
            if structure:
                html_slides = _stage2_html_per_slide(provider_id, model, llm_generate,
                                                      structure, style_id=style_id,
                                                      temperature=st['html'])
                if html_slides:
                    slide_data = html_slides
                    first = slide_data[0] if slide_data else {}
        if isinstance(first, dict) and "html" in first:
            # New HTML pipeline — slides already have complete HTML, just assemble
            print(f"[PPT-DBG] HTML pipeline: {len(slide_data)} slides with inline HTML", flush=True)
            title = first.get("heading", "") or "Presentation"

            # Build output directory
            html_dir = output_dir if output_dir else os.path.join(EXPORT_DIR, "html_decks")
            if dir_name:
                html_dir = os.path.join(html_dir, dir_name)
            os.makedirs(html_dir, exist_ok=True)

            deck_html = _assemble_html_deck(slide_data, title, style_id)
            html_path = os.path.join(html_dir, "index.html")
            with open(html_path, "w", encoding="utf-8") as f:
                f.write(deck_html)
            _logger.info(f"HTML deck written: {html_path}")

            # Speaker notes
            notes_path = os.path.join(html_dir, "speaker-notes.md")
            try:
                notes_md = _generate_speaker_notes(slide_data, title)
                with open(notes_path, "w", encoding="utf-8") as f:
                    f.write(notes_md)
            except Exception as e:
                _logger.warning(f"Speaker notes failed (non-critical): {e}")

            return html_path, slide_data

        # ── Old SVG path (legacy: slides have 'zones' field) ──
        print(f"[PPT-DBG] Rendering SVG deck: {len(slide_data)} slides, style={style_id}", flush=True)
        from services.svg_designer import DeckDesigner
        from services.llm_service import generate as llm_generate

        designer = DeckDesigner(style_name=style_id, branding=branding)
        title = "Presentation"
        if isinstance(slide_data[0], dict):
            z = slide_data[0].get("zones", {})
            title = z.get("heading", "") or z.get("title", "") or "Presentation"

        try:
            # ── Try AI-SVG direct generation (PPT-Agent slide-core quality) ──
            ai_svg_slides = None
            if provider_id and model:
                print(f"[PPT-DBG] Attempting AI-SVG direct generation...", flush=True)
                try:
                    ai_svg_slides = _stage3_svg(provider_id, model, llm_generate,
                                                 slide_data, style_id=style_id,
                                                 rules=rules, temperature=temperature,
                                                 st=st)
                except Exception as e:
                    print(f"[PPT-DBG] AI-SVG generation failed: {e}", flush=True)

            if ai_svg_slides and len(ai_svg_slides) > 0:
                slides_info, preview_html, svg_dir, _run_id = designer.render_deck_from_ai_svg(
                    ai_svg_slides, title, output_dir, dir_name
                )
                print(f"[PPT-DBG] AI-SVG deck: {len(slides_info)} slides → {svg_dir}", flush=True)
            else:
                slides_info, preview_html, svg_dir, _run_id = designer.render_deck(
                    slide_data, title, output_dir, dir_name
                )
                print(f"[PPT-DBG] Code-rendered SVG deck: {len(slides_info)} slides → {svg_dir}", flush=True)

            html_path = os.path.join(svg_dir, "index.html")

            # ── Speaker notes (PPT-Agent Phase 7 deliverable) ──
            notes_path = os.path.join(svg_dir, "speaker-notes.md")
            try:
                notes_md = _generate_speaker_notes(slide_data, title)
                with open(notes_path, "w", encoding="utf-8") as f:
                    f.write(notes_md)
                _logger.info(f"Speaker notes written: {notes_path}")
            except Exception as e:
                _logger.warning(f"Speaker notes generation failed (non-critical): {e}")

            return html_path, slide_data
        except Exception as e:
            print(f"[PPT-DBG] SVG rendering failed ({e}), falling back to PPTX", flush=True)
            format = "pptx"  # fall through to PPTX path

    # ── PPTX fallback ──
    if format == "pptx":
        if prs is None:
            prs = Presentation()

        prs.slide_width = Inches(13.333)
        prs.slide_height = Inches(7.5)

        if slide_data and isinstance(slide_data, list) and len(slide_data) > 0:
            from services.ppt_designer import extract_design, build_slide
            _remove_all_slides(prs)
            design = extract_design(rules, typography_profile)
            for sd in slide_data:
                if not isinstance(sd, dict):
                    continue
                slide_type = sd.get("type", "content")
                zones = sd.get("zones", {})
                if not isinstance(zones, dict):
                    zones = {}
                build_slide(prs, slide_type, zones, design)
        else:
            _remove_all_slides(prs)
            _mechanical_fill(prs, content)

        if branding:
            for slide in prs.slides:
                left = Inches(0.5)
                top = Inches(7.0)
                width = Inches(12.3)
                height = Inches(0.4)
                txBox = slide.shapes.add_textbox(left, top, width, height)
                tf = txBox.text_frame
                if branding.get("copyright"):
                    tf.text = branding["copyright"]
                if branding.get("signature"):
                    p = tf.add_paragraph()
                    p.text = branding["signature"]
                    p.alignment = PP_ALIGN.RIGHT

        if typography_profile:
            spacing = _compute_spacing_from_profile(typography_profile)
        else:
            db = get_db()
            try:
                spacing = _load_spacing_rules(db)
            finally:
                db.close()
        _normalize_formatting(prs, spacing)

        filename = f"ppt_{os.urandom(4).hex()}.pptx"
        target_dir = output_dir if output_dir else EXPORT_DIR
        os.makedirs(target_dir, exist_ok=True)
        filepath = os.path.join(target_dir, filename)
        prs.save(filepath)
        if project_id:
            _ppt_status.pop(project_id, None)
        return filepath, slide_data

    # No viable path
    if project_id:
        _ppt_status.pop(project_id, None)
    return None, None


# ── Staged AI slide generation ──

def _generate_speaker_notes(slide_data: list, title: str) -> str:
    """Generate speaker notes markdown from slide data — PPT-Agent Phase 7 deliverable.

    Extracts talking points, transitions, and timing from outline data.
    Output format matches PPT-Agent's speaker-notes.md structure.
    """
    lines = [f"# Speaker Notes: {title}", "", f"**Total slides**: {len(slide_data)}", ""]
    total_minutes = 0

    for i, sd in enumerate(slide_data):
        if not isinstance(sd, dict):
            continue
        seq = sd.get("seq", i + 1)
        zones = sd.get("zones", {}) if isinstance(sd.get("zones"), dict) else {}
        heading = zones.get("heading", "") or sd.get("heading", "") or f"Slide {seq}"
        body = zones.get("body", "") or sd.get("body", "")
        notes = zones.get("notes", "") or sd.get("notes", "")
        key_points = sd.get("key_points", []) or zones.get("key_points", [])
        stype = sd.get("type", "content")

        # Estimate timing: cover 1min, content 2-3min, quote/section 0.5min
        time_map = {"cover": 1, "toc": 1.5, "quote": 0.5, "section": 0.5,
                     "summary": 1.5, "closing": 1, "copyright": 0.5}
        minutes = time_map.get(stype, 2)
        total_minutes += minutes

        lines.append(f"---")
        lines.append(f"## Slide {seq:02d}: {heading}")
        lines.append(f"**Type**: {stype} | **Time**: ~{minutes} min")
        lines.append("")

        if key_points:
            lines.append("**Talking Points:**")
            for kp in key_points[:5]:
                if isinstance(kp, str) and kp.strip():
                    lines.append(f"- {kp.strip()}")
            lines.append("")

        if notes and notes.strip():
            lines.append(f"**Notes**: {notes.strip()}")
            lines.append("")

        if body and body.strip():
            # Take first 2 sentences of body as context
            sentences = body.strip().split("。")
            context = "。".join(sentences[:2]) + "。" if len(sentences) > 1 else sentences[0]
            lines.append(f"**Context**: {context.strip()}")
            lines.append("")

        # Transition hint
        if i < len(slide_data) - 1:
            next_slide = slide_data[i + 1]
            if isinstance(next_slide, dict):
                next_zones = next_slide.get("zones", {}) if isinstance(next_slide.get("zones"), dict) else {}
                next_heading = next_zones.get("heading", "") or next_slide.get("heading", "")
                if next_heading:
                    lines.append(f'**Transition**: "Now moving on to {next_heading}..."')
                    lines.append("")

    lines.append("---")
    lines.append(f"## Estimated Total Time: ~{total_minutes} minutes")
    lines.append(f"*Generated by YISHAOAGENT PPT-Agent pipeline*")

    return "\n".join(lines)


def _resolve_review_models(provider_id: str, model: str) -> tuple[str, str, str]:
    """Try to find a different model for review (cross-model validation).

    PPT-Agent advantage: Claude generates, Gemini reviews — different models
    catch different errors. We replicate this: if multiple providers/models are
    configured, pick a different one for review. If only one model exists,
    return the same model but flag for self-review mode.

    Returns (review_provider_id, review_model, mode):
      mode = "cross_model" | "self_review"
    """
    try:
        db = get_db()
        rows = db.execute(
            "SELECT id, model FROM llm_providers WHERE is_enabled = 1"
        ).fetchall()
        db.close()

        candidates = []
        for row in rows:
            pid = row["id"]
            # Get configured model from provider record
            prov_model = row.get("model", "")
            candidates.append((pid, prov_model))

        # Find a different provider or different model
        for pid, prov_model in candidates:
            if pid != provider_id:
                # Different provider — best case
                _logger.info(f"Cross-model review: gen={provider_id}/{model}, review={pid}/{prov_model or model}")
                return pid, prov_model or model, "cross_model"
            elif prov_model and prov_model != model:
                # Same provider, different model
                _logger.info(f"Cross-model review: gen={provider_id}/{model}, review={pid}/{prov_model}")
                return pid, prov_model, "cross_model"

        # If we get here, only one model available
        _logger.info(f"Self-review mode: only {provider_id}/{model} available")
        return provider_id, model, "self_review"
    except Exception as e:
        _logger.info(f"Model resolution failed ({e}), falling back to self-review")
        return provider_id, model, "self_review"


def _web_search(query: str, max_results: int = 5) -> str:
    """Superior to PPT-Agent agent-reach: always-on web search, zero dependencies.

    PPT-Agent's agent-reach probes for shell tools (curl/gh/yt-dlp/mcporter/xreach),
    degrades through 4 tiers, and risks partial results when tools are missing.
    Our implementation is always available — no probing, always the same quality.

    Uses DuckDuckGo Instant Answer API (free, no API key, no rate limits).
    """
    import urllib.parse
    try:
        import httpx
        url = "https://api.duckduckgo.com/"
        params = {"q": query, "format": "json", "no_html": "1", "skip_disambig": "1"}
        resp = httpx.get(url, params=params, timeout=10.0)
        resp.raise_for_status()
        data = resp.json()

        parts = []
        heading = data.get("Heading", "")
        if heading:
            parts.append(f"Subject: {heading}")
        if data.get("AbstractText"):
            parts.append(data["AbstractText"])
        abstract_url = data.get("AbstractURL", "")
        if abstract_url:
            parts.append(f"Reference: {abstract_url}")
        for r in data.get("RelatedTopics", [])[:max_results]:
            text = r.get("Text", "")
            if text and text not in parts:
                parts.append(text)

        return "\n\n---\n".join(parts) if parts else ""
    except Exception as e:
        _logger.info(f"Web search skipped ({e})")
        return ""
    """Equivalent to PPT-Agent agent-reach: search the web for context enrichment.

    Uses DuckDuckGo Instant Answer API (free, no API key needed).
    Returns concatenated search result text, or empty string on failure.
    """
    import urllib.parse
    try:
        import httpx
        url = "https://api.duckduckgo.com/"
        params = {"q": query, "format": "json", "no_html": "1", "skip_disambig": "1"}
        resp = httpx.get(url, params=params, timeout=10.0)
        resp.raise_for_status()
        data = resp.json()

        parts = []
        # Heading (topic disambiguation) — placed first for context
        heading = data.get("Heading", "")
        if heading:
            parts.append(f"主题: {heading}")
        # Abstract (main curated answer) — highest quality signal
        if data.get("AbstractText"):
            parts.append(data["AbstractText"])
        # Abstract URL (external reference for deeper reading)
        abstract_url = data.get("AbstractURL", "")
        if abstract_url:
            parts.append(f"参考来源: {abstract_url}")
        # Related topics — semantically related, broadens context
        for r in data.get("RelatedTopics", [])[:max_results]:
            text = r.get("Text", "")
            if text and text not in parts:
                parts.append(text)

        return "\n\n---\n".join(parts) if parts else ""
    except Exception as e:
        _logger.info(f"Web search skipped ({e})")
        return ""


def _phase2_research(provider_id: str, model: str, llm_generate, sop_content: str,
                     temperature: float = 0.3,
                     temp_keyword: float = 0, temp_research: float = 0) -> str:
    """Phase 2 (Research): Deep SOP content analysis — matches PPT-Agent research-core.

    PPT-Agent research-core uses agent-reach for web search, producing
    research-context.md with: Background, Key Insights, Common Angles,
    Suggested Focus Areas.

    Our equivalent: web search enriches the LLM's internal knowledge,
    then the LLM produces the same structured research context.
    """
    import re

    if not sop_content or not sop_content.strip():
        return ""

    # ── Extract search queries from SOP content ──
    # PPT-Agent: single topic search. Ours: extract 3-5 keywords for richer context.
    search_results = ""
    try:
        # Quick LLM call to extract keywords from SOP
        kw_system = (
            "从以下文档中提取 3-5 个最重要的搜索关键词（短语），用于网络搜索补充上下文。"
            "每行一个关键词，不要编号，不要其他文字。优先提取：核心概念、专有名词、行业术语、方法论名称。"
        )
        kw_user = sop_content[:2000]
        keywords = []
        try:
            kw_resp = _safe_run_async(llm_generate(provider_id, model,
                kw_system, kw_user, temperature=temp_keyword or temperature))
            keywords = [l.strip() for l in kw_resp.strip().split("\n") if l.strip()][:5]
            # Clean: remove numbering/bullet prefixes
            keywords = [k.lstrip("0123456789.-•*# ") for k in keywords if len(k) > 2]
        except Exception:
            pass

        # Fallback: extract from headings
        if not keywords:
            lines = [l.strip() for l in sop_content.split("\n") if l.strip()]
            heading_match = re.search(r'^#+\s*(.+)$', sop_content, re.MULTILINE)
            if heading_match:
                keywords = [heading_match.group(1).strip()]
            elif lines:
                keywords = [lines[0][:120]]

        # Parallel search all keywords, deduplicate results
        all_parts = []
        seen = set()
        for kw in keywords[:5]:
            _logger.info(f"Phase 2 web search: '{kw[:80]}'")
            result = _web_search(kw, max_results=3)
            if result:
                for part in result.split("\n\n---\n"):
                    key = part[:100]
                    if key not in seen:
                        seen.add(key)
                        all_parts.append(part)

        if all_parts:
            search_results = "\n\n---\n".join(all_parts)
            _logger.info(f"Phase 2 web search: {len(keywords)} keywords → {len(all_parts)} unique results, {len(search_results)} chars")
    except Exception as e:
        _logger.info(f"Phase 2 web search skipped (non-critical): {e}")

    research_system = (
        "你是专业的内容研究员。对提供的 SOP 文档进行深度结构化分析。"
        "\n\n你的任务不是总结内容，而是："
        "\n1. 识别文档的核心主题、领域背景和行业语境"
        "\n2. 提取关键概念、术语定义、数据指标、度量值"
        "\n3. 梳理内容的逻辑结构：主论点、分论点、支撑论据的层级关系"
        "\n4. 识别可转化为图表的数据点（数字、对比、趋势、比例）"
        "\n5. 标记最值得在演示文稿中强调的重点（差异化价值、反直觉发现、关键数据）"
        "\n\n按以下结构输出："
        "\n## 背景与领域语境"
        "\n## 核心发现与关键洞察"
        "\n## 内容逻辑结构（金字塔层级）"
        "\n## 可提取的数据点与量化指标"
        "\n## 建议的重点强调方向"
        "\n## 潜在图表机会"
    )

    search_block = ""
    if search_results:
        search_block = f"""## 网络搜索结果（补充上下文，非直接内容来源）
{search_results}

---

"""

    research_user = f"""{search_block}## SOP 文档（唯一分析对象）
{sop_content}

## 任务
深度分析上述 SOP 文档，输出结构化的研究上下文。这将用于后续的 PPT 大纲规划和内容提取。"""

    try:
        response = _safe_run_async(llm_generate(provider_id, model,
            research_system, research_user, temperature=temp_research or temperature))
        _logger.info(f"Phase 2 research: {len(response)} chars of analysis")
        return response
    except Exception as e:
        _logger.warning(f"Phase 2 research failed: {e}")
        return ""


def _generate_slides_staged(provider_id: str, model: str, rules: dict, sop_content: str,
                            system_prompt: str = "", skill_template: str = "",
                            temperature: float = 0.3,
                            st: dict = None) -> list | None:
    """Two-phase HTML slide generation pipeline.

    Phase 2 (Research): Deep SOP analysis → research context.
    Phase 4 (Outline): Extract & organize content → outline with body text.
    Phase 5a (Structure): AI plans slide types, layouts, card allocations — lightweight.
    Phase 5b (HTML): Per-slide parallel HTML generation with design-system.md as guide.

    AI generates complete inline-styled HTML. No JSON cards, no SVG code rendering."""
    from services.llm_service import generate as llm_generate
    if st is None:
        st = {}

    # ── Phase 2: Research (SOP deep analysis → research-context) ──
    research_context = ""
    try:
        research_context = _phase2_research(provider_id, model, llm_generate, sop_content,
                                            temp_keyword=st.get('keyword', temperature),
                                            temp_research=st.get('research', temperature))
        if research_context:
            _logger.info(f"Phase 2 research done: {len(research_context)} chars")
    except Exception as e:
        _logger.warning(f"Phase 2 research failed (proceeding without): {e}")

    # ── Phase 4: Content extraction (outline + body per slide) ──
    stage1 = _stage1_content(provider_id, model, llm_generate, rules, sop_content,
                             system_prompt, skill_template, research_context=research_context,
                             temp_outline=st.get('outline', temperature),
                             temp_fill=st.get('fill', temperature))
    if not stage1:
        return None
    _logger.info(f"Phase 4 outline: {len(stage1)} slides extracted")

    # ── Two-Phase HTML Pipeline ──
    style_id = rules.get("style_id", "business")

    # Phase 1: Structure planning (lightweight, one LLM call for all slides)
    structure = _stage2_structure(provider_id, model, llm_generate,
                                  stage1, style_id=style_id,
                                  temperature=st.get('cards', temperature))
    if not structure:
        return None
    _logger.info(f"Phase 1 structure: {len(structure)} slides planned")

    # Phase 2: Per-slide HTML generation (parallel, design-system.md guided)
    html_slides = _stage2_html_per_slide(provider_id, model, llm_generate,
                                         structure, style_id=style_id,
                                         temperature=st.get('html', temperature))
    if not html_slides:
        _logger.warning("Phase 2 HTML generation failed, using fallback")
        html_slides = _fallback_stage1_to_html_slides(stage1, style_id)

    _logger.info(f"Phase 2 HTML: {len(html_slides)} slides generated")
    return html_slides


def _generate_outline_only(provider_id, model, rules, sop_content,
                           system_prompt="", skill_template="",
                           temperature: float = 0.3,
                           st: dict = None) -> tuple:
    """Run only Phase 2 (Research) + Phase 4 (Outline+Content Fill).

    Returns (outline_json, outline_text) — outline_json is the structured
    JSON data, outline_text is natural-language text for human reading/editing.
    """
    from services.llm_service import generate as llm_generate
    if st is None:
        st = {}

    research_context = ""
    try:
        research_context = _phase2_research(provider_id, model, llm_generate, sop_content,
                                            temp_keyword=st.get('keyword', temperature),
                                            temp_research=st.get('research', temperature))
        if research_context:
            _logger.info(f"Outline-only research done: {len(research_context)} chars")
    except Exception as e:
        _logger.warning(f"Outline-only research failed (proceeding without): {e}")

    stage1 = _stage1_content(provider_id, model, llm_generate, rules, sop_content,
                              system_prompt, skill_template, research_context=research_context,
                              temp_outline=st.get('outline', temperature),
                              temp_fill=st.get('fill', temperature))
    if not stage1:
        return None, ""

    outline_text = _slides_to_human_text(stage1)
    return stage1, outline_text


def _slides_to_human_text(slides: list) -> str:
    """Convert structured slide outline into natural-language text.

    No field labels, no machine tokens — just readable paragraphs that
    anyone can understand and edit.
    """
    type_labels = {
        "cover": "封面", "toc": "目录", "section": "章节分隔", "chapter": "章节页",
        "content": "内容页", "data": "数据页", "data_hero": "数据突出",
        "technique": "技法页", "principle": "原则页", "process_flow": "流程图",
        "process_timeline": "流程时间线", "timeline": "时间线",
        "comparison": "对比页", "duo_compare": "双栏对比",
        "table": "表格页", "grid_cards": "卡片组", "image_grid": "图片网格",
        "quote": "引言页", "image_hero": "图片突出",
        "food_archive": "美食档案", "skill_card": "技能卡片",
        "troubleshoot": "问题排查",
        "appendix": "附录", "copyright": "版权页",
        "closing": "结尾页", "summary": "总结页",
    }

    parts = []
    for s in slides:
        seq = s.get("seq", len(parts) + 1)
        heading = s.get("heading", "")
        page_type = s.get("page_type", "content")
        type_cn = type_labels.get(page_type, page_type)
        lead = s.get("lead", "")
        body = s.get("body", "")
        key_points = s.get("key_points", [])
        notes = s.get("notes", "")
        kicker = s.get("kicker", "")

        block = f"第{seq}页 — {type_cn}"
        if kicker:
            block += f" · {kicker}"
        block += "\n"

        if heading:
            block += f"\n{heading}\n"
        if lead:
            block += f"\n{lead}\n"
        if body:
            block += f"\n{body}\n"
        if key_points:
            kp_text = " · ".join(str(kp) for kp in key_points if isinstance(kp, str) and kp.strip())
            if kp_text:
                block += f"\n关键要点：{kp_text}\n"
        if notes:
            block += f"\n（{notes}）\n"

        parts.append(block.strip())

    return "\n\n———\n\n".join(parts)


def _human_text_to_json(provider_id, model, human_text: str, original_json: list) -> list | None:
    """Use LLM to convert edited natural-language text back to structured JSON.

    Low temperature (0.1) ensures near-deterministic output. The LLM is
    instructed to preserve all content — no additions, deletions, or rewrites.
    Falls back to original_json on any failure.
    """
    from services.llm_service import generate as llm_generate

    if not provider_id or not model:
        _logger.warning("No LLM configured for human_text_to_json — returning original JSON")
        return original_json

    # Provide original JSON as schema reference so LLM knows the exact structure
    original_schema = json.dumps(original_json[:2], ensure_ascii=False, indent=2) if len(original_json) > 1 else json.dumps(original_json, ensure_ascii=False, indent=2)

    # Extract unique page_types from original JSON as the allowed set
    existing_types = set()
    if isinstance(original_json, list):
        for s in original_json:
            if isinstance(s, dict) and s.get("page_type"):
                existing_types.add(s["page_type"])
    type_list = ", ".join(sorted(existing_types)) if existing_types else "cover, toc, content, summary"

    system = f"""你是数据整理专家。你的唯一任务是将人类编辑的自然文本转回结构化 JSON。

严格规则：
1. 从原文中提取每一页的序号(seq)、类型(page_type)、标题(heading)、副标题(lead)、正文(body)、关键要点(key_points)、备注(notes)、章节标签(kicker)
2. page_type 只使用: {type_list}
3. 不新增任何内容，不删除任何内容，不改写原文
4. 原文中没提到的字段不要编造
5. key_points 是字符串数组
6. 输出纯 JSON 数组，不要用 markdown 包裹"""

    user = f"""## 原始 JSON 结构参考（字段名和类型以此为基准）
```json
{original_schema}
```

## 用户编辑后的文本（唯一内容来源）
{human_text}

## 任务
将上述文本的每一页转为 JSON，保持原始结构的所有字段名和类型。输出纯 JSON 数组。"""

    for attempt in range(2):
        try:
            response = _safe_run_async(llm_generate(provider_id, model, system, user, temperature=0.1))
            response = _clean_json_response(response)
            data = json.loads(response)
            if isinstance(data, list) and len(data) > 0:
                # Validate: every slide must have at least heading or body
                valid = [s for s in data if isinstance(s, dict) and (s.get("heading") or s.get("body"))]
                if len(valid) > 0:
                    _logger.info(f"Human text → JSON: {len(valid)} slides converted (attempt {attempt+1})")
                    return valid
            _logger.warning(f"Human text → JSON attempt {attempt+1}: invalid output structure")
        except Exception as e:
            _logger.warning(f"Human text → JSON attempt {attempt+1} failed: {e}")

    _logger.error("Human text → JSON: all attempts failed, returning original JSON as fallback")
    return original_json


def _stage1_content(provider_id, model, llm_generate, rules, sop_content,
                    system_prompt: str = "", skill_template: str = "",
                    research_context: str = "", temperature: float = 0.3,
                    temp_outline: float = 0, temp_fill: float = 0) -> list | None:
    """Stage 1: Two-phase — outline first, then fill content per slide in batches.

    research_context from Phase 2 (research-core) provides pre-analyzed SOP structure,
    key insights, data points, and suggested focus areas.
    """
    # Load outline-architect prompt (UI-configurable via column_configs rules, disk fallback)
    outline_spec = ""
    if rules.get("outline_architect_prompt"):
        outline_spec = rules["outline_architect_prompt"]
    if not outline_spec:
        outline_spec = _load_outline_spec()

    # Load cognitive design principles (referenced by outline-architect.md)
    cognitive_spec_stage1 = rules.get("cognitive_design_principles", "") if rules else ""
    if not cognitive_spec_stage1:
        cognitive_spec_stage1 = _load_cognitive_spec()

    base_system = system_prompt if system_prompt else (
        f"""{outline_spec}

    ## 认知设计原则（必须遵守）
    {cognitive_spec_stage1}

    重要补充：从提供的 SOP 文章中提取内容，严格按金字塔原理组织大纲。
    核心纪律：大纲中的每个「技法」/「步骤」/「章节」必须独占一页，绝不合并。
    即使 SOP 很短，封面页和总结页也不可省略。
    每页一主题，内容聚焦不堆砌。输出纯 JSON，不要用 markdown 包裹。"""
    )

    skill_block = ""
    if skill_template:
        skill_block = f"""## 幻灯片结构模板（必须严格遵循的页面结构和字段）
{skill_template}

"""

    # ── Research context block (from Phase 2) ──
    research_block = ""
    if research_context:
        research_block = f"""## 研究上下文（SOP 深度分析结果）
{research_context[:4000]}

---

"""

    # ── Phase 1: Generate outline (headings + page types + layout hints, lightweight) ──
    style_id = rules.get("style_id", "business")
    page_type_prompt = _build_page_type_prompt(style_id)
    outline_user = f"""{research_block}{skill_block}## SOP 文章（唯一内容来源）
{sop_content}

{page_type_prompt}

## 输出要求
- 严格遵循上方「幻灯片结构模板」的栏目章节结构和 JSON 格式
- 栏目结构、页面类型、硬约束均以模板为准，不得自行增删章节
- layout_hint 从以下选择: single_focus, two_column, two_column_asymmetric, three_column, hero_grid, mixed_grid, dashboard, timeline, horizontal_split, full_bleed
- visual_weight 从以下选择: low, medium, high
- 仅输出 JSON，不输出其他文字"""

    outline = None
    for attempt in range(2):
        try:
            response = _safe_run_async(llm_generate(provider_id, model,
                base_system, outline_user, temperature=temp_outline or temperature))
            response = _clean_json_response(response)
            data = json.loads(response)
            slides = data.get("slides", data) if isinstance(data, dict) else data
            if isinstance(slides, list) and len(slides) > 0:
                outline = slides
                break
        except Exception as e:
            _logger.warning(f"Stage 1 outline attempt {attempt+1} failed: {e}")

    if not outline:
        _logger.error("Stage 1 outline generation failed after retries")
        return None
    _logger.info(f"Stage 1 outline: {len(outline)} slides")

    # ── Phase 2: Fill content per slide in batches ──
    BATCH_SIZE = 4
    fill_system = (
        "你是内容编辑专家。根据 SOP 文章和金字塔原理为指定幻灯片填充正文内容。"
        "遵循结论先行、以上统下、归类分组(MECE)、逻辑递进四大原则。"
        "从 SOP 中提取归纳对应部分的内容，不编造。输出纯 JSON，不要用 markdown 包裹。"
    )

    for batch_start in range(0, len(outline), BATCH_SIZE):
        batch = outline[batch_start:batch_start + BATCH_SIZE]
        batch_json = json.dumps(batch, ensure_ascii=False, indent=2)

        fill_user = f"""## SOP 文章（唯一内容来源）
{sop_content}

## 需要填充的幻灯片（只输出这些幻灯片的 body 和 notes，不要更改其他字段）
{batch_json}

## 输出格式
```json
{{"slides": [{{"seq":1,"heading":"原样保留","body":"从此 SOP 提取归纳的正文（结论先行，先给核心论点再展开）","notes":"备注或反面后果(可选)","layout_hint":"原样保留","visual_weight":"原样保留","key_points":["原文保留"]}}, ...]}}
```
铁律：
- 只输出以上幻灯片，不增减
- heading, layout_hint, visual_weight, key_points 保持原样
- body 从此 SOP 对应部分提取归纳，每页至少 80 字，结论先行
- 仅输出 JSON"""

        for attempt in range(2):
            try:
                response = _safe_run_async(llm_generate(provider_id, model,
                    fill_system, fill_user, temperature=temp_fill or temperature))
                response = _clean_json_response(response)
                data = json.loads(response)
                filled = data.get("slides", data) if isinstance(data, dict) else data
                if isinstance(filled, list):
                    for f in filled:
                        seq = f.get("seq", 0)
                        idx = seq - 1
                        if 0 <= idx < len(outline):
                            outline[idx]["body"] = f.get("body", outline[idx].get("body", ""))
                            outline[idx]["notes"] = f.get("notes", outline[idx].get("notes", ""))
                            if f.get("layout_hint"):
                                outline[idx]["layout_hint"] = f["layout_hint"]
                            if f.get("visual_weight"):
                                outline[idx]["visual_weight"] = f["visual_weight"]
                break
            except Exception as e:
                if attempt == 1:
                    _logger.warning(f"Stage 1 fill batch {batch_start//BATCH_SIZE+1} failed: {e}")

    return outline


def _load_svg_prompt_specs() -> tuple[str, str]:
    """Load svg-generator.md and bento-grid-layout.md from data/prompts/."""
    prompts_dir = os.path.join(BASE_DIR, "data", "prompts")

    def _read(filename):
        p = os.path.join(prompts_dir, filename)
        if os.path.exists(p):
            with open(p, "r", encoding="utf-8") as f:
                return f.read()
        return ""

    return _read("svg-generator.md"), _read("bento-grid-layout.md")


def _load_outline_spec() -> str:
    """Load outline-architect.md from data/prompts/."""
    prompts_dir = os.path.join(BASE_DIR, "data", "prompts")
    outline_path = os.path.join(prompts_dir, "outline-architect.md")
    if os.path.exists(outline_path):
        with open(outline_path, "r", encoding="utf-8") as f:
            return f.read()
    return ""


def _load_style_yaml_text(style_id: str) -> str:
    """Load YAML structured data for a style.

    Priority: 1) {style_id}/tokens.yaml (directory structure),
    2) standalone {style_id}.yaml file in data/styles/.
    """
    import re
    styles_dir = os.path.join(BASE_DIR, "data", "styles")
    vi_dir = os.path.join(BASE_DIR, "data", "vi")

    # 1) Directory structure: data/vi/{style_id}/tokens.yaml
    tokens_path = os.path.join(vi_dir, style_id, "tokens.yaml")
    if os.path.exists(tokens_path):
        with open(tokens_path, "r", encoding="utf-8") as f:
            return f.read()

    # 2) Fall back to standalone YAML file
    p = os.path.join(styles_dir, f"{style_id}.yaml")
    if os.path.exists(p):
        with open(p, "r", encoding="utf-8") as f:
            return f.read()
    return ""


def _load_style_vi(style_id: str) -> str:
    """Load the Visual Identity System document from data/vi/{style_id}/vi.md."""
    vi_md_path = os.path.join(BASE_DIR, "data", "vi", style_id, "vi.md")
    if os.path.exists(vi_md_path):
        with open(vi_md_path, "r", encoding="utf-8") as f:
            return f.read()
    return ""


def _load_style_prompt(style_id: str) -> str:
    """Load the style-specific LLM persona + task prompt from data/vi/{style_id}/prompt.md."""
    prompt_path = os.path.join(BASE_DIR, "data", "vi", style_id, "prompt.md")
    if os.path.exists(prompt_path):
        with open(prompt_path, "r", encoding="utf-8") as f:
            return f.read()
    return ""


def _load_style_vi_section(style_id: str, section: str) -> str:
    """Load a specific VI sub-file from data/vi/{style_id}/.

    section: 'cover', 'content', 'data', or 'summary'.
    Loads both vi.md (general) and the section-specific file, concatenated.
    """
    vi_dir = os.path.join(BASE_DIR, "data", "vi", style_id)
    parts = []

    # Always include general vi.md first
    vi_md_path = os.path.join(vi_dir, "vi.md")
    if os.path.exists(vi_md_path):
        with open(vi_md_path, "r", encoding="utf-8") as f:
            parts.append(f.read())

    # Section-specific file — dynamic lookup
    if section != "toc":
        section_file = os.path.join(vi_dir, f"{section}.md")
        if os.path.exists(section_file):
            with open(section_file, "r", encoding="utf-8") as f:
                parts.append(f.read())

    if not parts:
        return _load_style_vi(style_id)

    return "\n\n---\n\n".join(parts)


# Canonical page type order — follows document writing conventions (cover → content → closing)
PAGE_TYPE_ORDER = [
    "cover",           # 1. 封面 — 开场页
    "toc",             # 2. 目录 — 内容导航
    "section",         # 3. 章节分隔 — 章节过渡
    "chapter",         # 4. 章节页 — 章节起始
    "content",         # 5. 内容页 — 通用内容展示
    "data",            # 6. 数据页 — 数据可视化
    "data_hero",       # 7. 数据突出 — 核心指标卡片
    "technique",       # 8. 技法页 — 方法步骤
    "principle",       # 9. 原则页 — 核心理念
    "process_flow",    # 10. 流程图 — 流程展示
    "process_timeline",# 11. 流程时间线 — 时序流程
    "timeline",        # 12. 时间线 — 时间轴
    "comparison",      # 13. 对比页 — 多项对比
    "duo_compare",     # 14. 双项对比 — 两项对比
    "table",           # 15. 表格页 — 数据表格
    "grid_cards",      # 16. 网格卡片 — 多卡片网格
    "image_grid",      # 17. 图片网格 — 图片展示
    "quote",           # 18. 引言页 — 引用/引言
    "image_hero",      # 19. 图片突出 — 大图+文字
    "food_archive",    # 20. 美食档案 — 菜品展示
    "skill_card",      # 21. 技能卡片 — 技能展示
    "troubleshoot",    # 22. 问题排查 — 排查指南
    "appendix",        # 23. 附录页 — 补充参考资料
    "copyright",       # 24. 版权页 — 版权信息
    "closing",         # 25. 结尾页 — 感谢/结束
    "summary",         # 26. 总结页 — 结尾收束
]

def _page_type_sort_key(ptype: str) -> int:
    try:
        return PAGE_TYPE_ORDER.index(ptype)
    except ValueError:
        return 99  # unknown types sort to end


def _scan_vi_page_types(style_id: str) -> list[dict]:
    """Read VI index.md to get the canonical page type list.

    Parses the "页面类型" markdown table from index.md.
    Only returns page types (excludes design principles and elements).
    """
    vi_dir = os.path.join(BASE_DIR, "data", "vi")
    index_path = os.path.join(vi_dir, style_id, "index.md")

    if not os.path.exists(index_path):
        return _fallback_page_types()

    try:
        with open(index_path, "r", encoding="utf-8") as f:
            content = f.read()
    except Exception:
        return _fallback_page_types()

    # Parse the "页面类型" markdown table
    types = []
    in_page_type_section = False
    for line in content.split("\n"):
        line = line.strip()
        if line.startswith("## 页面类型"):
            in_page_type_section = True
            continue
        if in_page_type_section and line.startswith("## "):
            break  # next section starts
        if not in_page_type_section or not line.startswith("|") or "---" in line or "类型名" in line:
            continue
        # Parse: | cover | 封面 | 开场页... | cover.md |
        cells = [c.strip() for c in line.split("|")[1:-1]]
        if len(cells) >= 3:
            types.append({
                "type": cells[0],
                "label": cells[1],
                "purpose": cells[2],
            })

    if not types:
        return _fallback_page_types()
    return types


def _fallback_page_types() -> list[dict]:
    """Minimal page type set when VI directory doesn't exist."""
    return [
        {"type": "cover", "label": "封面", "purpose": "开场页，全屏视觉冲击"},
        {"type": "toc", "label": "目录", "purpose": "内容导航与章节概览"},
        {"type": "content", "label": "内容页", "purpose": "通用内容展示"},
        {"type": "summary", "label": "总结页", "purpose": "结尾收束与核心要点回顾"},
    ]


def _build_page_type_prompt(style_id: str) -> str:
    """Generate the page_type selection prompt block from VI index.md."""
    types = _scan_vi_page_types(style_id)
    lines = [
        "## 可用页面类型（来源：VI 索引 index.md）",
        f"当前模板: {style_id}，共 {len(types)} 种页面类型：",
        "",
    ]
    for t in types:
        lines.append(f"- **{t['type']}**（{t['label']}）：{t['purpose']}")
    lines.extend([
        "",
        "## 设计规范来源",
        "所有设计规范均从 VI 索引文件（index.md）获取：",
        "- **页面类型详细规范**：读取对应的页面类型 .md 文件（如 cover.md、content.md 等）",
        "- **设计原则**（7项）：principles.md / consistency.md / richness.md / checklist.md / images.md / data_rules.md / decorations.md",
        "- **设计参数**（8项）：colors.md / typography.md / card_styles.md / charts.md / layouts.md / card_roles.md / chart_decision.md / icons.md",
        "",
        "## 规则",
        "1. 只使用上述 26 种类型，不要编造新类型。",
        "2. 为每页选择最匹配内容特征的 page_type。",
        "3. 需要某类型的详细布局规范时，读取该类型对应的 .md 文件。",
        "4. 需要设计参数（颜色/字号/圆角等）时，读取设计元素对应的 .md 文件。",
    ])
    return "\n".join(lines)

def _load_cognitive_spec() -> str:
    """Load cognitive-design-principles.md from data/prompts/."""
    p = os.path.join(BASE_DIR, "data", "prompts", "cognitive-design-principles.md")
    if os.path.exists(p):
        with open(p, "r", encoding="utf-8") as f:
            return f.read()
    return ""


def _load_reviewer_spec() -> str:
    """Load reviewer.md from data/prompts/."""
    p = os.path.join(BASE_DIR, "data", "prompts", "reviewer.md")
    if os.path.exists(p):
        with open(p, "r", encoding="utf-8") as f:
            return f.read()
    return ""


def _load_design_system() -> str:
    """Load design-system.md — the HTML slide design guide for LLM."""
    path = os.path.join(BASE_DIR, "data", "prompts", "design-system.md")
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    return ""


def _resolve_font_range(style_yaml_text: str) -> dict:
    """Extract font size thresholds from style YAML for the LLM prompt."""
    import yaml
    try:
        data = yaml.safe_load(style_yaml_text)
        typography = data.get("typography", {})
        return {
            "h1": typography.get("cover_title", {}).get("size", "58-65px"),
            "h2": typography.get("page_title", {}).get("size", "36-44px"),
            "h3": typography.get("card_title", {}).get("size", "22-24px"),
            "body": typography.get("body", {}).get("size", "16-18px"),
            "caption": typography.get("caption", {}).get("size", "12-14px"),
        }
    except Exception:
        return {}


def _validate_cards(slides: list) -> list[str]:
    """Structural validation of AI-generated card data.

    Checks: cards ≤5 per slide (Miller's Law), each card has role, layout valid,
    type present, card has title or body, cover ≤3 info units.
    Returns list of error strings. Empty list = all valid.
    """
    VALID_LAYOUTS = {
        "single_focus", "two_column", "two_column_asymmetric", "three_column",
        "hero_grid", "mixed_grid", "dashboard", "timeline", "horizontal_split", "full_bleed"
    }
    VALID_TYPES = {
        "cover", "toc", "section", "chapter",
        "content", "data", "data_hero",
        "technique", "principle", "process_flow", "process_timeline", "timeline",
        "comparison", "duo_compare", "table", "grid_cards", "image_grid",
        "quote", "image_hero", "food_archive", "skill_card",
        "troubleshoot", "appendix", "copyright",
        "closing", "summary",
    }
    issues = []
    for i, slide in enumerate(slides):
        if not isinstance(slide, dict):
            issues.append(f"Slide {i}: not a dict, got {type(slide).__name__}")
            continue
        sid = slide.get("seq", i + 1)
        stype = slide.get("type", "")
        layout = slide.get("layout", "")
        zones = slide.get("zones", {})

        if not stype:
            issues.append(f"Slide {sid}: missing 'type' field")
        elif stype not in VALID_TYPES:
            issues.append(f"Slide {sid}: unknown type '{stype}'")

        if layout and layout not in VALID_LAYOUTS:
            issues.append(f"Slide {sid}: invalid layout '{layout}'")

        if not isinstance(zones, dict):
            issues.append(f"Slide {sid}: 'zones' must be a dict")
            continue

        cards = zones.get("cards", [])
        if not isinstance(cards, list):
            issues.append(f"Slide {sid}: zones.cards must be a list")
            continue

        num_cards = len(cards)
        if num_cards == 0:
            heading = zones.get("heading", "") or zones.get("title", "") or zones.get("kicker", "")
            body = zones.get("body", "") or zones.get("lead", "") or zones.get("body_text", "")
            if not heading and not body:
                issues.append(f"Slide {sid}: no cards and no heading/body in zones")
        elif num_cards > 5:
            issues.append(f"Slide {sid}: {num_cards} cards exceeds Miller's Law limit (max 5)")

        for ci, card in enumerate(cards):
            if not isinstance(card, dict):
                issues.append(f"Slide {sid} card {ci}: not a dict")
                continue
            if "role" not in card:
                issues.append(f"Slide {sid} card {ci}: missing 'role'")
            has_content = card.get("title") or card.get("body") or card.get("chart")
            if not has_content:
                issues.append(f"Slide {sid} card {ci}: no title, body, or chart")

        if stype == "cover" and num_cards > 3:
            issues.append(f"Slide {sid}: cover has {num_cards} cards (max 3 info units)")

    return issues


def _stage2_cards(provider_id, model, llm_generate, rules, stage1_slides,
                   style_id: str = "business", temperature: float = 0.3) -> list | None:
    """Phase 5+6: AI selects Bento Grid layout + fills card content per slide.

    Input: stage1_slides [{seq, heading, page_type, layout_hint, body, ...}, ...]
    Output: [{type, layout, zones: {kicker, heading, lead, cards: [{role, title, body, chart}]}}, ...]

    Includes validation loop: generate → validate → if issues → fix (max 2 rounds).
    On generation failure, converts raw zones as fallback.
    """
    design_system = _load_design_system()
    style_yaml = _load_style_yaml_text(style_id)
    cognitive_spec = _load_cognitive_spec()

    spec_version = rules.get("spec_version", "2.2.1")

    # ── System prompt: AI as designer with strict structural rules ──
    cards_system = f"""你是一位演示文稿设计师。你必须严格按照设计系统为每页幻灯片生成结构化的卡片数据。

{design_system}

## 风格 Token（颜色/字体/阴影/圆角/渐变）
```yaml
{style_yaml}
```

## 认知设计原则
{cognitive_spec}

## 你的任务

根据大纲内容，为每页幻灯片做出设计决策：
1. **选择布局** — 根据内容语义从 10 种布局中选择（参考第十节决策树），封面必须用 full_bleed
2. **确定卡片** — 按布局→卡片映射表确定 role 和数量（参考第十一节卡片目录），每页 ≤5 张
3. **数据可视化** — 识别大纲中的数字并转化为 chart（参考第十二节 chart 决策树），有数字必有图表
4. **色彩分配** — 遵循色彩角色分工：accent=页面框架装饰，chart_colors=卡片色条轮换，primary=标题
5. **文案精炼** — 将大纲 body 文字转化为精炼的卡片 title（≤48字）+ body

## 硬性规则

- 封面页 layout=full_bleed，cards ≤3 个，禁止 hero 卡带 chart_colors 色块背景
- 每卡必有 role + (title 或 body 或 chart)
- 卡片色条颜色按 chart_colors[0]→[1]→[2]→[3]→[4] 轮换，禁止所有卡片同一颜色
- 数据页（含 %/数字/占比）→ 优先 dashboard 或 mixed_grid 布局
- 对比内容（优劣/A vs B）→ two_column 布局
- 流程/步骤 → timeline 布局

输出纯 JSON，不要用 markdown 包裹。"""

    # ── Batch generation with validation loop ──
    BATCH_SIZE = 3
    MAX_FIX_ROUNDS = 2
    result = []

    for batch_start in range(0, len(stage1_slides), BATCH_SIZE):
        batch = stage1_slides[batch_start:batch_start + BATCH_SIZE]
        batch_json = json.dumps(batch, ensure_ascii=False, indent=2)

        cards_user = f"""## 大纲（content-core 输出，每页已填充 body 正文）
{batch_json}

## 任务
为以上幻灯片选择布局并填充卡片内容。每页输出格式：
```json
{{"slides": [
  {{"seq": 1, "type": "cover", "layout": "full_bleed",
    "zones": {{"heading": "标题", "kicker": "标签", "lead": "副标题",
      "cards": [{{"role": "hero", "title": "主标题", "body": "正文内容"}}]
    }}
  }},
  {{"seq": 2, "type": "content", "layout": "hero_grid",
    "zones": {{"heading": "页标题", "kicker": "章节标签",
      "cards": [
        {{"role": "hero", "title": "核心观点", "body": "详细内容"}},
        {{"role": "metric", "title": "数据1", "chart": {{"type": "big_number", "value": 85, "label": "%"}}}}
      ]
    }}
  }}
]}}
```

铁律：
- 只输出此批次的幻灯片，按 seq 顺序
{_build_page_type_prompt(style_id)}
- layout 从以下选择: single_focus, two_column, two_column_asymmetric, three_column, hero_grid, mixed_grid, dashboard, timeline, horizontal_split, full_bleed
- 每卡必有 role (hero/metric/card_0/card_1/left/right/cell_0_0 等)
- 每卡必有 title 或 body 或 chart
- 封面页 layout=full_bleed，cards 最多 3 个
- 图表用 chart 字段: {{type: "big_number"|"donut"|"bar"|"progress_bar"|"timeline"|"sparkline", ...}}
- {spec_version} 规范：识别并转化数据为图表
- 仅输出 JSON"""

        generated = None
        fix_round = 0
        while fix_round <= MAX_FIX_ROUNDS and not generated:
            try:
                response = _safe_run_async(llm_generate(provider_id, model,
                    cards_system, cards_user, temperature=temperature))
                response = _clean_json_response(response)
                data = json.loads(response)
                slides = data.get("slides", data) if isinstance(data, dict) else data

                if not isinstance(slides, list) or len(slides) == 0:
                    raise ValueError("AI returned empty or non-list slides")

                # ── Validate ──
                errors = _validate_cards(slides)
                if errors:
                    err_text = "\n".join(f"- {e}" for e in errors)
                    _logger.warning(f"Batch {batch_start//BATCH_SIZE+1} round {fix_round}: {len(errors)} validation errors")

                    if fix_round < MAX_FIX_ROUNDS:
                        # Feed errors back into fix prompt
                        cards_user = f"""## 上一轮生成的验证错误（请逐一修复）
{err_text}

## 原始大纲（必须在修复后保留内容完整性）
{batch_json}

## 任务
修复上述验证错误后重新生成。每页输出格式不变。仅输出 JSON。"""
                        fix_round += 1
                        continue
                    else:
                        _logger.warning(f"Batch {batch_start//BATCH_SIZE+1}: max fix rounds reached, accepting with {len(errors)} errors")

                # ── Augment each slide with missing fields from stage1 outline ──
                for slide in slides:
                    if isinstance(slide, dict):
                        seq = slide.get("seq", 0)
                        s1 = next((s for s in batch if s.get("seq") == seq), None)
                        if s1:
                            zones = slide.setdefault("zones", {})
                            if not zones.get("heading") and s1.get("heading"):
                                zones["heading"] = s1["heading"]
                            if not slide.get("layout") and s1.get("layout_hint"):
                                slide["layout"] = s1["layout_hint"]
                            if not slide.get("type") and s1.get("page_type"):
                                slide["type"] = s1["page_type"]
                            if not zones.get("body") and not zones.get("cards") and s1.get("body"):
                                zones["body"] = s1["body"]
                            if not zones.get("kicker") and s1.get("kicker"):
                                zones["kicker"] = s1["kicker"]
                            if not zones.get("lead") and s1.get("lead"):
                                zones["lead"] = s1["lead"]

                generated = slides

            except Exception as e:
                err_msg = str(e)[:200]
                _logger.warning(f"Batch {batch_start//BATCH_SIZE+1} round {fix_round} failed: {err_msg}")
                if fix_round < MAX_FIX_ROUNDS:
                    cards_user = f"""## 上一轮生成失败: {err_msg}，请重试

## 原始大纲
{batch_json}

## 任务
重新为以上幻灯片选择布局并填充卡片内容。仅输出 JSON。"""
                    fix_round += 1
                else:
                    break

        if not generated:
            # ── Fallback: convert raw stage1 zones to card format ──
            _logger.warning(f"Batch {batch_start//BATCH_SIZE+1}: generation failed, using raw zone fallback")
            generated = _fallback_zones_to_cards(batch)

        result.extend(generated)

    return result if result else None


def _fallback_zones_to_cards(slides: list) -> list:
    """Convert raw stage1 outline slides to minimal card-structured format.

    Fallback when AI card generation fails — ensures basic structural validity
    so render_deck() can still produce output.
    """
    result = []
    for s in slides:
        if not isinstance(s, dict):
            continue
        seq = s.get("seq", 0)
        heading = s.get("heading", "")
        ptype = s.get("page_type", "content")
        layout = s.get("layout_hint", "hero_grid")
        body = s.get("body", "")
        notes = s.get("notes", "")
        kicker = s.get("kicker", "")
        key_points = s.get("key_points", [])

        body_text = body
        if key_points and not body_text:
            body_text = "\n".join(f"• {kp}" for kp in key_points if isinstance(kp, str))

        zones = {
            "heading": heading,
            "kicker": kicker,
            "body": body_text,
            "cards": [{
                "role": "hero",
                "title": heading,
                "body": body_text or notes,
                "kicker": kicker,
            }]
        }

        result.append({
            "seq": seq,
            "type": ptype,
            "layout": layout,
            "zones": zones,
        })

    return result


# ═══════════════════════════════════════════════════════════════════════════════
# Two-Phase HTML Pipeline (replaces old JSON card → SVG flow)
# Phase 1: Structure planning (lightweight, one call)
# Phase 2: Per-slide HTML generation (parallel, design-system.md guided)
# ═══════════════════════════════════════════════════════════════════════════════

def _fallback_stage1_structure(stage1_slides: list) -> list:
    """Build slide structure from stage1 outline deterministically — no LLM needed."""
    fallback_layouts = [
        "full_bleed", "three_column", "two_column", "hero_grid",
        "mixed_grid", "dashboard", "two_column_asymmetric", "full_bleed"
    ]
    result = []
    for s in stage1_slides:
        if not isinstance(s, dict):
            continue
        seq = s.get("seq", 0)
        layout_idx = (seq - 1) % len(fallback_layouts)
        ptype = s.get("page_type", "content")
        heading = s.get("heading", "")
        cards = [{"role": "hero", "content_hint": heading}]
        has_chart = any(kw in (heading + s.get("body", ""))
                       for kw in ["%", "数据", "指标", "占比", "率", "值", "量"])
        result.append({
            "seq": seq,
            "type": ptype,
            "layout": s.get("layout_hint") or fallback_layouts[layout_idx],
            "heading": heading,
            "body": s.get("body", ""),
            "key_points": s.get("key_points", []),
            "kicker": s.get("kicker", ""),
            "lead": s.get("lead", ""),
            "notes": s.get("notes", ""),
            "cards": cards,
            "has_chart": has_chart,
            "chart_hint": "big_number" if has_chart else "",
        })
    return result


def _stage2_structure(provider_id, model, llm_generate, stage1_slides,
                      style_id: str = "business", temperature: float = 0.3) -> list | None:
    """Phase 1 of two-phase HTML pipeline: Lightweight structure planning.

    One LLM call for ALL slides. AI decides: slide types, layouts, card count/roles,
    whether each slide needs a chart. Output is a structural blueprint that Phase 2
    uses to generate per-slide HTML.

    This is intentionally lightweight — no JSON card filling, just structure decisions.
    """
    design_system = _load_design_system()
    style_yaml = _load_style_yaml_text(style_id)
    style_vi = _load_style_vi(style_id)
    style_prompt = _load_style_prompt(style_id)

    if style_prompt:
        persona_block = style_prompt
    else:
        persona_block = "你是演示文稿结构规划师。你必须严格按照以下设计系统为每页幻灯片做出结构设计决策。"

    vi_block = ""
    if style_vi:
        vi_block = f"""

## 视觉识别系统 (VIS) — 本风格的权威视觉规范
{style_vi}
"""

    system = f"""{persona_block}

{design_system}

## 风格 Token
```yaml
{style_yaml}
```
{vi_block}
## 输出格式要求

为每页输出结构决策：
{_build_page_type_prompt(style_id)}
2. layout: 从第十节布局库中选择
3. cards: 每张卡指定 role 和 content_hint
4. has_chart: 有数字/百分比时 = true
5. chart_hint: big_number/donut/bar/progress_bar/timeline/sparkline

页面数量严格等于大纲给出的页数，不增不减。

输出纯 JSON，不要用 markdown 包裹。"""

    outline_json = json.dumps(stage1_slides, ensure_ascii=False, indent=2)
    user = f"""## 大纲（{len(stage1_slides)} 页）
{outline_json}

## 任务
为每页做出结构决策，输出格式：
```json
{{"slides": [
  {{"seq":1,"type":"cover","layout":"full_bleed","cards":[{{"role":"hero","content_hint":"主标题+副标题"}}],"has_chart":false,"chart_hint":""}},
  {{"seq":2,"type":"content","layout":"hero_grid","cards":[{{"role":"hero","content_hint":"核心观点"}},{{"role":"metric","content_hint":"关键指标"}}],"has_chart":true,"chart_hint":"big_number"}},
  ...
]}}
```

严格遵守设计系统中的所有规则。仅输出 JSON。"""

    for attempt in range(2):
        try:
            response = _safe_run_async(llm_generate(provider_id, model,
                system, user, temperature=temperature))
            response = _clean_json_response(response)
            data = json.loads(response)
            slides = data.get("slides", data) if isinstance(data, dict) else data
            if isinstance(slides, list) and len(slides) > 0:
                # Merge with stage1 content
                for s in slides:
                    seq = s.get("seq", 0)
                    s1 = next((x for x in stage1_slides if x.get("seq") == seq), None)
                    if s1:
                        s["heading"] = s1.get("heading", "")
                        s["body"] = s1.get("body", "")
                        s["key_points"] = s1.get("key_points", [])
                        s["kicker"] = s1.get("kicker", "")
                        s["lead"] = s1.get("lead", "")
                        s["notes"] = s1.get("notes", "")
                _logger.info(f"Stage 2 structure: {len(slides)} slides planned "
                           f"({sum(1 for s in slides if s.get('has_chart'))} with charts)")
                return slides
        except Exception as e:
            _logger.warning(f"Stage 2 structure attempt {attempt+1} failed: {e}")

    # Fallback: deterministic structure from stage1
    _logger.info("Stage 2 structure: using deterministic fallback")
    return _fallback_stage1_structure(stage1_slides)


def _fallback_single_slide_html(slide: dict, style_id: str) -> dict:
    """Generate minimal HTML for a single slide when AI generation fails."""
    seq = slide.get("seq", 0)
    stype = slide.get("type", "content")
    layout = slide.get("layout", "hero_grid")
    heading = slide.get("heading", "Untitled")
    body = slide.get("body", "")
    kicker = slide.get("kicker", "")
    lead = slide.get("lead", "")
    key_points = slide.get("key_points", [])

    body_html = ""
    if body:
        body_html = f'<p style="font-size:18px;line-height:1.7;color:#444;margin:0 0 16px">{body[:500]}</p>'
    if key_points:
        pts = "".join(f'<li style="font-size:16px;line-height:1.6;margin-bottom:6px">{kp}</li>'
                      for kp in key_points[:5] if isinstance(kp, str))
        body_html += f'<ul style="padding-left:20px;margin:0">{pts}</ul>'

    kicker_html = f'<div style="font-size:14px;color:#888;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px">{kicker}</div>' if kicker else ""
    lead_html = f'<div style="font-size:20px;color:#666;margin-bottom:24px">{lead}</div>' if lead else ""

    html = f"""<section style="width:1280px;height:720px;background:#fff;position:relative;overflow:hidden;font-family:system-ui,-apple-system,sans-serif">
<div style="position:absolute;top:0;left:0;right:0;height:4px;background:#2563eb"></div>
<div style="padding:60px 80px 40px">
{kicker_html}
<h1 style="font-size:38px;font-weight:700;color:#1e293b;margin:0 0 8px;letter-spacing:-0.3px">{heading}</h1>
<div style="width:40px;height:3px;background:#2563eb;border-radius:2px;margin-bottom:32px"></div>
{lead_html}
{body_html}
</div>
<div style="position:absolute;bottom:28px;right:48px;display:flex;align-items:center;gap:8px;font-size:13px;color:#94a3b8">
<span style="width:6px;height:6px;border-radius:50%;background:#2563eb"></span>
{seq}
</div>
</section>"""

    return {"seq": seq, "type": stype, "layout": layout, "html": html}


def _stage2_html_per_slide(provider_id, model, llm_generate, structure_slides,
                           style_id: str = "business", parallel: int = 3,
                           temperature: float = 0.3) -> list | None:
    """Phase 2 of two-phase HTML pipeline: Per-slide parallel HTML generation.

    Each slide gets its own LLM call with the full design-system.md as the design guide.
    Calls run in parallel (default 3 at a time) via ThreadPoolExecutor.

    LLM generates complete inline-styled HTML for a 1280x720 slide section.
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed
    import re

    design_system = _load_design_system()
    style_yaml = _load_style_yaml_text(style_id)
    font_range = _resolve_font_range(style_yaml)
    style_vi_base = _load_style_vi(style_id)         # general vi.md only
    style_prompt = _load_style_prompt(style_id)

    if not design_system:
        _logger.error("design-system.md not found — cannot generate HTML slides")
        return None

    font_info = ""
    if font_range:
        font_info = "\n".join(f"- {k}: {v}" for k, v in font_range.items())
        font_info = f"\n## 字号参考（从 style YAML 提取）\n{font_info}"

    if style_prompt:
        persona_block = style_prompt
    else:
        persona_block = "你是演示文稿设计艺术总监。你必须严格按照《幻灯片 HTML 设计系统 v2》为每一页生成完整的 HTML。"

    vi_block = ""
    if style_vi_base:
        vi_content = style_vi_base[:6000]
        vi_block = f"""

## 视觉识别系统 (VIS) — 通用规范（色彩、排版、卡片、图标 — 逐条逐一精确执行）
{vi_content}
"""

    system = f"""{persona_block}

## 设计系统（唯一权威来源，逐条遵守）

{design_system[:15000]}

## 风格 Token
```yaml
{style_yaml[:4000]}
```
{font_info}
{vi_block}
## 技术约束（非设计规则，仅限输出格式和工程限制）

- 尺寸: width:1280px; height:720px, position:relative, overflow:hidden
- 安全区: 所有内容必须在 (60,60) 到 (1220,660) 范围内，底部 60px 预留给页码标记
- 样式: 全部内联（inline style），禁止 class/id/<style>/@import/@font-face 标签
- 背景: 使用 style YAML 的 background 色铺满 viewport
- 字体: 使用 typography token 中的字体族
- 全部 CSS 属性必须带单位（px），不完整代码禁止输出
- 禁止输出 <!DOCTYPE html>、<html>、<head>、<body>、<title>、<meta>、<link> 标签
- 禁止输出页码元素（页码由管线统一注入）
- 你的输出只包含一个 div 容器（width:1280px;height:720px）及其所有子元素

## 间距硬约束（违反即错误）
- 数字下方的标签 margin-top ≥ 12px（禁止 4/6/8px）
- SVG 图标与下方内容 margin-bottom ≥ 20px
- 卡片内标题与正文间距 ≥ 12px
- 相邻独立元素间距 ≥ 16px
- line-height 禁止使用 1px 作为可见文字的行高；正文 1.6-1.8，标题 1.15-1.25，装饰大字 ≥ 0.15

## 画布密度硬约束（违反即设计失败）
- 内容区 (y:60-660, x:60-1220) 不得有连续 >80px 的空白区域
- 页面下方留白 → 必须添加图表 / 插图 / SVG 装饰填充
- 卡片区占画布 55-70%，不足 → 扩大卡片或添加装饰插图
- 不确定加什么时：有数据→图表，有流程→timeline，有对比→对照图，以上均不适用→SVG 主题插画

所有设计规则（色彩、排版、卡片、装饰、图表、图层结构、封面规则、字号下限）均已在《设计系统》中定义，此处不重复。严格遵守设计系统即可。

输出一个 HTML 代码块，用 ```html ... ``` 包裹。仅输出 HTML。"""

    total = len(structure_slides)

    def _gen_one(slide, idx):
        seq = slide.get("seq", idx + 1)
        stype = slide.get("type", "content")
        layout = slide.get("layout", "hero_grid")
        heading = slide.get("heading", "")
        body = slide.get("body", "")
        key_points = slide.get("key_points", [])
        kicker = slide.get("kicker", "")
        lead = slide.get("lead", "")
        cards = slide.get("cards", [])
        has_chart = slide.get("has_chart", False)
        chart_hint = slide.get("chart_hint", "")
        notes = slide.get("notes", "")

        content_parts = [
            f"页码: {seq}/{total}",
            f"类型: {stype}",
            f"布局: {layout}",
            f"标题: {heading}",
        ]
        if kicker:
            content_parts.append(f"章节标签: {kicker}")
        if lead:
            content_parts.append(f"副标题: {lead}")
        if body:
            content_parts.append(f"正文内容: {body[:1000]}")
        if key_points:
            content_parts.append(f"关键点: {'; '.join(str(kp) for kp in key_points[:5])}")
        if cards:
            cards_desc = "; ".join(
                f"[{c.get('role','card')}] {c.get('content_hint','')}" for c in cards)
            content_parts.append(f"卡片分配: {cards_desc}")
        if notes:
            content_parts.append(f"备注: {notes[:300]}")
        if has_chart:
            content_parts.append(
                f"需要数据图表: {chart_hint or '根据内容中的数据选择合适的图表类型(big_number/donut/bar/progress_bar)'}")

        # Append slide-type-specific VI section
        vi_section = _load_style_vi_section(style_id, stype)
        if vi_section:
            content_parts.append(f"\n## 当前幻灯片类型 ({stype}) 专属视觉规范（叠加通用规范之上，逐条执行）\n{vi_section[:4000]}")

        user = "\n".join(content_parts)

        for attempt in range(2):
            try:
                response = _safe_run_async(llm_generate(provider_id, model,
                    system, user, temperature=temperature))
                # Extract HTML
                m = re.search(r'```html\s*\n(.*?)\n```', response, re.DOTALL)
                if m:
                    html = m.group(1).strip()
                else:
                    m = re.search(r'(<section[\s\S]*?</section>)', response, re.IGNORECASE)
                    if m:
                        html = m.group(1).strip()
                    else:
                        html = response.strip()
                        if html.startswith("```"):
                            html = re.sub(r'^```\w*\n?', '', html)
                            html = re.sub(r'\n?```$', '', html)

                if html and len(html) > 300:
                    # Post-process: fix common LLM HTML errors
                    html = _fix_llm_html_errors(html)
                    # Check for truncation: HTML must end with a properly closed tag
                    stripped = html.rstrip()
                    if not stripped.endswith('>'):
                        _logger.warning(f"Slide {seq} attempt {attempt+1}: "
                                        f"truncated (ends with '{stripped[-50:]}')")
                        continue  # retry
                    _logger.info(f"Slide {seq}: HTML {len(html)} chars")
                    return {"seq": seq, "type": stype, "layout": layout, "html": html}
                else:
                    _logger.warning(f"Slide {seq} attempt {attempt+1}: HTML too short ({len(html)} chars)")
            except Exception as e:
                _logger.warning(f"Slide {seq} HTML attempt {attempt+1} failed: {e}")

        _logger.warning(f"Slide {seq}: all attempts failed, using fallback")
        return _fallback_single_slide_html(slide, style_id)

    _logger.info(f"Stage 2 HTML: dispatching {total} slides in parallel (workers={parallel})")
    t0 = __import__("time").time()

    result = []
    with ThreadPoolExecutor(max_workers=parallel) as ex:
        futures = {ex.submit(_gen_one, s, i): i for i, s in enumerate(structure_slides)}
        for f in as_completed(futures):
            try:
                r = f.result()
                if r:
                    result.append(r)
            except Exception as e:
                _logger.error(f"Slide HTML generation crashed: {e}")

    elapsed = __import__("time").time() - t0
    result.sort(key=lambda s: s.get("seq", 0))
    _logger.info(f"Stage 2 HTML: {len(result)}/{total} slides generated in {elapsed:.1f}s")
    return result if result else None


def _fallback_stage1_to_html_slides(stage1_slides: list, style_id: str = "business") -> list:
    """Convert stage1 outline directly to HTML slides — fallback when AI HTML fails."""
    structure = _fallback_stage1_structure(stage1_slides)
    result = []
    for s in structure:
        result.append(_fallback_single_slide_html(s, style_id))
    return result


def _fix_llm_html_errors(html: str) -> str:
    """Fix common LLM HTML generation mistakes.

    1. Missing px units on CSS position/size properties (e.g., top:28 → top:28px)
    2. <!DOCTYPE html> or <html>/<head>/<body> tags inside slide content
    3. Truncated content ending mid-tag
    """
    import re

    # ── 1. Add missing px units ──
    # CSS properties that require length units for non-zero values.
    # Careful: don't add px to z-index, opacity, font-weight, flex, order, etc.
    dim_props = r'(?:top|right|bottom|left|width|height|min-width|max-width|min-height|max-height|margin|margin-top|margin-right|margin-bottom|margin-left|padding|padding-top|padding-right|padding-bottom|padding-left|font-size|border-radius|gap|row-gap|column-gap|letter-spacing|border-width|outline-width|text-indent|word-spacing)'
    # Match: prop: NUMBER (not followed by a unit or another digit)
    html = re.sub(
        rf'({dim_props})\s*:\s*(\d+)\s*(?=[;!"\'>\s])',
        r'\1: \2px',
        html
    )

    # ── 2. Strip DOCTYPE and outer HTML structure if LLM generated a full page ──
    html = re.sub(r'<!DOCTYPE\s+html[^>]*>', '', html, flags=re.IGNORECASE)
    html = re.sub(r'</?html[^>]*>', '', html, flags=re.IGNORECASE)
    html = re.sub(r'</?head[^>]*>', '', html, flags=re.IGNORECASE)
    html = re.sub(r'</?body[^>]*>', '', html, flags=re.IGNORECASE)
    # Remove <title>, <meta>, <link> tags the LLM might generate
    html = re.sub(r'<title[^>]*>.*?</title>', '', html, flags=re.IGNORECASE | re.DOTALL)
    html = re.sub(r'<meta[^>]*>', '', html, flags=re.IGNORECASE)
    html = re.sub(r'<link[^>]*>', '', html, flags=re.IGNORECASE)

    # ── 3. Fix truncated ending (content ending mid-tag) ──
    # If the HTML ends with an unclosed tag or mid-attribute, remove the fragment
    last_gt = html.rfind('>')
    last_lt = html.rfind('<')
    if last_lt > last_gt:
        # Content ends inside a tag — truncate to last complete tag
        html = html[:last_gt + 1]

    # ── 4. Detect truncated style attributes (e.g., style="font-size</div>) ──
    # The last style=" in the HTML should have a closing " before the next >
    last_style = html.rfind('style="')
    if last_style > 0:
        after = html[last_style + 7:]
        close_quote = after.find('"')
        next_gt = after.find('>')
        # If the quote never closes, or > comes before ", the style is broken
        if close_quote < 0:
            html = html[:last_style]
        elif next_gt > 0 and next_gt < close_quote:
            # "font-size</div> — style ends without value or closing quote
            html = html[:last_style]

    # ── 5. Fix accent bar border-radius mismatch ──
    # A 4px-wide left-edge strip with its own border-radius can never
    # geometrically match the parent card's corner curves.
    html = re.sub(
        r'border-radius:\s*\d+px\s+0\s+0\s+\d+px\s*;?',
        '',
        html
    )
    # Fix card containers: position:relative is required so absolute-positioned
    # accent bars inside the card use the card as their containing block.
    # overflow:hidden clips them to the card's rounded corners.
    def _fix_card_container(m):
        tag = m.group(0)
        if 'position:' not in tag:
            tag = tag.replace(
                'background:#1e293b;',
                'position:relative;background:#1e293b;'
            )
        if 'overflow:' not in tag:
            tag = tag.replace('border-radius:', 'overflow:hidden;border-radius:')
        return tag
    html = re.sub(
        r'<div[^>]*background:\s*#1e293b[^>]*border-radius:\s*\d+px[^>]*>',
        _fix_card_container,
        html
    )

    # ── 6. Enforce minimum font-size 14px ──
    def _bump_font_size(m):
        sz = int(m.group(1))
        if sz < 14:
            return f'font-size:14px'
        return m.group(0)
    html = re.sub(r'font-size:(\d+)px', _bump_font_size, html)

    # ── 7. Fix dangerous line-height: 1px on visible elements ──
    # AI sometimes generates line-height:1px on decorative text, causing overlap.
    # Replace with a safe minimum. Only fix when the same element has visible font-size.
    def _fix_line_height(m):
        tag = m.group(0)
        # Check if the same style attr has a font-size that's visible (>20px)
        fs_match = re.search(r'font-size:\s*(\d+)px', tag)
        if fs_match and int(fs_match.group(1)) > 20:
            # Large decorative text: line-height:1 is safe (prevents overlap)
            return re.sub(r'line-height:\s*1px', 'line-height:1', tag)
        else:
            # Small text or unknown: use safe 1.2
            return re.sub(r'line-height:\s*1px', 'line-height:1.2', tag)
    html = re.sub(
        r'<[^>]*line-height:\s*1px[^>]*>',
        _fix_line_height,
        html
    )

    # ── 8. Enforce minimum margin-top: 4px and 6px are always too small at 1280x720 ──
    html = re.sub(r'margin-top:\s*4px', 'margin-top:12px', html)
    html = re.sub(r'margin-top:\s*6px', 'margin-top:12px', html)

    # ── 9. Fix SVG icon margin-bottom too small ──
    # Icons before numbers need ≥20px gap
    def _fix_icon_margin(m):
        tag = m.group(0)
        mb_match = re.search(r'margin-bottom:\s*(\d+)px', tag)
        if mb_match and int(mb_match.group(1)) < 20:
            tag = tag.replace(mb_match.group(0), 'margin-bottom:20px')
        return tag
    html = re.sub(
        r'<svg[^>]*margin-bottom:\s*\d+px[^>]*>',
        _fix_icon_margin,
        html
    )

    return html


def _assemble_html_deck(slides: list, title: str = "Presentation",
                        style_id: str = "business") -> str:
    """Wrap individual slide HTML sections into a complete HTML document.

    Also injects unified page numbers and strips AI-generated ones.
    """
    import re

    valid_slides = [s for s in slides if s.get("html")]
    total = len(valid_slides)

    wrapped_parts = []
    for i, s in enumerate(slides):
        html = s.get("html", "")
        if not html:
            continue
        slide_num = i + 1

        # Strip AI-generated page number divs (position:absolute + bottom: + right: + XX/YY)
        html = re.sub(
            r'<div[^>]*position:\s*absolute[^>]*bottom:\s*\d+px[^>]*right:\s*\d+px[^>]*>.*?\d{1,2}\s*/\s*\d{1,2}.*?</div>',
            '', html, flags=re.DOTALL
        )

        # Inject unified page number (skip cover slide)
        if slide_num > 1:
            pn_tag = (
                f'<div style="position:absolute;bottom:16px;right:48px;'
                f'background:#0f172a;padding:5px 14px;'
                f'border-radius:16px;z-index:50;box-shadow:0 0 0 2px rgba(15,23,42,0.6);">'
                f'<span style="font-size:14px;color:#94a3b8;font-weight:500;letter-spacing:0.3px;">'
                f'{slide_num:02d} / {total:02d}</span>'
                f'</div>'
            )
            # Insert before the outermost closing tag (prefer </section>)
            last_section = html.rfind('</section>')
            if last_section > 0:
                html = html[:last_section] + pn_tag + '\n' + html[last_section:]
            else:
                # Trace depth from first <div to find TRUE outermost </div>
                first_open = html.find('<div')
                if first_open >= 0:
                    depth = 0
                    pos = first_open
                    outer_close = -1
                    while pos < len(html):
                        no = html.find('<div', pos)
                        nc = html.find('</div>', pos)
                        if nc == -1:
                            break
                        if no != -1 and no < nc:
                            depth += 1
                            pos = no + 4
                        else:
                            depth -= 1
                            if depth == 0:
                                outer_close = nc
                                break
                            pos = nc + 6
                    if outer_close > 0:
                        html = html[:outer_close] + pn_tag + '\n' + html[outer_close:]
                    else:
                        # Outer <div> not properly closed — close it, insert before
                        html = html.rstrip() + '\n' + pn_tag + '\n</div>'
                else:
                    html = html + '\n' + pn_tag

        wrapped_parts.append(f'<div class="slide-wrapper">{html}</div>')

    wrapped = "\n".join(wrapped_parts)

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{
    background: #0f172a;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 24px;
    padding: 24px;
    font-family: system-ui, -apple-system, sans-serif;
  }}
  .slide-wrapper {{
    width: 1280px;
    height: 720px;
    overflow: hidden;
    border-radius: 4px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.5);
    flex-shrink: 0;
  }}
</style>
</head>
<body>
{wrapped}
</body>
</html>"""


def _extract_svg(response: str) -> str | None:
    """Extract SVG XML from AI response — handles markdown-wrapped and raw SVG."""
    import re

    # Try ```svg ... ``` first
    m = re.search(r'```svg\s*\n(.*?)\n```', response, re.DOTALL | re.IGNORECASE)
    if m:
        return m.group(1).strip()

    # Try ```xml ... ```
    m = re.search(r'```xml\s*\n(.*?)\n```', response, re.DOTALL | re.IGNORECASE)
    if m:
        return m.group(1).strip()

    # Try <svg ... </svg> directly
    m = re.search(r'(<svg[\s\S]*?</svg>)', response, re.IGNORECASE)
    if m:
        return m.group(1).strip()

    return None


def _check_svg(svg: str, idx: int) -> list[str]:
    """Validate AI-generated SVG: XML well-formedness, viewBox, font sizes.

    Returns list of error strings. Empty list = all valid.
    """
    import re
    import xml.etree.ElementTree as ET

    issues = []

    if not re.search(r'<svg[\s>]', svg, re.IGNORECASE):
        issues.append(f"Slide {idx}: no <svg> tag found")
        return issues

    m = re.search(r'viewBox\s*=\s*["\']([^"\']+)["\']', svg)
    if m:
        vb = m.group(1)
        parts = vb.split()
        if len(parts) == 4:
            try:
                w, h = float(parts[2]), float(parts[3])
                if abs(w - 1280) > 2 or abs(h - 720) > 2:
                    issues.append(f"Slide {idx}: viewBox {w}x{h}, expected 1280x720")
            except ValueError:
                issues.append(f"Slide {idx}: unparseable viewBox '{vb}'")
    else:
        issues.append(f"Slide {idx}: missing viewBox")

    if svg.count('<svg') != svg.count('</svg>'):
        issues.append(f"Slide {idx}: mismatched <svg>/</svg> tags")

    try:
        ET.fromstring(svg)
    except ET.ParseError as e:
        issues.append(f"Slide {idx}: XML parse error: {str(e)[:100]}")

    font_sizes = re.findall(r'font-size\s*=\s*["\'](\d+(?:\.\d+)?)\s*(?:px)?["\']', svg)
    small_fonts = [float(s) for s in font_sizes if float(s) < 10]
    if small_fonts:
        issues.append(f"Slide {idx}: font sizes below 10px: {small_fonts}")
    tiny_fonts = [float(s) for s in font_sizes if float(s) < 12]
    if tiny_fonts:
        issues.append(f"Slide {idx}: font sizes below 12px (WARN): {tiny_fonts[:5]}")

    # Safe-area boundary check (PPT-Agent slide-core validation #4)
    # Check for content placed outside safe area. Exclude:
    # - x=0,y=0 (background rect), x=60 (safe left edge), y=40-60 (header zone)
    # - y=690-710 (footer zone with page numbers/branding)
    safe_violations = []
    x_vals = re.findall(r'(?:x|translate)\s*\(\s*(-?\d+(?:\.\d+)?)\s*[,\)]', svg)
    y_vals = re.findall(r'(?:y|translate)\s*\(\s*\d+\s*,\s*(-?\d+(?:\.\d+)?)\s*\)', svg)
    direct_x = re.findall(r'\sx\s*=\s*["\'](-?\d+(?:\.\d+)?)\s*(?:px)?["\']', svg)
    direct_y = re.findall(r'\sy\s*=\s*["\'](-?\d+(?:\.\d+)?)\s*(?:px)?["\']', svg)
    # Exclude x=0 (background rect), x=60 (safe left margin)
    all_x_low = [float(v) for v in x_vals + direct_x if float(v) < 40]
    # Exclude y=0 (background), y >= 28 (header zone)
    all_y_low = [float(v) for v in y_vals + direct_y if float(v) < 28]
    # Exclude y >= 685 but < 715 (footer zone is expected)
    all_y_high = [float(v) for v in y_vals + direct_y if float(v) > 710]
    if all_x_low:
        safe_violations.append(f"x < 40: {all_x_low[:3]}")
    if all_y_low:
        safe_violations.append(f"y < 28: {all_y_low[:3]}")
    if all_y_high:
        safe_violations.append(f"y > 710: {all_y_high[:3]}")
    if safe_violations:
        issues.append(f"Slide {idx}: safe-area boundary issues: {'; '.join(safe_violations)}")

    return issues


def _stage3_svg(provider_id, model, llm_generate, slide_data,
                 style_id: str = "business", rules: dict = None,
                 batch_size: int = 2, temperature: float = 0.3,
                 st: dict = None) -> list | None:
    """Phase 6 (AI-SVG): AI generates complete SVG XML per slide — PPT-Agent quality.

    Unlike the code-rendered path (AI→JSON→Code→SVG), this has AI write SVG directly,
    giving it full creative control: decorative elements, custom layouts, gradients,
    accent borders, semi-transparent overlays, info cards, etc.

    Args:
        provider_id: LLM provider ID
        model: model name
        llm_generate: async generate function
        slide_data: [{type, layout, zones: {heading, kicker, lead, cards: [{role, title, body, chart}]}}]
        style_id: style YAML name
        rules: optional rules dict
        batch_size: slides per LLM call (1-2, lower = better quality)
        st: stage temperatures dict with keys: svg_batch, svg_single, review, fix, holistic, holistic_fix

    Returns:
        [{seq, file, svg_content, type, label}] or None on failure
    """
    import re
    if st is None:
        st = {}

    gt_batch = st.get('svg_batch', temperature)
    gt_single = st.get('svg_single', temperature)
    rt_review = st.get('review', temperature)
    rt_fix = st.get('fix', temperature)
    rt_holistic = st.get('holistic', temperature)
    rt_holistic_fix = st.get('holistic_fix', temperature)

    svg_spec, bento_spec = _load_svg_prompt_specs()
    cognitive_spec = _load_cognitive_spec()
    reviewer_spec = _load_reviewer_spec()
    style_yaml = _load_style_yaml_text(style_id)

    if not svg_spec:
        _logger.warning("svg-generator.md not found, AI-SVG generation disabled")
        return None
    if not style_yaml:
        _logger.warning(f"Style YAML '{style_id}' not found, AI-SVG generation disabled")
        return None

    svg_system = f"""{svg_spec}

{bento_spec}

## 认知设计原则
{cognitive_spec}

## 设计评审标准（用于自检）
{reviewer_spec}

## 风格 Token（颜色/字体/阴影/圆角/渐变/发光）
{style_yaml}

---
严格按照以上 Style YAML 中的 color_scheme、typography、card_style、decoration、gradients 和 elevation 规范生成 SVG。所有颜色和字体必须从 YAML 精确提取，不得使用样例替代。"""

    result = []
    total = len([s for s in slide_data if isinstance(s, dict)])

    for batch_start in range(0, len(slide_data), batch_size):
        batch = slide_data[batch_start:batch_start + batch_size]
        valid_batch = [s for s in batch if isinstance(s, dict)]
        if not valid_batch:
            continue

        slide_descriptions = []
        for slide in valid_batch:
            seq = slide.get("seq", 0)
            slide_type = slide.get("type", "content")
            zones = slide.get("zones", {})
            heading = zones.get("heading", "")
            kicker = zones.get("kicker", "")
            lead = zones.get("lead", "")
            cards = zones.get("cards", [])
            body = zones.get("body", "")

            desc = f"--- 幻灯片 {seq}/{total} ---\n"
            desc += f"页码: {seq:02d} / {total:02d}\n"
            desc += f"类型: {slide_type}\n"
            desc += f"标题: {heading}\n"
            if kicker:
                desc += f"章节标签: {kicker}\n"
            if lead:
                desc += f"副标题: {lead}\n"
            if body:
                desc += f"正文: {body[:600]}\n"

            if cards:
                desc += f"卡片 ({len(cards)} 张):\n"
                for ci, card in enumerate(cards):
                    role = card.get("role", "unknown")
                    ctitle = card.get("title", "")
                    cbody = card.get("body", "")
                    chart = card.get("chart")
                    desc += f"  [{role}] {ctitle}"
                    if cbody:
                        desc += f" — {cbody[:300]}"
                    if chart:
                        desc += f" [图表: {json.dumps(chart, ensure_ascii=False)}]"
                    desc += "\n"

            slide_descriptions.append(desc)

        all_descs = "\n".join(slide_descriptions)

        svg_user = f"""为以下 {len(valid_batch)} 页幻灯片生成完整的 SVG XML。

{all_descs}

## 输出要求
为每一页输出一个完整的 SVG，按顺序用 ```svg ... ``` 包裹。每个 SVG 之间用空行分隔。
仅输出 SVG 代码块，不输出其他文字。"""

        generated_for_batch = []

        for attempt in range(2):
            try:
                response = _safe_run_async(llm_generate(provider_id, model,
                    svg_system, svg_user, temperature=gt_batch))

                svg_matches = re.findall(r'```svg\s*\n(.*?)\n```', response, re.DOTALL | re.IGNORECASE)
                if not svg_matches:
                    svg_matches = re.findall(r'(<svg[\s\S]*?</svg>)', response, re.IGNORECASE)

                if svg_matches and len(svg_matches) >= len(valid_batch):
                    for j, slide in enumerate(valid_batch):
                        seq = slide.get("seq", 0)
                        svg_content = svg_matches[j].strip()
                        errors = _check_svg(svg_content, seq)
                        if errors:
                            _logger.warning(f"Slide {seq} SVG check ({len(errors)} issues): {'; '.join(errors[:3])}")

                        generated_for_batch.append({
                            "seq": seq,
                            "file": f"slide-{seq:02d}.svg",
                            "svg_content": svg_content,
                            "type": slide.get("type", "content"),
                            "label": slide.get("zones", {}).get("heading", f"Slide {seq}"),
                        })
                    break
                else:
                    found = len(svg_matches) if svg_matches else 0
                    _logger.warning(
                        f"Batch {batch_start//batch_size+1} attempt {attempt+1}: "
                        f"found {found} SVGs, need {len(valid_batch)}"
                    )
                    if attempt == 0 and found > 0:
                        svg_user = f"上一轮只输出了 {found}/{len(valid_batch)} 个 SVG。请为所有 {len(valid_batch)} 页重新生成。\n\n{all_descs}"

            except Exception as e:
                _logger.warning(f"Batch {batch_start//batch_size+1} attempt {attempt+1} failed: {e}")
                if attempt == 0:
                    svg_user = f"生成失败: {str(e)[:200]}。请重试。\n\n{all_descs}"

        if len(generated_for_batch) == len(valid_batch):
            result.extend(generated_for_batch)
            _logger.info(f"Batch {batch_start//batch_size+1}: {len(generated_for_batch)} SVGs generated")
        else:
            _logger.warning(
                f"Batch {batch_start//batch_size+1}: only {len(generated_for_batch)}/{len(valid_batch)} "
                f"SVGs — retrying individually"
            )
            result.extend(generated_for_batch)
            # Retry each missing slide individually
            for slide in valid_batch:
                seq = slide.get("seq", 0)
                already_got = any(g.get("seq") == seq for g in generated_for_batch)
                if already_got:
                    continue
                # Build single-slide prompt
                zones = slide.get("zones", {})
                heading = zones.get("heading", "")
                kicker = zones.get("kicker", "")
                lead = zones.get("lead", "")
                cards = zones.get("cards", [])
                body = zones.get("body", "")
                single_desc = f"页码: {seq:02d} / {total:02d}\n类型: {slide.get('type', 'content')}\n标题: {heading}\n"
                if kicker:
                    single_desc += f"章节标签: {kicker}\n"
                if lead:
                    single_desc += f"副标题: {lead}\n"
                if body:
                    single_desc += f"正文: {body[:600]}\n"
                if cards:
                    single_desc += f"卡片 ({len(cards)} 张):\n"
                    for ci, card in enumerate(cards):
                        single_desc += f"  [{card.get('role', 'unknown')}] {card.get('title', '')}"
                        if card.get('body'):
                            single_desc += f" — {card['body'][:300]}"
                        if card.get('chart'):
                            single_desc += f" [图表]"
                        single_desc += "\n"

                single_user = f"""为以下 1 页幻灯片生成完整的 SVG XML。

{single_desc}

输出一个完整的 SVG，用 ```svg ... ``` 包裹。仅输出 SVG 代码块。"""

                single_ok = False
                for sa in range(3):
                    try:
                        resp = _safe_run_async(llm_generate(provider_id, model,
                            svg_system, single_user, temperature=gt_single))
                        svg_content = _extract_svg(resp)
                        if svg_content and "<svg" in svg_content and "</svg>" in svg_content:
                            errors = _check_svg(svg_content, seq)
                            if errors:
                                _logger.warning(f"Slide {seq} individual retry {sa+1} SVG check ({len(errors)} issues)")
                            result.append({
                                "seq": seq,
                                "file": f"slide-{seq:02d}.svg",
                                "svg_content": svg_content,
                                "type": slide.get("type", "content"),
                                "label": heading or f"Slide {seq}",
                            })
                            _logger.info(f"Slide {seq}: individual retry {sa+1} SUCCESS")
                            single_ok = True
                            break
                        else:
                            _logger.warning(f"Slide {seq} individual retry {sa+1}: no valid SVG extracted")
                    except Exception as e:
                        _logger.warning(f"Slide {seq} individual retry {sa+1} failed: {e}")
                if not single_ok:
                    _logger.error(f"Slide {seq}: all individual retries exhausted — slide will be missing")

    if not result:
        return None

    review_pid, review_m, review_mode = provider_id, model, "self_review"
    if provider_id and model:
        review_pid, review_m, review_mode = _resolve_review_models(provider_id, model)

    # ── Phase 6b: Per-slide review loop (PPT-Agent review-core equivalent) ──
    if provider_id and model:
        result = _review_and_fix_slides(review_pid, review_m, llm_generate, result,
                                        style_yaml, style_id, svg_system,
                                        review_mode=review_mode,
                                        temp_review=rt_review, temp_fix=rt_fix)

    # ── Phase 6c: Holistic deck review (cross-slide consistency) ──
    if provider_id and model and result and len(result) >= 3:
        result = _holistic_review(review_pid, review_m, llm_generate, result,
                                  slide_data, style_yaml, style_id, svg_system,
                                  review_mode=review_mode,
                                  temp_holistic=rt_holistic,
                                  temp_holistic_fix=rt_holistic_fix)

    return result


def _review_and_fix_slides(provider_id, model, llm_generate, slides, style_yaml,
                           style_id, svg_system, max_rounds=2,
                           review_mode: str = "self_review",
                           temperature: float = 0.3,
                           temp_review: float = 0, temp_fix: float = 0):
    """PPT-Agent review-core equivalent: review each slide, fix if score < 7.

    Uses the same LLM (DeepSeek/Moonshot) with PPT-Agent's reviewer.md prompt.
    Returns updated slides list with fixes applied.
    """
    import re, json

    reviewer_spec = _load_reviewer_spec()
    if not reviewer_spec:
        _logger.info("Reviewer spec not available, skipping review loop")
        return slides

    # ── Self-critique injection for single-model review ──
    self_critique_block = ""
    if review_mode == "self_review":
        self_critique_block = (
            "\n\n## CRITICAL: Self-Review Mode\n"
            "You are reviewing SVGs generated by YOUR OWN model. This means you share\n"
            "the same blind spots. To compensate:\n"
            "1. Be EXTRA skeptical — assume every color, font size, and layout choice\n"
            "   might be wrong. Verify each against the Style YAML above.\n"
            "2. Check for patterns YOU tend to overuse (same layout, same accent placement,\n"
            "   same card structure across slides — variety is required).\n"
            "3. Look for MISSING elements: shadows you forgot, gradients you skipped,\n"
            "   decorative elements the style requires but you omitted.\n"
            "4. Reduce inflated scores: if your first instinct is 8+, re-examine and\n"
            "   look harder for issues. Self-review tends to overrate by 1-2 points.\n"
        )

    review_system = f"""{reviewer_spec}

## Style YAML (reference for this review)
```yaml
{style_yaml}
```
{self_critique_block}

You are reviewing slides for style "{style_id}". Score each SVG on all 5 criteria.
Output MUST include the Suggestions JSON block with typed, actionable suggestions.
If the slide passes all quality gates, output an empty Suggestions JSON array []."""

    for round_num in range(max_rounds):
        fixes_needed = False
        for i, slide in enumerate(slides):
            svg_content = slide.get("svg_content", "")
            if not svg_content:
                continue

            seq = slide.get("seq", i + 1)
            slide_type = slide.get("type", "content")

            review_user = f"""## Slide {seq}: {slide.get('label', 'Untitled')} (type: {slide_type})

```svg
{svg_content[:10000]}
```

Review this slide and provide your full Quality Gate scores + Suggestions JSON."""

            try:
                response = _safe_run_async(llm_generate(provider_id, model,
                    review_system, review_user, temperature=temp_review or temperature))
            except Exception as e:
                _logger.warning(f"Review round {round_num+1} slide {seq} failed: {e}")
                continue

            # Parse score from response
            score_match = re.search(r'overall_score\s*\|\s*(\d+)', response)
            score = int(score_match.group(1)) if score_match else 0
            pass_match = re.search(r'pass\s*\|\s*(true|false)', response)
            passed = pass_match.group(1) == "true" if pass_match else False

            # Parse Suggestions JSON
            fixes_json = []
            json_match = re.search(r'```json\s*\n(.*?)\n```', response, re.DOTALL)
            if json_match:
                try:
                    fixes_json = json.loads(json_match.group(1))
                except json.JSONDecodeError:
                    pass

            _logger.info(
                f"Slide {seq} review round {round_num+1}: "
                f"score={score}/10 pass={passed} suggestions={len(fixes_json)}"
            )

            if score >= 7 and passed:
                continue  # This slide passes

            fixes_needed = True

            # Determine fix strategy based on suggestion types
            suggestion_types = {s.get("type", "") for s in fixes_json}

            if "full_rethink" in suggestion_types:
                # Regenerate from scratch with guidance
                guidance = fixes_json[0].get("details", {}).get("guidance", "")
                fix_prompt = (
                    f"\n\n## 重新设计要求（审查反馈）\n"
                    f"上一版评分 {score}/10。请完全重新设计本页：\n{guidance}\n"
                    f"严格遵循上方所有 Style YAML 和 SVG 规范。"
                )
            elif "layout_restructure" in suggestion_types:
                # Regenerate with layout constraint
                constraint = fixes_json[0].get("details", {}).get("constraint", "")
                suggested = fixes_json[0].get("details", {}).get("suggested_layout", "")
                fix_prompt = (
                    f"\n\n## 布局调整要求（审查反馈）\n"
                    f"上一版评分 {score}/10。使用布局 {suggested}：{constraint}\n"
                )
            elif "content_reduction" in suggestion_types:
                target = fixes_json[0].get("details", {}).get("target_info_units", 4)
                what = fixes_json[0].get("details", {}).get("what_to_remove", "")
                fix_prompt = (
                    f"\n\n## 内容精简要求（审查反馈）\n"
                    f"上一版评分 {score}/10。目标信息单元 {target} 个。\n移除：{what}\n"
                )
            elif "attribute_change" in suggestion_types:
                # Patch specific attributes
                patches = "; ".join(
                    f"{s.get('details',{}).get('attribute','?')}: "
                    f"{s.get('details',{}).get('current','?')} → "
                    f"{s.get('details',{}).get('target','?')}"
                    for s in fixes_json if s.get("type") == "attribute_change"
                )
                fix_prompt = (
                    f"\n\n## 精确属性修正（审查反馈）\n"
                    f"上一版评分 {score}/10。请修正以下属性：{patches}\n"
                )
            else:
                fix_prompt = (
                    f"\n\n## 质量改进（审查反馈）\n"
                    f"上一版评分 {score}/10。请改进整体质量。\n"
                )

            # Regenerate with fix prompt
            single_desc = f"页码: {seq:02d}\n类型: {slide_type}\n标题: {slide.get('label', '')}\n"
            fix_user = f"""为以下 1 页幻灯片生成改进版 SVG。

{single_desc}
{fix_prompt}

输出一个完整的 SVG，用 ```svg ... ``` 包裹。仅输出 SVG 代码块。"""

            for fa in range(2):
                try:
                    resp = _safe_run_async(llm_generate(provider_id, model,
                        svg_system, fix_user, temperature=temp_fix or temperature))
                    new_svg = _extract_svg(resp)
                    if new_svg and "<svg" in new_svg and "</svg>" in new_svg:
                        slide["svg_content"] = new_svg
                        _logger.info(f"Slide {seq} fix round {round_num+1} applied ({len(new_svg)} bytes)")
                        break
                except Exception as e:
                    _logger.warning(f"Slide {seq} fix attempt {fa+1} failed: {e}")

        if not fixes_needed:
            _logger.info(f"Review round {round_num+1}: all slides pass quality gate")
            break

    return slides


def _holistic_review(provider_id, model, llm_generate, slides, slide_data,
                     style_yaml, style_id, svg_system,
                     review_mode: str = "self_review",
                     temperature: float = 0.3,
                     temp_holistic: float = 0, temp_holistic_fix: float = 0):
    """Phase 6c: Holistic deck review — cross-slide consistency evaluation.

    PPT-Agent review-core holistic mode (reviewer.md:286-331): reads ALL slide
    SVGs and evaluates 5-Dimension cross-slide consistency. Unlike the previous
    metadata-only approach, this sends structural fingerprints with actual
    color values, font sizes, shadow defs, and stripped SVG skeletons so the
    LLM can detect real inconsistencies across slides.
    """
    import re, json, yaml

    reviewer_spec = _load_reviewer_spec()
    if not reviewer_spec:
        _logger.info("Reviewer spec not available, skipping holistic review")
        return slides

    if len(slides) < 3:
        _logger.info("Deck too small (<3 slides), skipping holistic review")
        return slides

    # ── Build structural fingerprint + stripped SVG per slide ──
    fingerprint_parts = []

    for i, s in enumerate(slides):
        seq = s.get("seq", i + 1)
        svg = s.get("svg_content", "")
        stype = s.get("type", "content")
        label = s.get("label", f"Slide {seq}")

        # Extract structural attributes from SVG
        fills = sorted(set(re.findall(r'fill\s*=\s*"([^"]+)"', svg)))
        strokes = sorted(set(re.findall(r'stroke\s*=\s*"([^"]+)"', svg)))
        hex_colors = sorted(set(
            c for c in fills + strokes
            if re.match(r'^#[0-9a-fA-F]{3,8}$', c)
        ))
        font_sizes = sorted(set(re.findall(r'font-size\s*=\s*"(\d+(?:\.\d+)?)', svg)))
        font_families = sorted(set(re.findall(r'font-family\s*=\s*"([^"]+)"', svg)))
        rx_vals = sorted(set(re.findall(r'rx\s*=\s*"(\d+(?:\.\d+)?)"', svg)))
        shadow_ids = re.findall(r'<filter\s+id="([^"]*shadow[^"]*)"', svg)
        gradient_ids = re.findall(r'<linearGradient\s+id="([^"]+)"', svg)

        # Layout detection
        layout = s.get("layout", "")
        if not layout:
            if re.search(r'three.column|3.col', svg):
                layout = "three_column"
            elif re.search(r'two.column|2.col', svg):
                layout = "two_column"
            elif re.search(r'single.focus|full.bleed', svg):
                layout = "single_focus"
            elif re.search(r'hero.grid', svg):
                layout = "hero_grid"
            else:
                layout = "mixed"

        # Visual weight
        low_types = {"quote", "image", "image_hero", "section", "copyright", "appendix"}
        high_types = {"data_hero", "comparison", "duo_compare", "table"}
        weight = "low" if stype in low_types else ("high" if stype in high_types else "medium")

        # Stripped SVG: remove text content but keep structure
        # Strip <text>...</text> body content, keep all structural tags + defs
        stripped = re.sub(r'(<text[^>]*>).*?(</text>)', r'\1...\2', svg)
        # Keep only first 6000 chars of stripped SVG
        stripped = stripped[:6000]
        if len(svg) > 6000:
            stripped += "\n<!-- ... truncated ... -->"

        fp = (
            f"## Slide {seq:02d}: {label}\n"
            f"- Type: {stype} | Layout: {layout} | Weight: {weight}\n"
            f"- Colors in use: {', '.join(hex_colors[:20])}\n"
            f"- Font sizes: {', '.join(font_sizes[:15])}\n"
            f"- Font families: {', '.join(font_families[:5])}\n"
            f"- Border radii: {', '.join(rx_vals[:10])}\n"
            f"- Shadow filters: {', '.join(shadow_ids) if shadow_ids else 'none'}\n"
            f"- Gradients: {', '.join(gradient_ids) if gradient_ids else 'none'}\n"
            f"\n```svg\n{stripped}\n```\n"
        )
        fingerprint_parts.append(fp)

    all_fingerprints = "\n---\n".join(fingerprint_parts)

    # Summary table for quick overview
    summary_rows = []
    for i, s in enumerate(slides):
        seq = s.get("seq", i + 1)
        svg = s.get("svg_content", "")
        stype = s.get("type", "content")
        label = s.get("label", f"Slide {seq}")
        low_types = {"quote", "image", "image_hero", "section", "copyright", "appendix"}
        high_types = {"data_hero", "comparison", "duo_compare", "table"}
        weight = "low" if stype in low_types else ("high" if stype in high_types else "medium")
        layout = s.get("layout", "mixed")
        card_count = len(re.findall(r'<g[^>]*transform', svg))
        summary_rows.append(
            f"| {seq:02d} | {stype} | {layout} | {weight} | {card_count} | {label} |"
        )

    summary_table = "\n".join([
        "| # | Type | Layout | Weight | Cards | Title |",
        "|---|------|--------|--------|-------|-------|",
    ] + summary_rows)

    # Self-critique injection for single-model holistic review
    holistic_critique = ""
    if review_mode == "self_review":
        holistic_critique = (
            "\n\n## CRITICAL: Self-Review Mode\n"
            "You are reviewing a deck generated by YOUR OWN model. Cross-slide issues\n"
            "are YOUR blind spots — be extra vigilant:\n"
            "1. Compare STRUCTURAL ATTRIBUTES numerically: are all slide titles really\n"
            "   the same font-size? Check the fingerprint data, don't assume.\n"
            "2. SCAN for monotony: your model tends to repeat the same layout pattern.\n"
            "   Flag any 3+ consecutive slides with identical layout.\n"
            "3. COLOR DRIFT: check if hex colors are consistent across slides.\n"
            "   Your model often uses slightly different hex codes for 'the same' color.\n"
            "4. Reduce scores by 1 point: self-review systematically overrates by 1-2 points.\n"
        )

    holistic_system = f"""{reviewer_spec}

## Style YAML (reference tokens)
```yaml
{style_yaml}
```
{holistic_critique}

You are performing HOLISTIC DECK REVIEW for style "{style_id}". You have access to each slide's structural fingerprint (exact colors, font sizes, shadows, gradients) AND stripped SVG skeleton. Use these to detect REAL cross-slide inconsistencies, not guess from metadata."""

    holistic_user = f"""## Deck Summary: {len(slides)} slides

{summary_table}

## Per-Slide Structural Fingerprints + Stripped SVGs

{all_fingerprints}

## Task

Evaluate cross-slide consistency using the 5-Dimension Framework. Use the actual color values, font sizes, shadow defs, and border radii from the fingerprints above to detect inconsistencies — do not guess from metadata alone.

1. **Visual Rhythm** (25%): Do layouts alternate? 3+ consecutive same layout = trigger.
2. **Color Story** (20%): Compare hex_colors across slides. Accent on >60% of slides = trigger. Missing accent on climax slide = trigger.
3. **Narrative Arc** (20%): 3+ consecutive high-weight slides without low-weight breathing slide = trigger.
4. **Style Consistency** (20%): Compare font_sizes, font_families, rx_vals, shadow_ids across slides. >30% variance on any attribute = trigger.
5. **Pacing** (15%): 4+ consecutive content/data/comparison slides with no breathing slide = trigger.

Output:
- Holistic Scoring table (each dimension 0-10, weighted total)
- deck_coordination Suggestions JSON with affected_slides and concrete fix recommendations
- If coherence >= 7 AND no P1 issues, output empty JSON array []"""

    try:
        response = _safe_run_async(llm_generate(provider_id, model,
            holistic_system, holistic_user, temperature=temp_holistic or temperature))
    except Exception as e:
        _logger.warning(f"Holistic review failed: {e}")
        return slides

    # Parse coherence score
    coherence_match = re.search(r'Overall Coherence.*?\|\s*\**(\d+(?:\.\d+)?)\**', response)
    coherence = float(coherence_match.group(1)) if coherence_match else 0

    # Parse deck_coordination suggestions
    fixes_json = []
    json_match = re.search(r'```json\s*\n(.*?)\n```', response, re.DOTALL)
    if json_match:
        try:
            fixes_json = json.loads(json_match.group(1))
        except json.JSONDecodeError:
            pass

    _logger.info(
        f"Holistic review: coherence={coherence}/10, "
        f"{len(fixes_json)} deck_coordination suggestions"
    )

    if coherence >= 7 and not fixes_json:
        _logger.info("Holistic review: PASSED")
        return slides

    # ── Apply priority-1 deck_coordination fixes ──
    p1_fixes = [f for f in fixes_json if f.get("priority") == 1]
    if not p1_fixes:
        _logger.info(f"Holistic review: score={coherence}, no P1 fixes — advisory only")
        return slides

    _logger.info(f"Holistic review: applying {len(p1_fixes)} priority-1 fixes")
    for fix in p1_fixes:
        affected = fix.get("details", {}).get("affected_slides", [])
        suggestion = fix.get("details", {}).get("suggestion", fix.get("description", ""))
        issue_type = fix.get("details", {}).get("issue_type", "")

        for slide_idx in affected:
            if isinstance(slide_idx, int) and 1 <= slide_idx <= len(slides):
                slide = slides[slide_idx - 1]
            else:
                continue

            seq = slide.get("seq", slide_idx)
            fix_prompt = (
                f"\n\n## 整体协调修正（Holistic Review P1）\n"
                f"问题类型: {issue_type}\n修正说明: {suggestion}\n"
                f"严格遵循上方所有 Style YAML 和 SVG 规范。"
            )

            single_desc = f"页码: {seq:02d}\n类型: {slide.get('type', 'content')}\n标题: {slide.get('label', '')}\n"
            fix_user = f"""为以下 1 页幻灯片生成改进版 SVG。

{single_desc}
{fix_prompt}

输出一个完整的 SVG，用 ```svg ... ``` 包裹。仅输出 SVG 代码块。"""

            for fa in range(2):
                try:
                    resp = _safe_run_async(llm_generate(provider_id, model,
                        svg_system, fix_user, temperature=temp_holistic_fix or temperature))
                    new_svg = _extract_svg(resp)
                    if new_svg and "<svg" in new_svg and "</svg>" in new_svg:
                        slide["svg_content"] = new_svg
                        _logger.info(f"Holistic fix applied to slide {seq} ({len(new_svg)} bytes)")
                        break
                except Exception as e:
                    _logger.warning(f"Holistic fix slide {seq} attempt {fa+1} failed: {e}")

    return slides