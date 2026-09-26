"""FastAPI app: JSON API over the stored snapshots + the static dashboard in web/."""
from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import db
from .collect import sync
from .config import MODES, WEB_DIR

app = FastAPI(title="OW2 Career Dashboard", docs_url="/api/docs", openapi_url="/api/openapi.json")

AVG_KEYS = ("eliminations", "assists", "deaths", "damage", "healing")


def _mode(mode: str) -> str:
    if mode not in MODES:
        raise HTTPException(400, f"mode must be one of {MODES}")
    return mode


def _point(ts: int, s: dict | None) -> dict[str, Any] | None:
    """Flatten one stats block (general / role / hero) into a chart point."""
    if not s:
        return None
    avg = s.get("average") or {}
    tot = s.get("total") or {}
    return {
        "ts": ts,
        "time_played": s.get("time_played"),
        "games_played": s.get("games_played"),
        "games_won": s.get("games_won"),
        "games_lost": s.get("games_lost"),
        "winrate": s.get("winrate"),
        "kda": s.get("kda"),
        **{f"avg_{k}": avg.get(k) for k in AVG_KEYS},
        **{f"total_{k}": tot.get(k) for k in AVG_KEYS},
    }


def _meta(con, mode: str) -> dict:
    snaps = con.execute("SELECT MIN(fetched_at) first, MAX(fetched_at) last, COUNT(*) n FROM snapshots "
                        "WHERE kind='stats' AND mode=?", (mode,)).fetchone()
    last_sync = con.execute("SELECT at, ok, new_points, message FROM sync_log ORDER BY id DESC LIMIT 1").fetchone()
    return {
        "tracking_since": snaps["first"], "last_change": snaps["last"], "points": snaps["n"],
        "last_sync": dict(last_sync) if last_sync else None,
    }


@app.get("/api/state")
def state(mode: str = Query("all")) -> dict:
    mode = _mode(mode)
    with db.connect() as con:
        summary = db.latest(con, "summary", "all")
        history = db.snapshots(con, "stats", mode)
        heroes_meta = {r["key"]: dict(r) for r in con.execute("SELECT * FROM heroes")}
        roles_meta = {r["key"]: dict(r) for r in con.execute("SELECT * FROM roles")}
        meta = _meta(con, mode)
    if not history:
        return {"empty": True, "meta": meta, "summary": summary[1] if summary else None}

    first_ts, first = history[0]
    last_ts, last = history[-1]
    heroes = []
    for key, s in (last.get("heroes") or {}).items():
        m = heroes_meta.get(key, {})
        base = (first.get("heroes") or {}).get(key) or {}
        heroes.append({
            "key": key, "name": m.get("name", key.replace("-", " ").title()), "role": m.get("role"),
            "portrait": m.get("portrait"), "latest": _point(last_ts, s),
            "delta": {
                "games_played": (s.get("games_played") or 0) - (base.get("games_played") or 0),
                "time_played": (s.get("time_played") or 0) - (base.get("time_played") or 0),
                "games_won": (s.get("games_won") or 0) - (base.get("games_won") or 0),
            },
        })
    heroes.sort(key=lambda h: -(h["latest"]["time_played"] or 0))
    roles = {k: {**_point(last_ts, v), "icon": roles_meta.get(k, {}).get("icon"), "name": roles_meta.get(k, {}).get("name", k.title())}
             for k, v in (last.get("roles") or {}).items() if v}
    return {
        "empty": False, "mode": mode, "meta": meta,
        "summary": summary[1] if summary else None,
        "general": _point(last_ts, last.get("general")),
        "general_first": _point(first_ts, first.get("general")),
        "roles": roles, "role_icons": {k: v.get("icon") for k, v in roles_meta.items()},
        "heroes": heroes,
    }


@app.get("/api/overview")
def overview(mode: str = Query("all")) -> dict:
    mode = _mode(mode)
    with db.connect() as con:
        history = db.snapshots(con, "stats", mode)
    return {
        "general": [p for ts, s in history if (p := _point(ts, s.get("general")))],
        "roles": {r: [p for ts, s in history if (p := _point(ts, (s.get("roles") or {}).get(r)))]
                  for r in ("tank", "damage", "support")},
    }


@app.get("/api/hero/{key}")
def hero(key: str, mode: str = Query("all")) -> dict:
    mode = _mode(mode)
    with db.connect() as con:
        history = db.snapshots(con, "stats", mode)
        careers = {m: db.latest(con, "career", m) for m in ("quickplay", "competitive")}
        m = con.execute("SELECT * FROM heroes WHERE key=?", (key,)).fetchone()
    series = [p for ts, s in history if (p := _point(ts, (s.get("heroes") or {}).get(key)))]
    if not series:
        raise HTTPException(404, f"no stats for hero {key!r} in mode {mode!r}")
    career = {}
    wanted = ("quickplay", "competitive") if mode == "all" else (mode,)
    for cm in wanted:
        snap = careers.get(cm)
        if snap and isinstance(snap[1], dict) and key in snap[1]:
            career[cm] = snap[1][key]
    return {"key": key, "meta": dict(m) if m else {"key": key}, "series": series, "career": career}


@app.post("/api/sync")
async def sync_now() -> dict:
    return await run_in_threadpool(sync, False)


@app.get("/")
def index() -> FileResponse:
    return FileResponse(WEB_DIR / "index.html")


app.mount("/", StaticFiles(directory=WEB_DIR), name="web")
