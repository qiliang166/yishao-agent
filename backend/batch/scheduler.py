"""
Batch Scheduler — HTTP-based dispatcher.
Calls existing API endpoints — same code path as manual UI clicks.
Does NOT reimplement any pipeline logic.

After Step 1, each tab (sop / dao / yanxi) runs its own independent pipeline
(step2 → step3 → step4) in a separate thread.  Three pipelines in parallel,
no synchronization barriers — matches the manual UI where each tab is independent.
"""
import json
import os
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timedelta

import jwt
import requests

from database import get_db

JWT_SECRET = os.environ.get("JWT_SECRET", "yishao-agent-jwt-secret-2026")

_batch_lock = threading.Lock()
_log_lock = threading.Lock()
_token_lock = threading.Lock()
_active_batches: dict = {}

# Set by app.py on startup
_port: int = 8766
_base_url: str = "http://127.0.0.1:8766"
_admin_token: str = ""
_headers: dict = {}


def init(port: int = 8766):
    global _port, _base_url, _admin_token, _headers
    _port = port
    _base_url = f"http://127.0.0.1:{port}"
    _admin_token = _make_token()
    _headers = {
        "Authorization": f"Bearer {_admin_token}",
        "Content-Type": "application/json",
    }


def _make_token() -> str:
    payload = {
        "sub": "admin",
        "user_type": "admin",
        "exp": datetime.utcnow() + timedelta(hours=72),
    }
    try:
        db = get_db()
        try:
            admin = db.execute(
                "SELECT id FROM users WHERE user_type='admin' LIMIT 1"
            ).fetchone()
            if admin:
                rows = db.execute(
                    "SELECT DISTINCT rp.permission FROM role_permissions rp "
                    "JOIN user_roles ur ON ur.role_id = rp.role_id "
                    "WHERE ur.user_id = ?",
                    (admin["id"],),
                ).fetchall()
                payload["permissions"] = [r["permission"] for r in rows]
        finally:
            db.close()
    except Exception:
        pass
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def _call(method: str, path: str, json_data: dict = None, timeout: int = 600):
    """Call an API endpoint on this server. Returns parsed JSON or raises."""
    global _admin_token, _headers
    url = f"{_base_url}{path}"
    kwargs = dict(headers=_headers, timeout=timeout)
    if json_data is not None:
        kwargs["json"] = json_data
    resp = requests.request(method, url, **kwargs)
    if resp.status_code == 401:
        with _token_lock:
            _admin_token = _make_token()
            _headers["Authorization"] = f"Bearer {_admin_token}"
        kwargs["headers"] = _headers
        resp = requests.request(method, url, **kwargs)
    resp.raise_for_status()
    return resp.json()


def _call_no_timeout(method: str, path: str, json_data: dict = None):
    """Call with no timeout — for long-running PPT generation."""
    return _call(method, path, json_data, timeout=3600)


# ── BatchJob ──


class BatchJob:
    def __init__(self, batch_id: str, workspace_id: str, start_time: str, end_time: str):
        self.batch_id = batch_id
        self.workspace_id = workspace_id
        self.start_time = start_time
        self.end_time = end_time
        self.status = "pending"
        self.total_count = 0
        self.completed_count = 0
        self.failed_count = 0
        self.items: list[dict] = []
        self._stop_flag = threading.Event()
        self._thread: threading.Thread | None = None

    def to_dict(self):
        return {
            "batch_id": self.batch_id,
            "workspace_id": self.workspace_id,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "status": self.status,
            "total_count": self.total_count,
            "completed_count": self.completed_count,
            "failed_count": self.failed_count,
            "items": [
                {
                    "project_id": it["project_id"],
                    "project_name": it.get("project_name", ""),
                    "steps": it["steps"],
                    "status": it["status"],
                    "logs": it.get("logs", []),
                }
                for it in self.items
            ],
        }


def get_project_active_batch(project_id: str) -> dict | None:
    """Check if a project is in any active batch. Returns batch info or None."""
    with _batch_lock:
        for batch_id, job in list(_active_batches.items()):
            for item in job.items:
                if item.get("project_id") == project_id and item.get("status") not in ("completed", "failed"):
                    return {
                        "batch_id": batch_id,
                        "batch_status": job.status,
                        "project_status": item.get("status", "unknown"),
                        "project_name": item.get("project_name", ""),
                        "total_projects": job.total_count,
                    }
    # Fallback: check DB for batches that may have survived a server restart
    try:
        db = get_db()
        try:
            batch_rows = db.execute(
                "SELECT id, status, total_count FROM batch_jobs WHERE status IN ('pending','running')"
            ).fetchall()
            for br in batch_rows:
                row = db.execute(
                    "SELECT project_id, project_name, status FROM batch_job_items WHERE batch_id=? AND project_id=? AND status NOT IN ('completed','failed')",
                    (br[0], project_id),
                ).fetchone()
                if row:
                    return {
                        "batch_id": br[0],
                        "batch_status": br[1],
                        "project_status": row[2],
                        "project_name": row[1],
                        "total_projects": br[2] or 0,
                    }
        finally:
            db.close()
    except Exception:
        pass
    return None


