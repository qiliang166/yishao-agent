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
                # Pump remaining callbacks before closing
                loop.call_soon(lambda: None)
                loop.run_until_complete(asyncio.sleep(0))
                loop.close()
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



def generate_ppt(content: str, template_id: str = None, branding: dict = None,
                 output_dir: str = None, provider_id: str = "",
                 model: str = "", slide_plan: list = None, format: str = "svg",
                 project_name: str = "", column_id: str = "") -> str:
    """Generate presentation from content. Default: SVG (PPT-Agent Bento Grid).

    When provider+model provided, uses AI staged generation.
    When format='pptx', falls back to legacy PPTX pipeline.
    Returns (output_path, slide_data) — output_path is HTML path for SVG, PPTX path for PPTX.
    """
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
                                                         col_prompt, col_skill)
                    print(f"[PPT-DBG] AI result: {bool(slide_data)}, "
                          f"slides={len(slide_data) if slide_data else 0}", flush=True)
                    if not slide_data:
                        print("[PPT-DBG] AI generation failed — no fallback, returning error", flush=True)
                else:
                    if not slide_data:
                        print("[PPT-DBG] No AI provider/model and no saved plan — cannot generate", flush=True)
        finally:
            db.close()

    # ── SVG path (default: try AI-SVG direct first, fall back to code-rendered) ──
    if format != "pptx" and slide_data and isinstance(slide_data, list) and len(slide_data) > 0:
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
                                                 rules=rules)
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
        return filepath, slide_data

    # No viable path
    return None, None


# ── Staged AI slide generation ──

def _web_search(query: str, max_results: int = 5) -> str:
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


def _phase2_research(provider_id: str, model: str, llm_generate, sop_content: str) -> str:
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
    search_results = ""
    try:
        lines = [l.strip() for l in sop_content.split("\n") if l.strip()]
        heading_match = re.search(r'^#+\s*(.+)$', sop_content, re.MULTILINE)
        if heading_match:
            topic = heading_match.group(1).strip()
        elif lines:
            topic = lines[0][:120]
        else:
            topic = ""
        if topic:
            _logger.info(f"Phase 2 web search: '{topic[:80]}'")
            search_results = _web_search(topic, max_results=5)
            if search_results:
                _logger.info(f"Phase 2 web search returned {len(search_results)} chars")
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
            research_system, research_user, temperature=0.7))
        _logger.info(f"Phase 2 research: {len(response)} chars of analysis")
        return response
    except Exception as e:
        _logger.warning(f"Phase 2 research failed: {e}")
        return ""


def _generate_slides_staged(provider_id: str, model: str, rules: dict, sop_content: str,
                            system_prompt: str = "", skill_template: str = "") -> list | None:
    """Pipeline matching PPT-Agent Phases 2-6:

    Phase 2 (Research): Deep SOP analysis → research context.
    Phase 4 (Outline): Extract & organize content → outline with body text.
    Phase 5+6 (Cards): AI selects layout + fills card content → structured data.
    Rendering: svg_designer.render_deck() mechanically renders SVG from card data.

    AI does NOT write SVG. Code renders SVG.
    """
    from services.llm_service import generate as llm_generate

    # ── Phase 2: Research (SOP deep analysis → research-context) ──
    research_context = ""
    try:
        research_context = _phase2_research(provider_id, model, llm_generate, sop_content)
        if research_context:
            _logger.info(f"Phase 2 research done: {len(research_context)} chars")
    except Exception as e:
        _logger.warning(f"Phase 2 research failed (proceeding without): {e}")

    # ── Phase 4: Content extraction (outline + body per slide) ──
    stage1 = _stage1_content(provider_id, model, llm_generate, rules, sop_content,
                             system_prompt, skill_template, research_context=research_context)
    if not stage1:
        return None
    _logger.info(f"Phase 4 outline: {len(stage1)} slides extracted")

    # ── Phase 5+6: Card content filling (AI selects layout + structures cards) ──
    style_id = rules.get("style_id", "business")
    stage2 = _stage2_cards(provider_id, model, llm_generate, rules,
                           stage1, style_id=style_id)
    if not stage2:
        return None
    _logger.info(f"Phase 5+6 cards: {len(stage2)} slides structured")

    return stage2


