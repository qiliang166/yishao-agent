"""Prompt Studio — LLM generates all configs from industry topic + purpose description.

结构契约（代码即契约）：
- column_configs 必须覆盖 9 个 slot，前端按 sort_order/name 消费：
  col1 sort 0/1/2 = 直接输入/视频/文件三种素材入口（ProjectPage applyCol12Configs）
  col2 sort 3/4/5 = 标准/分析/综合三份文档
  col3/col4/col5 按 name 精确匹配 文档课件/分析PPT/综合PPT
- speech/tts 前端按 label 精确匹配，label 固定为三类
- 应用 = 原子替换目标工作区全部配置；id 由服务端生成，杜绝跨工作区主键冲突
"""

import asyncio
import json
import logging
import os
import re
import sys
import time
import traceback
import uuid
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from database import get_db
from services.llm_service import generate

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/prompt-studio")

# In-memory progress lines for frontend polling
_progress: list[str] = []

# ── Template directory ──

if getattr(sys, 'frozen', False):
    _BASE_DIR = os.path.dirname(sys.executable)
    if not os.path.isdir(os.path.join(_BASE_DIR, "resources")):
        _BASE_DIR = os.path.join(sys._MEIPASS, 'backend')
else:
    _BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_TEMPLATES_DIR = os.path.join(_BASE_DIR, "resources", "prompts", "prompt_studio")
_DEBUG_DIR = os.path.join(_BASE_DIR, "data", "debug")
_ERROR_LOG = os.path.join(_BASE_DIR, "data", "prompt_studio_errors.log")

VALID_TEMPLATES = {"system_prompt", "user_message"}


def _write_error_log(msg: str):
    """Write a timestamped error entry to the persistent error log file."""
    os.makedirs(os.path.dirname(_ERROR_LOG), exist_ok=True)
    try:
        with open(_ERROR_LOG, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}\n")
    except Exception:
        pass


def _emit(msg: str):
    """Log and store a progress message for the frontend to poll."""
    logger.info(msg)
    _progress.append(msg)


def _load_prompt_template(name: str) -> str:
    """Load a prompt template file from resources/prompts/prompt_studio/."""
    path = os.path.join(_TEMPLATES_DIR, f"{name}.md")
    if not os.path.exists(path):
        raise HTTPException(500, f"提示词模板文件不存在: {name}.md")
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


# ── Pydantic models ──


class GenerateRequest(BaseModel):
    industry_topic: str
    purpose_description: str
    reference_workspace_id: str = ""
    provider_id: str = ""
    model: str = ""


class ApplyRequest(BaseModel):
    workspace_id: str
    configs: dict


class UpdateTemplateRequest(BaseModel):
    content: str


# Mandatory root prompt_keys that must always be present in core_prompt_configs
MANDATORY_ROOT_PROMPT_KEYS = [
    "research", "outline-rules", "fill-content", "fill-user",
    "text-to-json", "structure-output", "html-output", "cards-system",
]

# ── Structural contract (single source of truth for validation AND apply) ──

# (slot, column_id, sort_order, forced_label or None)
COLUMN_SLOTS = [
    ("c1_text",  "col1", 0, None),
    ("c1_video", "col1", 1, None),
    ("c1_file",  "col1", 2, None),
    ("c2_sop",   "col2", 3, None),
    ("c2_dao",   "col2", 4, None),
    ("c2_yanxi", "col2", 5, None),
    ("c3",       "col3", 6, "文档课件"),
    ("c4",       "col4", 7, "分析PPT"),
    ("c5",       "col5", 8, "综合PPT"),
]
SLOT_META = {s[0]: (s[1], s[2], s[3]) for s in COLUMN_SLOTS}
# slots grouped by column, in sort order — used for slot inference on legacy configs
_SLOTS_BY_COLUMN = {}
for _s in COLUMN_SLOTS:
    _SLOTS_BY_COLUMN.setdefault(_s[1], []).append(_s[0])

SPEECH_LABELS = ["文档演讲", "分析演讲", "综合演讲"]
TTS_LABELS = ["文档语音", "分析语音", "综合语音"]

CONFIG_TABLES = [
    "column_configs",
    "speech_configs",
    "tts_configs",
    "core_prompt_configs",
]

EXCLUDE_FIELDS = {"created_at", "updated_at", "workspace_id", "sort_order"}


def _serialize_configs(db, workspace_id: str = None) -> dict:
    """Load all configs from a workspace (or seed data) and return as a dict."""
    result = {}
    for table in CONFIG_TABLES:
        if workspace_id:
            rows = db.execute(
                f"SELECT * FROM {table} WHERE workspace_id = ? ORDER BY sort_order",
                (workspace_id,),
            ).fetchall()
        else:
            rows = db.execute(
                f"SELECT * FROM {table} WHERE workspace_id IS NULL ORDER BY sort_order"
            ).fetchall()
        result[table] = []
        for row in rows:
            d = dict(row)
            for key in EXCLUDE_FIELDS:
                d.pop(key, None)
            result[table].append(d)
    return result


