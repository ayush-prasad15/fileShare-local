# -*- mode: python ; py-indent-step: 4 -*-

a = Analysis(
    ['main.py'],
    pathex=[],
    binaries=[],
    datas=[('static', 'static')],
    hiddenimports=[
        'websockets', 
        'aiofiles', 
        'python-multipart', 
        'uvicorn.logging', 
        'uvicorn.loops', 
        'uvicorn.loops.auto', 
        'uvicorn.protocols', 
        'uvicorn.protocols.http', 
        'uvicorn.protocols.http.auto', 
        'uvicorn.protocols.websockets', 
        'uvicorn.protocols.websockets.auto', 
        'uvicorn.lifespan', 
        'uvicorn.lifespan.on', 
        'uvicorn.lifespan.off'
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='NexusShare',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
