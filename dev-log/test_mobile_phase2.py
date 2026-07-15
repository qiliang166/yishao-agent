# -*- coding: utf-8 -*-
"""手机版第二期回归：管理端 4 Tab / 个人中心 / 续费全链路 / A2HS / 第一期回归。
使用临时测试会员，测后删除并恢复套餐设置。"""
import sys, json, sqlite3, datetime, urllib.request, urllib.error
sys.stdout.reconfigure(encoding='utf-8')

import jwt as pyjwt
from playwright.sync_api import sync_playwright

DB = r'd:\YISHAOAGENT\backend\data\yishao.db'
SECRET = 'yishao-agent-jwt-secret-2026'
BASE = 'http://127.0.0.1:8766'
TEST_USER = 'mtest_phase2'
TEST_PASS = 'mtest-pass-2026'

failures = []

def check(name, ok, detail=''):
    print('[%s] %s%s' % ('PASS' if ok else 'FAIL', name, (' — ' + str(detail)) if detail else ''))
    if not ok:
        failures.append(name + (': ' + str(detail) if detail else ''))

def mint_token(user_row_filter):
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    u = db.execute("SELECT * FROM users WHERE %s LIMIT 1" % user_row_filter).fetchone()
    assert u is not None, 'user not found: ' + user_row_filter
    perms = [r['permission'] for r in db.execute(
        "SELECT DISTINCT rp.permission FROM role_permissions rp JOIN user_roles ur ON ur.role_id=rp.role_id WHERE ur.user_id=?",
        (u['id'],)).fetchall()]
    if u['user_type'] == 'admin' and 'project.view_all' not in perms:
        perms.append('project.view_all')
    roles = [r['name'] for r in db.execute(
        "SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=?",
        (u['id'],)).fetchall()]
    db.close()
    tok = pyjwt.encode({
        'sub': u['id'], 'username': u['username'], 'user_type': u['user_type'],
        'permissions': perms, 'roles': roles, 'token_version': u['token_version'],
        'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=2),
    }, SECRET, algorithm='HS256')
    return tok, dict(u)

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
        return json.loads(e.read().decode('utf-8') or '{}'), e.code

def goto(page, hash_path):
    page.goto(BASE + '/mobile/index.html#' + hash_path)
    page.wait_for_timeout(1800)

def main():
    admin_token, admin_row = mint_token("user_type='admin' ORDER BY created_at")

    # ── 备份套餐设置 ──
    settings, _ = api('/api/settings')
    s0 = settings.get('settings') or {}
    orig_plan = s0.get('member_plan')
    print('原套餐设置已备份:', bool(orig_plan))

    # ── 清理可能残留的同名测试号，再创建 ──
    users, _ = api('/api/users?user_type=member&search=' + TEST_USER, token=admin_token)
    for u in (users.get('users') or []):
        if u.get('username') == TEST_USER:
            api('/api/users/' + u['id'], method='DELETE', token=admin_token)
    created, code = api('/api/users', method='POST', token=admin_token, body={
        'username': TEST_USER, 'password': TEST_PASS,
        'display_name': '第二期测试会员', 'user_type': 'member'})
    assert code == 200, 'create test member failed: %s %s' % (code, created)
    users, _ = api('/api/users?user_type=member&search=' + TEST_USER, token=admin_token)
    target = next((u for u in (users.get('users') or []) if u.get('username') == TEST_USER), None)
    assert target is not None, 'test member not found after create'
    uid = target['id']
    print('测试会员已创建:', uid)

    try:
        run_ui_tests(admin_token, uid, s0)
    finally:
        # ── 清理：删测试号 + 恢复套餐 ──
        api('/api/users/' + uid, method='DELETE', token=admin_token)
        if orig_plan:
            api('/api/settings', method='PUT', token=admin_token, body={'member_plan': orig_plan})
        print('清理完成：测试会员已删除，套餐已恢复')

    print()
    if failures:
        print('FAILED: %d issue(s)' % len(failures))
        for x in failures:
            print(' -', x)
        sys.exit(1)
    print('ALL PASS')

