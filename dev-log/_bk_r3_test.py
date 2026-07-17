# -*- coding: utf-8 -*-
"""R3 验收：页面编排（固定页隐藏 / 章节内页排序 / 页隐藏 / 整章全隐 / page-map）"""
import json, io, sys
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

# ── 构造素材 ──
def slide(n, marker):
    return f'<div class="slide-wrapper"><div class="slide">{marker} 第{n}页内容</div></div>'

EMBED_HTML = ("<!DOCTYPE html><html><head><style>.slide{font-size:20px}</style></head><body>"
              + slide(1, "PAGE-ALPHA") + slide(2, "PAGE-BRAVO") + slide(3, "PAGE-CHARLIE")
              + "</body></html>")

def prose_ch(cid, title, text):
    return {"id": cid, "title": title, "source_type": "custom", "project_id": "", "project_name": "",
            "source_key": "", "content": text, "content_html": f"<p>{text}</p>",
            "content_format": "md", "enabled": True}

def embed_ch(cid, title, source_type):
    return {"id": cid, "title": title, "source_type": source_type, "project_id": "p1",
            "project_name": "测试明细", "source_key": "run1", "content": EMBED_HTML,
            "content_html": "", "enabled": True}

# ══ A4 册子 ══
st, bk = req("POST", "/api/booklets", {"title": "R3测试A4", "book_type": "a4"})
assert st == 200, f"create a4 failed {st}"
BK = bk["id"]
chapters = [prose_ch("ch-p1", "正文一", "正文章节甲"), embed_ch("ch-e1", "课件章", "a4_html"),
            prose_ch("ch-p2", "正文二", "正文章节乙")]
st, _ = req("PUT", f"/api/booklets/{BK}", {"chapters": chapters, "cover": {}})
check("A4 草稿 3 章保存", st == 200)

# 1. page-map
st, pm = req("GET", f"/api/booklets/{BK}/page-map")
kinds = {c["chapter_id"]: c for c in pm.get("chapters", [])}
check("page-map 200 + fixed 三项", st == 200 and pm.get("fixed") == ["flyleaf", "toc", "back"])
check("page-map prose 1页", kinds["ch-p1"]["kind"] == "prose" and kinds["ch-p1"]["page_count"] == 1)
check("page-map embed 3页含docs", kinds["ch-e1"]["kind"] == "embed" and kinds["ch-e1"]["page_count"] == 3
      and len(kinds["ch-e1"].get("docs") or []) == 3 and "PAGE-BRAVO" in kinds["ch-e1"]["docs"][1])

# 2. 默认合成（无编排字段 = 全可见自然序，向后兼容）
st, out = req("POST", f"/api/booklets/{BK}/render")
check("默认合成 200", st == 200)
check("默认含扉页/目录/封底", 'class="bk-sheet bk-flyleaf"' in out and 'class="bk-sheet bk-toc"' in out and 'class="bk-sheet bk-back"' in out)
check("默认 3 嵌入页自然序", out.find("PAGE-ALPHA") < out.find("PAGE-BRAVO") < out.find("PAGE-CHARLIE") and out.find("PAGE-ALPHA") > 0)
check("无 BK 标记残留", "<!--BK:" not in out and "<!--/BK:" not in out and "{{" not in out)
check("默认全书共 3 章", "全书共 3 章" in out)

# 3. 隐藏固定页
st, _ = req("PUT", f"/api/booklets/{BK}", {"cover": {"hidden_fixed": ["flyleaf", "back"]}})
st, out = req("POST", f"/api/booklets/{BK}/render")
check("隐藏扉页+封底后段落消失", st == 200 and 'class="bk-sheet bk-flyleaf"' not in out
      and 'class="bk-sheet bk-back"' not in out and 'class="bk-sheet bk-toc"' in out)
check("隐藏固定页无 BK 残留", "<!--BK:" not in out)

# 4. 章节内排序 + 隐藏页
chapters2 = [prose_ch("ch-p1", "正文一", "正文章节甲"),
             {**embed_ch("ch-e1", "课件章", "a4_html"), "page_order": [2, 0, 1], "hidden_pages": [0]},
             prose_ch("ch-p2", "正文二", "正文章节乙")]
st, _ = req("PUT", f"/api/booklets/{BK}", {"chapters": chapters2, "cover": {}})
st, out = req("POST", f"/api/booklets/{BK}/render")
check("页排序[2,0,1]+隐藏0 → CHARLIE在BRAVO前且无ALPHA", st == 200 and "PAGE-ALPHA" not in out
      and 0 < out.find("PAGE-CHARLIE") < out.find("PAGE-BRAVO"))

