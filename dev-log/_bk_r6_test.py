# -*- coding: utf-8 -*-
"""R6 验收：LOGO 上传权限 + fixed_docs 缩略图 + 正文拆页编排（PROSE_ARRANGE + data-bk-prose）"""
import json, io, os, sys, urllib.request, tempfile, random, string, base64

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
BASE = "http://localhost:8766"
JWT_SECRET = "yishao-agent-jwt-secret-2026"

# ── 生成 JWT ──
import hmac, hashlib, time as _time

def _b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()

def make_jwt(payload):
    header = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    body = _b64url(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64url(hmac.new(JWT_SECRET.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest())
    return f"{header}.{body}.{sig}"

results = []
def check(name, ok, extra=""):
    results.append(ok)
    print(("PASS" if ok else "FAIL"), name, extra)

def req(method, path, body=None, token=None):
    hdrs = {"Content-Type": "application/json"}
    if token:
        hdrs["Authorization"] = "Bearer " + token
    data = json.dumps(body, ensure_ascii=False).encode("utf-8") if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method, headers=hdrs)
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

def req_file(path, token, file_bytes, filename="test.png"):
    boundary = "----TestFormBoundary" + "".join(random.choices(string.ascii_lowercase, k=8))
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: image/png\r\n\r\n"
    ).encode() + file_bytes + f"\r\n--{boundary}--\r\n".encode()
    r = urllib.request.Request(
        BASE + path, data=body, method="POST",
        headers={"Authorization": "Bearer " + token, "Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    try:
        with urllib.request.urlopen(r) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8"))
        except Exception:
            return e.code, {}

def no_residue(out):
    return "{{" not in out and "<!--BK:" not in out

# ── token ──
now = int(_time.time())
# vip member (user_id=301, role=member)
vip_tok = make_jwt({"sub": "301", "role": "member", "iat": now, "exp": now + 3600})
# admin
adm_tok = make_jwt({"sub": "1", "role": "admin", "iat": now, "exp": now + 3600})

# ── 正文素材 ──
long_html = "<h2>长文测试章</h2>" + "".join(
    f"<p>LONGPARA-{i:03d} 这是第 {i} 段长正文内容，用于验证浏览器端自动拆页逻辑是否将超出固定页高的正文拆分为多张页面。</p>"
    for i in range(1, 61)
)
long_html += ('<table><thead><tr><th>序号</th><th>项目</th><th>说明</th></tr></thead><tbody>'
              + "".join(f'<tr><td>ROW-{i:03d}</td><td>项目{i}</td><td>说明内容第 {i} 行</td></tr>' for i in range(1, 61))
              + "</tbody></table>")

short_ch = {
    "id": "ch-short", "title": "短文章", "source_type": "custom", "project_id": "", "project_name": "",
    "source_key": "", "content": "正文占位", "content_html": "<p>SHORT</p>",
    "content_format": "md", "enabled": True,
}

# ════════════════════════════════════════════
# 1. LOGO 上传权限
# ════════════════════════════════════════════
png = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde" + b"\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82"

s, d = req_file("/api/upload/logo", vip_tok, png)
check("会员上传 LOGO 200", s == 200 and isinstance(d.get("url"), str), f"status={s} url={d.get('url','')[:50]}")

s, d = req_file("/api/upload/logo", "", png)
check("无 token 上传 LOGO 401", s == 401, f"status={s}")

s, d = req_file("/api/upload/logo", adm_tok, png)
check("管理员上传 LOGO 200", s == 200 and isinstance(d.get("url"), str), f"status={s}")

# ════════════════════════════════════════════
# 2. page-map fixed_docs
# ════════════════════════════════════════════
s, bk = req("POST", "/api/booklets", {"title": "R6测试A4", "book_type": "a4"}, token=adm_tok)
BK = bk["id"]
# 必须先 PUT 章节，否则 render_booklet 会因为「没有启用的章节」抛异常 → fixed_docs 为空
req("PUT", f"/api/booklets/{BK}",
    {"chapters": [short_ch], "cover": {"render_mode": "paged", "desk_none": True}},
    token=adm_tok)

s, pm = req("GET", f"/api/booklets/{BK}/page-map", token=adm_tok)

check("page-map 含 fixed_docs", isinstance(pm.get("fixed_docs"), dict) and len(pm["fixed_docs"]) >= 2,
      f"keys={list(pm.get('fixed_docs',{}).keys())}")
check("fixed_docs cover 含 bk-cover", "bk-cover" in pm.get("fixed_docs", {}).get("cover", ""))
check("fixed_docs flyleaf 含 bk-flyleaf", "bk-flyleaf" in pm.get("fixed_docs", {}).get("flyleaf", ""))
check("fixed_docs toc 含 bk-toc", "bk-toc" in pm.get("fixed_docs", {}).get("toc", ""))
check("fixed_docs back 含 bk-back", "bk-back" in pm.get("fixed_docs", {}).get("back", ""))

# CSS normalization (翻页式非 active 页 display:none 必须强制显示)
for k in ("cover", "flyleaf", "toc", "back"):
    doc = pm.get("fixed_docs", {}).get(k, "")
    check(f"fixed_doc {k} display:flex", "display:flex" in doc or "display: flex" in doc, f"len={len(doc)}")

# ════════════════════════════════════════════
# 3. 正文拆页编排（PROSE_ARRANGE 注入 + data-bk-prose）
# ════════════════════════════════════════════
prose_ch = {
    "id": "ch-prose", "title": "长文章", "source_type": "custom", "project_id": "", "project_name": "测试项目",
    "source_key": "", "content": "正文占位", "content_html": long_html,
    "content_format": "md", "enabled": True,
    "prose_hidden_pages": [0], "prose_page_order": [1, 0]
}

req("PUT", f"/api/booklets/{BK}",
    {"chapters": [prose_ch], "cover": {"render_mode": "paged", "desk_none": True}},
    token=adm_tok)

st, out = req("POST", f"/api/booklets/{BK}/render", token=adm_tok)
check("render 200 + 非空 HTML", st == 200 and isinstance(out, str) and len(out) > 500,
      f"status={st} len={len(out) if isinstance(out, str) else 0}")
check("零残留占位符", no_residue(out))

# PROSE_ARRANGE JSON 注入
check("产物含 __BK_PROSE_ARRANGE", "__BK_PROSE_ARRANGE" in out)
arrange_start = out.find("__BK_PROSE_ARRANGE")
arrange_seg = out[arrange_start:arrange_start + 100]
# prose_hidden_pages=[0], prose_page_order=[1,0] → arrange 含 hidden+order
check("PROSE_ARRANGE 含 hidden+order",
      '"hidden":[0]' in arrange_seg and '"order":[1,0]' in arrange_seg,
      arrange_seg)
check("产物含 data-bk-prose 属性", 'data-bk-prose="bk-ch-1"' in out)

# ════════════════════════════════════════════
# 4. 存量草稿（无 prose_* 字段）产物兼容
# ════════════════════════════════════════════
legacy_ch = {
    "id": "ch-legacy", "title": "旧草稿章", "source_type": "custom", "project_id": "", "project_name": "",
    "source_key": "", "content": "正文占位", "content_html": long_html,
    "content_format": "md", "enabled": True
}
req("PUT", f"/api/booklets/{BK}",
    {"chapters": [legacy_ch], "cover": {"render_mode": "paged", "desk_none": True}},
    token=adm_tok)

st, out2 = req("POST", f"/api/booklets/{BK}/render", token=adm_tok)
check("存量草稿 render 200", st == 200 and isinstance(out2, str))
check("存量草稿含 bkSplitProse（R4 不变）", "bkSplitProse" in out2)
check("存量草稿含 data-bk-prose anchor（R6 渲染属性）", 'data-bk-prose="bk-ch-1"' in out2)
check("存量草稿 PROSE_ARRANGE 存在且为零状态", "window.__BK_PROSE_ARRANGE = {}" in out2 or
      "__BK_PROSE_ARRANGE = {}" in out2)
check("存量草稿零残留占位符", no_residue(out2))

# ════════════════════════════════════════════
# 5. 网页式（flow）不受正文编排 JS 影响
# ════════════════════════════════════════════
req("PUT", f"/api/booklets/{BK}",
    {"chapters": [prose_ch], "cover": {"render_mode": "flow", "desk_none": True}},
    token=adm_tok)
st, fout = req("POST", f"/api/booklets/{BK}/render", token=adm_tok)
check("flow 产物 200", st == 200)
check("flow 产物不含 bkSplitProse", "bkSplitProse" not in fout)
# data-bk-prose 由 Python 渲染，flow 产物也有，但编排 JS 不存在 = 无害
# flow 模板没有 PROSE_ARRANGE 处理脚本，arrange 为空时不注入
check("flow 产物无残留占位符", no_residue(fout))

# ════════════════════════════════════════════
# 6. standard 模式也含 PROSE_ARRANGE
# ════════════════════════════════════════════
req("PUT", f"/api/booklets/{BK}",
    {"chapters": [prose_ch], "cover": {"render_mode": "standard", "desk_none": True}},
    token=adm_tok)
st, sout = req("POST", f"/api/booklets/{BK}/render", token=adm_tok)
check("standard 产物含 data-bk-prose", 'data-bk-prose="bk-ch-1"' in sout)
check("standard 产物含 bkSplitProse", "bkSplitProse" in sout)
check("standard 产物含 PROSE_ARRANGE", "__BK_PROSE_ARRANGE" in sout)

# ── 清理 ──
req("DELETE", f"/api/booklets/{BK}", token=adm_tok)

print(f"\n== {sum(results)}/{len(results)} PASS ==")
