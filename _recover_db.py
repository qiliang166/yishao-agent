"""Recover deleted yishao-agent database from raw disk - scan entire disk."""
import os, sys, sqlite3

DISK = "/dev/vda3"
OUTPUT = "/tmp/yishao_recovered_final.db"

YISHAO_SIGNATURE = [
    b"asr_providers", b"tts_configs", b"prompt_studio_saves",
    b"member_workspaces", b"workspace_roles", b"core_prompt_configs",
    b"speech_configs", b"project_item_results", b"step_results",
    b"scoring_baselines", b"scoring_models", b"source_materials"
]

def find_sqlite_headers(data, start_offset):
    target = b"SQLite format 3\x00"
    results = []
    idx = 0
    while True:
        i = data.find(target, idx)
        if i == -1:
            break
        if len(data) > i + 100:
            hdr = data[i:i+100]
            ps = int.from_bytes(hdr[16:18], "big")
            np = int.from_bytes(hdr[28:32], "big")
            if 512 <= ps <= 65536 and np > 0:
                first_page = data[i:i+ps]
                text = first_page.decode("latin-1", errors="replace")
                score = sum(1 for s in YISHAO_SIGNATURE if s.decode() in text)
                if score >= 1:
                    results.append({
                        "offset": start_offset + i,
                        "page_size": ps,
                        "num_pages": np,
                        "size_mb": (np * ps) / (1024*1024),
                        "score": score,
                    })
        idx = i + 1
    return results

chunk_mb = 50
chunk = chunk_mb * 1024 * 1024
total = os.path.getsize(DISK)
max_scan = min(total, 35 * 1024**3)  # Scan up to 35GB

all_dbs = []
off = 0
while off < max_scan:
    with open(DISK, "rb") as f:
        f.seek(off)
        data = f.read(chunk)
    if not data:
        break
    dbs = find_sqlite_headers(data, off)
    for db in dbs:
        all_dbs.append(db)
        print(f"DB at {db['offset']} ({db['offset']//1024**3}GB): "
              f"size={db['size_mb']:.1f}MB score={db['score']}")
    off += chunk - 65536
    if off % (2 * 1024**3) < chunk:
        print(f"Scanned {off//1024**3}GB...", flush=True)

print(f"\nTotal candidates: {len(all_dbs)}")
if not all_dbs:
    print("NO YISHAO DATABASES FOUND")
    sys.exit(1)

best = max(all_dbs, key=lambda x: x["score"])
print(f"Best: offset={best['offset']} score={best['score']} size={best['size_mb']:.1f}MB")

db_size = best["num_pages"] * best["page_size"]
with open(DISK, "rb") as f:
    f.seek(best["offset"])
    data = f.read(db_size)
with open(OUTPUT, "wb") as f:
    f.write(data)
print(f"Extracted {db_size} bytes to {OUTPUT}")

try:
    conn = sqlite3.connect(OUTPUT)
    tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
    print(f"Tables: {[t[0] for t in tables]}")
    for t in tables:
        try:
            cnt = conn.execute(f"SELECT count(*) FROM [{t[0]}]").fetchone()[0]
            print(f"  {t[0]}: {cnt} rows")
        except Exception as e:
            print(f"  {t[0]}: {e}")
    conn.close()
except Exception as e:
    print(f"DB validation error: {e}")
