# Monarch Bridge Proxy (Mac app)

A small menu-bar app that runs the self-hosted Monarch proxy on your Mac. **You don't need Docker or Python.** It works with both the Chrome and Safari versions of the extension.

It runs the same proxy code as the Docker version (`../Monarch API/monarch.py`), at the same address: `http://localhost:47821`. It listens only on your own Mac (`127.0.0.1`), so other devices on your network can't reach it.

## For users: install and run

1. Go to this repository's **Releases** page and download the zip for your Mac:
   - **Apple Silicon** (M1, M2, M3, M4…): `Monarch-Bridge-Proxy-macOS-arm64.zip`
   - **Intel:** `Monarch-Bridge-Proxy-macOS-x86_64.zip`

   Not sure which you have? Click the Apple menu → **About This Mac** and look at "Chip" or "Processor."
2. Double-click the zip, then drag **Monarch Bridge Proxy** into your **Applications** folder.
3. Open it. Because the app isn't signed with a paid Apple Developer certificate, macOS blocks it the first time:
   - Click **Done** (or **OK**) on the warning.
   - Open **System Settings → Privacy & Security**, scroll down, and click **Open Anyway** next to "Monarch Bridge Proxy." Confirm with your password.

   You only need to do this once.
4. **M⇄PL** appears in the menu bar at the top of your screen. Click it to see whether the proxy is running.
5. In the extension's **Setup** tab, leave the proxy URL as `http://localhost:47821`, then enter your Monarch credentials.

**Start automatically when you log in:** go to **System Settings → General → Login Items** and add Monarch Bridge Proxy under "Open at Login."

**If it says the port is in use:** another proxy, probably the Docker one, is already running. Stop it with `docker compose down` in the `Monarch API` folder, then choose **Start Proxy** from the menu.

**Logs:** choose **Show Log** from the menu. The log is stored at `~/Library/Logs/Monarch Bridge Proxy/proxy.log`. Your Monarch credentials are never written to it.

## For maintainers: build it

The app is built automatically by GitHub Actions (`.github/workflows/mac-proxy-app.yml`) on Apple Silicon and Intel Macs. Each build also starts the app and checks that the proxy responds.

- **Every push** that changes the proxy or the app runs a build and test. The zips are attached to the workflow run as artifacts.
- **To publish a release** that users can download, push a tag that starts with `proxy-v`:
  ```bash
  git tag proxy-v1.0.0
  ```
  ```bash
  git push origin proxy-v1.0.0
  ```
  You can also create the release from GitHub's website: **Releases → Draft a new release**, type a new tag such as `proxy-v1.0.0`, and publish. The workflow then attaches the zips.

To build locally on a Mac with Python 3.11+:

```bash
./mac-proxy-app/build.sh
```

To run the proxy without the menu bar (any OS), for development:

```bash
python mac-proxy-app/proxy_server.py
```

### Files
| File | Purpose |
|---|---|
| `proxy_server.py` | Starts and stops the proxy on a background thread. No GUI code. |
| `menubar_app.py` | The menu-bar UI, built with [rumps](https://github.com/jaredks/rumps) |
| `Monarch Bridge Proxy.spec` | PyInstaller bundle settings: menu-bar only (no Dock icon), bundle ID, version |
| `build.sh` | Creates a venv, makes the icon, bundles, ad-hoc signs, and zips |
| `requirements.txt` | Pinned versions that were tested together |

### Removing the "Open Anyway" step (optional)
Users see the Gatekeeper warning because the app is only ad-hoc signed. Removing it requires an Apple Developer Program membership ($99/year at the time of writing), signing with a "Developer ID Application" certificate, and notarizing the app with Apple. This isn't set up yet.