def _stage1_content(provider_id, model, llm_generate, rules, sop_content,
                    system_prompt: str = "", skill_template: str = "",
                    research_context: str = "") -> list | None:
    """Stage 1: Two-phase — outline first, then fill content per slide in batches.

    research_context from Phase 2 (research-core) provides pre-analyzed SOP structure,
    key insights, data points, and suggested focus areas.
    """
    content_spec = rules.get("content_spec", "")
    page_rhythm = rules.get("page_rhythm", {})

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

    rhythm_seq = " → ".join(page_rhythm.get("sequence", ["cover", "toc", "content*N", "summary"]))

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
    outline_user = f"""{research_block}{skill_block}## 内容大纲（强制结构，每个 ### 节点至少一页）
{content_spec if content_spec else '封面 + 目录 + 内容章节 + 总结'}

## 页面结构约束（铁律）
- 序列: {rhythm_seq}
- 封面 1 页 + 目录 1 页 + 总结 1 页 = 至少 3 页结构页，不可删减
- 大纲中每个 ### 技法节点 = 独立一页，多个技法 = 多页，禁止合并
- 只有内容极丰富的单个技法才可拆分为多页
- 每页只传达一个核心信息（4±1 个信息单元）
- 视觉节奏：避免连续 3 页以上高密度，高低交错

## SOP 文章（唯一内容来源）
{sop_content}

## 输出格式（仅输出大纲，每页包含 heading, page_type, layout_hint, visual_weight, key_points）
```json
{{"slides": [
  {{"seq":1,"heading":"页标题","page_type":"cover","layout_hint":"single_focus","visual_weight":"low","key_points":["要点1"]}},
  {{"seq":2,"heading":"目录","page_type":"toc","layout_hint":"three_column","visual_weight":"low","key_points":["章节概览"]}},
  ...
]}}
```
铁律：
- 大纲的每个 ### 节点至少对应一张幻灯片
- page_type 从以下选择: cover, toc, content, technique, principle, process_flow, comparison, duo_compare, table, grid_cards, troubleshoot, summary, copyright, appendix
- layout_hint 从以下选择: single_focus, two_column, two_column_asymmetric, three_column, hero_grid, mixed_grid, dashboard, timeline, horizontal_split, full_bleed
- visual_weight 从以下选择: low, medium, high
- key_points 为每页 3-5 个关键点
- 仅输出 JSON，不输出其他文字"""

    outline = None
    for attempt in range(2):
        try:
            response = _safe_run_async(llm_generate(provider_id, model,
                base_system, outline_user, temperature=1.0))
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
                    fill_system, fill_user, temperature=1.0))
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


