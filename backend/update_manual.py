"""Update a single help manual section directly in the database (bypasses auth)."""
import sqlite3, json, os, sys

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "yishao.db")

def update_section(location: str, title: str, content: str):
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "INSERT OR REPLACE INTO help_manual_sections (location, title, content, sort_order) "
        "VALUES (?, ?, ?, (SELECT sort_order FROM help_manual_sections WHERE location = ?))",
        (location, title, content, location)
    )
    conn.commit()
    conn.close()
    print(f"Updated: {location} -> {title}")

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("Usage: python update_manual.py <location> <title> <content_file>")
        sys.exit(1)
    loc = sys.argv[1]
    title = sys.argv[2]
    with open(sys.argv[3], "r", encoding="utf-8") as f:
        content = f.read()
    update_section(loc, title, content)
