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
    if user.get("user_type") == "admin":
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
