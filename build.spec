# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for Yishao Agent desktop application.
Build: pyinstaller build.spec
"""

a = Analysis(
    ['desktop_main.py'],
    pathex=['.'],
    binaries=[],
    datas=[
        ('frontend/dist', 'frontend/dist'),
    ],
    hiddenimports=[
        'fastapi',
        'uvicorn',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.logging',
        'sqlite3',
        'bcrypt',
        'jose',
        'python_multipart',
        'openai',
        'httpx',
        'requests',
        'yaml',
        'json',
        'asyncio',
        'aiofiles',
        'starlette',
        'anyio',
        'email_validator',
        'pydantic',
        'pydantic_core',
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=None,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=None)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='YishaoAgent',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)
