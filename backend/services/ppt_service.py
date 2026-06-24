"""PPT generation service."""
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
EXPORT_DIR = os.path.join(BASE_DIR, "data", "exports")
os.makedirs(EXPORT_DIR, exist_ok=True)


def generate_ppt(content: str, template_id: str = None, branding: dict = None,
                 output_dir: str = None, provider_id: str = "",
                 model: str = "", slide_plan: list = None) -> str:
    """Generate a PPTX file from content. Uses AI when provider+model provided, falls back to mechanical split."""
    prs = None
    slide_data = None
    rules = {}
    typography_profile = None

    if slide_plan is not None:
        slide_data = slide_plan

    if template_id:
        db = get_db()
        try:
            row = db.execute(
                "SELECT file_path, rules, typography_profile, branding_config FROM templates WHERE id = ?",
                (template_id,)).fetchone()
            if row and row["file_path"] and os.path.exists(row["file_path"]):
                prs = Presentation(row["file_path"])
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
                if not rules:
                    try:
                        cfg = db.execute(
                            "SELECT rules FROM column_configs WHERE column_id IN ('col4','col5') LIMIT 1"
                        ).fetchone()
                        if cfg and cfg["rules"]:
                            rules = json.loads(cfg["rules"])
                    except Exception:
                        pass

                print(f"[PPT-DBG] AI check: pid={bool(provider_id)} model={bool(model)} rules_empty={not rules} rules_keys={list(rules.keys()) if rules else 'N/A'} content_len={len(content.strip()) if content else 0}", flush=True)
                if slide_data is None and provider_id and model and rules and content.strip():
                    print("[PPT-DBG] Using AI staged generation", flush=True)
                    # Load column config prompt+skill for AI generation
                    col_prompt = ""
                    col_skill = ""
                    try:
                        cfg2 = db.execute(
                            "SELECT prompt, skill FROM column_configs WHERE column_id IN ('col4','col5') LIMIT 1"
                        ).fetchone()
                        if cfg2:
                            col_prompt = cfg2["prompt"] or ""
                            col_skill = cfg2["skill"] or ""
                    except Exception:
                        pass
                    slide_data = _generate_slides_staged(provider_id, model, rules, content,
                                                         col_prompt, col_skill)
                    print(f"[PPT-DBG] AI result: {bool(slide_data)}, slides={len(slide_data) if slide_data else 0}", flush=True)
                    if not slide_data:
                        print("[PPT-DBG] AI generation failed, falling back to mechanical split", flush=True)
                else:
                    print("[PPT-DBG] Skipping AI, using mechanical fill", flush=True)
        finally:
            db.close()

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
    return filepath


# ── Staged AI slide generation ──

def _generate_slides_staged(provider_id: str, model: str, rules: dict, sop_content: str,
                            system_prompt: str = "", skill_template: str = "") -> list | None:
    """Three-stage pipeline: content → structure → final JSON.

    Stage 1 (AI): Extract & organize content from SOP — AI decides page count.
    Stage 2 (AI): Map content to layout types & zones.
    Stage 3 (code): Validate against rules, no AI.

    Args:
        system_prompt: Template's role+design+behavior prompt (used as system message).
        skill_template: Template's structural SKILL with placeholders (used in user message).
    """
    from services.llm_service import generate as llm_generate

    stage1 = _stage1_content(provider_id, model, llm_generate, rules, sop_content,
                             system_prompt, skill_template)
    if not stage1:
        return None
    _logger.info(f"Stage 1 done: {len(stage1)} slides extracted")

    stage2 = _stage2_structure(provider_id, model, llm_generate, rules, stage1, sop_content,
                               system_prompt)
    if not stage2:
        return None
    _logger.info(f"Stage 2 done: {len(stage2)} slides mapped")

    return stage2


