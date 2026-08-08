"""
Workspace full data export/import — ZIP with workspace.json + file assets.

Export: all project data + file assets in a portable ZIP.
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
_COL_RE = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]*$')
_SQLITE_MAX_VARS = 500  # batch size for IN (...) queries, well under SQLite's 999 limit

# Resource limits for import
_MAX_ZIP_BYTES = 500 * 1024 * 1024      # 500MB compressed
_MAX_DECOMPRESSED = 2 * 1024 * 1024 * 1024  # 2GB total decompressed
_MAX_SINGLE_FILE = 100 * 1024 * 1024    # 100MB per extracted file


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


def _collect_file_paths(projects_rows, pr_results_rows, save_root: str) -> dict:
    """Scan storage_path / file_path columns for existing disk files.

    Returns {abs_path: zip_relative_path}
    """
    file_map = {}
    save_root_norm = os.path.normcase(os.path.normpath(save_root))

    def _add_path(abs_path: str):
        if not abs_path:
            return
        p = os.path.normcase(os.path.normpath(os.path.abspath(abs_path)))
        # Validate path stays within save_root
        if not os.path.exists(p):
            return
        if os.path.commonpath([p, save_root_norm]) != save_root_norm:
            return
        rel = os.path.relpath(p, save_root_norm).replace("\\", "/")
        file_map[p] = f"files/{rel}"

    for row in projects_rows:
        sp = (row.get("storage_path") or "").strip()
        if sp and os.path.isabs(sp):
            _add_path(sp)

    for row in pr_results_rows:
        fp = (row.get("file_path") or "").strip()
        if fp and os.path.isabs(fp):
            _add_path(fp)

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

    # 5. Source materials (by project, batched)
    src_materials = _batch_in_select(db, "source_materials", "project_id", project_ids) if project_ids else []

    # 6. Project items (by project, batched)
    p_items = _batch_in_select(db, "project_items", "project_id", project_ids) if project_ids else []
    p_items.sort(key=lambda it: it.get("sort_order", 0))

    # 7. Project item results (by item, batched)
    item_ids = [it["id"] for it in p_items]
    pr_results = _batch_in_select(db, "project_item_results", "project_item_id", item_ids, {"id"}) if item_ids else []

    # 8. Batch jobs
    batch_jobs = [_row_dict(r) for r in db.execute(
        "SELECT * FROM batch_jobs WHERE workspace_id = ?", (workspace_id,)).fetchall()]
    batch_ids = [b["id"] for b in batch_jobs]

    # 9. Batch job items (batched)
    batch_items = _batch_in_select(db, "batch_job_items", "batch_id", batch_ids, {"id"}) if batch_ids else []

    # 10. File map
    save_root = _get_save_root(db)
    file_map = _collect_file_paths(projects, pr_results, save_root)

    manifest = {
        "version": 1,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "source_workspace_id": workspace_id,
        "workspace": ws_meta,
        "configs": configs,
        "project_categories": cats,
        "projects": projects,
        "source_materials": src_materials,
        "project_items": p_items,
        "project_item_results": pr_results,
        "batch_jobs": batch_jobs,
        "batch_job_items": batch_items,
    }

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("workspace.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        for abs_path, zip_path in file_map.items():
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

        # Remap FK references
        if "workspace_id" in cols:
            vals["workspace_id"] = new_ws_id
        if "project_id" in cols and vals.get("project_id") and vals["project_id"] in id_map:
            vals["project_id"] = id_map[vals["project_id"]]
        if "category_id" in cols and vals.get("category_id") and vals["category_id"] in id_map:
            vals["category_id"] = id_map[vals["category_id"]]
        if id_map_items and "source_item_id" in cols and vals.get("source_item_id") and vals["source_item_id"] in id_map_items:
            vals["source_item_id"] = id_map_items[vals["source_item_id"]]
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


def import_workspace_zip(db, zip_bytes: bytes, user_sub: str) -> dict:
    """Import a workspace ZIP and create a new workspace. Returns {ok, workspace_id, applied}."""
    if len(zip_bytes) > _MAX_ZIP_BYTES:
        raise ValueError(f"ZIP 文件过大（最大 {_MAX_ZIP_BYTES // (1024*1024)}MB）")

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
        # Validate total decompressed size upfront
        total_size = sum(info.file_size for info in zf.infolist() if not info.is_dir())
        if total_size > _MAX_DECOMPRESSED:
            raise ValueError(f"解压后总大小超过限制（最大 {_MAX_DECOMPRESSED // (1024*1024)}MB）")

        # Read manifest
        try:
            ws_json_bytes = zf.read("workspace.json")
        except KeyError:
            raise ValueError("ZIP 中缺少 workspace.json")

        try:
            manifest = json.loads(ws_json_bytes)
        except json.JSONDecodeError:
            raise ValueError("workspace.json 格式无效")

        # Validate structure
        for key in ("workspace", "configs", "projects", "source_materials",
                     "project_items", "project_item_results", "batch_jobs",
                     "batch_job_items", "project_categories"):
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
    applied = {}

    try:
        # Import project categories (assign fresh IDs)
        for cat in manifest.get("project_categories", []):
            cat["id"] = id_map.get(cat.get("id"), uuid.uuid4().hex[:12])
        applied["project_categories"] = _insert_rows(
            db, "project_categories", manifest.get("project_categories", []),
            id_map, new_ws_id)

        # Import projects (remap storage_path)
        for proj in manifest.get("projects", []):
            proj["id"] = id_map.get(proj["id"], proj["id"])
        applied["projects"] = _insert_rows(
            db, "projects", manifest.get("projects", []), id_map, new_ws_id)

        # Import source materials
        applied["source_materials"] = _insert_rows(
            db, "source_materials", manifest.get("source_materials", []),
            id_map, new_ws_id)

        # Import project items (own id_map for source_item_id cross-refs)
        id_map_items = {}
        for item in manifest.get("project_items", []):
            new_piid = id_map.get(item["id"], uuid.uuid4().hex[:12])
            id_map_items[item["id"]] = new_piid
            item["id"] = new_piid
        applied["project_items"] = _insert_rows(
            db, "project_items", manifest.get("project_items", []),
            id_map, new_ws_id, id_map_items=id_map_items)

        # Import project item results (skip AUTOINCREMENT id)
        applied["project_item_results"] = _insert_rows(
            db, "project_item_results", manifest.get("project_item_results", []),
            id_map, new_ws_id, id_map_items=id_map_items)

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

        # Phase 2: extract file assets with size guards
        cumulative = 0
        with zipfile.ZipFile(io.BytesIO(zip_bytes)) as zf:
            for info in zf.infolist():
                if not info.filename.startswith("files/") or info.is_dir():
                    continue
                if info.file_size > _MAX_SINGLE_FILE:
                    raise ValueError(f"单个文件过大: {info.filename}")
                cumulative += info.file_size
                if cumulative > _MAX_DECOMPRESSED:
                    raise ValueError("解压后文件总大小超过限制")

                target = _safe_extract_path(save_root, info.filename)
                target_dir = os.path.dirname(target)
                if not os.path.exists(target_dir):
                    os.makedirs(target_dir, exist_ok=True)
                with zf.open(info) as src, open(target, "wb") as dst:
                    shutil.copyfileobj(src, dst)

        return {"ok": True, "workspace_id": new_ws_id, "applied": applied}

    except Exception:
        db.rollback()
        raise


def _remap_path(old_storage_path: str, save_root: str, new_ws_id: str, new_project_id: str) -> str:
    """Compute new storage_path for an imported project."""
    if not old_storage_path:
        return ""
    old_name = os.path.basename(os.path.normpath(old_storage_path))
    if not old_name:
        old_name = new_project_id
    ws_dir = os.path.join(save_root, new_ws_id)
    return os.path.join(ws_dir, new_project_id, old_name)


def _remap_result_path(old_file_path: str, save_root: str, new_ws_id: str) -> str:
    """Compute new file_path for an imported project_item_result."""
    if not old_file_path:
        return ""
    old_name = os.path.basename(os.path.normpath(old_file_path))
    results_dir = os.path.join(save_root, new_ws_id, "results")
    return os.path.join(results_dir, old_name)
