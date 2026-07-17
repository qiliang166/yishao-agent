# -*- coding: utf-8 -*-
"""R4 验收：三种合成方式（paged 翻页式 / flow 网页式 / standard 标准页）+ 长正文自动拆页"""
import json, io, os, sys, tempfile
import urllib.request

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
BASE = "http://localhost:8766"
TOKEN = open("dev-log/bk_admin_token").read().strip()
HDRS = {"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json"}

results = []
def check(name, ok, extra=""):
    results.append(ok)
    print(("PASS" if ok else "FAIL"), name, extra)

def req(method, path, body=None):
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method, headers=HDRS)
    try:
        with urllib.request.urlopen(r) as resp:
            ct = resp.headers.get("Content-Type", "")
            raw = resp.read().decode("utf-8")
            return resp.status, (json.loads(raw) if "json" in ct else raw)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8"))
        except Exception:
            return e.code, {}

# ── 素材：长正文（长文 + 60 行大表）触发拆页 ──
TABLE_ROWS = 60
long_html = "<h2>长文测试章</h2>" + "".join(
    f"<p>LONGPARA-{i:03d} 这是第 {i} 段长正文内容，用于验证浏览器端自动拆页逻辑是否将超出固定页高的正文拆分为多张页面。</p>"
    for i in range(1, 61)
)
long_html += ('<table><thead><tr><th>序号</th><th>项目</th><th>说明</th></tr></thead><tbody>'
              + "".join(f'<tr><td>ROW-{i:03d}</td><td>项目{i}</td><td>说明内容第 {i} 行</td></tr>' for i in range(1, TABLE_ROWS + 1))
              + "</tbody></table>")
long_md = "长文测试（md 原文占位）"

def slide(n, marker):
    return f'<div class="slide-wrapper"><div class="slide">{marker} 第{n}页内容</div></div>'

EMBED_HTML = ("<!DOCTYPE html><html><head><style>.slide{font-size:20px}</style></head><body>"
              + slide(1, "PAGE-ALPHA") + slide(2, "PAGE-BRAVO") + slide(3, "PAGE-CHARLIE")
              + "</body></html>")

def prose_ch(cid, title, html, text="正文"):
    return {"id": cid, "title": title, "source_type": "custom", "project_id": "", "project_name": "",
            "source_key": "", "content": text, "content_html": html,
            "content_format": "md", "enabled": True}

def embed_ch(cid, title, source_type):
    return {"id": cid, "title": title, "source_type": source_type, "project_id": "p1",
            "project_name": "测试明细", "source_key": "run1", "content": EMBED_HTML,
            "content_html": "", "enabled": True}

def no_residue(out):
    return "{{" not in out and "<!--BK:" not in out and "<!--/BK:" not in out

def no_external(out):
    return 'src="http' not in out and "src='http" not in out and "<link " not in out and "@import" not in out

# ══ 六种产物合成 ══
st, bk = req("POST", "/api/booklets", {"title": "R4测试A4", "book_type": "a4"})
BK = bk["id"]
a4_chapters = [prose_ch("ch-long", "长文章", long_html, long_md), embed_ch("ch-e1", "课件章", "a4_html"),
               prose_ch("ch-p2", "短文章", "<p>SHORT-BODY 短章内容</p>")]
req("PUT", f"/api/booklets/{BK}", {"chapters": a4_chapters, "cover": {}})

st, bk2 = req("POST", "/api/booklets", {"title": "R4测试PPT", "book_type": "ppt"})
BK2 = bk2["id"]
ppt_chapters = [prose_ch("ch-long", "长文章", long_html, long_md), embed_ch("ch-s1", "幻灯章", "ppt_html")]
req("PUT", f"/api/booklets/{BK2}", {"chapters": ppt_chapters, "cover": {}})

outs = {}
for bid, btype in ((BK, "a4"), (BK2, "ppt")):
    for mode in ("paged", "flow", "standard"):
        st, _ = req("PUT", f"/api/booklets/{bid}", {"cover": {"render_mode": mode}})
        st, out = req("POST", f"/api/booklets/{bid}/render")
        outs[(btype, mode)] = out
        check(f"{btype} {mode} 合成 200 + 零残留零外链", st == 200 and isinstance(out, str)
              and no_residue(out) and no_external(out))

# ══ 形态断言 ══
a4p = outs[("a4", "paged")]
check("a4 paged 翻页交互（stage/nav/拆页JS）", 'class="bk-stage"' in a4p and 'class="bk-nav"' in a4p
      and "bkSplitProse" in a4p and 'id="bkNext"' in a4p)
check("a4 paged 保留 R3 class 结构", 'class="bk-sheet bk-flyleaf"' in a4p and 'class="bk-sheet bk-toc"' in a4p
      and 'class="bk-sheet bk-back"' in a4p and 'id="bk-ch-1"' in a4p)

