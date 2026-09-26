# OW2 Career Tracker

A personal Overwatch 2 dashboard for **DankAxon**. It snapshots my public career profile every few
hours and charts every hero's stats over time — time played, win rate, KDA, eliminations, damage and
healing — in an Overwatch-style UI.

- **Player banner:** namecard, icon, title, endorsement level and current competitive rank.
- **Headline stats** with changes since tracking started (games, W/L, time played, session win rate).
- **Career over time:** win rate and KDA across all snapshots.
- **Role split** (tank / damage / support share of time played).
- **Hero roster** (sort by time, win rate, KDA or games; filter by role) with a "+N games" badge for heroes
  played since tracking started.
- **Hero detail:** 10 key stats, "since tracking" summary, six over-time charts, and the full career
  tables (combat, best, game, assists, averages, hero-specific), for Quick Play and Competitive.
- **Modes:** All / Quick Play / Competitive.

## How it works

```
Blizzard career profile  ──►  OverFast API  ──►  owdash sync  ──►  data/owdash.db (SQLite)
                                                   (every 3 h)             │
                        browser  ◄──  web/ (HTML/CSS/JS + Chart.js)  ◄──  owdash serve (FastAPI)
```

- The profile only exposes **current lifetime totals**, not match history. So "over time" is built by
  saving a snapshot on every sync. A new point is stored only when the stats actually changed, so the
  database stays small. **History starts on the first sync (26 September 2026)** and grows as you play.
- Data comes from [OverFast API](https://overfast-api.tekrop.fr), a free, unofficial API that reads the
  public Blizzard career profile. The profile must be **public** in-game
  (Options → Social → Career Profile Visibility → Public).
- **Competitive** stats on the career profile cover the **current season only** (Blizzard resets them).

## Run it

Needs [uv](https://docs.astral.sh/uv/) (it installs Python and the dependencies itself).

**Windows:** Start menu → **OW2 Career Tracker** (after running the installer below), or:

```powershell
cd "C:\Users\KESHAV\Desktop\TOFIN\NYU\ProjectE"
uv run owdash serve
```

It syncs once, then opens <http://127.0.0.1:8765>. Close the window (or Ctrl+C) to stop it.
The **Sync** button in the top-right fetches the latest stats at any time.

Other commands:

```bash
uv run owdash sync                            # take a snapshot now (what the scheduled task runs)
uv run owdash serve --no-browser --no-sync    # just the server
```

## Automatic syncing (Windows)

```powershell
.\scripts\install-windows.ps1              # scheduled task every 3 h (+5 min after logon) and a Start menu shortcut
.\scripts\install-windows.ps1 -Uninstall   # remove both
```

No Admin needed. The task runs silently (`scripts\sync-hidden.vbs`) and appends to `data\sync.log`.
On macOS/Linux, add `cd /path/to/ProjectE && uv run owdash sync` to cron instead.

## Configuration — `config.toml`

| Setting | Meaning |
|---|---|
| `player.name` | Display name, used to look the profile up if the id stops working |
| `player.player_id` | Blizzard's internal profile id. The old BattleTag form (`DankAxon-3198`) no longer resolves on OverFast, so the id from `https://overfast-api.tekrop.fr/players?name=DankAxon` is used |
| `api.base_url` | OverFast API base URL |
| `server.host` / `server.port` | Where the dashboard is served (default `127.0.0.1:8765`) |

## Project structure

```
owdash/
  cli.py        `owdash sync` / `owdash serve`
  collect.py    OverFast client + sync job (retries, rate limits, player lookup)
  db.py         SQLite schema; deduplicated snapshots, hero/role metadata, sync log
  server.py     FastAPI: /api/state, /api/overview, /api/hero/{key}, /api/sync, and the static site
  config.py     paths and config.toml loading (OWDASH_DB env var points it at a test database)
web/            index.html, styles.css, app.js (vanilla JS + Chart.js)
scripts/        Windows installer, hidden sync launcher, start-dashboard.cmd
data/           owdash.db and sync.log (not in git)
legacy/test.py  the original one-off OverFast script this grew out of
```

API docs (auto-generated) are at <http://127.0.0.1:8765/api/docs> while the server runs.

## Backing up history

Everything lives in `data/owdash.db`. It isn't in git (it's personal data that changes constantly), so copy
that one file if you move machines.

---

Not affiliated with Blizzard Entertainment. Overwatch and hero artwork © Blizzard Entertainment.

## License

Released into the public domain under [The Unlicense](LICENSE) — use it for anything, no attribution required.
