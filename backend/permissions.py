"""Shared permission enforcement utilities. Imported by app.py and routers."""
from fastapi import HTTPException, Depends, Request
from database import get_db


def require_perm(permission: str):
    """FastAPI dependency: check current user has the required permission."""
    def checker(request: Request):
        user = getattr(request.state, "user", None)
        if user is None:
            raise HTTPException(status_code=401, detail="请先登录")
        perms = set(user.get("permissions", []))
        # Rule 3: admin always view_all
        if user.get("user_type") == "admin":
            perms.add("project.view_all")
        # "all" implies "own"
        if "project.view_all" in perms:
            perms.add("project.view_own")
        if "project.edit_all" in perms:
            perms.add("project.edit_own")
        # Rule 5: role.manage → member.manage
        if "role.manage" in perms:
            perms.add("member.manage")
        # Rule 4: generate requires view
        if permission.endswith(".generate"):
            view_perm = permission.replace(".generate", ".view")
            if view_perm not in perms:
                raise HTTPException(status_code=403, detail=f"缺少权限: {view_perm}")
        if permission not in perms:
            raise HTTPException(status_code=403, detail=f"缺少权限: {permission}")
        return user
    return Depends(checker)


def check_ownership(resource_created_by: str | None, user: dict,
                    edit_all_perm: str = "project.edit_all") -> None:
    """Raise 403 if user doesn't own the resource and lacks edit_all permission."""
    if resource_created_by is None:
        if edit_all_perm in user.get("permissions", []):
            return
        raise HTTPException(status_code=403, detail="历史数据仅超级管理员可编辑")
    uid = user.get("user_id", user.get("sub", ""))
    if resource_created_by == uid and uid:
        return
    # Legacy JWT from old POST /api/login only has {"sub":"admin"} — treat as admin
    if "user_type" not in user and user.get("sub") == "admin":
        return
    if edit_all_perm in user.get("permissions", []):
        return
    raise HTTPException(status_code=403, detail="只能操作自己创建的内容")


def verify_project_access(project_id: str, user: dict) -> None:
    """Raise 403 if user (member) doesn't have access to this project's workspace."""
    if user.get("user_type") == "admin":
        return
    # Legacy JWT from old POST /api/login only has {"sub":"admin"} — treat as admin
    if "user_type" not in user and user.get("sub") == "admin":
        return
    db = get_db()
    try:
        uid = user.get("user_id", user.get("sub", ""))
        row = db.execute(
            "SELECT 1 FROM projects p "
            "LEFT JOIN member_workspaces mw ON mw.workspace_id = p.workspace_id AND mw.user_id = ? "
            "LEFT JOIN workspace_roles wr ON wr.workspace_id = p.workspace_id "
            "LEFT JOIN user_roles ur ON ur.role_id = wr.role_id AND ur.user_id = ? "
            "WHERE p.id = ? AND (mw.user_id IS NOT NULL OR ur.user_id IS NOT NULL)",
            (uid, uid, project_id),
        ).fetchone()
        if not row:
            raise HTTPException(status_code=403, detail="无权访问此项目资源")
    finally:
        db.close()


def can_access_project(project_id: str, user: dict) -> bool:
    """Return True if user (member) can access this project's workspace. Admins always True."""
    if user.get("user_type") == "admin":
        return True
    if "user_type" not in user and user.get("sub") == "admin":
        return True
    db = get_db()
    try:
        uid = user.get("user_id", user.get("sub", ""))
        row = db.execute(
            "SELECT 1 FROM projects p "
            "LEFT JOIN member_workspaces mw ON mw.workspace_id = p.workspace_id AND mw.user_id = ? "
            "LEFT JOIN workspace_roles wr ON wr.workspace_id = p.workspace_id "
            "LEFT JOIN user_roles ur ON ur.role_id = wr.role_id AND ur.user_id = ? "
            "WHERE p.id = ? AND (mw.user_id IS NOT NULL OR ur.user_id IS NOT NULL)",
            (uid, uid, project_id),
        ).fetchone()
        return row is not None
    finally:
        db.close()


def verify_project_unlock(project_id: str, user: dict) -> None:
    """Raise 402 if user hasn't unlocked this project. Admins are exempt."""
    if user.get("user_type") == "admin":
        return
    db = get_db()
    try:
        proj = db.execute(
            "SELECT is_downloadable FROM projects WHERE id=?", (project_id,)
        ).fetchone()
        if not proj or not proj["is_downloadable"]:
            # Not a downloadable project — fall through to existing permission checks
            return
        uid = user.get("user_id", user.get("sub", ""))
        unlock = db.execute(
            """SELECT 1 FROM project_unlocks
               WHERE user_id=? AND project_id=?
               AND (expires_at IS NULL OR expires_at > datetime('now'))""",
            (uid, project_id),
        ).fetchone()
        if not unlock:
            raise HTTPException(
                status_code=402,
                detail="请先消耗积分解锁此明细后再下载",
            )
    finally:
        db.close()
