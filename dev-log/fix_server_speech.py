"""Fix server speech_configs — update seeds to cooking-specific version.
Upload this to server and run: python3 fix_server_speech.py
"""
import sqlite3
import os
import shutil
from datetime import datetime

DB_PATH = "/opt/yishao-agent/backend/data/yishao.db"

# Backup
backup = DB_PATH + f".bak-speech-{datetime.now().strftime('%Y%m%d_%H%M%S')}"
shutil.copy2(DB_PATH, backup)
print(f"Backup: {backup}")

conn = sqlite3.connect(DB_PATH)
conn.execute("PRAGMA foreign_keys = ON")

# Show current state
print("\n=== BEFORE: speech_configs seeds ===")
for r in conn.execute("SELECT id, label, substr(prompt,1,60) FROM speech_configs WHERE workspace_id IS NULL ORDER BY sort_order"):
    print(r)

print("\n=== BEFORE: speech_configs workspace ===")
for r in conn.execute("SELECT id, workspace_id, label, substr(prompt,1,60) FROM speech_configs WHERE workspace_id IS NOT NULL ORDER BY workspace_id, sort_order"):
    print(r)

# Update seeds to cooking-specific
seed_updates = [
    ('seed-speech-doc',
     '文档演讲',
     '你是一位专业的美食讲解员。请根据以下标准文档内容，生成一篇自然亲切的演讲稿，适合在烹饪教学场景中使用。要求：语言生动有趣，节奏感强，包含开场白、主体内容和结束语。',
     '输出为 我是文档演讲'),
    ('seed-speech-analysis',
     '分析演讲',
     '你是一位专业的美食评论家。请根据以下分析文档内容，生成一篇深度分析的演讲稿，适合在烹饪教学场景中使用。要求：突出原理与技法分析，逻辑清晰，让听众理解背后的"道"与"术"。',
     '输出为我是分析演讲'),
    ('seed-speech-comprehensive',
     '综合演讲',
     '你是一位专业的美食教育家。请根据以下手册文档内容，生成一篇综合性的演讲稿，适合在烹饪教学场景中使用。要求：结合背景知识与实操要点，既有理论深度又有实践指导。',
     '输出为我是综合演讲'),
]

for sid, label, prompt, skill in seed_updates:
    conn.execute(
        "UPDATE speech_configs SET label=?, prompt=?, skill=?, updated_at=CURRENT_TIMESTAMP WHERE id=? AND workspace_id IS NULL",
        (label, prompt, skill, sid)
    )
    print(f"Updated seed: {sid}")

# Update workspace configs that have the generic placeholder content
generic_marker = '【作用】Stage 4 (col6)'
rows = conn.execute(
    "SELECT id, label FROM speech_configs WHERE workspace_id IS NOT NULL AND prompt LIKE ?",
    (f'%{generic_marker}%',)
).fetchall()
print(f"\nWorkspace configs with generic content: {len(rows)}")
for r in rows:
    print(f"  {r['id']}: {r['label']}")

# For each generic workspace config, replace with cooking version based on label
for r in rows:
    label = r['label']
    if '文档演讲' in label:
        new_prompt = seed_updates[0][2]
        new_skill = seed_updates[0][3]
    elif '分析演讲' in label:
        new_prompt = seed_updates[1][2]
        new_skill = seed_updates[1][3]
    elif '综合演讲' in label:
        new_prompt = seed_updates[2][2]
        new_skill = seed_updates[2][3]
    else:
        continue
    conn.execute(
        "UPDATE speech_configs SET prompt=?, skill=?, updated_at=CURRENT_TIMESTAMP WHERE id=?",
        (new_prompt, new_skill, r['id'])
    )
    print(f"Updated workspace config: {r['id']} ({label})")

conn.commit()

# Verify
print("\n=== AFTER: speech_configs seeds ===")
for r in conn.execute("SELECT id, label, substr(prompt,1,60) FROM speech_configs WHERE workspace_id IS NULL ORDER BY sort_order"):
    print(r)

print("\n=== AFTER: speech_configs workspace ===")
for r in conn.execute("SELECT id, workspace_id, label, substr(prompt,1,60) FROM speech_configs WHERE workspace_id IS NOT NULL ORDER BY workspace_id, sort_order"):
    print(r)

conn.close()
print("\nDone. Restart service: sudo systemctl restart yishao-agent")
