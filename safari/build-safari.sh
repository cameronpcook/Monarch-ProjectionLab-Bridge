#!/usr/bin/env bash
# ------------------------------------------------------------
# Generate a Safari Web Extension Xcode project from the shared
# Chrome extension source in ../monarch-extension.
#
# Requirements: macOS with Xcode installed (the packager ships
# with Xcode's command line tools). Run from anywhere:
#
#   ./safari/build-safari.sh            # macOS-only app (default)
#   ./safari/build-safari.sh --ios      # macOS + iOS targets
#
# The generated project REFERENCES the files in monarch-extension/
# rather than copying them, so Chrome and Safari share one source.
# Re-run this script only if you need to regenerate the project.
# ------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
EXT_DIR="$REPO_ROOT/monarch-extension"
OUT_DIR="$SCRIPT_DIR/xcode"

APP_NAME="${APP_NAME:-Monarch PL Bridge}"
BUNDLE_ID="${BUNDLE_ID:-com.example.monarch-pl-bridge}"

PLATFORM_FLAG="--macos-only"
if [[ "${1:-}" == "--ios" ]]; then
  PLATFORM_FLAG=""
fi

if [[ "$(uname)" != "Darwin" ]]; then
  echo "error: this script must be run on macOS with Xcode installed." >&2
  exit 1
fi

# Apple renamed the tool from safari-web-extension-converter to
# safari-web-extension-packager; support both.
TOOL=""
for candidate in safari-web-extension-packager safari-web-extension-converter; do
  if xcrun --find "$candidate" >/dev/null 2>&1; then TOOL="$candidate"; break; fi
done
if [[ -z "$TOOL" ]]; then
  echo "error: safari-web-extension-packager not found. Install Xcode from the App Store," >&2
  echo "       then run: sudo xcode-select -s /Applications/Xcode.app" >&2
  exit 1
fi

if [[ "$BUNDLE_ID" == com.example.* ]]; then
  echo "warning: using placeholder bundle id '$BUNDLE_ID'."
  echo "         Set BUNDLE_ID=com.yourname.monarch-pl-bridge before distributing."
fi

echo "Converting $EXT_DIR -> $OUT_DIR"
xcrun "$TOOL" "$EXT_DIR" \
  --project-location "$OUT_DIR" \
  --app-name "$APP_NAME" \
  --bundle-identifier "$BUNDLE_ID" \
  --swift \
  $PLATFORM_FLAG \
  --no-open \
  --no-prompt \
  --force

echo
echo "Done. Open the project with:"
echo "  open \"$OUT_DIR/$APP_NAME/$APP_NAME.xcodeproj\""