def _build_guizang_field_spec(style_family: str) -> dict:
    """Return {type: {name, fields, description}} for each AI-visible slide type.

    Fields are extracted from the actual guizang layout HTML skeletons.
    This is the single source of truth for what the AI must fill.
    """
    if style_family == "swiss":
        return {
            "cover":       {"name":"封面","fields":["kicker","title","lead","author","date","section_label","page_num","footer_hint"]},
            "chapter":     {"name":"章节","fields":["kicker","heading","lead","section_label","page_num"]},
            "data_hero":   {"name":"数据大字报","fields":["kicker","heading","lead","stats","section_label","page_num"],
                            "stats_fields": ["label","value","unit","note"]},
            "toc":         {"name":"六格目录","fields":["kicker","heading","cells","section_label","page_num"],
                            "cells_fields": ["icon","num","title","desc"]},
            "content":     {"name":"三子卡","fields":["kicker","heading","cards","section_label","page_num"],
                            "cards_fields": ["num","title","desc"]},
            "principle":   {"name":"三子卡(原则)","fields":["kicker","heading","cards","section_label","page_num"],
                            "cards_fields": ["num","title","desc"]},
            "technique":   {"name":"三子卡(技法)","fields":["kicker","heading","cards","section_label","page_num"],
                            "cards_fields": ["num","title","desc"]},
            "process_flow":{"name":"纵向时间轴","fields":["kicker","heading","timeline_nodes","section_label","page_num"],
                            "nodes_fields": ["year","metric","label","desc"]},
            "timeline":    {"name":"横向时间线","fields":["heading","nodes","section_label","page_num"],
                            "nodes_fields": ["num","label"]},
            "quote":       {"name":"极简陈述","fields":["statement","anchor","section_label","page_num"]},
            "duo_compare": {"name":"双轨对照","fields":["heading","left_kicker","left_title","left_desc","right_kicker","right_title","right_desc","section_label","page_num"]},
            "closing":     {"name":"收束宣言","fields":["kicker","title","footnote","author","date","takeaways","takeaway_label","takeaway_count","closing_text","section_label","page_num"],
                            "takeaways_fields": ["num","title","desc"]},
            "summary":     {"name":"收束宣言","fields":["kicker","title","footnote","author","date","takeaways","takeaway_label","takeaway_count","closing_text","section_label","page_num"],
                            "takeaways_fields": ["num","title","desc"]},
            "section":    {"name":"极简陈述","fields":["statement","anchor","section_label","page_num"]},
            "image_hero": {"name":"图文封面","fields":["title","description","img_src","img_alt","section_label","page_num","metrics"],
                           "metrics_fields": ["name","value","explanation"]},
            "grid_cards": {"name":"六格定义","fields":["kicker","heading","cells","section_label","page_num"],
                           "cells_fields": ["icon","num","title","desc"]},
            "food_archive":{"name":"图像矩阵","fields":["heading","cells","stat_value","stat_label","section_label","page_num"],
                            "cells_fields": ["title"]},
            "skill_card": {"name":"三子卡","fields":["kicker","heading","cards","section_label","page_num"],
                           "cards_fields": ["num","title","desc"]},
            "troubleshoot":{"name":"双轨对照","fields":["heading","left_kicker","left_title","left_desc","right_kicker","right_title","right_desc","section_label","page_num"]},
            "table":      {"name":"规格说明书","fields":["title","kpi_items","goal_value","goal_label","tags","mp_code","section_label","page_num"],
                           "kpi_fields": ["value","unit"]},
            "appendix":   {"name":"极简陈述","fields":["statement","anchor","section_label","page_num"]},
            "copyright":  {"name":"极简陈述","fields":["statement","anchor","section_label","page_num"]},
        }
    else:
        return {
            "cover":       {"name":"Hero Cover","fields":["section_label","page_num","kicker","title","subtitle","lead","author","footnote_l","footnote_r"]},
            "chapter":     {"name":"Act Divider","fields":["section_label","page_num","kicker","title","lead","footnote_l"]},
            "data_hero":   {"name":"Big Numbers","fields":["section_label","page_num","kicker","heading","lead","stats","footnote_l"],
                            "stats_fields":["label","value","unit","note"]},
            "content":     {"name":"Quote+Image","fields":["section_label","page_num","kicker","heading","lead","quote","quote_src","img_src","img_alt","img_caption"]},
            "image_hero":  {"name":"Image Grid","fields":["section_label","page_num","kicker","heading","images","footnote_l"],
                            "images_fields":["src","alt","caption"]},
            "process_flow":{"name":"Pipeline","fields":["section_label","page_num","kicker","heading","pipelines","footnote_l"],
                            "pipelines_fields":["label","steps"],"steps_fields":["num","title","desc"]},
            "quote":       {"name":"Hero Question","fields":["section_label","page_num","kicker","title","lead","footnote_l"]},
            "duo_compare": {"name":"Big Quote","fields":["section_label","page_num","kicker","quote","translation","attribution"]},
            "toc":         {"name":"A vs B","fields":["section_label","page_num","kicker","heading","left_kicker","left_title","left_items","right_kicker","right_title","right_items","footnote_l"]},
            "closing":     {"name":"Lead Image+Text","fields":["section_label","page_num","kicker","heading","lead","body_text","quote","quote_src","img_src","img_alt","img_caption"]},
            "summary":     {"name":"Lead Image+Text","fields":["section_label","page_num","kicker","heading","lead","body_text","quote","quote_src","img_src","img_alt","img_caption"]},
            "section":    {"name":"Act Divider","fields":["section_label","page_num","kicker","title","lead","footnote_l"]},
            "principle":  {"name":"Quote+Image","fields":["section_label","page_num","kicker","heading","lead","quote","quote_src","img_src","img_alt","img_caption"]},
            "technique":  {"name":"Quote+Image","fields":["section_label","page_num","kicker","heading","lead","quote","quote_src","img_src","img_alt","img_caption"]},
            "timeline":   {"name":"Pipeline","fields":["section_label","page_num","kicker","heading","pipelines","footnote_l"],
                           "pipelines_fields":["label","steps"],"steps_fields":["num","title","desc"]},
            "grid_cards": {"name":"Image Grid","fields":["section_label","page_num","kicker","heading","images","footnote_l"],
                           "images_fields":["src","alt","caption"]},
            "food_archive":{"name":"Image Grid","fields":["section_label","page_num","kicker","heading","images","footnote_l"],
                           "images_fields":["src","alt","caption"]},
            "skill_card": {"name":"Quote+Image","fields":["section_label","page_num","kicker","heading","lead","quote","quote_src","img_src","img_alt","img_caption"]},
            "troubleshoot":{"name":"Big Quote","fields":["section_label","page_num","kicker","quote","translation","attribution"]},
            "table":      {"name":"Lead Image+Text","fields":["section_label","page_num","kicker","heading","lead","body_text","quote","quote_src","img_src","img_alt","img_caption"]},
            "appendix":   {"name":"Lead Image+Text","fields":["section_label","page_num","kicker","heading","lead","body_text","quote","quote_src","img_src","img_alt","img_caption"]},
            "copyright":  {"name":"Act Divider","fields":["section_label","page_num","kicker","title","lead","footnote_l"]},
        }


