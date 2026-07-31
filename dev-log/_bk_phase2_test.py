# -*- coding: utf-8 -*-
"""Phase 2 验收：available-content / content-item + 会员解锁过滤"""
import json
import sqlite3
import urllib.parse
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


db = sqlite3.connect("backend/data/yishao.db")
db.row_factory = sqlite3.Row
FOOD_WS = db.execute("SELECT id FROM workspaces WHERE name='食品安全'").fetchone()["id"]
P1 = db.execute("SELECT id FROM projects WHERE name='食品安全测试1'").fetchone()["id"]  # testvip 已解锁
P2 = db.execute("SELECT id FROM projects WHERE name='食品安全测试2'").fetchone()["id"]  # 未解锁
YANXI_DB = db.execute(
    "SELECT content FROM step_results WHERE project_id=? AND step_name='step2_yanxi'", (P1,)
).fetchone()["content"]
db.close()

q = urllib.parse.quote

# 1. admin 工作区列表
s, d = call("GET", "/api/booklets/available-content?book_type=a4", AT)
ws_ids = [w["id"] for w in d.get("workspaces", [])]
check("admin 工作区列表含食品安全", s == 200 and FOOD_WS in ws_ids, f"status={s} n={len(ws_ids)}")

# 2. admin 明细树（a4）
s, d = call("GET", f"/api/booklets/available-content?book_type=a4&workspace_id={FOOD_WS}", AT)
projs = {p["id"]: p for p in d.get("projects", [])}
check("admin a4 明细树含两个明细", s == 200 and P1 in projs and P2 in projs, f"status={s} n={len(projs)}")
p1_items = {i["source_key"]: i for i in projs.get(P1, {}).get("items", [])}
check("测试1 三篇文档 available=true",
      all(p1_items.get(k, {}).get("available") for k in ("step2_sop", "step2_daoshuyi", "step2_yanxi")),
      str({k: p1_items.get(k, {}).get("available") for k in ("step2_sop", "step2_daoshuyi", "step2_yanxi")}))
check("测试1 综合演讲稿 available=true", p1_items.get("step4_speech_comprehensive", {}).get("available") is True, "")
check("测试1 文档演讲稿 available=false（未生成）", p1_items.get("step4_speech_doc", {}).get("available") is False, "")
col3_item = next((i for i in projs.get(P1, {}).get("items", []) if i["source_type"] == "a4_html"), {})
check("测试1 文档课件项存在且可用", col3_item.get("available") is True, f"key={col3_item.get('source_key')}")

# 3. admin ppt 明细树
s, d = call("GET", f"/api/booklets/available-content?book_type=ppt&workspace_id={FOOD_WS}", AT)
projs_ppt = {p["id"]: p for p in d.get("projects", [])}
ppt_items = projs_ppt.get(P1, {}).get("items", [])
check("ppt 树只含 PPT 项（无 step_md）",
      s == 200 and ppt_items and all(i["source_type"] == "ppt_html" for i in ppt_items),
      f"types={[i['source_type'] for i in ppt_items]}")
check("ppt 树含 col4+col5 两项", len(ppt_items) == 2 and all(i["available"] for i in ppt_items),
      str([(i["label"], i["available"]) for i in ppt_items]))

# 4. content-item: step_md 与 DB 一致
s, d = call("GET", f"/api/booklets/content-item?project_id={P1}&source_type=step_md&source_key=step2_yanxi", AT)
check("content-item step2_yanxi 与 DB 一致", s == 200 and d.get("content") == YANXI_DB and d.get("content_format") == "md",
      f"status={s} len={len(d.get('content', ''))}")

# 5. content-item: a4_html
run_key = col3_item.get("source_key", "")
s, d = call("GET", f"/api/booklets/content-item?project_id={P1}&source_type=a4_html&source_key={q(run_key)}", AT)
check("content-item col3 HTML 读取成功", s == 200 and d.get("content_format") == "html" and "<html" in d.get("content", "").lower(),
      f"status={s} len={len(d.get('content', ''))}")

# 6. 非法 source_key（目录穿越尝试）
s, _ = call("GET", f"/api/booklets/content-item?project_id={P1}&source_type=a4_html&source_key={q('../../etc/passwd')}", AT)
check("目录穿越 source_key → 400", s == 400, f"status={s}")
s, _ = call("GET", f"/api/booklets/content-item?project_id={P1}&source_type=step_md&source_key=raw_text", AT)
check("非白名单 step key → 400", s == 400, f"status={s}")

# 7. 未生成内容 → 404
s, _ = call("GET", f"/api/booklets/content-item?project_id={P1}&source_type=step_md&source_key=step4_speech_doc", AT)
check("未生成内容 → 404", s == 404, f"status={s}")

# 8. 会员：工作区列表只含有解锁明细的工作区
s, d = call("GET", "/api/booklets/available-content?book_type=a4", VT)
ws_ids = [w["id"] for w in d.get("workspaces", [])]
check("testvip 工作区列表 = 仅食品安全", s == 200 and ws_ids == [FOOD_WS], f"ws={ws_ids}")

# 9. 会员：明细树只含已解锁明细
s, d = call("GET", f"/api/booklets/available-content?book_type=a4&workspace_id={FOOD_WS}", VT)
ids = [p["id"] for p in d.get("projects", [])]
check("testvip 明细树只含测试1", s == 200 and ids == [P1], f"ids={ids}")

# 10. 会员：已解锁 content-item 成功
s, d = call("GET", f"/api/booklets/content-item?project_id={P1}&source_type=step_md&source_key=step2_yanxi", VT)
check("testvip 取已解锁内容成功", s == 200 and d.get("content") == YANXI_DB, f"status={s}")

# 11. 会员：未解锁 content-item → 403
s, _ = call("GET", f"/api/booklets/content-item?project_id={P2}&source_type=step_md&source_key=step2_yanxi", VT)
check("testvip 取未解锁明细 → 403", s == 403, f"status={s}")

# 12. 未登录 401
s, _ = call("GET", "/api/booklets/available-content?book_type=a4")
check("未登录 available-content → 401", s == 401, f"status={s}")

# 13. 非法 book_type 400
s, _ = call("GET", "/api/booklets/available-content?book_type=pdf", AT)
check("非法 book_type → 400", s == 400, f"status={s}")

fails = [r for r in results if not r[1]]
print(f"\n== {len(results)-len(fails)}/{len(results)} PASS ==")
raise SystemExit(1 if fails else 0)
