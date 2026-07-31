
import sqlite3
db = '/opt/yishao-agent/backend/data/yishao.db'
conn = sqlite3.connect(db)
conn.row_factory = sqlite3.Row

# Check admin password setting
row = conn.execute("SELECT value FROM settings WHERE key='admin_password'").fetchone()
print('admin_password:', row['value'][:20] if row and row['value'] else 'NOT SET')

row2 = conn.execute("SELECT value FROM settings WHERE key='admin_password_enabled'").fetchone()
print('admin_password_enabled:', row2['value'] if row2 else 'NOT SET')

# Check license
row3 = conn.execute('SELECT * FROM license').fetchone()
if row3:
    print('License:', dict(row3))
else:
    print('No license found')

# Check fingerprint in settings
row4 = conn.execute("SELECT * FROM settings WHERE key LIKE '%fingerprint%'").fetchall()
for r in row4:
    print(f'Setting: {r["key"]} = {r["value"][:50] if r["value"] else ""}')

conn.close()
