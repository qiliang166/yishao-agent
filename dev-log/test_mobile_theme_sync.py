# -*- coding: utf-8 -*-
"""Theme sync regression: stale dark theme in localStorage must be corrected from server settings after login."""
import sys, json, sqlite3, datetime
sys.stdout.reconfigure(encoding='utf-8')

import jwt as pyjwt
from playwright.sync_api import sync_playwright

DB = r'd:\YISHAOAGENT\backend\data\yishao.db'
SECRET = 'yishao-agent-jwt-secret-2026'
BASE = 'http://127.0.0.1:8766'

DARK = {"id": "dark", "name": "暗夜模式", "colors": {
    "bg": "#1A1A1E", "card": "#252528", "text": "#E5E5E5", "textSecondary": "#999999",
    "primary": "#C45C5C", "primaryLight": "#2A2020", "border": "#3A3A3E",
    "success": "#5AAD55", "warning": "#E07B50", "purple": "#9F7BEA", "cyan": "#2EB5C6",
    "primaryHover": "#A84A4A", "bgSecondary": "#303034", "bgHover": "#2A2A2E",
    "muted": "#5A5A5E", "btnDirtyBg": "#C47A50", "btnDirtyText": "#ffffff",
    "successLight": "#1E3A1E"}}

def mint_admin_token():
    db = sqlite3.connect(DB)
    db.row_factory = sqlite3.Row
    u = db.execute("SELECT * FROM users WHERE user_type='admin' ORDER BY created_at LIMIT 1").fetchone()
    perms = [r['permission'] for r in db.execute(
        "SELECT DISTINCT rp.permission FROM role_permissions rp JOIN user_roles ur ON ur.role_id=rp.role_id WHERE ur.user_id=?",
        (u['id'],)).fetchall()]
    if 'project.view_all' not in perms:
        perms.append('project.view_all')
    roles = [r['name'] for r in db.execute(
        "SELECT r.name FROM roles r JOIN user_roles ur ON ur.role_id=r.id WHERE ur.user_id=?",
        (u['id'],)).fetchall()]
    db.close()
    return pyjwt.encode({
        'sub': u['id'], 'username': u['username'], 'user_type': u['user_type'],
        'permissions': perms, 'roles': roles, 'token_version': u['token_version'],
        'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=2),
    }, SECRET, algorithm='HS256')

def main():
    token = mint_admin_token()
    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        ctx = browser.new_context(viewport={'width': 375, 'height': 667})
        # 模拟用户手机上的残留旧主题：theme=dark + presets 含 dark
        ctx.add_init_script(
            "localStorage.setItem('auth_token', %s);"
            "localStorage.setItem('theme', 'dark');"
            "localStorage.setItem('theme_presets', %s);"
            % (json.dumps(token), json.dumps(json.dumps([DARK])))
        )
        page = ctx.new_page()
        page.goto(BASE + '/mobile/index.html#/')
        # 首屏：内联脚本会先应用旧的暗色（用户看到的 bug）
        bg_before = page.evaluate("() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()")
        page.wait_for_timeout(2500)  # 等 ThemeSync 拉取服务器设置
        bg_after = page.evaluate("() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()")
        stored = page.evaluate("() => localStorage.getItem('theme')")
        browser.close()

    print('bg on first paint (stale):', bg_before)
    print('bg after server sync    :', bg_after)
    print('localStorage theme now  :', stored)
    ok = bg_after.upper() == '#FAFAF8'
    print('PASS' if ok else 'FAIL')
    sys.exit(0 if ok else 1)

if __name__ == '__main__':
    main()
