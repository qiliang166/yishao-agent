# 补验：左栏项目名 clamp 样式取证 + html 预览（搜索定位鲍鱼一品煲，sandbox iframe 渲染）
import sqlite3, time
from jose import jwt
from playwright.sync_api import sync_playwright

DB = r"D:\YISHAOAGENT\backend\data\yishao.db"
db = sqlite3.connect(DB); db.row_factory = sqlite3.Row
u = db.execute("SELECT * FROM users WHERE username='testmember'").fetchone()
tok = jwt.encode({"sub": u["id"], "username": u["username"], "user_type": u["user_type"],
                  "token_version": u["token_version"], "exp": int(time.time()) + 3600,
                  "permissions": [], "roles": []}, "yishao-agent-jwt-secret-2026", algorithm="HS256")

with sync_playwright() as p:
    b = p.chromium.launch()
    page = b.new_page(viewport={"width": 1500, "height": 900})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto("http://127.0.0.1:8766/")
    page.evaluate(f"localStorage.setItem('auth_token', '{tok}')")
    page.goto("http://127.0.0.1:8766/app/downloads")
    page.wait_for_timeout(2500)

    # A) 左栏名字元素取证：inline style 全文 + computed
    probe = page.evaluate("""() => {
        const cb = document.querySelector('input[type=checkbox][readonly]')
        const row = cb?.parentElement
        const nameEl = row?.querySelector('div > div')
        if (!nameEl) return { found: false }
        const cs = getComputedStyle(nameEl)
        return { found: true, text: nameEl.textContent.slice(0, 20), inline: nameEl.getAttribute('style'),
                 display: cs.display, clamp: cs.webkitLineClamp, orient: cs.webkitBoxOrient }
    }""")
    print("A) 左栏名元素:", probe)

    # B) 搜索定位含 html 的项目并预览
    page.fill("input[placeholder='搜索项目或文件...']", "鲍鱼一品煲")
    page.wait_for_timeout(500)
    page.locator("input[type=checkbox][readonly]").first.click()
    page.wait_for_timeout(600)
    btn = page.locator("span[title*='.html']").first.locator("xpath=..").locator("button:has-text('预览')").first
    btn.click()
    page.wait_for_timeout(3000)
    fr_el = page.locator("iframe[title='文件预览']")
    print("B) iframe个数:", fr_el.count(), "| sandbox:", fr_el.first.get_attribute("sandbox"))
    src = fr_el.first.get_attribute("src") or ""
    print("C) src含preview-file:", "preview-file" in src)
    nodes = guard = None
    for f in page.frames:
        if "preview-file" in (f.url or ""):
            try:
                nodes = f.evaluate("document.querySelectorAll('*').length")
                guard = f.evaluate("!!document.querySelector('style') && document.documentElement.outerHTML.includes('-webkit-user-select:none!important')")
            except Exception as e:
                nodes = f"eval失败:{str(e)[:60]}"
            break
    print("D) sandbox iframe 渲染节点数:", nodes, "| 注入guard在DOM中:", guard)
    page.screenshot(path="dev-log/_bk_dl_ui3.png")
    print("E) JS 错误:", errors if errors else "无")
    b.close()
