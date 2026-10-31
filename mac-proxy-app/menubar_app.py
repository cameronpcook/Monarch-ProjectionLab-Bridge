"""
Monarch Bridge Proxy - a macOS menu-bar app that runs the local Monarch proxy
for the Monarch -> ProjectionLab Bridge extension (Chrome or Safari).

No Docker or Python install needed once bundled with PyInstaller (see build.sh).
"""
import subprocess
import sys

import rumps

from proxy_server import APP_NAME, LOG_FILE, ProxyServer

ICON_RUNNING = "M⇄PL"         # M⇄PL
ICON_STOPPED = "M⇄PL ⚠"  # M⇄PL ⚠


class ProxyMenuBarApp(rumps.App):
    def __init__(self):
        super().__init__(APP_NAME, title=ICON_STOPPED, quit_button=None)
        self.proxy = ProxyServer()

        self.status_item = rumps.MenuItem("Starting…")
        self.url_item = rumps.MenuItem(f"Address: {self.proxy.url}")
        self.toggle_item = rumps.MenuItem("Stop Proxy", callback=self.toggle)
        self.copy_item = rumps.MenuItem("Copy Address", callback=self.copy_url)
        self.log_item = rumps.MenuItem("Show Log", callback=self.show_log)
        self.quit_item = rumps.MenuItem("Quit", callback=self.quit)
        self.menu = [self.status_item, self.url_item, None,
                     self.toggle_item, self.copy_item, self.log_item, None,
                     self.quit_item]
        # Informational rows: no callback, so they appear greyed out.
        self.status_item.set_callback(None)
        self.url_item.set_callback(None)

        self.timer = rumps.Timer(self.refresh, 3)
        self.timer.start()
        self.start_proxy()

    # --- actions -------------------------------------------------------
    def start_proxy(self):
        if not self.proxy.start():
            rumps.alert(f"{APP_NAME} could not start", self.proxy.error or "Unknown error.")
        self.refresh()

    def toggle(self, _sender):
        if self.proxy.running:
            self.proxy.stop()
            self.refresh()
        else:
            self.start_proxy()

    def copy_url(self, _sender):
        subprocess.run(["pbcopy"], input=self.proxy.url.encode(), check=False)

    def show_log(self, _sender):
        subprocess.run(["open", "-R", str(LOG_FILE)], check=False)

    def quit(self, _sender):
        self.proxy.stop()
        rumps.quit_application()

    # --- status --------------------------------------------------------
    def refresh(self, _timer=None):
        if self.proxy.running:
            self.title = ICON_RUNNING
            self.status_item.title = "● Proxy running"
            self.toggle_item.title = "Stop Proxy"
        else:
            self.title = ICON_STOPPED
            self.status_item.title = ("○ Stopped: " + self.proxy.error) if self.proxy.error else "○ Proxy stopped"
            self.toggle_item.title = "Start Proxy"


if __name__ == "__main__":
    if sys.platform != "darwin":
        sys.exit("The menu-bar app only runs on macOS. Use proxy_server.py elsewhere.")
    ProxyMenuBarApp().run()
