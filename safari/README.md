# Safari Version

Safari runs the same extension code as Chrome: the source in [`../monarch-extension`](../monarch-extension) is shared. Safari extensions have to ship inside a macOS (or iOS) app, so this folder holds a script that wraps the shared source in an Xcode project.

> **Status: untested on Safari.** Everything was prepared on Linux, where Safari can't run. Work through the [test checklist](#test-checklist) below before you rely on it.

## Requirements

- A Mac with **Xcode** installed from the App Store
- **Safari 16.4 or later.** Syncing injects code into ProjectionLab's page context (`scripting.executeScript` with `world: "MAIN"`), and developer reports say Safari supports this from 16.4. Apple doesn't document it clearly, so verify it on your version.
- To distribute the extension, you need an Apple Developer Program membership. You don't need one for local testing.

## 1. Generate the Xcode project

```bash
BUNDLE_ID=com.yourname.monarch-pl-bridge ./safari/build-safari.sh
```

Add `--ios` to also generate an iOS target. iOS isn't recommended at first; see the notes below.

The script runs Apple's `xcrun safari-web-extension-packager` (formerly `safari-web-extension-converter`) and writes the project to `safari/xcode/`. The project **references** the files in `monarch-extension/` instead of copying them, so a change to the shared code shows up in both browsers. The packager prints any manifest keys Safari doesn't support. Review that list.

## 2. Build and run locally

1. Open `safari/xcode/Monarch PL Bridge/Monarch PL Bridge.xcodeproj` in Xcode.
2. Under **Signing & Capabilities**, pick your team for both the app target and the extension target. A free personal team works for local testing.
3. Choose the macOS app scheme and press **Run** (⌘R). A small host app opens.
4. In Safari, open **Settings → Extensions** and enable *Monarch → ProjectionLab Bridge*.
5. If you build without signing: enable **Safari → Settings → Advanced → Show features for web developers**, then **Develop → Allow Unsigned Extensions**. Safari turns this setting off again each time it quits.
6. Grant website access when Safari asks, or under **Settings → Extensions → Monarch → ProjectionLab Bridge → Edit Websites**. The extension needs access to `app.projectionlab.com` and `api.monarch.com`.

## 3. Distribute (optional)

Archive the app in Xcode (**Product → Archive**) and upload it to App Store Connect. Apple also offers a web-based packager in App Store Connect that builds the app without Xcode. See Apple's [Packaging a web extension for Safari](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari).

## Test checklist

These are the places where Safari is most likely to behave differently. Test each one:

| Area | What to check | Why |
|---|---|---|
| Sync to ProjectionLab | Preview and push a sync | Needs `world: "MAIN"` injection, plus `new Function()` running under ProjectionLab's page CSP |
| Monarch sign-in | Load from Monarch, including a 2FA code if you use one | Login and data requests go straight to `api.monarch.com` from the extension |
| Sync reminder badge | After a sync, set Settings → Sync Reminder to 1 day and check the toolbar icon the next day | Uses `chrome.alarms` and the toolbar badge; Safari support for both is unverified |
| Multiple ProjectionLab tabs | Open two tabs and sync | Safari may not provide `tab.lastAccessed`. The code now falls back to the active tab. |
| Popup layout | Open the popup | The popup is 780px wide, and Safari may constrain popover size |
| Background worker | Leave Safari idle and come back, then sync | Safari may suspend the background service worker more aggressively than Chrome |

## Notes

- **Code changes for Safari:** `execInPL` in `background/service-worker.js` now accepts either the standard `[{ result }]` array or a bare value from `executeScript`, since some Safari versions reportedly return the bare value. Multi-tab selection also prefers the active tab when `lastAccessed` is missing. Both changes leave Chrome's behavior unchanged.
- **iOS:** untested. Mobile Safari has a much smaller popup, and the 780px-wide layout would need rework.
