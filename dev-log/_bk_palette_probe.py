# -*- coding: utf-8 -*-
"""对所有 booklet 草稿离线执行与前端 extractContentPalette 完全相同的逻辑，定位「内容同款配色」卡不出现的原因。"""
import json
import re
import sqlite3

DB = r"d:\YISHAOAGENT\backend\data\yishao.db"

PALETTE_VAR_MAP = {
    "--primary": "primary", "--secondary": "secondary", "--accent": "accent",
    "--background": "bg", "--text": "text", "--card-bg": "card_bg",
    **{f"--chart-{i}": f"chart-{i}" for i in range(8)},
}


def is_prose(c):
    if c.get("source_type") == "step_md":
        return True
    return c.get("source_type") == "custom" and c.get("content_format") != "html"


def extract(chapters):
    ch = next(
        (c for c in chapters
         if c.get("enabled") and not is_prose(c) and ":root" in (c.get("content") or "")),
        None,
    )
    if ch is None:
        return None, None, "no chapter passes find()"
    m = re.search(r":root\s*\{([^}]*)\}", ch.get("content") or "")
    if not m:
        return ch, None, ":root{...} block regex no match"
    out = {}
    for var, hexv in re.findall(r"(--[a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\b", m.group(1)):
        key = PALETTE_VAR_MAP.get(var)
        if key and key not in out:
            out[key] = hexv
    if "primary" not in out:
        return ch, None, f"no --primary hex in first :root block; block head={m.group(1)[:120]!r}"
    return ch, out, "ok"


conn = sqlite3.connect(DB)
conn.row_factory = sqlite3.Row
rows = conn.execute("SELECT id, title, book_type, chapters_json FROM booklets ORDER BY updated_at DESC").fetchall()
print(f"{len(rows)} drafts\n")
for r in rows:
    chapters = json.loads(r["chapters_json"] or "[]")
    ch, palette, why = extract(chapters)
    print(f"[{r['id']}] {r['title']} ({r['book_type']}) — {len(chapters)} chapters")
    for c in chapters:
        print(f"    ch: enabled={c.get('enabled')} src={c.get('source_type')} fmt={c.get('content_format')} "
              f"prose={is_prose(c)} len={len(c.get('content') or '')} root={':root' in (c.get('content') or '')} "
              f"| {c.get('title', '')[:24]}")
    if palette:
        print(f"  => PALETTE from {ch.get('title', '')!r}: {palette}")
    else:
        print(f"  => NONE ({why})")
    print()
conn.close()
