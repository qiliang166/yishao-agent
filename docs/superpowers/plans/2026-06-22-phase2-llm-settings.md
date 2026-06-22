# Phase 2: LLM Service + 设置页面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development

**Goal:** 实现多厂商 LLM 统一调用层 + 设置页面（API Key 配置/测试连接/TTS配置）

**Architecture:** `llm_service.py` 封装 OpenAI 兼容 SDK，统一调用 DeepSeek/Qwen/Kimi 等。设置页面管理各提供商的 API Key（存在 SQLite），支持测试连接。

**Tech Stack:** openai Python SDK, React, TypeScript

## Global Constraints

- 所有 LLM 调用通过 `llm_service.py` 统一入口，不直接调 openai
- API Key 存储在 SQLite `llm_providers` 表
- 前端设置页每个提供商独立配置：名称、API Key、Base URL、模型列表（JSON）
- 测试连接按钮：调 `/api/llm/providers/{id}/test` → 返回成功/失败
- UI 标准：主背景 #FAFAF8，主色 #8B1A1A，边框 #E8E5E0，字体 PingFang SC

---

### Task 1: Backend LLM Service + Provider API

**Files:**
- Create: `backend/services/llm_service.py`
- Modify: `backend/app.py` (add LLM routes)
- Modify: `backend/requirements.txt` (add openai)

**Interfaces produced:**
- `async def generate(provider_id, model, system_prompt, user_message, temperature) -> str`
- `async def refine(provider_id, model, instruction, selected_text, full_context) -> str`
- `async def test_connection(api_key, base_url) -> bool`
- API: CRUD `/api/llm/providers` + `/api/llm/providers/{id}/test`
- API: `POST /api/llm/generate` + `POST /api/llm/refine`

**Steps:**

1. Add `openai>=1.50.0` to requirements.txt
2. Create `backend/services/llm_service.py`:

```python
"""Multi-provider LLM service using OpenAI-compatible SDK."""
import os
from openai import OpenAI
from database import get_db


async def get_provider(provider_id: str) -> dict | None:
    db = get_db()
    try:
        row = db.execute("SELECT * FROM llm_providers WHERE id = ? AND is_enabled = 1", (provider_id,)).fetchone()
        return dict(row) if row else None
    finally:
        db.close()


async def test_connection(api_key: str, base_url: str) -> dict:
    """Test connection to an LLM provider."""
    try:
        client = OpenAI(api_key=api_key, base_url=base_url, timeout=30.0)
        models = client.models.list()
        model_ids = [m.id for m in models.data[:10]]
        return {"ok": True, "models": model_ids}
    except Exception as e:
        return {"ok": False, "error": str(e)}


async def generate(provider_id: str, model: str, system_prompt: str, user_message: str, temperature: float = 0.7) -> str:
    """Call LLM chat completion. Returns response text."""
    provider = await get_provider(provider_id)
    if not provider:
        raise ValueError(f"Provider {provider_id} not found or disabled")

    client = OpenAI(api_key=provider["api_key"], base_url=provider["base_url"], timeout=120.0)

    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": user_message})

    response = client.chat.completions.create(
        model=model,
        messages=messages,
        temperature=temperature,
    )
    return response.choices[0].message.content


async def refine(provider_id: str, model: str, instruction: str, selected_text: str, full_context: str = "") -> str:
    """Refine/expand/shorten selected text with AI assistance."""
    provider = await get_provider(provider_id)
    if not provider:
        raise ValueError(f"Provider {provider_id} not found or disabled")

    client = OpenAI(api_key=provider["api_key"], base_url=provider["base_url"], timeout=120.0)

    system_prompt = "你是一个专业的文字编辑助手。根据用户的指令精确修改选中的文本。只返回修改后的文本，不要添加解释。"

    user_parts = []
    if full_context:
        user_parts.append(f"【全文上下文】\n{full_context}")
    user_parts.append(f"【选中的文本】\n{selected_text}")
    user_parts.append(f"【操作指令】\n{instruction}")
    user_message = "\n\n".join(user_parts)

    response = client.chat.completions.create(
        model=model,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message},
        ],
        temperature=0.7,
    )
    return response.choices[0].message.content
```

3. Add to `backend/app.py` (routes to add):

