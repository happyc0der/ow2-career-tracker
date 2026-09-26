"""Sync job: fetch the public career profile from OverFast API and store snapshots.

Each run stores a new data point only when the stats have changed since the last snapshot,
so running it often (the scheduled task runs every 3 hours) keeps the database small.
"""
from __future__ import annotations

import time
from urllib.parse import quote

import httpx

from . import db
from .config import MODES, Settings, load_settings

TIMEOUT = httpx.Timeout(60.0)
MAX_WAIT = 90  # seconds we are willing to wait when OverFast asks us to retry


class SyncError(RuntimeError):
    pass


def _get(client: httpx.Client, url: str, params: dict | None = None) -> dict | list:
    for attempt in range(3):
        r = client.get(url, params=params)
        if r.status_code == 200:
            return r.json()
        retry_after = None
        try:
            retry_after = int(r.headers.get("Retry-After") or r.json().get("retry_after") or 0)
        except Exception:
            pass
        if r.status_code in (429, 500, 502, 503, 504) and attempt < 2:
            time.sleep(min(retry_after or 5 * (attempt + 1), MAX_WAIT))
            continue
        detail = ""
        try:
            detail = r.json().get("error", "")
        except Exception:
            detail = r.text[:200]
        raise SyncError(f"{r.status_code} from {url}: {detail}")
    raise SyncError(f"gave up on {url}")


def resolve_player_id(client: httpx.Client, s: Settings) -> str:
    """Use the configured id; if it 404s, look the player up by name."""
    try:
        _get(client, f"{s.api_base}/players/{quote(s.player_id, safe='')}/summary")
        return s.player_id
    except SyncError as e:
        if not str(e).startswith("404"):
            raise
    found = _get(client, f"{s.api_base}/players", {"name": s.player_name})
    public = [p for p in found.get("results", []) if p.get("is_public")]
    if not public:
        raise SyncError(f"no public profile found for {s.player_name!r}")
    return public[0]["player_id"].replace("%7C", "|")


def refresh_metadata(client: httpx.Client, s: Settings, con) -> None:
    heroes = _get(client, f"{s.api_base}/heroes")
    con.executemany("INSERT OR REPLACE INTO heroes(key, name, role, portrait) VALUES (?,?,?,?)",
                    [(h["key"], h["name"], h["role"], h.get("portrait")) for h in heroes])
    roles = _get(client, f"{s.api_base}/roles")
    con.executemany("INSERT OR REPLACE INTO roles(key, name, icon) VALUES (?,?,?)",
                    [(r["key"], r["name"], r.get("icon")) for r in roles])


def sync(verbose: bool = True) -> dict:
    s = load_settings()
    new_points = 0
    with httpx.Client(timeout=TIMEOUT, headers={"User-Agent": "owdash/1.0 (personal dashboard)"}) as client, db.connect() as con:
        try:
            pid = resolve_player_id(client, s)
            enc = quote(pid, safe="")
            base = f"{s.api_base}/players/{enc}"
            now = int(time.time())

            summary = _get(client, f"{base}/summary")
            upd = summary.get("last_updated_at")
            new_points += db.add_snapshot(con, "summary", "all", summary, upd, now)

            for mode in MODES:
                params = None if mode == "all" else {"gamemode": mode}
                stats = _get(client, f"{base}/stats/summary", params)
                new_points += db.add_snapshot(con, "stats", mode, stats, upd, now)
            for mode in ("quickplay", "competitive"):
                career = _get(client, f"{base}/stats/career", {"gamemode": mode})
                new_points += db.add_snapshot(con, "career", mode, career, upd, now)

            refresh_metadata(client, s, con)
            msg = f"synced {summary.get('username')} ({new_points} new data point(s))"
            db.log_sync(con, True, new_points, msg)
        except (SyncError, httpx.HTTPError) as e:
            msg = f"sync failed: {e}"
            db.log_sync(con, False, new_points, msg)
            if verbose:
                print(msg)
            return {"ok": False, "new_points": new_points, "message": msg}
    if verbose:
        print(msg)
    return {"ok": True, "new_points": new_points, "message": msg}
