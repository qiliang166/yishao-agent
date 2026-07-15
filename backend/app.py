import os
import sys
import io
import zipfile
import shutil
import uuid
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Body, Request, Depends
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import bcrypt
from jose import JWTError, jwt
from database import init_db, get_db
from services.cosyvoice_service import clone_voice, design_voice
from models import (WorkspaceCreate, WorkspaceUpdate, ProjectCreate, ProjectUpdate, StepResultSave, LLMGenerateRequest,
    LLMRefineRequest, SynthesizeRequest, TtsSplitRequest, PPTGenerateRequest, PPTPlanRequest, PPTEditSlideRequest,
    PPTSlideSourceRequest, PPTRegenerateSlideRequest, TtsHistoryUpdate,
    ImageGenerateRequest, SourceMaterialCreate, SourceMaterialUpdate,
    ProjectItemCreate, ProjectItemUpdate, ProjectItemResultSave)
from typing import Optional
import json
import logging
from services.llm_service import test_connection, generate, generate_stream, refine, get_provider
from routers.prompts import router as prompts_router
from routers.users import router as users_router
from routers.prompt_studio import router as prompt_studio_router
from routers.scenarios import router as scenarios_router
from permissions import require_perm, check_ownership, verify_project_access
from services.license_service import (
    validate_license_key, activate as license_activate,
    check_activation, deactivate as license_deactivate, get_license_status,
)

DEFAULT_SITE_NAME = "Yishao Agent"

# Server-authoritative plan definitions — stored in settings table, editable via UI.
# Falls back to default if not configured.
DEFAULT_PLAN = {
    "quarterly": {"amount_cents": 2990, "duration_days": 90, "name": "标准套餐"},
    "upgrade": {"amount_cents": 1990, "duration_days": 30, "name": "体验管理员升级"},
}

def _load_plans() -> dict:
    """Load plan config from settings table, merged with defaults for new plan types."""
    db = get_db()
    stored = {}
    try:
        row = db.execute("SELECT value FROM settings WHERE key='member_plan'").fetchone()
        if row and row["value"]:
            stored = json.loads(row["value"])
    except Exception:
        pass
    finally:
        db.close()
    merged = dict(DEFAULT_PLAN)  # start with defaults
    merged.update(stored)        # stored values override defaults
    return merged

# Allowed domains for TTS audio download (SSRF prevention)
_AUDIO_ALLOWED_HOSTS = {"dashscope.aliyuncs.com", "dashscope-intl.aliyuncs.com", "aliyuncs.com"}

def _is_safe_audio_url(url: str) -> bool:
    try:
        host = url.split("/")[2]  # https://host/path → host
        return any(host == allowed or host.endswith("." + allowed) for allowed in _AUDIO_ALLOWED_HOSTS)
    except Exception:
        return False

init_db()

app = FastAPI(title=DEFAULT_SITE_NAME)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(prompts_router)
app.include_router(users_router)
app.include_router(prompt_studio_router)
app.include_router(scenarios_router)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# In PyInstaller frozen mode, data dirs go next to the exe
if getattr(sys, 'frozen', False):
    _EXE_DIR = os.path.dirname(sys.executable)
    WORKSPACE_ROOT = _EXE_DIR
    AUDIO_DIR = os.path.join(_EXE_DIR, "data", "audio")
    EXPORT_DIR = os.path.join(_EXE_DIR, "data", "exports")
    LOGO_DIR = os.path.join(_EXE_DIR, "data", "logos")
else:
    WORKSPACE_ROOT = os.path.dirname(BASE_DIR)  # d:\YISHAOAGENT
    AUDIO_DIR = os.path.join(BASE_DIR, "data", "audio")
    EXPORT_DIR = os.path.join(BASE_DIR, "data", "exports")
    LOGO_DIR = os.path.join(BASE_DIR, "data", "logos")

os.makedirs(AUDIO_DIR, exist_ok=True)
os.makedirs(EXPORT_DIR, exist_ok=True)
os.makedirs(LOGO_DIR, exist_ok=True)

# Run-id → actual directory mapping for SVG preview serving
# Persisted to data/run_dirs.json so it survives restarts
_RUN_DIRS_FILE = os.path.join(BASE_DIR, "data", "run_dirs.json")

def _load_run_dirs() -> dict[str, str]:
    try:
        with open(_RUN_DIRS_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

def _save_run_dirs(mapping: dict[str, str]):
    try:
        os.makedirs(os.path.dirname(_RUN_DIRS_FILE), exist_ok=True)
        with open(_RUN_DIRS_FILE, "w", encoding="utf-8") as f:
            json.dump(mapping, f)
    except Exception:
        pass

_run_dirs: dict[str, str] = _load_run_dirs()

def _scan_output_bases() -> list[str]:
    """Scan for possible output directories (project storage dirs)."""
    bases = []
    for output_root in [
        os.path.join(WORKSPACE_ROOT, "output"),
        os.path.join(WORKSPACE_ROOT, "data", "output"),
    ]:
        if os.path.isdir(output_root):
            for name in os.listdir(output_root):
                d = os.path.join(output_root, name)
                if os.path.isdir(d):
                    bases.append(d)
    return bases

@app.get("/api/exports/{run_id}/{filename:path}")
def api_serve_export_file(run_id: str, filename: str):
    import starlette.responses as _sr
    run_dir = _run_dirs.get(run_id)
    if not run_dir:
        # Fallback: look in EXPORT_DIR and scan subdirs
        candidate = os.path.join(EXPORT_DIR, run_id)
        if os.path.isdir(candidate):
            run_dir = candidate
    if not run_dir:
        # Last resort: scan known output dirs for run_id
        for base in [EXPORT_DIR] + _scan_output_bases():
            candidate = os.path.join(base, run_id)
            if os.path.isdir(candidate):
                run_dir = candidate
                _run_dirs[run_id] = run_dir
                _save_run_dirs(_run_dirs)
                break
    if not run_dir:
        run_dir = os.path.join(EXPORT_DIR, run_id)
    filepath = os.path.normpath(os.path.join(run_dir, filename))
    if not filepath.startswith(os.path.normpath(run_dir)):
        raise HTTPException(status_code=403, detail="Path traversal denied")
    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="Not Found")
    headers = {}
    if filepath.endswith('.html'):
        headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    else:
        dl_name = _ppt_display_name(os.path.basename(filepath))
        if dl_name != os.path.basename(filepath):
            from urllib.parse import quote
            encoded = quote(dl_name, safe='')
            headers['Content-Disposition'] = f"attachment; filename*=UTF-8''{encoded}"
    return _file_response(filepath, headers=headers)

import re
import mimetypes


def _file_response(filepath: str, **kwargs) -> FileResponse:
    """FileResponse wrapper that adds charset=utf-8 for text-based files,
    preventing garbled text when Chrome guesses the wrong encoding."""
    media_type = kwargs.pop("media_type", None)
    if media_type is None:
        media_type, _ = mimetypes.guess_type(filepath)
    if media_type:
        ext = os.path.splitext(filepath)[1].lower()
        _text_charset_exts = {
            ".txt", ".html", ".htm", ".csv", ".md", ".json", ".xml",
            ".py", ".js", ".css", ".svg", ".yaml", ".yml", ".log",
            ".ini", ".cfg", ".conf", ".env", ".ts", ".tsx", ".jsx",
        }
        if ext in _text_charset_exts and "charset" not in media_type:
            media_type = f"{media_type}; charset=utf-8"
    return FileResponse(filepath, media_type=media_type, **kwargs)


def _get_global_save_path() -> str:
    """Read global save_path from settings, or return default."""
    db = get_db()
    try:
        row = db.execute("SELECT value FROM settings WHERE key = 'save_path'").fetchone()
        if row and row["value"]:
            path = row["value"]
            if os.path.isabs(path):
                return path
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


def _get_site_name() -> str:
    """Read site name from settings (brand_name), with fallback."""
    name = _get_setting("brand_name")
    return name if name else DEFAULT_SITE_NAME


# ── JWT / Auth config ──────────────────────────────────────────────
SECRET_KEY = os.environ.get("JWT_SECRET", "yishao-agent-jwt-secret-2026")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

security = HTTPBearer(auto_error=False)

# ── Rate limit state ────────────────────────────────────────────────
_rate_limit_store: dict[str, list[float]] = {}  # ip_key → [timestamps]
import time as _time


def _check_rate_limit(key: str, max_req: int, window_sec: int) -> tuple[bool, int]:
    """Check if key exceeds rate limit. Returns (allowed, retry_after_sec)."""
    now = _time.time()
    cutoff = now - window_sec
    timestamps = [t for t in _rate_limit_store.get(key, []) if t > cutoff]
    _rate_limit_store[key] = timestamps
    if len(timestamps) >= max_req:
        retry = int(timestamps[0] + window_sec - now) + 1
        return False, max(retry, 1)
    timestamps.append(now)
    return True, 0


def _hash_password(password: str) -> str:
    """bcrypt hash for new passwords. Truncates to 72 bytes (bcrypt limit)."""
    return bcrypt.hashpw(password.encode("utf-8")[:72], bcrypt.gensalt()).decode("utf-8")


def _verify_password(plain: str, stored_hash: str) -> bool:
    """Verify plain password against stored hash.
    Tries bcrypt first; falls back to legacy SHA256.
    """
    if stored_hash.startswith("$2"):
        try:
            return bcrypt.checkpw(plain.encode("utf-8")[:72], stored_hash.encode("utf-8"))
        except Exception:
            return False
    # Legacy SHA256 fallback (hex digest)
    import hashlib
    SALT = "yishao-agent-salt-2026"
    legacy = hashlib.sha256((SALT + plain).encode("utf-8")).hexdigest()
    return legacy == stored_hash


# ── User & permission helpers ────────────────────────────────────────

def _get_user_permissions(user_id: str, user_type: str) -> list[str]:
    """Compute effective permissions for a user (union of all role permissions)."""
    db = get_db()
    try:
        rows = db.execute("""
            SELECT DISTINCT rp.permission FROM role_permissions rp
            JOIN user_roles ur ON ur.role_id = rp.role_id
            WHERE ur.user_id = ?
        """, (user_id,)).fetchall()
        perms = [r["permission"] for r in rows]
        # Rule 3: admin always has project.view_all
        if user_type == "admin" and "project.view_all" not in perms:
            perms.append("project.view_all")
        # Rule 5: role.manage implies member.manage
        if "role.manage" in perms and "member.manage" not in perms:
            perms.append("member.manage")
        return perms
    finally:
        db.close()


def _get_user_roles(user_id: str) -> list[str]:
    """Get role names for a user. Filters out expired upgrade role."""
    db = get_db()
    try:
        rows = db.execute("""
            SELECT r.name FROM roles r
            JOIN user_roles ur ON ur.role_id = r.id
            WHERE ur.user_id = ?
        """, (user_id,)).fetchall()
        roles = [r["name"] for r in rows]
        # Check if upgrade role is expired
        if "开发体验员" in roles:
            from datetime import datetime as _dt
            urow = db.execute(
                "SELECT upgrade_expires_at FROM users WHERE id=?", (user_id,)
            ).fetchone()
            if urow and urow["upgrade_expires_at"]:
                try:
                    if _dt.utcnow() > _dt.fromisoformat(urow["upgrade_expires_at"]):
                        roles.remove("开发体验员")
                except (ValueError, TypeError):
                    pass
        return roles
    finally:
        db.close()


def _create_jwt(user_row) -> str:
    """Create JWT with user info, permissions, and token_version."""
    permissions = _get_user_permissions(user_row["id"], user_row["user_type"])
    roles = _get_user_roles(user_row["id"])
    payload = {
        "sub": user_row["id"],
        "username": user_row["username"],
        "user_type": user_row["user_type"],
        "permissions": permissions,
        "roles": roles,
        "token_version": user_row["token_version"],
        "exp": datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    """Legacy: create simple JWT (kept for backward compat)."""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Validate JWT and return payload. Raises 401 on any failure."""
    if credentials is None:
        raise HTTPException(status_code=401, detail="请先登录")
    token = credentials.credentials
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="无效或过期的令牌")


def _write_audit(conn, actor_id: str, action: str, target_type: str = "",
                 target_id: str = "", detail: str = "{}", ip_address: str = ""):
    """Write an audit log entry."""
    import uuid as _uuid
    conn.execute(
        """INSERT INTO audit_log (id, actor_id, action, target_type, target_id, detail, ip_address)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (str(_uuid.uuid4()), actor_id, action, target_type, target_id, detail, ip_address),
    )


# ── Auth middleware (extended) ───────────────────────────────────────

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path
    method = request.method

    # --- Phase 1: Inject request.state.user from JWT (new) ---
    auth_header = request.headers.get("Authorization", "")
    request.state.user = None
    if auth_header.startswith("Bearer "):
        token = auth_header[7:]
        try:
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            # Check token_version if present (new-style JWT)
            if "token_version" in payload and "sub" in payload:
                db = get_db()
                try:
                    urow = db.execute(
                        "SELECT token_version FROM users WHERE id=? AND is_active=1",
                        (payload["sub"],),
                    ).fetchone()
                    if not urow or urow["token_version"] != payload["token_version"]:
                        db.close()
                        return JSONResponse(status_code=401,
                            content={"detail": "权限已变更，请重新登录"})
                finally:
                    db.close()
            request.state.user = payload
        except JWTError:
            request.state.user = None
        except Exception:
            request.state.user = None

    # --- Phase 2: Legacy protection for settings/config write endpoints ---
    # Only protect settings/config write endpoints when password is enabled
    _protected = (
        ("/api/settings", ("PUT",)),
        ("/api/column-configs/", ("PUT", "POST", "DELETE")),
        ("/api/core-prompt-configs/", ("PUT", "POST", "DELETE")),
        ("/api/tts-configs/", ("PUT", "POST", "DELETE")),
        ("/api/speech-configs/", ("PUT", "POST", "DELETE")),
        ("/api/workspaces/", ("PUT", "DELETE")),
        ("/api/projects/", ("PUT", "DELETE")),
        ("/api/help-manual/", ("PUT", "POST", "DELETE")),
    )
    needs_auth = False
    for prefix, methods in _protected:
        if path.startswith(prefix) and method in methods:
            if prefix in ("/api/projects/", "/api/workspaces/"):
                rest = path[len(prefix):]
                parts = rest.split("/")
                if len(parts) > 1 and parts[1] != "items":
                    continue
            needs_auth = True
            break

    if needs_auth:
        # If already authenticated via JWT (request.state.user is set), skip legacy check
        if request.state.user is not None:
            return await call_next(request)

        stored_hash = _get_setting("admin_password")
        if not stored_hash:
            return await call_next(request)
        enabled = _get_setting("admin_password_enabled")
        if enabled == "0":
            return await call_next(request)

        auth_header_legacy = request.headers.get("Authorization", "")
        if not auth_header_legacy.startswith("Bearer "):
            return JSONResponse(status_code=401, content={"detail": "缺少认证令牌"})
        token_legacy = auth_header_legacy[7:]
        try:
            jwt.decode(token_legacy, SECRET_KEY, algorithms=[ALGORITHM])
        except JWTError:
            return JSONResponse(status_code=401, content={"detail": "无效或过期的令牌"})

    return await call_next(request)


# License middleware: block /api/* routes when unactivated (outermost)
@app.middleware("http")
async def license_middleware(request: Request, call_next):
    path = request.url.path

    _license_endpoints = {
        "/api/license/status",
        "/api/license/activate",
        "/api/license/deactivate",
    }
    # Always allow license endpoints, login, auth check, branding, static assets
    if (path in _license_endpoints
        or path in ("/api/login", "/api/auth/login", "/api/member/login",
                    "/api/member/register",
                    "/api/auth/change-password", "/api/setup/complete",
                    "/api/auth/check",
                    "/api/verify-password", "/api/settings", "/api/version")
        or path.startswith("/api/logos/")
        or path.startswith("/api/help-manual/")
        or path.startswith("/api/download/")
        or not path.startswith("/api/")):
        return await call_next(request)

    # Demo mode: allow all GET requests without license (read-only preview)
    if request.method == "GET":
        return await call_next(request)

    # Check license activation for POST/PUT/DELETE
    activation = check_activation()
    if not activation.get("activated"):
        return JSONResponse(
            status_code=403,
            content={"detail": "未激活许可证", "code": "LICENSE_REQUIRED"},
        )
    return await call_next(request)


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
            if os.path.isabs(path):
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
    return {"status": "ok", "app": _get_site_name()}


# ── Workspaces ──

@app.get("/api/workspaces")
def list_workspaces(page: int = 1, page_size: int = 20, request: Request = None):
    db = get_db()
    try:
        user = getattr(request.state, "user", None) if request else None
        if user and user.get("user_type") == "member":
            uid = user.get("user_id", user.get("sub", ""))
            # member sees workspaces via personal assignment OR role-based assignment
            total = db.execute("""
                SELECT COUNT(DISTINCT w.id) FROM workspaces w
                LEFT JOIN member_workspaces mw ON mw.workspace_id = w.id AND mw.user_id = ?
                LEFT JOIN workspace_roles wr ON wr.workspace_id = w.id
                LEFT JOIN user_roles ur ON ur.role_id = wr.role_id AND ur.user_id = ?
                WHERE mw.user_id IS NOT NULL OR ur.user_id IS NOT NULL
            """, (uid, uid)).fetchone()[0]
            offset = (page - 1) * page_size
            rows = db.execute("""
                SELECT DISTINCT w.* FROM workspaces w
                LEFT JOIN member_workspaces mw ON mw.workspace_id = w.id AND mw.user_id = ?
                LEFT JOIN workspace_roles wr ON wr.workspace_id = w.id
                LEFT JOIN user_roles ur ON ur.role_id = wr.role_id AND ur.user_id = ?
                WHERE mw.user_id IS NOT NULL OR ur.user_id IS NOT NULL
                ORDER BY w.updated_at DESC LIMIT ? OFFSET ?
            """, (uid, uid, page_size, offset)).fetchall()
        else:
            total = db.execute("SELECT COUNT(*) FROM workspaces").fetchone()[0]
            offset = (page - 1) * page_size
            rows = db.execute(
                "SELECT * FROM workspaces ORDER BY updated_at DESC LIMIT ? OFFSET ?",
                (page_size, offset)
            ).fetchall()
        return {"workspaces": [dict(r) for r in rows], "total": total, "page": page, "page_size": page_size}
    finally:
        db.close()


def _copy_seed_configs(db, workspace_id: str):
    """Copy seed configs (workspace_id IS NULL) to a specific workspace.
    Checks each table individually — skips tables that already have workspace data."""
    for table, id_col in [
        ('column_configs', 'id'),
        ('speech_configs', 'id'),
        ('tts_configs', 'id'),
        ('core_prompt_configs', 'id'),
    ]:
        existing = db.execute(
            f"SELECT COUNT(*) FROM {table} WHERE workspace_id = ?", (workspace_id,)).fetchone()[0]
        if existing > 0:
            continue
        seeds = db.execute(
            f"SELECT * FROM {table} WHERE workspace_id IS NULL ORDER BY sort_order").fetchall()
        for s in seeds:
            d = dict(s)
            d[id_col] = uuid.uuid4().hex[:20]
            d['workspace_id'] = workspace_id
            # Strip 'seed-' prefix from prompt_key for core_prompt_configs
            if table == 'core_prompt_configs' and 'prompt_key' in d:
                pk = d['prompt_key']
                if pk and pk.startswith('seed-'):
                    d['prompt_key'] = pk[5:]
            cols = list(d.keys())
            ph = ', '.join(['?'] * len(cols))
            cn = ', '.join(cols)
            db.execute(f"INSERT OR IGNORE INTO {table} ({cn}) VALUES ({ph})", list(d.values()))
    db.commit()


def _copy_workspace_configs(db, target_ws_id: str, source_ws_id: str):
    """Copy configs from source workspace to target workspace (4 tables)."""
    for table, id_col in [
        ('column_configs', 'id'),
        ('speech_configs', 'id'),
        ('tts_configs', 'id'),
        ('core_prompt_configs', 'id'),
    ]:
        rows = db.execute(
            f"SELECT * FROM {table} WHERE workspace_id = ? ORDER BY sort_order",
            (source_ws_id,)).fetchall()
        if not rows:
            continue
        for r in rows:
            d = dict(r)
            d[id_col] = uuid.uuid4().hex[:20]
            d['workspace_id'] = target_ws_id
            cols = list(d.keys())
            ph = ', '.join(['?'] * len(cols))
            cn = ', '.join(cols)
            db.execute(
                f"INSERT OR IGNORE INTO {table} ({cn}) VALUES ({ph})",
                list(d.values()))
    db.commit()


@app.post("/api/workspaces")
def create_workspace(req: WorkspaceCreate, user=require_perm("project.create")):
    wid = uuid.uuid4().hex[:12]
    db = get_db()
    try:
        db.execute("INSERT INTO workspaces (id, name, description, logo, status, created_by) VALUES (?, ?, ?, ?, ?, ?)",
                   (wid, req.name, req.description or '', req.logo or '', req.status or 'draft', user.get("sub", "")))
        db.commit()
        if req.source_workspace_id:
            # Verify source workspace exists
            source_ws = db.execute(
                "SELECT id FROM workspaces WHERE id = ?", (req.source_workspace_id,)).fetchone()
            if not source_ws:
                raise HTTPException(status_code=404, detail="源工作区不存在")
            # Members additionally need explicit access
            if user.get("user_type") == "member":
                uid = user.get("user_id", user.get("sub", ""))
                access = db.execute("""
                    SELECT 1 FROM workspaces w
                    LEFT JOIN member_workspaces mw ON mw.workspace_id = w.id AND mw.user_id = ?
                    LEFT JOIN workspace_roles wr ON wr.workspace_id = w.id
                    LEFT JOIN user_roles ur ON ur.role_id = wr.role_id AND ur.user_id = ?
                    WHERE w.id = ? AND (mw.user_id IS NOT NULL OR ur.user_id IS NOT NULL)
                """, (uid, uid, req.source_workspace_id)).fetchone()
                if not access:
                    raise HTTPException(status_code=403, detail="无权访问源工作区")
            _copy_workspace_configs(db, wid, req.source_workspace_id)
        else:
            _copy_seed_configs(db, wid)

        # Role-based visibility — requires member.manage permission
        if req.role_ids and "member.manage" in (user.get("permissions") or []):
            db.executemany(
                "INSERT OR IGNORE INTO workspace_roles (workspace_id, role_id) VALUES (?, ?)",
                [(wid, rid) for rid in req.role_ids]
            )
            db.commit()

        row = db.execute("SELECT * FROM workspaces WHERE id = ?", (wid,)).fetchone()
        result = dict(row)
        result["role_ids"] = [r[0] for r in db.execute(
            "SELECT role_id FROM workspace_roles WHERE workspace_id = ?", (wid,)
        ).fetchall()]
        return result
    finally:
        db.close()


@app.get("/api/workspaces/{workspace_id}")
def get_workspace(workspace_id: str, request: Request):
    user = getattr(request.state, "user", None)
    if user is not None and user.get("user_type") == "member":
        uid = user.get("user_id", user.get("sub", ""))
        db = get_db()
        try:
            row = db.execute("""
                SELECT 1 FROM member_workspaces WHERE user_id=? AND workspace_id=?
                UNION
                SELECT 1 FROM workspace_roles wr
                JOIN user_roles ur ON ur.role_id = wr.role_id
                WHERE ur.user_id = ? AND wr.workspace_id = ?
            """, (uid, workspace_id, uid, workspace_id)).fetchone()
            if not row:
                raise HTTPException(403, "无权访问此工作区")
        finally:
            db.close()
    db = get_db()
    try:
        row = db.execute(
            "SELECT * FROM workspaces WHERE id = ?", (workspace_id,)).fetchone()
        if not row:
            raise HTTPException(404, "workspace not found")
        result = dict(row)
        result["role_ids"] = [r[0] for r in db.execute(
            "SELECT role_id FROM workspace_roles WHERE workspace_id = ?", (workspace_id,)
        ).fetchall()]
        return result
    finally:
        db.close()


