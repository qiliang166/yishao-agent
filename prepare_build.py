"""
Read app name & logo from database, convert logo to .ico,
auto-discover backend Python modules for PyInstaller hiddenimports,
then generate a modified build.spec for PyInstaller.
"""
import json
import os
import re
import sqlite3
import sys


ROOT = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(ROOT, "backend", "data", "yishao.db")


def _discover_backend_modules(root: str) -> list[str]:
    """Scan backend/ for all .py files, convert to Python module names."""
    backend_dir = os.path.join(root, "backend")
    modules = []
    for dirpath, dirnames, filenames in os.walk(backend_dir):
        dirnames[:] = [d for d in dirnames if d not in ("venv", "__pycache__", "debug")]
        for f in filenames:
            if not f.endswith(".py"):
                continue
            full = os.path.join(dirpath, f)
            rel = os.path.relpath(full, root).replace("\\", "/")
            if rel.startswith("venv") or "__pycache__" in rel or "data/debug/" in rel:
                continue
            # backend/routers/prompt_studio.py → backend.routers.prompt_studio
            mod = rel[:-3].replace("/", ".")
            # Root-level backend .py files: backend/database.py → database
            if mod.startswith("backend."):
                mod = mod[len("backend."):]
            modules.append(mod)
    return sorted(set(modules))


def _inject_missing_hiddenimports(content: str, discovered: list[str]) -> str:
    """Insert discovered backend modules into the hiddenimports list."""
    # Locate hiddenimports=[ ... ]
    start_marker = "hiddenimports=["
    start_idx = content.index(start_marker) + len(start_marker)

    # Bracket-match to find the closing ]
    depth = 1
    i = start_idx
    while i < len(content) and depth > 0:
        if content[i] == "[":
            depth += 1
        elif content[i] == "]":
            depth -= 1
        i += 1
    close_idx = i - 1

    # Extract already-listed module names
    block = content[start_idx:close_idx]
    existing = set()
    for m in re.finditer(r"""['\"]([^'\"]+)['\"]""", block):
        existing.add(m.group(1))

    missing = [m for m in discovered if m not in existing]
    if not missing:
        print(f"[prepare] All {len(discovered)} backend modules already in hiddenimports")
        return content

    # Determine indent from the last entry before closing bracket
    indent = "        "
    before_close = content[:close_idx].rstrip()
    last_newline = before_close.rfind("\n")
    if last_newline != -1:
        leading = content[last_newline + 1 : content.rfind(before_close[last_newline:].strip(), last_newline)]
        indent = leading if leading and leading[0] == " " else indent
        indent = indent[: -len(indent.lstrip())] + "        " if indent.lstrip() else "        "

    new_entries = ",\n".join(f"{indent}'{m}'" for m in missing) + ","
    content = content[:close_idx] + "\n" + new_entries + "\n" + indent[:-4] + content[close_idx:]
    print(f"[prepare] Injected {len(missing)} missing backend modules into hiddenimports")
    return content


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

    if logo_file and logo_file.lower().endswith((".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp")):
        try:
            from PIL import Image
            ico_path = os.path.join(ROOT, "app_icon.ico")
            img = Image.open(logo_file)
            if img.mode not in ("RGBA", "RGB"):
                img = img.convert("RGBA")
            sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)]
            img.save(ico_path, format="ICO", sizes=sizes)
            icon_path = ico_path
            print(f"[prepare] Icon generated: {ico_path}")
        except Exception as e:
            print(f"[prepare] WARNING: icon conversion failed: {e}")

    spec_src = os.path.join(ROOT, "build.spec")
    spec_dst = os.path.join(ROOT, "build_temp.spec")

    with open(spec_src, "r", encoding="utf-8") as f:
        content = f.read()

    # Auto-discover backend modules and inject into hiddenimports
    discovered = _discover_backend_modules(ROOT)
    print(f"[prepare] Discovered {len(discovered)} backend modules")
    content = _inject_missing_hiddenimports(content, discovered)

    # Apply brand name to the EXE
    content = content.replace("name='YishaoAgent'", f"name='{app_name}'")

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
