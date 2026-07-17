# -*- coding: utf-8 -*-
"""下载权限修复验收：试用会员（无 stage5.download）积分解锁后可下载
1. 试用会员解锁 is_downloadable=1 明细 → download-selected/download-all/单文件 全通
2. 未解锁 → 402 提示先解锁
3. is_downloadable=0 明细：无 stage5.download → 403；有 → 200（原行为保留）
"""
import sys, json, sqlite3, datetime, os, urllib.request, urllib.error, uuid
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

def api(path, method='GET', body=None, token=None, raw=False):
    req = urllib.request.Request(BASE + path, method=method)
    if token:
        req.add_header('Authorization', 'Bearer ' + token)
    data = None
    if body is not None:
        req.add_header('Content-Type', 'application/json')
        data = json.dumps(body).encode('utf-8')
    try:
        with urllib.request.urlopen(req, data) as r:
            content = r.read()
            if raw:
                return content, r.status
            try:
                return json.loads(content.decode('utf-8')), r.status
            except Exception:
                return {'len': len(content)}, r.status
    except urllib.error.HTTPError as e:
        rawb = e.read().decode('utf-8', errors='replace')
        try:
            return json.loads(rawb or '{}'), e.code
        except Exception:
            return {'raw': rawb[:200]}, e.code

def mint(user_id, perms):
    db = sqlite3.connect(DB); db.row_factory = sqlite3.Row
    u = db.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
    db.close()
    return pyjwt.encode({
        'sub': u['id'], 'user_id': u['id'], 'username': u['username'], 'user_type': u['user_type'],
        'permissions': perms, 'roles': [], 'token_version': u['token_version'],
        'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=2),
    }, SECRET, algorithm='HS256')

dbc = sqlite3.connect(DB); dbc.row_factory = sqlite3.Row
cleanup_users, cleanup_ws, cleanup_proj = [], [], []

# ── 准备：试用会员（无 stage5.download）+ 角色绑定工作区 + 两个明细 ──
trial_role = dbc.execute("SELECT id FROM roles WHERE name='试用会员'").fetchone()

u1 = 'dlt_' + uuid.uuid4().hex[:6]
r, st = api('/api/member/register', 'POST', {
    'username': u1, 'password': 'dlt-pass-2026', 'phone': '13800003333', 'plan_type': 'trial'})
uid = dbc.execute("SELECT id FROM users WHERE username=?", (u1,)).fetchone()['id']
cleanup_users.append(uid)
# 充值积分供解锁
dbc.execute("UPDATE user_points SET balance_deci=1000 WHERE user_id=?", (uid,))

wid = 'dltws' + uuid.uuid4().hex[:7]
dbc.execute("INSERT INTO workspaces (id, name, description, logo, status, created_by) VALUES (?, 'dlt-ws', '', '', 'draft', NULL)", (wid,))
dbc.execute("INSERT OR IGNORE INTO workspace_roles (workspace_id, role_id) VALUES (?, ?)", (wid, trial_role['id']))
cleanup_ws.append(wid)

def mkproj(name, downloadable):
    pid = 'dltp' + uuid.uuid4().hex[:8]
    pdir = os.path.join(r'd:\YISHAOAGENT\backend\data\projects', pid)
    os.makedirs(pdir, exist_ok=True)
    with open(os.path.join(pdir, 'test.txt'), 'w', encoding='utf-8') as f:
        f.write('dlt test file')
    dbc.execute(
        "INSERT INTO projects (id, name, workspace_id, is_downloadable, point_cost_deci, download_count, storage_path) VALUES (?, ?, ?, ?, 50, 0, ?)",
        (pid, name, wid, downloadable, pdir))
    cleanup_proj.append(pid)
    return pid

p_dl = mkproj('dlt-可下载明细', 1)
p_no = mkproj('dlt-不可下载明细', 0)
dbc.commit()

trial_tok = mint(uid, ['stage1.view', 'stage2.view', 'stage3.view', 'stage4.view', 'stage5.view'])
paid_tok = mint(uid, ['stage1.view', 'stage5.view', 'stage5.download'])

FILES = [{'filename': 'test.txt', 'download_url': '', 'display_name': 'test.txt'}]

# ── 1. 未解锁 → 402 ──
r, st = api(f'/api/projects/{p_dl}/download-selected', 'POST', {'files': FILES}, trial_tok)
check('未解锁 download-selected → 402', st == 402, (st, r))
r, st = api(f'/api/projects/{p_dl}/download-all', token=trial_tok)
check('未解锁 download-all → 402', st == 402, (st, r))

# ── 2. 解锁后全通（试用会员无 stage5.download） ──
r, st = api('/api/member/unlock-projects', 'POST', {'project_ids': [p_dl]}, trial_tok)
check('解锁成功', st == 200, (st, r))
r, st = api(f'/api/projects/{p_dl}/download-selected', 'POST', {'files': FILES}, trial_tok, raw=True)
check('解锁后 download-selected(一键下载多文件) → 200 zip', st == 200 and len(r) > 50, (st,))
r, st = api(f'/api/projects/{p_dl}/download-all', token=trial_tok, raw=True)
check('解锁后 download-all → 200 zip', st == 200 and len(r) > 50, (st,))
r, st = api(f'/api/download/test.txt?project_id={p_dl}&token={trial_tok}', raw=True)
check('解锁后单文件 /api/download → 200', st == 200 and b'dlt test file' in r, (st,))
bal = dbc.execute("SELECT balance_deci FROM user_points WHERE user_id=?", (uid,)).fetchone()['balance_deci']
check('只扣一次解锁积分(1000-50=950)', bal == 950, bal)

# ── 3. 不可下载明细：无 stage5.download → 403；有 → 200 ──
r, st = api(f'/api/projects/{p_no}/download-selected', 'POST', {'files': FILES}, trial_tok)
check('不可下载明细 无download权限 → 403', st == 403, (st, r))
r, st = api(f'/api/projects/{p_no}/download-all', token=paid_tok, raw=True)
check('不可下载明细 有download权限 → 200(原行为)', st == 200, (st,))

# ── 清理 ──
import shutil
for pid in cleanup_proj:
    dbc.execute("DELETE FROM project_unlocks WHERE project_id=?", (pid,))
    dbc.execute("DELETE FROM download_logs WHERE project_id=?", (pid,))
    dbc.execute("DELETE FROM projects WHERE id=?", (pid,))
    shutil.rmtree(os.path.join(r'd:\YISHAOAGENT\backend\data\projects', pid), ignore_errors=True)
dbc.execute("DELETE FROM workspace_roles WHERE workspace_id=?", (wid,))
dbc.execute("DELETE FROM workspaces WHERE id=?", (wid,))
for u in cleanup_users:
    for t, col in [('points_transactions', 'user_id'), ('user_points', 'user_id'), ('user_roles', 'user_id'),
                   ('audit_logs', 'user_id'), ('users', 'id')]:
        try:
            dbc.execute(f"DELETE FROM {t} WHERE {col}=?", (u,))
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
