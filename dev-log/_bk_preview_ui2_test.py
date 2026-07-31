# UI 冒烟：侧栏隐藏项目管理 + /app落地会员中心 + 项目筛选下拉 + 左栏2行名 + 多项目文件行标签 + md人读渲染/禁复制 + iframe sandbox
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

    # 1) /app 落地 → 会员中心；侧栏无「项目管理」
    page.goto("http://127.0.0.1:8766/app")
    page.wait_for_timeout(2000)
    print("1) /app 落地URL:", page.url)
    items = page.locator(".sidebar-nav .sidebar-item").all_inner_texts()
    print("2) 侧栏项:", [t.strip() for t in items], "| 含项目管理:", any("项目管理" in t for t in items))

    # 2) 下载页
    page.goto("http://127.0.0.1:8766/app/downloads")
    page.wait_for_timeout(2500)
    selects = page.locator("select")
    print("3) 筛选下拉个数:", selects.count())
    proj_opts = selects.nth(1).locator("option").count()
    print("4) 项目下拉选项数(含全部项目):", proj_opts)

    # 项目筛选 → 左栏收敛为 1
    first_val = selects.nth(1).locator("option").nth(1).get_attribute("value")
    selects.nth(1).select_option(first_val)
    page.wait_for_timeout(400)
    print("5) 选定1个项目后左栏:", page.locator("text=/共 \\d+ 个项目/").inner_text())
    selects.nth(1).select_option("")
    page.wait_for_timeout(400)

    # 左栏项目名 2 行 clamp
    clamp = page.evaluate("""() => {
        const rows = document.querySelectorAll('input[type=checkbox][readonly]')
        const nameEl = rows[0]?.parentElement?.querySelector('div > div')
        return nameEl ? getComputedStyle(nameEl).webkitLineClamp : 'none'
    }""")
    print("6) 左栏项目名 line-clamp:", clamp)

    # 3) 勾选2个项目 → 右侧文件行出现项目名标签
    rows = page.locator("input[type=checkbox][readonly]")
    rows.nth(0).click(); page.wait_for_timeout(300)
    rows.nth(1).click(); page.wait_for_timeout(500)
    chips = page.evaluate("""() => {
        const fileRows = [...document.querySelectorAll('input[type=checkbox]:not([readonly])')]
            .map(c => c.parentElement).filter(r => r && r.querySelector('button'))
        const withChip = fileRows.filter(r => [...r.querySelectorAll('span')].some(s => s.title && s.style.maxWidth === '140px'))
        return { fileRows: fileRows.length, withChip: withChip.length }
    }""")
    print("7) 多项目文件行:", chips)

    # 4) txt 预览：md 渲染为 <p> 元素 + 容器禁选
    txt_row = page.locator("div").filter(has=page.locator("span[title$='.txt']")).locator("button:has-text('预览')").first
    if txt_row.count() == 0:
        # 回退：直接找出含 .txt 的行
        txt_row = page.locator("span[title*='.txt']").first.locator("xpath=..").locator("button:has-text('预览')").first
    try:
        txt_row.click(); page.wait_for_timeout(1500)
        md = page.evaluate("""() => {
            const boxes = [...document.querySelectorAll('div')].filter(d => d.style.userSelect === 'none' && d.style.overflowY === 'auto')
            const box = boxes[boxes.length - 1]
            if (!box) return { found: false }
            return { found: true, hasP: !!box.querySelector('p'), hasPre: !!box.querySelector('pre'),
                     userSelect: getComputedStyle(box).userSelect }
        }""")
        print("8) txt预览 md渲染:", md)
        page.keyboard.press("Escape"); page.wait_for_timeout(400)
    except Exception as e:
        print("8) txt预览: 未找到样本行 -", str(e)[:80])

    # 5) html 预览：iframe sandbox
    html_btn = page.locator("span[title*='.html']").first.locator("xpath=..").locator("button:has-text('预览')").first
    try:
        html_btn.click(); page.wait_for_timeout(2000)
        fr = page.locator("iframe[title='文件预览']")
        print("9) html预览 iframe:", fr.count(), "| sandbox:", fr.first.get_attribute("sandbox"),
              "| src含preview-file:", "preview-file" in (fr.first.get_attribute("src") or ""))
        page.keyboard.press("Escape"); page.wait_for_timeout(300)
    except Exception as e:
        print("9) html预览: -", str(e)[:80])

    page.screenshot(path="dev-log/_bk_dl_ui2.png")
    print("10) 页面 JS 错误:", errors if errors else "无")
    b.close()
