
import sqlite3
import bcrypt
db = '/opt/yishao-agent/backend/data/yishao.db'
conn = sqlite3.connect(db)
password = 'admin123'
hashed = bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt()).decode()
conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ('admin_password', hashed))
conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", ('admin_password_enabled', '1'))
conn.commit()
# verify
r = conn.execute("SELECT value FROM settings WHERE key=?", ('admin_password',)).fetchone()
print('OK' if r else 'FAIL')
conn.close()
