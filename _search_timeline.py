import os

DISK = '/dev/vda3'

# Search for project-related patterns in raw disk
# Look for timestamps from 7/17-7/21 along with project data
search_terms = [
    '2026-07-17', '2026-07-18', '2026-07-19', '2026-07-20', '2026-07-21',
    'project_code', 'KH2607',
]

results = []
chunk_size = 500 * 1024 * 1024
total_found = 0

with open(DISK, 'rb') as f:
    for start_gb in range(0, 35):
        offset = start_gb * 1024**3
        f.seek(offset)
        data = f.read(chunk_size)
        if not data:
            break

        for term in search_terms:
            pat = term.encode('utf-8')
            idx = 0
            while True:
                pos = data.find(pat, idx)
                if pos == -1:
                    break
                start = max(0, pos - 100)
                end = min(len(data), pos + 300)
                ctx = data[start:end]
                try:
                    text = ctx.decode('utf-8', errors='replace')
                    clean = ''.join(c if c.isprintable() or c in chr(10)+chr(13) else ' ' for c in text)
                    results.append('OFF=' + str(offset+pos) + ' TERM=' + term + ': ' + clean)
                    total_found += 1
                except:
                    pass
                idx = pos + 1
                if total_found >= 200:
                    break
            if total_found >= 200:
                break
        if total_found >= 200:
            break
        if start_gb % 5 == 0:
            print('Searched ' + str(start_gb) + 'GB, found ' + str(total_found))

with open('/tmp/timeline_search.txt', 'w', encoding='utf-8') as f:
    f.write(chr(10).join(results))
print('Total found: ' + str(total_found))
