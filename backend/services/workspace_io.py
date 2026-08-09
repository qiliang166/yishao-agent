"""
Workspace full data export/import — ZIP with workspace.json + file assets.

Export: all project data + step_results + file assets in a portable ZIP.
Import: restore to a new workspace with fresh IDs.
"""

import io
import json
import os
import re
import shutil
import uuid
import zipfile
from datetime import datetime, timezone

_EXCLUDE_FIELDS = {"created_at", "updated_at", "workspace_id", "sort_order"}

# Tables that have a workspace_id FK column
_TABLES_WITH_WS_ID = {"project_categories", "projects", "batch_jobs"}
_COL_RE = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]*$')
_SQLITE_MAX_VARS = 500  # batch size for IN (...) queries, well under SQLite's 999 limit

# Media files — skip from export, can be regenerated or re-downloaded
_SKIP_EXTS = {'.mp4', '.mkv', '.webm', '.avi', '.mov', '.flv', '.mp3', '.wav', '.ogg', '.flac', '.aac', '.wma'}


def _batch_in_select(db, table: str, id_column: str, ids: list[str], exclude_cols=None) -> list[dict]:
    """SELECT * FROM table WHERE id_column IN (ids), batched to avoid SQLite 999-var limit."""
    _validate_cols([table, id_column])
    results = []
    for i in range(0, len(ids), _SQLITE_MAX_VARS):
        chunk = ids[i:i + _SQLITE_MAX_VARS]
        placeholders = ",".join("?" * len(chunk))
        rows = db.execute(
            f"SELECT * FROM {table} WHERE {id_column} IN ({placeholders})",
            chunk).fetchall()
        results.extend(_row_dict(r, exclude_cols) for r in rows)
    return results


def _validate_cols(columns: list[str]):
    """Reject column names that don't match [a-zA-Z_][a-zA-Z0-9_]*."""
    for c in columns:
        if not _COL_RE.match(c):
            raise ValueError(f"Invalid column name: {c}")


def _safe_extract_path(save_root: str, zip_name: str) -> str:
    """Resolve target path and validate it stays within save_root."""
    rel = zip_name[len("files/"):]
    # Normalize to prevent path traversal via .. segments
    target = os.path.normpath(os.path.join(save_root, rel.replace("/", os.sep)))
    save_root_resolved = os.path.normpath(save_root)
    if os.path.commonpath([target, save_root_resolved]) != save_root_resolved:
        raise ValueError(f"Path traversal blocked: {zip_name}")
    return target


def _row_dict(row, exclude=None) -> dict:
    """Convert sqlite3.Row to dict, stripping excluded fields."""
    d = dict(row)
    for k in (exclude or _EXCLUDE_FIELDS):
        d.pop(k, None)
    return d


def _get_save_root(db) -> str:
    """Return the absolute save root (same logic as _get_global_save_path)."""
    row = db.execute("SELECT value FROM settings WHERE key = 'save_path'").fetchone()
    if row and row["value"] and os.path.isabs(row["value"]):
        return os.path.normpath(row["value"])
    import sys
    if getattr(sys, 'frozen', False):
        import __main__
        exe_dir = os.path.dirname(sys.executable) if hasattr(sys, 'executable') and sys.executable else os.path.dirname(os.path.abspath(__main__.__file__))
        return os.path.join(exe_dir, "data", "output")
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "output")


def _get_export_dir() -> str:
    """Return the absolute EXPORT_DIR path."""
    import sys
    if getattr(sys, 'frozen', False):
        exe_dir = os.path.dirname(sys.executable) if hasattr(sys, 'executable') and sys.executable else os.path.dirname(os.path.abspath(sys.argv[0]))
        return os.path.join(exe_dir, "data", "exports")
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "exports")


def _skip_file(filename: str) -> bool:
    """Return True if file should be skipped from export (video/audio — regeneratable)."""
    return os.path.splitext(filename)[1].lower() in _SKIP_EXTS


