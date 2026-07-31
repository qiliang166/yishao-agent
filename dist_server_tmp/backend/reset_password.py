"""Reset admin password — clears it so the system is unprotected.
Run this when you're locked out. Then log in and set a new password in Settings.
"""
from database import get_db

db = get_db()
db.execute("DELETE FROM settings WHERE key = 'admin_password'")
db.execute("DELETE FROM settings WHERE key = 'admin_password_enabled'")
db.commit()
db.close()
print("密码已清除，重新打开页面即可无需密码进入系统。")
print("进入后请尽快在「全局设置」中设置新密码。")
