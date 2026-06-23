import os
import shutil
import uuid
import hashlib
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from database import init_db, get_db
from models import ProjectCreate, ProjectUpdate, StepResultSave, LLMGenerateRequest, LLMRefineRequest, SynthesizeRequest
from typing import Optional
import json
from services.llm_service import test_connection, generate, generate_stream, refine, get_provider
from services.prompt_service import (
    list_prompts, get_prompt, create_prompt, update_prompt, delete_prompt,
    rollback_version, diff_versions, set_default, export_prompts, import_prompts,
)

init_db()

app = FastAPI(title="一勺笔录(SOP)智能体")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
AUDIO_DIR = os.path.join(BASE_DIR, "data", "audio")
os.makedirs(AUDIO_DIR, exist_ok=True)
EXPORT_DIR = os.path.join(BASE_DIR, "data", "exports")
os.makedirs(EXPORT_DIR, exist_ok=True)
LOGO_DIR = os.path.join(BASE_DIR, "data", "logos")
os.makedirs(LOGO_DIR, exist_ok=True)

import re


def _get_global_save_path() -> str:
    """Read global save_path from settings, or return default."""
    db = get_db()
    try:
        row = db.execute("SELECT value FROM settings WHERE key = 'save_path'").fetchone()
        if row and row["value"]:
            return row["value"]
    finally:
        db.close()
    return os.path.join(BASE_DIR, "data", "output")


def _sanitize_folder_name(name: str) -> str:
    """Remove characters invalid for Windows folder names."""
    return re.sub(r'[<>:"/\\|?*]', '_', name).strip().rstrip('.') or "unnamed"


def _get_setting(key: str) -> str:
    """Read a single setting value from the database."""
    db = get_db()
    try:
        row = db.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else ""
    finally:
        db.close()


SALT = "yishao-agent-salt-2026"


def _hash_password(password: str) -> str:
    return hashlib.sha256((SALT + password).encode("utf-8")).hexdigest()


def _get_project(project_id: str):
    """Return project record dict or None."""
    db = get_db()
    try:
        row = db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        return dict(row) if row else None
    finally:
        db.close()