def _collect_all_files(projects_rows, pr_results_rows, step_results_rows, save_root: str) -> dict:
    """Collect all disk files: project dirs + result file_paths + step file_paths.

    Returns {abs_path: zip_relative_path}
    """
    file_map = {}
    save_root_norm = os.path.normcase(os.path.normpath(save_root))

    def _add_path(abs_path: str):
        if not abs_path:
            return
        if _skip_file(os.path.basename(abs_path)):
            return
        p = os.path.normcase(os.path.normpath(os.path.abspath(abs_path)))
        if not os.path.exists(p):
            return
        if os.path.commonpath([p, save_root_norm]) != save_root_norm:
            return
        rel = os.path.relpath(p, save_root_norm).replace("\\", "/")
        file_map[p] = f"files/{rel}"

    def _walk_dir(dir_path: str):
        if not dir_path or not os.path.isdir(dir_path):
            return
        p = os.path.normcase(os.path.normpath(os.path.abspath(dir_path)))
        if os.path.commonpath([p, save_root_norm]) != save_root_norm:
            return
        for root, _dirs, files in os.walk(p):
            for f in files:
                if _skip_file(f):
                    continue
                fp = os.path.join(root, f)
                _add_path(fp)

    for row in projects_rows:
        sp = (row.get("storage_path") or "").strip()
        if sp and os.path.isabs(sp):
            _walk_dir(sp)
        else:
            # Also try project_id-based dir
            pid = row.get("id", "")
            if pid:
                candidate = os.path.join(save_root, pid)
                _walk_dir(candidate)

    for row in pr_results_rows:
        fp = (row.get("file_path") or "").strip()
        if fp and os.path.isabs(fp):
            _add_path(fp)

    for row in step_results_rows:
        fp = (row.get("file_path") or "").strip()
        if fp and os.path.isabs(fp):
            _add_path(fp)

    return file_map


def _collect_export_files(step_results_rows) -> dict:
    """Collect HTML export run directories from EXPORT_DIR for PPT step_results.

    Returns {abs_path: zip_relative_path} with 'exports/' prefix.
    """
    export_dir = _get_export_dir()
    export_dir_norm = os.path.normcase(os.path.normpath(export_dir))
    file_map = {}

    for row in step_results_rows:
        step_name = (row.get("step_name") or "").strip()
        if not step_name.startswith("_ppt_result_"):
            continue
        run_id = step_name.replace("_ppt_result_", "", 1)
        if not run_id:
            continue
        if ".." in run_id or "/" in run_id or "\\" in run_id:
            continue
        if os.path.isabs(run_id) or re.match(r'^[A-Za-z]:', run_id):
            continue
        run_dir = os.path.join(export_dir, run_id)
        run_dir = os.path.realpath(run_dir)
        export_real = os.path.realpath(export_dir)
        if os.path.commonpath([run_dir, export_real]) != export_real:
            continue
        if not os.path.isdir(run_dir):
            continue
        for root, _dirs, files in os.walk(run_dir):
            for f in files:
                if _skip_file(f):
                    continue
                fp = os.path.join(root, f)
                rel = os.path.relpath(fp, export_dir_norm).replace("\\", "/")
                file_map[fp] = f"exports/{rel}"

    return file_map