def _stage1_content(provider_id, model, llm_generate, rules, sop_content,
                    system_prompt: str = "", skill_template: str = "") -> list | None:
    """Stage 1: Extract and organize content from SOP following the template's skill structure."""
    content_spec = rules.get("content_spec", "")
    page_rhythm = rules.get("page_rhythm", {})

    system = system_prompt if system_prompt else (
        "你是内容编辑专家。从 SOP 文章中提取内容，严格按照大纲结构为每一页幻灯片编写内容。"
        "核心纪律：大纲中的每个「技法」/「步骤」/「章节」必须独占一页，绝不合并。"
        "即使 SOP 很短，封面页和总结页也不可省略。"
        "每页一主题，内容聚焦不堆砌。输出纯 JSON，不要用 markdown 包裹。"
    )

    rhythm_seq = " → ".join(page_rhythm.get("sequence", ["cover", "toc", "content*N", "summary"]))

    skill_block = ""
    if skill_template:
        skill_block = f"""## 幻灯片结构模板（必须严格遵循的页面结构和字段）
{skill_template}

"""

    user = f"""{skill_block}## 内容大纲（强制结构，每个 ### 节点至少一页）
{content_spec if content_spec else '封面 + 目录 + 内容章节 + 总结'}

## 页面结构约束（铁律）
- 序列: {rhythm_seq}
- 封面 1 页 + 目录 1 页 + 总结 1 页 = 至少 3 页结构页，不可删减
- 大纲中每个 ### 技法节点 = 独立一页，多个技法 = 多页，禁止合并
- 只有内容极丰富的单个技法才可拆分为多页

## 必填页清单（从大纲推导）
先数出 SOP 中有几个独立技法/步骤，每个技法一页。页码编排：1.封面 2.目录 3~N.各技法页 N+1.总结

## SOP 文章（唯一内容来源）
{sop_content}

## 输出格式
```json
{{"slides": [{{"seq":1,"heading":"页标题","body":"页正文","notes":"备注或反面后果(可选)"}}, ...]}}
```
铁律：
- 大纲的每个 ### 节点至少对应一张幻灯片
- 所有文字从 SOP 提取归纳，不编造
- 仅输出 JSON"""

    for attempt in range(2):
        try:
            response = asyncio.run(llm_generate(provider_id, model, system, user, temperature=0.3))
            response = _clean_json_response(response)
            data = json.loads(response)
            slides = data.get("slides", data) if isinstance(data, dict) else data
            if isinstance(slides, list) and len(slides) > 0:
                return slides
        except Exception as e:
            _logger.warning(f"Stage 1 attempt {attempt+1} failed: {e}")
    return None


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


def _stage2_structure(provider_id, model, llm_generate, rules, stage1_slides, sop_content,
                      system_prompt: str = "") -> list | None:
    """Stage 2: Assign layout types and map content to zones."""
    page_rhythm = rules.get("page_rhythm", {})
    design_principles = rules.get("design_principles", [])
    style_family = rules.get("design_rules", {}).get("style_family", "swiss")
    field_spec = _build_guizang_field_spec(style_family)

    # Build compact layout reference from guizang field specs
    layout_ref_lines = []
    for type_id, spec in sorted(field_spec.items()):
        fields = spec["fields"]
        fields_str = ", ".join(fields)
        layout_ref_lines.append(f"- **{type_id}** ({spec['name']}): zones = [{fields_str}]")
        # Document nested array field schemas
        for suffix, sub_fields in [
            ("cards_fields","cards"), ("cells_fields","cells"), ("towers_fields","towers"),
            ("bars_fields","bars"), ("timeline_nodes","nodes_fields"), ("nodes_fields","nodes"),
            ("takeaways_fields","takeaways"), ("metrics_fields","metrics"),
            ("stats_fields","stats"), ("images_fields","images"),
            ("steps_fields","steps"), ("layers_fields","layers"),
            ("kpi_fields","kpi_items"), ("columns_fields","columns"),
            ("rows_fields","rows"), ("briefs_fields","briefs"),
            ("pipelines_fields","pipelines"), ("nodes_fields","nodes"),
        ]:
            if suffix in spec:
                sub = spec[suffix]
                layout_ref_lines.append(f"  └ 数组元素 {spec['name']} 的字段: [{', '.join(sub)}]")

    rhythm_str = " → ".join(page_rhythm.get("sequence", []))
    alt_rule = page_rhythm.get("alternation_rule", "")
    p0_rule = page_rhythm.get("p0_violation", "")

    principles_str = "\n".join(f"- {dp.get('rule','')}" for dp in design_principles)

    # Build a compact example showing cover + closing with correct field names
    cover_fields = field_spec.get("cover", {}).get("fields", [])
    closing_fields = field_spec.get("closing", {}).get("fields", [])
    cover_example = {f: "..." for f in cover_fields[:5]}
    closing_example = {}
    for f in closing_fields[:5]:
        if f not in ("takeaways",):
            closing_example[f] = "..."
    if "takeaways" in closing_fields:
        closing_example["takeaways"] = [{"num":"01","title":"...","desc":"..."}]

    system = system_prompt if system_prompt else (
        "你是PPT结构设计专家。你的任务是为每张幻灯片分配合适的版式类型(layout type)，"
        "并将内容映射到版式对应的 zones 中。zones 的字段名必须严格使用下方定义。"
        "输出纯 JSON，不要用 markdown 包裹。"
    )

    user = f"""## 可用版式类型及字段定义（zones 必须使用这些字段名）
{chr(10).join(layout_ref_lines)}

## 页面节奏规则
- 序列模式: {rhythm_str}
- {alt_rule}
- 严禁: {p0_rule}

## 设计原则
{principles_str}

## 幻灯片内容（从 SOP 提取）
```json
{json.dumps({"slides": stage1_slides}, ensure_ascii=False, indent=2)}
```

## SOP 原文（用于验证内容准确性）
{sop_content[:2000]}

## 输出要求
输出一个 JSON 对象，包含 slides 数组。每元素格式（zones 的 key 必须使用上方定义的英文 field 名）：
```json
{{
  "slides": [
    {{
      "type": "cover",
      "zones": {json.dumps(cover_example, ensure_ascii=False)}
    }},
    {{
      "type": "closing",
      "zones": {json.dumps(closing_example, ensure_ascii=False, indent=6)}
    }}
  ]
}}
```

关键规则：
- type 必须在可用版式类型范围内
- zones 的键必须严格使用上方每种 type 定义的字段名，不得自创、不得汉化、不得省略
- 数组字段（如 takeaways、cards、cells、stats）中每个元素必须包含对应子字段
- 封面(type=cover)必须在第一页，总结(type=summary)必须在最后一页
- 遵守页面节奏规则：不连续3页同类型
- 仅输出 JSON"""

    for attempt in range(2):
        try:
            response = asyncio.run(llm_generate(provider_id, model, system, user, temperature=0.3))
            response = _clean_json_response(response)
            data = json.loads(response)
            slides = data.get("slides", data) if isinstance(data, dict) else data
            if isinstance(slides, list) and len(slides) > 0:
                return slides
        except Exception as e:
            _logger.warning(f"Stage 2 attempt {attempt+1} failed: {e}")
    return None