def _build_system_prompt(ref_configs: dict, industry_topic: str, purpose_description: str) -> str:
    """Build the system prompt from the editable template file."""
    ref_summary_parts = []
    for table, rows in ref_configs.items():
        ref_summary_parts.append(f"\n### {table} ({len(rows)} rows)")
        for r in rows[:3]:
            label = r.get("label", r.get("name", ""))
            ref_summary_parts.append(f"  - {label}")
        if len(rows) > 3:
            ref_summary_parts.append(f"  ... and {len(rows) - 3} more")

    template = _load_prompt_template("system_prompt")
    return (template
            .replace("{{industry_topic}}", industry_topic)
            .replace("{{purpose_description}}", purpose_description)
            .replace("{{ref_summary}}", "\n".join(ref_summary_parts)))


# ── Template management endpoints ──


@router.get("/templates")
def get_templates():
    """Return the editable prompt templates (system_prompt + user_message)."""
    try:
        return {
            "system_prompt": _load_prompt_template("system_prompt"),
            "user_message": _load_prompt_template("user_message"),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"读取模板失败: {str(e)}")


@router.put("/templates/{name}")
def update_template(name: str, req: UpdateTemplateRequest):
    """Update a prompt template file."""
    if name not in VALID_TEMPLATES:
        raise HTTPException(400, f"无效的模板名称: {name}，可选值: {', '.join(sorted(VALID_TEMPLATES))}")
    path = os.path.join(_TEMPLATES_DIR, f"{name}.md")
    try:
        with open(path, "w", encoding="utf-8") as f:
            f.write(req.content)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(500, f"保存模板失败: {str(e)}")


# ── LLM generation endpoints ──


@router.get("/generate-progress")
def get_generate_progress():
    """Polled by frontend during generation to show live progress."""
    return {"lines": list(_progress)}


@router.get("/default-provider")
def get_default_provider():
    """Return the first enabled LLM provider for the frontend to pre-select."""
    db = get_db()
    try:
        row = db.execute(
            "SELECT id, name, models FROM llm_providers WHERE is_enabled = 1 ORDER BY created_at LIMIT 1"
        ).fetchone()
        if not row:
            return {"provider_id": "", "model": "", "name": "", "available": False}
        models = json.loads(row["models"]) if isinstance(row["models"], str) else (row["models"] or [])
        return {
            "provider_id": row["id"],
            "model": models[0] if models else "",
            "name": row["name"],
            "available": True,
        }
    finally:
        db.close()


def _build_user_message(ref_configs: dict, industry_topic: str, purpose_description: str) -> str:
    """Build the user message from the editable template file."""
    ref_json = json.dumps(ref_configs, ensure_ascii=False, indent=2)
    max_ref_len = 30000
    if len(ref_json) > max_ref_len:
        ref_json = ref_json[:max_ref_len] + "\n... (truncated)"

    template = _load_prompt_template("user_message")
    return (template
            .replace("{{industry_topic}}", industry_topic)
            .replace("{{purpose_description}}", purpose_description)
            .replace("{{ref_json}}", ref_json))


async def _llm_call_with_heartbeat(provider_id: str, model: str, system_prompt: str,
                                    user_message: str, max_tokens: int, label: str = "") -> str:
    """Call LLM with a heartbeat that logs every 8s so the user can see it's alive."""
    tag = f"[{label}] " if label else ""
    heartbeat_running = True

    async def _heartbeat():
        while heartbeat_running:
            await asyncio.sleep(8)
            if heartbeat_running:
                _emit(f"[prompt-studio] {tag}等待 LLM 响应中...")

    heartbeat_task = asyncio.create_task(_heartbeat())
    try:
        raw = await generate(
            provider_id=provider_id,
            model=model,
            system_prompt=system_prompt,
            user_message=user_message,
            temperature=0.7,
            json_mode=True,
            max_tokens=max_tokens,
        )
    finally:
        heartbeat_running = False
        heartbeat_task.cancel()
    return raw


def _build_focused_user_message(ref_configs: dict, industry_topic: str, purpose_description: str,
                                 target_keys: list, target_desc: str, max_tokens: int) -> str:
    """Build a user message asking for only a subset of configs, with reference configs preserved."""
    ref_subset = {k: ref_configs.get(k, []) for k in target_keys if k in ref_configs}
    ref_json = json.dumps(ref_subset, ensure_ascii=False, indent=2)

    inner = ", ".join(f'"{k}": [...]' for k in target_keys)
    return (
        f"Generate ONLY {target_desc} for:\n"
        f"Industry/Topic: {industry_topic}\n"
        f"Purpose/Use Case: {purpose_description}\n\n"
        f"Reference configs (format/depth reference only, do NOT copy content):\n"
        f"```json\n{ref_json}\n```\n\n"
        f"Output ONLY this JSON structure:\n{{{inner}}}\n\n"
        f"No markdown code blocks, no explanations. Every prompt and skill field must be non-empty."
    )


# ── Specialized system prompts (partitioned from system_prompt.md by call responsibility) ──
# Each preserves full precision — no rules are deleted, only partitioned to avoid duplication.

