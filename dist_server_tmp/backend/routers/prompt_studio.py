"""Prompt Studio — LLM generates all configs from industry topic + purpose description."""

import json
import os
import uuid
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from database import get_db
from services.llm_service import generate

router = APIRouter(prefix="/api/prompt-studio")

# ── Template directory ──

_BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_TEMPLATES_DIR = os.path.join(_BASE_DIR, "resources", "prompts", "prompt_studio")

VALID_TEMPLATES = {"system_prompt", "user_message"}


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


# ── Config table names for reference loading ──

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


@router.post("/generate")
async def generate_prompts(req: GenerateRequest):
    """Generate all prompt configs for a given industry topic + purpose."""
    db = get_db()
    try:
        ref_ws = req.reference_workspace_id.strip() if req.reference_workspace_id else ""
        ref_configs = _serialize_configs(db, ref_ws if ref_ws else None)
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
                raise HTTPException(400, f"指定的 LLM 提供商不存在或未启用")
        else:
            provider_row = db2.execute(
                "SELECT id, name, models FROM llm_providers WHERE is_enabled = 1 ORDER BY created_at LIMIT 1"
            ).fetchone()
            if not provider_row:
                raise HTTPException(400, "没有可用的 LLM 提供商，请先在全局设置中配置")
            provider_id = provider_row["id"]
            models = json.loads(provider_row["models"]) if isinstance(provider_row["models"], str) else (provider_row["models"] or [])
            if not models:
                raise HTTPException(400, "LLM 提供商没有配置模型")
            model = models[0]
    finally:
        db2.close()

    system_prompt = _build_system_prompt(ref_configs, req.industry_topic, req.purpose_description)
    user_message = _build_user_message(ref_configs, req.industry_topic, req.purpose_description)

    try:
        raw = await generate(
            provider_id=provider_id,
            model=model,
            system_prompt=system_prompt,
            user_message=user_message,
            temperature=0.7,
            json_mode=True,
            max_tokens=65536,
        )
    except Exception as e:
        raise HTTPException(500, f"LLM 调用失败: {str(e)}")

    configs = _parse_llm_response(raw)
    _validate_configs(configs)

    return {"configs": configs, "provider": {"id": provider_id, "model": model}}


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

    import re
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    raise HTTPException(500, f"LLM 返回的内容不是有效的 JSON: {raw[:300]}")


def _validate_configs(configs: dict):
    """Validate the generated configs have the expected structure."""
    expected = {
        "column_configs": (5, 5),
        "speech_configs": (2, 5),
        "tts_configs": (2, 5),
        "core_prompt_configs": (25, 40),
    }

    for table, (min_count, max_count) in expected.items():
        rows = configs.get(table, [])
        if not isinstance(rows, list):
            raise HTTPException(500, f"configs.{table} 必须是数组")
        if len(rows) < min_count:
            raise HTTPException(500, f"configs.{table} 至少需要 {min_count} 条，实际生成 {len(rows)} 条")
        if len(rows) > max_count:
            raise HTTPException(500, f"configs.{table} 最多 {max_count} 条，实际生成 {len(rows)} 条")


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


@router.post("/apply")
def apply_prompts(req: ApplyRequest):
    """Apply generated configs to a target workspace."""
    db = get_db()
    try:
        ws = db.execute("SELECT id FROM workspaces WHERE id = ?", (req.workspace_id,)).fetchone()
        if not ws:
            raise HTTPException(404, "工作区不存在")

        configs = req.configs
        applied = {}

        for table in CONFIG_TABLES:
            rows = configs.get(table, [])
            if not rows:
                continue
            count = _apply_table_configs(db, table, rows, req.workspace_id)
            applied[table] = count

        db.commit()
        return {"ok": True, "applied": applied}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"应用配置失败: {str(e)}")
    finally:
        db.close()


def _apply_table_configs(db, table: str, rows: list, workspace_id: str) -> int:
    """Insert or update config rows for a specific table and workspace."""
    count = 0
    for row in rows:
        original_id = row.get("id", f"gen-{uuid.uuid4().hex[:12]}")

        existing = db.execute(
            f"SELECT id FROM {table} WHERE id = ? AND workspace_id = ?",
            (original_id, workspace_id),
        ).fetchone()

        if existing:
            set_parts = []
            values = []
            for key, val in row.items():
                if key in ("id", "created_at", "updated_at"):
                    continue
                if key == "workspace_id":
                    continue
                set_parts.append(f"{key} = ?")
                values.append(val)
            if set_parts:
                values.append(original_id)
                values.append(workspace_id)
                db.execute(
                    f"UPDATE {table} SET {', '.join(set_parts)}, updated_at = CURRENT_TIMESTAMP "
                    f"WHERE id = ? AND workspace_id = ?",
                    values,
                )
        else:
            cols = ["id", "workspace_id"]
            vals = [original_id, workspace_id]
            for key, val in row.items():
                if key in ("id", "created_at", "updated_at"):
                    continue
                if key == "workspace_id":
                    continue
                cols.append(key)
                vals.append(val)
            placeholders = ", ".join(["?"] * len(cols))
            col_names = ", ".join(cols)
            db.execute(
                f"INSERT OR IGNORE INTO {table} ({col_names}) VALUES ({placeholders})",
                vals,
            )
        count += 1
    return count