a4s = outs[("a4", "standard")]
check("a4 standard 瀑布式（无nav，有拆页JS）", 'class="bk-nav"' not in a4s and "bkSplitProse" in a4s
      and 'class="bk-sheet bk-flyleaf"' in a4s and "page-break-after: always" in a4s)

ppts = outs[("ppt", "standard")]
check("ppt standard 瀑布式（无nav，有拆页JS+fit）", 'class="bk-nav"' not in ppts and "bkSplitProse" in ppts
      and 'class="bk-slide bk-toc"' in ppts and "scrollIntoView" in ppts)

pptp = outs[("ppt", "paged")]
check("ppt paged 翻页+拆页JS", 'class="bk-nav"' in pptp and "bkSplitProse" in pptp and 'id="bkCounter"' in pptp)

check("flow 两产物不含拆页JS（模板未动）", "bkSplitProse" not in outs[("a4", "flow")]
      and "bkSplitProse" not in outs[("ppt", "flow")])

# ══ R3 编排在 standard 模式下兼容 ══
req("PUT", f"/api/booklets/{BK}", {
    "chapters": [prose_ch("ch-long", "长文章", long_html, long_md),
                 {**embed_ch("ch-e1", "课件章", "a4_html"), "page_order": [2, 0, 1], "hidden_pages": [0]},
                 prose_ch("ch-p2", "短文章", "<p>SHORT-BODY 短章内容</p>")],
    "cover": {"render_mode": "standard", "hidden_fixed": ["flyleaf"]}})
st, out = req("POST", f"/api/booklets/{BK}/render")
check("standard 模式 R3 编排生效", st == 200 and 'class="bk-sheet bk-flyleaf"' not in out
      and "PAGE-ALPHA" not in out and 0 < out.find("PAGE-CHARLIE") < out.find("PAGE-BRAVO") and no_residue(out))

req("PUT", f"/api/booklets/{BK2}", {
    "chapters": [{**embed_ch("ch-s1", "幻灯章", "ppt_html"), "hide_divider": True}],
    "cover": {"render_mode": "standard", "hidden_fixed": ["toc"]}})
st, out = req("POST", f"/api/booklets/{BK2}/render")
check("ppt standard hide_divider+隐藏目录", st == 200 and 'class="bk-slide bk-chapter-divider"' not in out
      and 'class="bk-slide bk-toc"' not in out and '<section class="bk-slide" id="bk-ch-1">' in out and no_residue(out))

# ══ playwright 实测：拆页与翻页 ══
tmpdir = tempfile.mkdtemp(prefix="bk_r4_")
paths = {}
for key in (("a4", "paged"), ("a4", "standard"), ("ppt", "paged"), ("ppt", "standard")):
    p = os.path.join(tmpdir, f"{key[0]}_{key[1]}.html")
    with open(p, "w", encoding="utf-8") as f:
        f.write(outs[key])
    paths[key] = p

