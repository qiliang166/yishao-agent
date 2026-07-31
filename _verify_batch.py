"""
Full verification: batch scheduler vs manual pipeline.
Pure HTTP approach — no backend imports, no DB contention.
"""
import json
import os
import sys
import sqlite3
import time
import urllib.request
import urllib.error
from datetime import datetime, timedelta, timezone

import jwt

JWT_SECRET = os.environ.get("JWT_SECRET", "yishao-agent-jwt-secret-2026")
BASE_URL = "http://127.0.0.1:8766"
BATCH_PROJECT = "8074f9c3f088"
MANUAL_PROJECT = "9eb3e44e7851"
WORKSPACE_ID = "d970b2ea904c"
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "backend", "data", "yishao.db")

def _open_db():
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA busy_timeout=10000")  # 10s timeout
    return db

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace', line_buffering=True)
elif hasattr(sys.stdout, 'buffer'):
    sys.stdout = open(sys.stdout.fileno(), mode='w', encoding='utf-8', errors='replace', buffering=1)


def make_token():
    """Generate admin JWT with permissions from DB."""
    payload = {
        "sub": "admin",
        "user_type": "admin",
        "exp": datetime.now(timezone.utc) + timedelta(hours=72),
    }
    try:
        db = _open_db()
        admin = db.execute("SELECT id FROM users WHERE user_type='admin' LIMIT 1").fetchone()
        if admin:
            rows = db.execute(
                "SELECT DISTINCT rp.permission FROM role_permissions rp "
                "JOIN user_roles ur ON ur.role_id = rp.role_id "
                "WHERE ur.user_id = ?", (admin["id"],)
            ).fetchall()
            payload["permissions"] = [r["permission"] for r in rows]
        db.close()
    except Exception as e:
        print(f"  [WARN] Token permissions lookup failed: {e}")
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


TOKEN = make_token()
print(f"Token ready ({len(TOKEN)} chars)")


def api(method, path, data=None, timeout=600):
    url = f"{BASE_URL}{path}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:500]
        print(f"  API ERROR {e.code}: {body}")
        raise


# ── Step 1: Clear batch project steps via direct DB ──
print("=" * 60)
print("Step 1: Clearing batch project steps...")
db = _open_db()
existing = db.execute(
    "SELECT step_name FROM step_results WHERE project_id=? AND step_name != 'raw_text'",
    (BATCH_PROJECT,)
).fetchall()
for row in existing:
    print(f"  Deleting: {row['step_name']}")
db.execute(
    "DELETE FROM step_results WHERE project_id=? AND step_name != 'raw_text'",
    (BATCH_PROJECT,)
)
db.commit()
db.close()
print(f"  Deleted {len(existing)} steps (kept raw_text)")

# ── Step 2: Submit batch job ──
print("\n" + "=" * 60)
print("Step 2: Submitting batch job...")

payload = {
    "project_steps": {
        BATCH_PROJECT: {
            "steps": [
                ["1", ["text"]],
                ["2", ["sop", "dao", "yanxi"]],
                ["3", ["doc-ppt", "analysis-ppt", "comprehensive-ppt"]],
            ],
            "step2_sources": {"sop": "text", "dao": "text", "yanxi": "text"},
        }
    },
    "workspace_id": WORKSPACE_ID,
    "start_time": "2026-07-27 00:00",
    "end_time": "2026-07-28 23:59",
}

resp = api("POST", "/api/batch/execute", payload)
batch_id = resp.get("batch_id", "")
print(f"  Batch ID: {batch_id}")
print(f"  Status: {resp.get('status', '?')}")
if resp.get("conflicts"):
    print(f"  WARNING: Conflicts: {resp['conflicts']}")

if not batch_id:
    print("  FAILED: No batch_id returned!")
    sys.exit(1)

# ── Step 3: Poll until complete ──
print("\n" + "=" * 60)
print(f"Step 3: Polling batch {batch_id}...")

final_status = None
for i in range(180):  # 30 minutes max
    time.sleep(10)
    try:
        status = api("GET", f"/api/batch/status/{batch_id}", timeout=30)
    except Exception as e:
        print(f"  [{(i+1)*10}s] Poll error: {e}")
        continue

    if not status:
        print(f"  [{(i+1)*10}s] No status found!")
        continue

    s = status.get("status", "?")
    items = status.get("items", [])

    # Compact status line
    item_statuses = "/".join(
        f"{it.get('project_name','?')[:8]}={it.get('status','?')}"
        for it in items
    )

    # Last log line
    last_log = ""
    for it in items:
        logs = it.get("logs", [])
        if logs:
            last_log = logs[-1][:100]

    print(f"  [{(i+1)*10}s] batch={s} | {item_statuses} | {last_log}")

    if s in ("completed", "cancelled", "failed"):
        print(f"\n  === Final: {s} ===")
        for it in items:
            print(f"\n  --- {it.get('project_name', '?')} [{it.get('status', '?')}] ---")
            for log in it.get("logs", []):
                print(f"    {log}")
        final_status = status
        break