# 5. 非法 page_order 回退自然序
chapters3 = [{**embed_ch("ch-e1", "课件章", "a4_html"), "page_order": [5, 1]}]
st, _ = req("PUT", f"/api/booklets/{BK}", {"chapters": chapters3})
st, out = req("POST", f"/api/booklets/{BK}/render")
check("非法排列回退自然序", st == 200 and out.find("PAGE-ALPHA") < out.find("PAGE-BRAVO") < out.find("PAGE-CHARLIE"))

# 6. 整章全隐：prose hidden_pages=[0] → 不进目录、编号连续、PAGE_TOTAL 变化
chapters4 = [prose_ch("ch-p1", "正文一", "正文章节甲"),
             {**prose_ch("ch-p2", "正文二", "正文章节乙"), "hidden_pages": [0]},
             prose_ch("ch-p3", "正文三", "正文章节丙")]
st, _ = req("PUT", f"/api/booklets/{BK}", {"chapters": chapters4})
st, out = req("POST", f"/api/booklets/{BK}/render")
check("整章隐藏不进产物", st == 200 and "正文章节乙" not in out and "正文二" not in out)
check("编号连续 01/02 无 03", 'id="bk-ch-1"' in out and 'id="bk-ch-2"' in out and 'id="bk-ch-3"' not in out)
check("全书共 2 章", "全书共 2 章" in out)

# 7. 全部隐藏 → 400
chapters5 = [{**prose_ch("ch-p1", "正文一", "甲"), "hidden_pages": [0]}]
st, _ = req("PUT", f"/api/booklets/{BK}", {"chapters": chapters5})
st, r = req("POST", f"/api/booklets/{BK}/render")
check("全部页隐藏 → 400", st == 400, f"status={st}")

# ══ PPT 册子 ══
st, bk2 = req("POST", "/api/booklets", {"title": "R3测试PPT", "book_type": "ppt"})
BK2 = bk2["id"]
pchapters = [embed_ch("ch-s1", "分析章", "ppt_html"), prose_ch("ch-s2", "备注章", "备注正文")]
st, _ = req("PUT", f"/api/booklets/{BK2}", {"chapters": pchapters, "cover": {}})

st, pm2 = req("GET", f"/api/booklets/{BK2}/page-map")
check("ppt page-map fixed=[toc,back]", st == 200 and pm2.get("fixed") == ["toc", "back"])

st, out = req("POST", f"/api/booklets/{BK2}/render")
check("ppt 默认含 divider+目录+封底", st == 200 and out.count('class="bk-slide bk-chapter-divider"') == 2
      and 'class="bk-slide bk-toc"' in out and 'class="bk-slide bk-back"' in out)

# 8. hide_divider：divider 消失，锚点移到第一张内容片
pchapters2 = [{**embed_ch("ch-s1", "分析章", "ppt_html"), "hide_divider": True, "hidden_pages": [1]},
              prose_ch("ch-s2", "备注章", "备注正文")]
st, _ = req("PUT", f"/api/booklets/{BK2}", {"chapters": pchapters2, "cover": {"hidden_fixed": ["toc"], "render_mode": "flow"}})
st, out = req("POST", f"/api/booklets/{BK2}/render")
check("ppt flow: divider 隐藏后仅剩 1 个", st == 200 and out.count('class="bk-slide bk-chapter-divider"') == 1)
check("ppt 锚点移到内容片", '<section class="bk-slide" id="bk-ch-1">' in out)
check("ppt 隐藏第2页", "PAGE-BRAVO" not in out and "PAGE-ALPHA" in out and "PAGE-CHARLIE" in out)
check("ppt 隐藏目录", 'class="bk-slide bk-toc"' not in out)
check("ppt flow 无 BK/{{ 残留", "<!--BK:" not in out and "{{" not in out)

# paged 同查
st, _ = req("PUT", f"/api/booklets/{BK2}", {"cover": {"hidden_fixed": ["toc"], "render_mode": "paged"}})
st, out = req("POST", f"/api/booklets/{BK2}/render")
check("ppt paged 同编排无残留", st == 200 and out.count('class="bk-slide bk-chapter-divider"') == 1
      and 'class="bk-slide bk-toc"' not in out and "<!--BK:" not in out and "{{" not in out)

# ── 清理 ──
req("DELETE", f"/api/booklets/{BK}")
req("DELETE", f"/api/booklets/{BK2}")

print(f"\n== {sum(results)}/{len(results)} PASS ==")