def resolve_project_storage(project_id: str, auto_create: bool = True) -> str:
    """Return the effective storage directory for a project."""
    db = get_db()
    try:
        proj = db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        if not proj:
            raise FileNotFoundError(f"Project {project_id} not found")

        if proj["storage_path"]:
            path = os.path.normpath(proj["storage_path"])
            if auto_create:
                os.makedirs(path, exist_ok=True)
            return path

        base = _get_global_save_path()
        folder = _sanitize_folder_name(proj["name"])
        path = os.path.normpath(os.path.join(base, folder))

        if auto_create:
            os.makedirs(path, exist_ok=True)
            db.execute(
                "UPDATE projects SET storage_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (path, project_id))
            db.commit()

        return path
    finally:
        db.close()

# ── Health check ──

@app.get("/api/health")
def health():
    return {"status": "ok", "app": "一勺笔录(SOP)智能体"}


# ── Projects ──

@app.get("/api/projects")
def list_projects(page: int = 1, page_size: int = 20):
    db = get_db()
    try:
        total = db.execute("SELECT COUNT(*) FROM projects").fetchone()[0]
        offset = (page - 1) * page_size
        rows = db.execute(
            "SELECT * FROM projects ORDER BY updated_at DESC LIMIT ? OFFSET ?",
            (page_size, offset)
        ).fetchall()
        return {"projects": [dict(r) for r in rows], "total": total, "page": page, "page_size": page_size}
    finally:
        db.close()


@app.post("/api/projects")
def create_project(req: ProjectCreate):
    pid = uuid.uuid4().hex[:12]
    db = get_db()
    try:
        # Compute default storage path
        base = _get_global_save_path()
        folder = _sanitize_folder_name(req.name)
        storage_path = os.path.normpath(req.storage_path or os.path.join(base, folder))
        os.makedirs(storage_path, exist_ok=True)

        db.execute(
            "INSERT INTO projects (id, name, source_type, storage_path) VALUES (?, ?, ?, ?)",
            (pid, req.name, req.source_type, storage_path))
        db.commit()
        row = db.execute("SELECT * FROM projects WHERE id = ?", (pid,)).fetchone()
        return dict(row)
    finally:
        db.close()


@app.get("/api/projects/{project_id}/videos")
def api_project_videos(project_id: str):
    """List video files in the project's storage folder."""
    path = resolve_project_storage(project_id, auto_create=False)
    videos = []
    if os.path.exists(path):
        for f in os.listdir(path):
            if f.lower().endswith(('.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv')):
                full = os.path.join(path, f)
                videos.append({"filename": f, "path": full, "size": os.path.getsize(full)})
    return {"videos": videos, "storage_path": path}


@app.get("/api/projects/{project_id}")
def get_project(project_id: str):
    db = get_db()
    try:
        row = db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Project not found")
        return dict(row)
    finally:
        db.close()


@app.put("/api/projects/{project_id}")
def update_project(project_id: str, req: ProjectUpdate):
    db = get_db()
    try:
        existing = db.execute("SELECT id FROM projects WHERE id = ?", (project_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Project not found")

        if req.name is not None:
            db.execute("UPDATE projects SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (req.name, project_id))
        if req.status is not None:
            db.execute("UPDATE projects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (req.status, project_id))
        if req.storage_path is not None:
            if req.storage_path.strip():
                os.makedirs(req.storage_path, exist_ok=True)
            db.execute("UPDATE projects SET storage_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (os.path.normpath(req.storage_path) if req.storage_path.strip() else req.storage_path, project_id))
        if req.is_locked is not None:
            db.execute("UPDATE projects SET is_locked = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (req.is_locked, project_id))
        db.commit()
        row = db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        return dict(row)
    finally:
        db.close()


@app.post("/api/projects/{project_id}/save-file")
def api_save_file_to_project(project_id: str, req: dict):
    """Save text content to a file in the project's storage directory."""
    filename = req.get("filename", "document.txt")
    content = req.get("content", "")
    path = resolve_project_storage(project_id)
    os.makedirs(path, exist_ok=True)
    filepath = os.path.join(path, filename)
    # Avoid overwriting: append (1), (2), etc. if file exists
    if os.path.exists(filepath):
        base, ext = os.path.splitext(filename)
        n = 1
        while os.path.exists(os.path.join(path, f"{base}({n}){ext}")):
            n += 1
        filename = f"{base}({n}){ext}"
        filepath = os.path.join(path, filename)
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
    return {"ok": True, "path": filepath, "filename": filename}


def _delete_project_files(project_id: str, db):
    """Remove project storage directory and step results."""
    db.execute("DELETE FROM step_results WHERE project_id = ?", (project_id,))
    try:
        path = resolve_project_storage(project_id, auto_create=False)
        if os.path.exists(path):
            shutil.rmtree(path)
    except Exception:
        pass


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: str):
    db = get_db()
    try:
        row = db.execute("SELECT is_locked FROM projects WHERE id = ?", (project_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Project not found")
        if row["is_locked"]:
            raise HTTPException(403, "项目已锁定，无法删除")
        _delete_project_files(project_id, db)
        db.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.post("/api/projects/batch-delete")
def batch_delete_projects(req: dict):
    ids = req.get("ids", [])
    if not ids:
        raise HTTPException(400, "ids required")
    db = get_db()
    try:
        placeholders = ",".join(["?"] * len(ids))
        locked_rows = db.execute(
            f"SELECT id, name FROM projects WHERE id IN ({placeholders}) AND is_locked = 1", ids
        ).fetchall()
        locked_ids = {r["id"] for r in locked_rows}
        unlocked = [pid for pid in ids if pid not in locked_ids]
        if not unlocked:
            names = ", ".join(r["name"] for r in locked_rows)
            raise HTTPException(403, f"所选项目均已锁定，无法删除: {names}")
        for pid in unlocked:
            _delete_project_files(pid, db)
        db.execute(
            f"DELETE FROM projects WHERE id IN ({','.join(['?'] * len(unlocked))})", unlocked
        )
        db.commit()
        skipped = len(ids) - len(unlocked)
        msg = f"已删除 {len(unlocked)} 个项目"
        if skipped > 0:
            names = ", ".join(r["name"] for r in locked_rows)
            msg += f"，{skipped} 个已锁定跳过: {names}"
        return {"ok": True, "deleted": len(unlocked), "skipped": skipped, "message": msg}
    finally:
        db.close()


# ── Step Results ──

@app.get("/api/projects/{project_id}/steps")
def get_steps(project_id: str):
    db = get_db()
    try:
        rows = db.execute(
            "SELECT * FROM step_results WHERE project_id = ? ORDER BY step_name", (project_id,)
        ).fetchall()
        return {"steps": [dict(r) for r in rows]}
    finally:
        db.close()


@app.put("/api/projects/{project_id}/steps/{step_name}")
def save_step(project_id: str, step_name: str, req: StepResultSave):
    db = get_db()
    try:
        existing = db.execute(
            "SELECT id FROM step_results WHERE project_id = ? AND step_name = ?",
            (project_id, step_name)).fetchone()
        if existing:
            db.execute(
                "UPDATE step_results SET content = ?, content_type = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                (req.content, req.content_type, existing["id"]))
        else:
            db.execute(
                "INSERT INTO step_results (project_id, step_name, content, content_type) VALUES (?, ?, ?, ?)",
                (project_id, step_name, req.content, req.content_type))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


# ── LLM Providers ──

from pydantic import BaseModel

class LLMProviderCreate(BaseModel):
    name: str
    api_key: str = ""
    base_url: str = "https://api.deepseek.com/v1"
    models: list[str] = []


@app.get("/api/llm/providers")
def list_llm_providers():
    db = get_db()
    try:
        rows = db.execute("SELECT * FROM llm_providers ORDER BY created_at").fetchall()
        providers = []
        for r in rows:
            p = dict(r)
            models_str = p.get("models", "[]")
            p["models"] = json.loads(models_str) if models_str else []
            if p.get("api_key"):
                key = p["api_key"]
                p["api_key"] = key[:8] + "***" if len(key) > 8 else "***"
            providers.append(p)
        return {"providers": providers}
    finally:
        db.close()


@app.post("/api/llm/providers")
def create_llm_provider(req: LLMProviderCreate):
    pid = uuid.uuid4().hex[:8]
    db = get_db()
    try:
        db.execute(
            "INSERT INTO llm_providers (id, name, api_key, base_url, models) VALUES (?, ?, ?, ?, ?)",
            (pid, req.name, req.api_key, req.base_url, json.dumps(req.models, ensure_ascii=False)))
        db.commit()
        return {"id": pid, "name": req.name}
    finally:
        db.close()


@app.put("/api/llm/providers/{provider_id}")
def update_llm_provider(provider_id: str, req: LLMProviderCreate):
    db = get_db()
    try:
        db.execute(
            "UPDATE llm_providers SET name=?, api_key=?, base_url=?, models=? WHERE id=?",
            (req.name, req.api_key, req.base_url, json.dumps(req.models, ensure_ascii=False), provider_id))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.delete("/api/llm/providers/{provider_id}")
def delete_llm_provider(provider_id: str):
    db = get_db()
    try:
        db.execute("DELETE FROM llm_providers WHERE id = ?", (provider_id,))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.post("/api/llm/providers/{provider_id}/test")
async def test_provider(provider_id: str):
    db = get_db()
    try:
        row = db.execute("SELECT * FROM llm_providers WHERE id = ?", (provider_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Provider not found")
        result = await test_connection(row["api_key"], row["base_url"])
        return result
    finally:
        db.close()


# ── TTS Providers ──

class TTSProviderCreate(BaseModel):
    name: str
    api_key: str = ""
    base_url: str = "https://dashscope.aliyuncs.com/api/v1"
    models: list[str] = []
    is_default: int = 0


class VoiceCreate(BaseModel):
    name: str
    provider_id: str
    voice_id: str
    description: str = ""
    is_default: int = 0


class VoiceUpdate(BaseModel):
    name: Optional[str] = None
    provider_id: Optional[str] = None
    voice_id: Optional[str] = None
    description: Optional[str] = None
    is_default: Optional[int] = None


@app.get("/api/tts/providers")
def list_tts_providers():
    db = get_db()
    try:
        rows = db.execute("SELECT * FROM tts_providers ORDER BY created_at").fetchall()
        providers = []
        for r in rows:
            p = dict(r)
            models_str = p.get("models", "[]")
            p["models"] = json.loads(models_str) if models_str else []
            if p.get("api_key"):
                key = p["api_key"]
                p["api_key"] = key[:8] + "***" if len(key) > 8 else "***"
            providers.append(p)
        return {"providers": providers}
    finally:
        db.close()


@app.post("/api/tts/providers")
def create_tts_provider(req: TTSProviderCreate):
    pid = uuid.uuid4().hex[:8]
    db = get_db()
    try:
        if req.is_default:
            db.execute("UPDATE tts_providers SET is_default = 0")
        db.execute(
            "INSERT INTO tts_providers (id, name, api_key, base_url, models, is_default) VALUES (?, ?, ?, ?, ?, ?)",
            (pid, req.name, req.api_key, req.base_url, json.dumps(req.models, ensure_ascii=False), req.is_default))
        db.commit()
        return {"id": pid, "name": req.name}
    finally:
        db.close()


@app.put("/api/tts/providers/{provider_id}")
def update_tts_provider(provider_id: str, req: TTSProviderCreate):
    db = get_db()
    try:
        if req.is_default:
            db.execute("UPDATE tts_providers SET is_default = 0")
        db.execute(
            "UPDATE tts_providers SET name=?, api_key=?, base_url=?, models=?, is_default=? WHERE id=?",
            (req.name, req.api_key, req.base_url, json.dumps(req.models, ensure_ascii=False), req.is_default, provider_id))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.delete("/api/tts/providers/{provider_id}")
def delete_tts_provider(provider_id: str):
    db = get_db()
    try:
        db.execute("DELETE FROM tts_providers WHERE id = ?", (provider_id,))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.post("/api/tts/providers/{provider_id}/test")
async def test_tts_provider(provider_id: str):
    import httpx
    db = get_db()
    try:
        row = db.execute("SELECT * FROM tts_providers WHERE id = ?", (provider_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Provider not found")
        # Test by calling the models list or a minimal synthesis check
        base_url = row["base_url"].rstrip("/")
        test_url = f"{base_url}/services/audio/tts/SpeechSynthesizer"
        payload = {
            "model": "cosyvoice-v3-flash",
            "input": {"text": "测试", "voice": "longanyang", "format": "mp3"},
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                test_url,
                headers={"Authorization": f"Bearer {row['api_key']}", "Content-Type": "application/json"},
                json=payload,
            )
        if resp.status_code in (200, 201):
            return {"ok": True, "status": resp.status_code}
        return {"ok": False, "error": f"HTTP {resp.status_code}: {resp.text[:200]}"}
    except httpx.HTTPError as e:
        return {"ok": False, "error": str(e)}
    finally:
        db.close()


# ── ASR Providers ──

class ASRProviderCreate(BaseModel):
    name: str
    api_key: str = ""
    base_url: str = "https://dashscope.aliyuncs.com"
    models: list[str] = []
    is_default: int = 0


@app.get("/api/asr/providers")
def list_asr_providers():
    db = get_db()
    try:
        rows = db.execute("SELECT * FROM asr_providers ORDER BY created_at").fetchall()
        providers = []
        for r in rows:
            p = dict(r)
            models_str = p.get("models", "[]")
            p["models"] = json.loads(models_str) if models_str else []
            if p.get("api_key"):
                key = p["api_key"]
                p["api_key"] = key[:8] + "***" if len(key) > 8 else "***"
            providers.append(p)
        return {"providers": providers}
    finally:
        db.close()


@app.post("/api/asr/providers")
def create_asr_provider(req: ASRProviderCreate):
    pid = uuid.uuid4().hex[:8]
    db = get_db()
    try:
        if req.is_default:
            db.execute("UPDATE asr_providers SET is_default = 0")
        db.execute(
            "INSERT INTO asr_providers (id, name, api_key, base_url, models, is_default) VALUES (?, ?, ?, ?, ?, ?)",
            (pid, req.name, req.api_key, req.base_url, json.dumps(req.models, ensure_ascii=False), req.is_default))
        db.commit()
        return {"id": pid, "name": req.name}
    finally:
        db.close()


@app.put("/api/asr/providers/{provider_id}")
def update_asr_provider(provider_id: str, req: ASRProviderCreate):
    db = get_db()
    try:
        if req.is_default:
            db.execute("UPDATE asr_providers SET is_default = 0")
        db.execute(
            "UPDATE asr_providers SET name=?, api_key=?, base_url=?, models=?, is_default=? WHERE id=?",
            (req.name, req.api_key, req.base_url, json.dumps(req.models, ensure_ascii=False), req.is_default, provider_id))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.delete("/api/asr/providers/{provider_id}")
def delete_asr_provider(provider_id: str):
    db = get_db()
    try:
        db.execute("DELETE FROM asr_providers WHERE id = ?", (provider_id,))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.post("/api/asr/providers/{provider_id}/test")
async def test_asr_provider(provider_id: str):
    import httpx
    db = get_db()
    try:
        row = db.execute("SELECT * FROM asr_providers WHERE id = ?", (provider_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Provider not found")
        base_url = row["base_url"].rstrip("/")
        # Test by listing available models or hitting a get endpoint
        test_url = f"{base_url}/compatible-mode/v1/models"
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                test_url,
                headers={"Authorization": f"Bearer {row['api_key']}"},
            )
        if resp.status_code in (200, 201):
            return {"ok": True, "status": resp.status_code}
        # Try list files as lightweight connectivity check
        test_url2 = f"{base_url}/api/v1/files"
        async with httpx.AsyncClient(timeout=30) as client:
            resp2 = await client.get(
                test_url2,
                headers={"Authorization": f"Bearer {row['api_key']}"},
            )
        if resp2.status_code in (200, 401, 403):
            return {"ok": True, "status": resp2.status_code}
        return {"ok": False, "error": f"HTTP {resp2.status_code}: {resp2.text[:200]}"}
    except httpx.HTTPError as e:
        return {"ok": False, "error": str(e)}
    finally:
        db.close()


# ── Voice Library ──

@app.get("/api/voices")
def list_voices(provider_id: str = ""):
    db = get_db()
    try:
        if provider_id:
            rows = db.execute(
                "SELECT * FROM voices WHERE provider_id = ? ORDER BY is_default DESC, created_at",
                (provider_id,)).fetchall()
        else:
            rows = db.execute("SELECT * FROM voices ORDER BY is_default DESC, created_at").fetchall()
        return {"voices": [dict(r) for r in rows]}
    finally:
        db.close()


@app.post("/api/voices")
def create_voice(data: VoiceCreate):
    import uuid
    db = get_db()
    try:
        vid = uuid.uuid4().hex[:10]
        if data.is_default:
            db.execute("UPDATE voices SET is_default = 0")
        db.execute(
            "INSERT INTO voices (id, name, provider_id, voice_id, description, is_default) VALUES (?,?,?,?,?,?)",
            (vid, data.name, data.provider_id, data.voice_id, data.description, data.is_default),
        )
        db.commit()
        return {"id": vid, "ok": True}
    finally:
        db.close()


@app.put("/api/voices/{voice_id}")
def update_voice(voice_id: str, data: VoiceUpdate):
    db = get_db()
    try:
        existing = db.execute("SELECT * FROM voices WHERE id = ?", (voice_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Voice not found")
        updates = {}
        if data.name is not None:
            updates["name"] = data.name
        if data.provider_id is not None:
            updates["provider_id"] = data.provider_id
        if data.voice_id is not None:
            updates["voice_id"] = data.voice_id
        if data.description is not None:
            updates["description"] = data.description
        if data.is_default is not None:
            updates["is_default"] = data.is_default
            if data.is_default:
                db.execute("UPDATE voices SET is_default = 0")
        if updates:
            set_clause = ", ".join(f"{k} = ?" for k in updates)
            values = list(updates.values()) + [voice_id]
            db.execute(f"UPDATE voices SET {set_clause} WHERE id = ?", values)
            db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.delete("/api/voices/{voice_id}")
def delete_voice(voice_id: str):
    db = get_db()
    try:
        db.execute("DELETE FROM voices WHERE id = ?", (voice_id,))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.post("/api/voices/{voice_id}/preview")
async def preview_voice(voice_id: str):
    """Generate a short preview audio for a voice"""
    import httpx
    db = get_db()
    try:
        voice = db.execute(
            "SELECT v.*, p.api_key, p.base_url FROM voices v LEFT JOIN tts_providers p ON v.provider_id = p.id WHERE v.id = ?",
            (voice_id,)).fetchone()
        if not voice:
            raise HTTPException(status_code=404, detail="Voice not found")
        if not voice["api_key"]:
            raise HTTPException(status_code=400, detail="关联的 TTS 提供商未配置 API Key")

        base_url = voice["base_url"].rstrip("/")
        tts_url = f"{base_url}/services/audio/tts/SpeechSynthesizer"
        payload = {
            "model": "cosyvoice-v3-flash",
            "input": {"text": "你好，这是一条音色预览测试。", "voice": voice["voice_id"], "format": "mp3"},
        }
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                tts_url,
                headers={"Authorization": f"Bearer {voice['api_key']}", "Content-Type": "application/json"},
                json=payload,
            )
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail=f"预览生成失败: {resp.text[:200]}")
        result = resp.json()
        audio_url = result.get("output", {}).get("audio", {}).get("url", "")
        if not audio_url:
            raise HTTPException(status_code=400, detail="未获取到音频URL")
        return {"audio_url": audio_url}
    finally:
        db.close()


# ── LLM Calls ──

@app.post("/api/llm/generate")
async def llm_generate(req: LLMGenerateRequest):
    try:
        result = await generate(req.provider_id, req.model, req.system_prompt, req.user_message, req.temperature)
        return {"content": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/llm/generate-stream")
def llm_generate_stream(req: LLMGenerateRequest):
    """Streaming LLM generate via SSE. Sync generator — Starlette offloads to threadpool."""
    def event_stream():
        try:
            db = get_db()
            row = db.execute(
                "SELECT * FROM llm_providers WHERE id = ? AND is_enabled = 1",
                (req.provider_id,)
            ).fetchone()
            db.close()
            if not row:
                yield f"data: {json.dumps({'error': 'Provider not found'})}\n\n"
                return
            provider = dict(row)

            from openai import OpenAI
            client = OpenAI(
                api_key=provider["api_key"],
                base_url=provider["base_url"],
                timeout=120.0,
            )
            messages = []
            if req.system_prompt:
                messages.append({"role": "system", "content": req.system_prompt})
            messages.append({"role": "user", "content": req.user_message})

            stream = client.chat.completions.create(
                model=req.model, messages=messages,
                temperature=req.temperature, stream=True,
            )
            for chunk in stream:
                delta = chunk.choices[0].delta
                if delta.content:
                    yield f"data: {json.dumps({'content': delta.content}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/llm/refine")
async def llm_refine(req: LLMRefineRequest):
    try:
        result = await refine(req.provider_id, req.model, req.instruction, req.selected_text, req.full_context)
        return {"content": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Prompts ──

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


@app.get("/api/prompts/export")
def api_export_prompts():
    return {"prompts": export_prompts()}


@app.post("/api/prompts/import")
def api_import_prompts(req: PromptImport):
    return import_prompts(req.data)


@app.get("/api/prompts")
def api_list_prompts(category: str = None):
    return {"prompts": list_prompts(category)}


@app.post("/api/prompts")
def api_create_prompt(req: PromptCreate):
    prompt = create_prompt(req.name, req.category, req.system_prompt, req.skill_template)
    return prompt


@app.get("/api/prompts/{prompt_id}")
def api_get_prompt(prompt_id: str):
    prompt = get_prompt(prompt_id)
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return prompt


@app.put("/api/prompts/{prompt_id}")
def api_update_prompt(prompt_id: str, req: PromptUpdate):
    prompt = update_prompt(
        prompt_id, req.name, req.category,
        req.system_prompt, req.skill_template, req.change_note)
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return prompt


@app.delete("/api/prompts/{prompt_id}")
def api_delete_prompt(prompt_id: str):
    delete_prompt(prompt_id)
    return {"ok": True}


@app.get("/api/prompts/{prompt_id}/versions")
def api_list_versions(prompt_id: str):
    prompt = get_prompt(prompt_id)
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")
    return {"versions": prompt["versions"]}


@app.post("/api/prompts/{prompt_id}/rollback")
def api_rollback(prompt_id: str, req: dict):
    prompt = rollback_version(prompt_id, req["version"])
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt or version not found")
    return prompt


@app.post("/api/prompts/{prompt_id}/diff")
def api_diff(prompt_id: str, req: dict):
    result = diff_versions(prompt_id, req["version_a"], req["version_b"])
    if not result:
        raise HTTPException(status_code=404, detail="Versions not found")
    return result


@app.post("/api/prompts/{prompt_id}/set-default")
def api_set_default(prompt_id: str):
    set_default(prompt_id)
    return {"ok": True}


# ── Templates ──

class TemplateCreate(BaseModel):
    name: str
    type: str  # "ppt" or "sop"
    file_path: str = ""
    prompt: str = ""
    skill: str = ""
    linked_skill_id: str = ""
    branding_config: str = "{}"


@app.get("/api/templates")
def list_templates(type: str = None):
    db = get_db()
    try:
        if type:
            rows = db.execute("SELECT * FROM templates WHERE type = ? ORDER BY created_at DESC", (type,)).fetchall()
        else:
            rows = db.execute("SELECT * FROM templates ORDER BY type, created_at DESC").fetchall()
        return {"templates": [dict(r) for r in rows]}
    finally:
        db.close()


@app.post("/api/templates")
def create_template(req: TemplateCreate):
    tid = uuid.uuid4().hex[:8]
    db = get_db()
    try:
        db.execute(
            "INSERT INTO templates (id, name, type, file_path, prompt, skill, linked_skill_id, branding_config) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (tid, req.name, req.type, req.file_path, req.prompt, req.skill, req.linked_skill_id, req.branding_config))
        db.commit()
        return {"id": tid, "name": req.name}
    finally:
        db.close()


@app.put("/api/templates/{template_id}")
def update_template(template_id: str, req: TemplateCreate):
    db = get_db()
    try:
        db.execute(
            "UPDATE templates SET name=?, type=?, file_path=?, prompt=?, skill=?, linked_skill_id=?, branding_config=? WHERE id=?",
            (req.name, req.type, req.file_path, req.prompt, req.skill, req.linked_skill_id, req.branding_config, template_id))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.delete("/api/templates/{template_id}")
def delete_template(template_id: str):
    db = get_db()
    try:
        db.execute("DELETE FROM templates WHERE id = ?", (template_id,))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.post("/api/templates/{template_id}/set-default")
def set_template_default(template_id: str):
    db = get_db()
    try:
        row = db.execute("SELECT * FROM templates WHERE id = ?", (template_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Template not found")
        db.execute("UPDATE templates SET is_default = 0 WHERE type = ?", (row["type"],))
        db.execute("UPDATE templates SET is_default = 1 WHERE id = ?", (template_id,))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.post("/api/templates/{template_id}/upload")
async def upload_template_file(template_id: str, file: UploadFile = File(...)):
    db = get_db()
    try:
        existing = db.execute("SELECT id FROM templates WHERE id = ?", (template_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Template not found")
        if not file.filename or not file.filename.endswith('.pptx'):
            raise HTTPException(400, "请上传 .pptx 格式的模板文件")
        tmpl_dir = os.path.join(BASE_DIR, "data", "templates")
        os.makedirs(tmpl_dir, exist_ok=True)
        safe_name = f"{template_id}_{file.filename}"
        file_path = os.path.join(tmpl_dir, safe_name)
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
        db.execute("UPDATE templates SET file_path = ? WHERE id = ?", (file_path, template_id))
        db.commit()
        return {"ok": True, "file_path": file_path, "filename": file.filename}
    finally:
        db.close()


@app.get("/api/templates/for-stage/{stage_type}")
def list_templates_for_stage(stage_type: str):
    type_map = {"sop": "sop", "daoPpt": "ppt", "yanxiPpt": "ppt"}
    db_type = type_map.get(stage_type, "ppt")
    db = get_db()
    try:
        rows = db.execute(
            "SELECT id, name, type, file_path, prompt, skill, branding_config, is_default FROM templates WHERE type = ? ORDER BY is_default DESC, created_at ASC",
            (db_type,)).fetchall()
        items = []
        for r in rows:
            rdict = dict(r)
            items.append({
                "id": rdict["id"],
                "name": rdict["name"],
                "type": rdict["type"],
                "prompt": rdict.get("prompt") or "",
                "skill": rdict.get("skill") or "",
                "isDefault": rdict.get("is_default") == 1,
                "hasFile": bool(rdict.get("file_path") and os.path.exists(rdict.get("file_path") or "")),
            })
        return {"templates": items}
    finally:
        db.close()


# ── Template Analysis ──

def extract_pptx_structure(file_path: str) -> dict:
    from pptx import Presentation
    prs = Presentation(file_path)
    slides = []
    all_fonts = set()
    all_colors = set()

    for i, slide in enumerate(prs.slides):
        info = {"index": i + 1, "layout": slide.slide_layout.name, "placeholders": [], "shapes": []}
        for shape in slide.placeholders:
            font_info = {}
            if shape.has_text_frame:
                for para in shape.text_frame.paragraphs:
                    for run in para.runs:
                        f = run.font
                        if f.name:
                            font_info["name"] = f.name
                            all_fonts.add(f.name)
                        if f.size:
                            font_info["size_pt"] = round(f.size / 12700, 1)
                        font_info["bold"] = f.bold
                        try:
                            if f.color and f.color.rgb:
                                all_colors.add(str(f.color.rgb))
                        except Exception:
                            pass
            info["placeholders"].append({
                "idx": shape.placeholder_format.idx,
                "type": str(shape.placeholder_format.type),
                "name": shape.name,
                "text_preview": (shape.text or "")[:100],
                "font": font_info
            })
        for shape in slide.shapes:
            if not shape.is_placeholder:
                shape_info = {
                    "type": str(shape.shape_type),
                    "name": shape.name,
                    "text_preview": (shape.text or "")[:100] if shape.has_text_frame else ""
                }
                if shape.has_text_frame:
                    for para in shape.text_frame.paragraphs:
                        for run in para.runs:
                            f = run.font
                            if f.name:
                                all_fonts.add(f.name)
                            try:
                                if f.color and f.color.rgb:
                                    all_colors.add(str(f.color.rgb))
                            except Exception:
                                pass
                info["shapes"].append(shape_info)
        slides.append(info)

    master_layouts = []
    for master in prs.slide_masters:
        for layout in master.slide_layouts:
            master_layouts.append(layout.name)

    return {
        "slide_count": len(slides),
        "slide_width": prs.slide_width,
        "slide_height": prs.slide_height,
        "slide_layouts": [lyt.name for lyt in prs.slide_layouts],
        "master_layouts": master_layouts,
        "fonts_used": sorted(list(all_fonts))[:30],
        "colors_used": sorted(list(all_colors))[:30],
        "slides": slides
    }


@app.post("/api/templates/{template_id}/analyze")
async def analyze_template(template_id: str, stage_type: str = "daoPpt"):
    from services.llm_service import generate as llm_generate, get_provider
    db = get_db()
    try:
        tmpl = db.execute("SELECT * FROM templates WHERE id = ?", (template_id,)).fetchone()
        if not tmpl:
            raise HTTPException(404, "模板不存在")
        if not tmpl["file_path"] or not os.path.exists(tmpl["file_path"]):
            raise HTTPException(400, "请先上传 .pptx 模板文件")

        structure = extract_pptx_structure(tmpl["file_path"])

        stage_to_column = {"daoPpt": "col4", "yanxiPpt": "col5"}
        column_id = stage_to_column.get(stage_type, "col4")
        config = db.execute("SELECT rules FROM column_configs WHERE column_id = ?", (column_id,)).fetchone()
        if not config or not config["rules"] or config["rules"] == "{}":
            raise HTTPException(400, f"栏目 {column_id} 未配置规则，请先在栏目配置中设置 PPT SKILL 规则")

        rules = json.loads(config["rules"])
        analysis_prompt = rules.get("analysis_rules", "")
        if not analysis_prompt:
            raise HTTPException(400, "栏目规则中缺少 analysis_rules")

        # Get default LLM provider
        provider_row = db.execute("SELECT id, models FROM llm_providers WHERE is_enabled = 1 ORDER BY rowid LIMIT 1").fetchone()
        if not provider_row:
            raise HTTPException(400, "没有可用的 LLM 服务商")

        models = json.loads(provider_row["models"] or "[]")
        model = models[0] if models else "gpt-4o"

        system_prompt = f"""你是一位专业的 PPT 模板分析专家。你的任务是根据给定的栏目约束规则，分析上传的 PPTX 模板文件结构，提取模板的实际样式信息，并生成该模板专属的完整 prompt 和 SKILL。

## 栏目约束规则（必须遵守的分析框架）
{json.dumps(rules, ensure_ascii=False, indent=2)}

## 重要指示
1. 版式类型必须在 layout_types 范围内
2. 从提取的 PPTX 结构中获取实际配色（colors_used）和字体（fonts_used），不预设任何配色方案
3. 按 design_rules 中的约束条文审视模板的视觉样式，确保符合设计纪律
4. prompt 应完整包含：角色设定、从模板提取的实际样式描述（颜色/字体/版式/尺寸）、内容规范引用、版式选择规则、约束规则引用、输出格式要求
5. skill 应为完整的 Markdown 模板，包含 content_spec 规定的完整结构
6. 遵守 design_principles 中的所有铁律
7. 遵守 page_rhythm 中的页面节奏规则
8. 从模板中提取的实际样式信息必须如实写入 prompt，不编造不预设"""

        user_message = f"请分析以下 PPTX 文件结构（含实际提取的颜色和字体），基于约束规则生成该模板专属的 prompt 和 SKILL：\n\n```json\n{json.dumps(structure, ensure_ascii=False, indent=2)}\n```\n\n请直接输出 JSON，格式为：{{\"prompt\": \"...\", \"skill\": \"...\"}}"

        ai_response = await llm_generate(provider_row["id"], model, system_prompt, user_message, temperature=0.3)

        # Parse AI response
        ai_response = ai_response.strip()
        if ai_response.startswith("```"):
            lines = ai_response.split("\n")
            ai_response = "\n".join(lines[1:]) if lines[0].startswith("```") else ai_response
            if ai_response.endswith("```"):
                ai_response = ai_response[:ai_response.rfind("```")].strip()

        result = json.loads(ai_response)
        prompt = result.get("prompt", "")
        skill = result.get("skill", "")

        if not prompt or not skill:
            raise HTTPException(400, "AI 未能生成完整的 prompt 和 skill，请重试")

        db.execute("UPDATE templates SET prompt = ?, skill = ? WHERE id = ?", (prompt, skill, template_id))
        db.commit()

        return {"ok": True, "prompt": prompt, "skill": skill}
    except json.JSONDecodeError:
        raise HTTPException(500, "AI 返回格式异常，请重试")
    finally:
        db.close()


# ── Video ──

from services.video_service import download_video, get_progress


class VideoDownloadRequest(BaseModel):
    url: str
    cookies_path: Optional[str] = None
    project_id: Optional[str] = None
    asr_model: Optional[str] = "fun-asr"
    asr_provider_id: Optional[str] = None


COOKIES_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "cookies")
os.makedirs(COOKIES_DIR, exist_ok=True)

@app.post("/api/video/upload-cookies")
async def api_upload_cookies(file: UploadFile = File(...)):
    if not file.filename or not file.filename.endswith('.txt'):
        raise HTTPException(400, "请上传 .txt 格式的 cookies 文件")
    file_id = uuid.uuid4().hex[:8]
    file_path = os.path.join(COOKIES_DIR, f"{file_id}.txt")
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)
    return {"cookies_path": file_path, "filename": file.filename}


@app.post("/api/video/download")
def api_download_video(req: VideoDownloadRequest):
    result = download_video(req.url, req.cookies_path, req.project_id, req.asr_model or "fun-asr", req.asr_provider_id)
    return result


@app.get("/api/video/progress/{task_id}")
def api_video_progress(task_id: str):
    data = get_progress(task_id)
    svc_status = data.get("status", "")
    # Normalize status codes for frontend
    if svc_status == "done":
        fe_status = "completed"
    elif svc_status == "error":
        fe_status = "failed"
    else:
        fe_status = svc_status
    return {
        "task_id": task_id,
        "status": fe_status,
        "percent": data.get("progress", 0),
        "text": data.get("merged_text", "") or data.get("asr_text", "") or data.get("subtitle_text", "") or data.get("message", ""),
        "subtitle_text": data.get("subtitle_text", ""),
        "asr_text": data.get("asr_text", ""),
        "merged_text": data.get("merged_text", ""),
        "video_path": data.get("video_path", ""),
        "task_dir": data.get("task_dir", ""),
        "error": data.get("message", "") if svc_status == "error" else None,
    }


@app.get("/api/video/file")
def api_video_file(path: str = ""):
    """Serve a downloaded video file. Allows paths under VIDEO_DIR, data_dir, or global save_path."""
    import os as _os
    base = _os.path.dirname(_os.path.abspath(__file__))
    video_dir = _os.path.normcase(_os.path.normpath(_os.path.join(base, "data", "videos")))
    data_dir = _os.path.normcase(_os.path.normpath(_os.path.join(base, "data")))
    save_root = _os.path.normcase(_os.path.normpath(_get_global_save_path()))
    full = _os.path.normcase(_os.path.normpath(_os.path.abspath(path)))
    if not (full.startswith(video_dir) or full.startswith(data_dir + _os.sep) or full.startswith(save_root)):
        raise HTTPException(403, f"Access denied: {full}")
    if not _os.path.exists(full):
        raise HTTPException(404, f"File not found: {full}")
    return FileResponse(full)


@app.post("/api/video/extract-subtitles")
def api_extract_subtitles(req: dict):
    """Manually extract subtitles from a previously downloaded video task."""
    task_id = req["task_id"]
    project_id = req.get("project_id")
    progress = get_progress(task_id)
    if progress.get("status") != "done":
        return {"status": "error", "message": "视频尚未下载完成"}
    subtitle_text = progress.get("subtitle_text", "")
    # Auto-save as step1 if project_id provided
    if project_id and subtitle_text:
        db = get_db()
        try:
            existing = db.execute(
                "SELECT id FROM step_results WHERE project_id = ? AND step_name = ?",
                (project_id, "step1")).fetchone()
            if existing:
                db.execute(
                    "UPDATE step_results SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    (subtitle_text, existing["id"]))
            else:
                db.execute(
                    "INSERT INTO step_results (project_id, step_name, content) VALUES (?, ?, ?)",
                    (project_id, "step1", subtitle_text))
            db.commit()
        finally:
            db.close()
    return {"subtitle_text": subtitle_text}


# ── PPT Generation ──

from services.ppt_service import generate_ppt

class PPTGenerateRequest(BaseModel):
    content: str
    template_id: str = ""
    branding: dict = None
    project_id: Optional[str] = None


@app.post("/api/ppt/generate")
def api_generate_ppt(req: PPTGenerateRequest):
    try:
        output_dir = None
        project_name = ""
        if req.project_id:
            output_dir = resolve_project_storage(req.project_id)
            proj = _get_project(req.project_id)
            if proj:
                project_name = proj["name"]
        filepath = generate_ppt(req.content, req.template_id, req.branding, output_dir)
        filename = os.path.basename(filepath)
        params = []
        if req.project_id:
            params.append(f"project_id={req.project_id}")
        if project_name:
            safe_name = "".join(c for c in project_name if c.isalnum() or c in "._- ()（）").strip()
            params.append(f"name={safe_name}_PPT.pptx")
        download_url = f"/api/download/{filename}"
        if params:
            download_url += "?" + "&".join(params)
        return {"filename": filename, "download_url": download_url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── SOP Export ──

from services.export_service import export_sop

class SOPExportRequest(BaseModel):
    content: str
    branding: dict = None
    project_id: Optional[str] = None


@app.post("/api/export/sop")
def api_export_sop(req: SOPExportRequest):
    try:
        output_dir = None
        project_name = ""
        if req.project_id:
            output_dir = resolve_project_storage(req.project_id)
            proj = _get_project(req.project_id)
            if proj:
                project_name = proj["name"]
        filepath = export_sop(req.content, req.branding, output_dir)
        filename = os.path.basename(filepath)
        params = []
        if req.project_id:
            params.append(f"project_id={req.project_id}")
        if project_name:
            safe_name = "".join(c for c in project_name if c.isalnum() or c in "._- ()（）").strip()
            params.append(f"name={safe_name}_SOP.docx")
        download_url = f"/api/download/{filename}"
        if params:
            download_url += "?" + "&".join(params)
        return {"filename": filename, "download_url": download_url}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── File Download ──

@app.get("/api/download/{filename}")
def download_file(filename: str, project_id: str = None, name: str = None):
    download_name = name or filename
    if project_id:
        try:
            proj_dir = resolve_project_storage(project_id, auto_create=False)
            filepath = os.path.join(proj_dir, filename)
            if os.path.exists(filepath):
                return FileResponse(filepath, filename=download_name)
        except Exception:
            pass

    filepath = os.path.join(EXPORT_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(filepath, filename=download_name)


# ── TTS ──

@app.post("/api/tts/synthesize")
async def api_tts_synthesize(req: SynthesizeRequest):
    import httpx
    try:
        # Resolve TTS API key and base_url from provider or fallback to settings
        api_key = ""
        base_url = "https://dashscope.aliyuncs.com/api/v1"
        if req.provider_id:
            tts_db = get_db()
            try:
                provider = tts_db.execute(
                    "SELECT * FROM tts_providers WHERE id = ? AND is_enabled = 1",
                    (req.provider_id,)).fetchone()
                if provider:
                    api_key = provider["api_key"]
                    base_url = provider["base_url"]
            finally:
                tts_db.close()
        if not api_key:
            api_key = _get_setting("tts_api_key") or os.getenv("DASHSCOPE_API_KEY", "")
        if not api_key:
            raise HTTPException(status_code=400, detail="请先在项目配置中设置 TTS API Key")
        tts_url = base_url.rstrip("/") + "/services/audio/tts/SpeechSynthesizer"

        payload = {
            "model": req.model,
            "input": {
                "text": req.text,
                "voice": req.voice_id or "longanyang",
                "format": "mp3",
                "volume": req.volume,
                "rate": req.speed,
            },
        }
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                tts_url,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=payload,
            )
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail=f"TTS 失败: {resp.text[:200]}")
        result = resp.json()
        audio_url = result.get("output", {}).get("audio", {}).get("url", "")
        if not audio_url:
            raise HTTPException(status_code=400, detail="未获取到音频URL")

        # Download and save
        async with httpx.AsyncClient(timeout=60) as client:
            dl = await client.get(audio_url)

        output_dir = AUDIO_DIR
        if req.project_id:
            output_dir = resolve_project_storage(req.project_id)
        os.makedirs(output_dir, exist_ok=True)

        audio_name = f"tts_{os.urandom(4).hex()}.mp3"
        audio_path = os.path.join(output_dir, audio_name)
        with open(audio_path, "wb") as f:
            f.write(dl.content)

        serve_url = f"/api/audio/{audio_name}"
        params = []
        if req.project_id:
            params.append(f"project_id={req.project_id}")
            proj = _get_project(req.project_id)
            if proj:
                safe_name = "".join(c for c in proj["name"] if c.isalnum() or c in "._- ()（）").strip()
                params.append(f"name={safe_name}_音频.mp3")
        if params:
            serve_url += "?" + "&".join(params)
        return {"audio_url": serve_url, "filename": audio_name}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/audio/{filename}")
def serve_audio(filename: str, project_id: str = None, name: str = None):
    download_name = name or filename
    if project_id:
        try:
            proj_dir = resolve_project_storage(project_id, auto_create=False)
            filepath = os.path.join(proj_dir, filename)
            if os.path.exists(filepath):
                return FileResponse(filepath, media_type="audio/mpeg", filename=download_name)
        except Exception:
            pass

    filepath = os.path.join(AUDIO_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Audio not found")
    return FileResponse(filepath, media_type="audio/mpeg")


# ── Logo Upload ──

@app.post("/api/upload/logo")
async def upload_logo(file: UploadFile = File(...)):
    """Upload a logo image file. Returns the filename for later retrieval."""
    import uuid as _uuid
    ext = os.path.splitext(file.filename or "logo.png")[1] or ".png"
    if ext.lower() not in (".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico"):
        raise HTTPException(status_code=400, detail="不支持的图片格式，请上传 PNG/JPG/GIF/SVG/WebP/ICO")
    filename = f"logo_{_uuid.uuid4().hex[:8]}{ext}"
    filepath = os.path.join(LOGO_DIR, filename)
    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="文件大小不能超过 5MB")
    with open(filepath, "wb") as f:
        f.write(content)
    return {"filename": filename, "url": f"/api/logos/{filename}"}


@app.get("/api/logos/{filename}")
def serve_logo(filename: str):
    filepath = os.path.join(LOGO_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Logo not found")
    media_map = {
        ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp",
        ".ico": "image/x-icon",
    }
    ext = os.path.splitext(filename)[1].lower()
    return FileResponse(filepath, media_type=media_map.get(ext, "application/octet-stream"))


# ── Settings ──

@app.get("/api/settings")
def get_settings():
    db = get_db()
    try:
        rows = db.execute("SELECT key, value FROM settings").fetchall()
        return {"settings": {r["key"]: r["value"] for r in rows}}
    finally:
        db.close()


@app.put("/api/settings")
def update_settings(req: dict):
    db = get_db()
    try:
        for key, value in req.items():
            existing = db.execute("SELECT key FROM settings WHERE key = ?", (key,)).fetchone()
            if existing:
                db.execute("UPDATE settings SET value = ? WHERE key = ?", (value, key))
            else:
                db.execute("INSERT INTO settings (key, value) VALUES (?, ?)", (key, value))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.post("/api/verify-password")
def verify_password(req: dict):
    plain = req.get("password", "")
    if not plain:
        raise HTTPException(status_code=400, detail="密码不能为空")
    stored_hash = _get_setting("admin_password")
    if not stored_hash:
        raise HTTPException(status_code=400, detail="未设置密码")
    if _hash_password(plain) != stored_hash:
        raise HTTPException(status_code=403, detail="密码错误")
    return {"ok": True}


@app.get("/api/browse-folder")
def browse_folder():
    """Open native folder picker dialog and return selected path."""
    import tkinter.filedialog, tkinter
    try:
        root = tkinter.Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        path = tkinter.filedialog.askdirectory(title="选择默认保存路径")
        root.destroy()
        return {"path": path if path else ""}
    except Exception:
        return {"path": ""}


VERSION = "1.0.0"
UPDATE_CHECK_URL = "https://raw.githubusercontent.com/qiliang166/yishao-agent/master/version.json"


@app.get("/api/version")
def api_version():
    return {"version": VERSION, "app": "一勺笔录(SOP)智能体"}


@app.get("/api/check-update")
async def api_check_update():
    import httpx
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(UPDATE_CHECK_URL)
        if resp.status_code == 200:
            data = resp.json()
            latest = data.get("version", VERSION)
            return {
                "current": VERSION,
                "latest": latest,
                "has_update": _version_greater(latest, VERSION),
                "release_url": data.get("release_url", ""),
                "release_notes": data.get("release_notes", ""),
            }
    except Exception:
        pass
    return {
        "current": VERSION,
        "latest": VERSION,
        "has_update": False,
        "release_url": "",
        "error": "无法连接更新服务器",
    }


@app.post("/api/download-update")
async def api_download_update(req: dict):
    """Download the latest release .exe from GitHub."""
    import httpx
    import subprocess
    import tempfile

    download_url = req.get("download_url", "")
    if not download_url:
        # Fetch the latest release info from GitHub API to get the .exe URL
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.get(
                    "https://api.github.com/repos/qiliang166/yishao-agent/releases/latest",
                    headers={"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"},
                )
            if resp.status_code != 200:
                raise HTTPException(status_code=400, detail="无法获取最新版本信息")
            release = resp.json()
            assets = release.get("assets", [])
            exe_asset = next((a for a in assets if a["name"].endswith(".exe")), None)
            if not exe_asset:
                raise HTTPException(status_code=400, detail="未找到安装包")
            download_url = exe_asset["browser_download_url"]
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"获取下载地址失败: {str(e)}")

    # Download to temp directory
    tmpdir = tempfile.gettempdir()
    local_path = os.path.join(tmpdir, "yishao-agent-setup.exe")
    try:
        async with httpx.AsyncClient(timeout=600, follow_redirects=True) as client:
            async with client.stream("GET", download_url) as resp:
                if resp.status_code != 200:
                    raise HTTPException(status_code=400, detail=f"下载失败 HTTP {resp.status_code}")
                total = int(resp.headers.get("content-length", 0))
                downloaded = 0
                with open(local_path, "wb") as f:
                    async for chunk in resp.aiter_bytes(1024 * 1024):
                        f.write(chunk)
                        downloaded += len(chunk)
        # Launch the installer
        subprocess.Popen([local_path], shell=True)
        return {"status": "installing", "path": local_path}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"下载失败: {str(e)}")


def _version_greater(a: str, b: str) -> bool:
    """Compare two semver strings. Returns True if a > b."""
    try:
        pa = [int(x) for x in a.split(".")]
        pb = [int(x) for x in b.split(".")]
        for i in range(max(len(pa), len(pb))):
            va = pa[i] if i < len(pa) else 0
            vb = pb[i] if i < len(pb) else 0
            if va > vb:
                return True
            if va < vb:
                return False
        return False
    except Exception:
        return False


from pydantic import BaseModel

class OpenFolderRequest(BaseModel):
    path: str

@app.post("/api/open-folder")
def open_folder(req: OpenFolderRequest):
    p = req.path.strip()
    if not p:
        raise HTTPException(400, "path required")
    if not os.path.exists(p):
        raise HTTPException(404, f"path not found: {p}")
    try:
        os.startfile(p)
        return {"ok": True}
    except Exception as e:
        raise HTTPException(500, str(e))

# ── Column Configs ──

@app.get("/api/column-configs")
def list_column_configs():
    db = get_db()
    try:
        rows = db.execute("SELECT * FROM column_configs ORDER BY sort_order").fetchall()
        return {"configs": [dict(r) for r in rows]}
    finally:
        db.close()


def _build_prompt_from_rules(rules: dict) -> str:
    """从 rules JSON 自动生成 prompt（约束条文版本）"""
    dr = rules.get("design_rules", {})
    lts = rules.get("layout_types", [])
    comp = rules.get("components", {})
    imgr = rules.get("image_rules", {})
    chk = rules.get("checklist", {})
    pr = rules.get("page_rhythm", {})
    dps = rules.get("design_principles", [])

    parts = []

    # Role
    parts.append("你是国家级烹饪大师、食品科学家兼PPT内容设计专家。请根据提供的文案，生成一份专业PPT。")

    # Constraints section
    parts.append("\n## 约束规则")

    # Color discipline (from constraint text)
    cd = dr.get("color_discipline", "")
    if cd:
        parts.append(f"- 配色纪律：{cd}")

    # Font discipline
    fd = dr.get("font_discipline", "")
    if fd:
        parts.append(f"- 字体纪律：{fd}")

    # Layout discipline
    ld = dr.get("layout_discipline", "")
    if ld:
        parts.append(f"- 版式纪律：{ld}")

    # Layout sequence from page_rhythm
    if pr.get("sequence"):
        parts.append(f"- 版式顺序：{' → '.join(pr['sequence'])}。{pr.get('alternation_rule', '')}")

    # Image rules
    img_types = imgr.get("types", [])
    if img_types:
        parts.append(f"- 配图：{imgr.get('placement', '每页最多1张')}。类型：{'/'.join(t.get('name','') for t in img_types)}")

    # Components
    callouts = comp.get("callouts", [])
    if callouts:
        parts.append(f"- 标注组件：{'/'.join(c.get('name','') for c in callouts)}")
    stats = comp.get("stats", [])
    if stats:
        parts.append(f"- 数据组件：{'/'.join(s.get('name','') for s in stats)}")

    # P0 checklist
    p0 = chk.get("p0_must_pass", [])
    if p0:
        p0_items = "; ".join(item.get("item","") for item in p0[:4])
        parts.append(f"- 硬约束（P0）：{p0_items}")

    # Design principles
    if dps:
        dp_text = "；".join(f'{d.get("rule","")}' for d in dps[:4])
        parts.append(f"- 设计原则：{dp_text}")
        if len(dps) > 4:
            parts[-1] += "等"

    # Page count
    p2 = chk.get("p2_suggested", [])
    for item in p2:
        if "页数" in item.get("item", ""):
            parts.append(f"- {item['item']}")

    parts.append("\n直接输出PPT内容，严格按下方SKILL模板结构。")
    return "\n".join(parts)


def _build_skill_from_rules(rules: dict) -> str:
    """从 rules JSON 自动生成 skill（即 content_spec）"""
    return rules.get("content_spec", "")


@app.put("/api/column-configs/{config_id}")
def update_column_config(config_id: str, req: dict):
    db = get_db()
    try:
        existing = db.execute("SELECT id, column_id FROM column_configs WHERE id = ?", (config_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Config not found")
        if 'prompt' in req:
            db.execute("UPDATE column_configs SET prompt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (req['prompt'], config_id))
        if 'skill' in req:
            db.execute("UPDATE column_configs SET skill = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (req['skill'], config_id))
        if 'rules' in req:
            db.execute("UPDATE column_configs SET rules = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (req['rules'], config_id))
            # Auto-regenerate prompt + skill from rules (only for PPT columns)
            col_id = existing["column_id"]
            if col_id in ("col4", "col5"):
                try:
                    rules = json.loads(req['rules'])
                    if rules and rules != {}:
                        new_prompt = _build_prompt_from_rules(rules)
                        new_skill = _build_skill_from_rules(rules)
                        db.execute("UPDATE column_configs SET prompt = ?, skill = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                                   (new_prompt, new_skill, config_id))
                except (json.JSONDecodeError, Exception):
                    pass  # Keep existing prompt/skill if rules parse fails
        db.commit()
        row = db.execute("SELECT * FROM column_configs WHERE id = ?", (config_id,)).fetchone()
        return dict(row)
    finally:
        db.close()


@app.post("/api/column-configs/{config_id}/upload-template")
async def upload_column_template(config_id: str, file: UploadFile = File(...)):
    db = get_db()
    try:
        existing = db.execute("SELECT id, has_template FROM column_configs WHERE id = ?", (config_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Config not found")
        if not existing["has_template"]:
            raise HTTPException(400, "此栏目不支持模板上传")
        # Save template file
        tmpl_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "templates")
        os.makedirs(tmpl_dir, exist_ok=True)
        name = f"{config_id}_{file.filename}"
        path = os.path.join(tmpl_dir, name)
        content = await file.read()
        with open(path, "wb") as f:
            f.write(content)
        db.execute("UPDATE column_configs SET template_path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (path, config_id))
        db.commit()
        # If it's a text file, read and return for AI analysis
        if file.filename.endswith(('.txt', '.md', '.docx')):
            try:
                text = content.decode('utf-8')
            except Exception:
                text = content.decode('gbk', errors='ignore')
            return {"ok": True, "path": path, "content": text}
        return {"ok": True, "path": path}
    finally:
        db.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8765)
