# -*- coding: utf-8 -*-
"""R2 新功能验收：desk 变量 / desk_none / 章节 bg_color / flow 模板 / custom html 章节"""
import json, urllib.request, io, sys

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
BASE = "http://localhost:8766"
TOKEN = open("dev-log/bk_admin_token").read().strip()

def req(method, path, body=None):
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method,
        headers={"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, raw
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")

results = []
def check(name, ok, extra=""):
    results.append(ok)
    print(("PASS" if ok else "FAIL"), name, extra)

# ── 建 a4 草稿：md 章(含加粗/表格) + 背景色章 + custom html 章 ──
st, raw = req("POST", "/api/booklets", {"title": "R2验收A4", "book_type": "a4"})
bk = json.loads(raw); bid = bk["id"]
md1 = "## 标题测试\n\n**加粗文字** 和普通文字\n\n| 列1 | 列2 |\n| --- | --- |\n| a | b |\n"
html_md1 = '<h2>标题测试</h2><p><strong>加粗文字</strong> 和普通文字</p><table><thead><tr><th>列1</th><th>列2</th></tr></thead><tbody><tr><td>a</td><td>b</td></tr></tbody></table>'
chapters = [
    {"id": "ch-r2a", "title": "MD章", "source_type": "custom", "project_id": "", "project_name": "",
     "source_key": "", "content": md1, "content_html": html_md1, "content_format": "md", "enabled": True},
    {"id": "ch-r2b", "title": "背景色章", "source_type": "custom", "project_id": "", "project_name": "",
     "source_key": "", "content": "bg test", "content_html": "<p>bg test</p>", "content_format": "md",
     "bg_color": "#fef3c7", "enabled": True},
    {"id": "ch-r2c", "title": "注入测试章", "source_type": "custom", "project_id": "", "project_name": "",
     "source_key": "", "content": "x", "content_html": "<p>x</p>", "content_format": "md",
     "bg_color": "red;}</style><script>alert(1)</script>", "enabled": True},
    {"id": "ch-r2d", "title": "导入HTML章", "source_type": "custom", "project_id": "", "project_name": "",
     "source_key": "", "content": "<html><head><style>.imp{color:blue}</style></head><body><div class='imp'>导入的整页HTML</div></body></html>",
     "content_html": "", "content_format": "html", "enabled": True},
]
st, raw = req("PUT", f"/api/booklets/{bid}", {"cover": {"theme_id": "builtin-business"}, "chapters": chapters})
check("a4 草稿保存", st == 200, f"status={st}")

# paged 渲染
st, paged = req("POST", f"/api/booklets/{bid}/render")
check("a4 paged render 200", st == 200, f"len={len(paged)}")
check("desk 变量注入(:root)", "--book-desk: #1f2937" in paged)
check("模板用 var(--book-desk)", "background: var(--book-desk)" in paged)
check("无写死桌面色", "#52525b" not in paged and "#18181b" not in paged)
check("章节背景色注入", 'style="background:#fef3c7"' in paged)
check("非法背景色被拒(无注入)", "alert(1)" not in paged and "red;}" not in paged)
check("导入HTML章按iframe嵌入", paged.count("bk-embed-frame") >= 1 and "导入的整页HTML" not in paged.split("bk-embed-frame")[0])
check("paged 无占位残留", "{{" not in paged)

# desk_none → 白底
st, raw = req("PUT", f"/api/booklets/{bid}", {"cover": {"theme_id": "builtin-business", "desk_none": True}})
st, out = req("POST", f"/api/booklets/{bid}/render")
check("desk_none → 白底", "--book-desk: #ffffff" in out, f"status={st}")

# flow 渲染
st, raw = req("PUT", f"/api/booklets/{bid}", {"cover": {"theme_id": "builtin-business", "render_mode": "flow"}})
st, flow = req("POST", f"/api/booklets/{bid}/render")
check("a4 flow render 200", st == 200, f"len={len(flow)}")
check("flow 是网页式模板", "min(880px" in flow and "297mm" not in flow)
check("flow 无占位残留", "{{" not in flow)
check("flow 保留目录锚点", 'href="#bk-ch-1"' in flow)
check("flow 章节背景色仍生效", 'style="background:#fef3c7"' in flow)

# ── ppt flow ──
st, raw = req("POST", "/api/booklets", {"title": "R2验收PPT", "book_type": "ppt"})
bk2 = json.loads(raw); bid2 = bk2["id"]
st, raw = req("PUT", f"/api/booklets/{bid2}", {
    "cover": {"theme_id": "builtin-vivid", "render_mode": "flow"},
    "chapters": [
        {"id": "ch-p1", "title": "PPT文字章", "source_type": "custom", "project_id": "", "project_name": "",
         "source_key": "", "content": "hello", "content_html": "<p>hello</p>", "content_format": "md",
         "bg_color": "#ecfccb", "enabled": True},
    ]})
st, pflow = req("POST", f"/api/booklets/{bid2}/render")
check("ppt flow render 200", st == 200, f"len={len(pflow)}")
check("ppt flow 纵向堆叠(无舞台JS)", "bk-stage" not in pflow and "scrollIntoView" in pflow)
check("ppt flow desk 跟随主题", "--book-desk: #2e1065" in pflow)
check("ppt flow 无占位残留", "{{" not in pflow)
check("ppt flow 章节背景色", 'style="background:#ecfccb"' in pflow)

# ppt paged 仍正常（回归）
st, raw = req("PUT", f"/api/booklets/{bid2}", {"cover": {"theme_id": "builtin-vivid", "render_mode": "paged"}})
st, ppaged = req("POST", f"/api/booklets/{bid2}/render")
check("ppt paged 回归正常", st == 200 and "bk-stage" in ppaged and "{{" not in ppaged)

# 清理
req("DELETE", f"/api/booklets/{bid}")
req("DELETE", f"/api/booklets/{bid2}")
print(f"\n== {sum(results)}/{len(results)} PASS ==")
