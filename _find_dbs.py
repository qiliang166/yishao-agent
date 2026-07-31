
import os, sqlite3
base = '/tmp/yishao_new'
for root, dirs, files in os.walk(base):
    for f in files:
        fp = os.path.join(root, f)
        if f.endswith('.db') or f.endswith('.sqlite') or f.endswith('.sqlite3'):
            size = os.path.getsize(fp)
            print(f'Found: {fp} ({size} bytes)')
            if size > 10000:
                try:
                    conn = sqlite3.connect(fp)
                    tabs = [t[0] for t in conn.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()]
                    print(f'  Tables: {tabs}')
                    if 'projects' in tabs:
                        cnt = conn.execute('SELECT count(*) FROM projects').fetchone()[0]
                        print(f'  Projects: {cnt}')
                    conn.close()
                except Exception as e:
                    print(f'  Error: {e}')

# Also check for any other DB files on the system
import subprocess
result = subprocess.run(['find', '/root', '/tmp', '/opt', '-name', '*.db', '-size', '+1M', '-type', 'f'], 
                       capture_output=True, text=True, timeout=10)
print('Large DB files found:')
print(result.stdout[:1000])
