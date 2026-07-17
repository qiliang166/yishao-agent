# -*- coding: utf-8 -*-
"""管理后台四项改进验收：
Q1 提示词应用归属限制 + workspaces mine 参数
Q2 跨人复制配置来源（后端已支持，接口级验证）
Q3 下载统计 creator_name / points_earned_deci
Q4 新人礼包注册即发（审批不重复发）
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

cleanup = {'users': [], 'workspaces': []}
dbc = sqlite3.connect(DB); dbc.row_factory = sqlite3.Row

# ── 准备 ──
super_tok, super_u = mint(username='admin')

aname = 'a4t_adm_' + uuid.uuid4().hex[:6]
r, st = api('/api/users', 'POST', {
    'username': aname, 'password': 'a4t-pass-2026', 'display_name': '四项验收普通管理员', 'user_type': 'admin',
}, super_tok)
assert st == 200, r
adm_id = r.get('id') or r.get('user', {}).get('id')
if not adm_id:
    adm_id = dbc.execute("SELECT id FROM users WHERE username=?", (aname,)).fetchone()['id']
cleanup['users'].append(adm_id)
adm_tok, _ = mint(user_id=adm_id, extra_perms=['project.create', 'member.manage'])

# 工作区：A 建一个、超管建一个、DB 直插一个 created_by=NULL 的存量工作区
r, st = api('/api/workspaces', 'POST', {'name': 'a4t-A的工作区'}, adm_tok)
assert st == 200, r
ws_a = r.get('id') or r.get('workspace', {}).get('id')
if not ws_a:
    ws_a = dbc.execute("SELECT id FROM workspaces WHERE name='a4t-A的工作区'").fetchone()['id']
cleanup['workspaces'].append(ws_a)

r, st = api('/api/workspaces', 'POST', {'name': 'a4t-超管的工作区'}, super_tok)
assert st == 200, r
ws_s = r.get('id') or dbc.execute("SELECT id FROM workspaces WHERE name='a4t-超管的工作区'").fetchone()['id']
cleanup['workspaces'].append(ws_s)

ws_l = 'a4tlegacy' + uuid.uuid4().hex[:4]
dbc.execute("INSERT INTO workspaces (id, name, description, logo, status, created_by) VALUES (?, 'a4t-存量NULL工作区', '', '', 'draft', NULL)", (ws_l,))
dbc.commit()
cleanup['workspaces'].append(ws_l)

row = dbc.execute("SELECT created_by FROM workspaces WHERE id=?", (ws_a,)).fetchone()
check('工作区 created_by 写入创建者', row['created_by'] == adm_id, row['created_by'])

# ── Q1a: apply 归属校验 ──
configs = {
    'column_configs': [
        {'slot': s, 'label': 'L-' + s, 'prompt': 'p-' + s, 'skill': 'sk-' + s}
        for s in ['c1_text', 'c1_video', 'c1_file', 'c2_sop', 'c2_dao', 'c2_yanxi', 'c3', 'c4', 'c5']
    ],
    'speech_configs': [{'label': l, 'prompt': 'p', 'skill': 's'} for l in ['文档演讲', '分析演讲', '综合演讲']],
    'tts_configs': [{'label': l, 'prompt': 'p', 'skill': 's'} for l in ['文档语音', '分析语音', '综合语音']],
    'core_prompt_configs': [{'prompt_key': f'k{i}', 'label': f'核心{i}', 'content': 'c'} for i in range(25)],
}

r, st = api('/api/prompt-studio/apply', 'POST', {'workspace_id': ws_a, 'configs': configs}, adm_tok)
check('普通管理员 apply 自己的工作区 → 200', st == 200, (st, r))
r, st = api('/api/prompt-studio/apply', 'POST', {'workspace_id': ws_s, 'configs': configs}, adm_tok)
check('普通管理员 apply 超管的工作区 → 403', st == 403, (st, r))
r, st = api('/api/prompt-studio/apply', 'POST', {'workspace_id': ws_l, 'configs': configs}, adm_tok)
check('普通管理员 apply 存量NULL工作区 → 403', st == 403, (st, r))
r, st = api('/api/prompt-studio/apply', 'POST', {'workspace_id': ws_s, 'configs': configs}, super_tok)
check('超管 apply 自己的工作区 → 200', st == 200, (st, r))
r, st = api('/api/prompt-studio/apply', 'POST', {'workspace_id': ws_a, 'configs': configs}, super_tok)
check('超管 apply 别人的工作区 → 200', st == 200, (st, r))
r, st = api('/api/prompt-studio/apply', 'POST', {'workspace_id': ws_l, 'configs': configs}, super_tok)
check('超管 apply 存量NULL工作区 → 200', st == 200, (st, r))

# ── Q1b: mine 参数 ──
r, st = api('/api/workspaces?mine=1&page=1&page_size=100', token=adm_tok)
ids = [w['id'] for w in r.get('workspaces', [])]
check('普通管理员 mine=1 只见自己的', st == 200 and ids == [ws_a], ids)
r, st = api('/api/workspaces?page=1&page_size=200', token=adm_tok)
ids = [w['id'] for w in r.get('workspaces', [])]
check('不带 mine 行为不变（全量）', st == 200 and ws_s in ids and ws_a in ids and ws_l in ids, len(ids))
total_all = r.get('total')
r, st = api('/api/workspaces?mine=1&page=1&page_size=200', token=super_tok)
check('超管 mine=1 仍见全部', st == 200 and r.get('total') == total_all, (r.get('total'), total_all))

# ── Q2: 跨人复制配置来源（接口级） ──
r, st = api('/api/workspaces', 'POST', {'name': 'a4t-复制自超管', 'source_workspace_id': ws_s}, adm_tok)
ws_c = r.get('id') or dbc.execute("SELECT id FROM workspaces WHERE name='a4t-复制自超管'").fetchone()['id']
cleanup['workspaces'].append(ws_c)
n_cols = dbc.execute("SELECT COUNT(*) c FROM column_configs WHERE workspace_id=?", (ws_c,)).fetchone()['c']
check('Q2 普通管理员以超管工作区为复制来源 → 配置已复制', st == 200 and n_cols == 9, (st, n_cols))

# ── Q3: 下载统计字段 ──
r, st = api('/api/admin/stats/downloads/projects', token=super_tok)
projs = r.get('projects', [])
check('stats 接口 200 且含 creator_name/points_earned_deci 字段',
      st == 200 and (len(projs) == 0 or ('creator_name' in projs[0] and 'points_earned_deci' in projs[0])),
      (st, len(projs)))
ok_points = True
detail = 'no rows'
for p in projs[:20]:
    expect = dbc.execute("SELECT COALESCE(SUM(points_spent_deci),0) s FROM project_unlocks WHERE project_id=?",
                         (p['project_id'],)).fetchone()['s']
    if p['points_earned_deci'] != expect:
        ok_points = False
        detail = (p['project_id'], p['points_earned_deci'], expect)
        break
    detail = 'checked %d rows' % min(len(projs), 20)
check('points_earned_deci 与 project_unlocks 手算一致', ok_points, detail)
if projs:
    nulls = [p for p in projs if not p['creator_name']]
    check('creator_name 无空值（NULL归超级管理员）', len(nulls) == 0, len(nulls))

# ── Q4: 新人礼包注册即发 ──
old_bonus = dbc.execute("SELECT value FROM settings WHERE key='new_user_points_deci'").fetchone()
dbc.execute("INSERT INTO settings (key, value) VALUES ('new_user_points_deci', '50') "
            "ON CONFLICT(key) DO UPDATE SET value='50'")
dbc.commit()

mname = 'a4t_mem_' + uuid.uuid4().hex[:6]
r, st = api('/api/member/register', 'POST', {
    'username': mname, 'password': 'a4t-pass-2026', 'phone': '13800001111', 'plan_type': 'trial'})
mrow = dbc.execute("SELECT id FROM users WHERE username=?", (mname,)).fetchone()
check('trial 注册成功', st == 200 and mrow is not None, (st, r))
mem_id = mrow['id']
cleanup['users'].append(mem_id)
bal = dbc.execute("SELECT balance_deci FROM user_points WHERE user_id=?", (mem_id,)).fetchone()
check('注册即有新人礼包积分 50 deci', bal is not None and bal['balance_deci'] == 50, dict(bal) if bal else None)
txs = dbc.execute("SELECT COUNT(*) c FROM points_transactions WHERE user_id=? AND type='signup_bonus'", (mem_id,)).fetchone()['c']
check('signup_bonus 流水 1 条', txs == 1, txs)

# 审批不重复发：把该用户置回待审再走审批端点
dbc.execute("UPDATE users SET is_approved=0 WHERE id=?", (mem_id,))
dbc.commit()
r, st = api('/api/members/%s/approve' % mem_id, 'PUT', {'duration_days': 30}, super_tok)
txs2 = dbc.execute("SELECT COUNT(*) c FROM points_transactions WHERE user_id=? AND type='signup_bonus'", (mem_id,)).fetchone()['c']
bal2 = dbc.execute("SELECT balance_deci FROM user_points WHERE user_id=?", (mem_id,)).fetchone()['balance_deci']
check('审批后 signup_bonus 仍只 1 条（不重复发）', st == 200 and txs2 == 1, (st, txs2))
check('余额仍 50 deci', bal2 == 50, bal2)

# ── 清理 ──
if old_bonus is None:
    dbc.execute("DELETE FROM settings WHERE key='new_user_points_deci'")
else:
    dbc.execute("UPDATE settings SET value=? WHERE key='new_user_points_deci'", (old_bonus['value'],))
for wid in cleanup['workspaces']:
    for t in ['column_configs', 'speech_configs', 'tts_configs', 'core_prompt_configs']:
        dbc.execute(f"DELETE FROM {t} WHERE workspace_id=?", (wid,))
    dbc.execute("DELETE FROM workspaces WHERE id=?", (wid,))
for uid in cleanup['users']:
    for t, col in [('points_transactions', 'user_id'), ('user_points', 'user_id'), ('user_roles', 'user_id'),
                   ('audit_logs', 'user_id'), ('users', 'id')]:
        try:
            dbc.execute(f"DELETE FROM {t} WHERE {col}=?", (uid,))
        except sqlite3.OperationalError:
            pass
dbc.commit()
dbc.close()

print()
print('FAILED: %d' % len(failures) if failures else 'ALL PASS (%d checks)' % 0)
if failures:
    for f in failures:
        print('  -', f)
    sys.exit(1)
