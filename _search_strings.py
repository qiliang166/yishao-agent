import subprocess, os

# Search for specific project-related strings in raw disk
# Use dd + strings + grep approach
patterns = [
    '乾坤多宝鱼',
    'KH260721',
    'KH260720',
    'KH260719',
    'KH260718',
    'KH260717',
    'KH260716',
]

DISK = '/dev/vda3'
# Search in 0-35GB range using dd
# Read in chunks and search for these patterns
chunk_size = 500 * 1024 * 1024  # 500MB chunks
results = []

with open(DISK, 'rb') as f:
    for start_gb in range(0, 35):
        offset = start_gb * 1024**3
        f.seek(offset)
        data = f.read(chunk_size)
        if not data:
            break
        # Search for patterns as bytes
        for pattern in patterns:
            pat_bytes = pattern.encode('utf-8')
            idx = 0
            while True:
                pos = data.find(pat_bytes, idx)
                if pos == -1:
                    break
                # Extract context around the match
                start = max(0, pos - 200)
                end = min(len(data), pos + 500)
                context = data[start:end]
                try:
                    text = context.decode('utf-8', errors='replace')
                    results.append(f'OFFSET={offset+pos} PATTERN={pattern}: ...{text}...')
                except:
                    pass
                idx = pos + 1
                if len(results) > 500:
                    break
            if len(results) > 500:
                break
        if len(results) > 500:
            break
        if start_gb % 5 == 0:
            print(f'Searched {start_gb}GB, found {len(results)} matches')

with open('/tmp/string_search_results.txt', 'w', encoding='utf-8') as out:
    out.write('
'.join(results[:500]))
print(f'Total matches: {len(results)}')
