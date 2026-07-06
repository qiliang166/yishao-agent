"""Prompt & config management routes — prompts, column-configs, speech-configs, tts-configs, core-prompt-configs."""
import os
import json
import logging
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel

logger = logging.getLogger("prompts_router")
from database import get_db
from services.prompt_service import (
    list_prompts, get_prompt, create_prompt, update_prompt, delete_prompt,
    rollback_version, diff_versions, set_default, export_prompts, import_prompts,
)

router = APIRouter(prefix="/api")


# ── Pydantic models ──

class PromptCreate(BaseModel):
    name: str
    category: str
    system_prompt: str = ""
    skill_template: str = ""


class PromptUpdate(BaseModel):
    name: str = None
    category: str = None
    system_prompt: str = None
    skill_template: str = None
    change_note: str = ""


class PromptImport(BaseModel):
    data: list


# ── Prompts ──

@router.get("/prompts/export")
def api_export_prompts():
    return {"prompts": export_prompts()}


@router.post("/prompts/import")
def api_import_prompts(req: PromptImport):
    return import_prompts(req.data)


@router.get("/prompts")
def api_list_prompts(category: str = None):
    return {"prompts": list_prompts(category)}


@router.post("/prompts")
def api_create_prompt(req: PromptCreate):
    prompt = create_prompt(req.name, req.category, req.system_prompt, req.skill_template)
    return prompt


@router.get("/prompts/{prompt_id}")
def api_get_prompt(prompt_id: str):
    prompt = get_prompt(prompt_id)
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return prompt


@router.put("/prompts/{prompt_id}")
def api_update_prompt(prompt_id: str, req: PromptUpdate):
    prompt = update_prompt(
        prompt_id, req.name, req.category,
        req.system_prompt, req.skill_template, req.change_note)
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return prompt


@router.delete("/prompts/{prompt_id}")
def api_delete_prompt(prompt_id: str):
    delete_prompt(prompt_id)
    return {"ok": True}


@router.get("/prompts/{prompt_id}/versions")
def api_list_versions(prompt_id: str):
    prompt = get_prompt(prompt_id)
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return {"versions": prompt["versions"]}


@router.post("/prompts/{prompt_id}/rollback")
def api_rollback(prompt_id: str, req: dict):
    prompt = rollback_version(prompt_id, req["version"])
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt or version not found")
    return prompt


@router.post("/prompts/{prompt_id}/diff")
def api_diff(prompt_id: str, req: dict):
    result = diff_versions(prompt_id, req["version_a"], req["version_b"])
    if not result:
        raise HTTPException(status_code=404, detail="Versions not found")
    return result


@router.post("/prompts/{prompt_id}/set-default")
def api_set_default(prompt_id: str):
    set_default(prompt_id)
    return {"ok": True}


# ── Column Configs ──

def _build_prompt_from_rules(rules: dict) -> str:
    """从 rules JSON 自动生成 prompt（约束条文版本）"""
    dr = rules.get("design_rules", {})
    pr = rules.get("page_rhythm", {})
    imgr = rules.get("image_rules", {})
    comp = rules.get("components", {})
    chk = rules.get("checklist", {})
    dps = rules.get("design_principles", [])

    parts = []

    role = rules.get("_role_override", "")
    if not role:
        role = "根据栏目配置中定义的提示词角色要求执行。"
    parts.append(role)

    parts.append("\n## 约束规则")

    cd = dr.get("color_discipline", "")
    if cd:
        parts.append(f"- 配色纪律：{cd}")

    fd = dr.get("font_discipline", "")
    if fd:
        parts.append(f"- 字体纪律：{fd}")

    ld = dr.get("layout_discipline", "")
    if ld:
        parts.append(f"- 版式纪律：{ld}")

    if pr.get("sequence"):
        parts.append(f"- 版式顺序：{' → '.join(pr['sequence'])}。{pr.get('alternation_rule', '')}")

    img_types = imgr.get("types", [])
    if img_types:
        parts.append(f"- 配图：{imgr.get('placement', '每页最多1张')}。类型：{'/'.join(t.get('name','') for t in img_types)}")

    callouts = comp.get("callouts", [])
    if callouts:
        parts.append(f"- 标注组件：{'/'.join(c.get('name','') for c in callouts)}")
    stats = comp.get("stats", [])
    if stats:
        parts.append(f"- 数据组件：{'/'.join(s.get('name','') for s in stats)}")

    p0 = chk.get("p0_must_pass", [])
    if p0:
        p0_items = "; ".join(item.get("item","") for item in p0[:4])
        parts.append(f"- 硬约束（P0）：{p0_items}")

    if dps:
        dp_text = "；".join(f'{d.get("rule","")}' for d in dps[:4])
        parts.append(f"- 设计原则：{dp_text}")
        if len(dps) > 4:
            parts[-1] += "等"

    p2 = chk.get("p2_suggested", [])
    for item in p2:
        if "页数" in item.get("item", ""):
            parts.append(f"- {item['item']}")

    parts.append("\n直接输出PPT内容，严格按下方SKILL模板结构。")
    return "\n".join(parts)