def _clean_json_response(response: str) -> str:
    """Strip markdown code fences from AI response."""
    response = response.strip()
    if response.startswith("```"):
        lines = response.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        response = "\n".join(lines)
    return response.strip()


def generate_template_pptx(prs: Presentation, prompt: str, skill: str, rules: dict,
                          provider_id: str, model: str, output_path: str) -> str:
    """Generate a complete template PPTX from prompt + SKILL + rules using AI.

    Preserves visual styling by cloning original slides and replacing their text,
    rather than removing slides and rebuilding from scratch.

    Returns the output_path on success, raises on failure.
    """
    from services.llm_service import generate as llm_generate

    layout_types = rules.get("layout_types", [])
    page_rhythm = rules.get("page_rhythm", {})
    design_principles = rules.get("design_principles", [])

    layout_ref = []
    for lt in layout_types:
        zones_str = ", ".join(lt.get("zones", []))
        layout_ref.append(f"- **{lt['id']}**: {lt.get('name','')} | zones: [{zones_str}] | {lt.get('description','')}")

    rhythm_str = " → ".join(page_rhythm.get("sequence", []))
    alt_rule = page_rhythm.get("alternation_rule", "")
    p0_rule = page_rhythm.get("p0_violation", "")
    principles_str = "\n".join(f"- {dp.get('rule','')}" for dp in design_principles)

    system = prompt if prompt else "你是PPT模板生成专家。请将SKILL结构模板转换为幻灯片JSON。"

    user = f"""## 任务
将下方的 SKILL 结构模板完整转换为幻灯片 JSON 数组。**保留所有占位符文字**（如 {{菜品名}}、{{填入}}、{{xx分钟}} 等），不要替换为实际内容。

## SKILL 结构模板
{skill}

## 可用版式类型
{chr(10).join(layout_ref)}

## 页面节奏规则
- 序列: {rhythm_str}
- {alt_rule}
- 严禁: {p0_rule}

## 设计原则
{principles_str}

## 输出格式
```json
{{"slides": [{{"type":"版式id","zones":{{"区域名":"内容(保留占位符)","区域名2":"..."}}}}, ...]}}
```

关键规则：
- SKILL 中每个 ### 节点 = 独立一页
- zones 内容保留 SKILL 中的占位符（{{xxx}}），不替换
- 封面(type=cover)在第一页，总结(type=summary)在最后
- 仅输出 JSON"""

    for attempt in range(2):
        try:
            response = asyncio.run(llm_generate(provider_id, model, system, user, temperature=0.2))
            response = _clean_json_response(response)
            data = json.loads(response)
            slides = data.get("slides", data) if isinstance(data, dict) else data
            if isinstance(slides, list) and len(slides) > 0:
                _fill_template_slides(prs, slides, rules)
                prs.save(output_path)
                _logger.info(f"Template PPTX generated: {output_path} ({len(slides)} slides)")
                return output_path
        except Exception as e:
            _logger.warning(f"Template generation attempt {attempt+1} failed: {e}")
    raise RuntimeError("Failed to generate template PPTX from SKILL")


