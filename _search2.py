import os, sys

DISK = '/dev/vda3'
patterns = ['乾坤多宝鱼', 'KH260721', 'KH260720', 'KH260719', 'KH260718', 'KH260717', 'slide_plan', 'project_code', 'created_by']

results = []
chunk_size = 500 * 1024 * 1024

with open(DISK, 'rb') as f:
    for start_gb in range(0, 35):
        offset = start_gb * 1024**3
        f.seek(offset)
        data = f.read(chunk_size)
        if not data:
            break
        for pattern in patterns:
            pat_bytes = pattern.encode('utf-8')
            idx = 0
            while True:
                pos = data.find(pat_bytes, idx)
                if pos == -1:
                    break
                start = max(0, pos - 150)
                end = min(len(data), pos + 400)
                ctx = data[start:end]
                try:
                    text = ctx.decode('utf-8', errors='replace')
                    results.append('OFF=' + str(offset+pos) + ' PAT=' + pattern + ':' + text.replace(chr(10),' ').replace(chr(13),' '))
                except:
                    pass
                idx = pos + 1
                if len(results) >= 300:
                    break
            if len(results) >= 300:
                break
        if len(results) >= 300:
            break
        if start_gb % 5 == 0:
            print('Searched ' + str(start_gb) + 'GB, found ' + str(len(results)))

out_path = '/tmp/string_search_results.txt'
with open(out_path, 'w', encoding='utf-8') as out:
    out.write(chr(10).join(results))
print('Total: ' + str(len(results)) + ' matches saved to ' + out_path)
