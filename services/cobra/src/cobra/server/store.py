"""SQLite store for the verifier-safety leaderboard — one row per submission (snapshots).

Stdlib sqlite3, short-lived connection per call (+ WAL), idempotent schema. The board shows the
LATEST row per env_name (resubmitting updates your row); all snapshots are retained.
"""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path

DEFAULT_DB = os.environ.get("GOODHART_BOARD_DB", "runs/leaderboard.db")

_COLS = (
    "id",
    "env_name",
    "substrate",
    "headline_false_accept",
    "headline_safety",
    "n_completions",
    "n_exploits",
    "model_count",
    "verified",
    "payload_json",
    "created_at",
)

_SCHEMA = """
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY,
  env_name TEXT NOT NULL,
  substrate TEXT,
  headline_false_accept REAL,
  headline_safety REAL,
  n_completions INTEGER,
  n_exploits INTEGER,
  model_count INTEGER,
  verified INTEGER DEFAULT 0,
  payload_json TEXT,
  created_at TEXT
)
"""


def _connect(db_path: str) -> sqlite3.Connection:
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    return con


def init_db(db_path: str = DEFAULT_DB) -> None:
    with _connect(db_path) as con:
        con.execute(_SCHEMA)


def insert(row: dict, db_path: str = DEFAULT_DB) -> str:
    with _connect(db_path) as con:
        con.execute(
            f"INSERT INTO submissions ({','.join(_COLS)}) VALUES ({','.join('?' * len(_COLS))})",
            [row.get(c) for c in _COLS],
        )
    return row["id"]


def get(sub_id: str, db_path: str = DEFAULT_DB) -> dict | None:
    with _connect(db_path) as con:
        r = con.execute("SELECT * FROM submissions WHERE id=?", (sub_id,)).fetchone()
    return dict(r) if r else None


def leaderboard(
    db_path: str = DEFAULT_DB, *, limit: int = 100, sort: str = "gameable"
) -> list[dict]:
    """Latest row per env_name, ordered. sort=gameable → most false-accept first; else safest."""
    order = "headline_false_accept DESC" if sort == "gameable" else "headline_safety DESC"
    q = (
        "SELECT * FROM submissions s WHERE s.created_at = "
        "(SELECT MAX(created_at) FROM submissions WHERE env_name = s.env_name) "
        f"ORDER BY {order}, id LIMIT ?"
    )
    with _connect(db_path) as con:
        return [dict(r) for r in con.execute(q, (limit,)).fetchall()]
