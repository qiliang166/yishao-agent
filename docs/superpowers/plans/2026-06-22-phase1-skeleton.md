# Phase 1: 项目骨架 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建 FastAPI + React + SQLite 项目骨架，双击 start.bat 可启动服务并在浏览器打开。

**Architecture:** FastAPI 后端运行在 localhost:8765，React 前端运行在 localhost:5173，前端通过 Vite proxy 转发 `/api/*` 到后端。SQLite 数据库在启动时自动初始化。

**Tech Stack:** FastAPI 0.115+, React 18 + Vite + TypeScript, SQLite3, uvicorn

## Global Constraints

- 纯本地运行，不需要任何外部服务
- API Key 存储在 SQLite settings 表
- 所有数据在 `backend/data/` 下
- 后端端口 8765，前端端口 5173
- Python 3.11+ required
- Node.js 18+ required
- UI 色彩系统：主背景 `#FAFAF8`，主强调 `#8B1A1A`，边框 `#E8E5E0`
- 字体栈：`"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif`

---

## File Structure (this phase)

```
yishao-agent/
├── backend/
│   ├── app.py                    # FastAPI entry, CORS, static serve
│   ├── config.py                 # Global config & env loading
│   ├── database.py               # SQLite init, table creation, backup
│   ├── models.py                 # Pydantic models (empty shell)
│   ├── requirements.txt          # Python dependencies
│   └── .env.example              # API Key template
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts            # Vite config with proxy to :8765
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx               # Root layout: sidebar + content
│       ├── App.css               # Global styles & CSS variables
│       ├── index.css             # Reset & base styles
│       └── pages/
│           └── HomePage.tsx       # Project list (placeholder)
├── .gitignore
├── start.bat                     # Windows launcher
└── start.sh                      # Mac/Linux launcher
```

---

### Task 1: Backend Core Setup

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/.env.example`
- Create: `backend/config.py`
- Create: `backend/models.py`
- Create: `backend/database.py`
- Create: `backend/app.py`

**Interfaces:**
- Produces: `app` (FastAPI instance with CORS, port 8765)
- Produces: `get_db()` → sqlite3.Connection
- Produces: `init_db()` → creates all tables
- Produces: `config.py` constants: `AVAILABLE_MODELS`, `LANGUAGES`, `STYLES`

- [ ] **Step 1: Create requirements.txt**

```
fastapi==0.115.6
uvicorn[standard]==0.34.0
python-multipart==0.0.20
```

- [ ] **Step 2: Create .env.example**

```
DASHSCOPE_API_KEY=sk-your-key-here
```

- [ ] **Step 3: Create config.py**

```python
import os

_ENV_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
if os.path.exists(_ENV_PATH):
    with open(_ENV_PATH) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

DASHSCOPE_API_KEY = os.getenv("DASHSCOPE_API_KEY", "")
BASE_URL = "https://dashscope.aliyuncs.com/api/v1"

AVAILABLE_MODELS = [
    {"id": "cosyvoice-v3-flash", "name": "CosyVoice 3 Flash", "family": "cosyvoice", "realtime": True, "has_system_voice": True},
    {"id": "cosyvoice-v3-plus", "name": "CosyVoice 3 Plus", "family": "cosyvoice", "realtime": True, "has_system_voice": True},
]

LANGUAGES = ["中文", "英语", "日语", "韩语"]
STYLES = ["标准播音风格", "温柔治愈风格", "沉稳大气风格", "活泼俏皮风格", "新闻播报风格"]
```

- [ ] **Step 4: Create models.py**

```python
from pydantic import BaseModel
from typing import Optional


class ProjectCreate(BaseModel):
    name: str
    source_type: str = "text"


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None


class StepResultSave(BaseModel):
    step_name: str
    content: str
    content_type: str = "markdown"


class LLMGenerateRequest(BaseModel):
    provider_id: str
    model: str
    system_prompt: str
    user_message: str
    temperature: float = 0.7


