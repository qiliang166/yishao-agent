
import sqlite3, bcrypt

db = '/opt/yishao-agent/backend/data/yishao.db'
conn = sqlite3.connect(db)

# Set admin password to 'admin123'
password = 'admin123'
hashed = bcrypt.hashpw(password.encode('utf-8')[:72], bcrypt.gensalt()).decode('utf-8')

conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_password', ?)", (hashed,))
conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_password_enabled', '1')",)
conn.commit()

# Verify
row = conn.execute("SELECT value FROM settings WHERE key='admin_password'").fetchone()
print('Password set:', bool(row and row['value']))

conn.close()