# ── Time helpers ──


def _parse_iso(ts: str):
    ts = ts.replace("T", " ").replace("Z", "")
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(ts[:19], fmt)
        except ValueError:
            continue
    return datetime.now()


def _now():
    return datetime.now()


def _log(item: dict, msg: str):
    ts = _now().strftime("%H:%M:%S")
    with _log_lock:
        item.setdefault("logs", []).append(f"[{ts}] {msg}")


# ── DB helpers ──


def _update_db(job: BatchJob):
    try:
        db = get_db()
        try:
            existing = db.execute("SELECT id FROM batch_jobs WHERE id=?", (job.batch_id,)).fetchone()
            if existing:
                db.execute(
                    "UPDATE batch_jobs SET status=?, completed_count=?, failed_count=? WHERE id=?",
                    (job.status, job.completed_count, job.failed_count, job.batch_id),
                )
            else:
                db.execute(
                    "INSERT INTO batch_jobs (id, workspace_id, start_time, end_time, status, total_count, completed_count, failed_count) "
                    "VALUES (?,?,?,?,?,?,?,?)",
                    (job.batch_id, job.workspace_id, job.start_time, job.end_time, job.status,
                     job.total_count, job.completed_count, job.failed_count),
                )
            db.commit()
        finally:
            db.close()
    except Exception:
        pass


def _update_item_db(batch_id: str, item: dict):
    try:
        db = get_db()
        try:
            existing = db.execute(
                "SELECT id FROM batch_job_items WHERE batch_id=? AND project_id=?",
                (batch_id, item["project_id"]),
            ).fetchone()
            steps_json = json.dumps(item.get("steps", []), ensure_ascii=False)
            logs_json = json.dumps(item.get("logs", []), ensure_ascii=False)
            if existing:
                db.execute(
                    "UPDATE batch_job_items SET status=?, logs=?, finished_at=? WHERE batch_id=? AND project_id=?",
                    (item["status"], logs_json, _now().isoformat(), batch_id, item["project_id"]),
                )
            else:
                db.execute(
                    "INSERT INTO batch_job_items (batch_id, project_id, steps, status, logs) VALUES (?,?,?,?,?)",
                    (batch_id, item["project_id"], steps_json, item["status"], logs_json),
                )
            db.commit()
        finally:
            db.close()
    except Exception:
        pass


# ── Config loading ──


def _load_column_configs(db, workspace_id: str) -> list[dict]:
    rows = db.execute(
        "SELECT * FROM column_configs WHERE workspace_id = ? OR workspace_id IS NULL "
        "ORDER BY workspace_id IS NULL, sort_order",
        (workspace_id,),
    ).fetchall()
    seen = {}
    for r in rows:
        r = dict(r)
        if r["id"] not in seen:
            seen[r["id"]] = r
    return list(seen.values())


def _load_speech_configs(db, workspace_id: str) -> list[dict]:
    rows = db.execute(
        "SELECT * FROM speech_configs WHERE workspace_id = ? OR workspace_id IS NULL "
        "ORDER BY workspace_id IS NULL, sort_order",
        (workspace_id,),
    ).fetchall()
    seen = {}
    for r in rows:
        r = dict(r)
        if r["id"] not in seen:
            seen[r["id"]] = r
    return list(seen.values())


def _get_provider_model(db, workspace_id: str, step_name: str = "_model_s2_sop") -> tuple:
    provider_id = ""
    model = ""
    try:
        row = db.execute(
            "SELECT content FROM step_results WHERE project_id IN "
            "(SELECT id FROM projects WHERE workspace_id=?) AND step_name=? LIMIT 1",
            (workspace_id, step_name),
        ).fetchone()
        if row and row[0]:
            combined = row[0]
            if ":" in combined:
                provider_id, model = combined.split(":", 1)
            else:
                model = combined
    except Exception:
        pass

    if not model:
        row = db.execute(
            "SELECT models FROM llm_providers WHERE is_enabled=1 ORDER BY created_at LIMIT 1"
        ).fetchone()
        if row and row[0]:
            try:
                models_list = json.loads(row[0])
                if models_list:
                    model = models_list[0]
            except Exception:
                pass

    if not provider_id:
        row = db.execute(
            "SELECT id FROM llm_providers WHERE is_enabled=1 ORDER BY created_at LIMIT 1"
        ).fetchone()
        if row:
            provider_id = row[0]

    return provider_id, model