def _fill_template_slides(prs: Presentation, slide_data: list, rules: dict):
    """Fill template slides by replacing text on original slides directly.

    Preserves the original slide sequence and visual styling 1:1.
    Each original slide's text content is replaced by the corresponding
    AI-generated placeholder content.
    """
    # Build lookup: layout_type_id → ordered zone name list
    layout_types = rules.get("layout_types", [])
    type_zones = {lt["id"]: lt.get("zones", []) for lt in layout_types if lt.get("id")}

    original_slides = list(prs.slides)
    if not original_slides:
        _fill_slides_from_json(prs, slide_data, rules, None)
        return

    n_orig = len(original_slides)
    n_data = len(slide_data)

    # Replace text on existing slides, 1:1 positional mapping
    for i in range(min(n_orig, n_data)):
        slide = original_slides[i]
        sd = slide_data[i]
        zones = sd.get("zones", {})
        if not isinstance(zones, dict):
            zones = {}

        slide_type = sd.get("type", "")
        zone_order = type_zones.get(slide_type)
        _replace_slide_text(slide, zones, zone_order)

    # If AI generated more slides than original, clone the last few originals
    if n_data > n_orig:
        import copy
        for i in range(n_orig, n_data):
            sd = slide_data[i]
            zones = sd.get("zones", {})
            if not isinstance(zones, dict):
                zones = {}

            slide_type = sd.get("type", "")
            zone_order = type_zones.get(slide_type)
            # Clone from the slide at position (i % n_orig) for visual variety
            src_slide = original_slides[i % n_orig]
            new_slide = _clone_slide_from_shapes(prs, src_slide)
            _replace_slide_text(new_slide, zones, zone_order)

    # If fewer slides than original, remove extras
    if n_data < n_orig:
        _remove_slides_from(prs, n_data)


def _replace_slide_text(slide, zones: dict, layout_zone_names: list = None):
    """Replace text in a slide's text shapes with zone content.

    If layout_zone_names is provided, zone content is matched to text shapes
    by the layout type's zone order (positional mapping within the known zone
    list), ensuring the title zone always goes to the title text shape.
    Otherwise falls back to dict-iteration order.

    Any text shape that was NOT filled is cleared to prevent old template
    text from appearing alongside generated content.
    """
    text_shapes = [sh for sh in slide.shapes if sh.has_text_frame]
    filled_indices = set()

    if layout_zone_names:
        for i, zname in enumerate(layout_zone_names):
            ztext = zones.get(zname, "")
            if not str(ztext).strip():
                continue
            text = str(ztext)
            if i < len(text_shapes):
                tf = text_shapes[i].text_frame
                _write_text_frame(tf, text)
                filled_indices.add(i)
            else:
                _add_fallback_textbox(slide, i, text)
    else:
        zone_items = [(k, v) for k, v in zones.items() if str(v).strip()]
        for i, (zname, ztext) in enumerate(zone_items):
            text = str(ztext)
            if i < len(text_shapes):
                tf = text_shapes[i].text_frame
                _write_text_frame(tf, text)
                filled_indices.add(i)
            else:
                _add_fallback_textbox(slide, i, text)

    # Clear any text shapes that weren't matched — they still hold old template text
    for i, sh in enumerate(text_shapes):
        if i not in filled_indices:
            tf = sh.text_frame
            for p in tf.paragraphs:
                p.text = ""