_COMMON_PROMPT = """You are a prompt engineering expert. Generate AI prompt configurations for a content generation platform.

Platform: multi-stage training-content generation system (works for ANY industry):
- Stage 1: Raw material input → AI organizes and structures
- Stage 2: Structured content → THREE full training documents (standard / analysis / comprehensive)
- Stage 3: Training document → Slide outline (JSON) for PPT generation
- Stage 4: Slide outline → Full PPT with HTML/SVG slides
- Stage 5: PPT → Speech script → TTS voice synthesis

CRITICAL ADAPTATION RULES:
1. Format skeleton stays, industry semantics change — keep all JSON structures, field names, data schemas, and fixed labels unchanged
2. Redesign for target industry: ALL role definitions (expert OF THE TARGET INDUSTRY), chapter names, section names, table columns, record fields, examples
3. Do NOT copy any industry-specific concept from reference configs — reference shows FORMAT and DEPTH, not content

Output ONLY valid JSON. No markdown code blocks, no explanations. Every prompt and skill field must be non-empty."""


def _build_column_system_prompt(industry_topic: str, purpose_description: str) -> str:
    return _COMMON_PROMPT + f"""

Target Industry: {industry_topic}
Purpose: {purpose_description}

## column_configs (EXACTLY 9 entries — one per slot)
Each entry has: slot, column_id, label, prompt, skill, has_template(=0), template_path(=null), rules(JSON string)

The frontend consumes these by fixed position. You MUST generate all 9 slots:

| slot | column_id | purpose | label rule |
|------|-----------|---------|------------|
| c1_text | col1 | Stage 1 — organize raw TEXT input | industry-appropriate |
| c1_video | col1 | Stage 1 — organize content from VIDEO | industry-appropriate |
| c1_file | col1 | Stage 1 — organize content from UPLOADED FILE | industry-appropriate |
| c2_sop | col2 | Stage 2 — STANDARD document: normative/procedural | industry-appropriate |
| c2_dao | col2 | Stage 2 — ANALYSIS document: principles + methods (why & how) | industry-appropriate |
| c2_yanxi | col2 | Stage 2 — COMPREHENSIVE document: study handbook (background + principles + practice) | industry-appropriate |
| c3 | col3 | Stage 3 — document → slide outline JSON | label MUST be exactly 文档课件 |
| c4 | col4 | Stage 4 — analysis-style PPT generation | label MUST be exactly 分析PPT |
| c5 | col5 | Stage 4 — comprehensive-style PPT generation | label MUST be exactly 综合PPT |

RULES:
- c1_* share the same output skill template (industry-appropriate structured note format) but differ in prompt (text vs video vs file source handling)
- c2_* define THREE DIFFERENT document types. Design what "standard / analysis / comprehensive" means FOR THIS INDUSTRY
- prompt field: Role definition + task instructions (~200-500 chars). Role must be an expert OF THE TARGET INDUSTRY
- skill field: Output format template in Markdown (~300-1500 chars) with industry-appropriate sections, tables and fields
- c3 skill: JSON array of page objects. Each has: seq, heading, page_type, optional title_format/subtitle/key_points/description. Allowed page_type values: cover, toc, content, table, chart, diagram, flowchart, closing. Design 5-10 pages whose headings/chapters fit the target industry
- c4/c5 skill: MUST keep the structure "chapter table (章节 | page_type | 页数 | 说明) + output format instructions", but ALL chapter names and content descriptions must be redesigned for the target industry (do NOT reuse chapters from reference configs)
- c4 rules: JSON string with keys design_rules, outline_architect_prompt, cognitive_design_principles (industry-adapted content). Non-empty.
- c5 rules: JSON string with keys design_rules, outline_architect_prompt, cognitive_design_principles (industry-adapted content). Non-empty.
- c1/c2/c3 rules: "{{}}" only (no design rules needed for non-PPT slots).

CRITICAL: c4 and c5 MUST both have non-empty rules. This is the #1 quality issue to avoid.

Output ONLY this JSON structure:
{{"column_configs": [{{"slot": "c1_text", "column_id": "col1", "label": "...", "prompt": "...", "skill": "...", "has_template": 0, "template_path": null, "rules": "{{}}"}}, ... (9 entries total, one per slot)]}}"""


def _build_speech_tts_system_prompt(industry_topic: str, purpose_description: str) -> str:
    return _COMMON_PROMPT + f"""

Target Industry: {industry_topic}
Purpose: {purpose_description}

## speech_configs (EXACTLY 3 entries)
Each entry has: label, prompt, skill
- labels MUST be exactly: 文档演讲, 分析演讲, 综合演讲 (the frontend matches by these labels — do NOT rename)
- prompt: speech-script-writing role & instructions for the corresponding document type, industry-adapted
- skill: output format template for the speech script
- 文档演讲 ↔ standard document (c2_sop), 分析演讲 ↔ analysis document (c2_dao), 综合演讲 ↔ comprehensive document (c2_yanxi)

## tts_configs (EXACTLY 3 entries)
Each entry has: label, prompt, skill (ALL fields must be non-empty)
- labels MUST be exactly: 文档语音, 分析语音, 综合语音 (do NOT rename)
- prompt: TTS voice style instructions (tone, pace, emphasis) suited to the industry content (~100-300 chars)
- skill: TTS output format specification describing the voice output structure (~100-300 chars, MUST be non-empty)

Output ONLY this JSON structure:
{{"speech_configs": [{{"label": "文档演讲", "prompt": "...", "skill": "..."}}, {{"label": "分析演讲", "prompt": "...", "skill": "..."}}, {{"label": "综合演讲", "prompt": "...", "skill": "..."}}], "tts_configs": [{{"label": "文档语音", "prompt": "...", "skill": "..."}}, {{"label": "分析语音", "prompt": "...", "skill": "..."}}, {{"label": "综合语音", "prompt": "...", "skill": "..."}}]}}"""


