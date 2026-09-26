"""SQLite storage: raw API snapshots (deduplicated) plus cached hero/role metadata."""
from __future__ import annotations

import hashlib
import json
import sqlite3
import time
from contextlib import contextmanager
from typing import Any, Iterator

from .config import DATA_DIR, DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS snapshots (
    id                INTEGER PRIMARY KEY,
    fetched_at        INTEGER NOT NULL,          -- unix seconds when we fetched it
    kind              TEXT    NOT NULL,          -- 'summary' | 'stats' | 'career'
    mode              TEXT    NOT NULL,          -- 'all' | 'quickplay' | 'competitive'
    player_updated_at INTEGER,                   -- Blizzard profile timestamp at fetch time
    sha               TEXT    NOT NULL,          -- hash of payload, used to skip duplicates
    payload           TEXT    NOT NULL           -- raw JSON from OverFast
);
CREATE INDEX IF NOT EXISTS ix_snapshots ON snapshots(kind, mode, fetched_at);

CREATE TABLE IF NOT EXISTS heroes (
    key TEXT PRIMARY KEY, name TEXT, role TEXT, portrait TEXT
);
CREATE TABLE IF NOT EXISTS roles (
    key TEXT PRIMARY KEY, name TEXT, icon TEXT
);
CREATE TABLE IF NOT EXISTS sync_log (
    id INTEGER PRIMARY KEY, at INTEGER NOT NULL, ok INTEGER NOT NULL, new_points INTEGER NOT NULL, message TEXT
);
"""


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    # wait out a concurrent writer (scheduled sync + Sync button) instead of failing with "database is locked";
    # a sync can hold its transaction through ~90 s of API retries
    con = sqlite3.connect(DB_PATH, timeout=120)
    con.row_factory = sqlite3.Row
    try:
        con.executescript(SCHEMA)
        yield con
        con.commit()
    finally:
        con.close()


def _sha(payload: Any) -> str:
    return hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()


def add_snapshot(con: sqlite3.Connection, kind: str, mode: str, payload: Any,
                 player_updated_at: int | None, now: int | None = None) -> bool:
    """Store a snapshot unless it is identical to the latest one of the same kind/mode.
    Returns True if a new point was added."""
    sha = _sha(payload)
    last = con.execute(
        "SELECT sha FROM snapshots WHERE kind=? AND mode=? ORDER BY fetched_at DESC, id DESC LIMIT 1",
        (kind, mode)).fetchone()
    if last and last["sha"] == sha:
        return False
    con.execute(
        "INSERT INTO snapshots(fetched_at, kind, mode, player_updated_at, sha, payload) VALUES (?,?,?,?,?,?)",
        (now or int(time.time()), kind, mode, player_updated_at, sha, json.dumps(payload)))
    return True


def snapshots(con: sqlite3.Connection, kind: str, mode: str) -> list[tuple[int, Any]]:
    rows = con.execute(
        "SELECT fetched_at, payload FROM snapshots WHERE kind=? AND mode=? ORDER BY fetched_at, id",
        (kind, mode)).fetchall()
    return [(r["fetched_at"], json.loads(r["payload"])) for r in rows]


def latest(con: sqlite3.Connection, kind: str, mode: str) -> tuple[int, Any] | None:
    r = con.execute(
        "SELECT fetched_at, payload FROM snapshots WHERE kind=? AND mode=? ORDER BY fetched_at DESC, id DESC LIMIT 1",
        (kind, mode)).fetchone()
    return (r["fetched_at"], json.loads(r["payload"])) if r else None


def log_sync(con: sqlite3.Connection, ok: bool, new_points: int, message: str) -> None:
    con.execute("INSERT INTO sync_log(at, ok, new_points, message) VALUES (?,?,?,?)",
                (int(time.time()), int(ok), new_points, message[:500]))