def _write_text_frame(tf, text: str):
    lines = text.split('\n')
    for li, line in enumerate(lines):
        if li == 0:
            tf.paragraphs[0].text = line
        elif li < len(tf.paragraphs):
            tf.paragraphs[li].text = line
        else:
            p = tf.add_paragraph()
            p.text = line
    for p in tf.paragraphs[len(lines):]:
        p.text = ""


def _add_fallback_textbox(slide, index: int, text: str):
    from pptx.util import Inches
    top_offset = Inches(1.5 + index * 0.8)
    txBox = slide.shapes.add_textbox(Inches(1), top_offset, Inches(11), Inches(0.6))
    tf = txBox.text_frame
    tf.word_wrap = True
    lines = text.split('\n')
    for li, line in enumerate(lines):
        if li == 0:
            tf.paragraphs[0].text = line
        else:
            p = tf.add_paragraph()
            p.text = line


def _clone_slide_from_shapes(prs: Presentation, source_slide) -> object:
    """Create a new slide with visual shapes copied from source_slide."""
    import copy
    from lxml import etree

    NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main"

    new_slide = prs.slides.add_slide(source_slide.slide_layout)

    # Get shape trees
    src_elem = source_slide.part._element
    src_cSld = src_elem.find(f"{{{NS_P}}}cSld")
    if src_cSld is None:
        return new_slide
    src_spTree = src_cSld.find(f"{{{NS_P}}}spTree")
    if src_spTree is None:
        return new_slide

    dst_elem = new_slide.part._element
    dst_cSld = dst_elem.find(f"{{{NS_P}}}cSld")
    if dst_cSld is None:
        return new_slide
    dst_spTree = dst_cSld.find(f"{{{NS_P}}}spTree")
    if dst_spTree is None:
        return new_slide

    # Clear default shapes
    for child in list(dst_spTree):
        tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
        if tag in ('sp', 'pic', 'grpSp', 'cxnSp', 'graphicFrame'):
            dst_spTree.remove(child)

    # Copy source shapes
    for child in src_spTree:
        tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
        if tag in ('sp', 'pic', 'grpSp', 'cxnSp', 'graphicFrame'):
            dst_spTree.append(copy.deepcopy(child))

    return new_slide


