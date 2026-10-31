#!/usr/bin/env bash
# ------------------------------------------------------------
# Build "Monarch Bridge Proxy.app" - a menu-bar app that runs the local
# Monarch proxy without Docker or a Python install.
#
# Run on a Mac (the app is built for the Mac's own chip, Apple Silicon or
# Intel). Needs Python 3.11+; the GitHub workflow does this automatically.
#
#   ./mac-proxy-app/build.sh
#
# Output: mac-proxy-app/dist/Monarch Bridge Proxy.app
#         mac-proxy-app/dist/Monarch-Bridge-Proxy-macOS-<arch>.zip
# ------------------------------------------------------------
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
APP_NAME="Monarch Bridge Proxy"
ARCH="$(uname -m)"   # arm64 or x86_64
PYTHON="${PYTHON:-python3}"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "error: build the Mac app on macOS." >&2
  exit 1
fi

echo "==> Creating build environment"
rm -rf build dist .venv
"$PYTHON" -m venv .venv
.venv/bin/pip install --quiet --upgrade pip
.venv/bin/pip install --quiet -r requirements.txt

echo "==> Making app icon"
mkdir -p build/AppIcon.iconset
SRC_ICON="../monarch-extension/icons/icon128.png"
for size in 16 32 64 128 256; do
  sips -z $size $size "$SRC_ICON" --out "build/icon_$size.png" >/dev/null
done
cp build/icon_16.png  build/AppIcon.iconset/icon_16x16.png
cp build/icon_32.png  build/AppIcon.iconset/icon_16x16@2x.png
cp build/icon_32.png  build/AppIcon.iconset/icon_32x32.png
cp build/icon_64.png  build/AppIcon.iconset/icon_32x32@2x.png
cp build/icon_128.png build/AppIcon.iconset/icon_128x128.png
cp build/icon_256.png build/AppIcon.iconset/icon_128x128@2x.png
iconutil -c icns build/AppIcon.iconset -o build/AppIcon.icns \
  || echo "warning: icon generation failed; building without a custom icon"

echo "==> Bundling with PyInstaller"
.venv/bin/pyinstaller --noconfirm --log-level WARN "$APP_NAME.spec"

echo "==> Ad-hoc signing (required for Apple Silicon)"
codesign --force --deep --sign - "dist/$APP_NAME.app"

echo "==> Zipping"
ZIP="dist/Monarch-Bridge-Proxy-macOS-$ARCH.zip"
ditto -c -k --sequesterRsrc --keepParent "dist/$APP_NAME.app" "$ZIP"

echo
echo "Built: $(pwd)/dist/$APP_NAME.app"
echo "Zip:   $(pwd)/$ZIP"
