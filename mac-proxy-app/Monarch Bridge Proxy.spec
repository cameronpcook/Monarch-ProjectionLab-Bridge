# PyInstaller spec for the macOS menu-bar app. Build with ./build.sh
# (or: pyinstaller --noconfirm "Monarch Bridge Proxy.spec").
import os
from PyInstaller.utils.hooks import collect_submodules

APP_NAME  = "Monarch Bridge Proxy"
BUNDLE_ID = os.environ.get("BUNDLE_ID", "com.monarchbridge.proxy")
VERSION   = os.environ.get("APP_VERSION", "1.0.0")
ICON      = "build/AppIcon.icns" if os.path.exists("build/AppIcon.icns") else None

hidden = (
    collect_submodules("uvicorn")      # uvicorn loads protocols/loops by name
    + collect_submodules("monarchmoney")
    + ["monarch"]
)

a = Analysis(
    ["menubar_app.py"],
    pathex=[".", "../Monarch API"],
    hiddenimports=hidden,
    datas=[],
    excludes=["tkinter"],
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name=APP_NAME,
    console=False,
    target_arch=os.environ.get("TARGET_ARCH") or None,
)
coll = COLLECT(exe, a.binaries, a.datas, name=APP_NAME)

app = BUNDLE(
    coll,
    name=f"{APP_NAME}.app",
    icon=ICON,
    bundle_identifier=BUNDLE_ID,
    version=VERSION,
    info_plist={
        "CFBundleName": APP_NAME,
        "CFBundleDisplayName": APP_NAME,
        "CFBundleShortVersionString": VERSION,
        "CFBundleVersion": VERSION,
        "LSUIElement": True,              # menu-bar only, no Dock icon
        "LSMinimumSystemVersion": "11.0",
        "NSHumanReadableCopyright": "Runs locally; credentials go only to Monarch.",
    },
)
