#!/usr/bin/env python3
"""Build the Turso upload database from the locally captured Neon export.

The source database is the repository's real-data SQLite export. This script
keeps all users/profiles/metadata, removes non-Yori pastes (and cascading
likes), and leaves the resulting database in WAL mode for Turso uploads.
"""
from pathlib import Path
import shutil
import sqlite3

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "vibebin.db"
OUTPUT = ROOT / "vibebin-turso.db"
YORI = "9c6fe730-f938-4abc-b183-770ba43d9550"

if not SOURCE.exists():
    raise SystemExit(f"Missing source database: {SOURCE}")

for suffix in ("", "-wal", "-shm"):
    path = Path(str(OUTPUT) + suffix)
    if path.exists():
        path.unlink()
shutil.copy2(SOURCE, OUTPUT)

con = sqlite3.connect(OUTPUT)
con.execute("PRAGMA foreign_keys = ON")
# Delete children explicitly so this remains correct even if a source export
# was created without foreign-key enforcement enabled.
con.execute("DELETE FROM likes WHERE paste_id IN (SELECT id FROM pastes WHERE user_id <> ? OR user_id IS NULL)", (YORI,))
con.execute("DELETE FROM pastes WHERE user_id <> ? OR user_id IS NULL", (YORI,))
# The Neon snapshot reports 53 profile views for Yori.
con.execute("UPDATE profiles SET views = 53 WHERE user_id = ?", (YORI,))
con.commit()

# Turso file uploads require WAL. Checkpoint any pending frames so the
# deliverable is self-contained while retaining journal_mode=WAL in its header.
mode = con.execute("PRAGMA journal_mode=WAL").fetchone()[0]
if mode.lower() != "wal":
    raise RuntimeError(f"Unable to enable WAL mode (got {mode!r})")
con.execute("PRAGMA wal_checkpoint(TRUNCATE)")
con.commit()

checks = {
    "users": 12,
    "profiles": 12,
    "pastes": 6,
    "likes": 1,
    "tags": 8,
    "user_tags": 6,
    "stickers": 22,
    "signup_ips": 9,
    "password_resets": 0,
}
for table, expected in checks.items():
    actual = con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    if actual != expected:
        raise RuntimeError(f"{table}: expected {expected}, got {actual}")

remaining_users = con.execute("SELECT COUNT(*) FROM pastes WHERE user_id <> ? OR user_id IS NULL", (YORI,)).fetchone()[0]
if remaining_users:
    raise RuntimeError("Non-Yori pastes remain")
if con.execute("PRAGMA foreign_key_check").fetchone() is not None:
    raise RuntimeError("Foreign-key violations found")

print(f"Built {OUTPUT.name}")
print("journal_mode:", con.execute("PRAGMA journal_mode").fetchone()[0])
for table in checks:
    print(f"{table}: {con.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]}")
con.close()