class LLMRefineRequest(BaseModel):
    provider_id: str
    model: str
    instruction: str
    selected_text: str
    full_context: str = ""


class SynthesizeRequest(BaseModel):
    text: str
    model: str = "cosyvoice-v3-flash"
    voice_id: Optional[str] = None
    volume: int = 50
    speed: float = 1.0
```

- [ ] **Step 5: Create database.py**

```python
import os
import sqlite3
import shutil
from datetime import datetime, timedelta

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, "data")
DB_PATH = os.path.join(DATA_DIR, "yishao.db")
BACKUP_DIR = os.path.join(DATA_DIR, "backups")

os.makedirs(DATA_DIR, exist_ok=True)
os.makedirs(BACKUP_DIR, exist_ok=True)


def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def backup_database():
    if not os.path.exists(DB_PATH):
        return
    today = datetime.now().strftime("%Y-%m-%d")
    backup_path = os.path.join(BACKUP_DIR, f"yishao-{today}.db")
    if not os.path.exists(backup_path):
        shutil.copy2(DB_PATH, backup_path)
    # Cleanup old backups (keep 7 days)
    cutoff = datetime.now() - timedelta(days=7)
    for f in os.listdir(BACKUP_DIR):
        fpath = os.path.join(BACKUP_DIR, f)
        if os.path.isfile(fpath):
            mtime = datetime.fromtimestamp(os.path.getmtime(fpath))
            if mtime < cutoff:
                os.remove(fpath)