def _load_svg_prompt_specs() -> tuple[str, str]:
    """Load svg-generator.md and bento-grid-layout.md from ppt_agent/."""
    ppt_agent_dir = os.path.join(BASE_DIR, "ppt_agent", "skills", "_shared", "references", "prompts")
    prompts_dir = os.path.join(BASE_DIR, "services", "ppt_engine", "prompts")

    def _read(filename):
        for d in [ppt_agent_dir, prompts_dir]:
            p = os.path.join(d, filename)
            if os.path.exists(p):
                with open(p, "r", encoding="utf-8") as f:
                    return f.read()
        return ""

    return _read("svg-generator.md"), _read("bento-grid-layout.md")


def _load_outline_spec() -> str:
    """Load outline-architect.md from ppt_engine/prompts/."""
    prompts_dir = os.path.join(BASE_DIR, "services", "ppt_engine", "prompts")
    outline_path = os.path.join(prompts_dir, "outline-architect.md")
    if os.path.exists(outline_path):
        with open(outline_path, "r", encoding="utf-8") as f:
            return f.read()
    return ""


def _load_style_yaml_text(style_id: str) -> str:
    """Load a style YAML file as text for embedding in AI prompts."""
    ppt_agent_dir = os.path.join(BASE_DIR, "ppt_agent", "skills", "_shared", "references", "styles")
    legacy_dir = os.path.join(BASE_DIR, "services", "ppt_engine", "styles")
    for d in [ppt_agent_dir, legacy_dir]:
        p = os.path.join(d, f"{style_id}.yaml")
        if os.path.exists(p):
            with open(p, "r", encoding="utf-8") as f:
                return f.read()
    return ""


def _load_cognitive_spec() -> str:
    """Load cognitive-design-principles.md from ppt_agent/."""
    ppt_agent_dir = os.path.join(BASE_DIR, "ppt_agent", "skills", "_shared", "references", "prompts")
    legacy_dir = os.path.join(BASE_DIR, "services", "ppt_engine", "prompts")
    for d in [ppt_agent_dir, legacy_dir]:
        p = os.path.join(d, "cognitive-design-principles.md")
        if os.path.exists(p):
            with open(p, "r", encoding="utf-8") as f:
                return f.read()
    return ""


