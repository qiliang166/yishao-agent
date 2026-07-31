import sqlite3, os, json

results = []

results.append('=== recovered_slide_plan.txt ===')
with open('/tmp/recovered_slide_plan.txt', 'r', errors='replace') as f:
    text = f.read()
results.append(text[:5000])

results.append('=== recovered_project_meta.txt ===')
with open('/tmp/recovered_project_meta.txt', 'r', errors='replace') as f:
    results.append(f.read())

results.append('=== Checking recovered databases ===')
for name in ['/tmp/recovered_db.db', '/tmp/recovered_large.db', '/tmp/recovered_small.db']:
    try:
        conn = sqlite3.connect(name)
        tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        tnames = [t[0] for t in tables]
        results.append(f'{name}: tables={tnames}')
        for t in tables:
            try:
                cnt = conn.execute("SELECT count(*) FROM [{}]".format(t[0])).fetchone()[0]
                results.append(f'  {t[0]}: {cnt} rows')
                # If projects table, show all project names
                if t[0] == 'projects' and cnt > 0:
                    projs = conn.execute('SELECT id, name, created_at, updated_at FROM projects ORDER BY updated_at DESC').fetchall()
                    for p in projs:
                        results.append(f'    {p[0][:12]} | {p[1]} | created={p[2]} | updated={p[3]}')
            except Exception as e:
                results.append(f'  {t[0]}: {e}')
        conn.close()
    except Exception as e:
        results.append(f'{name}: {e}')

results.append('=== /tmp/yishao_new DBs ===')
for root, dirs, files in os.walk('/tmp/yishao_new'):
    for f in files:
        if f.endswith('.db') or f.endswith('.sqlite'):
            fp = os.path.join(root, f)
            results.append(f'DB: {fp} ({os.path.getsize(fp)} bytes)')

with open('/tmp/_recovery_report.txt', 'w', encoding='utf-8') as f:
    f.write('
'.join(results))
print('Report written to /tmp/_recovery_report.txt')
