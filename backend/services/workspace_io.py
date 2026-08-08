"""
Workspace full data export/import — ZIP with workspace.json + file assets.

Export: all project data + file assets in a portable ZIP.
Import: restore to a new workspace with fresh IDs.
"""

import io
import json
import os
import uuid
import zipfile
from datetime import datetime, timezone

_EXCLUDE_FIELDS = {"created_at", "updated_at", "workspace_id", "sort_order"}


def _row_dict(row, exclude=None) -> dict:
    """Convert sqlite3.Row to dict, stripping excluded fields."""
    d = dict(row)
    for k in (exclude or _EXCLUDE_FIELDS):
        d.pop(k, None)
    return d


def _file_map_key(path: str) -> str:
    """Normalize path for file_map lookups."""
    return os.path.normcase(os.path.normpath(path)) if path else ""


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
        if not os.path.exists(p) or not p.startswith(save_root_norm + os.sep):
            return
        # Relative path inside the save root → store under files/
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
    # Keep workspace name/description/logo/status for import reference
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

    # 5. Source materials (by project)
    src_materials = []
    if project_ids:
        placeholders = ",".join("?" * len(project_ids))
        src_materials = [_row_dict(r) for r in db.execute(
            f"SELECT * FROM source_materials WHERE project_id IN ({placeholders})",
            project_ids).fetchall()]

    # 6. Project items
    p_items = []
    if project_ids:
        placeholders = ",".join("?" * len(project_ids))
        p_items = [_row_dict(r) for r in db.execute(
            f"SELECT * FROM project_items WHERE project_id IN ({placeholders}) ORDER BY sort_order",
            project_ids).fetchall()]

    # 7. Project item results
    pr_results = []
    item_ids = [it["id"] for it in p_items]
    if item_ids:
        placeholders = ",".join("?" * len(item_ids))
        pr_results = [_row_dict(r, {"id"}) for r in db.execute(
            f"SELECT * FROM project_item_results WHERE project_item_id IN ({placeholders})",
            item_ids).fetchall()]

    # 8. Batch jobs
    batch_jobs = [_row_dict(r) for r in db.execute(
        "SELECT * FROM batch_jobs WHERE workspace_id = ?", (workspace_id,)).fetchall()]
    batch_ids = [b["id"] for b in batch_jobs]

    # 9. Batch job items
    batch_items = []
    if batch_ids:
        placeholders = ",".join("?" * len(batch_ids))
        batch_items = [_row_dict(r, {"id"}) for r in db.execute(
            f"SELECT * FROM batch_job_items WHERE batch_id IN ({placeholders})",
            batch_ids).fetchall()]

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

        # Validate structure
        for key in ("workspace", "configs", "projects", "source_materials",
                     "project_items", "project_item_results", "batch_jobs",
                     "batch_job_items", "project_categories"):
            if key not in manifest:
                raise ValueError(f"workspace.json 缺少字段: {key}")

        # Validate configs
        required_tables = ["column_configs", "speech_configs", "tts_configs", "core_prompt_configs"]
        for tbl in required_tables:
            if tbl not in manifest["configs"] or not isinstance(manifest["configs"][tbl], list):
                raise ValueError(f"configs 缺少必需的数组字段: {tbl}")

    # Phase 1: create the new workspace
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

    # Map project ids
    for proj in manifest.get("projects", []):
        new_pid = uuid.uuid4().hex[:12]
        id_map[proj["id"]] = new_pid

    # Map project_item ids
    for item in manifest.get("project_items", []):
        new_piid = uuid.uuid4().hex[:12]
        id_map[item["id"]] = new_piid

    # Map batch_job ids
    for bj in manifest.get("batch_jobs", []):
        new_bid = uuid.uuid4().hex[:12]
        id_map[bj["id"]] = new_bid

    # Map project_category ids
    for cat in manifest.get("project_categories", []):
        new_cid = uuid.uuid4().hex[:12]
        id_map[cat["id"]] = new_cid

    save_root = _get_save_root(db)
    applied = {}

    try:
        # Import project categories
        count = 0
        for cat in manifest.get("project_categories", []):
            cols = [c for c in cat.keys() if c not in _EXCLUDE_FIELDS]
            cat_vals = {c: cat.get(c, "") for c in cols}
            cat_vals["id"] = id_map.get(cat.get("id"), uuid.uuid4().hex[:12])
            cat_vals["workspace_id"] = new_ws_id
            all_cols = list(cat_vals.keys())
            placeholders = ",".join(["?"] * len(all_cols))
            db.execute(
                f"INSERT INTO project_categories ({','.join(all_cols)}) VALUES ({placeholders})",
                list(cat_vals.values()),
            )
            count += 1
        applied["project_categories"] = count

        # Import projects
        count = 0
        for proj in manifest.get("projects", []):
            cols = [c for c in proj.keys() if c not in _EXCLUDE_FIELDS]
            vals = {c: proj.get(c, "") for c in cols}
            vals["id"] = id_map.get(proj["id"], proj["id"])
            vals["workspace_id"] = new_ws_id
            if proj.get("category_id") and proj["category_id"] in id_map:
                vals["category_id"] = id_map[proj["category_id"]]
            # Remap storage_path
            if vals.get("storage_path"):
                vals["storage_path"] = _remap_path(
                    proj["storage_path"], save_root, new_ws_id, vals["id"])
            all_cols = list(vals.keys())
            placeholders = ",".join(["?"] * len(all_cols))
            db.execute(
                f"INSERT INTO projects ({','.join(all_cols)}) VALUES ({placeholders})",
                list(vals.values()),
            )
            count += 1
        applied["projects"] = count

        # Import source materials
        count = 0
        for sm in manifest.get("source_materials", []):
            cols = [c for c in sm.keys() if c not in _EXCLUDE_FIELDS]
            vals = {c: sm.get(c, "") for c in cols}
            vals["id"] = uuid.uuid4().hex[:12]
            if sm.get("project_id") and sm["project_id"] in id_map:
                vals["project_id"] = id_map[sm["project_id"]]
            all_cols = list(vals.keys())
            placeholders = ",".join(["?"] * len(all_cols))
            db.execute(
                f"INSERT INTO source_materials ({','.join(all_cols)}) VALUES ({placeholders})",
                list(vals.values()),
            )
            count += 1
        applied["source_materials"] = count

        # Import project items
        id_map_items = {}  # old_id -> new_id for project_items specifically
        for item in manifest.get("project_items", []):
            new_piid = id_map.get(item["id"], uuid.uuid4().hex[:12])
            id_map_items[item["id"]] = new_piid
            cols = [c for c in item.keys() if c not in _EXCLUDE_FIELDS]
            vals = {c: item.get(c, "") for c in cols}
            vals["id"] = new_piid
            if item.get("project_id") and item["project_id"] in id_map:
                vals["project_id"] = id_map[item["project_id"]]
            if item.get("source_item_id") and item["source_item_id"] in id_map_items:
                vals["source_item_id"] = id_map_items[item["source_item_id"]]
            all_cols = list(vals.keys())
            placeholders = ",".join(["?"] * len(all_cols))
            db.execute(
                f"INSERT INTO project_items ({','.join(all_cols)}) VALUES ({placeholders})",
                list(vals.values()),
            )
        applied["project_items"] = len(manifest.get("project_items", []))

        # Import project item results
        count = 0
        for pir in manifest.get("project_item_results", []):
            # project_item_results uses AUTOINCREMENT id, so we skip id on insert
            cols = [c for c in pir.keys() if c not in _EXCLUDE_FIELDS and c != "id"]
            vals = {c: pir.get(c, "") for c in cols}
            if pir.get("project_item_id") and pir["project_item_id"] in id_map_items:
                vals["project_item_id"] = id_map_items[pir["project_item_id"]]
            # Remap file_path
            if vals.get("file_path"):
                vals["file_path"] = _remap_result_path(pir["file_path"], save_root, new_ws_id)
            all_cols = list(vals.keys())
            placeholders = ",".join(["?"] * len(all_cols))
            db.execute(
                f"INSERT INTO project_item_results ({','.join(all_cols)}) VALUES ({placeholders})",
                list(vals.values()),
            )
            count += 1
        applied["project_item_results"] = count

        # Import batch jobs
        id_map_batch = {}
        for bj in manifest.get("batch_jobs", []):
            new_bid = id_map.get(bj["id"], uuid.uuid4().hex[:12])
            id_map_batch[bj["id"]] = new_bid
            cols = [c for c in bj.keys() if c not in _EXCLUDE_FIELDS]
            vals = {c: bj.get(c, "") for c in cols}
            vals["id"] = new_bid
            vals["workspace_id"] = new_ws_id
            all_cols = list(vals.keys())
            placeholders = ",".join(["?"] * len(all_cols))
            db.execute(
                f"INSERT INTO batch_jobs ({','.join(all_cols)}) VALUES ({placeholders})",
                list(vals.values()),
            )
        applied["batch_jobs"] = len(manifest.get("batch_jobs", []))

        # Import batch job items
        count = 0
        for bi in manifest.get("batch_job_items", []):
            cols = [c for c in bi.keys() if c not in _EXCLUDE_FIELDS and c != "id"]
            vals = {c: bi.get(c, "") for c in cols}
            if bi.get("batch_id") and bi["batch_id"] in id_map_batch:
                vals["batch_id"] = id_map_batch[bi["batch_id"]]
            if bi.get("project_id") and bi["project_id"] in id_map:
                vals["project_id"] = id_map[bi["project_id"]]
            all_cols = list(vals.keys())
            placeholders = ",".join(["?"] * len(all_cols))
            db.execute(
                f"INSERT INTO batch_job_items ({','.join(all_cols)}) VALUES ({placeholders})",
                list(vals.values()),
            )
            count += 1
        applied["batch_job_items"] = count

        # Import configs (following existing pattern from import-configs)
        configs = manifest["configs"]
        for tbl in required_tables:
            db.execute(f"DELETE FROM {tbl} WHERE workspace_id = ?", (new_ws_id,))
            for row in configs.get(tbl, []):
                cols = list(row.keys())
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
            for name in zf.namelist():
                if not name.startswith("files/") or name.endswith("/"):
                    continue
                # Determine target path: files/{project_id}/... or files/results/...
                # We need to figure out the new path. The original storage_path was already remapped
                # during DB insert. But we stored the new path in the DB. We need to extract files
                # to those new paths.
                # Strategy: use the zip relative path structure, but under the new save_root
                # Look up corresponding DB row to find the new path
                rel = name[len("files/"):]
                target = os.path.join(save_root, rel.replace("/", os.sep))
                target_dir = os.path.dirname(target)
                if not os.path.exists(target_dir):
                    os.makedirs(target_dir, exist_ok=True)
                with open(target, "wb") as f:
                    f.write(zf.read(name))

        return {"ok": True, "workspace_id": new_ws_id, "applied": applied}

    except Exception:
        db.rollback()
        raise


def _remap_path(old_storage_path: str, save_root: str, new_ws_id: str, new_project_id: str) -> str:
    """Compute new storage_path for an imported project.

    Strategy: create a new path under save_root using new_ws_id/new_project_id,
    but preserve the original leaf directory name if possible.
    """
    if not old_storage_path:
        return ""
    old_name = os.path.basename(os.path.normpath(old_storage_path))
    if not old_name:
        old_name = new_project_id
    # Create a workspace-scoped project dir
    ws_dir = os.path.join(save_root, new_ws_id)
    return os.path.join(ws_dir, new_project_id, old_name)


def _remap_result_path(old_file_path: str, save_root: str, new_ws_id: str) -> str:
    """Compute new file_path for an imported project_item_result."""
    if not old_file_path:
        return ""
    old_name = os.path.basename(os.path.normpath(old_file_path))
    results_dir = os.path.join(save_root, new_ws_id, "results")
    return os.path.join(results_dir, old_name)
