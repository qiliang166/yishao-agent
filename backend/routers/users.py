"""User & role management routes."""
import uuid
import logging
from fastapi import APIRouter, HTTPException, Request
from database import get_db
from permissions import require_perm

logger = logging.getLogger("users_router")

router = APIRouter(prefix="/api")

# ── Roles ──

@router.get("/roles")
def list_roles(user_type: str = None, user=require_perm("member.manage")):
    db = get_db()
    try:
        if user_type:
            rows = db.execute(
                "SELECT * FROM roles WHERE user_type = ? ORDER BY created_at",
                (user_type,)).fetchall()
        else:
            rows = db.execute("SELECT * FROM roles ORDER BY created_at").fetchall()
        roles = []
        for r in rows:
            role = dict(r)
            perms = db.execute(
                "SELECT permission FROM role_permissions WHERE role_id = ?",
                (role["id"],)).fetchall()
            role["permissions"] = [p["permission"] for p in perms]
            roles.append(role)
        return {"roles": roles}
    finally:
        db.close()


@router.post("/roles")
def create_role(req: dict, user=require_perm("role.manage")):
    name = req.get("name", "").strip()
    if not name:
        raise HTTPException(400, "角色名不能为空")
    user_type = req.get("user_type", "admin")
    if user_type not in ("admin", "member"):
        raise HTTPException(400, "user_type 必须是 admin 或 member")
    description = req.get("description", "")
    role_id = str(uuid.uuid4())
    db = get_db()
    try:
        existing = db.execute("SELECT id FROM roles WHERE name = ?", (name,)).fetchone()
        if existing:
            raise HTTPException(400, "角色名已存在")
        db.execute(
            "INSERT INTO roles (id, name, description, user_type) VALUES (?, ?, ?, ?)",
            (role_id, name, description, user_type))
        db.commit()
        row = db.execute("SELECT * FROM roles WHERE id = ?", (role_id,)).fetchone()
        return dict(row)
    finally:
        db.close()


@router.get("/roles/{role_id}")
def get_role(role_id: str, user=require_perm("member.manage")):
    db = get_db()
    try:
        row = db.execute("SELECT * FROM roles WHERE id = ?", (role_id,)).fetchone()
        if not row:
            raise HTTPException(404, "角色不存在")
        role = dict(row)
        perms = db.execute(
            "SELECT permission FROM role_permissions WHERE role_id = ?",
            (role_id,)).fetchall()
        role["permissions"] = [p["permission"] for p in perms]
        return role
    finally:
        db.close()


