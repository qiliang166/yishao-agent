import os, struct
DISK = '/dev/vda3'
PAGE_SIZE = 4096
OUTPUT = '/tmp/yishao_pages_part2.bin'
start = 35 * 1024**3
total = os.path.getsize(DISK)
end = min(total, start + 5 * 1024**3)
found = 0
with open(DISK, 'rb') as f:
    f.seek(start)
    pos = start
    while pos < end:
        data = f.read(min(50*1024*1024, end - pos))
        if not data: break
        for i in range(0, len(data), PAGE_SIZE):
            if i + PAGE_SIZE > len(data): break
            page = data[i:i+PAGE_SIZE]
            pt = page[0]
            if pt in (0x05, 0x0D, 0x02, 0x0A):
                try:
                    text = page.decode('latin-1', errors='replace')
                    if any(s in text for s in ['project', 'booklet', 'workspace', 'member', 'yishao', 'prompt_studio', 'slide', 'scoring']):
                        with open(OUTPUT, 'ab') as out:
                            out.write(page)
                        found += 1
                except: pass
        pos += len(data)
        if pos % (1024**3) < 50*1024*1024:
            with open('/tmp/scan_progress.txt', 'w') as pf:
                pf.write(f'Scanned {pos//1024**3}GB, found {found} pages')
with open('/tmp/scan_done.txt', 'w') as df:
    df.write(f'Done. Total found: {found} pages')
print(f'Total found: {found}')
