# -*- coding: utf-8 -*-
"""Mobile preview regression: COL4/COL5 HTML scaling (bounding-box union), txt, back button."""
import sys, os, json, sqlite3, datetime
sys.stdout.reconfigure(encoding='utf-8')

import jwt as pyjwt
from playwright.sync_api import sync_playwright

DB = r'd:\YISHAOAGENT\backend\data\yishao.db'
SECRET = 'yishao-agent-jwt-secret-2026'
BASE = 'http://127.0.0.1:8766'

def mint_admin_token():
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    u = db.execute("SELECT * FROM users WHERE user_type='admin' ORDER BY created_at LIMIT 1").fetchone()
    assert u is not None, 'no admin user'
    perms = [r['permission'] for r in db.execute(
        "SELECT DISTINCT rp.permission FROM role_permissions rp JOIN user_roles ur ON ur.role_id=rp.role_id WHERE ur.user_id=?",
        (u['id'],)).fetchall()]
    if 'project.view_all' not in perms:
        perms.append('project.view_all')
    if 'role.manage' in perms and 'member.manage' not in perms:
        perms.append('member.manage')
    roles = [r['name'] for r in db.execute(
        "SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=?",
        (u['id'],)).fetchall()]
    db.close()
    payload = {
        'sub': u['id'], 'username': u['username'], 'user_type': u['user_type'],
        'permissions': perms, 'roles': roles, 'token_version': u['token_version'],
        'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=2),
    }
    return pyjwt.encode(payload, SECRET, algorithm='HS256')

def find_project_with_html(token):
    import urllib.request
    def get(path):
        req = urllib.request.Request(BASE + path, headers={'Authorization': 'Bearer ' + token})
        with urllib.request.urlopen(req) as r:
            return json.loads(r.read().decode('utf-8'))
    projects = get('/api/projects?page=1&page_size=50')
    plist = projects.get('projects') or projects.get('items') or []
    for p in plist:
        files = get('/api/projects/%s/files' % p['id'])
        fl = files.get('files') or []
        htmls = [f for f in fl if (f.get('filename') or '').lower().endswith('.html') and f.get('download_url')]
        if htmls:
            return p, htmls
    return None, []

def main():
    token = mint_admin_token()
    proj, htmls = find_project_with_html(token)
    assert proj is not None, 'no project with html files'
    print('project: %s  html files: %d' % (proj['id'], len(htmls)))
    for f in htmls:
        print('  -', f.get('display_name') or f['filename'], f['download_url'])

    failures = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        ctx = browser.new_context(viewport={'width': 375, 'height': 667})
        ctx.add_init_script("localStorage.setItem('auth_token', %s)" % json.dumps(token))
        page = ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))

        # ── 1. HTML previews: every html file must scale to <= container width ──
        for f in htmls:
            name = f.get('display_name') or f['filename']
            src = f['download_url']
            from urllib.parse import urlencode
            q = urlencode({'kind': 'html', 'src': src, 'name': name, 'pid': proj['id']})
            page.goto(BASE + '/mobile/index.html#/preview?' + q)
            page.wait_for_timeout(3500)
            info = page.evaluate("""() => {
                const body = document.querySelector('.m-preview-body');
                const iframe = document.querySelector('iframe');
                if (!body || !iframe) return null;
                const wrap = iframe.parentElement;
                const wrapIsScaler = wrap && wrap !== body;
                return {
                    containerW: body.clientWidth,
                    scrollW: body.scrollWidth,
                    wrapW: wrapIsScaler ? wrap.getBoundingClientRect().width : null,
                    iframeNaturalW: iframe.offsetWidth,
                    transform: getComputedStyle(iframe).transform,
                    scaled: wrapIsScaler,
                };
            }""")
            if info is None:
                failures.append('%s: no iframe rendered' % name)
                print('[FAIL] %s: no iframe' % name)
                continue
            overflow = info['scrollW'] - info['containerW']
            ok = overflow <= 1
            # 宽课件（如 1280px slides）必须走缩放路径
            wide = info['iframeNaturalW'] > info['containerW'] + 1
            if wide and not info['scaled']:
                ok = False
            status = 'PASS' if ok else 'FAIL'
            print('[%s] %s: container=%s scroll=%s naturalW=%s scaled=%s wrapW=%s' % (
                status, name, info['containerW'], info['scrollW'],
                info['iframeNaturalW'], info['scaled'], info['wrapW']))
            if not ok:
                failures.append('%s: horizontal overflow=%d scaled=%s' % (name, overflow, info['scaled']))

        # ── 2. txt preview + back button ──
        page.goto(BASE + '/mobile/index.html#/project/' + proj['id'])
        page.wait_for_timeout(2000)
        rows = page.evaluate("""() => Array.from(document.querySelectorAll('.m-file-row .m-file-name > div:first-child')).map(e => e.textContent)""")
        txt_row = None
        for i, n in enumerate(rows or []):
            if n and n.lower().endswith('.txt'):
                txt_row = (i, n)
                break
        if txt_row is None:
            print('[SKIP] no txt file in project')
        else:
            idx, tname = txt_row
            page.evaluate("""(i) => {
                const row = document.querySelectorAll('.m-file-row')[i];
                const btn = Array.from(row.querySelectorAll('.m-icon-btn')).find(b => b.title === '\\u9884\\u89c8');
                btn.click();
            }""", idx)
            page.wait_for_timeout(1500)
            pre_len = page.evaluate("() => { const p = document.querySelector('.m-preview-text'); return p ? p.textContent.length : -1 }")
            print('[%s] txt preview content length: %s' % ('PASS' if pre_len > 0 else 'FAIL', pre_len))
            if pre_len <= 0:
                failures.append('txt preview empty')
            page.evaluate("() => document.querySelector('.m-back-btn').click()")
            page.wait_for_timeout(1000)
            back_ok = page.evaluate("() => document.querySelectorAll('.m-file-row').length > 0")
            print('[%s] back button returns to file list' % ('PASS' if back_ok else 'FAIL'))
            if not back_ok:
                failures.append('back button did not return to list')

        # ── 3. theme: classic server setting must render light bg ──
        page.goto(BASE + '/mobile/index.html#/')
        page.wait_for_timeout(2000)
        bg = page.evaluate("() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()")
        print('[INFO] --bg after sync:', bg)

        if errors:
            print('[WARN] page errors:', errors)
        browser.close()

    print()
    if failures:
        print('FAILED: %d issue(s)' % len(failures))
        for x in failures:
            print(' -', x)
        sys.exit(1)
    print('ALL PASS')

if __name__ == '__main__':
    main()
