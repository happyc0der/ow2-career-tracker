"""Command line:  owdash sync   |   owdash serve [--no-browser]"""
from __future__ import annotations

import argparse
import threading
import webbrowser


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
    if not args.no_sync:
        from .collect import sync
        sync()
    url = f"http://{s.host}:{s.port}/"
    if not args.no_browser:
        threading.Timer(1.5, lambda: webbrowser.open(url)).start()
    print(f"OW2 dashboard on {url}  (Ctrl+C to stop)")
    uvicorn.run("owdash.server:app", host=s.host, port=s.port, log_level="warning")


if __name__ == "__main__":
    main()
