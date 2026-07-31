# -*- coding: utf-8 -*-
"""Phase 3 验收：themes + render — 占位符零残留/自包含/主题切换/结构完整"""
import json
import re
import sqlite3
import urllib.request

BASE = "http://localhost:8766"
AT = open("dev-log/bk_admin_token").read().strip()

results = []


def call(method, path, token=None, body=None, raw=False):
    req = urllib.request.Request(BASE + path, method=method)
    if token:
        req.add_header("Authorization", "Bearer " + token)
    data = None
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data=data) as r:
            payload = r.read().decode("utf-8")
            return r.status, (payload if raw else json.loads(payload)), dict(r.headers)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8")), {}
        except Exception:
            return e.code, {}, {}


def check(name, cond, detail=""):
    results.append((name, cond, detail))
    print(("PASS" if cond else "FAIL"), name, detail)


db = sqlite3.connect("backend/data/yishao.db")
db.row_factory = sqlite3.Row
P1 = db.execute("SELECT id FROM projects WHERE name='食品安全测试1'").fetchone()["id"]
db.close()

# ── themes API ──
s, d, _ = call("GET", "/api/booklets/themes", AT)
themes = d.get("themes", [])
builtin = [t for t in themes if t["source"] == "builtin"]
style_t = [t for t in themes if t["source"] == "style_tmpl"]
check("themes: 内置 4 套", s == 200 and len(builtin) == 4, f"builtin={len(builtin)}")
check("themes: 风格模板配色 >= 10 套", len(style_t) >= 10, f"style={len(style_t)}")
check("themes: 色键归一化", all(set(t["colors"]) >= {"primary", "accent", "bg", "text"} for t in themes), "")

# ── 准备 4 章 a4 草稿：md×2 + 课件×1 + custom×1 ──
import urllib.parse
q = urllib.parse.quote

def fetch_item(st, sk):
    s, d, _ = call("GET", f"/api/booklets/content-item?project_id={P1}&source_type={st}&source_key={q(sk)}", AT)
    assert s == 200, f"content-item {sk} -> {s}"
    return d["content"]

md_sop = fetch_item("step_md", "step2_sop")
md_yanxi = fetch_item("step_md", "step2_yanxi")
col3_html = fetch_item("a4_html", "食品安全测试1_col3")

def md2html(md):
    # 简易转换代替前端 marked（验收目的：确认装配管线，不测 markdown 保真度）
    lines = []
    for ln in md.splitlines():
        if ln.startswith("# "):
            lines.append(f"<h1>{ln[2:]}</h1>")
        elif ln.startswith("## "):
            lines.append(f"<h2>{ln[3:]}</h2>")
        elif ln.strip():
            lines.append(f"<p>{ln}</p>")
    return "\n".join(lines)

s, d, _ = call("POST", "/api/booklets", AT, {"title": "食品安全汇编手册", "book_type": "a4"})
AID = d["id"]
chapters = [
    {"id": "ch-1", "title": "标准操作规程", "source_type": "step_md", "project_id": P1,
     "project_name": "食品安全测试1", "source_key": "step2_sop", "content": md_sop,
     "content_html": md2html(md_sop), "enabled": True},
    {"id": "ch-2", "title": "综合研习文档", "source_type": "step_md", "project_id": P1,
     "project_name": "食品安全测试1", "source_key": "step2_yanxi", "content": md_yanxi,
     "content_html": md2html(md_yanxi), "enabled": True},
    {"id": "ch-3", "title": "文档课件", "source_type": "a4_html", "project_id": P1,
     "project_name": "食品安全测试1", "source_key": "食品安全测试1_col3", "content": col3_html,
     "content_html": col3_html, "enabled": True},
    {"id": "ch-4", "title": "自建说明章节", "source_type": "custom", "project_id": "",
     "project_name": "", "source_key": "", "content": "# 编者按\n本册由电子成册功能合成。",
     "content_html": "<h1>编者按</h1><p>本册由电子成册功能合成。</p>", "enabled": True},
    {"id": "ch-5", "title": "停用章节不应出现XYZZY", "source_type": "custom", "project_id": "",
     "project_name": "", "source_key": "", "content": "XYZZY_DISABLED",
     "content_html": "<p>XYZZY_DISABLED</p>", "enabled": False},
]
s, d, _ = call("PUT", f"/api/booklets/{AID}", AT, {
    "author": "张三", "subtitle": "内部培训资料",
    "cover": {"org": "验收测试单位", "date_text": "2026年7月", "flyleaf_text": "本手册用于验收测试。",
              "back_cover_text": "封底致谢文字。", "theme_id": "builtin-business", "theme_colors": {}},
    "chapters": chapters,
})
check("a4 草稿保存(5章 4启用)", s == 200 and len(d["chapters"]) == 5, f"status={s}")

# ── render a4 ──
s, html, headers = call("POST", f"/api/booklets/{AID}/render", AT, raw=True)
check("a4 render 200", s == 200, f"status={s} len={len(html) if isinstance(html,str) else 0}")
check("附件头正确", "attachment" in (headers.get("Content-Disposition") or headers.get("content-disposition") or ""), str({k: v for k, v in headers.items() if "disposition" in k.lower()}))

PLACEHOLDERS = ["BOOK_TITLE","BOOK_SUBTITLE","BOOK_AUTHOR","BOOK_ORG","BOOK_DATE","FLYLEAF_TEXT",
                "BACK_COVER_TEXT","BRAND_COPYRIGHT","BRAND_SIGNATURE","BOOK_LOGO","TOC_ENTRIES",
                "CHAPTERS","PAGE_TOTAL","THEME_CSS_VARS"]
