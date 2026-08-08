# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for Yishao Agent desktop application.
Build: pyinstaller build.spec
"""

backend_datas = [
    ('frontend/dist', 'frontend/dist'),
    ('backend/resources', 'backend/resources'),
    # Only include static assets that don't get created at runtime
    ('backend/data/styles', 'backend/data/styles'),
    ('backend/data/templates', 'backend/data/templates'),
    ('backend/data/logos', 'backend/data/logos'),
    ('backend/data/assets', 'backend/data/assets'),
    ('backend/default_download_urls.json', 'backend'),
    ('backend/ffmpeg.exe', '.'),
]

a = Analysis(
    ['desktop_main.py'],
    pathex=['.', 'backend'],
    binaries=[],
    datas=backend_datas,
    hiddenimports=[
        # SSL certificates for HTTPS in frozen mode
        'certifi',
        # Web framework
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
        'starlette',
        'starlette.middleware',
        'starlette.middleware.cors',
        # Database
        'sqlite3',
        # Auth
        'bcrypt',
        'jose',
        'jwt',
        # HTTP
        'python_multipart',
        'openai',
        'httpx',
        'requests',
        'aiohttp',
        # YAML / JSON
        'yaml',
        'json',
        # Async
        'asyncio',
        'aiofiles',
        'anyio',
        # Validation
        'email_validator',
        'pydantic',
        'pydantic_core',
        # Crypto (license)
        'cryptography',
        'cryptography.hazmat',
        'cryptography.hazmat.primitives',
        'cryptography.hazmat.primitives.ciphers',
        'cryptography.hazmat.primitives.ciphers.aead',
        'cryptography.hazmat.primitives.ciphers.modes',
        'cryptography.hazmat.backends',
        # Backend modules — auto-discovered by prepare_build.py
        # WebSocket
        'websockets',
        # Other
        'PIL',
        'numpy',
        're',
    ],
    hookspath=[],
    runtime_hooks=[],
    excludes=[
        'torch',
        'torchvision',
        'funasr',
        'modelscope',
        'playwright',
        'playwright.sync_api',
        'setuptools',
        'pip',
    ],
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