# ── Public API ──


def start_batch(batch_id: str, workspace_id: str, start_time: str, end_time: str,
                items: list[dict]) -> BatchJob:
    with _batch_lock:
        if batch_id in _active_batches:
            return _active_batches[batch_id]
        job = BatchJob(batch_id, workspace_id, start_time, end_time)
        job.total_count = len(items)
        job.items = [{
            "project_id": it["project_id"],
            "project_name": it.get("project_name", ""),
            "steps": it.get("steps", []),
            "step2_sources": it.get("step2_sources", {}),
            "template_ids": it.get("template_ids", {}),
            "status": "pending",
            "logs": [],
        } for it in items]
        _active_batches[batch_id] = job

    job._thread = threading.Thread(target=_run_batch, args=(job,), daemon=True)
    job._thread.start()
    return job


def _run_batch(job: BatchJob):
    start_dt = _parse_iso(job.start_time)
    end_dt = _parse_iso(job.end_time)

    wait_seconds = (start_dt - _now()).total_seconds()
    if wait_seconds > 0:
        job.status = "pending"
        _update_db(job)
        time.sleep(wait_seconds)

    if job._stop_flag.is_set():
        job.status = "cancelled"
        _update_db(job)
        return

    job.status = "running"
    _update_db(job)

    try:
        for item in job.items:
            if job._stop_flag.is_set():
                item["status"] = "skipped"
                _log(item, "批次已取消，跳过")
                continue

            if _now() >= end_dt:
                item["status"] = "skipped"
                _log(item, "到达结束时间，跳过")
                continue

            item["status"] = "running"
            _update_db(job)
            _update_item_db(job.batch_id, item)

            try:
                _execute_project(item, job)
                item["status"] = "completed"
                job.completed_count += 1
            except Exception as e:
                item["status"] = "failed"
                _log(item, f"执行失败: {e}")
                job.failed_count += 1

            _update_db(job)
            _update_item_db(job.batch_id, item)
    finally:
        pass

    job.status = "completed"
    _update_db(job)


def get_batch_status(batch_id: str) -> dict | None:
    with _batch_lock:
        job = _active_batches.get(batch_id)
        if job:
            return job.to_dict()
    try:
        db = get_db()
        try:
            row = db.execute("SELECT * FROM batch_jobs WHERE id=?", (batch_id,)).fetchone()
            if not row:
                return None
            row = dict(row)
            items_rows = db.execute(
                "SELECT * FROM batch_job_items WHERE batch_id=? ORDER BY id", (batch_id,)
            ).fetchall()
            items = []
            for it in items_rows:
                it = dict(it)
                try:
                    it["steps"] = json.loads(it.get("steps", "[]"))
                except Exception:
                    it["steps"] = []
                try:
                    it["logs"] = json.loads(it.get("logs", "[]"))
                except Exception:
                    it["logs"] = []
                items.append(it)
            row["items"] = items
            return row
        finally:
            db.close()
    except Exception:
        return None


def cancel_batch(batch_id: str) -> bool:
    with _batch_lock:
        job = _active_batches.get(batch_id)
        if job and job.status in ("pending", "running"):
            job._stop_flag.set()
            if job.status == "pending":
                job.status = "cancelled"
                _update_db(job)
            return True
    return False


def get_active_batches() -> list[dict]:
    """Return list of active (pending/running) batches. Checks memory first, then DB."""
    result = []
    with _batch_lock:
        for job in _active_batches.values():
            if job.status in ("pending", "running"):
                result.append({"batch_id": job.batch_id, "status": job.status,
                               "total_count": job.total_count,
                               "completed_count": job.completed_count,
                               "failed_count": job.failed_count})
    if result:
        return result
    # Fallback: check DB for batches not yet completed/cancelled
    try:
        db = get_db()
        try:
            rows = db.execute(
                "SELECT id, status, total_count, completed_count, failed_count FROM batch_jobs WHERE status IN ('pending','running') ORDER BY created_at DESC"
            ).fetchall()
            for r in rows:
                result.append({"batch_id": r[0], "status": r[1], "total_count": r[2] or 0,
                               "completed_count": r[3] or 0, "failed_count": r[4] or 0})
        finally:
            db.close()
    except Exception:
        pass
    return result


# ══════════════════════════════════════════════════════════════════════════════
# Mapping constants
# ══════════════════════════════════════════════════════════════════════════════