else:
    print("  TIMEOUT after 30 min")

if not final_status:
    print("  No final status obtained!")
    sys.exit(1)

# Check if batch succeeded
items = final_status.get("items", [])
if not items or items[0].get("status") != "completed":
    print("  Batch did NOT complete successfully!")
    sys.exit(1)

# ── Step 4: Compare results ──
print("\n" + "=" * 60)
print("Step 4: Comparing batch vs manual results...")
print("=" * 60)

batch_steps = api("GET", f"/api/projects/{BATCH_PROJECT}/steps")
manual_steps = api("GET", f"/api/projects/{MANUAL_PROJECT}/steps")

b_list = batch_steps.get("steps", batch_steps) if isinstance(batch_steps, dict) else batch_steps
m_list = manual_steps.get("steps", manual_steps) if isinstance(manual_steps, dict) else manual_steps
if isinstance(b_list, dict):
    b_list = b_list.get("steps", [])
if isinstance(m_list, dict):
    m_list = m_list.get("steps", [])

b_map = {s["step_name"]: s for s in b_list}
m_map = {s["step_name"]: s for s in m_list}

compare_pairs = [
    ("step1_text", "Step1·整理文字"),
    ("step2_sop", "Step2·标准文档"),
    ("step2_daoshuyi", "Step2·分析文档"),
    ("step2_yanxi", "Step2·综合文档"),
    ("step3_sop_doc", "Step3·文档课件"),
    ("step3_dao_ppt", "Step3·分析PPT"),
    ("step3_yan_ppt", "Step3·综合PPT"),
    ("_ppt_outline_json_step3_sop_doc", "Step3·大纲JSON(文档课件)"),
    ("_ppt_outline_json_step3_dao_ppt", "Step3·大纲JSON(分析PPT)"),
    ("_ppt_outline_json_step3_yan_ppt", "Step3·大纲JSON(综合PPT)"),
    ("_ppt_plan_step3_sop_doc", "Step3·PPT计划(文档课件)"),
    ("_ppt_plan_step3_dao_ppt", "Step3·PPT计划(分析PPT)"),
    ("_ppt_plan_step3_yan_ppt", "Step3·PPT计划(综合PPT)"),
]

all_ok = True
results = []
for step_name, label in compare_pairs:
    b = b_map.get(step_name, {})
    m = m_map.get(step_name, {})

    b_content = (b.get("content") or "") if b else ""
    m_content = (m.get("content") or "") if m else ""
    b_type = (b.get("content_type") or "?") if b else "?"
    m_type = (m.get("content_type") or "?") if m else "?"

    b_len = len(b_content)
    m_len = len(m_content)

    # For JSON steps, compare structure
    struct_info = ""
    try:
        b_json = json.loads(b_content) if b_content else None
        m_json = json.loads(m_content) if m_content else None
        if b_json is not None and m_json is not None:
            if isinstance(b_json, list) and isinstance(m_json, list):
                struct_info = f" | pages: batch={len(b_json)} manual={len(m_json)}"
                if len(b_json) == len(m_json):
                    struct_info += " [OK]"
                else:
                    struct_info += " [DIFF!]"
                    all_ok = False
            elif isinstance(b_json, dict) and isinstance(m_json, dict):
                b_slides = len(b_json.get("slides", []))
                m_slides = len(m_json.get("slides", []))
                struct_info = f" | slides: batch={b_slides} manual={m_slides}"
                if b_slides == m_slides:
                    struct_info += " [OK]"
                else:
                    struct_info += " [DIFF!]"
                    all_ok = False
    except Exception:
        pass

    status = "OK" if b_len > 0 and m_len > 0 else ("MISSING_BATCH" if b_len == 0 else "MISSING_MANUAL")
    if status != "OK":
        all_ok = False
    results.append(f"  [{status}] {label} ({step_name}) | batch={b_len}chars {b_type} | manual={m_len}chars {m_type}{struct_info}")

print("\n".join(results))

# Summary
print("\n" + "=" * 60)
ok_count = sum(1 for r in results if "[OK]" in r)
missing = sum(1 for r in results if "MISSING" in r)
diff = sum(1 for r in results if "DIFF!" in r)
print(f"SUMMARY: {ok_count} OK, {missing} missing, {diff} structural diffs")
if all_ok:
    print("VERDICT: PASS — all steps produced results in both projects")
else:
    print("VERDICT: ISSUES FOUND — see details above")

print("\nDone.")
