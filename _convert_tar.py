import zipfile, tarfile, io, os

zip_path = 'yishao-agent-server.zip'
tar_path = 'yishao-agent-server.tar.gz'

with zipfile.ZipFile(zip_path, 'r') as zf:
    with tarfile.open(tar_path, 'w:gz') as tf:
        for member in zf.infolist():
            if member.is_dir():
                continue
            data = zf.read(member)
            # normalize path separators for Linux
            name = member.filename.replace('\\', '/')
            info = tarfile.TarInfo(name=name)
            info.size = len(data)
            # mktime from date_time tuple
            dt = member.date_time + (0, 0, 0)
            import calendar, time
            info.mtime = calendar.timegm(dt)
            info.mode = 0o755 if name.endswith('.sh') else 0o644
            tf.addfile(info, io.BytesIO(data))

size_mb = os.path.getsize(tar_path) / (1024 * 1024)
print(f'Done: {tar_path} ({size_mb:.1f} MB)')