_step1_source_map = {"text": ("raw_text", "step1_text"), "video": ("raw_video", "step1_video"), "file": ("raw_file", "step1_file")}
_step1_label = {"text": "整理文字", "video": "整理视频", "file": "整理文件"}
_step2_to_source = {"sop": "step2_sop", "dao": "step2_daoshuyi", "yanxi": "step2_yanxi"}
_step2_label = {"sop": "标准文档", "dao": "分析文档", "yanxi": "综合文档"}
_step3_map = {
    "doc-ppt": {"col": "col3", "step2": "sop", "step_name": "step3_sop_doc", "label": "文档课件", "model_key": "_model_step3_sop"},
    "analysis-ppt": {"col": "col4", "step2": "dao", "step_name": "step3_dao_ppt", "label": "分析PPT", "model_key": "_model_step3_dao_ppt"},
    "comprehensive-ppt": {"col": "col5", "step2": "yanxi", "step_name": "step3_yan_ppt", "label": "综合PPT", "model_key": "_model_step3_yan_ppt"},
}
_step2_to_step3 = {"sop": "doc-ppt", "dao": "analysis-ppt", "yanxi": "comprehensive-ppt"}
_step4_speech_names = {"sop": "step4_speech_doc", "dao": "step4_speech_analysis", "yanxi": "step4_speech_comprehensive"}
_step4_speech_keys = {"sop": "doc", "dao": "analysis", "yanxi": "comprehensive"}
_step4_source_labels = {"sop": "文档演讲", "dao": "分析演讲", "yanxi": "综合演讲"}


# ══════════════════════════════════════════════════════════════════════════════
# _execute_project — Step 1 serial, then per-tab parallel pipelines
# ══════════════════════════════════════════════════════════════════════════════

