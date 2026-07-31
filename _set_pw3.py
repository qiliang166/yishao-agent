
import sqlite3, bcrypt
db = '/opt/yishao-agent/backend/data/yishao.db'
conn = sqlite3.connect(db)
password = 'admin123'
hashed = bcrypt.hashpw(password.encode('utf-8')[:72], bcrypt.gensalt()).decode('utf-8')
conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_password', ?)", (hashed,))
conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_password_enabled', '1')",)
conn.commit()
row = conn.execute("SELECT value FROM settings WHERE key='admin_password'").fetchone()
print('OK: password set' if row and row['value'] else 'FAIL')
conn.close()