@router.put("/roles/{role_id}")
def update_role(role_id: str, req: dict, user=require_perm("role.manage")):
    db = get_db()
    try:
        existing = db.execute("SELECT * FROM roles WHERE id = ?", (role_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "角色不存在")
        if existing["is_system"]:
            raise HTTPException(403, "系统角色不可编辑")
        if "name" in req:
            db.execute("UPDATE roles SET name = ?, updated_at = datetime('now') WHERE id = ?",
                       (req["name"], role_id))
        if "description" in req:
            db.execute("UPDATE roles SET description = ?, updated_at = datetime('now') WHERE id = ?",
                       (req["description"], role_id))
        db.commit()
        row = db.execute("SELECT * FROM roles WHERE id = ?", (role_id,)).fetchone()
        return dict(row)
    finally:
        db.close()


@router.delete("/roles/{role_id}")
def delete_role(role_id: str, user=require_perm("role.manage")):
    db = get_db()
    try:
        existing = db.execute("SELECT * FROM roles WHERE id = ?", (role_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "角色不存在")
        if existing["is_system"]:
            raise HTTPException(403, "系统角色不可删除")
        db.execute("DELETE FROM role_permissions WHERE role_id = ?", (role_id,))
        db.execute("DELETE FROM user_roles WHERE role_id = ?", (role_id,))
        db.execute("DELETE FROM roles WHERE id = ?", (role_id,))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@router.post("/roles/{role_id}/permissions/add")
def add_role_permission(role_id: str, req: dict, user=require_perm("role.manage")):
    permission = req.get("permission", "")
    if not permission:
        raise HTTPException(400, "权限码不能为空")
    db = get_db()
    try:
        role = db.execute("SELECT * FROM roles WHERE id = ?", (role_id,)).fetchone()
        if not role:
            raise HTTPException(404, "角色不存在")
        if role["is_system"]:
            raise HTTPException(403, "系统角色不可修改权限")
        existing = db.execute(
            "SELECT 1 FROM role_permissions WHERE role_id = ? AND permission = ?",
            (role_id, permission)).fetchone()
        if existing:
            raise HTTPException(400, "权限已存在")
        db.execute(
            "INSERT INTO role_permissions (role_id, permission) VALUES (?, ?)",
            (role_id, permission))
        db.commit()
        # Bump token_version for all users with this role
        users = db.execute(
            "SELECT user_id FROM user_roles WHERE role_id = ?", (role_id,)).fetchall()
        for u in users:
            db.execute("UPDATE users SET token_version = token_version + 1 WHERE id = ?",
                       (u["user_id"],))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@router.post("/roles/{role_id}/permissions/remove")
def remove_role_permission(role_id: str, req: dict, user=require_perm("role.manage")):
    permission = req.get("permission", "")
    if not permission:
        raise HTTPException(400, "权限码不能为空")
    db = get_db()
    try:
        role = db.execute("SELECT * FROM roles WHERE id = ?", (role_id,)).fetchone()
        if not role:
            raise HTTPException(404, "角色不存在")
        if role["is_system"]:
            raise HTTPException(403, "系统角色不可修改权限")
        db.execute(
            "DELETE FROM role_permissions WHERE role_id = ? AND permission = ?",
            (role_id, permission))
        db.commit()
        users = db.execute(
            "SELECT user_id FROM user_roles WHERE role_id = ?", (role_id,)).fetchall()
        for u in users:
            db.execute("UPDATE users SET token_version = token_version + 1 WHERE id = ?",
                       (u["user_id"],))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


# ── Users ──

@router.get("/users")
def list_users(user_type: str = None, status: str = None, search: str = None,
               page: int = 1, page_size: int = 20, user=require_perm("member.manage")):
    db = get_db()
    try:
        where = []
        params = []
        if user_type:
            where.append("user_type = ?")
            params.append(user_type)
        if status:
            if status == "pending":
                where.append("is_approved = 0")
            elif status == "approved":
                where.append("is_approved = 1")
            elif status == "rejected":
                where.append("is_approved = 2")
            elif status == "active":
                where.append("is_active = 1")
            elif status == "disabled":
                where.append("is_active = 0")
            elif status == "expired":
                where.append("expires_at IS NOT NULL AND expires_at < datetime('now')")
        if search:
            where.append("(username LIKE ? OR display_name LIKE ? OR email LIKE ?)")
            like = f"%{search}%"
            params.extend([like, like, like])

        where_clause = ("WHERE " + " AND ".join(where)) if where else ""
        count_row = db.execute(
            f"SELECT COUNT(*) as cnt FROM users {where_clause}", params).fetchone()
        total = count_row["cnt"] if count_row else 0

        offset = (page - 1) * page_size
        rows = db.execute(
            f"SELECT * FROM users {where_clause} ORDER BY created_at DESC LIMIT ? OFFSET ?",
            params + [page_size, offset]).fetchall()

        users = []
        is_superadmin = user.get("username") == "admin"
        for r in rows:
            u = {
                "id": r["id"], "username": r["username"], "display_name": r["display_name"],
                "email": r["email"], "phone": dict(r).get("phone", ""), "user_type": r["user_type"],
                "is_active": r["is_active"], "is_approved": r["is_approved"],
                "expires_at": r["expires_at"], "created_at": r["created_at"],
                "approval_note": dict(r).get("approval_note", "") or "",
            }
            if is_superadmin:
                u["admin_note"] = dict(r).get("admin_note", "") or ""
            # Get roles
            role_rows = db.execute(
                "SELECT r.id, r.name FROM roles r JOIN user_roles ur ON r.id = ur.role_id WHERE ur.user_id = ?",
                (r["id"],)).fetchall()
            u["roles"] = [{"id": rr["id"], "name": rr["name"]} for rr in role_rows]
            users.append(u)

        return {"users": users, "total": total, "page": page, "page_size": page_size}
    finally:
        db.close()


@router.get("/users/{user_id}")
def get_user(user_id: str, user=require_perm("member.manage")):
    db = get_db()
    try:
        row = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise HTTPException(404, "用户不存在")
        u = dict(row)
        u.pop("password_hash", None)
        if user.get("username") != "admin":
            u.pop("admin_note", None)
        role_rows = db.execute(
            "SELECT r.id, r.name FROM roles r JOIN user_roles ur ON r.id = ur.role_id WHERE ur.user_id = ?",
            (user_id,)).fetchall()
        u["roles"] = [{"id": rr["id"], "name": rr["name"]} for rr in role_rows]
        ws_rows = db.execute(
            "SELECT w.id, w.name FROM workspaces w JOIN member_workspaces mw ON w.id = mw.workspace_id WHERE mw.user_id = ?",
            (user_id,)).fetchall()
        u["workspaces"] = [{"id": wr["id"], "name": wr["name"]} for wr in ws_rows]
        return u
    finally:
        db.close()


@router.post("/users")
def create_user(req: dict, user=require_perm("member.manage")):
    from app import _hash_password
    username = req.get("username", "").strip()
    password = req.get("password", "")
    display_name = req.get("display_name", "").strip()
    user_type = req.get("user_type", "member")
    email = req.get("email", "").strip() or None

    if not username or not password or not display_name:
        raise HTTPException(400, "用户名、密码、显示名不能为空")
    if len(password) < 8:
        raise HTTPException(400, "密码至少8位")
    if user_type not in ("admin", "member"):
        raise HTTPException(400, "user_type 必须是 admin 或 member")
    if user_type == "admin":
        perms = set(user.get("permissions", []))
        if "role.manage" not in perms:
            raise HTTPException(403, "缺少权限: role.manage（创建管理员账号需要角色管理权限）")

    user_id = str(uuid.uuid4())
    password_hash = _hash_password(password)
    db = get_db()
    try:
        existing = db.execute("SELECT id FROM users WHERE username = ? COLLATE NOCASE",
                              (username,)).fetchone()
        if existing:
            raise HTTPException(400, "用户名已存在")
        if email:
            email_exist = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
            if email_exist:
                raise HTTPException(400, "邮箱已被注册")
        expires_val = "NULL" if user_type == "admin" else "datetime('now', '+30 days')"
        db.execute(
            f"""INSERT INTO users (id, username, password_hash, display_name, email, user_type,
               is_active, is_approved, approved_by, approved_at, expires_at, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?, datetime('now'),
               {expires_val}, datetime('now'), datetime('now'))""",
            (user_id, username, password_hash, display_name, email, user_type,
             user["sub"]))
        db.commit()
        row = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        result = dict(row)
        result.pop("password_hash", None)
        if user.get("username") != "admin":
            result.pop("admin_note", None)
        return result
    finally:
        db.close()


@router.put("/users/{user_id}")
def update_user(user_id: str, req: dict, user=require_perm("member.manage")):
    db = get_db()
    try:
        existing = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "用户不存在")
        if "display_name" in req:
            db.execute("UPDATE users SET display_name = ?, updated_at = datetime('now') WHERE id = ?",
                       (req["display_name"], user_id))
        if "email" in req:
            email_val = req["email"].strip() if req["email"] else None
            db.execute("UPDATE users SET email = ?, updated_at = datetime('now') WHERE id = ?",
                       (email_val, user_id))
        if "is_active" in req:
            if existing["user_type"] == "admin" and existing["username"] == "admin":
                raise HTTPException(403, "超级管理员不可停用")
            db.execute("UPDATE users SET is_active = ?, updated_at = datetime('now') WHERE id = ?",
                       (req["is_active"], user_id))
        if "admin_note" in req:
            if user.get("username") != "admin":
                raise HTTPException(403, "仅超级管理员可修改备注")
            db.execute("UPDATE users SET admin_note = ?, updated_at = datetime('now') WHERE id = ?",
                       ((req["admin_note"] or "").strip(), user_id))
        db.commit()
        row = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        result = dict(row)
        result.pop("password_hash", None)
        if user.get("username") != "admin":
            result.pop("admin_note", None)
        return result
    finally:
        db.close()


@router.delete("/users/{user_id}")
def delete_user(user_id: str, user=require_perm("member.manage")):
    db = get_db()
    try:
        existing = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "用户不存在")
        if existing["user_type"] == "admin" and existing["username"] == "admin":
            raise HTTPException(403, "超级管理员不可删除")
        db.execute("DELETE FROM user_roles WHERE user_id = ?", (user_id,))
        db.execute("DELETE FROM member_workspaces WHERE user_id = ?", (user_id,))
        db.execute("DELETE FROM payment_records WHERE user_id = ?", (user_id,))
        db.execute("DELETE FROM users WHERE id = ?", (user_id,))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@router.put("/users/{user_id}/active")
