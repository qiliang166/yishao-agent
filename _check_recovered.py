import sqlite3, os

print('=== recovered_slide_plan.txt ===')
with open('/tmp/recovered_slide_plan.txt', 'r', errors='replace') as f:
    text = f.read()
print(text[:3000])

print()
print('=== recovered_project_meta.txt ===')
with open('/tmp/recovered_project_meta.txt', 'r', errors='replace') as f:
    print(f.read())

print()
print('=== Checking recovered databases ===')
for name in ['/tmp/recovered_db.db', '/tmp/recovered_large.db', '/tmp/recovered_small.db']:
    try:
        conn = sqlite3.connect(name)
        tables = conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        tnames = [t[0] for t in tables]
        print(f'{name}: tables={tnames}')
        for t in tables:
            try:
                cnt = conn.execute("SELECT count(*) FROM [{}]".format(t[0])).fetchone()[0]
                print(f'  {t[0]}: {cnt} rows')
            except Exception as e:
                print(f'  {t[0]}: {e}')
        conn.close()
    except Exception as e:
        print(f'{name}: {e}')

print()
print('=== /tmp/yishao_new DBs ===')
for root, dirs, files in os.walk('/tmp/yishao_new'):
    for f in files:
        if f.endswith('.db') or f.endswith('.sqlite'):
            fp = os.path.join(root, f)
            print(f'DB: {fp} ({os.path.getsize(fp)} bytes)')