def _build_core_system_prompt(industry_topic: str, purpose_description: str) -> str:
    return _COMMON_PROMPT + f"""

Target Industry: {industry_topic}
Purpose: {purpose_description}

## core_prompt_configs (25-40 entries)
Each entry has: prompt_key (unique), category, label, content, stage
- Categories: root, always, by_type, by_feature, by_layout
- Stages: stage1-outline, stage2-structure, stage3-html, aux
- prompt_key uses "/" hierarchy: e.g. "always/language", "by_type/cover"
- These are modular prompt fragments assembled during PPT generation
- content: ~100-500 chars per fragment

MANDATORY root prompt_keys (must ALWAYS be included, with content adapted to target industry):
- research — Stage 1 research/analysis system prompt
- outline-rules — Stage 3 outline extraction rules
- fill-content — Stage 1 body fill system prompt (PPT slide content filling)
- fill-user — Stage 1 body fill user prompt (configurable body fill instructions, MUST include body_rule handling)
- text-to-json — Stage 1 text-to-JSON conversion prompt
- structure-output — Stage 3 structure output format spec
- html-output — Stage 3 HTML generation output spec
- cards-system — Stage 3 cards subsystem prompt

MUST REDESIGN FOR THE TARGET INDUSTRY (industry semantics):
- ALL role definitions (no cooking/culinary roles unless the target industry is culinary)
- ALL chapter names, section names, table columns and record fields
- ALL examples in every content fragment
- Industry-specific design principles (keep universal design principles as-is)

Output ONLY this JSON structure:
{{"core_prompt_configs": [{{"prompt_key": "always/language", "category": "always", "label": "...", "content": "...", "stage": "stage3-html"}}, ... (25-40 entries total, all 8 mandatory keys included)]}}"""