@app.put("/api/workspaces/{workspace_id}")
def update_workspace(workspace_id: str, req: WorkspaceUpdate, user=require_perm("project.edit_own")):
    db = get_db()
    try:
        row = db.execute("SELECT * FROM workspaces WHERE id = ?", (workspace_id,)).fetchone()
        if not row:
            raise HTTPException(404, "workspace not found")
        check_ownership(row["created_by"], user)
        if req.name is not None:
            db.execute("UPDATE workspaces SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                       (req.name, workspace_id))
        if req.status is not None:
            db.execute("UPDATE workspaces SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                       (req.status, workspace_id))
        if req.description is not None:
            db.execute("UPDATE workspaces SET description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                       (req.description, workspace_id))
        if req.logo is not None:
            db.execute("UPDATE workspaces SET logo = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                       (req.logo, workspace_id))
        # Role-based visibility — requires member.manage permission
        if req.role_ids is not None and "member.manage" in (user.get("permissions") or []):
            db.execute("DELETE FROM workspace_roles WHERE workspace_id = ?", (workspace_id,))
            if req.role_ids:
                db.executemany(
                    "INSERT OR IGNORE INTO workspace_roles (workspace_id, role_id) VALUES (?, ?)",
                    [(workspace_id, rid) for rid in req.role_ids]
                )
        db.commit()
        row = db.execute("SELECT * FROM workspaces WHERE id = ?", (workspace_id,)).fetchone()
        result = dict(row)
        result["role_ids"] = [r[0] for r in db.execute(
            "SELECT role_id FROM workspace_roles WHERE workspace_id = ?", (workspace_id,)
        ).fetchall()]
        return result
    finally:
        db.close()


@app.delete("/api/workspaces/{workspace_id}")
def delete_workspace(workspace_id: str, user=require_perm("project.edit_own")):
    db = get_db()
    try:
        row = db.execute("SELECT * FROM workspaces WHERE id = ?", (workspace_id,)).fetchone()
        if not row:
            raise HTTPException(404, "workspace not found")
        check_ownership(row["created_by"], user)
        # Cascade: delete all projects under this workspace
        proj_rows = db.execute(
            "SELECT id FROM projects WHERE workspace_id = ?", (workspace_id,)).fetchall()
        for proj in proj_rows:
            _delete_project_files(proj["id"], db)
        db.execute("DELETE FROM projects WHERE workspace_id = ?", (workspace_id,))
        db.execute("DELETE FROM workspaces WHERE id = ?", (workspace_id,))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.post("/api/workspaces/{workspace_id}/copy-seed-configs")
def copy_seed_configs_to_workspace(workspace_id: str, user=require_perm("project.edit_own")):
    """Copy seed configs to a workspace (idempotent — skips if already exists)."""
    db = get_db()
    try:
        ws = db.execute("SELECT created_by FROM workspaces WHERE id = ?", (workspace_id,)).fetchone()
        if ws:
            check_ownership(ws["created_by"], user)
        all_filled = True
        for tbl in ('column_configs', 'speech_configs', 'tts_configs', 'core_prompt_configs'):
            cnt = db.execute(
                f"SELECT COUNT(*) FROM {tbl} WHERE workspace_id = ?", (workspace_id,)).fetchone()[0]
            if cnt == 0:
                all_filled = False
                break
        if all_filled:
            return {"ok": True, "message": "already has configs"}
        _copy_seed_configs(db, workspace_id)
        return {"ok": True, "message": "copied"}
    finally:
        db.close()


# ── Projects ──

@app.get("/api/projects")
def list_projects(page: int = 1, page_size: int = 20, workspace_id: str = "", request: Request = None):
    db = get_db()
    try:
        user = getattr(request.state, "user", None) if request else None
        if user and user.get("user_type") == "member":
            uid = user.get("user_id", user.get("sub", ""))
            # member sees projects in workspaces they can access (personal OR role-based)
            base_from = """
                FROM projects p
                LEFT JOIN member_workspaces mw ON mw.workspace_id = p.workspace_id AND mw.user_id = ?
                LEFT JOIN workspace_roles wr ON wr.workspace_id = p.workspace_id
                LEFT JOIN user_roles ur ON ur.role_id = wr.role_id AND ur.user_id = ?
            """
            access_clause = "WHERE (mw.user_id IS NOT NULL OR ur.user_id IS NOT NULL)"
            if workspace_id:
                total = db.execute(
                    "SELECT COUNT(*) " + base_from + " " + access_clause + " AND p.workspace_id = ?",
                    (uid, uid, workspace_id)
                ).fetchone()[0]
                offset = (page - 1) * page_size
                rows = db.execute(
                    "SELECT DISTINCT p.* " + base_from + " " + access_clause + " AND p.workspace_id = ?" +
                    " ORDER BY p.updated_at DESC LIMIT ? OFFSET ?",
                    (uid, uid, workspace_id, page_size, offset)
                ).fetchall()
            else:
                total = db.execute(
                    "SELECT COUNT(*) " + base_from + " " + access_clause,
                    (uid, uid)
                ).fetchone()[0]
                offset = (page - 1) * page_size
                rows = db.execute(
                    "SELECT DISTINCT p.* " + base_from + " " + access_clause +
                    " ORDER BY p.updated_at DESC LIMIT ? OFFSET ?",
                    (uid, uid, page_size, offset)
                ).fetchall()
        else:
            if workspace_id:
                total = db.execute("SELECT COUNT(*) FROM projects WHERE workspace_id = ?", (workspace_id,)).fetchone()[0]
                offset = (page - 1) * page_size
                rows = db.execute(
                    "SELECT * FROM projects WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?",
                    (workspace_id, page_size, offset)
                ).fetchall()
            else:
                total = db.execute("SELECT COUNT(*) FROM projects").fetchone()[0]
                offset = (page - 1) * page_size
                rows = db.execute(
                    "SELECT * FROM projects ORDER BY updated_at DESC LIMIT ? OFFSET ?",
                    (page_size, offset)
                ).fetchall()
        return {"projects": [dict(r) for r in rows], "total": total, "page": page, "page_size": page_size}
    finally:
        db.close()


def _init_project_items_from_factory(project_id: str, workspace_id: str = None):
    """Initialize project_items for a new project from its workspace's configs.

    Copies from the project's workspace-specific column_configs, speech_configs,
    tts_configs, and core_prompt_configs into project_items so the project owns
    its independent copies of all prompts.
    """
    db = get_db()
    try:
        # Resolve workspace_id from project if not provided
        if not workspace_id:
            proj = db.execute("SELECT workspace_id FROM projects WHERE id = ?", (project_id,)).fetchone()
            workspace_id = proj["workspace_id"] if proj else None

        col_output_mode = {
            "col1": "text", "col2": "text", "col3": "ppt",
            "col4": "ppt", "col5": "ppt",
        }

        _ws = workspace_id  # shorthand

        # Helper: fetch configs with workspace fallback (ws-specific → NULL/global)
        def _fetch_configs(table: str, ws_id):
            if ws_id:
                rows = db.execute(
                    f"SELECT * FROM {table} WHERE workspace_id = ? ORDER BY sort_order",
                    (ws_id,)).fetchall()
                if not rows:
                    rows = db.execute(
                        f"SELECT * FROM {table} WHERE workspace_id IS NULL ORDER BY sort_order").fetchall()
                return rows
            return db.execute(
                f"SELECT * FROM {table} WHERE workspace_id IS NULL ORDER BY sort_order").fetchall()

        # 1. Column configs → project_items (col1-col5)
        col_configs = _fetch_configs("column_configs", _ws)
        for i, cc in enumerate(col_configs):
            pi_id = f"pi-{project_id}-{cc['column_id']}"
            existing = db.execute(
                "SELECT id FROM project_items WHERE id = ?", (pi_id,)).fetchone()
            if existing:
                continue
            output_mode = col_output_mode.get(cc["column_id"], "text")
            db.execute(
                "INSERT INTO project_items (id, project_id, name, prompt, skill, "
                "output_mode, config_json, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (pi_id, project_id, cc["label"], cc["prompt"] or "", cc["skill"] or "",
                 output_mode, cc["rules"] or "{}", i))

        # 2. Speech configs → project_items
        speech_configs = _fetch_configs("speech_configs", _ws)
        for i, sc in enumerate(speech_configs):
            pi_id = f"pi-{project_id}-speech-{sc['id'].replace('speech-', '')}"
            existing = db.execute(
                "SELECT id FROM project_items WHERE id = ?", (pi_id,)).fetchone()
            if existing:
                continue
            db.execute(
                "INSERT INTO project_items (id, project_id, name, prompt, skill, "
                "output_mode, config_json, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (pi_id, project_id, sc["label"], sc["prompt"] or "", sc["skill"] or "",
                 "speech_config", "{}", 10 + i))

        # 3. TTS configs → project_items
        tts_configs = _fetch_configs("tts_configs", _ws)
        for i, tc in enumerate(tts_configs):
            pi_id = f"pi-{project_id}-tts-{tc['id'].replace('tts-', '')}"
            existing = db.execute(
                "SELECT id FROM project_items WHERE id = ?", (pi_id,)).fetchone()
            if existing:
                continue
            db.execute(
                "INSERT INTO project_items (id, project_id, name, prompt, skill, "
                "output_mode, config_json, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (pi_id, project_id, tc["label"], tc["prompt"] or "", tc["skill"] or "",
                 "tts_config", "{}", 20 + i))

        # 4. Core prompt configs → project_items
        core_configs = _fetch_configs("core_prompt_configs", _ws)
        for i, cpc in enumerate(core_configs):
            safe_key = cpc["prompt_key"].replace("/", "-").replace("\\", "-")
            pi_id = f"pi-{project_id}-core-{safe_key}"
            existing = db.execute(
                "SELECT id FROM project_items WHERE id = ?", (pi_id,)).fetchone()
            if existing:
                continue
            db.execute(
                "INSERT INTO project_items (id, project_id, name, prompt, skill, "
                "output_mode, config_json, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (pi_id, project_id, cpc["label"], cpc["content"] or "", "",
                 "core_prompt", "{}", 30 + i))

        db.commit()
    finally:
        db.close()