def export_workspace_zip(db, workspace_id: str) -> io.BytesIO:
    """Export all workspace data + file assets to an in-memory ZIP."""
    from routers.prompt_studio import _serialize_configs

    # 1. Workspace metadata
    ws = db.execute("SELECT * FROM workspaces WHERE id = ?", (workspace_id,)).fetchone()
    if not ws:
        raise ValueError(f"Workspace {workspace_id} not found")

    ws_meta = _row_dict(ws)
    for k in ("created_at", "updated_at", "id"):
        ws_meta.pop(k, None)

    # 2. Configs (existing pattern)
    configs = _serialize_configs(db, workspace_id)

    # 3. Project categories
    cats = [_row_dict(r) for r in db.execute(
        "SELECT * FROM project_categories WHERE workspace_id = ? ORDER BY sort_order",
        (workspace_id,)).fetchall()]

    # 4. Projects
    projects = [_row_dict(r) for r in db.execute(
        "SELECT * FROM projects WHERE workspace_id = ?", (workspace_id,)).fetchall()]
    project_ids = [p["id"] for p in projects]

    # 5. Project items (by project, batched)
    p_items = _batch_in_select(db, "project_items", "project_id", project_ids) if project_ids else []
    p_items.sort(key=lambda it: it.get("sort_order", 0))

    # 6. Project item results (by item, batched, exclude AUTOINCREMENT id)
    item_ids = [it["id"] for it in p_items]
    pr_results = _batch_in_select(db, "project_item_results", "project_item_id", item_ids, {"id"}) if item_ids else []

    # 7. Step results (by project, batched, exclude AUTOINCREMENT id)
    step_results = _batch_in_select(db, "step_results", "project_id", project_ids, {"id"}) if project_ids else []

    # 8. Batch jobs
    batch_jobs = [_row_dict(r) for r in db.execute(
        "SELECT * FROM batch_jobs WHERE workspace_id = ?", (workspace_id,)).fetchall()]
    batch_ids = [b["id"] for b in batch_jobs]

    # 9. Batch job items (batched, exclude AUTOINCREMENT id)
    batch_items = _batch_in_select(db, "batch_job_items", "batch_id", batch_ids, {"id"}) if batch_ids else []

    # 10. File map — all project dirs + result files + step files (skip video files)
    save_root = _get_save_root(db)
    file_map = _collect_all_files(projects, pr_results, step_results, save_root)

    # 11. Export files — HTML export run directories for PPT step_results
    export_map = _collect_export_files(step_results)

    manifest = {
        "version": 2,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "source_workspace_id": workspace_id,
        "workspace": ws_meta,
        "configs": configs,
        "project_categories": cats,
        "projects": projects,
        "project_items": p_items,
        "project_item_results": pr_results,
        "step_results": step_results,
        "batch_jobs": batch_jobs,
        "batch_job_items": batch_items,
    }

    # Diagnostic summary
    summary = {
        "projects": len(projects),
        "project_items": len(p_items),
        "project_item_results": len(pr_results),
        "step_results": len(step_results),
        "batch_jobs": len(batch_jobs),
        "batch_job_items": len(batch_items),
        "file_assets": len(file_map),
        "export_assets": len(export_map),
    }
    manifest["_summary"] = summary

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        manifest_json = json.dumps(manifest, ensure_ascii=False, indent=2)
        zf.writestr("workspace.json", manifest_json)
        for abs_path, zip_path in file_map.items():
            zf.write(abs_path, zip_path)
        for abs_path, zip_path in export_map.items():
            zf.write(abs_path, zip_path)

    buf.seek(0)
    return buf


def _insert_rows(db, table: str, rows: list[dict], id_map: dict, new_ws_id: str,
                 save_root: str = "", id_map_items: dict = None,
                 id_map_batch: dict = None) -> dict:
    """Insert a batch of rows with ID remapping. Validates all column names first.

    On the first row, collects all column names and validates them against _COL_RE.
    """
    applied_count = 0
    seen_cols = set()
    for row in rows:
        cols = [c for c in row.keys() if c not in _EXCLUDE_FIELDS]
        # Validate new columns only
        new_cols = [c for c in cols if c not in seen_cols]
        if new_cols:
            _validate_cols(new_cols)
            seen_cols.update(new_cols)

        vals = {c: row.get(c, "") for c in cols}

        # Set workspace_id for tables that have this FK (it's stripped by _EXCLUDE_FIELDS during export)
        if table in _TABLES_WITH_WS_ID:
            vals["workspace_id"] = new_ws_id

        # Remap FK references
        if "project_id" in cols and vals.get("project_id") and vals["project_id"] in id_map:
            vals["project_id"] = id_map[vals["project_id"]]
        if "category_id" in cols and vals.get("category_id") and vals["category_id"] in id_map:
            vals["category_id"] = id_map[vals["category_id"]]
        if id_map_items and "source_item_id" in cols and vals.get("source_item_id") and vals["source_item_id"] in id_map_items:
            vals["source_item_id"] = id_map_items[vals["source_item_id"]]
        if id_map_items and "project_item_id" in cols and vals.get("project_item_id") and vals["project_item_id"] in id_map_items:
            vals["project_item_id"] = id_map_items[vals["project_item_id"]]
        if id_map_batch and "batch_id" in cols and vals.get("batch_id") and vals["batch_id"] in id_map_batch:
            vals["batch_id"] = id_map_batch[vals["batch_id"]]

        all_cols = list(vals.keys())
        placeholders = ",".join(["?"] * len(all_cols))
        db.execute(
            f"INSERT INTO {table} ({','.join(all_cols)}) VALUES ({placeholders})",
            list(vals.values()),
        )
        applied_count += 1
    return applied_count


