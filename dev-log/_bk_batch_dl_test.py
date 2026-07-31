# 验证 POST /api/member/download-batch：
# T1 admin 跨2项目批量 → 200 zip，按项目名分文件夹；download_logs 逐文件落表(zip_batch)、download_count 增
# T2 会员对未解锁项目 → 402，download_logs 无新增
# T3 >500 文件 → 400
# T4 空 projects → 400
import json, sqlite3, sys, time, urllib.request, urllib.error
sys.path.insert(0, r"D:\YISHAOAGENT\backend")
from jose import jwt

DB = r"D:\YISHAOAGENT\backend\data\yishao.db"
SECRET = "yishao-agent-jwt-secret-2026"
BASE = "http://127.0.0.1:8766"

db = sqlite3.connect(DB); db.row_factory = sqlite3.Row

def mint(uid):
    u = db.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    payload = {"sub": u["id"], "username": u["username"], "user_type": u["user_type"],
               "token_version": u["token_version"], "exp": int(time.time()) + 3600,
               "permissions": [], "roles": []}
    return jwt.encode(payload, SECRET, algorithm="HS256")

def call(token, body):
    req = urllib.request.Request(BASE + "/api/member/download-batch",
        data=json.dumps(body).encode(), method="POST",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    try:
        r = urllib.request.urlopen(req, timeout=60)
        return r.status, r.read(), dict(r.headers)
    except urllib.error.HTTPError as e:
        return e.code, e.read(), {}

# ── 测试数据：取2个有文件的可下载项目 + 1个 admin + 1个普通会员 ──
admin = db.execute("SELECT id FROM users WHERE user_type='admin' AND is_active=1 LIMIT 1").fetchone()
member = db.execute("SELECT id FROM users WHERE user_type='member' AND is_active=1 LIMIT 1").fetchone()
projs = db.execute("SELECT id, name, download_count FROM projects WHERE is_downloadable=1 LIMIT 2").fetchall()
print("admin:", admin["id"], "| member:", member["id"] if member else None)
print("projects:", [(p["id"], p["name"]) for p in projs])

# 拿每个项目的真实文件清单（走列表端点，admin 也可见需用会员？downloadable-projects 只对会员可见项目过滤
# —— 直接从磁盘/接口拿太绕，改走 files 端点等价数据：用 admin 调 /api/projects/{id}/files）
def project_files(token, pid):
    req = urllib.request.Request(f"{BASE}/api/projects/{pid}/files",
        headers={"Authorization": f"Bearer {token}"})
    d = json.loads(urllib.request.urlopen(req, timeout=30).read())
    out = []
    for f in d.get("files", []):
        if f.get("download_url"):
            out.append({"filename": f["filename"], "download_url": f["download_url"],
                        "display_name": f.get("display_name") or f["filename"]})
    return out

atok = mint(admin["id"])
groups = []
for p in projs:
    fl = project_files(atok, p["id"])[:3]
    if fl:
        groups.append({"project_id": p["id"], "files": fl})
print("groups:", [(g["project_id"], len(g["files"])) for g in groups])

logs_before = db.execute("SELECT COUNT(*) c FROM download_logs WHERE download_type='zip_batch'").fetchone()["c"]
cnt_before = {p["id"]: p["download_count"] for p in projs}

# T1 admin 批量
st, body, hdrs = call(atok, {"projects": groups})
print("\nT1 admin 批量:", st, "bytes:", len(body))
if st == 200:
    import io, zipfile
    names = zipfile.ZipFile(io.BytesIO(body)).namelist()
    print("   zip 条目:", names[:8])
    folders = sorted({n.split("/")[0] for n in names})
    print("   文件夹:", folders)
    print("   Content-Disposition:", hdrs.get("Content-Disposition", "")[:80])

db2 = sqlite3.connect(DB); db2.row_factory = sqlite3.Row
logs_after = db2.execute("SELECT COUNT(*) c FROM download_logs WHERE download_type='zip_batch'").fetchone()["c"]
expect_logs = sum(len(g["files"]) for g in groups)
print("   download_logs(zip_batch) 新增:", logs_after - logs_before, "预期:", expect_logs)
for p in projs:
    now = db2.execute("SELECT download_count FROM projects WHERE id=?", (p["id"],)).fetchone()["download_count"]
    print(f"   download_count {p['name']}: {cnt_before[p['id']]} -> {now}")

# T2 会员未解锁 → 402 且不落日志
if member and groups:
    mtok = mint(member["id"])
    pid = groups[0]["project_id"]
    db2.execute("DELETE FROM project_unlocks WHERE user_id=? AND project_id=?", (member["id"], pid))
    db2.commit()
    lb = db2.execute("SELECT COUNT(*) c FROM download_logs").fetchone()["c"]
    st2, body2, _ = call(mtok, {"projects": [groups[0]]})
    la = sqlite3.connect(DB).execute("SELECT COUNT(*) c FROM download_logs").fetchone()[0]
    print("\nT2 会员未解锁:", st2, body2[:80], "| 日志新增:", la - lb, "(预期 0)")

# T3 >500 文件
big = [{"project_id": "x", "files": [{"filename": f"f{i}.txt"} for i in range(501)]}]
st3, body3, _ = call(atok, {"projects": big})
print("\nT3 501文件:", st3, body3[:60])

# T4 空
st4, body4, _ = call(atok, {"projects": []})
print("T4 空列表:", st4, body4[:60])