def _remove_slides_from(prs: Presentation, keep_count: int):
    """Remove slides starting from index `keep_count`."""
    NS = {
        "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
        "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    }
    pres_elem = prs.part._element
    sldIdLst = pres_elem.find(".//p:sldIdLst", NS)
    if sldIdLst is None:
        return

    sldId_elements = list(sldIdLst)
    for idx, sldId in enumerate(sldId_elements):
        if idx < keep_count:
            continue
        rId = sldId.get(f"{{{NS['r']}}}id")
        if rId is not None:
            prs.part.drop_rel(rId)
        sldIdLst.remove(sldId)



# ── Fallback: plain text generation when no template visuals exist ──


def _remove_all_slides(prs: Presentation):
    """Delete all slides from a presentation."""
    NS = {
        "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
        "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    }
    pres_elem = prs.part._element
    sldIdLst = pres_elem.find(".//p:sldIdLst", NS)
    if sldIdLst is None:
        return
    sldId_elements = list(sldIdLst)
    for sldId in sldId_elements:
        rId = sldId.get(f"{{{NS['r']}}}id")
        if rId is not None:
            prs.part.drop_rel(rId)
        sldIdLst.remove(sldId)


def _fill_slides_from_json(prs: Presentation, slides: list, rules: dict, typo: dict):
    """Fallback: create slides from AI-generated JSON using plain text boxes.

    Used only when no original slides exist to clone visual styling from.
    """
    default_layout = prs.slide_layouts[0] if prs.slide_layouts else None

    for sd in slides:
        if not isinstance(sd, dict):
            continue
        zones = sd.get("zones", {})
        if not isinstance(zones, dict):
            zones = {}

        slide = prs.slides.add_slide(default_layout) if default_layout else prs.slides.add_slide()

        top_offset = Inches(1.0)
        for zname, ztext in zones.items():
            txBox = slide.shapes.add_textbox(Inches(1.5), top_offset, Inches(10.3), Inches(0.8))
            txBox.text_frame.text = str(ztext)
            top_offset += Inches(1.0)


def _mechanical_fill(prs: Presentation, content: str):
    """Legacy fallback: split content by ## headings into slides."""
    sections = content.split("\n## ")
    if sections:
        first_lines = sections[0].strip().split("\n")
        title_text = first_lines[0].replace("# ", "").strip() if first_lines else "未命名"
        title_slide = prs.slides.add_slide(prs.slide_layouts[0])
        if title_slide.shapes.title:
            title_slide.shapes.title.text = title_text

    for section in sections[1:]:
        lines = section.strip().split("\n")
        slide_title = lines[0].strip()
        slide_body = "\n".join(lines[1:]).strip()

        slide = prs.slides.add_slide(prs.slide_layouts[1])
        if slide.shapes.title:
            slide.shapes.title.text = slide_title
        if len(slide.placeholders) > 1:
            slide.placeholders[1].text = slide_body[:500]


# ── Spacing defaults (fallback for old templates without typography_profile) ──
_SPACING_DEFAULTS = {
    "text_line_gap": 76200,
    "element_vertical_gap": 101600,
    "footer_margin": 6200000,
    "peer_alignment_tolerance": 50800,
    "slide_bottom_boundary": 6858000,
}

# Ratios applied to computed line-height for spacing (authority: 国开标准 / SJ/T 11841.6.1 / ISO 24896)
_ELEMENT_GAP_RATIO = 1 / 3       # sibling element gap = 1/3 line height
_TEXT_LINE_GAP_RATIO = 1 / 4     # text-to-underline gap = 1/4 line height
_TITLE_LINE_GAP_RATIO = 1 / 5    # title-to-underline gap = 1/5 title size
_PEER_TOLERANCE_RATIO = 3 / 20   # same-row alignment tolerance = 3/20 line height
_FALLBACK_BODY_PT = 18
_FALLBACK_TITLE_PT = 36
_FALLBACK_LINE_HEIGHT_RATIO = 1.2


def _extract_typography(prs: Presentation) -> dict:
    """Extract body/title font sizes and line-height ratio from a template.

    Walks the XML inheritance chain when python-pptx font.size returns None:
    run.rPr[@sz] -> para.defRPr[@sz] -> layout placeholder -> master bodyStyle/titleStyle.
    Returns {body_font_size_pt, title_font_size_pt, line_height_ratio}, null for misses.
    """
    ns = {"a": "http://schemas.openxmlformats.org/drawingml/2006/main",
          "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
          "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"}

    size_counts = {}
    title_size = None

    # ── Pass 1: collect font sizes from runs ──
    for slide in prs.slides:
        for shape in slide.shapes:
            if not shape.has_text_frame:
                continue
            for para in shape.text_frame.paragraphs:
                for run in para.runs:
                    sz = _resolve_run_size(run, ns)
                    if sz is not None:
                        sz = round(sz, 1)
                        size_counts[sz] = size_counts.get(sz, 0) + 1

    # ── Pass 2: master bodyStyle / titleStyle ──
    master_sizes = {}
    a_ns = "http://schemas.openxmlformats.org/drawingml/2006/main"
    p_ns = "http://schemas.openxmlformats.org/presentationml/2006/main"
    for master in prs.slide_masters:
        # Body styles
        for body_style in master.element.iter(f'{{{p_ns}}}bodyStyle'):
            for defRPr in body_style.iter(f'{{{a_ns}}}defRPr'):
                sz = defRPr.get('sz')
                if sz:
                    master_sizes[int(sz) / 100.0] = master_sizes.get(int(sz) / 100.0, 0) + 1
        # Title styles
        if title_size is None:
            for title_style in master.element.iter(f'{{{p_ns}}}titleStyle'):
                for defRPr in title_style.iter(f'{{{a_ns}}}defRPr'):
                    sz = defRPr.get('sz')
                    if sz:
                        title_size = int(sz) / 100.0
                        break

    # Merge master sizes into counts (lower weight — master is fallback)
    for sz, cnt in master_sizes.items():
        size_counts[sz] = size_counts.get(sz, 0) + cnt * 0.5

    if not size_counts:
        return {"body_font_size_pt": None, "title_font_size_pt": None, "line_height_ratio": None}

    sorted_sizes = sorted(size_counts.items(), key=lambda x: -x[1])

    # Title: largest font size
    if title_size is None:
        title_size = max(size_counts.keys())

    # Body: prefer master bodyStyle lvl2-4 (most common body levels), then fall back to run frequencies
    body_size = None
    body_candidates = sorted(
        [(sz, cnt) for sz, cnt in master_sizes.items() if sz < title_size - 4 and sz >= 14],
        key=lambda x: -x[1])
    if body_candidates:
        body_size = body_candidates[0][0]
    else:
        for sz, _ in sorted_sizes:
            if sz < title_size - 4 and sz >= 14:
                body_size = sz
                break
    if body_size is None and sorted_sizes:
        body_size = sorted_sizes[-1][0]

    # ── Pass 3: line-height ratio from master ──
    line_height_ratio = _resolve_line_height(prs, ns)

    return {
        "body_font_size_pt": round(body_size, 1),
        "title_font_size_pt": round(title_size, 1),
        "line_height_ratio": line_height_ratio,
    }


def _resolve_run_size(run, ns: dict) -> float | None:
    """Resolve effective font size for a run by walking the XML inheritance chain.

    Chain: run.rPr[@sz] -> para.defRPr[@sz] -> layout placeholder defRPr -> master styles.
    Returns size in points, or None.
    """
    # 1. Direct run font size
    if run.font.size is not None:
        return run.font.size / 12700.0

    # 2. Run rPr in XML
    rPr = run._r.find('{http://schemas.openxmlformats.org/drawingml/2006/main}rPr')
    if rPr is not None:
        sz = rPr.get('sz')
        if sz:
            return int(sz) / 100.0

    # 3. Paragraph defRPr
    p = run._r.getparent()
    while p is not None:
        pPr = p.find('{http://schemas.openxmlformats.org/drawingml/2006/main}pPr')
        if pPr is not None:
            defRPr = pPr.find('{http://schemas.openxmlformats.org/drawingml/2006/main}defRPr')
            if defRPr is not None:
                sz = defRPr.get('sz')
                if sz:
                    return int(sz) / 100.0
        p = p.getparent()

    return None


def _resolve_line_height(prs: Presentation, ns: dict) -> float | None:
    """Extract line-height ratio from master bodyPr or paragraph lnSpc."""
    a_ns = "http://schemas.openxmlformats.org/drawingml/2006/main"
    p_ns = "http://schemas.openxmlformats.org/presentationml/2006/main"
    for master in prs.slide_masters:
        # Check bodyPr.normAutofit.fontScale
        bodyPr = master.element.find('.//{http://schemas.openxmlformats.org/drawingml/2006/main}bodyPr')
        if bodyPr is not None:
            norm = bodyPr.find('{http://schemas.openxmlformats.org/drawingml/2006/main}normAutofit')
            if norm is not None:
                scale = norm.get('fontScale')
                if scale:
                    return int(scale) / 100000.0

        # Check lvl1pPr.lnSpc.spcPct
        for body_style in master.element.iter(f'{{{p_ns}}}bodyStyle'):
            for lvl1 in body_style.iter(f'{{{a_ns}}}lvl1pPr'):
                for lnSpc in lvl1.iter(f'{{{a_ns}}}lnSpc'):
                    for spcPct in lnSpc.iter(f'{{{a_ns}}}spcPct'):
                        val = spcPct.get('val')
                        if val:
                            return int(val) / 100000.0

    return None


def _compute_spacing_from_profile(profile: dict) -> dict:
    """Compute EMU spacing values from a typography_profile.

    profile: {body_font_size_pt, title_font_size_pt, line_height_ratio}
    Returns a flat dict suitable for _normalize_spacing.
    """
    body_pt = profile.get("body_font_size_pt") or _FALLBACK_BODY_PT
    title_pt = profile.get("title_font_size_pt") or _FALLBACK_TITLE_PT
    ratio = profile.get("line_height_ratio") or _FALLBACK_LINE_HEIGHT_RATIO

    body_emu = body_pt * 12700
    line_height_emu = body_emu * ratio

    return {
        "text_line_gap": int(line_height_emu * _TEXT_LINE_GAP_RATIO),
        "element_vertical_gap": int(line_height_emu * _ELEMENT_GAP_RATIO),
        "footer_margin": _SPACING_DEFAULTS["footer_margin"],
        "peer_alignment_tolerance": int(line_height_emu * _PEER_TOLERANCE_RATIO),
        "slide_bottom_boundary": _SPACING_DEFAULTS["slide_bottom_boundary"],
    }


def _load_spacing_rules(db=None) -> dict:
    """Read spacing rules from column config JSON, fall back to defaults.

    Looks up col4/col5 design_rules.spacing. Returns a flat dict of
    {key: value_emu} suitable for _normalize_spacing.
    """
    if db is None:
        return dict(_SPACING_DEFAULTS)
    try:
        row = db.execute(
            "SELECT rules FROM column_configs WHERE column_id IN ('col4', 'col5') LIMIT 1"
        ).fetchone()
        if not row:
            return dict(_SPACING_DEFAULTS)
        rules = json.loads(row["rules"])
        structured = rules.get("design_rules", {}).get("spacing", {})
        flat = {}
        for k in _SPACING_DEFAULTS:
            entry = structured.get(k, {})
            flat[k] = entry.get("value", _SPACING_DEFAULTS[k]) if isinstance(entry, dict) else _SPACING_DEFAULTS[k]
        return flat
    except Exception:
        return dict(_SPACING_DEFAULTS)


def _horizontally_overlap(a, b) -> bool:
    """True if two shapes share any horizontal space."""
    return a.left < b.left + b.width and a.left + a.width > b.left


def _normalize_spacing(prs: Presentation, spacing: dict = None):
    """Ensure no two elements overlap vertically on any slide.

    Spacing values are read from column config design_rules.spacing
    (which encodes ECMA-376 / PPT design-grid standards).
    Falls back to _SPACING_DEFAULTS if not configured.

    Guards:
    - Same-row peers (top difference < peer_alignment_tolerance) are skipped
    - Footer-zone shapes are left in place
    - Elements are not pushed past slide_bottom_boundary
    """
    s = spacing if spacing else _SPACING_DEFAULTS
    min_gap = s["element_vertical_gap"]
    peer_tol = s["peer_alignment_tolerance"]
    footer_zone = s["footer_margin"]
    bottom_limit = s["slide_bottom_boundary"]

    for slide in prs.slides:
        ordered = sorted(slide.shapes, key=lambda s: s.top)
        for i, upper in enumerate(ordered):
            upper_bottom = upper.top + upper.height
            for lower in ordered[i + 1:]:
                if lower.top >= footer_zone:
                    continue
                if not _horizontally_overlap(upper, lower):
                    continue
                # Peer check — skip if horizontally aligned (same row)
                if abs(lower.top - upper.top) < peer_tol:
                    continue
                # Background container check — if upper fully contains lower
                # horizontally AND lower's top is inside upper, it's intentional
                # (e.g. text on a background rectangle). Skip.
                if (upper.left <= lower.left
                        and upper.left + upper.width >= lower.left + lower.width
                        and upper.top <= lower.top):
                    continue
                gap = lower.top - upper_bottom
                if gap < min_gap:
                    shift = min_gap - gap
                    # Don't push past bottom boundary
                    if lower.top + lower.height + shift > bottom_limit:
                        continue
                    lower.top += shift


def _normalize_formatting(prs: Presentation, spacing: dict = None):
    """Set uniform font (微软雅黑) across the presentation without changing alignment."""
    FONT_NAME = "Microsoft YaHei"  # 微软雅黑
    _normalize_spacing(prs, spacing)
    for slide in prs.slides:
        for shape in slide.shapes:
            # Text frames — only set font, keep original alignment
            if shape.has_text_frame:
                for para in shape.text_frame.paragraphs:
                    for run in para.runs:
                        _set_font_all(run, FONT_NAME)
            # Tables
            if shape.has_table:
                for row in shape.table.rows:
                    for cell in row.cells:
                        cell.vertical_anchor = MSO_ANCHOR.MIDDLE
                        for para in cell.text_frame.paragraphs:
                            para.alignment = PP_ALIGN.CENTER
                            for run in para.runs:
                                _set_font_all(run, FONT_NAME)
            # Group shapes (recurse)
            if shape.shape_type == 6:  # MSO_SHAPE_TYPE.GROUP
                _normalize_group(shape, FONT_NAME)


def _normalize_group(group_shape, font_name: str):
    """Recurse into group shapes — only set font, keep original alignment."""
    for shape in group_shape.shapes:
        if shape.has_text_frame:
            for para in shape.text_frame.paragraphs:
                for run in para.runs:
                    _set_font_all(run, font_name)
        if shape.has_table:
            for row in shape.table.rows:
                for cell in row.cells:
                    cell.vertical_anchor = MSO_ANCHOR.MIDDLE
                    for para in cell.text_frame.paragraphs:
                        para.alignment = PP_ALIGN.CENTER
                        for run in para.runs:
                            _set_font_all(run, font_name)