def toggle_user_active(user_id: str, user=require_perm("member.manage")):
    db = get_db()
    try:
        existing = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "用户不存在")
        if existing["user_type"] == "admin" and existing["username"] == "admin":
            raise HTTPException(403, "超级管理员不可停用")
        new_val = 0 if existing["is_active"] else 1
        db.execute("UPDATE users SET is_active = ?, updated_at = datetime('now') WHERE id = ?",
                   (new_val, user_id))
        # Bump token_version to force re-login
        db.execute("UPDATE users SET token_version = token_version + 1 WHERE id = ?", (user_id,))
        db.commit()
        return {"ok": True, "is_active": new_val}
    finally:
        db.close()


@router.post("/users/{user_id}/reset-password")
def reset_user_password(user_id: str, req: dict, user=require_perm("member.manage")):
    """Admin resets a user's password."""
    from app import _hash_password
    new_password = req.get("password", "")
    if len(new_password) < 8:
        raise HTTPException(400, "密码至少 8 位")
    db = get_db()
    try:
        existing = db.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "用户不存在")
        if existing["user_type"] == "admin" and existing["username"] == "admin":
            raise HTTPException(403, "超级管理员密码请在设置页自行修改")
        pw_hash = _hash_password(new_password)
        db.execute("UPDATE users SET password_hash=?, token_version=token_version+1, updated_at=datetime('now') WHERE id=?",
                   (pw_hash, user_id))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@router.post("/users/{user_id}/roles/add")