# Session cache to avoid duplicate codes within a single process/transaction
_GEN_CODE_CACHE: set = set()


def _generate_project_code(db) -> str:
    """Generate a unique project code KH{YYMMDD}-{seq} with collision avoidance."""
    from datetime import date
    today = date.today().strftime("%y%m%d")
    today_prefix = f"KH{today}-%"
    for attempt in range(100):
        max_row = db.execute(
            "SELECT MAX(project_code) FROM projects WHERE project_code LIKE ?", (today_prefix,)
        ).fetchone()[0]
        if max_row:
            try:
                seq = int(max_row[9:]) + 1 + attempt
            except (ValueError, IndexError):
                seq = 1 + attempt
        else:
            seq = 1 + attempt
        code = f"KH{today}-{seq:04d}"
        if code in _GEN_CODE_CACHE:
            continue
        exists = db.execute(
            "SELECT 1 FROM projects WHERE project_code = ?", (code,)
        ).fetchone()
        if not exists:
            _GEN_CODE_CACHE.add(code)
            return code
    raise RuntimeError("Failed to generate unique project code after 100 attempts")


def _safe_extract_export_path(export_dir: str, zip_name: str) -> str:
    """Resolve target path for export assets and validate it stays within export_dir."""
    rel = zip_name[len("exports/"):]
    target = os.path.normpath(os.path.join(export_dir, rel.replace("/", os.sep)))
    export_dir_resolved = os.path.normpath(export_dir)
    if os.path.commonpath([target, export_dir_resolved]) != export_dir_resolved:
        raise ValueError(f"Path traversal blocked: {zip_name}")
    return target