@router.post("/generate")
async def generate_prompts(req: GenerateRequest):
    """Generate all prompt configs via 3 parallel LLM calls with specialized prompts.

    Each call gets a dedicated system prompt containing only the schema it
    needs — full precision, zero duplication. Reference configs preserved.
    """
    _progress.clear()
    t_start = time.time()
    _emit(f"[prompt-studio] === 开始生成 (3路并行) === topic={req.industry_topic!r}")

    db = get_db()
    try:
        ref_ws = req.reference_workspace_id.strip() if req.reference_workspace_id else ""
        ref_configs = _serialize_configs(db, ref_ws if ref_ws else None)
        _emit(f"[prompt-studio] 参考配置加载完成 workspace={ref_ws or '(seed)'}")
    finally:
        db.close()

    provider_id = req.provider_id.strip()
    model = req.model.strip()
    db2 = get_db()
    try:
        if provider_id and model:
            provider_row = db2.execute(
                "SELECT id, name, models FROM llm_providers WHERE id = ? AND is_enabled = 1",
                (provider_id,)
            ).fetchone()
            if not provider_row:
                _write_error_log(f"LLM provider not found or disabled: id={provider_id}")
                raise HTTPException(400, f"指定的 LLM 提供商不存在或未启用")
        else:
            provider_row = db2.execute(
                "SELECT id, name, models FROM llm_providers WHERE is_enabled = 1 ORDER BY created_at LIMIT 1"
            ).fetchone()
            if not provider_row:
                _write_error_log("No enabled LLM provider found")
                raise HTTPException(400, "没有可用的 LLM 提供商，请先在全局设置中配置")
            provider_id = provider_row["id"]
            models = json.loads(provider_row["models"]) if isinstance(provider_row["models"], str) else (provider_row["models"] or [])
            if not models:
                _write_error_log(f"LLM provider has no models configured: name={provider_row['name']}")
                raise HTTPException(400, "LLM 提供商没有配置模型")
            model = models[0]
        _emit(f"[prompt-studio] 提供商 provider={provider_row['name']} model={model}")
    finally:
        db2.close()

    # Build 3 specialized system prompts (partitioned, full precision)
    sys_a = _build_column_system_prompt(req.industry_topic, req.purpose_description)
    sys_b = _build_speech_tts_system_prompt(req.industry_topic, req.purpose_description)
    sys_c = _build_core_system_prompt(req.industry_topic, req.purpose_description)
    _emit(f"[prompt-studio] 专用提示词 A={len(sys_a)}chars B={len(sys_b)}chars C={len(sys_c)}chars")

    # Write debug prompts
    os.makedirs(_DEBUG_DIR, exist_ok=True)
    for tag, text in [("A_column", sys_a), ("B_speech_tts", sys_b), ("C_core", sys_c)]:
        try:
            with open(os.path.join(_DEBUG_DIR, f"ps_last_system_prompt_{tag}.txt"), "w", encoding="utf-8") as f:
                f.write(text)
        except Exception:
            pass

    # ── 3 parallel LLM calls ──
    _emit(f"[prompt-studio] 并行调用 A: column_configs (9条) max_tokens=32768")
    msg_a = _build_focused_user_message(
        ref_configs, req.industry_topic, req.purpose_description,
        ["column_configs"], "column_configs (9 entries)", 32768)

    _emit(f"[prompt-studio] 并行调用 B: speech+tts (6条) max_tokens=16384")
    msg_b = _build_focused_user_message(
        ref_configs, req.industry_topic, req.purpose_description,
        ["speech_configs", "tts_configs"], "speech_configs (3) + tts_configs (3)", 16384)

    _emit(f"[prompt-studio] 并行调用 C: core_prompt_configs (25-40条) max_tokens=49152")
    msg_c = _build_focused_user_message(
        ref_configs, req.industry_topic, req.purpose_description,
        ["core_prompt_configs"], "core_prompt_configs (25-40 entries)", 49152)

    t_llm = time.time()
    task_a = _llm_call_with_heartbeat(provider_id, model, sys_a, msg_a, 32768, "A")
    task_b = _llm_call_with_heartbeat(provider_id, model, sys_b, msg_b, 16384, "B")
    task_c = _llm_call_with_heartbeat(provider_id, model, sys_c, msg_c, 49152, "C")

    try:
        raw_a, raw_b, raw_c = await asyncio.gather(task_a, task_b, task_c)
    except Exception as e:
        err_detail = f"{type(e).__name__}: {e}"
        _emit(f"[prompt-studio] LLM 调用失败: {err_detail}")
        _write_error_log(f"LLM call failed: {err_detail}\n{traceback.format_exc()}")
        raise HTTPException(500, f"LLM 调用失败: {err_detail}")

    t_llm_end = time.time()
    _emit(f"[prompt-studio] 三路返回 A={len(raw_a)}chars B={len(raw_b)}chars C={len(raw_c)}chars 总耗时={t_llm_end - t_llm:.1f}s")

    # Write debug responses
    for tag, raw in [("A", raw_a), ("B", raw_b), ("C", raw_c)]:
        try:
            with open(os.path.join(_DEBUG_DIR, f"ps_last_response_{tag}.txt"), "w", encoding="utf-8") as f:
                f.write(raw)
        except Exception:
            pass
        if not raw.strip().endswith("}"):
            last_brace = raw.rfind("}")
            _emit(f"[prompt-studio] 响应{tag} 未以 '}}' 结尾（可能被截断），最后 '}}' 在位置 {last_brace}/{len(raw)}")

    # Parse each response
    try:
        configs_a = _parse_llm_response(raw_a)
    except HTTPException:
        _emit(f"[prompt-studio] 响应A JSON 解析失败 raw_len={len(raw_a)}")
        _write_error_log(f"Response A JSON parse failed raw_len={len(raw_a)} first_500={raw_a[:500]}")
        raise
    _emit(f"[prompt-studio] 响应A JSON 解析成功")

    try:
        configs_b = _parse_llm_response(raw_b)
    except HTTPException:
        _emit(f"[prompt-studio] 响应B JSON 解析失败 raw_len={len(raw_b)}")
        _write_error_log(f"Response B JSON parse failed raw_len={len(raw_b)} first_500={raw_b[:500]}")
        raise
    _emit(f"[prompt-studio] 响应B JSON 解析成功")

    try:
        configs_c = _parse_llm_response(raw_c)
    except HTTPException:
        _emit(f"[prompt-studio] 响应C JSON 解析失败 raw_len={len(raw_c)}")
        _write_error_log(f"Response C JSON parse failed raw_len={len(raw_c)} first_500={raw_c[:500]}")
        raise
    _emit(f"[prompt-studio] 响应C JSON 解析成功")

    # Merge results from 3 calls
    configs = {}
    configs["column_configs"] = configs_a.get("column_configs", [])
    configs["speech_configs"] = configs_b.get("speech_configs", [])
    configs["tts_configs"] = configs_b.get("tts_configs", [])
    configs["core_prompt_configs"] = configs_c.get("core_prompt_configs", [])
    _emit(f"[prompt-studio] 合并完成")

    _fixup_c5_rules(configs, req.industry_topic)

    try:
        _validate_configs(configs)
    except HTTPException as e:
        _emit(f"[prompt-studio] 配置校验失败: {e.detail}")
        _write_error_log(f"Config validation failed: {e.detail}")
        raise
    _emit(f"[prompt-studio] 配置校验通过 column={len(configs.get('column_configs',[]))} "
          f"speech={len(configs.get('speech_configs',[]))} tts={len(configs.get('tts_configs',[]))} "
          f"core={len(configs.get('core_prompt_configs',[]))}")

    _ensure_row_ids(configs)

    t_total = time.time() - t_start
    _emit(f"[prompt-studio] === 生成完成 总耗时={t_total:.1f}s ===")
    return {"configs": configs, "provider": {"id": provider_id, "model": model}}