```python
# ── LLM Providers ──

from services.llm_service import test_connection, generate, refine

@app.get("/api/llm/providers")
def list_llm_providers():
    db = get_db()
    try:
        rows = db.execute("SELECT * FROM llm_providers ORDER BY created_at").fetchall()
        providers = []
        for r in rows:
            p = dict(r)
            p["models"] = json.loads(p.get("models", "[]"))
            # Hide API key in list view
            if p.get("api_key"):
                p["api_key"] = p["api_key"][:8] + "***" if len(p["api_key"]) > 8 else "***"
            providers.append(p)
        return {"providers": providers}
    finally:
        db.close()


class LLMProviderCreate(BaseModel):
    name: str
    api_key: str = ""
    base_url: str = "https://api.deepseek.com/v1"
    models: list[str] = []


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


class TestConnectionRequest(BaseModel):
    api_key: str
    base_url: str


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
```

4. Install openai: `pip install openai>=1.50.0`
5. Test: Start backend, test provider CRUD with curl
6. Test: Create a provider with real API key, test `/api/llm/generate`
7. Commit: `feat: 添加 LLM Service（多厂商）+ Provider CRUD API`

---

### Task 2: Frontend Settings Page

**Files:**
- Modify: `frontend/src/App.tsx` (add SettingsPage route with real component)
- Create: `frontend/src/pages/SettingsPage.tsx`
- Create: `frontend/src/services/api.ts`

**Interfaces consumed:**
- `GET /api/llm/providers` → `{"providers": [...]}`
- `POST /api/llm/providers` → `{"id": "...", "name": "..."}`
- `PUT /api/llm/providers/{id}` → `{"ok": true}`
- `DELETE /api/llm/providers/{id}` → `{"ok": true}`
- `POST /api/llm/providers/{id}/test` → `{"ok": true/false, ...}`

1. Create `frontend/src/services/api.ts` with typed API functions:

```typescript
const BASE = ''

async function request(path: string, options?: RequestInit) {
  const res = await fetch(BASE + path, options)
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Request failed')
  return data
}

export interface LLMProvider {
  id: string
  name: string
  api_key: string
  base_url: string
  models: string[]
  is_enabled: number
}

export interface Project {
  id: string
  name: string
  status: string
  source_type: string
  created_at: string
  updated_at: string
}

export const api = {
  // Projects
  listProjects: () => request('/api/projects').then(d => d.projects as Project[]),
  createProject: (name: string) => request('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, source_type: 'text' }),
  }),
  deleteProject: (id: string) => request(`/api/projects/${id}`, { method: 'DELETE' }),

  // LLM Providers
  listProviders: () => request('/api/llm/providers').then(d => d.providers as LLMProvider[]),
  createProvider: (data: { name: string; api_key: string; base_url: string; models: string[] }) =>
    request('/api/llm/providers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  updateProvider: (id: string, data: { name: string; api_key: string; base_url: string; models: string[] }) =>
    request(`/api/llm/providers/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  deleteProvider: (id: string) => request(`/api/llm/providers/${id}`, { method: 'DELETE' }),
  testProvider: (id: string) => request(`/api/llm/providers/${id}/test`, { method: 'POST' }),

  // LLM calls
  llmGenerate: (data: { provider_id: string; model: string; system_prompt: string; user_message: string; temperature?: number }) =>
    request('/api/llm/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
  llmRefine: (data: { provider_id: string; model: string; instruction: string; selected_text: string; full_context?: string }) =>
    request('/api/llm/refine', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  // Settings
  getSettings: () => request('/api/settings'),
  updateSettings: (data: Record<string, string>) => request('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
}
```

2. Create `frontend/src/pages/SettingsPage.tsx` with tabs:
   - Tab: "LLM 配置" — provider list with add/edit/delete/test
   - Tab: "TTS 配置" — DashScope API Key + default voice selector (placeholder for now)
   - Tab: "数据" — storage directory path + disk usage
   - Tab: "关于" — version info + check update

3. Update `frontend/src/App.tsx` to use real SettingsPage component

4. Test: Open Settings page → add DeepSeek provider → test connection → verify green checkmark
5. Commit: `feat: 添加设置页面（LLM/TTS/数据/关于）`

---

### Task 3: Update HomePage to use api.ts

**Files:**
- Modify: `frontend/src/pages/HomePage.tsx` (use api.ts instead of raw fetch)

Refactor HomePage to use the new `api` helper, adding proper error handling (try/catch).

1. Replace raw fetch calls with `api.listProjects()`, `api.createProject()`, `api.deleteProject()`
2. Add try/catch to createProject and deleteProject
3. Add `res.ok` equivalent (already handled in api.ts)
4. Commit: `refactor: 重构 HomePage 使用 api.ts 并添加错误处理`