def run_ui_tests(admin_token, uid, s0):
    with sync_playwright() as pw:
        browser = pw.chromium.launch()

        # ═══ 管理员视角 ═══
        ctx = browser.new_context(viewport={'width': 375, 'height': 700})
        ctx.add_init_script("localStorage.setItem('auth_token', %s)" % json.dumps(admin_token))
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))

        # 1. A2HS：manifest 注入 + 引导条
        goto(page, '/')
        page.wait_for_timeout(1200)
        manifest_ok = page.evaluate("""async () => {
            const l = document.querySelector('link[rel=manifest]');
            if (!l) return null;
            const r = await fetch(l.href); const m = await r.json();
            return { name: m.name, display: m.display, hasStart: !!m.start_url };
        }""")
        check('A2HS manifest 注入', manifest_ok is not None and manifest_ok.get('display') == 'standalone', manifest_ok)
        banner = page.evaluate("() => !!document.querySelector('.m-a2hs-banner')")
        check('A2HS 引导条显示', banner)
        page.evaluate("() => document.querySelector('.m-a2hs-banner .ghost').click()")
        page.wait_for_timeout(300)
        gone = page.evaluate("() => !document.querySelector('.m-a2hs-banner') && localStorage.getItem('a2hs_dismissed') === '1'")
        check('引导条 × 后消失且记住', gone)

        # 2. 首页入口
        entries = page.evaluate("() => Array.from(document.querySelectorAll('.m-entry-card')).map(e => e.textContent)")
        check('管理员首页两个入口', entries is not None and len(entries) == 2, entries)

        # 3. /admin 4 Tab
        goto(page, '/admin')
        tabs = page.evaluate("() => Array.from(document.querySelectorAll('.m-tab')).map(e => e.textContent)")
        check('4 个 Tab 渲染', tabs is not None and len(tabs) == 4, tabs)

        # 4. 会员列表含测试号 + 停用/启用
        row_sel = """() => {
            const rows = Array.from(document.querySelectorAll('.m-user-row'));
            const r = rows.find(x => x.textContent.includes('mtest_phase2'));
            if (!r) return null;
            return { text: r.textContent, idx: rows.indexOf(r) };
        }"""
        found = page.evaluate(row_sel)
        check('会员列表含测试号', found is not None, found and found['text'][:60])
        if found is not None:
            page.once('dialog', lambda d: d.accept())
            page.evaluate("(i) => document.querySelectorAll('.m-user-row')[i].querySelector('.m-row-actions button').click()", found['idx'])
            page.wait_for_timeout(1500)
            u2, _ = api('/api/users?user_type=member&search=' + TEST_USER, token=admin_token)
            t2 = next((u for u in (u2.get('users') or []) if u['id'] == uid), None)
            check('停用生效', t2 is not None and t2.get('is_active') == 0, t2 and t2.get('is_active'))
            found = page.evaluate(row_sel)
            page.once('dialog', lambda d: d.accept())
            page.evaluate("(i) => document.querySelectorAll('.m-user-row')[i].querySelector('.m-row-actions button').click()", found['idx'])
            page.wait_for_timeout(1500)
            u3, _ = api('/api/users?user_type=member&search=' + TEST_USER, token=admin_token)
            t3 = next((u for u in (u3.get('users') or []) if u['id'] == uid), None)
            check('启用恢复', t3 is not None and t3.get('is_active') == 1, t3 and t3.get('is_active'))

        # 5. 录入续期
        found = page.evaluate(row_sel)
        if found is not None:
            page.evaluate("(i) => { const btns = document.querySelectorAll('.m-user-row')[i].querySelectorAll('.m-row-actions button'); btns[btns.length-1].click() }", found['idx'])
            page.wait_for_timeout(500)
            sheet = page.evaluate("() => !!document.querySelector('.m-sheet')")
            check('续期弹层打开', sheet)
            page.evaluate("""() => {
                const inputs = document.querySelectorAll('.m-sheet input.m-input');
                const set = (el, v) => { const p = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; p.call(el, v); el.dispatchEvent(new Event('input', {bubbles:true})) };
                set(inputs[1], '0.01'); set(inputs[2], '30');
            }""")
            page.evaluate("() => { const b = Array.from(document.querySelectorAll('.m-sheet-actions button')).find(x => x.textContent.includes('\\u786e\\u8ba4')); b.click() }")
            page.wait_for_timeout(2000)
            u4, _ = api('/api/users?user_type=member&search=' + TEST_USER, token=admin_token)
            t4 = next((u for u in (u4.get('users') or []) if u['id'] == uid), None)
            check('录入续期后有到期时间', t4 is not None and bool(t4.get('expires_at')), t4 and t4.get('expires_at'))

        ctx.close()

        # ═══ 会员视角：/me + 无管理入口 + /admin 无权限 ═══
        member_token, _ = mint_token("username='%s'" % TEST_USER)
        ctx2 = browser.new_context(viewport={'width': 375, 'height': 700})
        ctx2.add_init_script(
            "localStorage.setItem('auth_token', %s); localStorage.setItem('a2hs_dismissed','1')"
            % json.dumps(member_token))
        page2 = ctx2.new_page()
        goto(page2, '/')
        entries2 = page2.evaluate("() => Array.from(document.querySelectorAll('.m-entry-card')).map(e => e.textContent)")
        check('会员首页只有个人中心入口', entries2 is not None and len(entries2) == 1, entries2)
        goto(page2, '/me')
        kv = page2.evaluate("() => Array.from(document.querySelectorAll('.m-kv')).map(e => e.textContent).join('|')")
        check('/me 显示到期时间', kv is not None and ('会员到期' in kv), kv and kv[:80])
        renew_btn = page2.evaluate("() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent === '\\u4f1a\\u5458\\u7eed\\u8d39'); return !!b }")
        check('/me 有续费按钮', renew_btn)
        goto(page2, '/admin')
        noperm = page2.evaluate("() => document.body.textContent.includes('\\u65e0\\u6743\\u9650')")
        check('会员访问 /admin 显示无权限', noperm)
        ctx2.close()

        # ═══ 续费全链路（公开页，无 token） ═══
        ctx3 = browser.new_context(viewport={'width': 375, 'height': 700})
        ctx3.add_init_script("localStorage.setItem('a2hs_dismissed','1')")
        page3 = ctx3.new_page()

        def renew_step1(order_label):
            """走到续费第 2 步（验证身份后的付款页），返回是否成功。"""
            # 先跳离 /renew 再进入：hash 相同不会触发导航，MRenew 会停留在上次的成功页
            page3.goto(BASE + '/mobile/index.html#/member')
            page3.wait_for_timeout(600)
            goto(page3, '/renew?u=' + TEST_USER)
            pre = page3.evaluate("() => { const i = document.querySelector('.m-field input.m-input'); return i ? i.value : '' }")
            check('续费页用户名预填(%s)' % order_label, pre == TEST_USER, pre)
            page3.evaluate("""(pw) => {
                const set = (el, v) => { const p = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; p.call(el, v); el.dispatchEvent(new Event('input', {bubbles:true})) };
                const inputs = document.querySelectorAll('input.m-input');
                set(inputs[1], pw);
            }""", TEST_PASS)
            page3.evaluate("() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent === '\\u4e0b\\u4e00\\u6b65'); b.click() }")
            page3.wait_for_timeout(800)

        def submit_renew(order_no):
            renew_step1(order_no)
            page3.evaluate("""(ref) => {
                const set = (el, v) => { const p = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; p.call(el, v); el.dispatchEvent(new Event('input', {bubbles:true})) };
                const inputs = Array.from(document.querySelectorAll('input.m-input'));
                set(inputs[inputs.length - 1], ref);
            }""", order_no)
            page3.evaluate("() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('\\u63d0\\u4ea4\\u7eed\\u8d39')); b.click() }")
            page3.wait_for_timeout(2500)
            ok = page3.evaluate("() => document.body.textContent.includes('\\u5df2\\u63d0\\u4ea4')")
            check('续费提交成功(%s)' % order_no, ok)

        submit_renew('TEST-ORDER-001')

        # 管理员待审批出现 → 通过
        admin_token2, _ = mint_token("user_type='admin' ORDER BY created_at")
        ctx4 = browser.new_context(viewport={'width': 375, 'height': 700})
        ctx4.add_init_script(
            "localStorage.setItem('auth_token', %s); localStorage.setItem('a2hs_dismissed','1')"
            % json.dumps(admin_token2))
        page4 = ctx4.new_page()

        def open_pending_tab():
            # reload 强制重挂载：同 hash goto 不触发导航，同 tab 点击不触发重新加载
            goto(page4, '/admin')
            page4.reload()
            page4.wait_for_timeout(1800)
            page4.evaluate("() => { const t = Array.from(document.querySelectorAll('.m-tab')).find(x => x.textContent.includes('\\u5f85\\u5ba1\\u6279')); t.click() }")
            page4.wait_for_timeout(1800)

        open_pending_tab()
        prow = page4.evaluate("""() => {
            const rows = Array.from(document.querySelectorAll('.m-user-row'));
            const r = rows.find(x => x.textContent.includes('mtest_phase2'));
            return r ? { text: r.textContent, idx: rows.indexOf(r) } : null;
        }""")
        check('待审批列表出现续费申请', prow is not None and 'TEST-ORDER-001' in (prow['text'] if prow else ''), prow and prow['text'][:100])
        if prow is not None:
            page4.evaluate("(i) => { const btns = document.querySelectorAll('.m-user-row')[i].querySelectorAll('.m-row-actions button'); btns[0].click() }", prow['idx'])
            page4.wait_for_timeout(500)
            page4.evaluate("() => { const b = Array.from(document.querySelectorAll('.m-sheet-actions button')).find(x => x.textContent.includes('\\u786e\\u8ba4\\u901a\\u8fc7')); b.click() }")
            page4.wait_for_timeout(2000)
            u5, _ = api('/api/users?user_type=member&search=' + TEST_USER, token=admin_token2)
            t5 = next((u for u in (u5.get('users') or []) if u['id'] == uid), None)
            check('审批通过后 is_approved=1', t5 is not None and t5.get('is_approved') == 1, t5 and t5.get('is_approved'))

        # 第二次续费 → 拒绝
        submit_renew('TEST-ORDER-002')
        open_pending_tab()
        prow2 = page4.evaluate("""() => {
            const rows = Array.from(document.querySelectorAll('.m-user-row'));
            const r = rows.find(x => x.textContent.includes('mtest_phase2'));
            return r ? { idx: Array.from(document.querySelectorAll('.m-user-row')).indexOf(r) } : null;
        }""")
        if prow2 is not None:
            page4.evaluate("(i) => { const btns = document.querySelectorAll('.m-user-row')[i].querySelectorAll('.m-row-actions button'); btns[1].click() }", prow2['idx'])
            page4.wait_for_timeout(500)
            page4.evaluate("() => { const b = Array.from(document.querySelectorAll('.m-sheet-actions button')).find(x => x.textContent.includes('\\u786e\\u8ba4\\u62d2\\u7edd')); b.click() }")
            page4.wait_for_timeout(2000)
            gone2 = page4.evaluate("""() => !Array.from(document.querySelectorAll('.m-user-row')).some(x => x.textContent.includes('mtest_phase2'))""")
            check('拒绝后从待审批消失', gone2)
        else:
            check('第二次续费进入待审批', False)

        # ═══ 套餐 Tab：改价 → 续费页联动 → 恢复 ═══
        page4.evaluate("() => { const t = Array.from(document.querySelectorAll('.m-tab')).find(x => x.textContent.includes('\\u5957\\u9910')); if (t) t.click() }")
        page4.wait_for_timeout(1500)
        has_plan_tab = page4.evaluate("() => Array.from(document.querySelectorAll('.m-section-title')).some(x => x.textContent.includes('\\u6807\\u51c6\\u5957\\u9910'))")
        check('套餐 Tab 渲染', has_plan_tab)
        if has_plan_tab:
            page4.evaluate("""() => {
                const set = (el, v) => { const p = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; p.call(el, v); el.dispatchEvent(new Event('input', {bubbles:true})) };
                const priceInput = document.querySelectorAll('.m-field-inline input.m-input')[0];
                set(priceInput, '99.99');
            }""")
            page4.evaluate("() => { const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent.includes('\\u4fdd\\u5b58\\u5957\\u9910')); b.click() }")
            page4.wait_for_timeout(1500)
            s_after, _ = api('/api/settings')
            plan_after = json.loads((s_after.get('settings') or {}).get('member_plan') or '{}')
            check('套餐保存后 amount_cents=9999', (plan_after.get('quarterly') or {}).get('amount_cents') == 9999,
                  (plan_after.get('quarterly') or {}).get('amount_cents'))
            # 价格显示在续费第 2 步（付款页）
            renew_step1('改价联动')
            new_price = page3.evaluate("() => document.body.textContent.includes('99.99')")
            check('续费页显示新价格 99.99', new_price)

        # ═══ 第一期回归：工作区列表 ═══
        goto(page4, '/')
        reg = page4.evaluate("() => document.querySelectorAll('.m-card').length > 0 || document.body.textContent.includes('\\u6682\\u65e0\\u5de5\\u4f5c\\u533a')")
        check('回归：首页工作区列表正常', reg)

        if errors:
            print('[WARN] page errors:', errors[:5])
        browser.close()

if __name__ == '__main__':
    main()
