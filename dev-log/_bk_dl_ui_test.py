# 会员下载页 master-detail 改版 UI 冒烟：左列表/多选/右侧明细勾选/计数联动/搜索/分类筛选
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

    total = page.locator("text=/共 \\d+ 个项目/").inner_text()
    print("1) 左栏计数:", total)
    rows = page.locator("input[type=checkbox][readonly]")
    print("2) 左栏行数:", rows.count())

    # 点第一行 → 右侧出卡片，文件默认全勾
    rows.nth(0).click()
    page.wait_for_timeout(400)
    toolbar = page.locator("text=/已选 \\d+ 个项目/").inner_text()
    print("3) 选1项目后工具栏:", toolbar)
    right_boxes = page.locator("input[type=checkbox]:not([readonly])")
    checked = page.evaluate("Array.from(document.querySelectorAll('input[type=checkbox]:not([readonly])')).filter(c=>c.checked).length")
    print("4) 右侧勾选框:", right_boxes.count(), "个，已勾:", checked)

    # 取消一个文件勾选 → 计数减1
    if right_boxes.count() > 1:
        right_boxes.nth(1).click()  # nth(0) 是项目头全选框
        page.wait_for_timeout(300)
        print("5) 取消1文件后工具栏:", page.locator("text=/已选 \\d+ 个项目/").inner_text())

    # 全选
    page.locator("button:has-text('全选')").click()
    page.wait_for_timeout(400)
    print("6) 全选后工具栏:", page.locator("text=/已选 \\d+ 个项目/").inner_text())

    # 批量下载按钮可用性
    btn = page.locator("button:has-text('批量下载')")
    print("7) 批量下载按钮 disabled:", btn.get_attribute("disabled") is not None)

    # 搜索过滤
    page.fill("input[placeholder='搜索项目或文件...']", "鲍鱼")
    page.wait_for_timeout(400)
    print("8) 搜'鲍鱼'后左栏:", page.locator("text=/共 \\d+ 个项目/").inner_text())

    # 分类下拉选项数
    opts = page.locator("select option").count()
    print("9) 分类下拉选项数(含全部分类):", opts)

    # 清空
    page.fill("input[placeholder='搜索项目或文件...']", "")
    page.locator("button:has-text('清空')").click()
    page.wait_for_timeout(300)
    print("10) 清空后工具栏:", page.locator("text=/已选 \\d+ 个项目/").inner_text())

    page.screenshot(path="dev-log/_bk_dl_ui.png", full_page=False)
    print("11) 页面 JS 错误:", errors if errors else "无")
    b.close()
