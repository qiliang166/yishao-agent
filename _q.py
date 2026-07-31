import sqlite3
for name in ["/tmp/recovered_large.db", "/tmp/recovered_db.db"]:
 try:
  conn=sqlite3.connect(name)
  tabs=[t[0] for t in conn.execute("SELECT name FROM sqlite_master WHERE type=chr(116)||chr(97)||chr(98)||chr(108)||chr(101)")]
  print(name, tabs)
  for t in tabs:
   try:
    cnt=conn.execute("SELECT count(*) FROM [{}]".format(t)).fetchone()[0]
    print(" ", t, cnt)
   except Exception as e: print(" ", t, str(e)[:80])
  conn.close()
 except Exception as e: print(name, str(e)[:200])