def _execute_project(item: dict, job: BatchJob):
    project_id = item["project_id"]
    steps_list = item.get("steps", [])
    step2_sources: dict = item.get("step2_sources", {})

    db = get_db()
    try:
        proj = db.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
        if not proj:
            raise Exception(f"项目 {project_id} 不存在")
        proj = dict(proj)
        workspace_id = proj.get("workspace_id", "")

        col_configs = _load_column_configs(db, workspace_id)

        # Parse configs from column_configs
        step1_configs: dict[str, dict] = {}
        for c in col_configs:
            if c["column_id"] == "col1":
                key = {0: "text", 1: "video", 2: "file"}.get(c["sort_order"], "")
                if key:
                    step1_configs[key] = {"prompt": c["prompt"] or "", "skill": c["skill"] or ""}

        step2_configs: dict[str, dict] = {}
        for c in col_configs:
            if c["column_id"] == "col2":
                key = {3: "sop", 4: "dao", 5: "yanxi"}.get(c["sort_order"], "")
                if key:
                    step2_configs[key] = {"prompt": c["prompt"] or "", "skill": c["skill"] or ""}

        speech_configs = _load_speech_configs(db, workspace_id)
        step4_configs: dict[str, dict] = {}
        for sc in speech_configs:
            key = {"文档演讲": "doc", "分析演讲": "analysis", "综合演讲": "comprehensive"}.get(sc["label"], "")
            if key:
                step4_configs[key] = {"prompt": sc["prompt"] or "", "skill": sc["skill"] or ""}

        # Load raw + step1 content
        raw_rows = db.execute(
            "SELECT step_name, content FROM step_results WHERE project_id=? AND step_name IN ('raw_text','raw_video','raw_file')",
            (project_id,),
        ).fetchall()
        raw_content_map: dict[str, str] = {}
        for r in raw_rows:
            if r[1]:
                raw_content_map[r[0]] = r[1]

        step1_rows = db.execute(
            "SELECT step_name, content FROM step_results WHERE project_id=? AND step_name IN ('step1_text','step1_video','step1_file')",
            (project_id,),
        ).fetchall()
        step1_content_map: dict[str, str] = {}
        for r in step1_rows:
            if r[1]:
                step1_content_map[r[0]] = r[1]

        def _get_source(source_type: str) -> str:
            if source_type not in _step1_source_map:
                source_type = "text"
            raw_key, step1_key = _step1_source_map[source_type]
            return step1_content_map.get(step1_key) or raw_content_map.get(raw_key, "")

        # ═════════════════════════════════════════════════════════════════════
        # Step 1 — serial (shared dependency for all tabs)
        # ═════════════════════════════════════════════════════════════════════
        step1_subs: list[str] = []
        for s in steps_list:
            if s[0] == "1":
                step1_subs = s[1]
                break

        if step1_subs:
            _log(item, "开始第一步·素材整理")
            for sub in step1_subs:
                cfg = step1_configs.get(sub, {})
                prompt = cfg.get("prompt") or "请将用户输入的内容整理为标准文档格式。"
                skill = cfg.get("skill") or ""
                raw_key, step1_key = _step1_source_map[sub]
                raw_content = raw_content_map.get(raw_key, "")
                label = _step1_label.get(sub, sub)

                if step1_content_map.get(step1_key, ""):
                    _log(item, f"  {label} 已有结果，跳过")
                    continue
                if not raw_content:
                    _log(item, f"  无原始素材({sub})，跳过{label}")
                    continue

                s1_model_key = f"_model_s1_{sub}"
                provider_id, model = _get_provider_model(db, workspace_id, s1_model_key)
                if not provider_id or not model:
                    provider_id, model = _get_provider_model(db, workspace_id)
                if not provider_id or not model:
                    _log(item, f"  缺少 LLM 配置，跳过: {label}")
                    continue

                _log(item, f"  正在{label}")
                try:
                    user_message = f"请将以下内容按指定格式整理：\n\n{raw_content}\n\n输出格式要求：\n{skill}" if skill else raw_content
                    result = _call("POST", "/api/llm/generate", {
                        "provider_id": provider_id, "model": model,
                        "system_prompt": prompt, "user_message": user_message,
                        "temperature": 0.7,
                    })
                    content = result.get("content", "")
                    _call("PUT", f"/api/projects/{project_id}/steps/{step1_key}", {
                        "step_name": step1_key, "content": content, "content_type": "markdown",
                    })
                    step1_content_map[step1_key] = content
                    _log(item, f"  ✓ {label} 完成 ({len(content)}字)")
                except Exception as e:
                    _log(item, f"  ✗ {label} 失败: {e}")
                    raise
            _log(item, "第一步完成")
        else:
            _log(item, "未选择第一步，跳过")

        if job._stop_flag.is_set() or _now() >= _parse_iso(job.end_time):
            return

        # ═════════════════════════════════════════════════════════════════════
        # Steps 2+3+4 — per-tab parallel pipelines
        #
        # Each tab (sop / dao / yanxi) runs its own step2→step3→step4 pipeline
        # in a dedicated thread.  When one tab finishes step2 it immediately
        # starts step3 — no waiting for other tabs' step2 to complete.
        # 3 independent pipelines, always 3 workers running until done.
        # ═════════════════════════════════════════════════════════════════════

        # Parse what tabs are configured
        step2_subs_flat: list[str] = []
        for s in steps_list:
            if s[0] == "2":
                step2_subs_flat = s[1]
                break

        step3_subs_flat: list[str] = []
        for s in steps_list:
            if s[0] == "3":
                step3_subs_flat = s[1]
                break

        # step3_sub → step2_sub mapping
        step3_sub_to_step2: dict[str, str] = {}
        for s3_sub in step3_subs_flat:
            info = _step3_map.get(s3_sub)
            if info:
                step3_sub_to_step2[s3_sub] = info["step2"]

        # step4 entries: [(source_sub, [sub_steps]), ...]
        step4_entries = [(s[1], s[2]) for s in steps_list if s[0] == "4"]
        # step4 source_sub → speech_key
        step4_source_subs = {src for src, _ in step4_entries}

        # Union of all tabs from step2 + step3 + step4
        all_tabs = set(step2_subs_flat)
        for s3_sub in step3_subs_flat:
            all_tabs.add(step3_sub_to_step2.get(s3_sub, ""))
        for src in step4_source_subs:
            all_tabs.add(src)
        all_tabs.discard("")

        if not all_tabs:
            _log(item, "未选择第二/三/四步，跳过")
            return

        # ── Pre-read ALL data from DB (SQLite not thread-safe) ──
        # Check existing results for all steps
        existing_step2: dict[str, str] = {}
        existing_step3: dict[str, str] = {}
        existing_step4: dict[str, str] = {}
        for tab in all_tabs:
            s2_name = _step2_to_source.get(tab, f"step2_{tab}")
            row = db.execute(
                "SELECT content FROM step_results WHERE project_id=? AND step_name=?",
                (project_id, s2_name),
            ).fetchone()
            if row and row[0]:
                existing_step2[tab] = row[0]

            s3_sub = _step2_to_step3.get(tab, "")
            if s3_sub:
                s3_info = _step3_map.get(s3_sub, {})
                s3_name = s3_info.get("step_name", "")
                if s3_name:
                    row = db.execute(
                        "SELECT content FROM step_results WHERE project_id=? AND step_name=?",
                        (project_id, s3_name),
                    ).fetchone()
                    if row and row[0]:
                        existing_step3[tab] = row[0]

            s4_name = _step4_speech_names.get(tab, "")
            if s4_name:
                row = db.execute(
                    "SELECT content FROM step_results WHERE project_id=? AND step_name=?",
                    (project_id, s4_name),
                ).fetchone()
                if row and row[0]:
                    existing_step4[tab] = row[0]

        # Per-tab template priority:
        # 1. template_ids from batch request (set once for all projects in batch UI)
        # 2. saved selection from step_results (_tmpl_step3_*)
        # 3. DB default
        _tmpl_step_keys = {"sop": "_tmpl_step3_sop", "dao": "_tmpl_step3_dao_ppt", "yanxi": "_tmpl_step3_yan_ppt"}
        _tmpl_default_row = db.execute(
            "SELECT id FROM templates WHERE type='style' AND enabled=1 ORDER BY is_default DESC LIMIT 1"
        ).fetchone()
        _tmpl_default_id = _tmpl_default_row[0] if _tmpl_default_row else ""
        _batch_template_ids: dict[str, str] = item.get("template_ids", {}) or {}
        _per_tab_template: dict[str, str] = {}
        for tab in all_tabs:
            tid = _batch_template_ids.get(tab, "")
            if not tid:
                key = _tmpl_step_keys.get(tab, "")
                if key:
                    row = db.execute(
                        "SELECT content FROM step_results WHERE project_id=? AND step_name=?",
                        (project_id, key),
                    ).fetchone()
                    tid = row[0] if row and row[0] else ""
            _per_tab_template[tab] = tid or _tmpl_default_id

        # ── Build tab pipeline tasks ──
        tab_tasks: dict[str, dict] = {}

        for tab in all_tabs:
            pipeline: dict = {"tab": tab, "label": _step2_label.get(tab, tab)}

            # -- Step 2 --
            if tab in step2_subs_flat:
                if tab in existing_step2:
                    pipeline["step2_skip"] = True
                    pipeline["step2_content"] = existing_step2[tab]
                else:
                    cfg = step2_configs.get(tab, {})
                    source_type = step2_sources.get(tab, "text")
                    source_text = _get_source(source_type)

                    if not source_text:
                        pipeline["step2_skip"] = True
                        pipeline["step2_no_source"] = True
                    else:
                        model_key = f"_model_s2_{tab}"
                        provider_id, model = _get_provider_model(db, workspace_id, model_key)
                        if not provider_id or not model:
                            provider_id, model = _get_provider_model(db, workspace_id)
                        if not provider_id or not model:
                            pipeline["step2_skip"] = True
                            pipeline["step2_no_model"] = True
                        else:
                            pipeline["step2"] = {
                                "step_name": _step2_to_source.get(tab, f"step2_{tab}"),
                                "prompt": cfg.get("prompt") or "你是一个专业的内容创作助手。",
                                "skill": cfg.get("skill") or "",
                                "source_text": source_text,
                                "provider_id": provider_id,
                                "model": model,
                            }
            else:
                pipeline["step2_skip"] = True

            # -- Step 3 --
            s3_sub = _step2_to_step3.get(tab, "")
            if s3_sub and s3_sub in step3_subs_flat:
                if tab in existing_step3:
                    pipeline["step3_skip"] = True
                else:
                    s3_info = _step3_map.get(s3_sub, {})
                    provider_id, model = _get_provider_model(db, workspace_id, s3_info.get("model_key", ""))
                    if not provider_id or not model:
                        provider_id, model = _get_provider_model(db, workspace_id)
                    if not provider_id or not model:
                        pipeline["step3_skip"] = True
                        pipeline["step3_no_model"] = True
                    else:
                        col_prompt = ""
                        for c in col_configs:
                            if c["column_id"] == s3_info.get("col", ""):
                                col_prompt = c["prompt"] or ""
                                break
                        pipeline["step3"] = {
                            "info": s3_info,
                            "provider_id": provider_id,
                            "model": model,
                            "template_id": _per_tab_template.get(tab, _tmpl_default_id),
                            "col_prompt": col_prompt,
                        }
            else:
                pipeline["step3_skip"] = True

            # -- Step 4 --
            if tab in step4_source_subs:
                if tab in existing_step4:
                    pipeline["step4_skip"] = True
                else:
                    speech_key = _step4_speech_keys.get(tab, "doc")
                    cfg = step4_configs.get(speech_key, {})
                    model_key = f"_model_s4_speech_{speech_key}"
                    provider_id, model = _get_provider_model(db, workspace_id, model_key)
                    if not provider_id or not model:
                        provider_id, model = _get_provider_model(db, workspace_id)
                    if not provider_id or not model:
                        pipeline["step4_skip"] = True
                    else:
                        # Speech source: step2 result (or raw if no step2)
                        s2_name = _step2_to_source.get(tab, "step2_sop")
                        row = db.execute(
                            "SELECT content FROM step_results WHERE project_id=? AND step_name=?",
                            (project_id, s2_name),
                        ).fetchone()
                        speech_source = row[0] if row else _get_source(step2_sources.get(tab, "text"))
                        pipeline["step4"] = {
                            "step4_name": _step4_speech_names.get(tab, "step4_speech_doc"),
                            "speech_key": speech_key,
                            "prompt": cfg.get("prompt") or "请根据以下内容生成演讲稿，风格亲切自然。",
                            "skill": cfg.get("skill") or "",
                            "speech_source": speech_source,
                            "provider_id": provider_id,
                            "model": model,
                        }
            else:
                pipeline["step4_skip"] = True

            tab_tasks[tab] = pipeline

        # ── Launch all tab pipelines in parallel ──
        _log(item, f"开始并行管道 ({len(all_tabs)} 个tab: {', '.join(_step2_label.get(t, t) for t in all_tabs)})")

        errors = []
        with ThreadPoolExecutor(max_workers=len(tab_tasks)) as pool:
            futures = {
                pool.submit(_tab_pipeline, project_id, pipeline, item): tab
                for tab, pipeline in tab_tasks.items()
            }
            for f in as_completed(futures):
                tab = futures[f]
                try:
                    f.result()
                except Exception as e:
                    _log(item, f"  ✗ Tab[{_step2_label.get(tab, tab)}] 管道失败: {e}")
                    errors.append(e)

        if errors:
            raise Exception(f"并行管道失败: {errors[0]}")

        _log(item, "所有管道完成")

    finally:
        db.close()