def _fixup_c5_rules(configs: dict, industry_topic: str):
    """If c5 (comprehensive PPT) rules is empty, generate a fallback from c4 structure."""
    cols = configs.get("column_configs", [])
    c4 = next((c for c in cols if c.get("slot") == "c4"), None)
    c5 = next((c for c in cols if c.get("slot") == "c5"), None)
    if not c5:
        return
    try:
        c5_rules = json.loads(c5["rules"]) if isinstance(c5["rules"], str) else c5["rules"]
    except (json.JSONDecodeError, TypeError):
        c5_rules = {}
    if c5_rules and c5_rules != {}:
        return  # already has content

    _emit("[prompt-studio] c5 rules 为空，自动生成 fallback")
    # Build fallback from c4 rules structure, adapted for comprehensive PPT
    fallback = {
        "design_rules": {
            "typography_spec": {"body_font_size_pt": 18, "title_font_size_pt": 36, "line_height_ratio": 1.2}
        },
        "outline_architect_prompt": (
            f"你是一名专业的{industry_topic}PPT结构架构师。"
            f"使用金字塔原理为{industry_topic}综合培训PPT设计清晰、逻辑的大纲。"
            f"应用结论先行、以上统下、归类分组、逻辑递进原则。"
            f"目标受众：{industry_topic}从业人员。"
            f"关键信息：管理全景、岗位剖析、流程优化、工具应用、问题诊断。"
            f"期望页数：12-15页。输出JSON大纲。"
        ),
        "cognitive_design_principles": (
            "应用认知设计原则：信息分块（每页一个观点），图文结合（流程图、表格），"
            "对比强调（红绿灯标识），故事化引导（案例引入），"
            f"确保{industry_topic}综合培训流程直观易懂。"
        )
    }
    # If c4 has rules, borrow its structure as template (keep keys, adapt values)
    if c4:
        try:
            c4_rules = json.loads(c4["rules"]) if isinstance(c4["rules"], str) else c4["rules"]
            if c4_rules and isinstance(c4_rules, dict):
                # Use c4's structure but adapt for comprehensive
                if "design_rules" in c4_rules and c4_rules["design_rules"]:
                    fallback["design_rules"] = c4_rules["design_rules"]
        except (json.JSONDecodeError, TypeError):
            pass
    c5["rules"] = json.dumps(fallback, ensure_ascii=False)
    _emit(f"[prompt-studio] c5 rules fallback 已设置")


def _ensure_row_ids(configs: dict):
    """Fill missing/duplicate row ids — the frontend editor locates rows by id."""
    seen = set()
    for table in CONFIG_TABLES:
        for row in configs.get(table, []):
            rid = row.get("id")
            if not rid or rid in seen:
                rid = _new_id()
                row["id"] = rid
            seen.add(rid)


def _parse_llm_response(raw: str) -> dict:
    """Parse LLM response, handling markdown code blocks and JSON repair."""
    text = raw.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines)

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    raise HTTPException(500, f"LLM 返回的内容不是有效的 JSON: {raw[:300]}")


def _normalize_column_configs(rows: list) -> list:
    """Ensure every column config row carries a valid slot; infer for legacy configs.

    Mutates rows in place (fills the `slot` field) and returns them.
    Raises HTTPException(400) with a precise message when the structure
    cannot satisfy the 9-slot contract.
    """
    if not isinstance(rows, list):
        raise HTTPException(400, "configs.column_configs 必须是数组")

    has_any_slot = any(r.get("slot") for r in rows)
    if has_any_slot:
        seen = set()
        for r in rows:
            slot = r.get("slot", "")
            if slot not in SLOT_META:
                raise HTTPException(400, f"column_configs 存在无效 slot: {slot!r}，有效值: {', '.join(SLOT_META)}")
            if slot in seen:
                raise HTTPException(400, f"column_configs 的 slot 重复: {slot}")
            seen.add(slot)
        missing = [s for s in SLOT_META if s not in seen]
        if missing:
            raise HTTPException(400, f"column_configs 缺少 slot: {', '.join(missing)}，请重新生成完整配置")
    else:
        # Legacy configs (no slot field): infer by column_id grouping.
        by_col = {}
        for r in rows:
            by_col.setdefault(r.get("column_id", ""), []).append(r)
        expected_counts = {col: len(slots) for col, slots in _SLOTS_BY_COLUMN.items()}
        problems = []
        for col, cnt in expected_counts.items():
            actual = len(by_col.get(col, []))
            if actual != cnt:
                problems.append(f"{col} 需要 {cnt} 条，实际 {actual} 条")
        extra_cols = [c for c in by_col if c not in expected_counts]
        if extra_cols:
            problems.append(f"存在未知列: {', '.join(extra_cols)}")
        if problems:
            raise HTTPException(
                400,
                "该配置结构不完整，无法应用（" + "；".join(problems)
                + "）。旧版生成的配置不满足 9 项列配置契约，请在提示词工作室重新生成。")
        for col, slots in _SLOTS_BY_COLUMN.items():
            for slot, r in zip(slots, by_col[col]):
                r["slot"] = slot

    # Per-row content checks + enforce fixed labels
    for r in rows:
        slot = r["slot"]
        column_id, _sort, forced_label = SLOT_META[slot]
        r["column_id"] = column_id
        if forced_label:
            r["label"] = forced_label
        if not (r.get("label") or "").strip():
            raise HTTPException(400, f"column_configs slot {slot} 缺少 label")
        if not (r.get("prompt") or "").strip():
            raise HTTPException(400, f"column_configs slot {slot} 的 prompt 为空，请重新生成")
        if not (r.get("skill") or "").strip():
            raise HTTPException(400, f"column_configs slot {slot} 的 skill 为空，请重新生成")
    return rows


