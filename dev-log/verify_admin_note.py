# -*- coding: utf-8 -*-
"""验证 admin_note 超管门禁 + approval_note 审批意见流。"""
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

def mint(username=None, user_id=None, extra_perms=None):
    db = sqlite3.connect(DB); db.row_factory = sqlite3.Row
    if user_id:
        u = db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    else:
        u = db.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
    assert u is not None
    perms = [r['permission'] for r in db.execute(
        "SELECT DISTINCT rp.permission FROM role_permissions rp JOIN user_roles ur ON ur.role_id=rp.role_id WHERE ur.user_id=?",
        (u['id'],)).fetchall()]
    if extra_perms:
        perms.extend(p for p in extra_perms if p not in perms)
    db.close()
    return pyjwt.encode({
        'sub': u['id'], 'username': u['username'], 'user_type': u['user_type'],
        'permissions': perms, 'roles': [], 'token_version': u['token_version'],
        'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=2),
    }, SECRET, algorithm='HS256'), dict(u)

# ── 准备：创建临时会员 + 临时普通管理员 ──
super_tok, _ = mint(username='admin')

uname = 'vnote_' + uuid.uuid4().hex[:6]
r, st = api('/api/users', 'POST', {
    'username': uname, 'password': 'vnote-pass-2026', 'display_name': '备注验证会员', 'user_type': 'member',
}, super_tok)
member_id = r.get('id') or (r.get('user') or {}).get('id')
check('创建测试会员', st == 200 and member_id, r)

aname = 'vadm_' + uuid.uuid4().hex[:6]
r, st = api('/api/users', 'POST', {
    'username': aname, 'password': 'vadm-pass-2026', 'display_name': '普通管理员', 'user_type': 'admin',
}, super_tok)
admin2_id = r.get('id') or (r.get('user') or {}).get('id')
check('创建普通管理员', st == 200 and admin2_id, r)
# 普通管理员 token：带 member.manage 但 username != admin
admin2_tok, _ = mint(user_id=admin2_id, extra_perms=['member.manage'])

# ── 1. 超管写 admin_note ──
r, st = api(f'/api/users/{member_id}', 'PUT', {'admin_note': '某学校李老师'}, super_tok)
check('超管写备注 200', st == 200 and r.get('admin_note') == '某学校李老师', (st, r.get('admin_note')))

# ── 2. 超管 list_users 能看到 ──
r, st = api(f'/api/users?user_type=member&search={uname}', token=super_tok)
u = next((x for x in r.get('users', []) if x['id'] == member_id), None)
check('超管列表含备注', u is not None and u.get('admin_note') == '某学校李老师', u and u.get('admin_note'))

# ── 3. 普通管理员看不到 / 改不了 ──
r, st = api(f'/api/users?user_type=member&search={uname}', token=admin2_tok)
u = next((x for x in r.get('users', []) if x['id'] == member_id), None)
check('普通管理员列表无备注字段', u is not None and 'admin_note' not in u, u and list(u.keys()))
r, st = api(f'/api/users/{member_id}', token=admin2_tok)
check('普通管理员详情无备注字段', st == 200 and 'admin_note' not in r, st)
r, st = api(f'/api/users/{member_id}', 'PUT', {'admin_note': '越权写入'}, admin2_tok)
check('普通管理员改备注 403', st == 403, st)

# ── 4. 会员本人 /api/auth/me 无备注 ──
member_tok, _ = mint(user_id=member_id)
r, st = api('/api/auth/me', token=member_tok)
body = json.dumps(r, ensure_ascii=False)
check('会员 /me 不含 admin_note', st == 200 and 'admin_note' not in body, st)

# ── 5. 审批意见：拒绝原因写入 approval_note ──
db = sqlite3.connect(DB)
db.execute("UPDATE users SET is_approved=0 WHERE id=?", (member_id,))
db.commit(); db.close()
r, st = api(f'/api/members/{member_id}/reject', 'PUT', {'reason': '资料不全，请补充'}, super_tok)
check('拒绝成功', st == 200 and r.get('ok'), (st, r))
r, st = api(f'/api/users?user_type=member&status=rejected&search={uname}', token=super_tok)
u = next((x for x in r.get('users', []) if x['id'] == member_id), None)
check('已拒绝列表含审批意见', u is not None and u.get('approval_note') == '资料不全，请补充', u and u.get('approval_note'))

# ── 6. 审批意见：通过 note 写入 approval_note ──
db = sqlite3.connect(DB)
db.execute("UPDATE users SET is_approved=0 WHERE id=?", (member_id,))
db.commit(); db.close()
r, st = api(f'/api/members/{member_id}/approve', 'PUT', {'duration_days': 7, 'note': '电话核实通过'}, super_tok)
check('通过成功', st == 200 and r.get('ok'), (st, r))
r, st = api(f'/api/users?user_type=member&status=approved&search={uname}', token=super_tok)
u = next((x for x in r.get('users', []) if x['id'] == member_id), None)
check('已通过列表含审批意见', u is not None and u.get('approval_note') == '电话核实通过', u and u.get('approval_note'))

# ── 清理 ──
for uid in (member_id, admin2_id):
    if uid:
        api(f'/api/users/{uid}', 'DELETE', token=super_tok)
print()
print('ALL PASS' if not failures else f'{len(failures)} FAILED: {failures}')
sys.exit(1 if failures else 0)
