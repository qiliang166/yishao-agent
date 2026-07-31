
import os, sys

# Extract strings from recovered binary files
files_to_check = [
    '/tmp/recovered_db.db',
    '/tmp/recovered_large.db', 
    '/tmp/recovered_json_chunk.bin',
    '/tmp/yishao_pages.bin',
]

all_text = []

for fpath in files_to_check:
    if not os.path.exists(fpath):
        continue
    with open(fpath, 'rb') as f:
        data = f.read()
    # Extract printable strings (4+ chars)
    current = []
    for byte in data:
        if 32 <= byte < 127 or byte in (0x0a, 0x0d):
            current.append(chr(byte))
        else:
            if len(current) >= 4:
                all_text.append(''.join(current))
            current = []
    if len(current) >= 4:
        all_text.append(''.join(current))

text = '
'.join(all_text)

# Search for project-related patterns
import re
# Find project names (Chinese characters) 
# Find JSON fragments with project data
# Find SQL insert/update statements
patterns = [
    ('project_id', r'project_id.{0,50}'),
    ('project_name', r'name.{0,50}'),
    ('created_at', r'created_at.{0,30}'),
    ('slide_plan', r'slide_plan.{0,200}'),
    ('INSERT INTO projects', r'INSERT INTO projects[^;]{0,300}'),
    ('INSERT INTO project_items', r'INSERT INTO project_items[^;]{0,300}'),
    ('workspace', r'workspace.{0,100}'),
]

results = []
for label, pat in patterns:
    for m in re.finditer(pat, text, re.IGNORECASE):
        results.append(label + ': ' + m.group()[:250])

with open('/tmp/extracted_strings_report.txt', 'w', encoding='utf-8') as f:
    f.write('
'.join(results[:500]))

print('Extracted ' + str(len(results)) + ' pattern matches')
print('Total strings extracted: ' + str(len(all_text)))