def _normalize_labeled_configs(rows: list, required_labels: list, table: str) -> list:
    """Validate speech/tts configs: exactly one row per required label."""
    if not isinstance(rows, list):
        raise HTTPException(400, f"configs.{table} 必须是数组")
    by_label = {}
    for r in rows:
        label = (r.get("label") or "").strip()
        if label not in required_labels:
            raise HTTPException(
                400,
                f"{table} 存在无效 label: {label!r}，label 必须为: {', '.join(required_labels)}（前端按 label 匹配，不可自定义）")
        if label in by_label:
            raise HTTPException(400, f"{table} 的 label 重复: {label}")
        if not (r.get("prompt") or "").strip():
            raise HTTPException(400, f"{table}「{label}」的 prompt 为空，请重新生成")
        by_label[label] = r
    missing = [l for l in required_labels if l not in by_label]
    if missing:
        raise HTTPException(400, f"{table} 缺少: {', '.join(missing)}，请重新生成完整配置")
    # Return in canonical label order so sort_order is deterministic
    return [by_label[l] for l in required_labels]


def _validate_configs(configs: dict):
    """Validate + normalize the generated configs against the structural contract."""
    configs["column_configs"] = _normalize_column_configs(configs.get("column_configs", []))
    configs["speech_configs"] = _normalize_labeled_configs(
        configs.get("speech_configs", []), SPEECH_LABELS, "speech_configs")
    configs["tts_configs"] = _normalize_labeled_configs(
        configs.get("tts_configs", []), TTS_LABELS, "tts_configs")

    core_rows = configs.get("core_prompt_configs", [])
    if not isinstance(core_rows, list):
        raise HTTPException(400, "configs.core_prompt_configs 必须是数组")
    if not (25 <= len(core_rows) <= 40):
        raise HTTPException(400, f"core_prompt_configs 需要 25-40 条，实际 {len(core_rows)} 条")
    seen_keys = set()
    for r in core_rows:
        key = (r.get("prompt_key") or "").strip()
        if not key:
            raise HTTPException(400, "core_prompt_configs 存在空 prompt_key")
        if key in seen_keys:
            raise HTTPException(400, f"core_prompt_configs 的 prompt_key 重复: {key}")
        seen_keys.add(key)
    missing_mandatory = [k for k in MANDATORY_ROOT_PROMPT_KEYS if k not in seen_keys]
    if missing_mandatory:
        raise HTTPException(400, f"core_prompt_configs 缺少必需的 root prompt_key: {', '.join(missing_mandatory)}")


# ── Saved Configs CRUD ──


class SaveConfigRequest(BaseModel):
    name: str
    industry_topic: str
    purpose_description: str
    configs: dict
    provider_info: Optional[dict] = None


class UpdateSaveRequest(BaseModel):
    name: Optional[str] = None
    configs: Optional[dict] = None


@router.get("/saves")
def list_saves():
    """List all saved prompt configs (summary only, without full configs)."""
    db = get_db()
    try:
        rows = db.execute(
            "SELECT id, name, industry_topic, purpose_description, provider_info, created_at, updated_at "
            "FROM prompt_studio_saves ORDER BY updated_at DESC"
        ).fetchall()
        result = []
        for row in rows:
            d = dict(row)
            if d.get("provider_info") and isinstance(d["provider_info"], str):
                try:
                    d["provider_info"] = json.loads(d["provider_info"])
                except Exception:
                    pass
            result.append(d)
        return {"saves": result}
    finally:
        db.close()


@router.get("/saves/{save_id}")
def get_save(save_id: str):
    """Get a single saved config with full configs."""
    db = get_db()
    try:
        row = db.execute(
            "SELECT * FROM prompt_studio_saves WHERE id = ?", (save_id,)
        ).fetchone()
        if not row:
            raise HTTPException(404, "保存记录不存在")
        d = dict(row)
        if d.get("configs") and isinstance(d["configs"], str):
            try:
                d["configs"] = json.loads(d["configs"])
            except Exception:
                pass
        if d.get("provider_info") and isinstance(d["provider_info"], str):
            try:
                d["provider_info"] = json.loads(d["provider_info"])
            except Exception:
                pass
        return {"save": d}
    finally:
        db.close()