@app.post("/api/projects")
def create_project(req: ProjectCreate, user=require_perm("project.create")):
    pid = uuid.uuid4().hex[:12]
    db = get_db()
    try:
        # Verify workspace exists
        ws = db.execute("SELECT id FROM workspaces WHERE id = ?", (req.workspace_id,)).fetchone()
        if not ws:
            raise HTTPException(404, "workspace not found")

        # Compute default storage path
        base = _get_global_save_path()
        folder = _sanitize_folder_name(req.name)
        storage_path = os.path.normpath(req.storage_path or os.path.join(base, folder))
        os.makedirs(storage_path, exist_ok=True)

        # Generate project code KH{YYMMDD}-{seq} (seq resets daily)
        from datetime import date
        today = date.today().strftime("%y%m%d")  # "260627"
        today_prefix = f"KH{today}-%"
        today_count = db.execute(
            "SELECT COUNT(*) FROM projects WHERE project_code LIKE ?", (today_prefix,)
        ).fetchone()[0]
        project_code = f"KH{today}-{today_count + 1:04d}"

        db.execute(
            "INSERT INTO projects (id, name, source_type, storage_path, project_code, workspace_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (pid, req.name, req.source_type, storage_path, project_code, req.workspace_id, user["sub"]))
        db.commit()
        # Initialize project_items from workspace configs
        _init_project_items_from_factory(pid, req.workspace_id)
        row = db.execute("SELECT * FROM projects WHERE id = ?", (pid,)).fetchone()
        return dict(row)
    finally:
        db.close()


@app.get("/api/projects/{project_id}/videos")
def api_project_videos(project_id: str, request: Request):
    """List video files in the project's storage folder."""
    user = getattr(request.state, "user", None)
    if user is not None:
        verify_project_access(project_id, user)
    path = resolve_project_storage(project_id, auto_create=False)
    videos = []
    if os.path.exists(path):
        for f in os.listdir(path):
            if f.lower().endswith(('.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv')):
                full = os.path.join(path, f)
                videos.append({"filename": f, "path": full, "size": os.path.getsize(full)})
    return {"videos": videos, "storage_path": path}


def _ppt_display_name(filename: str, prefix: str = "") -> str:
    """Map technical PPT filenames to human-readable Chinese names.

    When prefix is provided (e.g. "鲍鱼一品煲_课件"), generates project-specific names.
    Without prefix, falls back to generic Chinese labels.
    """
    import re
    name, ext = os.path.splitext(filename)
    suffix_map = {
        'index': '',
        'index_vars': '_变量版',
        'index_backup': '_备份',
        'index_regenerated': '_重新生成',
        'index_regenerated_partial': '_部分重生成',
        'index_regenerated_vars': '_重新生成变量',
    }
    if name in suffix_map:
        base = (prefix + suffix_map[name]) if prefix else {
            'index': '完整课件',
            'index_vars': '完整课件(变量版)',
            'index_backup': '完整课件(备份)',
            'index_regenerated': '完整课件(重新生成)',
            'index_regenerated_partial': '完整课件(部分重生成)',
            'index_regenerated_vars': '完整课件(重新生成变量)',
        }[name]
        return base + ext
    # Map slide_01 → 第1页 / {prefix}_第1页
    m = re.match(r'^slide_(\d+)(_vars)?$', name)
    if m:
        num = int(m.group(1))
        suffix = '_变量版' if m.group(2) else ''
        if prefix:
            return f'{prefix}_第{num}页{suffix}{ext}'
        label = '(变量版)' if m.group(2) else ''
        return f'第{num}页{label}{ext}'
    return filename


@app.get("/api/projects/{project_id}/files")
def api_project_files(project_id: str, request: Request):
    """List all generated output files in the project's storage folder."""
    user = getattr(request.state, "user", None)
    if user is not None:
        verify_project_access(project_id, user)
    path = resolve_project_storage(project_id, auto_create=False)
    files = []

    # Get project name for PPT display naming
    proj_row = None
    proj_db = get_db()
    try:
        proj_row = proj_db.execute("SELECT name FROM projects WHERE id = ?", (project_id,)).fetchone()
    finally:
        proj_db.close()
    proj_name = proj_row["name"] if proj_row else project_id[:8]
    safe_proj = "".join(c for c in proj_name if c.isalnum() or c in "._- ()（）").strip()
    ppt_prefix = f"{safe_proj}_课件" if safe_proj else ""

    # Build display name lookup from tts_history for audio files
    db = get_db()
    tts_names: dict[str, str] = {}
    try:
        rows = db.execute(
            "SELECT audio_path, name, voice_name FROM tts_history WHERE project_id = ? AND audio_path != ''",
            (project_id,)).fetchall()
        for r in rows:
            tts_names[r["audio_path"]] = r["name"] or r["voice_name"] or r["audio_path"]
    finally:
        db.close()

    # Variant suffixes to hide — only final index.html / slide_N.html are shown
    _variant_suffixes = ('_vars', '_backup', '_regenerated', '_regenerated_partial', '_regenerated_vars')

    if os.path.exists(path):
        for f in sorted(os.listdir(path), key=lambda x: os.path.getmtime(os.path.join(path, x)), reverse=True):
            full = os.path.join(path, f)
            if os.path.isfile(full):
                # Skip variant / intermediate PPT HTML files
                name_no_ext = os.path.splitext(f)[0]
                if name_no_ext.endswith(_variant_suffixes):
                    continue
                ext = os.path.splitext(f)[1].lower()
                type_map = {'.pptx': 'PPT', '.docx': 'Word', '.txt': 'Text',
                           '.mp3': 'MP3', '.wav': 'Audio', '.mp4': 'Video'}
                file_type = type_map.get(ext, 'Other')
                # Category by workflow stage
                if ext in ('.txt',):
                    if '文字输入' in f or 'AI整理' in f:
                        category = '1. 素材输入'
                    else:
                        category = '2. 文档生成'
                elif ext in ('.docx',):
                    category = '2. 文档生成'
                elif ext in ('.pptx', '.svg', '.html', '.png', '.jpg'):
                    category = '3. 课件输出'
                elif ext in ('.mp3', '.wav'):
                    category = '4. 演讲课件'
                else:
                    category = '其他'
                # Display name: prefer tts_history name, else filename
                display_name = tts_names.get(f, f)
                # Audio URL for play button
                audio_url = ""
                if ext in ('.mp3', '.wav'):
                    audio_url = f"/api/audio/{f}"
                    params = [f"project_id={project_id}"]
                    dl_name = "".join(c for c in (display_name or f) if c.isalnum() or c in "._- ()（）").strip()
                    if dl_name:
                        params.append(f"name={dl_name}")
                    audio_url += "?" + "&".join(params)
                files.append({
                    "filename": f,
                    "display_name": display_name,
                    "type": file_type,
                    "category": category,
                    "size": os.path.getsize(full),
                    "modified": os.path.getmtime(full),
                    "download_url": f"/api/download/{f}?project_id={project_id}",
                    "audio_url": audio_url,
                })
    # Also include source materials (素材输入)
    db = get_db()
    try:
        sources = db.execute(
            "SELECT id, source_name, source_type, raw_content, created_at FROM source_materials WHERE project_id = ? ORDER BY created_at DESC",
            (project_id,)).fetchall()
        for s in sources:
            fname = s["source_name"] or s["source_type"] or "素材"
            content = s["raw_content"] or ""
            files.append({
                "filename": fname,
                "display_name": s["source_name"] or fname,
                "type": s["source_type"] or '素材',
                "category": '1. 素材输入',
                "size": len(content.encode('utf-8')),
                "modified": 0,
                "download_url": "",
                "audio_url": "",
                "source_name": s["source_name"] or fname,
            })
    finally:
        db.close()

    # Include PPT export runs (课件输出)
    ppt_db = get_db()
    try:
        # Build column_id → label mapping
        col_map: dict[str, str] = {}
        try:
            ws_row = ppt_db.execute("SELECT workspace_id FROM projects WHERE id = ?", (project_id,)).fetchone()
            ws_id = ws_row["workspace_id"] if ws_row else None
            if ws_id:
                col_rows = ppt_db.execute("SELECT column_id, label FROM column_configs WHERE workspace_id = ?", (ws_id,)).fetchall()
            else:
                col_rows = ppt_db.execute("SELECT column_id, label FROM column_configs").fetchall()
            for cr in col_rows:
                col_map[cr["column_id"]] = cr["label"]
        except Exception:
            pass

        runs = ppt_db.execute(
            "SELECT step_name, content FROM step_results WHERE project_id = ? AND step_name LIKE '_ppt_result_%'",
            (project_id,)).fetchall()
        for run_idx, r in enumerate(runs):
            run_id = r["step_name"].replace("_ppt_result_", "", 1)
            run_dir = _run_dirs.get(run_id)
            if not run_dir:
                candidate = os.path.join(EXPORT_DIR, run_id)
                if os.path.isdir(candidate):
                    run_dir = candidate
            if run_dir and os.path.isdir(run_dir):
                # Extract column_id from run_id (e.g. "鲍鱼一品煲_col3" → "col3")
                col_match = re.search(r'_(col\d+[a-z]?)$', run_id)
                col_id = col_match.group(1) if col_match else ""
                col_label = col_map.get(col_id, col_id)
                run_prefix = f"{safe_proj}_{col_label}" if (safe_proj and col_label) else ppt_prefix
                for rf in sorted(os.listdir(run_dir)):
                    rfull = os.path.join(run_dir, rf)
                    if os.path.isfile(rfull):
                        # Skip variant / intermediate files — only show final output
                        _rf_no_ext = os.path.splitext(rf)[0]
                        if _rf_no_ext in ('index_vars', 'index_backup', 'index_regenerated',
                                          'index_regenerated_partial', 'index_regenerated_vars'):
                            continue
                        if _rf_no_ext.endswith('_vars'):
                            continue
                        ext = os.path.splitext(rf)[1].lower()
                        if ext in ('.html', '.svg', '.png', '.jpg'):
                            files.append({
                                "filename": rf,
                                "display_name": _ppt_display_name(rf, run_prefix),
                                "type": ext.upper().lstrip('.'),
                                "category": '3. 课件输出',
                                "size": os.path.getsize(rfull),
                                "modified": os.path.getmtime(rfull),
                                "download_url": f"/api/exports/{run_id}/{rf}",
                                "audio_url": "",
                            })
    finally:
        ppt_db.close()

    return {"files": files, "storage_path": path}


@app.get("/api/projects/{project_id}/download-all")
def api_download_all(project_id: str, request: Request, user=require_perm("stage5.download")):
    """Download all files in a project folder as a zip archive."""
    import zipfile, io
    verify_project_access(project_id, user)
    path = resolve_project_storage(project_id, auto_create=False)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="项目文件夹不存在")
    files = [f for f in os.listdir(path) if os.path.isfile(os.path.join(path, f))]
    if not files:
        raise HTTPException(status_code=404, detail="项目文件夹为空")
    proj = _get_project(project_id)
    safe_name = "".join(c for c in (proj["name"] if proj else project_id) if c.isalnum() or c in "._- ()（）").strip() or project_id[:8]
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in files:
            zf.write(os.path.join(path, f), f)
    buf.seek(0)
    from urllib.parse import quote
    from datetime import datetime
    safe_dl = quote(f"{safe_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip", safe="")
    return Response(content=buf.getvalue(), media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{safe_dl}"})


@app.post("/api/projects/{project_id}/download-selected")
async def api_download_selected(project_id: str, request: Request, user=require_perm("stage5.download")):
    """Download selected files as a zip archive."""
    verify_project_access(project_id, user)
    body = await request.json()
    import zipfile, io
    proj = _get_project(project_id)
    safe_name = "".join(c for c in (proj["name"] if proj else project_id) if c.isalnum() or c in "._- ()（）").strip() or project_id[:8]
    path = resolve_project_storage(project_id, auto_create=False)

    buf = io.BytesIO()
    added = set()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for fd in body.get("files", []):
            filename = fd.get("filename", "")
            download_url = fd.get("download_url", "")
            display_name = fd.get("display_name", filename)
            arcname = display_name or filename

            # Try to resolve the actual file path
            filepath = None
            if download_url and download_url.startswith("/api/exports/"):
                # PPT export file: parse run_id and filename from URL
                parts = download_url.replace("/api/exports/", "").split("/", 1)
                if len(parts) == 2:
                    run_id, rf = parts
                    run_dir = _run_dirs.get(run_id)
                    if not run_dir:
                        candidate = os.path.join(EXPORT_DIR, run_id)
                        if os.path.isdir(candidate):
                            run_dir = candidate
                    if run_dir:
                        candidate = os.path.join(run_dir, rf)
                        if os.path.isfile(candidate):
                            filepath = candidate

            if not filepath and os.path.exists(path):
                candidate = os.path.join(path, filename)
                if os.path.isfile(candidate):
                    filepath = candidate

            if filepath:
                # Ensure unique archive names
                if arcname in added:
                    base, ext = os.path.splitext(arcname)
                    i = 1
                    while f"{base}_{i}{ext}" in added:
                        i += 1
                    arcname = f"{base}_{i}{ext}"
                added.add(arcname)
                zf.write(filepath, arcname)

    if len(added) == 0:
        raise HTTPException(status_code=404, detail="没有找到可下载的文件")

    buf.seek(0)
    from urllib.parse import quote
    from datetime import datetime
    safe_dl = quote(f"{safe_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip", safe="")
    return Response(content=buf.getvalue(), media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{safe_dl}"})


@app.delete("/api/projects/{project_id}/files/{filename:path}")
def api_delete_project_file(project_id: str, filename: str, user=require_perm("project.edit_own")):
    """Delete a single file from project storage."""
    verify_project_access(project_id, user)
    path = resolve_project_storage(project_id, auto_create=False)
    filepath = os.path.join(path, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="文件不存在")
    # Safety: ensure the file is inside the project directory
    if not os.path.realpath(filepath).startswith(os.path.realpath(path)):
        raise HTTPException(status_code=403, detail="非法路径")
    os.remove(filepath)
    return {"ok": True}


@app.get("/api/projects/{project_id}")
def get_project(project_id: str, request: Request):
    user = getattr(request.state, "user", None)
    if user is not None:
        verify_project_access(project_id, user)
    db = get_db()
    try:
        row = db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Project not found")
        return dict(row)
    finally:
        db.close()


@app.put("/api/projects/{project_id}")
def update_project(project_id: str, req: ProjectUpdate, user=require_perm("project.edit_own")):
    db = get_db()
    try:
        existing = db.execute("SELECT id, created_by FROM projects WHERE id = ?", (project_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Project not found")
        check_ownership(existing["created_by"], user)

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


@app.get("/api/fs/dirs")
def api_list_fs_dirs(path: str = ""):
    """List subdirectories at any filesystem path. Empty path returns drive letters on Windows."""
    import platform
    # Empty path on Windows: return drive letters
    if not path:
        if platform.system() == "Windows":
            import string
            drives = []
            for letter in string.ascii_uppercase:
                p = f"{letter}:\\"
                if os.path.exists(p):
                    drives.append(p)
            return {"ok": True, "dirs": sorted(drives), "path": "", "parent": None}
        else:
            path = "/"
    target = os.path.normpath(path)
    if not os.path.exists(target):
        return {"ok": True, "dirs": [], "path": path, "parent": None}
    if not os.path.isdir(target):
        raise HTTPException(400, "Path is not a directory")
    try:
        entries = os.listdir(target)
    except PermissionError:
        return {"ok": True, "dirs": [], "path": path, "parent": os.path.normpath(os.path.join(target, '..')) if path else None}
    dirs = sorted([
        e for e in entries
        if os.path.isdir(os.path.join(target, e)) and not e.startswith('.')
    ])
    # Parent: full path of parent, or null if at root
    parent_dir = os.path.dirname(target)
    if parent_dir == target:
        parent = None  # At filesystem root
    else:
        parent = parent_dir
    return {"ok": True, "dirs": dirs, "path": path, "parent": parent}


@app.post("/api/fs/mkdir")
async def api_create_fs_dir(request: Request, user=require_perm("config.project")):
    """Create a new directory at the given parent path."""
    req = await request.json()
    parent = req.get("parent", "")
    name = req.get("name", "").strip()
    if not parent or not name:
        raise HTTPException(400, "parent and name are required")
    # Reject names that contain path separators or traversal
    if '/' in name or '\\' in name or name in ('.', '..'):
        raise HTTPException(400, "Invalid directory name")
    if not os.path.exists(parent) or not os.path.isdir(parent):
        raise HTTPException(400, "Parent directory does not exist")
    target = os.path.join(parent, name)
    if os.path.exists(target):
        raise HTTPException(409, "Directory already exists")
    os.makedirs(target)
    return {"ok": True, "path": target}


@app.get("/api/projects/{project_id}/directories")
def api_list_project_directories(project_id: str, subdir: str = "", request: Request = None):
    """List subdirectories under the project storage path (or a subdirectory thereof)."""
    user = getattr(request.state, "user", None) if request else None
    if user is not None:
        verify_project_access(project_id, user)
    base = resolve_project_storage(project_id, auto_create=False)
    if not os.path.exists(base):
        return {"ok": True, "dirs": [], "base": base, "subdir": subdir}
    target = os.path.normpath(os.path.join(base, subdir))
    # Prevent path traversal
    if os.path.commonpath([os.path.abspath(target), os.path.abspath(base)]) != os.path.abspath(base):
        raise HTTPException(403, "Path traversal denied")
    try:
        entries = os.listdir(target)
    except FileNotFoundError:
        return {"ok": True, "dirs": [], "base": base, "subdir": subdir}
    dirs = sorted([
        e for e in entries
        if os.path.isdir(os.path.join(target, e)) and not e.startswith('.')
    ])
    parent = None
    if subdir:
        parent = os.path.normpath(os.path.join(subdir, '..'))
        if parent == '.':
            parent = ''
    return {"ok": True, "dirs": dirs, "base": base, "subdir": subdir, "parent": parent}


@app.post("/api/projects/{project_id}/save-file")
def api_save_file_to_project(project_id: str, req: dict, user=require_perm("project.edit_own")):
    verify_project_access(project_id, user)
    """Save content to a file. If target_dir is provided (absolute path), use it directly.
    Otherwise resolve relative to the project's storage directory."""
    filename = req.get("filename", "document.txt")
    content = req.get("content", "")
    encoding = req.get("encoding", "text")
    target_dir = req.get("target_dir", "")
    subdir = req.get("subdir", "")

    if target_dir and os.path.isabs(target_dir):
        # Use the absolute path directly (from filesystem browser)
        if not os.path.exists(target_dir):
            raise HTTPException(400, f"Target directory does not exist: {target_dir}")
        if not os.path.isdir(target_dir):
            raise HTTPException(400, f"Target path is not a directory: {target_dir}")
        os.makedirs(target_dir, exist_ok=True)
    elif subdir:
        path = resolve_project_storage(project_id)
        os.makedirs(path, exist_ok=True)
        target_dir = os.path.normpath(os.path.join(path, subdir))
        if os.path.commonpath([os.path.abspath(target_dir), os.path.abspath(path)]) != os.path.abspath(path):
            raise HTTPException(403, "Path traversal denied")
        os.makedirs(target_dir, exist_ok=True)
    else:
        target_dir = resolve_project_storage(project_id)
        os.makedirs(target_dir, exist_ok=True)

    filepath = os.path.join(target_dir, filename)
    # Avoid overwriting: append (1), (2), etc. if file exists
    if os.path.exists(filepath):
        base_name, ext = os.path.splitext(filename)
        n = 1
        while os.path.exists(os.path.join(target_dir, f"{base_name}({n}){ext}")):
            n += 1
        filename = f"{base_name}({n}){ext}"
        filepath = os.path.join(target_dir, filename)
    import base64
    if encoding == "base64":
        with open(filepath, "wb") as f:
            f.write(base64.b64decode(content))
    else:
        with open(filepath, "w", encoding="utf-8") as f:
            f.write(content)
    return {"ok": True, "path": filepath, "filename": filename, "target_dir": target_dir}


def _delete_project_files(project_id: str, db):
    """Remove project storage directory and all related data."""
    db.execute("DELETE FROM source_materials WHERE project_id = ?", (project_id,))
    db.execute("DELETE FROM project_item_results WHERE project_item_id IN (SELECT id FROM project_items WHERE project_id = ?)", (project_id,))
    db.execute("DELETE FROM project_items WHERE project_id = ?", (project_id,))
    db.execute("DELETE FROM step_results WHERE project_id = ?", (project_id,))
    try:
        path = resolve_project_storage(project_id, auto_create=False)
        if os.path.exists(path):
            shutil.rmtree(path)
    except Exception:
        pass


@app.delete("/api/projects/{project_id}")
def delete_project(project_id: str, user=require_perm("project.delete_own")):
    db = get_db()
    try:
        row = db.execute("SELECT is_locked, created_by FROM projects WHERE id = ?", (project_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Project not found")
        check_ownership(row["created_by"], user)
        if row["is_locked"]:
            raise HTTPException(403, "项目已锁定，无法删除")
        _delete_project_files(project_id, db)
        db.execute("DELETE FROM projects WHERE id = ?", (project_id,))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.post("/api/projects/batch-delete")
def batch_delete_projects(req: dict, user=require_perm("project.delete_own")):
    ids = req.get("ids", [])
    if not ids:
        raise HTTPException(400, "ids required")
    db = get_db()
    try:
        placeholders = ",".join(["?"] * len(ids))
        rows = db.execute(
            f"SELECT id, name, is_locked, created_by FROM projects WHERE id IN ({placeholders})", ids
        ).fetchall()
        # Check ownership for all projects
        for r in rows:
            check_ownership(r["created_by"], user)
        locked_rows = [r for r in rows if r["is_locked"]]
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
def get_steps(project_id: str, request: Request):
    user = getattr(request.state, "user", None)
    if user is not None:
        verify_project_access(project_id, user)
    db = get_db()
    try:
        rows = db.execute(
            "SELECT * FROM step_results WHERE project_id = ? ORDER BY step_name", (project_id,)
        ).fetchall()
        return {"steps": [dict(r) for r in rows]}
    finally:
        db.close()


@app.put("/api/projects/{project_id}/steps/{step_name}")
def save_step(project_id: str, step_name: str, req: StepResultSave, user=require_perm("project.edit_own")):
    verify_project_access(project_id, user)
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


def save_step_meta(project_id: str, step_name: str, content: str):
    """Save result metadata to step_results (fire-and-forget, no fail on error)."""
    try:
        db = get_db()
        try:
            existing = db.execute(
                "SELECT id FROM step_results WHERE project_id = ? AND step_name = ?",
                (project_id, step_name)).fetchone()
            if existing:
                db.execute(
                    "UPDATE step_results SET content = ?, content_type = 'json', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                    (content, existing["id"]))
            else:
                db.execute(
                    "INSERT INTO step_results (project_id, step_name, content, content_type) VALUES (?, ?, ?, 'json')",
                    (project_id, step_name, content))
            db.commit()
        finally:
            db.close()
    except Exception:
        pass  # non-critical, don't fail the request


# ── Source Materials (multi-format input) ──

@app.get("/api/projects/{project_id}/materials")
def list_materials(project_id: str, request: Request):
    user = getattr(request.state, "user", None)
    if user is not None:
        verify_project_access(project_id, user)
    db = get_db()
    try:
        rows = db.execute(
            "SELECT * FROM source_materials WHERE project_id = ? ORDER BY created_at DESC",
            (project_id,)).fetchall()
        return {"materials": [dict(r) for r in rows]}
    finally:
        db.close()


@app.post("/api/projects/{project_id}/materials")
def add_material(project_id: str, req: SourceMaterialCreate, user=require_perm("project.edit_own")):
    verify_project_access(project_id, user)
    db = get_db()
    try:
        mat_id = f"sm-{project_id}-{uuid.uuid4().hex[:8]}"
        db.execute(
            "INSERT INTO source_materials (id, project_id, source_type, source_name, "
            "raw_content, processed_content, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (mat_id, project_id, req.source_type, req.source_name,
             req.raw_content, req.processed_content or req.raw_content, req.status))
        db.commit()
        row = db.execute("SELECT * FROM source_materials WHERE id = ?", (mat_id,)).fetchone()
        return dict(row)
    finally:
        db.close()


@app.post("/api/projects/{project_id}/materials/upload")
async def upload_material(project_id: str, file: UploadFile = File(...), user=require_perm("project.edit_own")):
    verify_project_access(project_id, user)
    from services.file_parser import parse_bytes

    data = await file.read()
    result = parse_bytes(data, file.filename or "unknown")

    db = get_db()
    try:
        mat_id = f"sm-{project_id}-{uuid.uuid4().hex[:8]}"
        source_type = os.path.splitext(file.filename or "")[1].lower().lstrip(".")
        db.execute(
            "INSERT INTO source_materials (id, project_id, source_type, source_name, "
            "raw_content, processed_content, status) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (mat_id, project_id, source_type, file.filename or "",
             result.get("text", ""), result.get("text", ""),
             "processed" if result.get("status") == "ok" else "error"))
        db.commit()
        row = db.execute("SELECT * FROM source_materials WHERE id = ?", (mat_id,)).fetchone()
        return {
            "material": dict(row),
            "parse_result": result,
        }
    finally:
        db.close()


@app.delete("/api/projects/{project_id}/materials/{material_id}")
def delete_material(project_id: str, material_id: str, user=require_perm("project.edit_own")):
    verify_project_access(project_id, user)
    db = get_db()
    try:
        db.execute("DELETE FROM source_materials WHERE id = ? AND project_id = ?",
                   (material_id, project_id))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.put("/api/projects/{project_id}/materials/{material_id}")
def update_material(project_id: str, material_id: str, req: SourceMaterialUpdate, user=require_perm("project.edit_own")):
    verify_project_access(project_id, user)
    db = get_db()
    try:
        existing = db.execute("SELECT id FROM source_materials WHERE id = ? AND project_id = ?",
                              (material_id, project_id)).fetchone()
        if not existing:
            raise HTTPException(404, "Material not found")
        updates = {}
        for k in ("source_name", "raw_content", "processed_content", "status"):
            v = getattr(req, k, None)
            if v is not None:
                updates[k] = v
        if updates:
            cols = ", ".join(f"{k} = ?" for k in updates)
            vals = list(updates.values())
            db.execute(f"UPDATE source_materials SET {cols} WHERE id = ?", vals + [material_id])
            db.commit()
        row = db.execute("SELECT * FROM source_materials WHERE id = ?", (material_id,)).fetchone()
        return dict(row)
    finally:
        db.close()


# ── Project Items (dynamic output steps) ──

@app.get("/api/projects/{project_id}/items")
def list_project_items(project_id: str, output_mode: str = "", request: Request = None):
    if request is not None:
        user = getattr(request.state, "user", None)
        if user is not None:
            verify_project_access(project_id, user)
    db = get_db()
    try:
        if output_mode:
            rows = db.execute(
                "SELECT pi.*, "
                "  (SELECT COUNT(*) FROM project_item_results WHERE project_item_id = pi.id) as result_count "
                "FROM project_items pi WHERE pi.project_id = ? AND pi.output_mode = ? ORDER BY pi.sort_order",
                (project_id, output_mode)).fetchall()
        else:
            rows = db.execute(
                "SELECT pi.*, "
                "  (SELECT COUNT(*) FROM project_item_results WHERE project_item_id = pi.id) as result_count "
                "FROM project_items pi WHERE pi.project_id = ? ORDER BY pi.sort_order",
                (project_id,)).fetchall()
        return {"items": [dict(r) for r in rows]}
    finally:
        db.close()


@app.post("/api/projects/{project_id}/items")
def create_project_item(project_id: str, req: ProjectItemCreate, user=require_perm("project.edit_own")):
    verify_project_access(project_id, user)
    db = get_db()
    try:
        item_id = f"pi-{project_id}-{uuid.uuid4().hex[:8]}"
        db.execute(
            "INSERT INTO project_items (id, project_id, name, prompt, skill, "
            "output_mode, config_json, source_item_id, sort_order) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (item_id, project_id, req.name, req.prompt, req.skill,
             req.output_mode, req.config_json, req.source_item_id, req.sort_order))
        db.commit()
        row = db.execute("SELECT * FROM project_items WHERE id = ?", (item_id,)).fetchone()
        return dict(row)
    finally:
        db.close()


@app.put("/api/projects/{project_id}/items/{item_id}")
def update_project_item(project_id: str, item_id: str, req: ProjectItemUpdate, user=require_perm("project.edit_own")):
    verify_project_access(project_id, user)
    db = get_db()
    try:
        existing = db.execute("SELECT id FROM project_items WHERE id = ? AND project_id = ?",
                              (item_id, project_id)).fetchone()
        if not existing:
            raise HTTPException(404, "Item not found")
        updates = {}
        for k in ("name", "prompt", "skill", "output_mode", "config_json",
                   "source_item_id", "sort_order", "status"):
            v = getattr(req, k, None)
            if v is not None:
                updates[k] = v
        if updates:
            updates["updated_at"] = "CURRENT_TIMESTAMP"
            cols = ", ".join(f"{k} = ?" for k in updates if k != "updated_at")
            vals = [updates[k] for k in updates if k != "updated_at"]
            db.execute(f"UPDATE project_items SET {cols}, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                       vals + [item_id])
            db.commit()
        row = db.execute("SELECT * FROM project_items WHERE id = ?", (item_id,)).fetchone()
        return dict(row)
    finally:
        db.close()


@app.delete("/api/projects/{project_id}/items/{item_id}")
def delete_project_item(project_id: str, item_id: str, user=require_perm("project.edit_own")):
    verify_project_access(project_id, user)
    db = get_db()
    try:
        db.execute("DELETE FROM project_item_results WHERE project_item_id = ?", (item_id,))
        db.execute("DELETE FROM project_items WHERE id = ? AND project_id = ?",
                   (item_id, project_id))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.post("/api/projects/{project_id}/items/copy-from/{source_project_id}")
def copy_project_items(project_id: str, source_project_id: str, user=require_perm("project.edit_own")):
    verify_project_access(project_id, user)
    verify_project_access(source_project_id, user)
    """Copy all project_items from source project to target project."""
    db = get_db()
    try:
        source_items = db.execute(
            "SELECT * FROM project_items WHERE project_id = ? ORDER BY sort_order",
            (source_project_id,)).fetchall()
        count = 0
        # Build old→new ID mapping for source_item_id remapping
        id_map = {}
        for si in source_items:
            new_id = f"pi-{project_id}-{uuid.uuid4().hex[:8]}"
            id_map[si["id"]] = new_id
        for si in source_items:
            new_id = id_map[si["id"]]
            new_source = id_map.get(si["source_item_id"], si["source_item_id"]) if si["source_item_id"] else None
            db.execute(
                "INSERT INTO project_items (id, project_id, name, prompt, skill, "
                "output_mode, config_json, source_item_id, sort_order) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (new_id, project_id, si["name"], si["prompt"], si["skill"],
                 si["output_mode"], si["config_json"], new_source, si["sort_order"]))
            count += 1
        db.commit()
        return {"ok": True, "copied": count}
    finally:
        db.close()


@app.post("/api/projects/{project_id}/items/init-from-factory")
def init_project_items_from_factory(project_id: str, user=require_perm("project.edit_own")):
    verify_project_access(project_id, user)
    """Initialize project_items from global factory configs for an existing project.
    Skips items that already exist (based on standard ID pattern).
    """
    _init_project_items_from_factory(project_id)
    return {"ok": True}


# ── Project Item Results ──

@app.get("/api/projects/{project_id}/items/{item_id}/results")
def list_item_results(project_id: str, item_id: str, request: Request):
    user = getattr(request.state, "user", None)
    if user is not None:
        verify_project_access(project_id, user)
    db = get_db()
    try:
        rows = db.execute(
            "SELECT * FROM project_item_results WHERE project_item_id = ? ORDER BY created_at DESC",
            (item_id,)).fetchall()
        return {"results": [dict(r) for r in rows]}
    finally:
        db.close()


@app.post("/api/projects/{project_id}/items/{item_id}/results")
def save_item_result(project_id: str, item_id: str, req: ProjectItemResultSave, user=require_perm("project.edit_own")):
    verify_project_access(project_id, user)
    db = get_db()
    try:
        existing = db.execute(
            "SELECT id FROM project_items WHERE id = ? AND project_id = ?",
            (item_id, project_id)).fetchone()
        if not existing:
            raise HTTPException(404, "Item not found")
        db.execute(
            "INSERT INTO project_item_results (project_item_id, content, content_type, "
            "file_path, quality_score) VALUES (?, ?, ?, ?, ?)",
            (item_id, req.content, req.content_type, req.file_path, req.quality_score))
        db.commit()
        rid = db.execute("SELECT last_insert_rowid()").fetchone()[0]
        row = db.execute("SELECT * FROM project_item_results WHERE id = ?", (rid,)).fetchone()
        return dict(row)
    finally:
        db.close()


# ── Project Copy ──

@app.post("/api/projects/{project_id}/copy")
def copy_project(project_id: str, user=require_perm("project.create")):
    verify_project_access(project_id, user)
    """Copy a project and all its items (the project IS the template)."""
    db = get_db()
    try:
        src = db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        if not src:
            raise HTTPException(404, "Source project not found")
        new_id = uuid.uuid4().hex[:12]
        from datetime import date
        today = date.today().strftime("%y%m%d")
        today_prefix = f"KH{today}-%"
        today_count = db.execute(
            "SELECT COUNT(*) FROM projects WHERE project_code LIKE ?", (today_prefix,)
        ).fetchone()[0]
        project_code = f"KH{today}-{today_count + 1:04d}"
        db.execute(
            "INSERT INTO projects (id, name, storage_path, copied_from_project_id, project_code) "
            "VALUES (?, ?, ?, ?, ?)",
            (new_id, f"{src['name']} (副本)", "", project_id, project_code))
        db.commit()
        # Copy project items
        copy_project_items(new_id, project_id, user=user)
        return {"ok": True, "project": {"id": new_id, "name": f"{src['name']} (副本)"}}
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
def create_llm_provider(req: LLMProviderCreate, user=require_perm("config.global")):
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
def update_llm_provider(provider_id: str, req: LLMProviderCreate, user=require_perm("config.global")):
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
def delete_llm_provider(provider_id: str, user=require_perm("config.global")):
    db = get_db()
    try:
        db.execute("DELETE FROM llm_providers WHERE id = ?", (provider_id,))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.post("/api/llm/providers/{provider_id}/test")
async def test_provider(provider_id: str, user=require_perm("config.global")):
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
    volume: Optional[int] = None
    speed: Optional[float] = None


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
def create_tts_provider(req: TTSProviderCreate, user=require_perm("config.global")):
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
def update_tts_provider(provider_id: str, req: TTSProviderCreate, user=require_perm("config.global")):
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
def delete_tts_provider(provider_id: str, user=require_perm("config.global")):
    db = get_db()
    try:
        db.execute("DELETE FROM tts_providers WHERE id = ?", (provider_id,))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.post("/api/tts/providers/{provider_id}/test")
async def test_tts_provider(provider_id: str, user=require_perm("config.global")):
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
def create_asr_provider(req: ASRProviderCreate, user=require_perm("config.global")):
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
def update_asr_provider(provider_id: str, req: ASRProviderCreate, user=require_perm("config.global")):
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
def delete_asr_provider(provider_id: str, user=require_perm("config.global")):
    db = get_db()
    try:
        db.execute("DELETE FROM asr_providers WHERE id = ?", (provider_id,))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.post("/api/asr/providers/{provider_id}/test")
async def test_asr_provider(provider_id: str, user=require_perm("config.global")):
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


# ── Image Providers ──

class ImageProviderCreate(BaseModel):
    name: str
    api_key: str = ""
    base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    models: list[str] = []
    is_default: int = 0


@app.get("/api/image/providers")
def list_image_providers():
    db = get_db()
    try:
        rows = db.execute("SELECT * FROM image_providers ORDER BY created_at").fetchall()
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


@app.post("/api/image/providers")
def create_image_provider(req: ImageProviderCreate, user=require_perm("config.global")):
    pid = uuid.uuid4().hex[:8]
    db = get_db()
    try:
        if req.is_default:
            db.execute("UPDATE image_providers SET is_default = 0")
        db.execute(
            "INSERT INTO image_providers (id, name, api_key, base_url, models, is_default) VALUES (?, ?, ?, ?, ?, ?)",
            (pid, req.name, req.api_key, req.base_url, json.dumps(req.models, ensure_ascii=False), req.is_default))
        db.commit()
        return {"id": pid, "name": req.name}
    finally:
        db.close()


@app.put("/api/image/providers/{provider_id}")
def update_image_provider(provider_id: str, req: ImageProviderCreate, user=require_perm("config.global")):
    db = get_db()
    try:
        if req.is_default:
            db.execute("UPDATE image_providers SET is_default = 0")
        db.execute(
            "UPDATE image_providers SET name=?, api_key=?, base_url=?, models=?, is_default=? WHERE id=?",
            (req.name, req.api_key, req.base_url, json.dumps(req.models, ensure_ascii=False), req.is_default, provider_id))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.get("/api/image/providers/{provider_id}")
def get_image_provider(provider_id: str):
    """Get a single provider with full (unmasked) API key for editing."""
    db = get_db()
    try:
        row = db.execute("SELECT * FROM image_providers WHERE id = ?", (provider_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Provider not found")
        p = dict(row)
        models_str = p.get("models", "[]")
        p["models"] = json.loads(models_str) if models_str else []
        return p
    finally:
        db.close()


@app.delete("/api/image/providers/{provider_id}")
def delete_image_provider(provider_id: str, user=require_perm("config.global")):
    db = get_db()
    try:
        db.execute("DELETE FROM image_providers WHERE id = ?", (provider_id,))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.post("/api/image/providers/{provider_id}/test")
async def test_image_provider(provider_id: str, user=require_perm("config.global")):
    import httpx
    db = get_db()
    try:
        row = db.execute("SELECT * FROM image_providers WHERE id = ?", (provider_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Provider not found")
        base_url = row["base_url"].rstrip("/")
        test_url = f"{base_url}/models"
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(
                test_url,
                headers={"Authorization": f"Bearer {row['api_key']}"},
            )
        if resp.status_code in (200, 201):
            return {"ok": True, "status": resp.status_code}
        return {"ok": False, "error": f"HTTP {resp.status_code}: {resp.text[:200]}"}
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
def create_voice(data: VoiceCreate, user=require_perm("stage4.generate")):
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
def update_voice(voice_id: str, data: VoiceUpdate, user=require_perm("stage4.generate")):
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
        if data.volume is not None:
            updates["volume"] = data.volume
        if data.speed is not None:
            updates["speed"] = data.speed
        if updates:
            set_clause = ", ".join(f"{k} = ?" for k in updates)
            values = list(updates.values()) + [voice_id]
            db.execute(f"UPDATE voices SET {set_clause} WHERE id = ?", values)
            db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.delete("/api/voices/{voice_id}")
def delete_voice(voice_id: str, user=require_perm("stage4.generate")):
    db = get_db()
    try:
        db.execute("DELETE FROM voices WHERE id = ?", (voice_id,))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.post("/api/voices/{voice_id}/preview")
def preview_voice(voice_id: str, user=require_perm("stage4.view")):
    """Generate a short preview audio for a voice (local cache first, TTS API fallback)"""
    db = get_db()
    try:
        voice = db.execute(
            "SELECT v.*, p.api_key, p.base_url FROM voices v LEFT JOIN tts_providers p ON v.provider_id = p.id WHERE v.id = ?",
            (voice_id,)).fetchone()
        if not voice:
            raise HTTPException(status_code=404, detail="Voice not found")

        # Return cached local preview file if it exists
        preview_path = voice["preview_audio_path"]
        if preview_path and os.path.exists(preview_path):
            filename = os.path.basename(preview_path)
            return {"audio_url": f"/api/audio/{filename}"}

        if not voice["api_key"]:
            raise HTTPException(status_code=400, detail="关联的 TTS 提供商未配置 API Key")

        import httpx
        base_url = voice["base_url"].rstrip("/")
        tts_url = f"{base_url}/services/audio/tts/SpeechSynthesizer"

        # Determine model from the voice_id prefix (voice_id is always {model}-{suffix})
        _known_models = ["cosyvoice-v3-flash", "cosyvoice-v3-plus", "cosyvoice-v3.5-plus"]
        model = "cosyvoice-v3-flash"  # default
        vid = voice["voice_id"]
        for m in _known_models:
            if vid.startswith(m):
                model = m
                break

        payload = {
            "model": model,
            "input": {"text": "你好，这是一条音色预览测试。", "voice": vid, "format": "mp3"},
        }
        with httpx.Client(timeout=120) as client:
            resp = client.post(
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


class VoiceDesignRequest(BaseModel):
    name: str
    model: str = "cosyvoice-v3.5-plus"
    voice_prompt: str = ""
    preview_text: str = ""


@app.post("/api/voices/clone")
async def api_voice_clone(name: str = Form(...), model: str = Form("cosyvoice-v3.5-plus"),
                          audio: UploadFile = File(...), provider_id: str = Form(""),
                          user=require_perm("stage4.generate")):
    """Clone a voice from an audio sample."""
    audio_bytes = await audio.read()
    ext = (audio.filename or "voice.wav").rsplit(".", 1)[-1] if "." in (audio.filename or "") else "wav"
    sample_filename = f"{uuid.uuid4().hex}.{ext}"
    sample_path = os.path.join(AUDIO_DIR, sample_filename)
    with open(sample_path, "wb") as f:
        f.write(audio_bytes)

    # Resolve TTS API credentials
    api_key = ""
    base_url = "https://dashscope.aliyuncs.com/api/v1"
    resolved_provider_id = provider_id
    tts_db = get_db()
    try:
        if provider_id:
            provider = tts_db.execute(
                "SELECT * FROM tts_providers WHERE id = ? AND is_enabled = 1",
                (provider_id,)).fetchone()
        else:
            provider = tts_db.execute(
                "SELECT * FROM tts_providers WHERE is_enabled = 1 ORDER BY created_at LIMIT 1"
            ).fetchone()
            if provider:
                resolved_provider_id = provider["id"]
        if provider:
            api_key = provider["api_key"]
            base_url = provider["base_url"]
    finally:
        tts_db.close()
    if not api_key:
        api_key = _get_setting("tts_api_key") or os.getenv("DASHSCOPE_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=400, detail="请先在项目配置中设置 TTS API Key")

    try:
        result = await clone_voice(name, model, audio_bytes, sample_filename, api_key, base_url)
    except Exception as e:
        # Clean up sample on failure
        if os.path.exists(sample_path):
            os.remove(sample_path)
        raise HTTPException(status_code=400, detail=str(e))

    db = get_db()
    try:
        db.execute(
            "INSERT INTO voices (id, name, provider_id, voice_id, description, preview_audio_path) VALUES (?, ?, ?, ?, ?, ?)",
            (result["voice_id"], name, resolved_provider_id, result["voice_id"], "", sample_path))
        db.commit()
    finally:
        db.close()

    return {"voice_id": result["voice_id"], "name": name, "request_id": result.get("request_id")}


@app.post("/api/voices/design")
async def api_voice_design(req: VoiceDesignRequest, provider_id: str = "", user=require_perm("stage4.generate")):
    """Design a voice from text description."""
    api_key = ""
    base_url = "https://dashscope.aliyuncs.com/api/v1"
    resolved_provider_id = provider_id
    tts_db = get_db()
    try:
        if provider_id:
            provider = tts_db.execute(
                "SELECT * FROM tts_providers WHERE id = ? AND is_enabled = 1",
                (provider_id,)).fetchone()
        else:
            provider = tts_db.execute(
                "SELECT * FROM tts_providers WHERE is_enabled = 1 ORDER BY created_at LIMIT 1"
            ).fetchone()
            if provider:
                resolved_provider_id = provider["id"]
        if provider:
            api_key = provider["api_key"]
            base_url = provider["base_url"]
    finally:
        tts_db.close()
    if not api_key:
        api_key = _get_setting("tts_api_key") or os.getenv("DASHSCOPE_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=400, detail="请先在项目配置中设置 TTS API Key")

    try:
        result = await design_voice(req.name, req.model, req.voice_prompt, req.preview_text, api_key, base_url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Generate preview audio as sample
    sample_path = ""
    try:
        import httpx
        tts_url = base_url.rstrip("/") + "/services/audio/tts/SpeechSynthesizer"
        payload = {
            "model": req.model,
            "input": {"text": req.preview_text, "voice": result["voice_id"], "format": "mp3"},
        }
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                tts_url,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=payload,
            )
        if resp.status_code == 200:
            tts_result = resp.json()
            audio_url = tts_result.get("output", {}).get("audio", {}).get("url", "")
            if audio_url and _is_safe_audio_url(audio_url):
                async with httpx.AsyncClient(timeout=60) as client:
                    dl = await client.get(audio_url)
                    if dl.status_code == 200:
                        sample_filename = f"{result['voice_id']}.mp3"
                        sample_path = os.path.join(AUDIO_DIR, sample_filename)
                        with open(sample_path, "wb") as f:
                            f.write(dl.content)
    except Exception:
        pass  # sample generation is best-effort

    db = get_db()
    try:
        db.execute(
            "INSERT INTO voices (id, name, provider_id, voice_id, description, preview_audio_path) VALUES (?, ?, ?, ?, ?, ?)",
            (result["voice_id"], req.name, resolved_provider_id, result["voice_id"], req.voice_prompt, sample_path))
        db.commit()
    finally:
        db.close()

    return {"voice_id": result["voice_id"], "name": req.name, "request_id": result.get("request_id")}


@app.get("/api/voices/clones")
def list_cloned_voices(provider_id: str = "", page: int = 1, size: int = 20):
    """List cloned/designed voices (non-default, with preview_audio_path)."""
    db = get_db()
    try:
        if provider_id:
            rows = db.execute(
                "SELECT * FROM voices WHERE provider_id = ? AND is_default = 0 ORDER BY created_at DESC LIMIT ? OFFSET ?",
                (provider_id, size, (page - 1) * size)).fetchall()
            total = db.execute("SELECT COUNT(*) FROM voices WHERE provider_id = ? AND is_default = 0",
                               (provider_id,)).fetchone()[0]
        else:
            rows = db.execute(
                "SELECT * FROM voices WHERE is_default = 0 ORDER BY created_at DESC LIMIT ? OFFSET ?",
                (size, (page - 1) * size)).fetchall()
            total = db.execute("SELECT COUNT(*) FROM voices WHERE is_default = 0").fetchone()[0]
        return {"clones": [dict(r) for r in rows], "total": total, "page": page}
    finally:
        db.close()


@app.delete("/api/voices/clone/{voice_id}")
def delete_cloned_voice(voice_id: str, user=require_perm("stage4.generate")):
    """Delete a cloned voice and its sample audio."""
    db = get_db()
    try:
        row = db.execute(
            "SELECT preview_audio_path FROM voices WHERE id = ? AND is_default = 0",
            (voice_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Voice not found")
        if row["preview_audio_path"] and os.path.exists(row["preview_audio_path"]):
            os.remove(row["preview_audio_path"])
        db.execute("DELETE FROM voices WHERE id = ? AND is_default = 0", (voice_id,))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


# ── LLM Calls ──

@app.post("/api/llm/generate")
async def llm_generate(req: LLMGenerateRequest, user=require_perm("stage2.generate")):
    import time, sys
    t0 = time.time()
    print(f"[LLM-REQ] {time.strftime('%H:%M:%S')} provider={req.provider_id} model={req.model} "
          f"sys_len={len(req.system_prompt)} user_len={len(req.user_message)} temp={req.temperature}",
          flush=True)
    try:
        result = await generate(req.provider_id, req.model, req.system_prompt, req.user_message, req.temperature)
        dt = (time.time() - t0) * 1000
        print(f"[LLM-OK]  {time.strftime('%H:%M:%S')} model={req.model} dt={dt:.0f}ms "
              f"out_len={len(result) if result else 0}", flush=True)
        return {"content": result}
    except Exception as e:
        dt = (time.time() - t0) * 1000
        print(f"[LLM-ERR] {time.strftime('%H:%M:%S')} model={req.model} dt={dt:.0f}ms "
              f"err={e}", flush=True)
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/llm/generate-stream")
async def llm_generate_stream(req: LLMGenerateRequest, user=require_perm("stage2.generate")):
    """Streaming LLM generate via SSE — provider-aware routing."""
    async def event_stream():
        try:
            async for text in generate_stream(
                req.provider_id, req.model,
                req.system_prompt, req.user_message,
                req.temperature,
            ):
                yield f"data: {json.dumps({'content': text}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@app.post("/api/llm/refine")
async def llm_refine(req: LLMRefineRequest, user=require_perm("stage2.generate")):
    try:
        result = await refine(req.provider_id, req.model, req.instruction, req.selected_text, req.full_context)
        return {"content": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Image Generation ──

def _parse_host(base_url: str) -> str:
    """Extract scheme+host from base_url, dropping any path."""
    from urllib.parse import urlparse
    parsed = urlparse(base_url)
    return f"{parsed.scheme}://{parsed.netloc}"


# PPT layout → recommended image size
PPT_IMAGE_SIZES = {
    "full": "1280*720",       # 16:9 full-slide background
    "hero": "1344*576",       # 21:9 wide banner (image_hero)
    "content": "1280*800",    # 16:10 content illustration
    "square": "1024*1024",    # 1:1 card/icon
    "portrait": "960*1280",   # 3:4 vertical
}


@app.post("/api/image/generate")
async def image_generate(req: ImageGenerateRequest, user=require_perm("stage1.generate")):
    import httpx
    db = get_db()
    try:
        if req.provider_id:
            row = db.execute(
                "SELECT * FROM image_providers WHERE id = ? AND is_enabled = 1",
                (req.provider_id,)).fetchone()
        else:
            row = None
        if not row:
            row = db.execute(
                "SELECT * FROM image_providers WHERE is_default = 1 AND is_enabled = 1").fetchone()
            if not row:
                row = db.execute(
                    "SELECT * FROM image_providers WHERE is_enabled = 1 ORDER BY created_at").fetchone()
        if not row:
            raise HTTPException(status_code=400, detail="未配置图片生成提供商，请在模型设置中添加")
        provider = dict(row)

        # Resolve model: try exact match, then lowercase, then first configured
        saved_models = json.loads(provider["models"]) if provider["models"] else []
        saved_lower = [m.lower() for m in saved_models]
        if req.model and req.model.lower() in saved_lower:
            model = req.model
        elif saved_models:
            model = saved_models[0]
        else:
            model = "qwen-image-2.0-pro"
        # DashScope API expects lowercase model names
        model_lower = model.lower()

        host = _parse_host(provider["base_url"])
        url = f"{host}/api/v1/services/aigc/multimodal-generation/generation"

        # Build content array: reference images first, then prompt text
        content = []
        for img_url in req.reference_images:
            content.append({"image": img_url})
        content.append({"text": req.prompt})

        payload = {
            "model": model_lower,
            "input": {
                "messages": [
                    {"role": "user", "content": content}
                ]
            },
            "parameters": {
                "size": req.size,
                "n": req.n,
                "prompt_extend": req.prompt_extend,
                "watermark": req.watermark,
            },
        }
        if req.negative_prompt:
            payload["parameters"]["negative_prompt"] = req.negative_prompt
        if req.seed is not None:
            payload["parameters"]["seed"] = req.seed

        async with httpx.AsyncClient(timeout=120) as client:
            resp = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {provider['api_key']}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )

        if resp.status_code in (200, 201):
            data = resp.json()
            images = []
            choices = data.get("output", {}).get("choices", [])
            for choice in choices:
                for item in choice.get("message", {}).get("content", []):
                    if "image" in item:
                        images.append({"url": item["image"]})
            usage = data.get("usage", {})
            return {"ok": True, "images": images, "model": model_lower,
                    "usage": {"width": usage.get("width"), "height": usage.get("height"),
                              "count": usage.get("image_count")}}
        else:
            return {"ok": False, "error": f"HTTP {resp.status_code}: {resp.text[:500]}"}
    except httpx.HTTPError as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        db.close()


# ── Templates ──


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




@app.put("/api/templates/{template_id}/toggle-enabled")
def toggle_template_enabled(template_id: str, user=require_perm("template.manage")):
    """Toggle the enabled state of a template.

    Only enabled templates appear in the Step 3 style selector.
    """
    db = get_db()
    try:
        row = db.execute("SELECT id, enabled FROM templates WHERE id = ?", (template_id,)).fetchone()
        if not row:
            raise HTTPException(404, "模板不存在")
        new_state = 0 if row["enabled"] == 1 else 1
        db.execute("UPDATE templates SET enabled = ? WHERE id = ?", (new_state, template_id))
        db.commit()
        return {"ok": True, "enabled": new_state == 1}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        db.close()












    from pptx.dml.color import RGBColor
    from PIL import Image, ImageDraw, ImageFont
    import io

    db = get_db()
    try:
        row = db.execute("SELECT file_path FROM templates WHERE id = ?", (template_id,)).fetchone()
        if not row or not row["file_path"]:
            raise HTTPException(404, "Template file not found")
        pptx_path = row["file_path"]
        # Prefer original upload for thumbnail
        gen_path = os.path.join(BASE_DIR, "data", "templates", "_generated", f"{template_id}.pptx")
        if os.path.exists(gen_path):
            pptx_path = gen_path
        if not os.path.exists(pptx_path):
            raise HTTPException(404, "PPTX file not found on disk")
    finally:
        db.close()

    prs = Presentation(pptx_path)
    if not prs.slides:
        raise HTTPException(404, "No slides in template")

    slide = prs.slides[0]
    sw = prs.slide_width or 12192000   # EMU
    sh = prs.slide_height or 6858000

    # Thumbnail size
    THUMB_W, THUMB_H = 640, 360
    scale_x = THUMB_W / sw
    scale_y = THUMB_H / sh

    img = Image.new("RGB", (THUMB_W, THUMB_H), "#F0EDE8")
    draw = ImageDraw.Draw(img)

    # Try to detect background from first shape that covers most of the slide
    bg_color = None
    for shape in slide.shapes:
        try:
            fill = shape.fill
            if fill and fill.type is not None:
                fc = fill.fore_color
                if fc and fc.type is not None:
                    try:
                        bg_color = fc.rgb
                        break
                    except Exception:
                        pass
        except Exception:
            pass

    if bg_color:
        try:
            hex_str = str(bg_color)
            if len(hex_str) == 6:
                r = int(hex_str[0:2], 16)
                g = int(hex_str[2:4], 16)
                b = int(hex_str[4:6], 16)
            else:
                r, g, b = 240, 237, 232
        except Exception:
            r, g, b = 240, 237, 232
        # Only use if not pure white/black
        if (r, g, b) not in ((255, 255, 255), (0, 0, 0)):
            img = Image.new("RGB", (THUMB_W, THUMB_H), (r, g, b))
            draw = ImageDraw.Draw(img)

    # Load a basic font
    font_paths = [
        "C:/Windows/Fonts/msyh.ttc",       # Microsoft YaHei
        "C:/Windows/Fonts/simsun.ttc",      # SimSun
        "C:/Windows/Fonts/arial.ttf",
    ]
    font_lg = None
    font_sm = None
    for fp in font_paths:
        if os.path.exists(fp):
            try:
                font_lg = ImageFont.truetype(fp, 24)
                font_sm = ImageFont.truetype(fp, 14)
                break
            except Exception:
                pass
    if font_lg is None:
        font_lg = ImageFont.load_default()
        font_sm = ImageFont.load_default()

    # Render text shapes
    for shape in slide.shapes:
        if not shape.has_text_frame:
            continue
        tf = shape.text_frame
        text = tf.text.strip()
        if not text:
            continue
        x = int(shape.left * scale_x) if shape.left else 0
        y = int(shape.top * scale_y) if shape.top else 0
        w = int(shape.width * scale_x) if shape.width else THUMB_W
        h = int(shape.height * scale_y) if shape.height else THUMB_H

        # Clip to image bounds
        x = max(0, min(x, THUMB_W - 10))
        y = max(0, min(y, THUMB_H - 10))
        w = min(w, THUMB_W - x)
        h = min(h, THUMB_H - y)

        # Determine text color from first run
        text_color = (40, 40, 40)
        try:
            for p in tf.paragraphs:
                for r in p.runs:
                    if r.font.color and r.font.color.rgb:
                        cr = r.font.color.rgb
                        text_color = ((cr >> 16) & 0xFF, (cr >> 8) & 0xFF, cr & 0xFF)
                    break
                break
        except Exception:
            pass

        font = font_lg if any(r.font.size and r.font.size >= Pt(18) for p in tf.paragraphs for r in p.runs) else font_sm

        # Draw first 2 lines of text
        lines = text.split('\n')[:3]
        line_h = 16
        for li, line in enumerate(lines):
            if li * line_h >= h - 4:
                break
            # Truncate long lines
            max_chars = max(4, int(w / 10))
            if len(line) > max_chars:
                line = line[:max_chars - 2] + '..'
            draw.text((x + 4, y + 4 + li * line_h), line, fill=text_color, font=font_sm)

    # Save to in-memory PNG
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png",
                             headers={"Cache-Control": "public, max-age=3600"})








@app.get("/api/templates/for-stage/{stage_type}")
def list_templates_for_stage(stage_type: str):
    type_map = {"sop": "ppt", "daoPpt": "ppt", "yanxiPpt": "ppt"}
    db_type = type_map.get(stage_type, "ppt")
    db = get_db()
    try:
        if db_type == "ppt":
            rows = db.execute(
                "SELECT id, name, type, file_path, prompt, skill, branding_config, is_default FROM templates WHERE type = 'style' AND enabled = 1 ORDER BY created_at ASC").fetchall()
        else:
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
async def api_upload_cookies(file: UploadFile = File(...), user=require_perm("stage1.generate")):
    if not file.filename or not file.filename.endswith('.txt'):
        raise HTTPException(400, "请上传 .txt 格式的 cookies 文件")
    file_id = uuid.uuid4().hex[:8]
    file_path = os.path.join(COOKIES_DIR, f"{file_id}.txt")
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)
    return {"cookies_path": file_path, "filename": file.filename}


@app.post("/api/video/download")
def api_download_video(req: VideoDownloadRequest, user=require_perm("stage1.generate")):
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
def api_video_file(path: str = "", task_id: str = ""):
    """Serve a downloaded video file. Accepts task_id (preferred, avoids encoding issues) or raw path."""
    import os as _os
    # Resolve path from task_id if provided (avoids path encoding issues)
    if task_id:
        data = get_progress(task_id)
        resolved = data.get("video_path", "")
        if resolved:
            path = resolved  # fall through to unified validation below
    if not path:
        raise HTTPException(400, "Missing path or task_id")
    base = _os.path.dirname(_os.path.abspath(__file__))
    video_dir = _os.path.normcase(_os.path.normpath(_os.path.join(base, "data", "videos")))
    data_dir = _os.path.normcase(_os.path.normpath(_os.path.join(base, "data")))
    save_root = _os.path.normcase(_os.path.normpath(_get_global_save_path()))
    full = _os.path.normcase(_os.path.normpath(_os.path.abspath(path)))
    if not (full.startswith(video_dir + _os.sep) or full.startswith(data_dir + _os.sep) or full.startswith(save_root + _os.sep)):
        raise HTTPException(403, f"Access denied: {full}")
    if not _os.path.exists(full):
        raise HTTPException(404, f"File not found: {full}")
    return _file_response(full)


@app.post("/api/video/extract-subtitles")
def api_extract_subtitles(req: dict, user=require_perm("stage1.generate")):
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

from services.ppt_service import generate_ppt, _extract_typography

@app.get("/api/projects/{project_id}/ppt-results")
def api_ppt_results(project_id: str, request: Request):
    """Return all saved PPT generation results for a project (survives page reload)."""
    user = getattr(request.state, "user", None)
    if user is not None:
        verify_project_access(project_id, user)
    db = get_db()
    try:
        rows = db.execute(
            "SELECT step_name, content, updated_at FROM step_results "
            "WHERE project_id = ? AND (step_name LIKE '_ppt_result_%' OR step_name LIKE '_ppt_plan_%') "
            "ORDER BY updated_at DESC",
            (project_id,)).fetchall()
        results = []
        seen_run_ids = set()
        for row in rows:
            try:
                meta = json.loads(row["content"])
                rid = meta.get("run_id") or ""
                # Deduplicate: _ppt_plan_ and _ppt_result_ may share the same run_id
                if rid and rid in seen_run_ids:
                    continue
                if rid:
                    seen_run_ids.add(rid)
                meta["_saved_at"] = row["updated_at"]
                meta["_step_name"] = row["step_name"]
                results.append(meta)
            except Exception:
                pass
        return {"results": results}
    finally:
        db.close()

@app.get("/api/projects/{project_id}/ppt-status")
def api_ppt_status(project_id: str, request: Request):
    """Polled by frontend every 10s during PPT generation.
    Returns current phase, slide counts, preview URL if ready."""
    user = getattr(request.state, "user", None)
    if user is not None:
        verify_project_access(project_id, user)
    from services.ppt_service import get_ppt_status
    status = get_ppt_status(project_id)
    if not status:
        return {"phase": "idle", "phase_label": "未在生成", "message": "没有正在进行的生成任务"}
    return status


@app.get("/api/projects/{project_id}/ppt-log")
def api_ppt_log(project_id: str, request: Request):
    user = getattr(request.state, "user", None)
    if user is not None:
        verify_project_access(project_id, user)
    """Polled by frontend every 60s during PPT/outline generation.
    Returns timestamped log entries."""
    from services.ppt_service import get_ppt_log
    return {"logs": get_ppt_log(project_id)}


@app.post("/api/ppt/generate")
def api_generate_ppt(req: PPTGenerateRequest, user=require_perm("stage3.generate")):
    import time, sys, datetime as _dt
    t0 = time.time()
    print(f"[PPT-REQ] {time.strftime('%H:%M:%S')} provider={req.provider_id} model={req.model} "
          f"content_len={len(req.content) if req.content else 0} template={req.template_id} "
          f"has_rules=?", flush=True)
    try:
        with open(os.path.join(BASE_DIR, "data", "ppt_req.log"), "a", encoding="utf-8") as _lf:
            _lf.write(f"[{_dt.datetime.now().isoformat()}] provider={req.provider_id} model={req.model} "
                      f"content_len={len(req.content) if req.content else 0} template={req.template_id}\n")
    except Exception: pass
    try:
        output_dir = None
        project_name = ""
        if req.project_id:
            output_dir = resolve_project_storage(req.project_id)
            proj = _get_project(req.project_id)
            if proj:
                project_name = proj["name"]

        # Use saved slide_plan from template if not provided in request.
        # But if caller sent content+model, let AI regenerate (content takes priority).
        slide_plan = req.slide_plan
        has_content_input = bool(req.content and req.content.strip() and req.provider_id and req.model)
        if slide_plan is None and req.template_id and not has_content_input:
            db = get_db()
            try:
                row = db.execute(
                    "SELECT slide_plan FROM templates WHERE id = ?",
                    (req.template_id,)).fetchone()
                if row and row["slide_plan"]:
                    try:
                        slide_plan = json.loads(row["slide_plan"])
                        print(f"[PPT-REQ] Using saved slide_plan ({len(slide_plan)} slides)", flush=True)
                    except Exception:
                        pass
            finally:
                db.close()
        if has_content_input:
            print(f"[PPT-REQ] AI regeneration with content ({len(req.content)} chars)", flush=True)

        # Validate prerequisites BEFORE calling expensive pipeline
        if not has_content_input and not slide_plan:
            missing: list[str] = []
            has_content = bool(req.content and req.content.strip())
            if not has_content:
                missing.append("没有文案内容，请先在 Stage 1 导入素材或在 Stage 2 生成文案")
            if not req.provider_id:
                missing.append("没有选择大模型提供商，请在左侧下拉框中选择")
            elif not req.model:
                missing.append("没有选择大模型，请在左侧下拉框中选择模型")
            if not req.template_id:
                missing.append("没有选择模板，请先在左侧选择模板")
            detail = "；".join(missing) if missing else "缺少必要参数，请检查后再试"
            raise HTTPException(status_code=400, detail=detail)

        filepath, generated_slides = generate_ppt(req.content, req.template_id, req.branding, output_dir, req.provider_id, req.model, slide_plan, project_name=project_name, column_id=req.column_id, color_scheme=req.color_scheme, temperature=req.temperature, project_id=req.project_id or "", temp_keyword=req.temp_keyword, temp_research=req.temp_research, temp_outline=req.temp_outline, temp_fill=req.temp_fill, temp_cards=req.temp_cards, temp_html=req.temp_html, temp_svg_batch=req.temp_svg_batch, temp_svg_single=req.temp_svg_single, temp_review=req.temp_review, temp_fix=req.temp_fix, temp_holistic=req.temp_holistic, temp_holistic_fix=req.temp_holistic_fix, temp_stage_outline=req.temp_stage_outline, temp_stage_generation=req.temp_stage_generation, temp_stage_review=req.temp_stage_review)
        if generated_slides is not None:
            slide_plan = generated_slides

        # Detect output type: SVG (returns HTML path) vs PPTX (returns .pptx path)
        is_svg = filepath and filepath.endswith(".html")
        is_pptx = filepath and filepath.endswith(".pptx")

        if is_svg:
            # SVG output — register run_id → actual directory for preview serving
            run_dir = os.path.dirname(filepath)
            run_id = os.path.basename(run_dir)
            _run_dirs[run_id] = run_dir
            _save_run_dirs(_run_dirs)
            # Save color_scheme metadata so recolor can deterministically know the source scheme
            cs = getattr(req, "color_scheme", None) or "deep-blue"
            with open(os.path.join(run_dir, "color_scheme.txt"), "w", encoding="utf-8") as _csf:
                _csf.write(cs)
            preview_url = f"/api/exports/{run_id}/index.html"
            zip_url = f"/api/ppt/export-zip/{run_id}"
            # Persist result metadata so page reload can restore without re-generating
            from services.ppt_service import _load_style_from_template
            result_meta = {
                "run_id": run_id,
                "preview_url": preview_url,
                "zip_url": zip_url,
                "slide_plan": slide_plan,
                "slide_count": len(generated_slides) if generated_slides else 0,
                "template_id": req.template_id,
                "style_id": _load_style_from_template(req.template_id),
                "format": "svg",
                "color_scheme": cs,
                "column_id": req.column_id,
                "generated_at": _dt.datetime.now().isoformat(),
            }
            try:
                with open(os.path.join(run_dir, "result.json"), "w", encoding="utf-8") as _rf:
                    json.dump(result_meta, _rf, ensure_ascii=False, indent=2)
            except Exception as _e:
                print(f"[PPT] Failed to persist result.json: {_e}", flush=True)
            # Persist to DB for frontend auto-load on page refresh (optional)
            if req.project_id:
                try:
                    save_step_meta(req.project_id, f"_ppt_result_{run_id}",
                                   json.dumps(result_meta, ensure_ascii=False))
                except Exception as _e:
                    print(f"[PPT] Failed to persist result meta: {_e}", flush=True)
            return {
                "format": "svg",
                "run_id": run_id,
                "preview_url": preview_url,
                "zip_url": zip_url,
                "slide_plan": slide_plan,
                "slide_count": len(generated_slides) if generated_slides else 0,
                "style_id": result_meta.get("style_id", ""),
                "color_scheme": result_meta.get("color_scheme", ""),
                "template_id": req.template_id or "",
            }
        elif is_pptx:
            # PPTX output — legacy download URL
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
            return {"format": "pptx", "filename": filename, "download_url": download_url,
                    "slide_plan": slide_plan,
                    "slide_count": len(generated_slides) if generated_slides else 0}
        else:
            try:
                with open(os.path.join(BASE_DIR, "data", "ppt_req.log"), "a", encoding="utf-8") as _lf:
                    _lf.write(f"[{_dt.datetime.now().isoformat()}] 500: filepath={filepath!r} is_svg={is_svg} is_pptx={is_pptx}\n")
            except Exception: pass
            raise HTTPException(status_code=500, detail="PPT generation failed — no output produced")
    except Exception as e:
        import traceback as _tb
        try:
            with open(os.path.join(BASE_DIR, "data", "ppt_req.log"), "a", encoding="utf-8") as _lf:
                _lf.write(f"[{_dt.datetime.now().isoformat()}] EXCEPTION: {e}\n{_tb.format_exc()}\n")
        except Exception: pass
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/ppt/outline")
def api_ppt_outline(req: PPTPlanRequest, user=require_perm("stage3.generate")):
    """Generate outline only (Phase 2 Research + Phase 4 Outline+Content).

    Returns outline_json (structured) and outline_text (natural-language,
    human-readable format for review and editing).
    """
    from services.ppt_service import _generate_outline_only
    db = get_db()
    try:
        project_id = req.project_id or ""
        column_id = req.column_id or ""
        cfg = None
        if column_id and project_id:
            cfg = db.execute(
                "SELECT prompt, skill, config_json FROM project_items WHERE id = ?",
                (f"pi-{project_id}-{column_id}",)).fetchone()

        column_prompt = cfg["prompt"] or "" if cfg else ""
        column_skill = cfg["skill"] or "" if cfg else ""
        rules = {}

        # Load config_json from project_items (contains outline_architect_prompt,
        # cognitive_design_principles, typography_spec)
        if cfg and cfg["config_json"]:
            try:
                config_rules = json.loads(cfg["config_json"])
                if isinstance(config_rules, dict):
                    for key in ("outline_architect_prompt", "cognitive_design_principles",
                                "typography_spec", "design_rules"):
                        if config_rules.get(key):
                            rules[key] = config_rules[key]
            except Exception:
                pass

        if req.template_id:
            row = db.execute(
                "SELECT rules FROM templates WHERE id = ?",
                (req.template_id,)).fetchone()
            if row and row["rules"]:
                try:
                    template_rules = json.loads(row["rules"])
                    for key in ("style_id", "layout_types", "page_rhythm", "design_principles"):
                        if key in template_rules:
                            rules[key] = template_rules[key]
                except Exception:
                    pass

        st = dict(
            keyword=req.temp_keyword or req.temperature or 0.3,
            research=req.temp_research or req.temperature or 0.7,
            outline=req.temp_outline or req.temperature or 1.0,
            fill=req.temp_fill or req.temperature or 1.0,
        )
        if req.temp_stage_outline > 0:
            st.update(keyword=req.temp_stage_outline, research=req.temp_stage_outline,
                      outline=req.temp_stage_outline, fill=req.temp_stage_outline)
        outline_json, outline_text = _generate_outline_only(
            req.provider_id, req.model, rules, req.content,
            column_prompt, column_skill, temperature=req.temperature,
            st=st, project_id=req.project_id or "",
            column_id=req.column_id or "")
        return {"outline_json": outline_json or [], "outline_text": outline_text or ""}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        db.close()


@app.post("/api/ppt/outline/convert")
def api_ppt_outline_convert(req: PPTPlanRequest, user=require_perm("stage3.generate")):
    """Convert edited natural-language text back to structured JSON via LLM.

    Called when user saves edited outline content. Uses low-temperature LLM
    to extract structured JSON from free-form text.
    """
    from services.ppt_service import _human_text_to_json
    if not req.provider_id or not req.model:
        raise HTTPException(status_code=400, detail="需要选择大模型才能转换")
    try:
        result = _human_text_to_json(req.provider_id, req.model, req.content, req.slide_plan or [], req.project_id or "")
        return {"outline_json": result or []}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/ppt/plan")
def api_ppt_plan(req: PPTPlanRequest, user=require_perm("stage3.generate")):
    """Generate slide plan only (no PPTX file). Returns JSON for user review.

    Uses column config's prompt + skill as AI system message and structure
    template. Template is only used for its rules (layout_types, page_rhythm).
    """
    from services.ppt_service import _generate_slides_staged
    db = get_db()
    try:
        # Load column config — the single source of truth for content logic
        project_id = req.project_id or ""
        column_id = req.column_id or ""
        cfg = None
        if column_id and project_id:
            cfg = db.execute(
                "SELECT prompt, skill FROM project_items WHERE id = ?",
                (f"pi-{project_id}-{column_id}",)).fetchone()

        column_prompt = cfg["prompt"] or "" if cfg else ""
        column_skill = cfg["skill"] or "" if cfg else ""
        rules = {}

        # Template provides layout_types via its rules (visual structure)
        if req.template_id:
            row = db.execute(
                "SELECT rules FROM templates WHERE id = ?",
                (req.template_id,)).fetchone()
            if row and row["rules"]:
                try:
                    template_rules = json.loads(row["rules"])
                    # Merge: template's layout_types + page_rhythm take priority
                    for key in ("style_id", "layout_types", "page_rhythm", "design_principles"):
                        if key in template_rules:
                            rules[key] = template_rules[key]
                except Exception:
                    pass

        st = dict(
            keyword=req.temp_keyword or req.temperature or 0.3,
            research=req.temp_research or req.temperature or 0.7,
            outline=req.temp_outline or req.temperature or 1.0,
            fill=req.temp_fill or req.temperature or 1.0,
            cards=req.temp_cards or req.temperature or 0.7,
            html=req.temp_html or req.temperature or 0.8,
        )
        if req.temp_stage_outline > 0:
            st.update(keyword=req.temp_stage_outline, research=req.temp_stage_outline,
                      outline=req.temp_stage_outline, fill=req.temp_stage_outline)
        if req.temp_stage_generation > 0:
            st.update(cards=req.temp_stage_generation, html=req.temp_stage_generation)
        slide_plan = _generate_slides_staged(
            req.provider_id, req.model, rules, req.content,
            column_prompt, column_skill, temperature=req.temperature,
            st=st, column_id=req.column_id or "",
            project_id=req.project_id or ""
        )
        return {"slide_plan": slide_plan or []}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    finally:
        db.close()


def _fix_per_slide_divs(html: str) -> str:
    """Repair each slide-wrapper's internal div balance so no slide
    can corrupt the DOM of adjacent slides.  Fixes the root cause of
    "pages 6-7 disappeared / page 5 layout wrong" bugs.

    Uses the interval between consecutive wrapper tags to define slide
    boundaries, then balances <div>/</div> counts per-interval by adding
    or removing closing tags at the tail of each interval."""
    tag = '<div class="slide-wrapper">'

    # Find all wrapper positions
    positions = []
    p = 0
    while True:
        idx = html.find(tag, p)
        if idx == -1:
            break
        positions.append(idx)
        p = idx + 1

    if not positions:
        return html

    result = []
    result.append(html[:positions[0]])  # preamble before first slide

    for i, start in enumerate(positions):
        end = positions[i + 1] if i + 1 < len(positions) else html.find('</body>', start)
        if end == -1:
            end = len(html)

        chunk = html[start:end]
        opens = chunk.count('<div')
        closes = chunk.count('</div>')
        diff = opens - closes

        if diff > 0:
            # Missing closing tags — append before the boundary
            chunk += '</div>' * diff
        elif diff < 0:
            # Excess closing tags — remove from the tail
            excess = -diff
            for _ in range(excess):
                p = chunk.rfind('</div>')
                if p >= 0:
                    chunk = chunk[:p] + chunk[p + 6:]

        result.append(chunk)

    # Append everything after the last wrapper's range
    last_end = positions[-1]
    body_end = html.find('</body>', last_end)
    if body_end == -1:
        body_end = len(html)
    # The last chunk already goes to </body> or end, so append the rest
    body_close_pos = html.find('</body>', positions[-1])
    if body_close_pos != -1:
        result.append(html[body_close_pos:])

    return ''.join(result)


def _ensure_backup(run_dir: str):
    """Create index_backup.html from current index.html before every splice.

    Always overwrites so restore returns the state just before the LAST splice,
    not the state from the first-ever splice (which would be stale)."""
    index_path = os.path.join(run_dir, "index.html")
    backup_path = os.path.join(run_dir, "index_backup.html")
    if os.path.exists(index_path):
        shutil.copy2(index_path, backup_path)


@app.post("/api/ppt/recolor-slide")
def api_ppt_recolor_slide(
    run_id: str = Body(...), user=require_perm("stage3.generate"),
    slide_seq: int = Body(...),
    style: str = Body("business"),
    color_scheme: str = Body("deep-blue"),
):
    """Recolor all slides to a new color scheme.

    New format (CSS variables): replace :root block — O(1) operation.
    Legacy format (hardcoded hex): per-slide hex replacement fallback.
    """
    from services.ppt_service import _recolor_slide_html, _build_root_vars, _load_scheme_data

    run_dir = _find_run_dir(run_id)
    if not run_dir:
        raise HTTPException(status_code=404, detail="Run not found")

    html_path = os.path.join(run_dir, "index.html")

    sid = style or "business"
    cs = color_scheme or "deep-blue"

    if not os.path.exists(html_path):
        raise HTTPException(status_code=404, detail="index.html not found")

    with open(html_path, encoding="utf-8") as f:
        full_html = f.read()

    # ── Detect format: CSS variables (has :root block) vs legacy hex ──
    import re
    if ":root {" in full_html:
        # ── New format: replace :root block ──
        new_scheme_data = _load_scheme_data(sid, cs)
        if not new_scheme_data:
            raise HTTPException(status_code=400, detail=f"Unknown color scheme: {cs}")
        new_root = _build_root_vars(new_scheme_data)

        # Replace :root { ... } block (first occurrence, up to matching })
        root_pattern = re.compile(r':root\s*\{[^}]*\}', re.DOTALL)
        new_html, count = root_pattern.subn(new_root, full_html, count=1)
        if count == 0:
            raise HTTPException(status_code=400, detail=":root block not found in HTML")

        full_html = new_html
        changed_count = 1
    else:
        # ── Legacy format: per-slide hex replacement ──
        slides_raw = re.findall(r'(<section[\s\S]*?</section>)', full_html, re.IGNORECASE)
        if not slides_raw:
            inner_pattern = re.compile(
                r'<div\s+class="slide-wrapper"\s*>\s*(<div\s[^>]*width\s*:\s*\d+px[^>]*>)',
                re.IGNORECASE
            )
            for m in inner_pattern.finditer(full_html):
                pos = m.end(1)
                depth = 1
                while pos < len(full_html) and depth > 0:
                    next_open = full_html.find('<div', pos)
                    next_close = full_html.find('</div>', pos)
                    if next_close == -1:
                        break
                    if next_open != -1 and next_open < next_close:
                        depth += 1
                        pos = next_open + 4
                    else:
                        depth -= 1
                        if depth == 0:
                            slides_raw.append(m.group(1) + full_html[m.end(1):next_close + 6])
                            break
                        pos = next_close + 6

        if not slides_raw:
            raise HTTPException(status_code=400, detail="No slides found in HTML")

        source_scheme = "deep-blue"
        rj_path = os.path.join(run_dir, "result.json")
        if os.path.exists(rj_path):
            try:
                rj_meta = json.loads(open(rj_path, "r", encoding="utf-8").read())
                source_scheme = rj_meta.get("color_scheme") or source_scheme
            except Exception:
                pass

        changed_count = 0
        for i, old_slide in enumerate(slides_raw):
            new_slide = _recolor_slide_html(sid, old_slide, cs, source_scheme)
            if new_slide != old_slide:
                full_html = full_html.replace(old_slide, new_slide)
                changed_count += 1

        if changed_count == 0:
            return {"ok": True, "changed": False, "message": "颜色无变化（可能已使用该色系）"}

    full_html = _fix_per_slide_divs(full_html)
    _ensure_backup(run_dir)
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(full_html)
    # Update color scheme tracking
    with open(os.path.join(run_dir, "color_scheme.txt"), "w", encoding="utf-8") as _csf:
        _csf.write(cs)
    # Sync color_scheme to result.json so regenerate picks it up
    rj_path = os.path.join(run_dir, "result.json")
    if os.path.exists(rj_path):
        with open(rj_path, "r+", encoding="utf-8") as _rjf:
            _rj_meta = json.loads(_rjf.read())
            _rj_meta["color_scheme"] = cs
            _rjf.seek(0)
            _rjf.truncate()
            json.dump(_rj_meta, _rjf, ensure_ascii=False, indent=2)

    return {"ok": True, "changed": True, "method": "css_vars" if ":root {" in full_html else "hex_replace"}


@app.post("/api/ppt/edit-slide")
def api_ppt_edit_slide(req: PPTEditSlideRequest, user=require_perm("stage3.generate")):
    """Edit a single slide via natural language instruction.

    Flow:
      1. Read index.html from output directory
      2. Extract the target slide's HTML
      3. Send to LLM with editing instruction
      4. Run three code checks on the result
      5. If clean → write back → return ok
      6. If violation → return error with details
    """
    import re
    from services.ppt_service import (
        _safe_run_async, _build_edit_system_prompt, _run_edit_agent,
    )

    run_dir = _find_run_dir(req.run_id)
    if not run_dir:
        raise HTTPException(status_code=404, detail="Run not found")

    html_path = os.path.join(run_dir, "index.html")
    if not os.path.exists(html_path):
        raise HTTPException(status_code=404, detail="index.html not found")

    with open(html_path, encoding="utf-8") as f:
        full_html = f.read()

    seq = req.slide_seq

    # Count total slides (just for the prompt)
    slide_count = len(re.findall(r'<div\s+class="slide-wrapper"', full_html, re.IGNORECASE))
    if slide_count == 0:
        slide_count = len(re.findall(r'<section[\s>]', full_html, re.IGNORECASE))
    if seq < 1 or seq > max(slide_count, 1):
        raise HTTPException(status_code=400, detail=f"Slide {seq} out of range (1–{max(slide_count, 1)})")

    # Build the edit system prompt
    edit_system = _build_edit_system_prompt(req.style or "business", req.color_scheme or "deep-blue")

    edit_user = (
        f"以下是完整的 PPT HTML 文件（共 {slide_count} 页），每页是一个 slide-wrapper。\n\n"
        f"```html\n{full_html}\n```\n\n"
        f"修改要求：只修改第 {seq} 页，{req.instruction}\n\n"
        f"输出要求：返回修改后的完整 HTML 文件（所有页），用 ```html ``` 包裹。不要省略任何页。"
    )

    p_id = req.provider_id
    model = req.model
    if not p_id or not model:
        db = get_db()
        try:
            row = db.execute(
                "SELECT id, models FROM llm_providers WHERE is_enabled=1 LIMIT 1"
            ).fetchone()
            if row:
                p_id = row["id"]
                models = json.loads(row["models"]) if row["models"] else []
                model = models[0] if models else ""
        finally:
            db.close()

    if not p_id or not model:
        raise HTTPException(status_code=400, detail="没有可用的 LLM 提供商")

    try:
        raw = _safe_run_async(_run_edit_agent(p_id, model, edit_system, edit_user))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Agent 调用失败: {e}")

    # Extract the modified HTML from the response
    edited_html = ""
    m = re.search(r'```html\s*\n(.*?)\n```', raw, re.DOTALL)
    if m:
        edited_html = m.group(1).strip()
    else:
        # Fallback: try to find a complete HTML document
        m = re.search(r'(<!DOCTYPE html>[\s\S]*?</html>)', raw, re.IGNORECASE)
        if m:
            edited_html = m.group(1).strip()

    # Verify we got a valid HTML document
    if not edited_html or len(edited_html) < len(full_html) * 0.5:
        return {
            "ok": False,
            "slide_seq": seq,
            "error": "chat_reply",
            "detail": raw.strip() or "AI 未返回有效的完整 HTML，请换一种描述重试",
        }

    # Verify slide count is preserved
    new_slide_count = len(re.findall(r'<div\s+class="slide-wrapper"', edited_html, re.IGNORECASE))
    if new_slide_count == 0:
        new_slide_count = len(re.findall(r'<section[\s>]', edited_html, re.IGNORECASE))
    if new_slide_count != slide_count:
        return {
            "ok": False,
            "slide_seq": seq,
            "error": "chat_reply",
            "detail": f"AI 返回的页数不对（期望 {slide_count}，实际 {new_slide_count}），请重试",
        }

    # Quick div balance check
    divs_open = len(re.findall(r'<div\s', edited_html)) + len(re.findall(r'<div>', edited_html))
    divs_close = len(re.findall(r'</div>', edited_html))
    if abs(divs_open - divs_close) > 3:
        return {
            "ok": False,
            "slide_seq": seq,
            "error": "chat_reply",
            "detail": f"AI 返回的 HTML 标签不平衡（div: {divs_open}开/{divs_close}闭），请重试",
        }

    # Write to index.html directly (auto-backup preserves original)
    _ensure_backup(run_dir)
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(edited_html)

    return {"ok": True, "slide_seq": seq,
            "preview": True, "saved": True}


@app.post("/api/ppt/save-edit/{run_id}")
def api_save_edit(run_id: str, user=require_perm("stage3.generate")):
    """No-op: edits now write directly to index.html."""
    return {"ok": True, "saved": True}


@app.post("/api/ppt/discard-edit/{run_id}")
def api_discard_edit(run_id: str, user=require_perm("stage3.generate")):
    """Restore index.html from index_backup.html."""
    run_dir = _run_dirs.get(run_id)
    if not run_dir:
        candidate = os.path.join(EXPORT_DIR, run_id)
        if os.path.isdir(candidate):
            run_dir = candidate
    if not run_dir:
        raise HTTPException(status_code=404, detail="Export not found")

    backup_path = os.path.join(run_dir, "index_backup.html")
    if not os.path.exists(backup_path):
        raise HTTPException(status_code=400, detail="No backup to restore from")

    real_path = os.path.join(run_dir, "index.html")
    shutil.copy2(backup_path, real_path)
    return {"ok": True, "restored": True}


@app.put("/api/ppt/slide-source/{run_id}")
def api_slide_source(run_id: str, req: PPTSlideSourceRequest, user=require_perm("stage3.generate")):
    """Write the full HTML document directly to index.html.

    Used by the source-code editor tab — the user edits the complete
    HTML document and applies it.
    """
    run_dir = _run_dirs.get(run_id)
    if not run_dir:
        candidate = os.path.join(EXPORT_DIR, run_id)
        if os.path.isdir(candidate):
            run_dir = candidate
    if not run_dir or not os.path.isdir(run_dir):
        raise HTTPException(status_code=404, detail="Run not found")

    _ensure_backup(run_dir)
    index_path = os.path.join(run_dir, "index.html")
    with open(index_path, "w", encoding="utf-8") as f:
        f.write(req.html)

    return {"ok": True, "saved": True}


@app.post("/api/ppt/regenerate-slide")
def api_ppt_regenerate_slide(req: PPTRegenerateSlideRequest, user=require_perm("stage3.generate")):
    """Regenerate selected slides via the standard two-phase HTML pipeline.

    Reads existing slide structures from result.json, runs
    _stage2_html_per_slide() for the target slides, splices the
    results back into the full HTML deck, and writes to a separate
    index_regenerated.html file (never overwrites index.html).

    Writes progress to _regenerate_log.txt so the frontend can poll.
    """
    from services.ppt_service import (
        _stage2_html_per_slide, _assemble_html_deck,
        _resolve_color_vars, _load_scheme_data,
        _auto_fix_hardcoded_hex, _auto_fix_font_size,
        _get_canvas_dimensions, _enforce_no_hardcoded_hex,
    )
    import datetime as _dt

    run_dir = _find_run_dir(req.run_id)
    if not run_dir or not os.path.isdir(run_dir):
        raise HTTPException(status_code=404, detail="Run not found")

    # Look up project_id from step_results for config isolation
    project_id = ""
    try:
        ppt_db = get_db()
        sr_row = ppt_db.execute(
            "SELECT project_id FROM step_results WHERE step_name = ? LIMIT 1",
            (f"_ppt_result_{req.run_id}",)
        ).fetchone()
        ppt_db.close()
        if sr_row:
            project_id = sr_row["project_id"] or ""
    except Exception:
        pass

    log_path = os.path.join(run_dir, "_regenerate_log.txt")
    # Truncate old log so each regeneration starts fresh
    with open(log_path, "w", encoding="utf-8") as _lf:
        _lf.write("")
    def _log(msg: str):
        ts = _dt.datetime.now().strftime("%H:%M:%S")
        line = f"[{ts}] {msg}\n"
        with open(log_path, "a", encoding="utf-8") as _lf:
            _lf.write(line)
            _lf.flush()

    _log("开始重新生成...")

    import re as _re

    # ── Build slide_plan: prefer result.json, fallback to parsing index.html ──
    rj_path = os.path.join(run_dir, "result.json")
    style_id = "business"
    color_scheme = "deep-blue"
    column_id = ""
    if os.path.exists(rj_path):
        _log("读取 result.json...")
        with open(rj_path, encoding="utf-8") as _f:
            result_meta = json.loads(_f.read())
        slide_plan = result_meta.get("slide_plan", [])
        style_id = result_meta.get("style_id") or style_id
        color_scheme = result_meta.get("color_scheme") or color_scheme
        column_id = result_meta.get("column_id", "") or req.column_id
        _log(f"已加载 {len(slide_plan)} 页幻灯片结构，色系: {color_scheme}")
    else:
        _log("result.json 不存在，从 index.html 解析...")
        # Fallback: parse slides from index.html (old-format runs)
        column_id = req.column_id
        html_path = os.path.join(run_dir, "index.html")
        if not os.path.exists(html_path):
            _log("错误: index.html 不存在")
            raise HTTPException(status_code=404, detail="index.html not found")
        with open(html_path, encoding="utf-8") as _f:
            full_html = _f.read()
        sections = _re.findall(
            r'<section\s+class="slide"\s+data-seq="(\d+)"\s+data-type="([^"]*)"[^>]*>(.*?)</section>',
            full_html, _re.DOTALL
        )
        if not sections:
            _log("错误: index.html 中未找到幻灯片")
            raise HTTPException(status_code=400, detail="No slides found in index.html")
        slide_plan = []
        for seq_str, stype, raw in sections:
            seq = int(seq_str)
            h = _re.search(r'<h[12][^>]*>(.*?)</h[12]>', raw[:3000], _re.DOTALL)
            heading = _re.sub(r'<[^>]+>', '', h.group(1).strip()) if h else ""
            body_text = _re.sub(r'<[^>]+>', ' ', raw[:5000]).strip()
            body_text = _re.sub(r'\s+', ' ', body_text)[:1000]
            has_chart = bool(_re.search(r'<(svg|canvas|path|circle|rect|line)', raw[:3000]))
            chart_hint = ""
            if has_chart:
                chart_hint = _re.search(r'data-chart-hint="([^"]*)"', raw[:1000])
                if chart_hint:
                    chart_hint = chart_hint.group(1)
            slide_plan.append({
                "seq": seq, "type": stype, "layout": "hero_grid",
                "heading": heading, "body": body_text,
                "key_points": [], "kicker": "", "lead": "",
                "cards": [], "has_chart": has_chart, "chart_hint": chart_hint,
                "notes": "", "html": raw, "html_vars": raw,
            })
        slide_plan.sort(key=lambda s: s["seq"])
        # Fallback color_scheme for old runs: read from color_scheme.txt
        cs_path = os.path.join(run_dir, "color_scheme.txt")
        if os.path.exists(cs_path):
            with open(cs_path, encoding="utf-8") as _csf:
                color_scheme = _csf.read().strip() or color_scheme
        _log(f"已解析 {len(slide_plan)} 页幻灯片，色系(fallback): {color_scheme}")
    if not slide_plan:
        raise HTTPException(status_code=400, detail="No slides found")

    total = len(slide_plan)
    seqs = req.slide_seqs
    for seq in seqs:
        if seq < 1 or seq > total:
            raise HTTPException(status_code=400, detail=f"Slide {seq} out of range (1–{total})")

    _log(f"选中 {len(seqs)} 页待重新生成: {', '.join(str(s) for s in seqs)}")

    # Get provider/model (from request or fallback to default)
    p_id = req.provider_id
    model_str = req.model
    if not p_id or not model_str:
        db = get_db()
        try:
            row = db.execute(
                "SELECT id, models FROM llm_providers WHERE is_enabled=1 LIMIT 1"
            ).fetchone()
            if row:
                p_id = row["id"]
                models = json.loads(row["models"]) if row["models"] else []
                model_str = models[0] if models else ""
        finally:
            db.close()
    if not p_id or not model_str:
        raise HTTPException(status_code=400, detail="没有可用的 LLM 提供商")

    _log(f"使用模型: {model_str}")

    # Build structure list for selected slides
    redo_structure = []
    for seq in seqs:
        t = slide_plan[seq - 1]
        redo_structure.append({
            "seq": t.get("seq", seq),
            "type": t.get("type", "content"),
            "layout": t.get("layout", "hero_grid"),
            "heading": t.get("heading", ""),
            "body": t.get("body", ""),
            "key_points": t.get("key_points", []),
            "kicker": t.get("kicker", ""),
            "lead": t.get("lead", ""),
            "cards": t.get("cards", []),
            "has_chart": t.get("has_chart", False),
            "chart_hint": t.get("chart_hint", ""),
            "notes": t.get("notes", ""),
        })

    _log(f"正在调用 AI 生成 HTML（{len(redo_structure)} 页，并行 {min(len(redo_structure), 3)} 页）...")

    # Regenerate selected slides through the standard HTML pipeline
    html_slides = _stage2_html_per_slide(
        p_id, model_str, generate, redo_structure,
        style_id=style_id, color_scheme=color_scheme,
        parallel=min(len(redo_structure), 3), temperature=0.3,
        column_id=column_id, project_id=project_id,
    )

    if not html_slides:
        _log("错误: LLM 未返回 HTML")
        raise HTTPException(status_code=500, detail="Slide regeneration failed — LLM returned no HTML")

    _log(f"AI 生成完成，收到 {len(html_slides)} 页 HTML")

    # ── Apply auto-fixers (hex→var, font-size) BEFORE variable resolution ──
    scheme_data = _load_scheme_data(style_id, color_scheme)
    regen_cw, regen_ch = _get_canvas_dimensions(column_id, project_id=project_id)
    is_a4_regen = regen_ch >= 1100
    _log(f"A4检测: column_id={column_id}, canvas={regen_cw}x{regen_ch}, is_a4={is_a4_regen}")
    import re as _re_count
    for slide in html_slides:
        seq = slide.get("seq", 0)
        html_before = slide.get("html", "")
        _14_before = html_before.count('font-size:14px') + html_before.count('font-size: 14px')
        hex_before = len(_re_count.findall(r'#[0-9a-fA-F]{3,6}\b', html_before))
        if scheme_data:
            slide["html"] = _auto_fix_hardcoded_hex(slide.get("html", ""), scheme_data, seq)
            slide["html_vars"] = _auto_fix_hardcoded_hex(slide.get("html_vars", slide.get("html", "")), scheme_data, seq)
        slide["html"] = _auto_fix_font_size(slide.get("html", ""), seq, is_a4=is_a4_regen)
        slide["html_vars"] = _auto_fix_font_size(slide.get("html_vars", slide.get("html", "")), seq, is_a4=is_a4_regen)
        _14_after = slide["html"].count('font-size:14px') + slide["html"].count('font-size: 14px')
        hex_after = len(_re_count.findall(r'#[0-9a-fA-F]{3,6}\b', slide.get("html", "")))
        var_count = len(_re_count.findall(r'\{\{[a-z_0-9]+\}\}', slide.get("html", "")))
        _log(f"Slide {seq} 自动修正: {hex_before}→{hex_after} hex, {var_count} vars, 14px {_14_before}→{_14_after}")

    # Splice regenerated slides back into the plan
    for slide in html_slides:
        seq = slide.get("seq", 0)
        idx = seq - 1
        if 0 <= idx < len(slide_plan):
            slide_plan[idx]["html"] = slide.get("html", "")
            slide_plan[idx]["html_vars"] = slide.get("html_vars", slide.get("html", ""))

    _log("正在解析颜色变量...")

    # Resolve color variables for resolved HTML deck
    resolved_slides = []
    for s in slide_plan:
        # Use html_vars (with {{primary}} placeholders) when available so
        # color re-resolution works. Fall back to plain html.
        html_v = s.get("html_vars", "") or s.get("html", "")
        if html_v and scheme_data:
            html_v = _resolve_color_vars(html_v, scheme_data, css_vars=True)
            html_v, _enf_count = _enforce_no_hardcoded_hex(html_v, scheme_data, s.get("seq", 0))
        resolved_slides.append({**s, "html": html_v})

    # Fix cover slide: if background is primary (dark), text must be light
    # otherwise title text is invisible (e.g. deep-blue: text=#1a202c on bg=#1a365d)
    if resolved_slides and scheme_data:
        cover = resolved_slides[0]
        primary = scheme_data.get("primary", "")
        secondary = scheme_data.get("secondary", "")
        text_color = scheme_data.get("text", "")
        if primary and text_color:
            cover_html = cover.get("html", "")
            # Search entire HTML for dark background (primary or secondary as bg)
            has_dark_bg = (f"background:{primary}" in cover_html
                          or f"background:{secondary}" in cover_html
                          or f"background: {primary}" in cover_html
                          or f"background: {secondary}" in cover_html)
            if has_dark_bg:
                # Replace text color with #ffffff (legal hardcoded white per VI spec)
                cover_html = cover_html.replace(f"color:{text_color}", "color:#ffffff")
                cover_html = cover_html.replace(f"color:{text_color};", "color:#ffffff;")
                cover_html = cover_html.replace(f"color: {text_color}", "color: #ffffff")
                cover_html = cover_html.replace(f"color: {text_color};", "color: #ffffff;")
                resolved_slides[0] = {**cover, "html": cover_html}
                _log("封面页修复：深色背景 → 白色文字")

    _log("正在组装完整 HTML...")

    # Get canvas dimensions for the column (defaults to 1280x720 if unknown)
    regen_canvas_w, regen_canvas_h = _get_canvas_dimensions(column_id, project_id=project_id)

    # Rebuild both decks
    title = slide_plan[0].get("heading", "") if slide_plan else "Presentation"
    deck_html = _assemble_html_deck(resolved_slides, title, style_id, scheme_data, canvas_w=regen_canvas_w, canvas_h=regen_canvas_h)
    if scheme_data:
        deck_html = _resolve_color_vars(deck_html, scheme_data, css_vars=True)
        deck_html, _deck_enf = _enforce_no_hardcoded_hex(deck_html, scheme_data, 0)
    deck_vars = _assemble_html_deck(
        [{**s, "html": s.get("html_vars", s.get("html", ""))} for s in slide_plan],
        title, style_id, scheme_data, canvas_w=regen_canvas_w, canvas_h=regen_canvas_h
    )

    _log(f"正在写入文件（{len(deck_html)} 字节）...")

    # Write to regenerated file (NEVER overwrite index.html)
    regen_html_path = os.path.join(run_dir, "index_regenerated.html")
    with open(regen_html_path, "w", encoding="utf-8") as f:
        f.write(deck_html)
    regen_vars_path = os.path.join(run_dir, "index_regenerated_vars.html")
    with open(regen_vars_path, "w", encoding="utf-8") as f:
        f.write(deck_vars)

    # Build partial mini-deck with only the regenerated slides
    regen_resolved = [s for s in resolved_slides if s.get("seq") in set(seqs)]

    # Save individual slide files for regenerated slides
    from services.ppt_service import _save_slide_files
    _save_slide_files(run_dir, regen_resolved)
    _log(f"已保存 {len(regen_resolved)} 页独立幻灯片文件")

    # Per-slide resolved HTML for targeted splice (not full-deck overwrite).
    # MUST be computed BEFORE _assemble_html_deck because _preprocess_a4_slides
    # renumbers slides in-place, corrupting seq values.
    regen_slides = [{"seq": s["seq"], "html": s["html"]} for s in regen_resolved]

    partial_html = _assemble_html_deck(regen_resolved, title, style_id, scheme_data, total_slides=len(slide_plan), canvas_w=regen_canvas_w, canvas_h=regen_canvas_h)
    if scheme_data:
        partial_html = _resolve_color_vars(partial_html, scheme_data, css_vars=True)
    regen_partial_path = os.path.join(run_dir, "index_regenerated_partial.html")
    with open(regen_partial_path, "w", encoding="utf-8") as f:
        f.write(partial_html)

    preview_url = f"/api/exports/{req.run_id}/index_regenerated.html"
    partial_url = f"/api/exports/{req.run_id}/index_regenerated_partial.html"

    _log("DONE")

    return {"ok": True, "slide_seqs": seqs,
            "preview_url": preview_url, "partial_url": partial_url,
            "slides": regen_slides, "html": deck_html}


@app.put("/api/ppt/splice-slides/{run_id}")
def api_ppt_splice_slides(run_id: str, req: dict, user=require_perm("stage3.generate")):
    """Apply regenerated slides by directly replacing slide wrappers in index.html.

    Extracts the regenerated slide wrappers from index_regenerated.html
    and splices them into index.html at the matching positions.
    Only regenerated slides change — all other slides stay byte-identical.
    """
    import re as _re

    run_dir = _find_run_dir(run_id)
    if not run_dir or not os.path.isdir(run_dir):
        raise HTTPException(status_code=404, detail="Run not found")

    slides_data = req.get("slides", [])
    if not slides_data:
        raise HTTPException(status_code=400, detail="slides is required")

    log_path_splice = os.path.join(run_dir, "_splice_log.txt")
    def _log_splice(msg: str):
        import datetime as _dt_sp
        ts = _dt_sp.datetime.now().strftime("%H:%M:%S")
        line = f"[{ts}] {msg}\n"
        with open(log_path_splice, "a", encoding="utf-8") as _lf:
            _lf.write(line)
            _lf.flush()

    regen_path = os.path.join(run_dir, "index_regenerated.html")
    if not os.path.exists(regen_path):
        raise HTTPException(status_code=400, detail="index_regenerated.html not found — regenerate first")

    index_path = os.path.join(run_dir, "index.html")
    if not os.path.exists(index_path):
        raise HTTPException(status_code=400, detail="index.html not found")

    with open(regen_path, "r", encoding="utf-8") as f:
        regen_html = f.read()
    with open(index_path, "r", encoding="utf-8") as f:
        index_html = f.read()

    _ensure_backup(run_dir)

    regen_seqs = {s["seq"] for s in slides_data}
    replaced = 0

    for seq in sorted(regen_seqs):
        # Extract slide wrapper from index_regenerated.html
        wrapper = _extract_slide_wrapper(regen_html, seq)
        if wrapper is None:
            _log_splice(f"Warning: slide {seq} not found in index_regenerated.html")
            continue

        # Replace matching wrapper in index.html
        old_wrapper = _extract_slide_wrapper(index_html, seq)
        if old_wrapper is None:
            _log_splice(f"Warning: slide {seq} not found in index.html")
            continue

        index_html = index_html.replace(old_wrapper, wrapper, 1)
        replaced += 1
        _log_splice(f"Replaced slide {seq} ({len(old_wrapper)} → {len(wrapper)} bytes)")

    # Write updated index.html
    with open(index_path, "w", encoding="utf-8") as f:
        f.write(index_html)

    # Save individual slide files for regenerated slides
    from services.ppt_service import _save_slide_files
    regen_slides = []
    for seq in sorted(regen_seqs):
        inner = _extract_slide_inner(regen_html, seq)
        if inner is not None:
            regen_slides.append({"seq": seq, "html": inner})
    if regen_slides:
        _save_slide_files(run_dir, regen_slides)
        _log_splice(f"Saved {len(regen_slides)} individual slide files")

    _log_splice(f"Spliced {replaced}/{len(regen_seqs)} slides into index.html")
    return {"ok": True, "replaced": replaced, "total": len(slides_data)}


def _extract_slide_wrapper(html: str, seq: int) -> str | None:
    """Extract the full slide-wrapper div (including outer div) for a given seq."""
    import re
    prefix = f'<div class="slide-wrapper" data-seq="{seq}">'
    start = html.find(prefix)
    if start < 0:
        return None
    # Find the end: next slide-wrapper or </body>
    next_wrapper = html.find('<div class="slide-wrapper"', start + len(prefix))
    if next_wrapper > 0:
        return html[start:next_wrapper]
    # Last slide — ends before </body>
    body_end = html.find('</body>', start)
    if body_end > 0:
        return html[start:body_end]
    return None


def _extract_slide_inner(html: str, seq: int) -> str | None:
    """Extract only the inner content of a slide-wrapper (without the outer div)."""
    import re
    prefix = f'<div class="slide-wrapper" data-seq="{seq}">'
    start = html.find(prefix)
    if start < 0:
        return None
    inner_start = start + len(prefix)
    next_wrapper = html.find('<div class="slide-wrapper"', inner_start)
    if next_wrapper > 0:
        inner = html[inner_start:next_wrapper]
    else:
        body_end = html.find('</body>', inner_start)
        if body_end > 0:
            inner = html[inner_start:body_end]
        else:
            return None
    # Strip trailing whitespace/newlines before the closing wrapper or next wrapper
    inner = inner.rstrip()
    # Remove closing </div> if present (trailing wrapper close)
    if inner.endswith('</div>'):
        inner = inner[:-len('</div>')].rstrip()
    return inner


def _splice_slides_legacy(run_dir, slides_data, scheme_data, style_id,
                          color_scheme, log_path_splice, _log_splice, _re):
    """Legacy string-splice for runs without individual slide files."""
    from services.ppt_service import _auto_fix_font_size, _auto_fix_hardcoded_hex

    index_path = os.path.join(run_dir, "index.html")
    with open(index_path, "r", encoding="utf-8") as _f:
        html = _f.read()

    has_wrapper = '<div class="slide-wrapper"' in html[:5000]
    replaced = 0
    for slide in slides_data:
        seq = slide["seq"]
        new_html = slide["html"]
        if has_wrapper:
            wrapper_tag = f'<div class="slide-wrapper" data-seq="{seq}">'
            pos = html.find(wrapper_tag)
            if pos == -1:
                nth = seq - 1
                pos = 0
                for _ in range(nth + 1):
                    pos = html.find('<div class="slide-wrapper"', pos)
                    if pos == -1: break
                    if _ < nth: pos += len('<div class="slide-wrapper"')
            if pos != -1:
                tag_end = html.find('>', pos) + 1
                depth = 1
                i = tag_end
                while i < len(html) and depth > 0:
                    next_open = html.find('<div', i)
                    next_close = html.find('</div>', i)
                    if next_close == -1: break
                    if next_open != -1 and next_open < next_close:
                        depth += 1; i = next_open + 4
                    else:
                        depth -= 1
                        if depth == 0:
                            close_end = next_close + 6
                            replacement = f'<div class="slide-wrapper" data-seq="{seq}">{new_html}</div>'
                            html = html[:pos] + replacement + html[close_end:]
                            replaced += 1; break
                        i = next_close + 6
        else:
            pat = _re.compile(r'<section[^>]*\s+data-seq="' + str(seq) + r'"[^>]*>.*?</section>', _re.DOTALL)
            new_html_text, count = pat.subn(new_html, html, count=1)
            if count > 0: html = new_html_text; replaced += count

    _ensure_backup(run_dir)

    if scheme_data:
        hex_before = len(_re.findall(r'#[0-9a-fA-F]{3,6}\b', html))
        html = _auto_fix_hardcoded_hex(html, scheme_data, 0)
        from services.ppt_service import _resolve_color_vars
        html = _resolve_color_vars(html, scheme_data, css_vars=True)
        hex_after = len(_re.findall(r'#[0-9a-fA-F]{3,6}\b', html))
        _log_splice(f"Post-splice hex fix: {hex_before}→{hex_after}")
        if "var(--" in html and ":root {" in html:
            from services.ppt_service import _build_root_vars
            root_block = _build_root_vars(scheme_data)
            root_start = html.find(':root {')
            if root_start > 0:
                depth = 1; scan = root_start + len(':root {')
                while scan < len(html) and depth > 0:
                    ch = html[scan]
                    if ch == '{': depth += 1
                    elif ch == '}': depth -= 1
                    scan += 1
                root_end = scan
                html = html[:root_start] + root_block + html[root_end:]
                _log_splice(f"Updated :root block for color scheme: {color_scheme}")

    font_before_13 = len(_re.findall(r'font-size:\s*1[0-3]px', html))
    font_before_15 = len(_re.findall(r'font-size:\s*15px', html))
    is_a4_splice = 'width:794px' in html[:2000] or 'height:1123px' in html[:2000]
    html = _auto_fix_font_size(html, 0, is_a4=is_a4_splice)
    font_after_13 = len(_re.findall(r'font-size:\s*1[0-3]px', html))
    font_after_15 = len(_re.findall(r'font-size:\s*15px', html))
    _log_splice(f"Post-splice font fix: 13px {font_before_13}→{font_after_13}, 15px {font_before_15}→{font_after_15}")

    with open(index_path, "w", encoding="utf-8") as _f:
        _f.write(html)

    return {"ok": True, "replaced": replaced, "total": len(slides_data)}


def _find_run_dir(run_id: str):
    """Resolve run directory with 3-tier fallback: memory → EXPORT_DIR → scan."""
    if '..' in run_id or '/' in run_id or '\\' in run_id:
        return None
    run_dir = _run_dirs.get(run_id)
    if run_dir and os.path.isdir(run_dir):
        return run_dir
    candidate = os.path.join(EXPORT_DIR, run_id)
    if os.path.isdir(candidate):
        _run_dirs[run_id] = candidate
        return candidate
    for base in [EXPORT_DIR] + _scan_output_bases():
        candidate = os.path.join(base, run_id)
        if os.path.isdir(candidate):
            _run_dirs[run_id] = candidate
            _save_run_dirs(_run_dirs)
            return candidate
    return None


@app.get("/api/ppt/regenerate-state/{run_id}")
def api_ppt_get_regenerate_state(run_id: str, user=require_perm("stage3.view")):
    """Load persisted regenerate-tab state so it survives modal close/reopen."""
    run_dir = _find_run_dir(run_id)
    if not run_dir:
        return {"state": None}
    state_path = os.path.join(run_dir, "_regenerate_state.json")
    if not os.path.exists(state_path):
        return {"state": None}
    try:
        with open(state_path, encoding="utf-8") as _f:
            return {"state": json.loads(_f.read())}
    except Exception:
        return {"state": None}


@app.post("/api/ppt/regenerate-state/{run_id}")
def api_ppt_save_regenerate_state(run_id: str, req: dict, user=require_perm("stage3.generate")):
    """Persist regenerate-tab state to disk so it survives modal close/reopen."""
    run_dir = _find_run_dir(run_id)
    if not run_dir:
        raise HTTPException(status_code=404, detail="Run not found")
    state_path = os.path.join(run_dir, "_regenerate_state.json")
    with open(state_path, "w", encoding="utf-8") as _f:
        json.dump(req, _f, ensure_ascii=False)
    return {"ok": True}


@app.delete("/api/ppt/regenerate-state/{run_id}")
def api_ppt_clear_regenerate_state(run_id: str, user=require_perm("stage3.generate")):
    """Clear persisted regenerate-tab state (user clicked discard)."""
    run_dir = _find_run_dir(run_id)
    if not run_dir:
        return {"ok": True}
    state_path = os.path.join(run_dir, "_regenerate_state.json")
    if os.path.exists(state_path):
        try:
            os.remove(state_path)
        except Exception:
            pass
    return {"ok": True}


@app.get("/api/ppt/regenerate-log/{run_id}")
def api_ppt_regenerate_log(run_id: str):
    """Poll the regenerate progress log. Returns the full log text.
    Frontend polls this every 10 seconds during regeneration."""
    run_dir = _run_dirs.get(run_id)
    if not run_dir:
        candidate = os.path.join(EXPORT_DIR, run_id)
        if os.path.isdir(candidate):
            run_dir = candidate
    if not run_dir or not os.path.isdir(run_dir):
        raise HTTPException(status_code=404, detail="Run not found")

    log_path = os.path.join(run_dir, "_regenerate_log.txt")
    if not os.path.exists(log_path):
        return {"log": "", "done": False}

    with open(log_path, encoding="utf-8") as f:
        text = f.read()

    done = text.rstrip().endswith("DONE")
    return {"log": text, "done": done}


# ── PPT Styles (17 PPT-Agent YAML styles) ──

@app.get("/api/ppt/styles")
def api_ppt_styles():
    """List all 17 PPT-Agent styles from the YAML style library.
    Returns a flat list of styles. Each style has a 'group' field
    (Professional, Creative, Tech / Dark, Thematic) and includes
    color palette, typography, mood, and use cases.
    """
    try:
        from services.svg_renderer import StyleLoader
        loader = StyleLoader()
        groups = loader.list_styles()
        flat = []
        for g in groups:
            for s in g.get("styles", []):
                flat.append(s)
        return {"styles": flat}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── VI & Prompt file editor (directory-aware) ──

VI_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                      "resources", "vi")

VI_SECTIONS = ["vi", "cover", "content", "data", "summary", "prompt"]


class VIFileUpdate(BaseModel):
    content: str


def _style_dir(style_id: str) -> str:
    return os.path.join(VI_DIR, style_id)


def _vi_section_path(style_id: str, section: str) -> str:
    """Get path for a VI sub-file. Supports subdirectories e.g. blocks/header, templates/homework_manual."""
    ext = ".yaml" if section == "tokens" else ".md"
    return os.path.join(_style_dir(style_id), f"{section}{ext}")


def _validate_vi_path(style_id: str, section: str, for_write: bool = False) -> str:
    """Resolve and validate a VI path stays within the style directory. Returns the safe path."""
    p = _vi_section_path(style_id, section)
    base = os.path.realpath(_style_dir(style_id))
    # Use normpath to collapse ../ sequences, then verify the result is under base.
    # Use normcase for case-insensitive comparison (Windows: __file__ may be lowercase
    # while realpath returns actual filesystem casing).
    normalized = os.path.normpath(os.path.abspath(p))
    if not os.path.normcase(normalized).startswith(os.path.normcase(os.path.normpath(base) + os.sep)):
        raise HTTPException(status_code=403, detail="Path traversal denied")
    # For read paths that exist, additionally resolve symlinks via realpath
    if not for_write and os.path.exists(p):
        real_p = os.path.realpath(p)
        if not os.path.normcase(real_p).startswith(os.path.normcase(base + os.sep)):
            raise HTTPException(status_code=403, detail="Path traversal denied")
    return p


@app.get("/api/ppt/styles/{style_id}/vi/files")
def api_list_style_vi_files(style_id: str):
    """List all VI sub-files in the style directory (recursive into subdirectories)."""
    d = _style_dir(style_id)
    if not os.path.isdir(d):
        return {"files": [], "exists": False}
    files = []
    from services.ppt_service import _page_type_sort_key
    for root, _dirs, filenames in os.walk(d):
        for f in filenames:
            if f.endswith((".md", ".yaml")):
                p = os.path.join(root, f)
                rel = os.path.relpath(p, d).replace("\\", "/")
                section = rel.rsplit(".", 1)[0]  # e.g. "blocks/header", "cover"
                files.append({
                    "name": rel,
                    "size": os.path.getsize(p),
                    "section": section,
                })
    files.sort(key=lambda x: _page_type_sort_key(x["section"]))
    return {"files": files, "exists": True, "dir": d}


@app.get("/api/ppt/styles/{style_id}/page-types")
def api_get_page_types(style_id: str):
    """Return available page_types for a style — scanned from VI directory.
    Each .md file (except vi.md, prompt.md) = one page_type.
    """
    from services.ppt_service import _scan_vi_page_types, _fallback_page_types
    try:
        types = _scan_vi_page_types(style_id)
        return {"page_types": types}
    except Exception:
        return {"page_types": _fallback_page_types()}


@app.get("/api/ppt/styles/{style_id}/color-schemes")
def api_list_color_schemes(style_id: str):
    """List available color schemes for a style from its tokens.yaml."""
    from services.ppt_service import _list_color_schemes
    schemes = _list_color_schemes(style_id)
    return {"color_schemes": schemes, "exists": len(schemes) > 0}


@app.get("/api/ppt/styles/{style_id}/vi/{section:path}")
def api_get_style_vi_section(style_id: str, section: str, color_scheme: str = ""):
    """Load a specific VI sub-file. Resolves {{color}} variables when color_scheme is provided."""
    from services.ppt_service import _load_scheme_data, _resolve_color_vars

    p = _validate_vi_path(style_id, section)
    if not os.path.exists(p):
        return {"content": "", "exists": False, "section": section}
    with open(p, "r", encoding="utf-8") as f:
        content = f.read()
    if color_scheme:
        scheme = _load_scheme_data(style_id, color_scheme)
        if scheme:
            content = _resolve_color_vars(content, scheme)
    return {"content": content, "exists": True, "section": section}


@app.put("/api/ppt/styles/{style_id}/vi/{section:path}")
def api_save_style_vi_section(style_id: str, section: str, body: VIFileUpdate, user=require_perm("template.manage")):
    """Save a specific VI sub-file. Supports subdirectory sections."""
    d = _style_dir(style_id)
    os.makedirs(d, exist_ok=True)
    p = _validate_vi_path(style_id, section, for_write=True)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write(body.content)
    return {"ok": True, "path": p, "section": section}


# ── Scenario prompt files (per-column design rule overrides) ──

SCENARIOS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "resources", "scenarios")
SCENARIO_FILES = [
    "design-system.md",
    "outline-architect.md",
    "cognitive-design-principles.md",
    "reviewer.md",
    "svg-generator.md",
    "bento-grid-layout.md",
]


def _scenario_file_path(column_id: str, filename: str, for_write: bool = False) -> str:
    """Resolve a scenario file path. For read: custom → default → None.
    For write: always returns custom path (auto-creates dir)."""
    fname = os.path.basename(str(filename))
    if fname != filename or fname.startswith(".") or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    if for_write:
        d = os.path.join(SCENARIOS_DIR, column_id)
        os.makedirs(d, exist_ok=True)
        return os.path.join(d, fname)
    # Read path: check custom first, then default
    p = os.path.join(SCENARIOS_DIR, column_id, fname)
    if os.path.exists(p):
        return p
    p = os.path.join(SCENARIOS_DIR, "_default", fname)
    if os.path.exists(p):
        return p
    return ""


@app.get("/api/scenarios/{column_id}/files")
def api_list_scenario_files(column_id: str):
    """List all 6 scenario files with their source (custom / default / missing)."""
    files = []
    for fname in SCENARIO_FILES:
        custom_path = os.path.join(SCENARIOS_DIR, column_id, fname)
        default_path = os.path.join(SCENARIOS_DIR, "_default", fname)
        if os.path.exists(custom_path):
            source = "custom"
            size = os.path.getsize(custom_path)
        elif os.path.exists(default_path):
            source = "default"
            size = os.path.getsize(default_path)
        else:
            source = "missing"
            size = 0
        files.append({"name": fname, "size": size, "source": source})
    return {"files": files, "column_id": column_id}


@app.get("/api/scenarios/{column_id}/files/{filename}")
def api_get_scenario_file(column_id: str, filename: str):
    """Get a scenario file content (custom → default → 404)."""
    p = _scenario_file_path(column_id, filename)
    if not p:
        return {"content": "", "exists": False, "filename": filename}
    with open(p, "r", encoding="utf-8") as f:
        return {"content": f.read(), "exists": True, "filename": filename}


@app.put("/api/scenarios/{column_id}/files/{filename}")
def api_save_scenario_file(column_id: str, filename: str, body: VIFileUpdate, user=require_perm("config.project")):
    """Save a scenario file to the per-column custom directory."""
    p = _scenario_file_path(column_id, filename, for_write=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write(body.content)
    return {"ok": True, "path": p, "filename": filename}


# Backward-compatible: GET /vi returns the full combined VI for a style
@app.get("/api/ppt/styles/{style_id}/vi")
def api_get_style_vi(style_id: str, color_scheme: str = ""):
    """Load full VI — concatenates all sub-files if directory exists, else legacy file.
    Resolves {{color}} variables against color_scheme when provided."""
    from services.ppt_service import _load_scheme_data, _resolve_color_vars, _load_style_vi

    d = _style_dir(style_id)
    if os.path.isdir(d):
        parts = []
        vi_path = os.path.join(d, "vi.md")
        if os.path.exists(vi_path):
            with open(vi_path, "r", encoding="utf-8") as f:
                parts.append(f.read())
        for section in ["cover", "content", "data", "summary"]:
            sp = os.path.join(d, f"{section}.md")
            if os.path.exists(sp):
                with open(sp, "r", encoding="utf-8") as f:
                    parts.append(f.read())
        if parts:
            content = "\n\n---\n\n".join(parts)
            if color_scheme:
                scheme = _load_scheme_data(style_id, color_scheme)
                if scheme:
                    content = _resolve_color_vars(content, scheme)
            return {"content": content, "exists": True}
    # Legacy fallback
    content = _load_style_vi(style_id, color_scheme or "deep-blue")
    return {"content": content, "exists": bool(content)}


@app.put("/api/ppt/styles/{style_id}/vi")
def api_save_style_vi(style_id: str, body: VIFileUpdate, user=require_perm("template.manage")):
    """Save VI — writes to vi.md in directory structure."""
    d = _style_dir(style_id)
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, "vi.md")
    with open(p, "w", encoding="utf-8") as f:
        f.write(body.content)
    return {"ok": True, "path": p}


@app.get("/api/ppt/styles/{style_id}/prompt")
def api_get_style_prompt(style_id: str):
    """Load a style's AI prompt markdown file."""
    # Directory structure first
    p = os.path.join(_style_dir(style_id), "prompt.md")
    if os.path.exists(p):
        with open(p, "r", encoding="utf-8") as f:
            return {"content": f.read(), "exists": True}
    # Legacy fallback
    from services.ppt_service import _load_style_prompt
    content = _load_style_prompt(style_id)
    return {"content": content, "exists": bool(content)}


@app.put("/api/ppt/styles/{style_id}/prompt")
def api_save_style_prompt(style_id: str, body: VIFileUpdate, user=require_perm("template.manage")):
    """Save a style's AI prompt markdown file."""
    d = _style_dir(style_id)
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, "prompt.md")
    with open(p, "w", encoding="utf-8") as f:
        f.write(body.content)
    return {"ok": True, "path": p}


@app.get("/api/ppt/export-zip/{run_id}")
def api_export_svg_zip(run_id: str):
    """Download all SVG files + index.html for a generated deck as a ZIP archive."""
    import zipfile, io
    run_dir = _run_dirs.get(run_id)
    if not run_dir:
        candidate = os.path.join(EXPORT_DIR, run_id)
        if os.path.isdir(candidate):
            run_dir = candidate
    if not run_dir:
        for base in [EXPORT_DIR] + _scan_output_bases():
            candidate = os.path.join(base, run_id)
            if os.path.isdir(candidate):
                run_dir = candidate
                _run_dirs[run_id] = run_dir
                _save_run_dirs(_run_dirs)
                break
    if not run_dir:
        raise HTTPException(status_code=404, detail="Export not found")
    buf = io.BytesIO()
    try:
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as zf:
            for fname in os.listdir(run_dir):
                fpath = os.path.join(run_dir, fname)
                if os.path.isfile(fpath):
                    zf.write(fpath, fname)
    except Exception as e:
        import traceback
        print(f"[ZIP ERROR] run_dir={run_dir!r} error={e}", flush=True)
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"ZIP creation failed: {e}")
    buf.seek(0)
    from urllib.parse import quote
    safe_name = quote(f"svg-deck-{run_id}.zip", safe="")
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{safe_name}"},
    )


@app.post("/api/ppt/save-images/{run_id}")
async def api_save_slide_images(run_id: str, user=require_perm("stage3.generate"), download: bool = False):
    """Render each slide as a 1280x720 PNG and save to the export directory.
    If download=true, return a zip file instead of JSON."""
    import asyncio

    run_dir = _find_run_dir(run_id)
    if not run_dir:
        raise HTTPException(status_code=404, detail="Export not found")

    html_path = os.path.join(run_dir, "index.html")
    if not os.path.exists(html_path):
        raise HTTPException(status_code=404, detail="index.html not found")

    def _capture():
        try:
            from playwright.sync_api import sync_playwright
        except ImportError:
            raise HTTPException(status_code=500, detail="playwright not installed")

        saved = []
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            page = browser.new_page(viewport={"width": 1280, "height": 720})
            page.goto("file:///" + html_path.replace("\\", "/"))
            page.wait_for_timeout(500)

            slides = page.query_selector_all(".slide-wrapper, section")
            if not slides:
                slides = page.query_selector_all('[style*="width"]')

            for i, slide in enumerate(slides):
                png_path = os.path.join(run_dir, f"slide_{i+1:02d}.png")
                slide.screenshot(path=png_path)
                saved.append(png_path)

            browser.close()
        return saved

    saved = await asyncio.to_thread(_capture)

    if download:
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
            for f in saved:
                zf.write(f, os.path.basename(f))
        buf.seek(0)
        from urllib.parse import quote
        safe_name = quote(f"slides-{run_id}.zip", safe="")
        return StreamingResponse(
            buf,
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename*=UTF-8''{safe_name}"},
        )

    return {"ok": True, "saved": len(saved), "files": [os.path.basename(f) for f in saved],
            "dir": run_dir}


@app.post("/api/open-folder")
async def api_open_folder(req: dict, user=require_perm("config.project")):
    path = req.get("path", "")
    if not path or not os.path.isdir(path):
        raise HTTPException(status_code=400, detail="Path not found")
    os.startfile(path)
    return {"ok": True}


# ── SOP Export ──

from services.export_service import export_sop

class SOPExportRequest(BaseModel):
    content: str
    branding: dict = None
    project_id: Optional[str] = None


@app.post("/api/export/sop")
def api_export_sop(req: SOPExportRequest, user=require_perm("stage5.download")):
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


# ── Public download endpoints (no auth required, must precede /api/download/{filename}) ──

@app.get("/api/download/info")
def api_download_info():
    dl_dir = os.path.join(BASE_DIR, "data", "downloads")
    info: dict = {"desktop": None, "server": None}
    # Find any .exe in downloads (name changes with app settings)
    if os.path.isdir(dl_dir):
        for f in os.listdir(dl_dir):
            if f.lower().endswith(".exe"):
                fp = os.path.join(dl_dir, f)
                info["desktop"] = {"size": os.path.getsize(fp), "name": f}
                break
    zip_path = os.path.join(dl_dir, "yishao-agent-server.zip")
    if os.path.isfile(zip_path):
        info["server"] = {"size": os.path.getsize(zip_path), "name": "yishao-agent-server.zip"}
    return info


@app.get("/api/download/desktop")
def api_download_desktop():
    dl_dir = os.path.join(BASE_DIR, "data", "downloads")
    # Find any .exe in downloads
    exe_file = None
    if os.path.isdir(dl_dir):
        for f in os.listdir(dl_dir):
            if f.lower().endswith(".exe"):
                exe_file = f
                break
    if not exe_file:
        raise HTTPException(status_code=404, detail="桌面版安装包尚未构建")
    return _file_response(os.path.join(dl_dir, exe_file), filename=exe_file)


@app.get("/api/download/server")
def api_download_server():
    dl_dir = os.path.join(BASE_DIR, "data", "downloads")
    path = os.path.join(dl_dir, "yishao-agent-server.zip")
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="服务器版安装包尚未构建")
    return _file_response(path, filename="yishao-agent-server.zip")


# ── File Download ──

@app.get("/api/download/{filename}")
def download_file(filename: str, request: Request, project_id: str = None, name: str = None):
    download_name = name or filename
    if project_id:
        user = getattr(request.state, "user", None) if request else None
        if user is None and request:
            token = request.query_params.get("token")
            if token:
                try:
                    user = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
                    # Verify token_version for security
                    if "token_version" in user and "sub" in user:
                        db = get_db()
                        try:
                            urow = db.execute(
                                "SELECT token_version FROM users WHERE id=? AND is_active=1",
                                (user["sub"],),
                            ).fetchone()
                            if not urow or urow["token_version"] != user["token_version"]:
                                user = None
                        finally:
                            db.close()
                except JWTError:
                    pass
        if user is None:
            raise HTTPException(status_code=401, detail="请先登录")
        perms = set(user.get("permissions", []))
        if user.get("user_type") == "admin":
            perms.add("project.view_all")
        if "stage5.download" not in perms:
            raise HTTPException(status_code=403, detail="缺少权限: stage5.download")
        verify_project_access(project_id, user)
        try:
            proj_dir = resolve_project_storage(project_id, auto_create=False)
            filepath = os.path.join(proj_dir, filename)
            if os.path.exists(filepath):
                return _file_response(filepath, filename=download_name)
        except Exception:
            pass

    filepath = os.path.join(EXPORT_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found")
    return _file_response(filepath, filename=download_name)


# ── TTS ──

def split_text(text: str, max_chunk: int = 290) -> list:
    """Split text into chunks at natural boundaries (paragraph → sentence → comma → hard)."""
    lines = text.replace('\r\n', '\n').replace('\r', '\n').split('\n')

    chunks = []
    current = ""

    for line in lines:
        stripped = line.strip()
        if not stripped:
            if current:
                current += '\n'
            continue

        sep = '\n' if current else ''
        if len(current) + len(sep) + len(stripped) <= max_chunk:
            current += sep + stripped
        else:
            if current:
                chunks.append(current)
            if len(stripped) > max_chunk:
                parts = re.split(r'(?<=[。！？.!?])', stripped)
                sub = ""
                for p in parts:
                    p = p.strip()
                    if not p:
                        continue
                    sep2 = '\n' if sub else ''
                    if len(sub) + len(sep2) + len(p) <= max_chunk:
                        sub += sep2 + p
                    else:
                        if sub:
                            chunks.append(sub)
                        if len(p) > max_chunk:
                            comma_parts = re.split(r'(?<=[，,；;：:])', p)
                            cs = ""
                            for cp in comma_parts:
                                cp = cp.strip()
                                if not cp:
                                    continue
                                sep3 = '\n' if cs else ''
                                if len(cs) + len(sep3) + len(cp) <= max_chunk:
                                    cs += sep3 + cp
                                else:
                                    if cs:
                                        chunks.append(cs)
                                    if len(cp) > max_chunk:
                                        for i in range(0, len(cp), max_chunk):
                                            chunks.append(cp[i:i+max_chunk])
                                        cs = ""
                                    else:
                                        cs = cp
                            sub = cs if cs else p
                        else:
                            sub = p
                current = sub
            else:
                current = stripped

    if current:
        chunks.append(current)
    return chunks


@app.post("/api/tts/split")
def api_tts_split(req: TtsSplitRequest, user=require_perm("stage4.view")):
    """Split text into segments for per-segment synthesis."""
    segments = split_text(req.text, req.max_chunk)
    return {"segments": [{"index": i + 1, "text": s} for i, s in enumerate(segments)], "total": len(segments)}


@app.post("/api/tts/synthesize")
async def api_tts_synthesize(req: SynthesizeRequest, user=require_perm("stage4.generate")):
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
        if not _is_safe_audio_url(audio_url):
            raise HTTPException(status_code=400, detail="音频URL域名不受信任")

        # Download and save
        async with httpx.AsyncClient(timeout=60) as client:
            dl = await client.get(audio_url)

        output_dir = AUDIO_DIR
        proj = None
        if req.project_id:
            output_dir = resolve_project_storage(req.project_id)
            proj = _get_project(req.project_id)
        os.makedirs(output_dir, exist_ok=True)

        safe_project = "".join(c for c in (proj["name"] if proj else "audio") if c.isalnum() or c in "._- ()（）").strip() or "audio"
        source = "".join(c for c in (req.source_name or "演讲") if c.isalnum() or c in "._- ()（）").strip()
        base_name = f"{safe_project}_{source}"
        existing = [f for f in os.listdir(output_dir) if f.startswith(base_name) and f.endswith(".mp3")]
        seq = len(existing) + 1
        audio_name = f"{base_name}_{seq}.mp3"
        audio_path = os.path.join(output_dir, audio_name)
        with open(audio_path, "wb") as f:
            f.write(dl.content)

        serve_url = f"/api/audio/{audio_name}"
        params = []
        if req.project_id:
            params.append(f"project_id={req.project_id}")
            if proj:
                safe_dl = "".join(c for c in audio_name if c.isalnum() or c in "._- ()（）").strip()
                params.append(f"name={safe_dl}")
        if params:
            serve_url += "?" + "&".join(params)

        # Save to tts_history
        history_id = None
        if req.project_id:
            db = get_db()
            try:
                db.execute(
                    "INSERT INTO tts_history (project_id, text, voice_id, model, audio_path, name, voice_name) VALUES (?, ?, ?, ?, ?, ?, ?)",
                    (req.project_id, req.text, req.voice_id or "", req.model, audio_name, audio_name, req.voice_name or "")
                )
                db.commit()
                history_id = db.execute("SELECT last_insert_rowid()").fetchone()[0]
            finally:
                db.close()

        return {"audio_url": serve_url, "filename": audio_name, "history_id": history_id, "audio_path": audio_name}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── TTS History CRUD ──

@app.get("/api/projects/{project_id}/tts-history")
def api_tts_history_list(project_id: str, request: Request):
    user = getattr(request.state, "user", None)
    if user is not None:
        verify_project_access(project_id, user)
    db = get_db()
    try:
        rows = db.execute(
            "SELECT id, project_id, text, voice_id, model, audio_path, name, voice_name, created_at FROM tts_history WHERE project_id = ? ORDER BY created_at DESC",
            (project_id,)
        ).fetchall()
        return [{
            "id": r["id"],
            "project_id": r["project_id"],
            "text": r["text"],
            "voice_id": r["voice_id"],
            "model": r["model"],
            "audio_path": r["audio_path"],
            "name": r["name"] or "",
            "voice_name": r["voice_name"] or "",
            "created_at": r["created_at"],
        } for r in rows]
    finally:
        db.close()


@app.put("/api/tts-history/{history_id}")
def api_tts_history_update(history_id: int, req: TtsHistoryUpdate, user=require_perm("stage4.generate")):
    db = get_db()
    try:
        row = db.execute("SELECT id FROM tts_history WHERE id = ?", (history_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="记录不存在")
        if req.name is not None:
            db.execute("UPDATE tts_history SET name = ? WHERE id = ?", (req.name, history_id))
            db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.delete("/api/tts-history/{history_id}")
def api_tts_history_delete(history_id: int, user=require_perm("stage4.generate")):
    db = get_db()
    try:
        row = db.execute("SELECT id, audio_path, project_id FROM tts_history WHERE id = ?", (history_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="记录不存在")
        # Delete audio file (best effort)
        if row["audio_path"]:
            try:
                output_dir = AUDIO_DIR
                if row["project_id"]:
                    try:
                        output_dir = resolve_project_storage(row["project_id"], auto_create=False)
                    except Exception:
                        pass
                filepath = os.path.join(output_dir, row["audio_path"])
                if os.path.exists(filepath):
                    os.remove(filepath)
            except Exception:
                pass
        db.execute("DELETE FROM tts_history WHERE id = ?", (history_id,))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@app.get("/api/audio/{filename}")
def serve_audio(filename: str, request: Request, project_id: str = None, name: str = None):
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
async def upload_logo(file: UploadFile = File(...), user=require_perm("config.global")):
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
def get_settings(request: Request):
    db = get_db()
    try:
        rows = db.execute("SELECT key, value FROM settings").fetchall()
        settings = {}
        for r in rows:
            if r["key"] == "admin_password":
                settings["admin_password_enabled"] = "1" if r["value"] else "0"
            else:
                settings[r["key"]] = r["value"]

        # Expose initial admin password on first-time setup so new users
        # know how to log in (desktop version hides console output).
        # Only allow from localhost without proxy — unauthenticated endpoint.
        client_host = request.client.host if request.client else ""
        is_proxied = any(h in request.headers for h in ("x-forwarded-for", "x-real-ip"))
        if client_host in ("127.0.0.1", "::1", "localhost") and not is_proxied:
            admin = db.execute(
                "SELECT must_change_password FROM users WHERE user_type='admin' LIMIT 1"
            ).fetchone()
            if admin and admin["must_change_password"] == 1:
                pwd_path = os.path.join(BASE_DIR, "initial_admin_password.txt")
                try:
                    if os.path.exists(pwd_path):
                        with open(pwd_path) as f:
                            settings["initial_admin_password"] = f.read().strip()
                except Exception:
                    pass

        return JSONResponse(
            content={"settings": settings},
            headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
        )
    finally:
        db.close()


@app.put("/api/settings")
def update_settings(req: dict, user=require_perm("config.global")):
    db = get_db()
    try:
        for key, value in req.items():
            # bcrypt-hash admin_password on write
            if key == "admin_password" and value and not value.startswith("$2"):
                value = _hash_password(value)
            existing = db.execute("SELECT key FROM settings WHERE key = ?", (key,)).fetchone()
            if existing:
                db.execute("UPDATE settings SET value = ? WHERE key = ?", (value, key))
            else:
                db.execute("INSERT INTO settings (key, value) VALUES (?, ?)", (key, value))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


# ── Help Manual Sections ──

@app.get("/api/help-manual/sections")
def list_help_sections():
    db = get_db()
    try:
        rows = db.execute(
            "SELECT location, title, content FROM help_manual_sections ORDER BY sort_order"
        ).fetchall()
        sections = [{"location": r["location"], "title": r["title"], "content": r["content"]} for r in rows]
        return {"sections": sections}
    finally:
        db.close()


@app.get("/api/help-manual/sections/{location}")
def get_help_section(location: str):
    db = get_db()
    try:
        row = db.execute(
            "SELECT location, title, content FROM help_manual_sections WHERE location = ?",
            (location,)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="章节未找到")
        return {"location": row["location"], "title": row["title"], "content": row["content"]}
    finally:
        db.close()


@app.put("/api/help-manual/sections/{location}")
def upsert_help_section(location: str, req: dict, user=require_perm("config.global")):
    db = get_db()
    try:
        title = req.get("title", "")
        content = req.get("content", "")
        existing = db.execute(
            "SELECT id FROM help_manual_sections WHERE location = ?", (location,)
        ).fetchone()
        if existing:
            db.execute(
                "UPDATE help_manual_sections SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP "
                "WHERE location = ?",
                (title, content, location)
            )
        else:
            max_sort = db.execute("SELECT COALESCE(MAX(sort_order), -1) FROM help_manual_sections").fetchone()[0]
            db.execute(
                "INSERT INTO help_manual_sections (location, title, content, sort_order) VALUES (?, ?, ?, ?)",
                (location, title, content, max_sort + 1)
            )
        db.commit()
        return {"ok": True}
    finally:
        db.close()


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    client = request.client
    return client.host if client else "127.0.0.1"


# ── Login endpoints ──────────────────────────────────────────────────

_LOGIN_RATE_MAX = 5
_LOGIN_RATE_WINDOW = 60
_REGISTER_RATE_MAX = 3
_REGISTER_RATE_WINDOW = 3600
_MAX_FAILED_ATTEMPTS = 10
_LOCK_DURATION_SEC = 1800  # 30 minutes


@app.post("/api/login")
def login(req: dict, request: Request):
    """Backward-compatible login. Accepts {password} and maps to super admin.
    When RBAC migration is active, returns new-style JWT for the admin user.
    """
    ip = _get_client_ip(request)
    allowed, retry = _check_rate_limit(f"login:{ip}", _LOGIN_RATE_MAX, _LOGIN_RATE_WINDOW)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"登录请求过于频繁，请 {retry} 秒后再试",
            headers={"Retry-After": str(retry)},
        )

    plain = req.get("password", "")
    if not plain:
        raise HTTPException(status_code=400, detail="密码不能为空")

    # If RBAC migration is active, find the (first) admin and log them in
    db = get_db()
    try:
        admin = db.execute(
            "SELECT * FROM users WHERE user_type='admin' AND is_active=1 "
            "ORDER BY created_at LIMIT 1"
        ).fetchone()
    finally:
        db.close()

    if admin:
        if not _verify_password(plain, admin["password_hash"]):
            _check_login_lockout(admin)
            raise HTTPException(status_code=403, detail="密码错误")
        _reset_failed_attempts(admin["id"])
        token = _create_jwt(admin)
        return {
            "token": token,
            "expires_at": (datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)).isoformat(),
            "user": {
                "user_id": admin["id"],
                "username": admin["username"],
                "display_name": admin["display_name"],
                "user_type": admin["user_type"],
                "permissions": _get_user_permissions(admin["id"], admin["user_type"]),
                "roles": _get_user_roles(admin["id"]),
            },
        }

    # Legacy fallback (no RBAC migration yet)
    stored_hash = _get_setting("admin_password")
    if not stored_hash:
        raise HTTPException(status_code=400, detail="未设置初始密码，请先通过设置页面创建密码")
    if not _verify_password(plain, stored_hash):
        raise HTTPException(status_code=403, detail="密码错误")
    # Upgrade legacy hash to bcrypt
    if not stored_hash.startswith("$2"):
        db2 = get_db()
        try:
            db2.execute(
                "UPDATE settings SET value = ? WHERE key = 'admin_password'",
                (_hash_password(plain),),
            )
            db2.commit()
        finally:
            db2.close()
    token = create_access_token({"sub": "admin"})
    return {
        "token": token,
        "expires_at": (datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)).isoformat(),
    }


def _check_login_lockout(user_row) -> None:
    """Check if account is locked due to failed attempts. Increments counter on failure."""
    if user_row["locked_until"]:
        try:
            locked = datetime.fromisoformat(user_row["locked_until"])
            if locked > datetime.utcnow():
                remain = int((locked - datetime.utcnow()).total_seconds())
                raise HTTPException(
                    status_code=429,
                    detail=f"账户已被锁定，请 {remain} 秒后再试",
                    headers={"Retry-After": str(remain)},
                )
        except (ValueError, TypeError):
            pass
    db = get_db()
    try:
        new_attempts = user_row["failed_login_attempts"] + 1
        if new_attempts >= _MAX_FAILED_ATTEMPTS:
            locked_until = (datetime.utcnow() + timedelta(seconds=_LOCK_DURATION_SEC)).isoformat()
            db.execute(
                "UPDATE users SET failed_login_attempts=?, locked_until=? WHERE id=?",
                (new_attempts, locked_until, user_row["id"]),
            )
            db.commit()
            raise HTTPException(
                status_code=429,
                detail=f"登录失败次数过多，账户已锁定 {_LOCK_DURATION_SEC // 60} 分钟",
                headers={"Retry-After": str(_LOCK_DURATION_SEC)},
            )
        db.execute(
            "UPDATE users SET failed_login_attempts=? WHERE id=?",
            (new_attempts, user_row["id"]),
        )
        db.commit()
    finally:
        db.close()


def _reset_failed_attempts(user_id: str) -> None:
    db = get_db()
    try:
        db.execute(
            "UPDATE users SET failed_login_attempts=0, locked_until=NULL WHERE id=?",
            (user_id,),
        )
        db.commit()
    finally:
        db.close()


@app.post("/api/auth/login")
def auth_login(req: dict, request: Request):
    """New login for admin-type users with username+password."""
    ip = _get_client_ip(request)
    allowed, retry = _check_rate_limit(f"login:{ip}", _LOGIN_RATE_MAX, _LOGIN_RATE_WINDOW)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"登录请求过于频繁，请 {retry} 秒后再试",
            headers={"Retry-After": str(retry)},
        )

    username = (req.get("username", "") or "").strip()
    password = req.get("password", "") or ""
    if not username or not password:
        raise HTTPException(status_code=400, detail="用户名和密码不能为空")

    db = get_db()
    try:
        user = db.execute(
            "SELECT * FROM users WHERE username=? COLLATE NOCASE AND user_type='admin'",
            (username,),
        ).fetchone()
        if not user:
            raise HTTPException(status_code=403, detail="用户名或密码错误")
        if not user["is_active"]:
            raise HTTPException(status_code=403, detail="账户已被停用")
        if not _verify_password(password, user["password_hash"]):
            _check_login_lockout(user)
            raise HTTPException(status_code=403, detail="用户名或密码错误")
        _reset_failed_attempts(user["id"])
        token = _create_jwt(user)
        return {
            "token": token,
            "expires_at": (datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)).isoformat(),
            "user": {
                "user_id": user["id"],
                "username": user["username"],
                "display_name": user["display_name"],
                "user_type": user["user_type"],
                "permissions": _get_user_permissions(user["id"], user["user_type"]),
                "roles": _get_user_roles(user["id"]),
            },
        }
    finally:
        db.close()


@app.get("/api/auth/me")
def auth_me(request: Request):
    """Return current user info from JWT + full profile from DB."""
    user = getattr(request.state, "user", None)
    if user is None:
        raise HTTPException(status_code=401, detail="请先登录")
    uid = user.get("sub")
    db = get_db()
    try:
        row = db.execute(
            "SELECT display_name, email, expires_at, upgrade_expires_at, created_at, is_approved, is_active FROM users WHERE id=?",
            (uid,),
        ).fetchone()
        profile = {}
        if row:
            profile = {
                "display_name": row["display_name"],
                "email": row["email"],
                "expires_at": row["expires_at"],
                "upgrade_expires_at": row["upgrade_expires_at"],
                "created_at": row["created_at"],
                "is_approved": row["is_approved"],
                "is_active": row["is_active"],
            }
    finally:
        db.close()
    user_type = user.get("user_type", "member")
    roles = _get_user_roles(uid)
    permissions = _get_user_permissions(uid, user_type)
    return {
        "user_id": uid,
        "username": user.get("username"),
        "user_type": user_type,
        "permissions": permissions,
        "roles": roles,
        **profile,
    }


@app.post("/api/auth/change-password")
def auth_change_password(req: dict, request: Request):
    """Change current user's password."""
    user = getattr(request.state, "user", None)
    if user is None:
        raise HTTPException(status_code=401, detail="请先登录")
    old_pw = req.get("old_password", "") or ""
    new_pw = req.get("new_password", "") or ""
    if not old_pw or not new_pw:
        raise HTTPException(status_code=400, detail="旧密码和新密码不能为空")
    if len(new_pw) < 8:
        raise HTTPException(status_code=400, detail="新密码长度不能少于 8 位")

    db = get_db()
    try:
        urow = db.execute(
            "SELECT password_hash FROM users WHERE id=? AND is_active=1",
            (user["sub"],),
        ).fetchone()
        if not urow:
            raise HTTPException(status_code=401, detail="用户不存在或已停用")
        if not _verify_password(old_pw, urow["password_hash"]):
            raise HTTPException(status_code=403, detail="旧密码错误")
        new_hash = _hash_password(new_pw)
        db.execute(
            "UPDATE users SET password_hash=?, token_version=token_version+1, "
            "password_changed_at=?, must_change_password=0, updated_at=? WHERE id=?",
            (new_hash, datetime.utcnow().isoformat(), datetime.utcnow().isoformat(), user["sub"]),
        )
        # Sync to settings.admin_password so verify-password works too
        if user.get("user_type") == "admin":
            db.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_password', ?)",
                (new_hash,))
        _write_audit(db, user["sub"], "auth.change_password", "user", user["sub"],
                      json.dumps({}), _get_client_ip(request))
        db.commit()
    finally:
        db.close()
    return {"ok": True, "message": "密码已修改，请重新登录"}


@app.get("/api/auth/permissions")
def auth_permissions(request: Request):
    """Return current user's permission codes and role names (for frontend init)."""
    user = getattr(request.state, "user", None)
    if user is None:
        raise HTTPException(status_code=401, detail="请先登录")
    return {
        "permissions": user.get("permissions", []),
        "roles": user.get("roles", []),
    }


# ── Member auth endpoints ────────────────────────────────────────────

@app.post("/api/member/login")
def member_login(req: dict, request: Request):
    """Member login with username+password. Checks approval, active, and expiry."""
    ip = _get_client_ip(request)
    allowed, retry = _check_rate_limit(f"login:{ip}", _LOGIN_RATE_MAX, _LOGIN_RATE_WINDOW)
    if not allowed:
        raise HTTPException(
            status_code=429,
            detail=f"登录请求过于频繁，请 {retry} 秒后再试",
            headers={"Retry-After": str(retry)},
        )

    username = (req.get("username", "") or "").strip()
    password = req.get("password", "") or ""
    if not username or not password:
        raise HTTPException(status_code=400, detail="用户名和密码不能为空")

    db = get_db()
    try:
        user = db.execute(
            "SELECT * FROM users WHERE username=? COLLATE NOCASE AND user_type='member'",
            (username,),
        ).fetchone()
        if not user:
            raise HTTPException(status_code=403, detail="用户名或密码错误")
        if not user["is_active"]:
            raise HTTPException(status_code=403, detail="账户已被停用")
        if not _verify_password(password, user["password_hash"]):
            _check_login_lockout(user)
            raise HTTPException(status_code=403, detail="用户名或密码错误")
        # Check expiry before is_approved — so renewing users see "已到期" not "未审批"
        if user["expires_at"]:
            try:
                expires = datetime.fromisoformat(user["expires_at"])
                if expires < datetime.utcnow():
                    raise HTTPException(status_code=403, detail="会员已到期，请联系管理员续费")
            except (ValueError, TypeError):
                pass
        # Allow is_approved=0 when expires_at exists (renewal pending for active member).
        # Block is_approved=0 only for new registrations (no expires_at yet).
        if not user["is_approved"] and not user["expires_at"]:
            raise HTTPException(status_code=403, detail="账户尚未通过审批，请等待管理员审核")
        if user["is_approved"] == 2:
            raise HTTPException(status_code=403, detail="注册申请已被拒绝，请联系管理员")
        _reset_failed_attempts(user["id"])
        token = _create_jwt(user)
        return {
            "token": token,
            "expires_at": (datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS)).isoformat(),
            "user": {
                "user_id": user["id"],
                "username": user["username"],
                "display_name": user["display_name"],
                "user_type": user["user_type"],
                "permissions": _get_user_permissions(user["id"], user["user_type"]),
                "roles": _get_user_roles(user["id"]),
            },
        }
    finally:
        db.close()


@app.post("/api/member/register")
def member_register(req: dict, request: Request):
    """Self-registration for members. Supports trial and paid plans."""
    ip = _get_client_ip(request)
    username = (req.get("username", "") or "").strip()
    password = req.get("password", "") or ""
    display_name = (req.get("display_name", "") or "").strip() or username
    email = (req.get("email", "") or "").strip() or None
    phone = (req.get("phone", "") or "").strip() or None
    plan_type = (req.get("plan_type", "") or "trial").strip()  # "trial" or "paid"

    if not username or not password:
        raise HTTPException(status_code=400, detail="用户名和密码不能为空")
    if len(username) < 2:
        raise HTTPException(status_code=400, detail="用户名至少需要 2 个字符")
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="密码长度不能少于 8 位")
    # 手机号必填：付款后若审批被拒，需要能联系客户退款
    if not phone:
        raise HTTPException(status_code=400, detail="请填写手机号（用于审批联系与退款）")
    phone_digits = re.sub(r"\D", "", phone)
    if len(phone_digits) != 11:
        raise HTTPException(status_code=400, detail="手机号格式不正确")

    db = get_db()
    try:
        existing = db.execute(
            "SELECT id FROM users WHERE username=? COLLATE NOCASE",
            (username,),
        ).fetchone()
        if existing:
            raise HTTPException(status_code=400, detail="该用户名已被注册")
        if email:
            email_existing = db.execute(
                "SELECT id FROM users WHERE email=? COLLATE NOCASE",
                (email,),
            ).fetchone()
            if email_existing:
                raise HTTPException(status_code=400, detail="该邮箱已被注册，如需续费请联系管理员")
            # Check email format
            if "@" not in email or "." not in email.split("@")[-1]:
                raise HTTPException(status_code=400, detail="邮箱格式不正确")

        # Only count valid submissions toward rate limit
        allowed, retry = _check_rate_limit(f"register:{ip}", _REGISTER_RATE_MAX, _REGISTER_RATE_WINDOW)
        if not allowed:
            db.close()
            raise HTTPException(
                status_code=429,
                detail=f"注册请求过于频繁，请 {retry} 秒后再试",
                headers={"Retry-After": str(retry)},
            )

        import uuid as _uuid
        user_id = str(_uuid.uuid4())
        now = datetime.utcnow().isoformat()
        pw_hash = _hash_password(password)
        db.execute(
            """INSERT INTO users (id, username, password_hash, display_name, email, phone, user_type,
               is_active, is_approved, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 'member', 1, 0, ?, ?)""",
            (user_id, username, pw_hash, display_name, email, phone, now, now),
        )

        audit_detail = {"username": username, "email": email, "phone": phone, "plan_type": plan_type}

        if plan_type == "paid":
            # Client only provides plan_id and payment_ref — price/duration are server-authoritative.
            plan_id = (req.get("plan_id", "") or "").strip()
            plans = _load_plans()
            plan = plans.get(plan_id) if plan_id else None
            if not plan:
                raise HTTPException(status_code=400, detail="无效的套餐")
            payment_method = (req.get("payment_method", "") or "").strip()
            payment_ref = (req.get("payment_ref", "") or "").strip()
            if not payment_ref:
                raise HTTPException(status_code=400, detail="请填写付款单号")
            amount_cents = plan["amount_cents"]
            plan_name = plan["name"]
            duration_days = plan["duration_days"]

            import uuid as _uuid2
            db.execute(
                """INSERT INTO payment_records
                   (id, user_id, amount_cents, plan_name, duration_days,
                    payment_method, payment_ref, paid_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (str(_uuid2.uuid4()), user_id, amount_cents, plan_name,
                 duration_days, payment_method, payment_ref, now),
            )
            audit_detail["plan_id"] = plan_id
            audit_detail["payment_method"] = payment_method
            audit_detail["payment_ref"] = payment_ref
            audit_detail["amount_cents"] = amount_cents

        _write_audit(db, user_id, "member.register", "user", user_id,
                      json.dumps(audit_detail), ip)
        db.commit()
    finally:
        db.close()
    return {"ok": True, "message": "注册成功，请等待管理员审批"}


@app.post("/api/member/renew")
def member_renew(req: dict, request: Request):
    """Self-service renewal for expired members. Creates payment record and
    sets is_approved=0 so admin must re-approve."""
    ip = _get_client_ip(request)

    username = (req.get("username", "") or "").strip()
    password = req.get("password", "") or ""
    plan_type = (req.get("plan_type", "") or "paid").strip()

    if not username or not password:
        raise HTTPException(status_code=400, detail="用户名和密码不能为空")

    db = get_db()
    try:
        user = db.execute(
            "SELECT * FROM users WHERE username=? COLLATE NOCASE AND user_type='member'",
            (username,),
        ).fetchone()
        if not user:
            raise HTTPException(status_code=403, detail="用户名或密码错误")
        if not user["is_active"]:
            raise HTTPException(status_code=403, detail="账户已被停用")
        if not _verify_password(password, user["password_hash"]):
            _check_login_lockout(user)
            raise HTTPException(status_code=403, detail="用户名或密码错误")

        # Only paid plan supported for renewal
        plan_id = (req.get("plan_id", "") or "").strip()
        plans = _load_plans()
        plan = plans.get(plan_id) if plan_id else None
        if not plan:
            raise HTTPException(status_code=400, detail="无效的套餐")
        payment_method = (req.get("payment_method", "") or "").strip()
        payment_ref = (req.get("payment_ref", "") or "").strip()
        if not payment_ref:
            raise HTTPException(status_code=400, detail="请填写付款单号")

        now = datetime.utcnow().isoformat()
        import uuid as _uuid
        db.execute(
            """INSERT INTO payment_records
               (id, user_id, amount_cents, plan_name, duration_days,
                payment_method, payment_ref, paid_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (str(_uuid.uuid4()), user["id"], plan["amount_cents"], plan["name"],
             plan["duration_days"], payment_method, payment_ref, now),
        )

        # Always set is_approved=0 so admin sees renewal in approval queue.
        # Login allows is_approved=0 when expires_at is present (previously approved).
        db.execute("UPDATE users SET is_approved=0, updated_at=? WHERE id=?",
                   (now, user["id"]))
        db.execute("UPDATE users SET token_version=token_version+1 WHERE id=?", (user["id"],))

        _write_audit(db, user["id"], "member.renew", "user", user["id"],
                      json.dumps({"plan_id": plan_id, "payment_method": payment_method,
                                  "payment_ref": payment_ref,
                                  "amount_cents": plan["amount_cents"]}), ip)
        db.commit()
    finally:
        db.close()
    return {"ok": True, "message": "续费申请已提交，请等待管理员审批"}


@app.post("/api/member/upgrade")
def member_upgrade(req: dict, request: Request):
    """Self-service upgrade request for paid members to become 开发体验员."""
    ip = _get_client_ip(request)
    user = getattr(request.state, "user", None)
    if user is None:
        raise HTTPException(status_code=401, detail="请先登录")
    if user.get("user_type") != "member":
        raise HTTPException(status_code=403, detail="仅会员可申请升级")

    uid = user.get("sub")
    db = get_db()
    try:
        m = db.execute(
            "SELECT id, username, user_type, is_approved, is_active, expires_at FROM users WHERE id=?",
            (uid,),
        ).fetchone()
        if not m or not m["is_active"]:
            raise HTTPException(status_code=403, detail="账户不可用")
        if not m["is_approved"]:
            raise HTTPException(status_code=403, detail="账户尚未通过审批")

        from datetime import datetime as _dt
        now = _dt.utcnow()
        if m["expires_at"]:
            try:
                exp = _dt.fromisoformat(m["expires_at"])
                if exp <= now:
                    raise HTTPException(status_code=403, detail="会员已到期，请先续费后再申请升级")
            except (ValueError, TypeError):
                pass

        existing = db.execute(
                "SELECT 1 FROM user_roles ur JOIN roles r ON ur.role_id=r.id "
                "WHERE ur.user_id=? AND r.name='开发体验员'",
                (uid,),
            ).fetchone()
        if existing:
            # Allow re-upgrade if previous upgrade has expired
            urow = db.execute(
                "SELECT upgrade_expires_at FROM users WHERE id=?", (uid,)
            ).fetchone()
            already_upgraded = True
            if urow and urow["upgrade_expires_at"]:
                try:
                    if _dt.utcnow() > _dt.fromisoformat(urow["upgrade_expires_at"]):
                        already_upgraded = False
                except (ValueError, TypeError):
                    pass
            if already_upgraded:
                raise HTTPException(status_code=400, detail="您已是体验管理员")

        plans = _load_plans()
        upgrade_plan = plans.get("upgrade")
        if not upgrade_plan:
            raise HTTPException(status_code=400, detail="升级套餐未配置，请联系管理员")

        upgrade_days = int(upgrade_plan.get("duration_days", 30))
        plan_name = upgrade_plan.get("name", "体验管理员升级")
        pending = db.execute(
            "SELECT id FROM payment_records WHERE user_id=? AND plan_name=? AND recorded_by IS NULL",
            (uid, plan_name),
        ).fetchone()
        if pending:
            raise HTTPException(status_code=400, detail="您已有待审批的升级申请，请等待管理员处理")

        payment_method = (req.get("payment_method", "") or "").strip()
        payment_ref = (req.get("payment_ref", "") or "").strip()
        if not payment_ref:
            raise HTTPException(status_code=400, detail="请填写付款单号")

        now_str = now.isoformat()
        import uuid as _uuid
        db.execute(
            """INSERT INTO payment_records
               (id, user_id, amount_cents, plan_name, duration_days,
                payment_method, payment_ref, paid_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (str(_uuid.uuid4()), uid, upgrade_plan["amount_cents"],
             plan_name, upgrade_days,
             payment_method, payment_ref, now_str),
        )

        _write_audit(db, uid, "member.upgrade", "user", uid,
                      json.dumps({"plan_name": plan_name,
                                  "amount_cents": upgrade_plan["amount_cents"],
                                  "duration_days": upgrade_days,
                                  "payment_method": payment_method,
                                  "payment_ref": payment_ref}), ip)
        db.commit()
    finally:
        db.close()

    return {
        "ok": True,
        "message": "升级申请已提交，请等待管理员审批",
        "duration_days": upgrade_days,
    }


# ── Member management endpoints ─────────────────────────────────────

@app.get("/api/members/pending")
def list_pending_members(page: int = 1, page_size: int = 20, user=require_perm("member.manage")):
    db = get_db()
    try:
        offset = (page - 1) * page_size
        total = db.execute(
            "SELECT COUNT(*) FROM users WHERE user_type='member' AND is_approved=0"
        ).fetchone()[0]
        rows = db.execute(
            "SELECT id, username, display_name, email, phone, is_approved, created_at "
            "FROM users WHERE user_type='member' AND is_approved=0 "
            "ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (page_size, offset),
        ).fetchall()
        members = []
        for r in rows:
            m = dict(r)
            # Check if there's a payment record for this user
            payment = db.execute(
                "SELECT plan_name, amount_cents, duration_days, payment_method, "
                "payment_ref FROM payment_records WHERE user_id=? ORDER BY paid_at DESC LIMIT 1",
                (m["id"],),
            ).fetchone()
            m["payment"] = dict(payment) if payment else None
            members.append(m)
        return {"members": members, "total": total, "page": page, "page_size": page_size}
    finally:
        db.close()


class ApproveMemberReq(BaseModel):
    duration_days: int = 30
    note: str = ""

class RejectMemberReq(BaseModel):
    reason: str = ""

class PaymentRecordReq(BaseModel):
    amount_cents: int = 0
    plan_name: str = ""
    duration_days: int = 0
    payment_method: str = ""
    note: str = ""

@app.put("/api/members/{user_id}/approve")
async def approve_member(user_id: str, body: ApproveMemberReq, request: Request,
                          user=require_perm("member.manage")):
    """Approve a pending member. Auto-detects trial vs paid and assigns correct role."""
    import uuid as _uuid
    duration_days = body.duration_days  # default 30 from model, overridden below for paid
    ip = _get_client_ip(request)
    db = get_db()
    try:
        m = db.execute(
            "SELECT id, username, user_type, is_approved, expires_at FROM users WHERE id=?",
            (user_id,),
        ).fetchone()
        if not m:
            raise HTTPException(404, "用户不存在")
        if m["user_type"] != "member":
            raise HTTPException(400, "只能审批会员类型的用户")
        if m["is_approved"] != 0:
            raise HTTPException(400, "该用户已处理过")

        from datetime import datetime as _dt, timedelta as _td

        # Check if user submitted a payment record (paid plan)
        payment = db.execute(
            "SELECT id, plan_name, amount_cents, duration_days, payment_method, "
            "payment_ref FROM payment_records WHERE user_id=? ORDER BY paid_at DESC LIMIT 1",
            (user_id,),
        ).fetchone()

        # Determine which role to assign (based on whether payment was submitted, not amount)
        if payment:
            role_name = "付费会员"
        else:
            role_name = "试用会员"

        # Extend from current expiry if still valid, otherwise from now
        base = _dt.utcnow()
        if m["expires_at"]:
            try:
                current = _dt.fromisoformat(m["expires_at"])
                if current > base:
                    base = current
            except (ValueError, TypeError):
                pass
        expires_at = (base + _td(days=int(duration_days))).isoformat()

        db.execute(
            "UPDATE users SET is_approved=1, approved_by=?, approved_at=?, "
            "expires_at=?, approval_note=?, updated_at=? WHERE id=?",
            (user["sub"], _dt.utcnow().isoformat(), expires_at,
             (body.note or "").strip(), _dt.utcnow().isoformat(), user_id),
        )

        # Assign role
        role = db.execute(
            "SELECT id FROM roles WHERE name=? AND is_system=1", (role_name,)
        ).fetchone()
        if role:
            db.execute(
                "INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)",
                (user_id, role["id"]),
            )

        # If paid, update payment record with approval info
        if payment:
            db.execute(
                "UPDATE payment_records SET recorded_by=?, expires_before=NULL, "
                "expires_after=? WHERE id=?",
                (user["sub"], expires_at, payment["id"]),
            )

        _write_audit(db, user["sub"], "member.approve", "user", user_id,
                      json.dumps({"role": role_name, "duration_days": duration_days,
                                  "expires_at": expires_at,
                                  "has_payment": payment is not None}),
                      ip_address=ip)
        db.commit()
        return {
            "ok": True, "message": "审批通过", "expires_at": expires_at,
            "role": role_name,
            "payment": {
                "plan_name": payment["plan_name"],
                "amount_cents": payment["amount_cents"],
                "payment_method": payment["payment_method"],
                "payment_ref": payment["payment_ref"],
            } if payment else None,
        }
    finally:
        db.close()


@app.put("/api/members/{user_id}/reject")
async def reject_member(user_id: str, body: RejectMemberReq, request: Request,
                         user=require_perm("member.manage")):
    """Reject a pending member."""
    reason = body.reason
    ip = _get_client_ip(request)
    db = get_db()
    try:
        m = db.execute(
            "SELECT id, user_type, is_approved FROM users WHERE id=?", (user_id,)
        ).fetchone()
        if not m:
            raise HTTPException(404, "用户不存在")
        if m["user_type"] != "member":
            raise HTTPException(400, "只能审批会员类型的用户")
        if m["is_approved"] != 0:
            raise HTTPException(400, "该用户已处理过")

        from datetime import datetime as _dt
        db.execute(
            "UPDATE users SET is_approved=2, approved_by=?, approved_at=?, "
            "approval_note=?, updated_at=? WHERE id=?",
            (user["sub"], _dt.utcnow().isoformat(), (reason or "").strip(),
             _dt.utcnow().isoformat(), user_id),
        )
        _write_audit(db, user["sub"], "member.reject", "user", user_id,
                      json.dumps({"reason": reason}), ip_address=ip)
        db.commit()
        return {"ok": True, "message": "已拒绝"}
    finally:
        db.close()


@app.get("/api/members/pending-upgrades")
def list_pending_upgrades(user=require_perm("member.manage")):
    """List members who have submitted upgrade requests pending approval."""
    db = get_db()
    try:
        plans = _load_plans()
        upgrade_plan = plans.get("upgrade", {})
        plan_name = upgrade_plan.get("name", "体验管理员升级")

        rows = db.execute(
            "SELECT DISTINCT u.id, u.username, u.display_name, u.email, u.phone, "
            "u.created_at, u.expires_at, u.is_approved, "
            "pr.plan_name, pr.amount_cents, pr.duration_days, pr.payment_method, "
            "pr.payment_ref, pr.paid_at "
            "FROM users u "
            "JOIN payment_records pr ON pr.user_id = u.id "
            "WHERE u.user_type='member' AND u.is_approved=1 "
            "AND pr.plan_name=? AND pr.recorded_by IS NULL "
            "AND u.id NOT IN ("
            "  SELECT ur.user_id FROM user_roles ur "
            "  JOIN roles r ON ur.role_id=r.id "
            "  WHERE r.name='开发体验员'"
            ") "
            "ORDER BY pr.paid_at DESC"
        , (plan_name,)).fetchall()

        members = []
        for r in rows:
            m = dict(r)
            m["payment"] = {
                "plan_name": m["plan_name"],
                "amount_cents": m["amount_cents"],
                "duration_days": m["duration_days"],
                "payment_method": m["payment_method"],
                "payment_ref": m["payment_ref"],
            }
            members.append(m)
        return {"members": members, "total": len(members)}
    finally:
        db.close()


@app.put("/api/members/{user_id}/approve-upgrade")
def approve_upgrade(user_id: str, request: Request, user=require_perm("member.manage")):
    """Approve a member's upgrade to 开发体验员."""
    ip = _get_client_ip(request)
    db = get_db()
    try:
        m = db.execute(
            "SELECT id, username, user_type, is_approved, expires_at FROM users WHERE id=?",
            (user_id,),
        ).fetchone()
        if not m:
            raise HTTPException(404, "用户不存在")
        if m["user_type"] != "member":
            raise HTTPException(400, "只能为会员升级")
        if not m["is_approved"]:
            raise HTTPException(400, "该会员尚未通过基础审批，请先审批会员资格")

        from datetime import datetime as _dt
        now = _dt.utcnow()
        if m["expires_at"]:
            try:
                exp = _dt.fromisoformat(m["expires_at"])
                if exp <= now:
                    raise HTTPException(400, "会员已到期，无法升级，请先续费")
            except (ValueError, TypeError):
                pass

        existing = db.execute(
                "SELECT 1 FROM user_roles ur JOIN roles r ON ur.role_id=r.id "
                "WHERE ur.user_id=? AND r.name='开发体验员'",
                (user_id,),
            ).fetchone()
        if existing:
            # Allow re-approval if previous upgrade expired
            urow = db.execute(
                "SELECT upgrade_expires_at FROM users WHERE id=?", (user_id,)
            ).fetchone()
            if urow and urow["upgrade_expires_at"]:
                try:
                    if _dt.utcnow() <= _dt.fromisoformat(urow["upgrade_expires_at"]):
                        raise HTTPException(400, "该会员已是体验管理员")
                except (ValueError, TypeError):
                    raise HTTPException(400, "该会员已是体验管理员")
            else:
                raise HTTPException(400, "该会员已是体验管理员")

        role = db.execute(
            "SELECT id FROM roles WHERE name='开发体验员' AND is_system=1"
        ).fetchone()
        if not role:
            raise HTTPException(500, "系统角色缺失：开发体验员，请联系管理员重新部署")

        plans = _load_plans()
        upgrade_plan = plans.get("upgrade", {})
        plan_name = upgrade_plan.get("name", "体验管理员升级")

        db.execute(
            "INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)",
            (user_id, role["id"]),
        )

        # Calculate independent upgrade expiration: now + duration_days from payment
        payment = db.execute(
            "SELECT duration_days FROM payment_records "
            "WHERE user_id=? AND plan_name=? AND recorded_by IS NULL "
            "ORDER BY paid_at DESC LIMIT 1",
            (user_id, plan_name),
        ).fetchone()
        upgrade_days = payment["duration_days"] if payment else int(upgrade_plan.get("duration_days", 30))
        from datetime import timedelta as _td
        upgrade_expires = (now + _td(days=int(upgrade_days))).isoformat()
        db.execute(
            "UPDATE users SET upgrade_expires_at=? WHERE id=?",
            (upgrade_expires, user_id),
        )

        # Mark pending upgrade payment as recorded
        db.execute(
            "UPDATE payment_records SET recorded_by=?, expires_before=NULL, expires_after=? "
            "WHERE user_id=? AND plan_name=? AND recorded_by IS NULL",
            (user["sub"], upgrade_expires, user_id, plan_name),
        )

        _write_audit(db, user["sub"], "member.approve_upgrade", "user", user_id,
                      json.dumps({"role": "开发体验员", "upgrade_expires": upgrade_expires,
                                  "upgrade_days": upgrade_days}),
                      ip_address=ip)
        db.commit()
        return {"ok": True, "message": "升级审批通过，已分配体验管理员角色", "role": "开发体验员"}
    finally:
        db.close()


@app.post("/api/members/{user_id}/payment")
async def record_payment(user_id: str, body: PaymentRecordReq, request: Request,
                           user=require_perm("member.manage")):
    """Record a payment and extend member expiry."""
    import uuid as _uuid
    amount_cents = body.amount_cents
    plan_name = body.plan_name
    duration_days = body.duration_days
    payment_method = body.payment_method
    note = body.note
    ip = _get_client_ip(request)

    if not plan_name or duration_days <= 0:
        raise HTTPException(400, "请填写套餐名和有效续期天数")
    if amount_cents <= 0:
        raise HTTPException(400, "请填写有效的付费金额")

    db = get_db()
    try:
        m = db.execute(
            "SELECT id, username, user_type, expires_at FROM users WHERE id=?", (user_id,)
        ).fetchone()
        if not m:
            raise HTTPException(404, "用户不存在")
        if m["user_type"] != "member":
            raise HTTPException(400, "只能为会员记录付费")

        from datetime import datetime as _dt, timedelta as _td
        now = _dt.utcnow()
        current_expires = None
        if m["expires_at"]:
            try:
                current_expires = _dt.fromisoformat(m["expires_at"])
            except (ValueError, TypeError):
                pass
        base = current_expires if current_expires and current_expires > now else now
        new_expires = base + _td(days=duration_days)
        new_expires_str = new_expires.isoformat()

        pid = str(_uuid.uuid4())
        db.execute(
            """INSERT INTO payment_records
               (id, user_id, amount_cents, plan_name, duration_days, payment_method,
                recorded_by, expires_before, expires_after, note, paid_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (pid, user_id, amount_cents, plan_name, duration_days, payment_method,
             user["sub"], m["expires_at"], new_expires_str, note, now.isoformat()),
        )
        db.execute(
            "UPDATE users SET expires_at=?, updated_at=? WHERE id=?",
            (new_expires_str, now.isoformat(), user_id),
        )
        _write_audit(db, user["sub"], "member.payment", "user", user_id,
                      json.dumps({"amount_cents": amount_cents, "plan": plan_name,
                                  "days": duration_days, "new_expires": new_expires_str}),
                      ip_address=ip)
        db.commit()
        return {"ok": True, "expires_after": new_expires_str,
                "expires_before": m["expires_at"], "duration_days": duration_days}
    finally:
        db.close()


@app.get("/api/members/{user_id}/payments")
def list_payments(user_id: str, user=require_perm("member.manage")):
    db = get_db()
    try:
        rows = db.execute(
            "SELECT * FROM payment_records WHERE user_id=? ORDER BY paid_at DESC",
            (user_id,),
        ).fetchall()
        return {"payments": [dict(r) for r in rows]}
    finally:
        db.close()


@app.get("/api/auth/check")
def auth_check(payload: dict = Depends(get_current_user)):
    return {"ok": True}


# ── First-time setup wizard ──────────────────────────────────────────

@app.get("/api/setup/status")
def setup_status(user: dict = Depends(get_current_user)):
    """Check whether first-time setup wizard is needed."""
    db = get_db()
    try:
        must_change = False
        setup_done = True
        if user:
            row = db.execute(
                "SELECT must_change_password FROM users WHERE id=?", (user["sub"],)
            ).fetchone()
            if row and row["must_change_password"] == 1:
                must_change = True
        sc_row = db.execute(
            "SELECT value FROM settings WHERE key='setup_completed'"
        ).fetchone()
        if sc_row and sc_row["value"] == "0":
            setup_done = False
        return {
            "must_change_password": must_change,
            "setup_completed": setup_done,
            "need_setup": must_change or not setup_done,
        }
    finally:
        db.close()


class SetupCompleteReq(BaseModel):
    new_password: str
    brand_name: str = ""
    brand_logo: str = ""        # base64 encoded image or empty
    payment_qr_wechat: str = ""  # base64 encoded image or empty
    payment_qr_alipay: str = ""  # base64 encoded image or empty

@app.post("/api/setup/complete")
def setup_complete(req: SetupCompleteReq, user: dict = Depends(get_current_user)):
    """Complete first-time setup: change password, set brand, upload QR codes."""
    db = get_db()
    try:
        urow = db.execute(
            "SELECT must_change_password FROM users WHERE id=?", (user["sub"],)
        ).fetchone()
        if not urow or urow["must_change_password"] != 1:
            raise HTTPException(403, "无需执行首次设置")

        if not req.new_password or len(req.new_password) < 8:
            raise HTTPException(400, "密码长度不能少于 8 位")

        pw_hash = _hash_password(req.new_password)
        now = datetime.utcnow().isoformat()
        db.execute(
            "UPDATE users SET password_hash=?, must_change_password=0, "
            "password_changed_at=?, token_version=token_version+1, "
            "updated_at=? WHERE id=?",
            (pw_hash, now, now, user["sub"]),
        )

        # Update brand settings
        if req.brand_name:
            db.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES ('brand_name', ?)",
                (req.brand_name,),
            )
        if req.brand_logo:
            db.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES ('brand_logo', ?)",
                (req.brand_logo,),
            )

        # Store payment QR codes
        if req.payment_qr_wechat:
            db.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES ('payment_qr_wechat', ?)",
                (req.payment_qr_wechat,),
            )
        if req.payment_qr_alipay:
            db.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES ('payment_qr_alipay', ?)",
                (req.payment_qr_alipay,),
            )

        # Mark setup as done
        db.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('setup_completed', '1')"
        )

        _write_audit(db, user["sub"], "setup.complete", "user", user["sub"], "{}")
        db.commit()
        return {"ok": True, "message": "设置完成，请使用新密码重新登录"}
    finally:
        db.close()


# ── License activation endpoints ────────────────────────────────────

@app.post("/api/license/activate")
def license_activate_endpoint(req: dict):
    """Activate a license key on this machine."""
    key = (req.get("key", "") or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="请输入许可证密钥")
    try:
        result = license_activate(key)
        return {"ok": True, **result}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/api/license/status")
def license_status_endpoint():
    """Return current license activation status."""
    return get_license_status()


@app.post("/api/license/deactivate")
def license_deactivate_endpoint():
    """Remove the current license activation."""
    license_deactivate()
    return {"ok": True}


@app.post("/api/verify-password")
def verify_password(req: dict):
    plain = req.get("password", "")
    if not plain:
        raise HTTPException(status_code=400, detail="密码不能为空")
    db = get_db()
    try:
        # RBAC mode: check admin user's password_hash first
        admin = db.execute(
            "SELECT password_hash FROM users WHERE user_type='admin' AND is_active=1 LIMIT 1"
        ).fetchone()
        if admin:
            stored_hash = admin["password_hash"]
        else:
            stored_hash = _get_setting("admin_password")
        if not stored_hash:
            raise HTTPException(status_code=400, detail="未设置密码")
        if not _verify_password(plain, stored_hash):
            raise HTTPException(status_code=403, detail="密码错误")
        # Upgrade legacy hash to bcrypt on successful verification
        if not stored_hash.startswith("$2"):
            db.execute("UPDATE settings SET value = ? WHERE key = 'admin_password'", (_hash_password(plain),))
            db.execute(
                "UPDATE users SET password_hash=? WHERE user_type='admin' AND is_active=1",
                (_hash_password(plain),))
            db.commit()
    finally:
        db.close()
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

# Build stamp — written by build_server.ps1 / build_desktop.ps1
import os as _os
_BUILD_COMMIT = ""
_BUILD_TIME = ""
_version_file = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "build_version.txt")
if _os.path.exists(_version_file):
    try:
        with open(_version_file, "r", encoding="utf-8-sig") as _f:
            for _line in _f:
                _line = _line.strip()
                if _line.startswith("commit="):
                    _BUILD_COMMIT = _line[7:]
                elif _line.startswith("time="):
                    _BUILD_TIME = _line[5:]
    except Exception:
        pass


@app.get("/api/version")
def api_version():
    return {
        "version": VERSION,
        "build_commit": _BUILD_COMMIT,
        "build_time": _BUILD_TIME,
        "app": _get_site_name(),
    }


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
def open_folder(req: OpenFolderRequest, user=require_perm("config.project")):
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

# Production mode: serve built frontend (after all API routes)
if getattr(sys, 'frozen', False):
    FRONTEND_DIST = os.path.join(sys._MEIPASS, "frontend", "dist")
else:
    FRONTEND_DIST = os.path.join(WORKSPACE_ROOT, "frontend", "dist")
if os.path.isdir(FRONTEND_DIST):
    import os as _os

    @app.get("/{full_path:path}")
    async def _spa_fallback(full_path: str):
        # HTML 一律 no-cache：防止手机浏览器缓存旧入口页后加载旧 JS（带 hash 的 assets 不受影响）
        def _serve(path: str):
            resp = _file_response(path)
            if path.endswith(".html"):
                resp.headers["Cache-Control"] = "no-cache"
            return resp
        # Resolve and verify the path stays within FRONTEND_DIST to prevent path traversal
        raw = _os.path.join(FRONTEND_DIST, full_path)
        real = _os.path.realpath(raw)
        dist_real = _os.path.realpath(FRONTEND_DIST)
        if _os.path.commonpath([real, dist_real]) != dist_real:
            return _serve(_os.path.join(FRONTEND_DIST, "index.html"))
        if _os.path.isfile(real):
            return _serve(real)
        return _serve(_os.path.join(FRONTEND_DIST, "index.html"))

    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")

if __name__ == "__main__":
    import uvicorn
    port = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 8766
    uvicorn.run(app, host="0.0.0.0", port=port)
