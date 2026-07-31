
import os, struct

DISK = '/dev/vda3'
PAGE_SIZE = 4096

# WAL magic bytes
wal_magic1 = bytes([0x37, 0x7f, 0x06, 0x82])
wal_magic2 = bytes([0x37, 0x7f, 0x06, 0x83])

found_wals = []

with open(DISK, 'rb') as f:
    chunk_size = 100 * 1024 * 1024
    total = min(os.path.getsize(DISK), 40 * 1024**3)
    pos = 0
    while pos < total:
        f.seek(pos)
        data = f.read(min(chunk_size, total - pos))
        if not data:
            break
        
        # Search for WAL header
        idx = 0
        while True:
            i = data.find(wal_magic1, idx)
            if i == -1:
                i = data.find(wal_magic2, idx)
            if i == -1:
                break
            
            # Read WAL header to get page size and number of pages
            if i + 48 <= len(data):
                hdr = data[i:i+48]
                page_size = struct.unpack('>I', hdr[8:12])[0]
                num_pages = struct.unpack('>I', hdr[32:36])[0]
                # Valid page sizes and non-zero pages
                if page_size in [512, 1024, 2048, 4096, 8192, 16384, 32768, 65536] and num_pages > 0:
                    wal_size = 32 + num_pages * (24 + page_size)
                    if wal_size < 50 * 1024 * 1024:  # Reasonable WAL size
                        found_wals.append({
                            'offset': pos + i,
                            'page_size': page_size,
                            'num_pages': num_pages,
                            'size_mb': wal_size / (1024*1024)
                        })
            idx = i + 1
        
        pos += len(data)
        if pos % (5 * 1024**3) < chunk_size:
            print('Scanned ' + str(pos//1024**3) + 'GB, found ' + str(len(found_wals)))

print('Total WAL headers found: ' + str(len(found_wals)))
for w in found_wals[:20]:
    print('WAL at offset=' + str(w['offset']) + ' (' + str(w['offset']//1024**3) + 'GB) pages=' + str(w['num_pages']) + ' size=' + str(round(w['size_mb'],1)) + 'MB')

# Try to extract and read the most promising WAL
if found_wals:
    best = found_wals[0]
    with open(DISK, 'rb') as f:
        f.seek(best['offset'])
        wal_size = 32 + best['num_pages'] * (24 + best['page_size'])
        wal_data = f.read(min(wal_size, 20 * 1024 * 1024))
    
    with open('/tmp/recovered_wal.bin', 'wb') as out:
        out.write(wal_data)
    print('Extracted WAL to /tmp/recovered_wal.bin (' + str(len(wal_data)) + ' bytes)')