def import_workspace_zip(db, zip_bytes: bytes, user_sub: str) -> dict:
    """Import a workspace ZIP and create a new workspace. Returns {ok, workspace_id, applied}."""

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        # Read manifest
        try:
            ws_json_bytes = zf.read("workspace.json")
        except KeyError:
            raise ValueError("ZIP 中缺少 workspace.json")

        try:
            manifest = json.loads(ws_json_bytes)
        except json.JSONDecodeError:
            raise ValueError("workspace.json 格式无效")

        ver = manifest.get("version", 1)

        # Validate structure
        required_keys = ["workspace", "configs", "projects",
                        "project_items", "project_item_results", "batch_jobs",
                        "batch_job_items", "project_categories"]
        for key in required_keys:
            if key not in manifest:
                raise ValueError(f"workspace.json 缺少字段: {key}")

        required_tables = ["column_configs", "speech_configs", "tts_configs", "core_prompt_configs"]
        for tbl in required_tables:
            if tbl not in manifest["configs"] or not isinstance(manifest["configs"][tbl], list):
                raise ValueError(f"configs 缺少必需的数组字段: {tbl}")

    # Phase 1: create new workspace
    ws_data = manifest["workspace"]
    new_ws_id = uuid.uuid4().hex[:12]
    db.execute(
        "INSERT INTO workspaces (id, name, description, logo, status, created_by) VALUES (?, ?, ?, ?, ?, ?)",
        (new_ws_id,
         ws_data.get("name", "导入的工作区"),
         ws_data.get("description", ""),
         ws_data.get("logo", ""),
         ws_data.get("status", "draft"),
         user_sub),
    )

    # Assign imported workspace to importer personally
    db.execute(
        "INSERT OR IGNORE INTO member_workspaces (workspace_id, user_id) VALUES (?, ?)",
        (new_ws_id, user_sub))

    # Build ID mapping
    id_map = {manifest["source_workspace_id"]: new_ws_id}
    for proj in manifest.get("projects", []):
        id_map[proj["id"]] = uuid.uuid4().hex[:12]
    for item in manifest.get("project_items", []):
        id_map[item["id"]] = uuid.uuid4().hex[:12]
    for bj in manifest.get("batch_jobs", []):
        id_map[bj["id"]] = uuid.uuid4().hex[:12]
    for cat in manifest.get("project_categories", []):
        id_map[cat["id"]] = uuid.uuid4().hex[:12]

    save_root = _get_save_root(db)
    export_dir = _get_export_dir()
    applied = {}

    try:
        # Import project categories (assign fresh IDs)
        for cat in manifest.get("project_categories", []):
            cat["id"] = id_map.get(cat.get("id"), uuid.uuid4().hex[:12])
        applied["project_categories"] = _insert_rows(
            db, "project_categories", manifest.get("project_categories", []),
            id_map, new_ws_id)

        # Import projects (strip project_code — regenerated below)
        for proj in manifest.get("projects", []):
            proj["id"] = id_map.get(proj["id"], proj["id"])
            proj.pop("project_code", None)
        applied["projects"] = _insert_rows(
            db, "projects", manifest.get("projects", []), id_map, new_ws_id)

        # Regenerate project_codes for imported projects
        for proj in manifest.get("projects", []):
            new_pid = proj["id"]  # already remapped by id_map above
            code = _generate_project_code(db)
            db.execute("UPDATE projects SET project_code = ? WHERE id = ?", (code, new_pid))

        # Clear storage_path so projects regenerate paths on the new machine
        db.execute("UPDATE projects SET storage_path = '' WHERE workspace_id = ?", (new_ws_id,))

        # Import project items (own id_map for source_item_id cross-refs)
        id_map_items = {}
        for item in manifest.get("project_items", []):
            new_piid = id_map.get(item["id"], uuid.uuid4().hex[:12])
            id_map_items[item["id"]] = new_piid
            item["id"] = new_piid
        applied["project_items"] = _insert_rows(
            db, "project_items", manifest.get("project_items", []),
            id_map, new_ws_id, id_map_items=id_map_items)

        # Import project item results
        applied["project_item_results"] = _insert_rows(
            db, "project_item_results", manifest.get("project_item_results", []),
            id_map, new_ws_id, id_map_items=id_map_items)

        # Import step results (v2+; v1 exports don't have this key → skip)
        if manifest.get("step_results"):
            applied["step_results"] = _insert_rows(
                db, "step_results", manifest["step_results"],
                id_map, new_ws_id)

        # Import batch jobs
        id_map_batch = {}
        for bj in manifest.get("batch_jobs", []):
            new_bid = id_map.get(bj["id"], uuid.uuid4().hex[:12])
            id_map_batch[bj["id"]] = new_bid
            bj["id"] = new_bid
        applied["batch_jobs"] = _insert_rows(
            db, "batch_jobs", manifest.get("batch_jobs", []), id_map, new_ws_id)

        # Import batch job items
        applied["batch_job_items"] = _insert_rows(
            db, "batch_job_items", manifest.get("batch_job_items", []),
            id_map, new_ws_id, id_map_batch=id_map_batch)

        # Import configs (following existing import-configs pattern)
        configs = manifest["configs"]
        for tbl in required_tables:
            db.execute(f"DELETE FROM {tbl} WHERE workspace_id = ?", (new_ws_id,))
            for row in configs.get(tbl, []):
                cols = list(row.keys())
                _validate_cols(cols)
                vals_list = [new_ws_id] + [row.get(k, "") for k in cols]
                if "id" in row:
                    id_idx = cols.index("id") + 1
                    vals_list[id_idx] = uuid.uuid4().hex[:12]
                placeholders = ",".join(["?"] * len(vals_list))
                db.execute(
                    f"INSERT INTO {tbl} (workspace_id, {','.join(cols)}) VALUES ({placeholders})",
                    vals_list,
                )

        db.commit()

        # Phase 2: extract file assets
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            for info in zf.infolist():
                if info.is_dir():
                    continue
                if info.filename.startswith("files/"):
                    target = _safe_extract_path(save_root, info.filename)
                    target_dir = os.path.dirname(target)
                    if not os.path.exists(target_dir):
                        os.makedirs(target_dir, exist_ok=True)
                    with zf.open(info) as src, open(target, "wb") as dst:
                        shutil.copyfileobj(src, dst)
                elif info.filename.startswith("exports/"):
                    target = _safe_extract_export_path(export_dir, info.filename)
                    target_dir = os.path.dirname(target)
                    if not os.path.exists(target_dir):
                        os.makedirs(target_dir, exist_ok=True)
                    with zf.open(info) as src, open(target, "wb") as dst:
                        shutil.copyfileobj(src, dst)

        return {"ok": True, "workspace_id": new_ws_id, "applied": applied}

    except Exception:
        db.rollback()
        raise