from playwright.sync_api import sync_playwright

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page(viewport={"width": 1400, "height": 900})

    # 1) a4 standard：拆页数、内容不溢出、续页无章头、表格行完整
    page.goto("file:///" + paths[("a4", "standard")].replace("\\", "/"))
    page.wait_for_timeout(600)
    r = page.evaluate("""() => {
      const sheets = [...document.querySelectorAll('.bk-sheet')];
      const prose = sheets.filter(s => s.querySelector('.bk-prose'));
      let overflow = 0;
      prose.forEach(s => {
        const box = s.querySelector('.bk-sheet-inner');
        const limit = box.getBoundingClientRect().bottom - parseFloat(getComputedStyle(box).paddingBottom) + 2;
        [...s.querySelectorAll('.bk-prose > *')].forEach(k => { if (k.getBoundingClientRect().bottom > limit) overflow++; });
      });
      const contNoHead = prose.filter(s => !s.querySelector('.bk-chapter-head'));
      const rows = document.querySelectorAll('.bk-prose tbody tr').length;
      const paras = [...document.querySelectorAll('.bk-prose p')].filter(p => p.textContent.includes('LONGPARA')).length;
      const anchored = document.getElementById('bk-ch-1');
      return { total: sheets.length, proseCount: prose.length, overflow, contCount: contNoHead.length,
               rows, paras, anchorOnFirst: !!(anchored && anchored.querySelector('.bk-chapter-head')) };
    }""")
    check("a4 standard 长文拆成多页", r["proseCount"] > 2, f"prose页数={r['proseCount']}")
    check("a4 standard 无内容溢出页高", r["overflow"] == 0, f"溢出块={r['overflow']}")
    check("a4 standard 续页无章头", r["contCount"] >= 1)
    check("a4 standard 表格行/段落零丢失", r["rows"] == TABLE_ROWS and r["paras"] == 60, f"rows={r['rows']} paras={r['paras']}")
    check("a4 standard 锚点留在章首页", r["anchorOnFirst"])

    # 2) a4 paged：翻页交互 + 拆页后计数
    page.goto("file:///" + paths[("a4", "paged")].replace("\\", "/"))
    page.wait_for_timeout(600)
    r = page.evaluate("""() => {
      const sheets = [...document.querySelectorAll('.bk-sheet')];
      const active = sheets.filter(s => s.classList.contains('bk-active'));
      return { total: sheets.length, activeCount: active.length,
               counter: document.getElementById('bkCounter').textContent,
               firstIsCover: sheets[0].classList.contains('bk-cover') };
    }""")
    check("a4 paged 单页激活+封面起始", r["activeCount"] == 1 and r["firstIsCover"] and r["counter"] == f"1 / {r['total']}")
    total = r["total"]
    check("a4 paged 拆页计入总页数", total > 8, f"total={total}")
    page.click("#bkNext")
    page.keyboard.press("ArrowRight")
    r2 = page.evaluate("""() => ({
      counter: document.getElementById('bkCounter').textContent,
      activeIdx: [...document.querySelectorAll('.bk-sheet')].findIndex(s => s.classList.contains('bk-active')) })""")
    check("a4 paged 按钮+方向键翻页", r2["activeIdx"] == 2 and r2["counter"] == f"3 / {total}")
    # 目录跳转（此草稿含目录）
    page.keyboard.press("Home")
    r3 = page.evaluate("""() => {
      const sheets = [...document.querySelectorAll('.bk-sheet')];
      const tocA = document.querySelector('.bk-toc-list a[href^="#"]');
      if (!tocA) return { ok: false };
      const toc = sheets.findIndex(s => s.classList.contains('bk-toc'));
      return { tocIdx: toc, ok: true };
    }""")
    if r3["ok"]:
        page.evaluate("(i) => { const s=[...document.querySelectorAll('.bk-sheet')]; s.forEach((x,k)=>x.classList.toggle('bk-active',k===i)); }", r3["tocIdx"])
        page.click('.bk-toc-list a[href^="#"]')
        r4 = page.evaluate("""() => {
          const sheets = [...document.querySelectorAll('.bk-sheet')];
          const i = sheets.findIndex(s => s.classList.contains('bk-active'));
          return { hasAnchor: !!sheets[i].querySelector('#bk-ch-1') || sheets[i].id === 'bk-ch-1' };
        }""")
        check("a4 paged 目录跳转到章首页", r4["hasAnchor"])
    else:
        check("a4 paged 目录跳转到章首页", False, "无目录链接")

    # 3) ppt paged：长文拆片 + 翻页
    page.goto("file:///" + paths[("ppt", "paged")].replace("\\", "/"))
    page.wait_for_timeout(600)
    r = page.evaluate("""() => {
      const slides = [...document.querySelectorAll('.bk-slide')];
      const prose = slides.filter(s => s.classList.contains('bk-prose-slide'));
      let overflow = 0;
      prose.forEach(s => {
        const limit = s.getBoundingClientRect().bottom - parseFloat(getComputedStyle(s).paddingBottom) + 2;
        [...s.querySelectorAll('.bk-prose > *')].forEach(k => { if (k.getBoundingClientRect().bottom > limit) overflow++; });
      });
      const rows = document.querySelectorAll('.bk-prose tbody tr').length;
      return { proseCount: prose.length, rows,
               counter: document.getElementById('bkCounter').textContent, total: slides.length };
    }""")
    check("ppt paged 长文拆成多片", r["proseCount"] > 3, f"prose片数={r['proseCount']}")
    check("ppt paged 表格行零丢失", r["rows"] == TABLE_ROWS, f"rows={r['rows']}")
    check("ppt paged 计数含拆片", r["counter"] == f"1 / {r['total']}")

    # 4) ppt standard：拆片 + 无溢出
    page.goto("file:///" + paths[("ppt", "standard")].replace("\\", "/"))
    page.wait_for_timeout(600)
    r = page.evaluate("""() => {
      const prose = [...document.querySelectorAll('.bk-slide.bk-prose-slide')];
      let overflow = 0;
      prose.forEach(s => {
        const limit = s.getBoundingClientRect().bottom - parseFloat(getComputedStyle(s).paddingBottom) + 2;
        [...s.querySelectorAll('.bk-prose > *')].forEach(k => { if (k.getBoundingClientRect().bottom > limit) overflow++; });
      });
      const rows = document.querySelectorAll('.bk-prose tbody tr').length;
      return { proseCount: prose.length, overflow, rows };
    }""")
    check("ppt standard 长文拆成多片且无溢出", r["proseCount"] > 3 and r["overflow"] == 0,
          f"片数={r['proseCount']} 溢出={r['overflow']}")
    check("ppt standard 表格行零丢失", r["rows"] == TABLE_ROWS, f"rows={r['rows']}")

    browser.close()

# ── 清理 ──
req("DELETE", f"/api/booklets/{BK}")
req("DELETE", f"/api/booklets/{BK2}")

print(f"\n== {sum(results)}/{len(results)} PASS ==")
