"""
Runs the Monarch proxy (../Monarch API/monarch.py) inside this process on a
background thread, so it can be bundled into a standalone Mac app without
Docker or a separate Python install.

This module has no GUI code. Running it directly starts the proxy headless:

    python proxy_server.py
"""
import logging
import os
import socket
import sys
import threading
import time
from pathlib import Path

HOST = "127.0.0.1"
PORT = 47821
APP_NAME = "Monarch Bridge Proxy"


def log_dir() -> Path:
    if sys.platform == "darwin":
        d = Path.home() / "Library" / "Logs" / APP_NAME
    else:
        d = Path.home() / ".cache" / APP_NAME
    d.mkdir(parents=True, exist_ok=True)
    return d


LOG_FILE = log_dir() / "proxy.log"


def _setup_environment():
    handlers = [logging.FileHandler(LOG_FILE, encoding="utf-8")]
    if sys.stdout is None or sys.stderr is None or getattr(sys, "frozen", False):
        # A bundled app has no terminal; send stray prints/tracebacks to the log.
        stream = open(LOG_FILE, "a", buffering=1, encoding="utf-8")
        sys.stdout = stream
        sys.stderr = stream
    else:
        handlers.append(logging.StreamHandler(sys.stderr))

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        handlers=handlers,
        force=True,
    )

    # Use certifi's CA bundle for HTTPS to Monarch's API; a frozen app may not
    # find the system certificates on its own.
    try:
        import certifi
        os.environ.setdefault("SSL_CERT_FILE", certifi.where())
    except ImportError:
        pass

    # Make ../Monarch API importable when running from source.
    api_dir = Path(__file__).resolve().parent.parent / "Monarch API"
    if api_dir.is_dir() and str(api_dir) not in sys.path:
        sys.path.insert(0, str(api_dir))


_setup_environment()
log = logging.getLogger("proxy")


def port_in_use(host: str = HOST, port: int = PORT) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.5)
        return s.connect_ex((host, port)) == 0


class ProxyServer:
    """Start/stop the FastAPI proxy on a daemon thread."""

    def __init__(self, host: str = HOST, port: int = PORT):
        self.host = host
        self.port = port
        self._server = None
        self._thread = None
        self.error = None

    @property
    def url(self) -> str:
        return f"http://localhost:{self.port}"

    @property
    def running(self) -> bool:
        return bool(self._server and self._server.started and self._thread and self._thread.is_alive())

    def start(self, wait: float = 10.0) -> bool:
        """Start the server. Returns True once it is accepting connections."""
        if self.running:
            return True
        self.error = None

        if port_in_use(self.host, self.port):
            self.error = (f"Port {self.port} is already in use. If the Docker proxy is "
                          f"running, stop it first (docker compose down).")
            log.error(self.error)
            return False

        import uvicorn
        from monarch import app  # ../Monarch API/monarch.py

        config = uvicorn.Config(app, host=self.host, port=self.port,
                                log_config=None, access_log=False)
        self._server = uvicorn.Server(config)
        # uvicorn skips installing signal handlers off the main thread.
        self._thread = threading.Thread(target=self._run, name="proxy", daemon=True)
        self._thread.start()

        deadline = time.monotonic() + wait
        while time.monotonic() < deadline:
            if self._server.started:
                log.info("Proxy listening on %s", self.url)
                return True
            if not self._thread.is_alive():
                break
            time.sleep(0.05)
        self.error = self.error or "Proxy failed to start. See the log for details."
        log.error(self.error)
        return False

    def _run(self):
        try:
            self._server.run()
        except BaseException as e:  # noqa: BLE001 - report anything to the UI
            self.error = f"Proxy stopped: {e}"
            log.exception("Proxy crashed")

    def stop(self, wait: float = 5.0):
        if self._server:
            self._server.should_exit = True
        if self._thread:
            self._thread.join(wait)
        self._server = self._thread = None
        log.info("Proxy stopped")


if __name__ == "__main__":
    server = ProxyServer()
    if not server.start():
        print(server.error, file=sys.__stderr__)
        sys.exit(1)
    print(f"Proxy running at {server.url} - press Ctrl+C to stop", file=sys.__stderr__)
    try:
        while server.running:
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass
    server.stop()
