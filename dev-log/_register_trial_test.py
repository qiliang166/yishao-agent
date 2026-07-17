# -*- coding: utf-8 -*-
"""注册流程修复验收：
1. trial 注册 → 自动赋「试用会员」角色 + auth/me roles 非空 + 礼包按设置发放
2. 角色缺失时 get-or-create：临时改名角色再注册 → 角色被自动重建并赋上（验后恢复）
3. 注册后 member 能看到绑定了试用会员角色的工作区
"""
import sys, json, sqlite3, datetime, urllib.request, urllib.error, uuid
sys.stdout.reconfigure(encoding='utf-8')
import jwt as pyjwt

DB = r'd:\YISHAOAGENT\backend\data\yishao.db'
SECRET = 'yishao-agent-jwt-secret-2026'
BASE = 'http://127.0.0.1:8766'

failures = []
def check(name, ok, detail=''):
    print('[%s] %s%s' % ('PASS' if ok else 'FAIL', name, (' — ' + str(detail)) if detail else ''))
    if not ok:
        failures.append(name)

def api(path, method='GET', body=None, token=None):
    req = urllib.request.Request(BASE + path, method=method)
    if token:
        req.add_header('Authorization', 'Bearer ' + token)
    data = None
    if body is not None:
        req.add_header('Content-Type', 'application/json')
        data = json.dumps(body).encode('utf-8')
    try:
        with urllib.request.urlopen(req, data) as r:
            return json.loads(r.read().decode('utf-8')), r.status
    except urllib.error.HTTPError as e:
        raw = e.read().decode('utf-8', errors='replace')
        try:
            return json.loads(raw or '{}'), e.code
        except Exception:
            return {'raw': raw[:300]}, e.code

def mint(user_id):
    db = sqlite3.connect(DB); db.row_factory = sqlite3.Row
    u = db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    perms = [r['permission'] for r in db.execute(
        "SELECT DISTINCT rp.permission FROM role_permissions rp JOIN user_roles ur ON ur.role_id=rp.role_id WHERE ur.user_id=?",
        (u['id'],)).fetchall()]
    db.close()
    return pyjwt.encode({
        'sub': u['id'], 'user_id': u['id'], 'username': u['username'], 'user_type': u['user_type'],
        'permissions': perms, 'roles': [], 'token_version': u['token_version'],
        'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=2),
    }, SECRET, algorithm='HS256')

dbc = sqlite3.connect(DB); dbc.row_factory = sqlite3.Row
cleanup_users, cleanup_ws = [], []

old_bonus = dbc.execute("SELECT value FROM settings WHERE key='new_user_points_deci'").fetchone()
dbc.execute("INSERT INTO settings (key, value) VALUES ('new_user_points_deci', '100') "
            "ON CONFLICT(key) DO UPDATE SET value='100'")
dbc.commit()

def register(uname):
    r, st = api('/api/member/register', 'POST', {
        'username': uname, 'password': 'rt-pass-2026', 'phone': '13800002222', 'plan_type': 'trial'})
    row = dbc.execute("SELECT id FROM users WHERE username=?", (uname,)).fetchone()
    return st, r, (row['id'] if row else None)

def roles_of(uid):
    return [r['name'] for r in dbc.execute(
        "SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=?", (uid,)).fetchall()]

# ── 1. 正常注册：赋角色 + 礼包 ──
u1 = 'rt_a_' + uuid.uuid4().hex[:6]
st, r, uid1 = register(u1)
check('注册成功', st == 200 and uid1, (st, r))
cleanup_users.append(uid1)
check('注册即有「试用会员」角色', '试用会员' in roles_of(uid1), roles_of(uid1))
bal = dbc.execute("SELECT balance_deci FROM user_points WHERE user_id=?", (uid1,)).fetchone()
check('礼包按设置发放 100 deci', bal and bal['balance_deci'] == 100, dict(bal) if bal else None)
me, st = api('/api/auth/me', token=mint(uid1))
check('auth/me roles 非空（当前角色不再是 —）', st == 200 and me.get('roles'), me.get('roles'))