def _load_reviewer_spec() -> str:
    """Load reviewer.md from ppt_agent/ — PPT-Agent review-core's reviewer prompt."""
    ppt_agent_dir = os.path.join(BASE_DIR, "ppt_agent", "skills", "gemini-cli", "references", "roles")
    prompts_dir = os.path.join(BASE_DIR, "services", "ppt_engine", "prompts")
    for d in [ppt_agent_dir, prompts_dir]:
        p = os.path.join(d, "reviewer.md")
        if os.path.exists(p):
            with open(p, "r", encoding="utf-8") as f:
                return f.read()
    return ""


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
        "cover", "toc", "content", "technique", "principle", "process_flow",
        "comparison", "duo_compare", "table", "grid_cards", "troubleshoot",
        "summary", "copyright", "appendix", "data_hero", "timeline", "section",
        "quote", "closing", "chapter", "image_hero", "food_archive", "skill_card",
        "image_grid", "process_timeline"
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
                   style_id: str = "business") -> list | None:
    """Phase 5+6: AI selects Bento Grid layout + fills card content per slide.

    Input: stage1_slides [{seq, heading, page_type, layout_hint, body, ...}, ...]
    Output: [{type, layout, zones: {kicker, heading, lead, cards: [{role, title, body, chart}]}}, ...]

    Includes validation loop: generate → validate → if issues → fix (max 2 rounds).
    On generation failure, converts raw zones as fallback.
    """
    svg_spec, bento_spec = _load_svg_prompt_specs()
    cognitive_spec = _load_cognitive_spec()
    reviewer_spec = _load_reviewer_spec()
    style_yaml = _load_style_yaml_text(style_id)

    spec_version = rules.get("spec_version", "2.2.1")

    # ── System prompt for card generation (PPT-Agent design-core + reviewer) ──
    cards_system = f"""{svg_spec}

{bento_spec}

## 认知设计原则
{cognitive_spec}

## 设计评审标准（用于自检）
{reviewer_spec}

## 风格 Token（颜色/字体/阴影/圆角）
{style_yaml}

你是演示文稿设计专家。根据大纲内容和以上设计规范：
1. 为每页选择合适的 Bento Grid 布局
2. 将内容转化为结构化的卡片数据（role, title, body, chart）
3. 每页最多 5 张卡片（Miller's Law: 4±1 个信息单元）
4. 封面最多 3 个信息单元

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
- type 从以下选择: cover, toc, content, technique, principle, process_flow, comparison, duo_compare, table, grid_cards, summary, data_hero, troubleshoot, quote, closing, section, appendix, copyright
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
                    cards_system, cards_user, temperature=1.0))
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
                 batch_size: int = 2) -> list | None:
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

    Returns:
        [{seq, file, svg_content, type, label}] or None on failure
    """
    import re

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
                    svg_system, svg_user, temperature=0.7))

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
                            svg_system, single_user, temperature=0.7))
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

    # ── Phase 6b: Review loop (PPT-Agent review-core equivalent) ──
    if provider_id and model:
        result = _review_and_fix_slides(provider_id, model, llm_generate, result,
                                        style_yaml, style_id, svg_system)
    return result


def _review_and_fix_slides(provider_id, model, llm_generate, slides, style_yaml,
                           style_id, svg_system, max_rounds=2):
    """PPT-Agent review-core equivalent: review each slide, fix if score < 7.

    Uses the same LLM (DeepSeek/Moonshot) with PPT-Agent's reviewer.md prompt.
    Returns updated slides list with fixes applied.
    """
    import re, json

    reviewer_spec = _load_reviewer_spec()
    if not reviewer_spec:
        _logger.info("Reviewer spec not available, skipping review loop")
        return slides

    review_system = f"""{reviewer_spec}

## Style YAML (reference for this review)
```yaml
{style_yaml}
```

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
                    review_system, review_user, temperature=0.3))
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
                        svg_system, fix_user, temperature=0.7))
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