# ══════════════════════════════════════════════════════════════════════════════
# Tab pipeline worker — runs step2 → step3 → step4 for ONE tab
# Runs in a thread.  NO DB access — all data pre-read by caller.
# ══════════════════════════════════════════════════════════════════════════════

def _tab_pipeline(project_id: str, pipeline: dict, item: dict):
    """Run full step2→step3→step4 pipeline for a single tab."""
    tab = pipeline["tab"]
    label = pipeline["label"]
    _log(item, f"  ▶ Tab[{label}] 管道启动")

    step2_content = pipeline.get("step2_content", "")

    # ── Step 2: Document Generation ──
    if not pipeline.get("step2_skip"):
        task = pipeline["step2"]
        _log(item, f"    [{label}] Step2 生成中...")
        user_message = (
            f"请将以下内容按指定格式整理：\n\n{task['source_text']}\n\n输出格式要求：\n{task['skill']}"
            if task["skill"] else task["source_text"]
        )
        result = _call("POST", "/api/llm/generate", {
            "provider_id": task["provider_id"], "model": task["model"],
            "system_prompt": task["prompt"], "user_message": user_message,
            "temperature": 0.7,
        })
        step2_content = result.get("content", "")
        _call("PUT", f"/api/projects/{project_id}/steps/{task['step_name']}", {
            "step_name": task["step_name"], "content": step2_content, "content_type": "markdown",
        })
        _log(item, f"    [{label}] ✓ Step2 完成 ({len(step2_content)}字)")
    elif pipeline.get("step2_no_source"):
        _log(item, f"    [{label}] Step2 无素材，跳过")
    elif pipeline.get("step2_no_model"):
        _log(item, f"    [{label}] Step2 缺少 LLM 配置，跳过")
    elif pipeline.get("step2_skip"):
        if pipeline.get("step2_content"):
            _log(item, f"    [{label}] Step2 已有结果，跳过")
        else:
            _log(item, f"    [{label}] Step2 未选择，跳过")

    # ── Step 3: PPT Generation ──
    if not pipeline.get("step3_skip"):
        task = pipeline["step3"]
        info = task["info"]
        s3_label = info["label"]

        # Source for step3: the step2 content just generated (or from DB cache)
        if not step2_content:
            _log(item, f"    [{label}] Step3 缺少源文档，跳过")
        else:
            _log(item, f"    [{label}] Step3({s3_label}) 生成中...")

            if not task["template_id"]:
                _log(item, f"    [{label}] 无PPT模板，使用文本生成")
                result = _call("POST", "/api/llm/generate", {
                    "provider_id": task["provider_id"], "model": task["model"],
                    "system_prompt": task["col_prompt"] or "你是一个专业的PPT课件设计师。",
                    "user_message": f"请根据以下内容生成一份PPT课件。\n\n内容素材：\n{step2_content[:8000]}\n\n请生成适合PPT展示的结构化内容。",
                    "temperature": 0.7,
                })
                content = result.get("content", "")
                _call("PUT", f"/api/projects/{project_id}/steps/{info['step_name']}", {
                    "step_name": info["step_name"], "content": content, "content_type": "markdown",
                })
                _log(item, f"    [{label}] ✓ Step3 文本生成完成 ({len(content)}字)")
            else:
                # Outline
                _log(item, f"    [{label}] 生成大纲...")
                outline_resp = _call("POST", "/api/ppt/outline", {
                    "content": step2_content,
                    "template_id": task["template_id"],
                    "provider_id": task["provider_id"],
                    "model": task["model"],
                    "column_id": info["col"],
                    "project_id": project_id,
                    "temperature": 0.3,
                }, timeout=1200)
                outline_json = outline_resp.get("outline_json", [])
                outline_text = outline_resp.get("outline_text", "")

                if not outline_json:
                    raise Exception(f"{s3_label} 大纲生成失败：返回为空")

                _call("PUT", f"/api/projects/{project_id}/steps/{info['step_name']}", {
                    "step_name": info["step_name"], "content": outline_text or "", "content_type": "markdown",
                })
                _call("PUT", f"/api/projects/{project_id}/steps/_ppt_outline_json_{info['step_name']}", {
                    "step_name": f"_ppt_outline_json_{info['step_name']}",
                    "content": json.dumps(outline_json, ensure_ascii=False),
                    "content_type": "json",
                })
                _log(item, f"    [{label}] 大纲已生成: {len(outline_json)} 页")

                # PPT
                _log(item, f"    [{label}] 生成PPT...")
                ppt_resp = _call_no_timeout("POST", "/api/ppt/generate", {
                    "content": step2_content,
                    "template_id": task["template_id"],
                    "project_id": project_id,
                    "provider_id": task["provider_id"],
                    "model": task["model"],
                    "slide_plan": outline_json,
                    "column_id": info["col"],
                    "color_scheme": "deep-blue",
                    "temperature": 0.3,
                })

                slide_plan = ppt_resp.get("slide_plan", [])
                slide_count = ppt_resp.get("slide_count", len(slide_plan) if slide_plan else 0)

                if slide_plan:
                    plan_data = {
                        "slides": slide_plan,
                        "filename": ppt_resp.get("run_id", ""),
                        "downloadUrl": ppt_resp.get("zip_url", ""),
                        "previewUrl": ppt_resp.get("preview_url", ""),
                        "zipUrl": ppt_resp.get("zip_url", ""),
                        "templateId": task["template_id"],
                        "format": "svg",
                        "styleId": ppt_resp.get("style_id", ""),
                        "colorScheme": ppt_resp.get("color_scheme", ""),
                    }
                    _call("PUT", f"/api/projects/{project_id}/steps/_ppt_plan_{info['step_name']}", {
                        "step_name": f"_ppt_plan_{info['step_name']}",
                        "content": json.dumps(plan_data, ensure_ascii=False),
                        "content_type": "json",
                    })
                # Save preview HTML URL so frontend can show the rendered PPT
                preview_url = ppt_resp.get("preview_url", "")
                if preview_url:
                    _call("PUT", f"/api/projects/{project_id}/steps/_preview_html_{info['step_name']}", {
                        "step_name": f"_preview_html_{info['step_name']}",
                        "content": f"__SVG__{preview_url}",
                        "content_type": "markdown",
                    })
                _log(item, f"    [{label}] ✓ Step3({s3_label}) 完成 ({slide_count} 页)")
    elif pipeline.get("step3_no_model"):
        _log(item, f"    [{label}] Step3 缺少 LLM 配置，跳过")
    elif pipeline.get("step3_skip"):
        _log(item, f"    [{label}] Step3 已有结果/未选择，跳过")

    # ── Step 4: Speech Generation ──
    if not pipeline.get("step4_skip"):
        task = pipeline["step4"]
        _log(item, f"    [{label}] Step4 生成中...")

        # Source: prefer step2 content we just generated, fall back to pre-read
        speech_source = step2_content or task.get("speech_source", "")
        if not speech_source:
            _log(item, f"    [{label}] Step4 缺少演讲稿源内容，跳过")
        else:
            user_message = (
                f"请将以下内容按指定格式生成演讲稿：\n\n{speech_source}\n\n输出格式要求：\n{task['skill']}"
                if task["skill"] else speech_source
            )
            result = _call("POST", "/api/llm/generate", {
                "provider_id": task["provider_id"], "model": task["model"],
                "system_prompt": task["prompt"], "user_message": user_message,
                "temperature": 0.3,
            })
            content = result.get("content", "")
            _call("PUT", f"/api/projects/{project_id}/steps/{task['step4_name']}", {
                "step_name": task["step4_name"], "content": content, "content_type": "markdown",
            })
            _log(item, f"    [{label}] ✓ Step4 完成 ({len(content)}字)")
    elif pipeline.get("step4_skip"):
        _log(item, f"    [{label}] Step4 已有结果/未选择，跳过")

    _log(item, f"  ▶ Tab[{label}] 管道完成")