residue = [p for p in PLACEHOLDERS if "{{"+p+"}}" in html]
check("无占位符残留", not residue, str(residue))
check("无外部 script src", "<script src" not in html, "")
check("无 http 外链资源", not re.search(r'(?:src|href)="https?://', html), str(re.findall(r'(?:src|href)="(https?://[^"]{0,50})', html)[:3]))
check("封面含书名+署名", "食品安全汇编手册" in html and "张三" in html, "")
check("扉页/封底文字注入", "本手册用于验收测试。" in html and "封底致谢文字。" in html, "")
check("目录 4 条锚点", html.count('class="bk-toc-num"') == 4 and 'href="#bk-ch-1"' in html, f"toc={html.count(chr(34)+'bk-toc-num')}")
check("章节顺序正确", html.find("标准操作规程") < html.find("综合研习文档") < html.find("自建说明章节"), "")
check("停用章节未进产物", "XYZZY_DISABLED" not in html, "")
check("课件页 iframe 嵌入", html.count("bk-embed-frame") >= 5, f"frames={html.count('bk-embed-frame')}")
check("主题变量注入(商务深蓝)", "--book-primary: #1a365d" in html, "")
check("A4 打印 CSS", "size: A4" in html and "page-break" in html, "")
open("dev-log/_bk_sample_a4.html", "w", encoding="utf-8").write(html)

# ── 换主题重新 render，配色变化 ──
s, d, _ = call("GET", f"/api/booklets/{AID}", AT)
cov = d["cover"]; cov["theme_id"] = "builtin-vivid"
call("PUT", f"/api/booklets/{AID}", AT, {"cover": cov})
s, html2, _ = call("POST", f"/api/booklets/{AID}/render", AT, raw=True)
check("换主题1: 活力橙紫生效", s == 200 and "--book-primary: #7c3aed" in html2 and "--book-primary: #1a365d" not in html2, "")

style_theme = style_t[0]
cov["theme_id"] = style_theme["id"]
call("PUT", f"/api/booklets/{AID}", AT, {"cover": cov})
s, html3, _ = call("POST", f"/api/booklets/{AID}/render", AT, raw=True)
check(f"换主题2: 风格模板配色({style_theme['name']})生效",
      s == 200 and f"--book-primary: {style_theme['colors']['primary']}" in html3, style_theme["colors"]["primary"])

# ── ppt 版 ──
col4_html = fetch_item("ppt_html", "食品安全测试1_col4")
col5_html = fetch_item("ppt_html", "食品安全测试1_col5")
s, d, _ = call("POST", "/api/booklets", AT, {"title": "食品安全PPT合辑", "book_type": "ppt"})
PID = d["id"]
s, d, _ = call("PUT", f"/api/booklets/{PID}", AT, {
    "author": "李四",
    "cover": {"org": "验收测试单位", "theme_id": "builtin-minimal", "back_cover_text": "感谢观看"},
    "chapters": [
        {"id": "ch-1", "title": "分析PPT", "source_type": "ppt_html", "project_id": P1,
         "project_name": "食品安全测试1", "source_key": "食品安全测试1_col4", "content": col4_html,
         "content_html": col4_html, "enabled": True},
        {"id": "ch-2", "title": "综合PPT", "source_type": "ppt_html", "project_id": P1,
         "project_name": "食品安全测试1", "source_key": "食品安全测试1_col5", "content": col5_html,
         "content_html": col5_html, "enabled": True},
    ],
})
s, phtml, _ = call("POST", f"/api/booklets/{PID}/render", AT, raw=True)
check("ppt render 200", s == 200, f"status={s} len={len(phtml) if isinstance(phtml,str) else 0}")
residue = [p for p in PLACEHOLDERS if "{{"+p+"}}" in phtml]
check("ppt 无占位符残留", not residue, str(residue))
check("ppt 无外链", not re.search(r'(?:src|href)="https?://', phtml), "")
check("ppt 翻页 JS 内置", "ArrowRight" in phtml and "bkNext" in phtml, "")
check("ppt 幻灯片数量(封面+目录+2隔页+20片+封底=25)", phtml.count('class="bk-slide') >= 24, f"slides={phtml.count(chr(34)+chr(98))}")
check("ppt 章节隔页", phtml.count('class="bk-slide bk-chapter-divider"') == 2, "")
check("ppt 目录跳转 data-slide-target", phtml.count('data-slide-target="bk-ch-') == 2, "")
open("dev-log/_bk_sample_ppt.html", "w", encoding="utf-8").write(phtml)

# ── 空章节 render → 400 ──
s, d, _ = call("POST", "/api/booklets", AT, {"title": "空册", "book_type": "a4"})
EID = d["id"]
s, _, _ = call("POST", f"/api/booklets/{EID}/render", AT)
check("空章节 render → 400", s == 400, f"status={s}")

# 清理
call("DELETE", f"/api/booklets/{EID}", AT)

fails = [r for r in results if not r[1]]
print(f"\n== {len(results)-len(fails)}/{len(results)} PASS ==")
print(f"样品: dev-log/_bk_sample_a4.html / _bk_sample_ppt.html (草稿 {AID}, {PID} 保留供浏览器检查)")
raise SystemExit(1 if fails else 0)
