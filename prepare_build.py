"""
Read app name & logo from database, convert logo to .ico,
then generate a modified build.spec for PyInstaller.
"""
import sqlite3, json, os, sys, shutil

ROOT = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(ROOT, "backend", "data", "yishao.db")

def main():
    conn = sqlite3.connect(DB_PATH)
    settings = {}
    for row in conn.execute("SELECT key, value FROM settings"):
        settings[row[0]] = row[1] if row[1] else ""
    conn.close()

    app_name = settings.get("brand_name", "").strip()
    if not app_name:
        app_name = "YishaoAgent"

    # Embed download URLs from settings so distributed EXEs ship with them
    _dl_defaults = {}
    for _k in ("download_desktop_url", "download_server_url"):
        _v = settings.get(_k, "").strip()
        if _v:
            _dl_defaults[_k] = _v
    # Also check activation DB if main settings don't have the URLs
    _act_db = os.path.join(ROOT, "activation_server", "data", "activation.db")
    if not _dl_defaults and os.path.exists(_act_db):
        try:
            _aconn = sqlite3.connect(_act_db)
            try:
                for _r in _aconn.execute(
                    "SELECT key, value FROM site_config WHERE key IN ('download_desktop_url','download_server_url')"
                ).fetchall():
                    if _r[1] and _r[0] not in _dl_defaults:
                        _dl_defaults[_r[0]] = _r[1]
            finally:
                _aconn.close()
        except Exception:
            pass
    _dl_path = os.path.join(ROOT, "backend", "default_download_urls.json")
    if _dl_defaults:
        with open(_dl_path, "w", encoding="utf-8") as _f:
            json.dump(_dl_defaults, _f)
        print(f"[prepare] Default download URLs: {_dl_defaults}")
    elif os.path.exists(_dl_path):
        os.remove(_dl_path)

    logo_url = settings.get("brand_logo", "").strip()
    icon_path = None

    # Determine logo file path
    logo_file = None
    if logo_url.startswith("/api/logos/"):
        filename = logo_url[len("/api/logos/"):]
        if ".." in filename or "/" in filename or "\\" in filename:
            print(f"[prepare] WARNING: suspicious logo path rejected: {filename}")
        else:
            candidate = os.path.join(ROOT, "backend", "data", "logos", filename)
            if os.path.isfile(candidate):
                logo_file = candidate
    elif logo_url and os.path.isfile(logo_url) and not (".." in logo_url):
        logo_file = logo_url

    # Convert logo to .ico
    if logo_file and logo_file.lower().endswith((".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp")):
        try:
            from PIL import Image
            ico_path = os.path.join(ROOT, "app_icon.ico")
            img = Image.open(logo_file)
            # Convert to RGBA if needed
            if img.mode not in ("RGBA", "RGB"):
                img = img.convert("RGBA")
            # Save as .ico with multiple sizes
            sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
            img.save(ico_path, format="ICO", sizes=sizes)
            icon_path = ico_path
            print(f"[prepare] Icon generated: {ico_path}")
        except Exception as e:
            print(f"[prepare] WARNING: icon conversion failed: {e}")

    # Generate modified build.spec
    spec_src = os.path.join(ROOT, "build.spec")
    spec_dst = os.path.join(ROOT, "build_temp.spec")

    with open(spec_src, "r", encoding="utf-8") as f:
        content = f.read()

    # Replace icon
    if icon_path:
        icon_path_fwd = icon_path.replace("\\", "/")
        content = content.replace("icon=None", f"icon='{icon_path_fwd}'")
    else:
        print("[prepare] No icon available, building without icon")

    with open(spec_dst, "w", encoding="utf-8") as f:
        f.write(content)

    print(f"[prepare] App name: {app_name}")
    print(f"[prepare] Icon: {icon_path or '(none)'}")
    print(f"[prepare] Wrote: {spec_dst}")

if __name__ == "__main__":
    main()
