import sqlite3
import json

DB_PATH = "games.db"


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS games (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT    NOT NULL UNIQUE,
                config      TEXT    NOT NULL,
                categories  TEXT    NOT NULL,
                created_at  TIMESTAMP NOT NULL DEFAULT (datetime('now'))
            )
        """)
        conn.commit()


def list_games():
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, name, created_at FROM games ORDER BY created_at DESC"
        ).fetchall()
        return [dict(row) for row in rows]


def get_game(id: int):
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM games WHERE id = ?", (id,)).fetchone()
        if row is None:
            return None
        data = dict(row)
        data["config"] = json.loads(data["config"])
        data["categories"] = json.loads(data["categories"])
        return data


def create_game(name: str, config: dict, categories: list):
    with get_connection() as conn:
        cursor = conn.execute(
            "INSERT INTO games (name, config, categories) VALUES (?, ?, ?)",
            (name, json.dumps(config), json.dumps(categories)),
        )
        conn.commit()
        return {"id": cursor.lastrowid, "name": name}


def delete_game(id: int) -> bool:
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM games WHERE id = ?", (id,))
        conn.commit()
        return cursor.rowcount > 0
