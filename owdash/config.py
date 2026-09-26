"""Project paths and settings (read from config.toml at the project root)."""
from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB_DIR = ROOT / "web"
# OWDASH_DB lets tests point the app at a throwaway database instead of the real one.
DB_PATH = Path(os.environ.get("OWDASH_DB") or ROOT / "data" / "owdash.db")
DATA_DIR = DB_PATH.parent

# Game modes the dashboard tracks. "all" = OverFast's combined view (no gamemode filter).
MODES = ("all", "quickplay", "competitive")


@dataclass(frozen=True)
class Settings:
    player_name: str
    player_id: str
    api_base: str
    host: str
    port: int


def load_settings() -> Settings:
    with open(ROOT / "config.toml", "rb") as f:
        cfg = tomllib.load(f)
    return Settings(
        player_name=cfg["player"]["name"],
        player_id=cfg["player"]["player_id"],
        api_base=cfg["api"]["base_url"].rstrip("/"),
        host=cfg["server"]["host"],
        port=int(cfg["server"]["port"]),
    )