def add_user_role(user_id: str, req: dict, user=require_perm("role.manage")):
    role_id = req.get("role_id", "")
    if not role_id:
        raise HTTPException(400, "role_id 不能为空")
    db = get_db()
    try:
        u = db.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
        if not u:
            raise HTTPException(404, "用户不存在")
        r = db.execute("SELECT id FROM roles WHERE id = ?", (role_id,)).fetchone()
        if not r:
            raise HTTPException(404, "角色不存在")
        existing = db.execute(
            "SELECT 1 FROM user_roles WHERE user_id = ? AND role_id = ?",
            (user_id, role_id)).fetchone()
        if existing:
            raise HTTPException(400, "角色已分配")
        db.execute("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)",
                   (user_id, role_id))
        db.execute("UPDATE users SET token_version = token_version + 1 WHERE id = ?", (user_id,))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@router.post("/users/{user_id}/roles/remove")
def remove_user_role(user_id: str, req: dict, user=require_perm("role.manage")):
    role_id = req.get("role_id", "")
    if not role_id:
        raise HTTPException(400, "role_id 不能为空")
    db = get_db()
    try:
        db.execute("DELETE FROM user_roles WHERE user_id = ? AND role_id = ?",
                   (user_id, role_id))
        db.execute("UPDATE users SET token_version = token_version + 1 WHERE id = ?", (user_id,))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@router.get("/users/{user_id}/workspaces")
def get_user_workspaces(user_id: str, user=require_perm("member.manage")):
    db = get_db()
    try:
        rows = db.execute(
            "SELECT w.id, w.name FROM workspaces w JOIN member_workspaces mw ON w.id = mw.workspace_id WHERE mw.user_id = ?",
            (user_id,)).fetchall()
        return {"workspaces": [dict(r) for r in rows]}
    finally:
        db.close()


@router.post("/users/{user_id}/workspaces/add")
def add_user_workspaces(user_id: str, req: dict, user=require_perm("member.manage")):
    workspace_ids = req.get("workspace_ids", [])
    if not workspace_ids:
        raise HTTPException(400, "workspace_ids 不能为空")
    db = get_db()
    try:
        for wid in workspace_ids:
            existing = db.execute(
                "SELECT 1 FROM member_workspaces WHERE user_id = ? AND workspace_id = ?",
                (user_id, wid)).fetchone()
            if not existing:
                db.execute("INSERT INTO member_workspaces (user_id, workspace_id) VALUES (?, ?)",
                           (user_id, wid))
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@router.post("/users/{user_id}/workspaces/remove")
def remove_user_workspace(user_id: str, req: dict, user=require_perm("member.manage")):
    workspace_id = req.get("workspace_id", "")
    if not workspace_id:
        raise HTTPException(400, "workspace_id 不能为空")
    db = get_db()
    try:
        db.execute("DELETE FROM member_workspaces WHERE user_id = ? AND workspace_id = ?",
                   (user_id, workspace_id))
        db.commit()
        return {"ok": True}
    finally:
        db.close()
