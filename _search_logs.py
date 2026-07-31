
import re, os

log_files = ['/var/log/messages', '/var/log/messages-20260720', '/var/log/messages-20260719',
             '/var/log/messages-20260718', '/var/log/messages-20260717']

# Also check the yishao agent log
log_files.append('/opt/yishao-agent/backend/backend_startup.log')

results = []
for lf in log_files:
    if not os.path.exists(lf):
        continue
    with open(lf, 'r', errors='replace') as f:
        for line in f:
            # Look for project-related entries
            if any(kw in line for kw in ['project', 'Project', '创建', '删除', 'PROJECT', 'output', 'HTML deck']):
                # Check date range
                if any(d in line for d in ['Jul 17', 'Jul 18', 'Jul 19', 'Jul 20', 'Jul 21',
                                           '2026-07-17', '2026-07-18', '2026-07-19', '2026-07-20', '2026-07-21']):
                    results.append(line.strip()[:300])

with open('/tmp/project_log_entries.txt', 'w', encoding='utf-8') as f:
    f.write(chr(10).join(results[-200:]))

print(f'Found {len(results)} log entries')
