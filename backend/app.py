import os
import uuid
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from database import init_db, get_db
from models import ProjectCreate, ProjectUpdate, StepResultSave, LLMGenerateRequest, LLMRefineRequest, SynthesizeRequest
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

# ── Health check ──

@app.get("/api/health")
def health():
    return {"status": "ok", "app": "一勺笔录(SOP)智能体"}


# ── Projects ──

@app.get("/api/projects")
def list_projects():
    db = get_db()
    try:
        rows = db.execute("SELECT * FROM projects ORDER BY updated_at DESC").fetchall()
        return {"projects": [dict(r) for r in rows]}
    finally:
        db.close()


@app.post("/api/projects")
def create_project(req: ProjectCreate):
    pid = uuid.uuid4().hex[:12]
    db = get_db()
    try:
        db.execute(
            "INSERT INTO projects (id, name, source_type) VALUES (?, ?, ?)",
            (pid, req.name, req.source_type))
        db.commit()
        row = db.execute("SELECT * FROM projects WHERE id = ?", (pid,)).fetchone()
        return dict(row)
    finally:
        db.close()


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
        # Check project exists first
        existing = db.execute("SELECT id FROM projects WHERE id = ?", (project_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Project not found")

        if req.name is not None:
            db.execute("UPDATE projects SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (req.name, project_id))
        if req.status is not None:
            db.execute("UPDATE projects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (req.status, project_id))
        db.commit()
        row = db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        return dict(row)
    finally:
        db.close()


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: str):
    db = get_db()
    try:
        db.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        db.commit()
        return {"ok": True}
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
            "INSERT INTO templates (id, name, type, file_path, linked_skill_id, branding_config) VALUES (?, ?, ?, ?, ?, ?)",
            (tid, req.name, req.type, req.file_path, req.linked_skill_id, req.branding_config))
        db.commit()
        return {"id": tid, "name": req.name}
    finally:
        db.close()


@app.put("/api/templates/{template_id}")
def update_template(template_id: str, req: TemplateCreate):
    db = get_db()
    try:
        db.execute(
            "UPDATE templates SET name=?, type=?, file_path=?, linked_skill_id=?, branding_config=? WHERE id=?",
            (req.name, req.type, req.file_path, req.linked_skill_id, req.branding_config, template_id))
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


# ── Video ──

from services.video_service import download_video, get_progress


class VideoDownloadRequest(BaseModel):
    url: str


@app.post("/api/video/download")
def api_download_video(req: VideoDownloadRequest):
    result = download_video(req.url)
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
        "text": data.get("subtitle_text", "") or data.get("message", ""),
        "video_path": data.get("video_path", ""),
        "task_dir": data.get("task_dir", ""),
        "error": data.get("message", "") if svc_status == "error" else None,
    }


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


@app.post("/api/ppt/generate")
def api_generate_ppt(req: PPTGenerateRequest):
    try:
        filepath = generate_ppt(req.content, req.template_id, req.branding)
        filename = os.path.basename(filepath)
        return {"filename": filename, "download_url": f"/api/download/{filename}"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── SOP Export ──

from services.export_service import export_sop

class SOPExportRequest(BaseModel):
    content: str
    branding: dict = None


@app.post("/api/export/sop")
def api_export_sop(req: SOPExportRequest):
    try:
        filepath = export_sop(req.content, req.branding)
        filename = os.path.basename(filepath)
        return {"filename": filename, "download_url": f"/api/download/{filename}"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── File Download ──

@app.get("/api/download/{filename}")
def download_file(filename: str):
    filepath = os.path.join(EXPORT_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(filepath, filename=filename)


# ── TTS ──

@app.post("/api/tts/synthesize")
async def api_tts_synthesize(req: SynthesizeRequest):
    import httpx
    try:
        api_key = os.getenv("DASHSCOPE_API_KEY", "")
        if not api_key:
            raise HTTPException(status_code=400, detail="请先在设置中配置 DashScope API Key")

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
                "https://dashscope.aliyuncs.com/api/v1/services/audio/tts/SpeechSynthesizer",
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
        audio_name = f"tts_{os.urandom(4).hex()}.mp3"
        audio_path = os.path.join(AUDIO_DIR, audio_name)
        with open(audio_path, "wb") as f:
            f.write(dl.content)

        return {"audio_url": f"/api/audio/{audio_name}", "filename": audio_name}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/audio/{filename}")
def serve_audio(filename: str):
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


VERSION = "1.0.0"
UPDATE_CHECK_URL = "https://raw.githubusercontent.com/qiliang166/yishao-agent/main/version.json"


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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8765)
