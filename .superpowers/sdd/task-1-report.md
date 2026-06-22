# Task 1 Report: Backend Core Setup

## Status: DONE

## Commits Made

| Hash | Message |
|------|---------|
| `074f675` | feat: 搭建 FastAPI 后端骨架（SQLite + 项目管理 API） |
| `e80ce69` | chore: 添加 .gitignore，移除 **pycache** 和数据库文件追踪 |

## Files Created

- `backend/requirements.txt` -- fastapi, uvicorn, python-multipart
- `backend/.env.example` -- template for DASHSCOPE_API_KEY
- `backend/config.py` -- env loader + constants (AVAILABLE_MODELS, LANGUAGES, STYLES)
- `backend/models.py` -- Pydantic schemas (ProjectCreate, ProjectUpdate, StepResultSave, LLMGenerateRequest, LLMRefineRequest, SynthesizeRequest)
- `backend/database.py` -- SQLite init with 8 tables, get_db(), init_db(), backup_database()
- `backend/app.py` -- FastAPI app with CORS, health check, project CRUD, step results endpoints

## Test Results

All endpoints tested via curl on http://localhost:8765:

| Endpoint | Method | Result |
|----------|--------|--------|
| `/api/health` | GET | `{"status":"ok","app":"一勺笔录 Agent"}` |
| `/api/projects` | POST | Creates project with id/name/status/timestamps |
| `/api/projects` | GET | Returns list of projects |
| `/api/projects/{id}` | GET | Returns single project |
| `/api/projects/{id}` | PUT | Updates name/status |
| `/api/projects/{id}` | DELETE | Returns `{"ok":true}`, cascade deletes steps |
| `/api/projects/{id}/steps` | GET | Returns step list |
| `/api/projects/{id}/steps/{step_name}` | PUT | Creates or updates step (upsert) |

## Concerns / Notes

1. **Bug fix in brief's app.py**: The brief's endpoint handlers used bare `req` parameters without Pydantic type annotations (e.g., `def create_project(req):`). FastAPI requires `req: ProjectCreate` to parse JSON body. This was corrected in the implementation. Without this fix, all POST/PUT endpoints would fail with 422/400.

2. **DB connection safety**: Added `try/finally` blocks to all endpoint functions to ensure `db.close()` is always called, preventing "database is locked" errors when exceptions occur (e.g., foreign key violations).

3. **Environment quirks**: The system's default `python` command resolves to a Windows Store shim that exits with code 49. The project Python lives at `C:\Users\17206\.kimi-venv\Scripts\python.exe` (v3.13.13). This is noted for future tasks that need to run the backend.

4. Python version used: 3.13.13 (satisfies the 3.11+ requirement)

## Fixes Applied

| Issue | File | Change |
|-------|------|--------|
| 1 | `start.bat` | Replaced hardcoded `d:\YISHAOAGENT` with `%~dp0` for relative path; added `venv\` and `node_modules\` checks before running pip install / npm install |
| 2 | `start.sh` | Added `venv` and `node_modules` existence checks with automatic dependency installation |
| 3 | `backend/app.py` | Added `fetchone()` None check in `update_project()` — returns 404 if project not found (same pattern as `get_project`) |
| 4 | `backend/database.py` | Wrapped `init_db()` body in try/finally to ensure `conn.close()` always executes |

### Verification

- `start.bat` runs without errors (relative paths resolve correctly)
- Backend starts and all endpoints respond properly
- `GET /api/health` returns `{"status":"ok","app":"一勺笔录 Agent"}`
- `PUT /api/projects/nonexistent` returns `{"detail":"Project not found"}` with HTTP 404 (was returning 500 before the fix)
- `init_db()` acquires and releases connection cleanly