@router.post("/saves")
def create_save(req: SaveConfigRequest):
    """Save a generated config set for later use."""
    save_id = f"psave-{uuid.uuid4().hex[:12]}"
    db = get_db()
    try:
        db.execute(
            "INSERT INTO prompt_studio_saves (id, name, industry_topic, purpose_description, configs, provider_info) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                save_id,
                req.name,
                req.industry_topic,
                req.purpose_description,
                json.dumps(req.configs, ensure_ascii=False),
                json.dumps(req.provider_info, ensure_ascii=False) if req.provider_info else None,
            ),
        )
        db.commit()
        return {"ok": True, "id": save_id}
    except Exception as e:
        raise HTTPException(500, f"保存失败: {str(e)}")
    finally:
        db.close()


@router.put("/saves/{save_id}")
def update_save(save_id: str, req: UpdateSaveRequest):
    """Update an existing saved config."""
    db = get_db()
    try:
        existing = db.execute(
            "SELECT id FROM prompt_studio_saves WHERE id = ?", (save_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(404, "保存记录不存在")

        if req.name is not None:
            db.execute(
                "UPDATE prompt_studio_saves SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (req.name, save_id),
            )
        if req.configs is not None:
            db.execute(
                "UPDATE prompt_studio_saves SET configs = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (json.dumps(req.configs, ensure_ascii=False), save_id),
            )
        db.commit()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"更新失败: {str(e)}")
    finally:
        db.close()


@router.delete("/saves/{save_id}")
def delete_save(save_id: str):
    """Delete a saved config."""
    db = get_db()
    try:
        existing = db.execute(
            "SELECT id FROM prompt_studio_saves WHERE id = ?", (save_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(404, "保存记录不存在")
        db.execute("DELETE FROM prompt_studio_saves WHERE id = ?", (save_id,))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


# ── Apply (atomic replace) ──


def _new_id() -> str:
    return f"gen-{uuid.uuid4().hex[:12]}"


@router.post("/apply")
def apply_prompts(req: ApplyRequest, request: Request):
    """Apply generated configs to a target workspace.

    原子替换：先校验整套配置满足结构契约，再在同一事务内清空该工作区的
    4 张配置表并写入新配置。id 一律由服务端生成（LLM 提供的固定 id 曾因
    单列主键在跨工作区应用时被 INSERT OR IGNORE 静默丢弃）。
    普通管理员只能应用到自己创建的工作区（created_by 为空归超管）。
    """
    _validate_configs(req.configs)

    db = get_db()
    try:
        ws = db.execute(
            "SELECT id, created_by FROM workspaces WHERE id = ?", (req.workspace_id,)).fetchone()
        if not ws:
            raise HTTPException(404, "工作区不存在")

        user = getattr(request.state, "user", None) or {}
        if user.get("username") != "admin" and (ws["created_by"] or "") != user.get("sub", ""):
            raise HTTPException(403, "只能应用到自己创建的工作区")

        wid = req.workspace_id
        for table in CONFIG_TABLES:
            db.execute(f"DELETE FROM {table} WHERE workspace_id = ?", (wid,))

        applied = {}

        col_rows = req.configs["column_configs"]
        for r in col_rows:
            column_id, sort_order, forced_label = SLOT_META[r["slot"]]
            db.execute(
                "INSERT INTO column_configs (id, workspace_id, column_id, label, prompt, skill, "
                "has_template, template_path, rules, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (_new_id(), wid, column_id, forced_label or r["label"],
                 r.get("prompt") or "", r.get("skill") or "",
                 1 if r.get("has_template") else 0, r.get("template_path"),
                 r.get("rules") or "{}", sort_order))
        applied["column_configs"] = len(col_rows)

        for i, r in enumerate(req.configs["speech_configs"]):
            db.execute(
                "INSERT INTO speech_configs (id, workspace_id, label, prompt, skill, sort_order) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (_new_id(), wid, r["label"], r.get("prompt") or "", r.get("skill") or "", i))
        applied["speech_configs"] = len(req.configs["speech_configs"])

        for i, r in enumerate(req.configs["tts_configs"]):
            db.execute(
                "INSERT INTO tts_configs (id, workspace_id, label, prompt, skill, sort_order) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (_new_id(), wid, r["label"], r.get("prompt") or "", r.get("skill") or "", i))
        applied["tts_configs"] = len(req.configs["tts_configs"])

        core_rows = req.configs.get("core_prompt_configs", [])
        for i, r in enumerate(core_rows):
            db.execute(
                "INSERT INTO core_prompt_configs (id, workspace_id, prompt_key, category, label, "
                "content, stage, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (_new_id(), wid, r["prompt_key"], r.get("category") or "",
                 r.get("label") or r["prompt_key"], r.get("content") or "",
                 r.get("stage") or "", i))
        applied["core_prompt_configs"] = len(core_rows)

        db.commit()
        return {"ok": True, "applied": applied}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"应用配置失败: {str(e)}")
    finally:
        db.close()
