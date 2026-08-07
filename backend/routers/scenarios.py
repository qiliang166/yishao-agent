"""Scenario file CRUD — per-workspace custom scenario files on disk."""

import os
import sys
import json
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/ws-scenarios")

if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
    if not os.path.isdir(os.path.join(BASE_DIR, "resources")):
        BASE_DIR = os.path.join(sys._MEIPASS, 'backend')
else:
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCENARIOS_DIR = os.path.join(BASE_DIR, "resources", "scenarios")


class ScenarioSaveRequest(BaseModel):
    content: str


def _safe_path(workspace_id: str, column_id: str, filename: str) -> str:
    """Build a safe filesystem path, rejecting traversal attempts."""
    for part in (workspace_id, column_id, filename):
        if ".." in part or "/" in part or "\\" in part:
            raise HTTPException(400, "非法路径字符")
    return os.path.join(SCENARIOS_DIR, workspace_id, column_id, filename)


@router.get("/{workspace_id}/{column_id}/{filename}")
def get_scenario_file(workspace_id: str, column_id: str, filename: str):
    """Read a per-workspace scenario file. Falls back to the shared col file."""
    fpath = _safe_path(workspace_id, column_id, filename)
    if os.path.exists(fpath):
        with open(fpath, "r", encoding="utf-8") as f:
            return {"content": f.read(), "source": "workspace"}
    # Fallback: shared per-column file
    fallback = os.path.join(SCENARIOS_DIR, column_id, filename)
    if os.path.exists(fallback):
        with open(fallback, "r", encoding="utf-8") as f:
            return {"content": f.read(), "source": "shared"}
    raise HTTPException(404, f"场景文件不存在: {filename}")


@router.put("/{workspace_id}/{column_id}/{filename}")
def save_scenario_file(workspace_id: str, column_id: str, filename: str, req: ScenarioSaveRequest):
    """Save a per-workspace scenario file to disk."""
    fpath = _safe_path(workspace_id, column_id, filename)
    os.makedirs(os.path.dirname(fpath), exist_ok=True)
    with open(fpath, "w", encoding="utf-8") as f:
        f.write(req.content)
    return {"ok": True, "path": fpath}


@router.delete("/{workspace_id}/{column_id}/{filename}")
def delete_scenario_file(workspace_id: str, column_id: str, filename: str):
    """Delete a per-workspace scenario file (revert to shared default)."""
    fpath = _safe_path(workspace_id, column_id, filename)
    if os.path.exists(fpath):
        os.remove(fpath)
        return {"ok": True, "deleted": True}
    return {"ok": True, "deleted": False}
