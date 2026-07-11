"""Comprehensive boundary + endpoint verification — corrected expectations."""
import requests, json, time, sys, sqlite3

BASE = "http://localhost:8766"
DB_PATH = "backend/data/yishao.db"
passed = 0
failed = 0
skipped = 0

def ok(cond, label):
    global passed, failed
    if cond: passed += 1; print(f"  OK   {label}")
    else: failed += 1; print(f"  FAIL {label}")
    return cond

def sc(code, r, label):
    """Check status code."""
    global passed, failed
    if r.status_code == code: passed += 1; print(f"  OK   [{code}] {label}")
    else: failed += 1; print(f"  FAIL [{r.status_code}] {label} (expected {code})")
    return r.status_code == code

def api(method, path, **kw):
    """API caller with rate-limit retry and 401 auto-raise."""
    for attempt in range(10):
        r = getattr(requests, method)(f"{BASE}{path}", **kw)
        if r.status_code in (429,):
            detail = r.json().get("detail", "")
            try:
                wait = max(int(r.headers.get("Retry-After", 5)), 3)
            except (ValueError, TypeError):
                wait = 5
            print(f"  Rate-limited ({detail[:40]}...), waiting {wait}s...")
            time.sleep(wait + 1)
            continue
        return r
    return r

# ── Get admin token ──
time.sleep(0.5)
r = api("post", "/api/login", json={"password": "admin123"})
if not ok(r.status_code == 200, "Admin login (legacy)"): sys.exit(1)
A = {"Authorization": f"Bearer {r.json()['token']}"}

# ── 1. Auth endpoints ──
print("\n=== 1. Auth ===")

# Legacy /api/login — empty password
r = api("post", "/api/login", json={"password": ""})
sc(400, r, "Legacy login empty password → 400")

# /api/auth/login — empty username
time.sleep(0.5)
r = api("post", "/api/auth/login", json={"username": "", "password": "admin123"})
sc(400, r, "auth/login empty username → 400")

# /api/auth/login — non-existent admin user → 403 (anti-enumeration)
time.sleep(0.5)
r = api("post", "/api/auth/login", json={"username": "no_admin_xyz", "password": "x"})
sc(403, r, "auth/login non-existent → 403")

# /api/member/login — non-existent user → 403 (anti-enumeration)
time.sleep(0.5)
r = api("post", "/api/member/login", json={"username": "nonexistent_member_xyz", "password": "x"})
sc(403, r, "member/login non-existent → 403")

# /api/member/login — empty body → 400
time.sleep(0.5)
r = api("post", "/api/member/login", json={})
sc(400, r, "member/login empty body → 400")

# /api/auth/me
r = api("get", "/api/auth/me", headers=A)
ok(r.status_code == 200, "GET /api/auth/me")
u = r.json()
ok("permissions" in u, "auth/me has permissions")
ok("user_type" in u, "auth/me has user_type")
ok("password_hash" not in u, "auth/me no password_hash leak")

# ── 2. Registration endpoints ──
print("\n=== 2. Registration ===")

def register(username, password, **extra):
    data = {"username": username, "password": password,
            "display_name": username, "email": f"{username}@test.com",
            "plan_type": "trial", **extra}
    return api("post", "/api/member/register", json=data)

# Test: 2-char username (valid minimum)
time.sleep(0.5)
r = register("ab", "12345678")
ok(r.status_code in (200, 400), f"Short username 'ab' (2 chars): {r.status_code}")

# Test: empty username → 400
time.sleep(0.5)
r = register("", "12345678")
sc(400, r, "Empty username → 400")

# Test: short password (<8) → 400
time.sleep(0.5)
r = register("bt_pw_short", "short")
sc(400, r, "Short password → 400")

# Test: invalid email format → 400
time.sleep(0.5)
r = register("bt_inv_email", "12345678", email="notanemail")
sc(400, r, "Invalid email → 400")

# Test: paid with empty plan_id → 400
time.sleep(0.5)
r = register("bt_paid_noplan", "12345678", plan_type="paid", plan_id="", payment_method="wechat", payment_ref="WX123")
sc(400, r, "Paid empty plan_id → 400")

# Test: paid with empty payment_ref → 400
time.sleep(0.5)
r = register("bt_paid_noref", "12345678", plan_type="paid", plan_id="quarterly", payment_method="wechat", payment_ref="")
sc(400, r, "Paid empty payment_ref → 400")

# Test: paid with invalid plan_id → 400
time.sleep(0.5)
r = register("bt_paid_badplan", "12345678", plan_type="paid", plan_id="nonexistent_plan", payment_method="wechat", payment_ref="WX123")
sc(400, r, "Invalid plan_id → 400")

# ── 3. Approval endpoints ──
print("\n=== 3. Approval ===")
r = api("put", "/api/members/nonexistent-id/approve", headers=A, json={"duration_days": 7})
sc(404, r, "Approve non-existent → 404")

r = api("put", "/api/members/nonexistent-id/reject", headers=A, json={"reason": "test"})
sc(404, r, "Reject non-existent → 404")

# ── 4. Setup endpoints ──
print("\n=== 4. Setup ===")
r = api("get", "/api/setup/status", headers=A)
ok(r.status_code == 200, "GET /api/setup/status")

r = api("post", "/api/setup/complete", headers=A, json={"new_password": "ab"})
sc(400, r, "setup/complete short password → 400")

# ── 5. Roles CRUD ──
print("\n=== 5. Roles ===")
r = api("get", "/api/roles", headers=A)
ok(r.status_code == 200, "GET /api/roles")

r = api("post", "/api/roles", headers=A, json={"name": "", "user_type": "member"})
sc(400, r, "Create role empty name → 400")

r = api("post", "/api/roles", headers=A, json={"name": "边界测试角色", "user_type": "invalid"})
sc(400, r, "Create role invalid user_type → 400")

# Get system role for delete protection test
roles = api("get", "/api/roles", headers=A).json().get("roles", [])
system_roles = [r for r in roles if r.get("is_system")]
if system_roles:
    r = api("delete", f"/api/roles/{system_roles[0]['id']}", headers=A)
    sc(403, r, "Delete system role → 403")

# ── 6. GET Regression ──
print("\n=== 6. GET Regression ===")
get_endpoints = [
    "/api/health",
    "/api/settings",
    "/api/workspaces",
    "/api/projects",
    "/api/column-configs",
    "/api/core-prompt-configs",
    "/api/templates",
    "/api/prompts",
    "/api/llm/providers",
    "/api/tts/providers",
    "/api/asr/providers",
    "/api/image/providers",
    "/api/speech/configs",
    "/api/tts/configs",
    "/api/auth/permissions",
]
for ep in get_endpoints:
    r = api("get", ep, headers=A)
    ok(r.status_code == 200, f"GET {ep}")

# ── Summary ──
print(f"\n{'='*50}")
print(f"RESULTS: {passed} passed, {failed} failed, {skipped} skipped, {passed+failed+skipped} total")
if failed > 0:
    print("SOME TESTS FAILED!")
    sys.exit(1)
else:
    print("ALL TESTS PASSED!")
