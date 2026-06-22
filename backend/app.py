import os
import uuid
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from database import init_db, get_db
from models import ProjectCreate, ProjectUpdate, StepResultSave, LLMGenerateRequest, LLMRefineRequest
import json
from services.llm_service import test_connection, generate, refine

init_db()

app = FastAPI(title="一勺笔录 Agent")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# ── Health check ──

@app.get("/api/health")
def health():
    return {"status": "ok", "app": "一勺笔录 Agent"}


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


@app.post("/api/llm/refine")
async def llm_refine(req: LLMRefineRequest):
    try:
        result = await refine(req.provider_id, req.model, req.instruction, req.selected_text, req.full_context)
        return {"content": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8765)
