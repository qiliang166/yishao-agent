# 预览端点验证：HTML 注入防复制 + CSP 头 + 文本类不受影响
import json, sqlite3, subprocess, time, urllib.parse, urllib.request

DB = r"D:\YISHAOAGENT\backend\data\yishao.db"
BASE = "http://127.0.0.1:8766"
from jose import jwt

db = sqlite3.connect(DB); db.row_factory = sqlite3.Row
u = db.execute("SELECT * FROM users WHERE username='testmember'").fetchone()
tok = jwt.encode({"sub": u["id"], "username": u["username"], "user_type": u["user_type"],
                  "token_version": u["token_version"], "exp": int(time.time()) + 3600,
                  "permissions": [], "roles": []}, "yishao-agent-jwt-secret-2026", algorithm="HS256")

req = urllib.request.Request(f"{BASE}/api/member/downloadable-projects", headers={"Authorization": f"Bearer {tok}"})
projects = json.loads(urllib.request.urlopen(req).read())["projects"]

html_t = txt_t = None
for p in projects:
    for f in p["files"]:
        ext = (f.get("ext") or "").lower()
        if ext in ("html", "htm") and not html_t:
            html_t = (p["id"], f["filename"])
        if ext == "txt" and not txt_t:
            txt_t = (p["id"], f["filename"])
print("样本: html=", html_t, " txt=", txt_t)

def preview_url(pid, fn):
    return f"{BASE}/api/member/preview-file?project_id={pid}&filename={urllib.parse.quote(fn)}&token={tok}"

# 1) HTML: 注入的防复制 guard 必须出现且在 </head> 之前
if html_t:
    body = urllib.request.urlopen(preview_url(*html_t)).read().decode("utf-8", "ignore")
    has_guard = "-webkit-user-select:none!important" in body and "selectstart" in body
    guard_pos = body.find("-webkit-user-select:none!important")
    head_pos = body.lower().find("</head>")
    print(f"1) HTML注入guard: {has_guard}; guard在</head>前: {0 < guard_pos < head_pos if head_pos > 0 else '无head'}")
    h = subprocess.run(["curl", "-s", "-D", "-", "-o", "/dev/null", preview_url(*html_t)],
                       capture_output=True, text=True).stdout.lower()
    print(f"2) HTML CSP头: {'content-security-policy: sandbox allow-scripts' in h}; content-type带charset: {'text/html; charset=utf-8' in h}; 无attachment: {'attachment' not in h}")

# 2) TXT: 原样输出，不含 guard
if txt_t:
    body = urllib.request.urlopen(preview_url(*txt_t)).read().decode("utf-8", "ignore")
    print(f"3) TXT不含guard: {'-webkit-user-select' not in body}; 长度: {len(body)}")
    h = subprocess.run(["curl", "-s", "-D", "-", "-o", "/dev/null", preview_url(*txt_t)],
                       capture_output=True, text=True).stdout.lower()
    print(f"4) TXT CSP头: {'content-security-policy' in h}; charset: {'charset=utf-8' in h}")

# 3) 预览不落下载日志
n0 = db.execute("SELECT COUNT(*) c FROM download_logs").fetchone()["c"]
if html_t:
    urllib.request.urlopen(preview_url(*html_t)).read()
n1 = sqlite3.connect(DB).execute("SELECT COUNT(*) FROM download_logs").fetchone()[0]
print(f"5) 预览后 download_logs 增量: {n1 - n0} (预期0)")
