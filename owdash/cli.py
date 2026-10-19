"""Command line:  owdash sync   |   owdash serve [--no-browser]"""
from __future__ import annotations

import argparse
import threading
import time
import urllib.request
import webbrowser


def _answers(url: str) -> bool:
    try:
        with urllib.request.urlopen(url + "api/state", timeout=2) as r:
            return r.status == 200
    except Exception:
        return False


def _open_when_ready(url: str, timeout: float = 60.0) -> None:
    """Open the browser once the server answers, not on a fixed delay (a slow start used to win the race)."""
    end = time.time() + timeout
    while time.time() < end and not _answers(url):
        time.sleep(0.25)
    webbrowser.open(url)


def main() -> None:
    ap = argparse.ArgumentParser(prog="owdash", description="Overwatch 2 career dashboard")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("sync", help="fetch the latest career stats and store a snapshot")
    sv = sub.add_parser("serve", help="run the dashboard web server")
    sv.add_argument("--no-browser", action="store_true", help="don't open a browser tab")
    sv.add_argument("--no-sync", action="store_true", help="skip the sync on startup")
    args = ap.parse_args()

    from .config import load_settings
    if args.cmd == "sync":
        from .collect import sync
        raise SystemExit(0 if sync()["ok"] else 1)

    import uvicorn
    s = load_settings()
    url = f"http://{s.host}:{s.port}/"
    if _answers(url):  # already running (e.g. the shortcut clicked twice): just show it
        print(f"OW2 dashboard already running on {url}")
        if not args.no_browser:
            webbrowser.open(url)
        return
    if not args.no_sync:
        from .collect import sync
        sync()
    if not args.no_browser:
        threading.Thread(target=_open_when_ready, args=(url,), daemon=True).start()
    print(f"OW2 dashboard on {url}  (Ctrl+C to stop)")
    uvicorn.run("owdash.server:app", host=s.host, port=s.port, log_level="warning")


if __name__ == "__main__":
    main()
