# -*- coding: utf-8 -*-
"""Phase 1 验收：booklets CRUD + 权限隔离（全部走 HTTP）"""
import json
import urllib.request

BASE = "http://localhost:8766"
AT = open("dev-log/bk_admin_token").read().strip()
VT = open("dev-log/bk_vip_token").read().strip()

results = []


def call(method, path, token=None, body=None):
    req = urllib.request.Request(BASE + path, method=method)
    if token:
        req.add_header("Authorization", "Bearer " + token)
    data = None
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, data=data) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode("utf-8"))
        except Exception:
            return e.code, {}


def check(name, cond, detail=""):
    results.append((name, cond, detail))
    print(("PASS" if cond else "FAIL"), name, detail)


# 1. admin 建
s, d = call("POST", "/api/booklets", AT, {"title": "测试手册A", "book_type": "a4"})
check("admin 新建 a4 草稿", s == 200 and d.get("id", "").startswith("bk-"), f"status={s} id={d.get('id')}")
aid = d.get("id", "")

# 2. 非法类型 400
s, d = call("POST", "/api/booklets", AT, {"title": "x", "book_type": "pdf"})
check("非法 book_type → 400", s == 400, f"status={s}")

# 空标题 400
s, d = call("POST", "/api/booklets", AT, {"title": "  ", "book_type": "a4"})
check("空标题 → 400", s == 400, f"status={s}")

# 3. admin 改
s, d = call("PUT", f"/api/booklets/{aid}", AT, {
    "title": "测试手册A改", "author": "张三", "subtitle": "副标题",
    "cover": {"org": "测试单位", "theme_id": "minimal"},
    "chapters": [{"id": "ch-1", "title": "第一章", "source_type": "custom",
                  "project_id": "", "project_name": "", "source_key": "",
                  "content": "# 你好", "content_html": "<h1>你好</h1>", "enabled": True}],
})
check("admin 更新草稿", s == 200 and d.get("title") == "测试手册A改" and d.get("author") == "张三"
      and len(d.get("chapters", [])) == 1 and d.get("cover", {}).get("org") == "测试单位",
      f"status={s} title={d.get('title')}")

# 4. admin 查
s, d = call("GET", f"/api/booklets/{aid}", AT)
check("admin 查详情", s == 200 and d.get("chapters", [{}])[0].get("content") == "# 你好", f"status={s}")

# 5. testvip 建
s, d = call("POST", "/api/booklets", VT, {"title": "会员的册子", "book_type": "ppt"})
check("testvip 新建 ppt 草稿", s == 200 and d.get("owner_role") == "member", f"status={s} role={d.get('owner_role')}")
vid = d.get("id", "")

# 6. admin 列表可见全部（含会员的）
s, d = call("GET", "/api/booklets", AT)
ids = [b["id"] for b in d.get("booklets", [])]
check("admin 列表含双方草稿", s == 200 and aid in ids and vid in ids, f"status={s} n={len(ids)}")
adm_item = next((b for b in d.get("booklets", []) if b["id"] == aid), {})
check("列表为摘要（含 chapter_count，无全文）", adm_item.get("chapter_count") == 1 and "chapters" not in adm_item, str(adm_item.get("chapter_count")))

# 7. testvip 列表只见自己的
s, d = call("GET", "/api/booklets", VT)
ids = [b["id"] for b in d.get("booklets", [])]
check("testvip 列表只见自己", s == 200 and vid in ids and aid not in ids, f"status={s} n={len(ids)}")

# 8. testvip 查/改/删 admin 草稿 → 403
s, _ = call("GET", f"/api/booklets/{aid}", VT)
check("testvip 查 admin 草稿 → 403", s == 403, f"status={s}")
s, _ = call("PUT", f"/api/booklets/{aid}", VT, {"title": "篡改"})
check("testvip 改 admin 草稿 → 403", s == 403, f"status={s}")
s, _ = call("DELETE", f"/api/booklets/{aid}", VT)
check("testvip 删 admin 草稿 → 403", s == 403, f"status={s}")

# 9. 不存在 404
s, _ = call("GET", "/api/booklets/bk-notexist000", AT)
check("不存在草稿 → 404", s == 404, f"status={s}")

# 10. 未登录 401
s, _ = call("GET", "/api/booklets")
check("未登录 → 401", s == 401, f"status={s}")

# 11. testvip 删自己的 / admin 删自己的
s, d = call("DELETE", f"/api/booklets/{vid}", VT)
check("testvip 删自己草稿", s == 200 and d.get("ok"), f"status={s}")
s, d = call("DELETE", f"/api/booklets/{aid}", AT)
check("admin 删自己草稿", s == 200 and d.get("ok"), f"status={s}")
s, _ = call("GET", f"/api/booklets/{aid}", AT)
check("删除后查询 → 404", s == 404, f"status={s}")

fails = [r for r in results if not r[1]]
print(f"\n== {len(results)-len(fails)}/{len(results)} PASS ==")
raise SystemExit(1 if fails else 0)
