"""Read-only public copy of the dashboard for GitHub Pages.

  owdash export <dir>   write the page + every API answer it needs as static JSON into <dir>
  owdash publish        export into data/site (a git worktree of the gh-pages branch) and push it,
                        but only when the stats changed; does nothing until it has been run once by hand
                        (owdash publish --setup), so other copies of the repo aren't affected.

The page detects the copy (window.OWDASH_STATIC) and reads api/<name>-<mode>.json instead of calling the server;
its Sync button becomes a link to the repo.
"""
from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path

from fastapi import HTTPException

from . import server
from .config import DATA_DIR, MODES, WEB_DIR

ROOT = WEB_DIR.parent
SITE = DATA_DIR / "site"
BRANCH = "gh-pages"


def _write(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, sort_keys=True, separators=(",", ":")), encoding="utf-8")


def export(out: Path) -> int:
    """Writes the static site; returns the number of JSON files."""
    out.mkdir(parents=True, exist_ok=True)
    n = 0
    for mode in MODES:
        st = server.state(mode)
        meta = st.get("meta") or {}
        # the copy should only change when the stats do: report the last change, not the last sync attempt
        meta["last_sync"] = {"at": meta.get("last_change"), "ok": 1, "new_points": 0, "message": ""}
        _write(out / "api" / f"state-{mode}.json", st)
        n += 1
        if st.get("empty"):
            continue
        _write(out / "api" / f"overview-{mode}.json", server.overview(mode))
        n += 1
        for h in st["heroes"]:
            try:
                _write(out / "api" / "hero" / f"{h['key']}-{mode}.json", server.hero(h["key"], mode))
                n += 1
            except HTTPException:
                pass
    html = (WEB_DIR / "index.html").read_text(encoding="utf-8")
    marker = '<script src="app.js'
    if marker not in html:
        raise RuntimeError("index.html: app.js script tag not found")
    html = html.replace(marker, '<script>window.OWDASH_STATIC = true;</script>\n  ' + marker, 1)
    (out / "index.html").write_text(html, encoding="utf-8")
    for f in ("app.js", "styles.css"):
        shutil.copy2(WEB_DIR / f, out / f)
    (out / ".nojekyll").write_text("", encoding="utf-8")  # serve files as they are
    return n


def _git(*args: str, cwd: Path = ROOT, check: bool = True) -> subprocess.CompletedProcess:
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}  # never wait for a password (scheduled task)
    r = subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, env=env)
    if check and r.returncode:
        raise RuntimeError(f"git {' '.join(args)}: {r.stderr.strip() or r.stdout.strip()}")
    return r


def setup() -> None:
    """Creates data/site as a worktree of gh-pages (from origin if it exists there, else a new orphan branch)."""
    if (SITE / ".git").exists():
        return
    remote = _git("ls-remote", "--heads", "origin", BRANCH).stdout.strip()
    if remote:
        _git("fetch", "origin", f"{BRANCH}:{BRANCH}", check=False)
        _git("worktree", "add", str(SITE), BRANCH)
    else:
        _git("worktree", "add", "--orphan", "-b", BRANCH, str(SITE))


def publish(do_setup: bool = False) -> str:
    if do_setup:
        setup()
    if not (SITE / ".git").exists():
        return "publish: not set up (run 'owdash publish --setup' once); skipped"
    for p in SITE.iterdir():  # rebuild from scratch so removed heroes/modes disappear too
        if p.name == ".git":
            continue
        shutil.rmtree(p) if p.is_dir() else p.unlink()
    n = export(SITE)
    _git("add", "-A", cwd=SITE)
    if not _git("status", "--porcelain", cwd=SITE).stdout.strip():
        return f"publish: site unchanged ({n} data files)"
    _git("commit", "-m", "Update public stats", cwd=SITE)
    _git("push", "origin", BRANCH, cwd=SITE)
    return f"publish: pushed ({n} data files)"