def init_db():
    backup_database()
    conn = get_db()
    conn.execute("""
        CREATE TABLE IF NOT EXISTS projects (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            status TEXT DEFAULT 'draft',
            source_type TEXT,
            source_url TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS step_results (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
            step_name TEXT NOT NULL,
            content TEXT,
            content_type TEXT DEFAULT 'markdown',
            file_path TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS prompts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            category TEXT NOT NULL,
            current_version TEXT,
            is_default INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS prompt_versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prompt_id TEXT REFERENCES prompts(id) ON DELETE CASCADE,
            version TEXT NOT NULL,
            system_prompt TEXT,
            skill_template TEXT,
            change_note TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS templates (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            type TEXT NOT NULL,
            file_path TEXT NOT NULL,
            thumbnail_path TEXT,
            linked_skill_id TEXT,
            branding_config TEXT,
            is_default INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS llm_providers (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            api_key TEXT,
            base_url TEXT NOT NULL,
            models TEXT,
            is_enabled INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS tts_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id TEXT,
            text TEXT NOT NULL,
            voice_id TEXT,
            model TEXT,
            audio_path TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()
    print(f"[DB] Initialized at {DB_PATH}")


if __name__ == "__main__":
    init_db()
```

- [ ] **Step 6: Create app.py**

```python
import os
import uuid
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import init_db, get_db

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
    rows = db.execute("SELECT * FROM projects ORDER BY updated_at DESC").fetchall()
    db.close()
    return {"projects": [dict(r) for r in rows]}


@app.post("/api/projects")
def create_project(req):
    from models import ProjectCreate
    pid = uuid.uuid4().hex[:12]
    db = get_db()
    db.execute(
        "INSERT INTO projects (id, name, source_type) VALUES (?, ?, ?)",
        (pid, req.name, req.source_type))
    db.commit()
    row = db.execute("SELECT * FROM projects WHERE id = ?", (pid,)).fetchone()
    db.close()
    return dict(row)


@app.get("/api/projects/{project_id}")
def get_project(project_id: str):
    db = get_db()
    row = db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    db.close()
    if not row:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Project not found")
    return dict(row)


@app.put("/api/projects/{project_id}")
def update_project(project_id: str, req):
    from models import ProjectUpdate
    db = get_db()
    if req.name is not None:
        db.execute("UPDATE projects SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (req.name, project_id))
    if req.status is not None:
        db.execute("UPDATE projects SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (req.status, project_id))
    db.commit()
    row = db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    db.close()
    return dict(row)


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: str):
    db = get_db()
    db.execute("DELETE FROM projects WHERE id = ?", (project_id,))
    db.commit()
    db.close()
    return {"ok": True}


# ── Step Results ──

@app.get("/api/projects/{project_id}/steps")
def get_steps(project_id: str):
    db = get_db()
    rows = db.execute(
        "SELECT * FROM step_results WHERE project_id = ? ORDER BY step_name", (project_id,)
    ).fetchall()
    db.close()
    return {"steps": [dict(r) for r in rows]}


@app.put("/api/projects/{project_id}/steps/{step_name}")
def save_step(project_id: str, step_name: str, req):
    from models import StepResultSave
    db = get_db()
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
    db.close()
    return {"ok": True}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8765)
```

- [ ] **Step 7: Run backend to verify**

```bash
cd d:/YISHAOAGENT/backend && python app.py
```

Expected: `[DB] Initialized at d:\YISHAOAGENT\backend\data\yishao.db` then `Uvicorn running on http://0.0.0.0:8765`

- [ ] **Step 8: Test health endpoint**

```bash
curl http://localhost:8765/api/health
```

Expected: `{"status":"ok","app":"一勺笔录 Agent"}`

- [ ] **Step 9: Test project CRUD**

```bash
curl -X POST http://localhost:8765/api/projects -H "Content-Type: application/json" -d "{\"name\":\"测试项目\",\"source_type\":\"text\"}"
```

Expected: JSON with project id, name, status, created_at

- [ ] **Step 10: Commit**

```bash
git add backend/
git commit -m "feat: 搭建 FastAPI 后端骨架（SQLite + 项目管理 API）"
```

---

### Task 2: Frontend Core Setup

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.node.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/index.css`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/App.css`
- Create: `frontend/src/pages/HomePage.tsx`

**Interfaces:**
- Produces: React app with sidebar layout, routing placeholder
- Produces: CSS variables matching UI standards (Section 14)

- [ ] **Step 1: Create package.json**

```json
{
  "name": "yishao-agent",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "typescript": "^5.5.3",
    "vite": "^5.4.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8765',
        changeOrigin: true,
      },
    },
  },
})
```

- [ ] **Step 4: Create index.html**

```html
<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>一勺笔录</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create src/main.tsx**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
```

- [ ] **Step 6: Create src/index.css**

```css
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

:root {
  --color-bg: #FAFAF8;
  --color-card: #FFFFFF;
  --color-text: #1A1A1A;
  --color-text-secondary: #6B6B6B;
  --color-primary: #8B1A1A;
  --color-primary-hover: #6E1515;
  --color-accent: #D4A574;
  --color-success: #4A8B3F;
  --color-warning: #C75B39;
  --color-border: #E8E5E0;
  --color-step-pending: #D0D0D0;
  --font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif;
  --font-mono: "Consolas", "Source Code Pro", monospace;
  --shadow-card: 0 1px 3px rgba(0,0,0,0.08);
  --shadow-modal: 0 8px 32px rgba(0,0,0,0.12);
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --sidebar-width: 240px;
}

html, body, #root {
  height: 100%;
  font-family: var(--font-family);
  font-size: 14px;
  color: var(--color-text);
  background: var(--color-bg);
}

a { color: var(--color-primary); text-decoration: none; }
a:hover { text-decoration: underline; }

button {
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
}
```

- [ ] **Step 7: Create src/App.tsx**

```tsx
import { Routes, Route, Link, useLocation } from 'react-router-dom'
import HomePage from './pages/HomePage'
import './App.css'

const navItems = [
  { path: '/', label: '项目列表', icon: '📋' },
  { path: '/prompts', label: '提示词管理', icon: '📝' },
  { path: '/templates', label: '模板管理', icon: '🎨' },
  { path: '/settings', label: '设置', icon: '⚙️' },
]

function App() {
  const location = useLocation()

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <h1 className="sidebar-logo">一勺笔录</h1>
          <span className="sidebar-version">v1.0.0</span>
        </div>
        <nav className="sidebar-nav">
          {navItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="main-content">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/project/:id" element={<div>Project Page</div>} />
          <Route path="/prompts" element={<div>Prompt Manager</div>} />
          <Route path="/templates" element={<div>Template Manager</div>} />
          <Route path="/settings" element={<div>Settings</div>} />
        </Routes>
      </main>
    </div>
  )
}

export default App
```

- [ ] **Step 8: Create src/App.css**

```css
.app-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.sidebar {
  width: var(--sidebar-width);
  min-width: var(--sidebar-width);
  background: var(--color-card);
  border-right: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  padding: 0;
}

.sidebar-header {
  padding: 24px 20px 16px;
  border-bottom: 1px solid var(--color-border);
}

.sidebar-logo {
  font-size: 20px;
  font-weight: 700;
  color: var(--color-primary);
  margin: 0;
}

.sidebar-version {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  padding: 8px;
  gap: 2px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  color: var(--color-text);
  text-decoration: none;
  font-size: 14px;
  transition: background 0.15s;
}

.nav-item:hover {
  background: var(--color-bg);
  text-decoration: none;
}

.nav-item.active {
  background: rgba(139, 26, 26, 0.08);
  color: var(--color-primary);
  font-weight: 600;
}

.nav-icon {
  font-size: 16px;
  width: 24px;
  text-align: center;
}

.main-content {
  flex: 1;
  overflow-y: auto;
  padding: 32px;
}
```

- [ ] **Step 9: Create src/pages/HomePage.tsx**

```tsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

interface Project {
  id: string
  name: string
  status: string
  source_type: string
  created_at: string
  updated_at: string
}

function HomePage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then(data => {
        setProjects(data.projects || [])
        setLoading(false)
      })
      .catch(err => {
        console.error('Failed to load projects:', err)
        setLoading(false)
      })
  }, [])

  const createProject = async () => {
    const name = prompt('请输入食谱名称：')
    if (!name) return
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, source_type: 'text' }),
    })
    const project = await res.json()
    navigate(`/project/${project.id}`)
  }

  const deleteProject = async (id: string, name: string) => {
    if (!confirm(`确认删除「${name}」？此操作不可撤销。`)) return
    await fetch(`/api/projects/${id}`, { method: 'DELETE' })
    setProjects(prev => prev.filter(p => p.id !== id))
  }

  const statusLabel = (s: string) => {
    const map: Record<string, string> = { draft: '草稿', in_progress: '进行中', completed: '已完成' }
    return map[s] || s
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>我的项目</h1>
        <button
          onClick={createProject}
          style={{
            background: 'var(--color-primary)',
            color: '#fff',
            border: 'none',
            padding: '10px 20px',
            borderRadius: 'var(--radius-sm)',
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          + 新建项目
        </button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--color-text-secondary)' }}>加载中...</p>
      ) : projects.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--color-text-secondary)' }}>
          <p style={{ fontSize: 16, marginBottom: 12 }}>还没有项目</p>
          <p>点击「+ 新建项目」开始你的第一份食谱笔记</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {projects.map(p => (
            <div
              key={p.id}
              onClick={() => navigate(`/project/${p.id}`)}
              style={{
                background: 'var(--color-card)',
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: '16px 20px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                cursor: 'pointer',
                boxShadow: 'var(--shadow-card)',
              }}
            >
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>{p.name}</h3>
                <span style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>
                  {statusLabel(p.status)} · {new Date(p.updated_at).toLocaleString('zh-CN')}
                </span>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); deleteProject(p.id, p.name) }}
                style={{
                  background: 'none',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '6px 12px',
                  color: 'var(--color-text-secondary)',
                  fontSize: 12,
                }}
              >
                删除
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default HomePage
```

- [ ] **Step 10: Install frontend dependencies**

```bash
cd d:/YISHAOAGENT/frontend && npm install
```

Expected: dependencies installed successfully

- [ ] **Step 11: Start frontend and verify**

```bash
cd d:/YISHAOAGENT/frontend && npm run dev
```

Expected: Vite dev server running on http://localhost:5173. Open browser → see sidebar with "一勺笔录" logo, nav items, and empty project list.

- [ ] **Step 12: Verify frontend-backend integration**

Click "+ 新建项目" → enter name → should call backend API and navigate.

- [ ] **Step 13: Commit**

```bash
git add frontend/
git commit -m "feat: 搭建 React 前端骨架（侧边栏布局 + 项目列表页）"
```

---

### Task 3: Startup Scripts & Git Setup

**Files:**
- Create: `start.bat`
- Create: `start.sh`
- Create: `.gitignore`

- [ ] **Step 1: Create start.bat**

```batch
@echo off
chcp 65001 >nul
echo ========================================
echo   一勺笔录 Agent
echo ========================================
echo.

REM Stop existing processes
taskkill /f /im node.exe 2>nul
taskkill /f /im python.exe 2>nul
timeout /t 2 /nobreak >nul

echo [1/2] Starting backend on port 8765...
start "Yishao-Backend" cmd /c "cd /d d:\YISHAOAGENT\backend && python app.py"

timeout /t 3 /nobreak >nul

echo [2/2] Starting frontend on port 5173...
start "Yishao-Frontend" cmd /c "cd /d d:\YISHAOAGENT\frontend && npm run dev"

timeout /t 4 /nobreak >nul

echo.
echo ========================================
echo   打开浏览器访问: http://localhost:5173
echo ========================================
echo.
start http://localhost:5173
pause
```

- [ ] **Step 2: Create start.sh**

```bash
#!/bin/bash
echo "========================================"
echo "  一勺笔录 Agent"
echo "========================================"
echo

echo "[1/2] Starting backend on port 8765..."
cd "$(dirname "$0")/backend"
python app.py &
BACKEND_PID=$!

sleep 3

echo "[2/2] Starting frontend on port 5173..."
cd "$(dirname "$0")/frontend"
npm run dev &
FRONTEND_PID=$!

sleep 4

echo
echo "========================================"
echo "  打开浏览器访问: http://localhost:5173"
echo "========================================"
echo

# Open browser
if [[ "$OSTYPE" == "darwin"* ]]; then
    open http://localhost:5173
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    xdg-open http://localhost:5173
fi

# Wait for user to press Ctrl+C
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit 0" INT TERM
wait
```

Make start.sh executable: `chmod +x start.sh`

- [ ] **Step 3: Create .gitignore**

```
node_modules/
__pycache__/
*.pyc
.env
backend/data/
*.mp3
*.mp4
*.log
dist/
build/
.vite/
```

- [ ] **Step 4: Initialize git**

```bash
cd d:/YISHAOAGENT && git init && git add -A && git commit -m "chore: 项目初始化，添加启动脚本和 gitignore"
```

- [ ] **Step 5: Full integration test**

```bash
# Double-click start.bat
# Verify:
# 1. Backend starts on :8765
# 2. Frontend starts on :5173
# 3. Browser opens automatically
# 4. "一勺笔录" sidebar shown
# 5. Can create project via UI
```

- [ ] **Step 6: Commit**

```bash
git add start.bat start.sh .gitignore
git commit -m "chore: 添加启动脚本和 gitignore"
```

---

## Verification Checklist (Phase 1)

- [ ] `curl http://localhost:8765/api/health` → 200 OK
- [ ] `curl http://localhost:8765/api/projects` → returns []
- [ ] Create project via API → returns project JSON with id
- [ ] `curl http://localhost:5173` → HTML page loads
- [ ] Browser shows sidebar with "一勺笔录" logo and 4 nav items
- [ ] Click "+ 新建项目" → creates project → navigates to project page
- [ ] Click project card → navigates
- [ ] Delete project → confirmation → removed from list
- [ ] SQLite DB exists at `backend/data/yishao.db`
- [ ] DB backup exists at `backend/data/backups/yishao-YYYY-MM-DD.db`