# ── 2. 角色缺失 → get-or-create 重建 ──
trial_role = dbc.execute("SELECT id FROM roles WHERE name='试用会员'").fetchone()
dbc.execute("UPDATE roles SET name='试用会员_验收改名' WHERE id=?", (trial_role['id'],))
dbc.commit()
u2 = 'rt_b_' + uuid.uuid4().hex[:6]
st, r, uid2 = register(u2)
cleanup_users.append(uid2)
rebuilt = dbc.execute("SELECT id FROM roles WHERE name='试用会员'").fetchone()
check('角色缺失时自动重建「试用会员」', st == 200 and rebuilt is not None and rebuilt['id'] != trial_role['id'],
      rebuilt['id'] if rebuilt else None)
check('新用户赋上重建的角色', '试用会员' in roles_of(uid2), roles_of(uid2))
if rebuilt:
    perms = [p['permission'] for p in dbc.execute(
        "SELECT permission FROM role_permissions WHERE role_id=?", (rebuilt['id'],)).fetchall()]
    check('重建角色带 5 项 view 权限', sorted(perms) == sorted(
        ['stage1.view', 'stage2.view', 'stage3.view', 'stage4.view', 'stage5.view']), perms)
# 恢复：删重建的角色及其关联，把原角色改回原名
if rebuilt:
    dbc.execute("UPDATE user_roles SET role_id=? WHERE role_id=?", (trial_role['id'], rebuilt['id']))
    dbc.execute("DELETE FROM role_permissions WHERE role_id=?", (rebuilt['id'],))
    dbc.execute("DELETE FROM roles WHERE id=?", (rebuilt['id'],))
dbc.execute("UPDATE roles SET name='试用会员' WHERE id=?", (trial_role['id'],))
dbc.commit()

# ── 3. 注册后可见绑定了试用会员角色的工作区 ──
wid = 'rtws' + uuid.uuid4().hex[:8]
dbc.execute("INSERT INTO workspaces (id, name, description, logo, status, created_by) VALUES (?, 'rt-试用可见工作区', '', '', 'draft', NULL)", (wid,))
dbc.execute("INSERT OR IGNORE INTO workspace_roles (workspace_id, role_id) VALUES (?, ?)", (wid, trial_role['id']))
dbc.commit()
cleanup_ws.append(wid)
ws, st = api('/api/workspaces?page=1&page_size=100', token=mint(uid1))
ids = [w['id'] for w in ws.get('workspaces', [])]
check('试用会员可见绑定角色的工作区', st == 200 and wid in ids, (st, ids))

# ── 清理 ──
if old_bonus is None:
    dbc.execute("DELETE FROM settings WHERE key='new_user_points_deci'")
else:
    dbc.execute("UPDATE settings SET value=? WHERE key='new_user_points_deci'", (old_bonus['value'],))
dbc.execute("DELETE FROM workspace_roles WHERE workspace_id IN (%s)" % ','.join('?'*len(cleanup_ws)), cleanup_ws)
dbc.execute("DELETE FROM workspaces WHERE id IN (%s)" % ','.join('?'*len(cleanup_ws)), cleanup_ws)
for uid in [u for u in cleanup_users if u]:
    for t, col in [('points_transactions', 'user_id'), ('user_points', 'user_id'), ('user_roles', 'user_id'),
                   ('audit_logs', 'user_id'), ('users', 'id')]:
        try:
            dbc.execute(f"DELETE FROM {t} WHERE {col}=?", (uid,))
        except sqlite3.OperationalError:
            pass
dbc.commit()
dbc.close()

print()
if failures:
    print('FAILED: %d' % len(failures))
    for f in failures:
        print('  -', f)
    sys.exit(1)
print('ALL PASS')