@router.get("/column-configs")
def list_column_configs(workspace_id: str = None):
    db = get_db()
    try:
        if workspace_id:
            rows = db.execute(
                "SELECT * FROM column_configs WHERE workspace_id = ? ORDER BY sort_order",
                (workspace_id,)).fetchall()
        else:
            rows = db.execute(
                "SELECT * FROM column_configs WHERE workspace_id IS NULL ORDER BY sort_order").fetchall()
        return {"configs": [dict(r) for r in rows]}
    finally:
        db.close()


@router.put("/column-configs/{config_id}")
def update_column_config(config_id: str, req: dict):
    db = get_db()
    try:
        existing = db.execute("SELECT id, column_id, workspace_id FROM column_configs WHERE id = ?", (config_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Config not found")
        if 'prompt' in req:
            db.execute("UPDATE column_configs SET prompt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (req['prompt'], config_id))
        if 'skill' in req:
            db.execute("UPDATE column_configs SET skill = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (req['skill'], config_id))
        if 'rules' in req:
            rules_val = req['rules']
            if isinstance(rules_val, str):
                try:
                    json.loads(rules_val)
                except json.JSONDecodeError:
                    raise HTTPException(400, "rules 不是合法的 JSON 格式")
            else:
                rules_val = json.dumps(rules_val, ensure_ascii=False)
            db.execute("UPDATE column_configs SET rules = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (rules_val, config_id))
        db.commit()

        # Sync prompt/skill/rules to all project_items in the same workspace
        col_id = existing["column_id"]
        ws_id = existing["workspace_id"]
        if ws_id and any(k in req for k in ("prompt", "skill", "rules")):
            keys = [k for k in ('prompt','skill','rules') if k in req]
            print(f"[SYNC] workspace={ws_id} col={col_id} fields={keys}", flush=True)
            projects = db.execute("SELECT id FROM projects WHERE workspace_id = ?", (ws_id,)).fetchall()
            print(f"[SYNC] found {len(projects)} projects to sync", flush=True)
            for p in projects:
                item_id = f"pi-{p['id']}-{col_id}"
                item = db.execute("SELECT id FROM project_items WHERE id = ?", (item_id,)).fetchone()
                if not item:
                    print(f"[SYNC] skip {item_id} - not found", flush=True)
                    continue
                if 'prompt' in req:
                    db.execute("UPDATE project_items SET prompt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                               (req['prompt'], item_id))
                if 'skill' in req:
                    db.execute("UPDATE project_items SET skill = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                               (req['skill'], item_id))
                if 'rules' in req:
                    db.execute("UPDATE project_items SET config_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                               (req['rules'], item_id))
                print(f"[SYNC] updated {item_id}", flush=True)
            db.commit()
            print(f"[SYNC] committed {len(projects)} projects sync", flush=True)
        elif not ws_id:
            print(f"[SYNC] skipped - no workspace_id (seed config, no sync needed)", flush=True)
        else:
            print(f"[SYNC] skipped - no synced fields in request keys={list(req.keys())}", flush=True)

        row = db.execute("SELECT * FROM column_configs WHERE id = ?", (config_id,)).fetchone()
        return dict(row)
    finally:
        db.close()


@router.post("/column-configs/{config_id}/upload-template")
async def upload_column_template(config_id: str, file: UploadFile = File(...)):
    db = get_db()
    try:
        existing = db.execute("SELECT id, has_template FROM column_configs WHERE id = ?", (config_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Config not found")
        if not existing["has_template"]:
            raise HTTPException(400, "此栏目不支持模板上传")
        tmpl_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "templates")
        os.makedirs(tmpl_dir, exist_ok=True)
        safe_filename = os.path.basename(file.filename)
        if safe_filename != file.filename or safe_filename.startswith('.') or '/' in file.filename or '\\' in file.filename:
            raise HTTPException(400, "Invalid filename")
        name = f"{config_id}_{safe_filename}"
        path = os.path.join(tmpl_dir, name)
        real_path = os.path.realpath(path)
        real_tmpl = os.path.realpath(tmpl_dir)
        if not real_path.startswith(real_tmpl + os.sep):
            raise HTTPException(400, "Invalid path")
        content = await file.read()
        with open(path, "wb") as f:
            f.write(content)
        db.execute("UPDATE column_configs SET template_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (path, config_id))
        db.commit()
        if file.filename.endswith(('.txt', '.md', '.docx')):
            try:
                text = content.decode('utf-8')
            except Exception:
                text = content.decode('gbk', errors='ignore')
            return {"ok": True, "path": path, "content": text}
        return {"ok": True, "path": path}
    finally:
        db.close()


# ── Speech Configs ──

@router.get("/speech-configs")
def list_speech_configs(workspace_id: str = None):
    db = get_db()
    try:
        if workspace_id:
            rows = db.execute(
                "SELECT * FROM speech_configs WHERE workspace_id = ? ORDER BY sort_order",
                (workspace_id,)).fetchall()
        else:
            rows = db.execute(
                "SELECT * FROM speech_configs WHERE workspace_id IS NULL ORDER BY sort_order").fetchall()
        return {"configs": [dict(r) for r in rows]}
    finally:
        db.close()


@router.put("/speech-configs/{config_id}")
def update_speech_config(config_id: str, req: dict):
    db = get_db()
    try:
        existing = db.execute("SELECT id FROM speech_configs WHERE id = ?", (config_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Config not found")
        if 'prompt' in req:
            db.execute("UPDATE speech_configs SET prompt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (req['prompt'], config_id))
        if 'skill' in req:
            db.execute("UPDATE speech_configs SET skill = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (req['skill'], config_id))
        db.commit()
        row = db.execute("SELECT * FROM speech_configs WHERE id = ?", (config_id,)).fetchone()
        return dict(row)
    finally:
        db.close()


# ── TTS Configs ──

@router.get("/tts-configs")
def list_tts_configs(workspace_id: str = None):
    db = get_db()
    try:
        if workspace_id:
            rows = db.execute(
                "SELECT * FROM tts_configs WHERE workspace_id = ? ORDER BY sort_order",
                (workspace_id,)).fetchall()
        else:
            rows = db.execute(
                "SELECT * FROM tts_configs WHERE workspace_id IS NULL ORDER BY sort_order").fetchall()
        return {"configs": [dict(r) for r in rows]}
    finally:
        db.close()


@router.put("/tts-configs/{config_id}")
def update_tts_config(config_id: str, req: dict):
    db = get_db()
    try:
        existing = db.execute("SELECT id FROM tts_configs WHERE id = ?", (config_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Config not found")
        if 'prompt' in req:
            db.execute("UPDATE tts_configs SET prompt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (req['prompt'], config_id))
        if 'skill' in req:
            db.execute("UPDATE tts_configs SET skill = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (req['skill'], config_id))
        db.commit()
        row = db.execute("SELECT * FROM tts_configs WHERE id = ?", (config_id,)).fetchone()
        return dict(row)
    finally:
        db.close()


# ── Core Prompt Configs ──

@router.get("/core-prompt-configs")
def list_core_prompt_configs(workspace_id: str = None):
    db = get_db()
    try:
        if workspace_id:
            rows = db.execute(
                "SELECT * FROM core_prompt_configs WHERE workspace_id = ? ORDER BY sort_order",
                (workspace_id,)).fetchall()
        else:
            rows = db.execute(
                "SELECT * FROM core_prompt_configs WHERE workspace_id IS NULL ORDER BY sort_order").fetchall()
        return {"configs": [dict(r) for r in rows]}
    finally:
        db.close()


@router.put("/core-prompt-configs/{config_id}")
def update_core_prompt_config(config_id: str, req: dict):
    db = get_db()
    try:
        existing = db.execute("SELECT id FROM core_prompt_configs WHERE id = ?", (config_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Config not found")
        if 'content' in req:
            db.execute("UPDATE core_prompt_configs SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                       (req['content'], config_id))
        if 'label' in req:
            db.execute("UPDATE core_prompt_configs SET label = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                       (req['label'], config_id))
        if 'stage' in req:
            db.execute("UPDATE core_prompt_configs SET stage = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                       (req['stage'], config_id))
        db.commit()
        row = db.execute("SELECT * FROM core_prompt_configs WHERE id = ?", (config_id,)).fetchone()
        return dict(row)
    finally:
        db.close()
