import json
import os

import psycopg2
import psycopg2.extras


def get_connection():
    return psycopg2.connect(os.environ["DATABASE_URL"])


def init_db():
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS games (
                    id          SERIAL PRIMARY KEY,
                    name        TEXT      NOT NULL UNIQUE,
                    config      TEXT      NOT NULL,
                    categories  TEXT      NOT NULL,
                    game_state  TEXT,
                    created_at  TIMESTAMP NOT NULL DEFAULT NOW()
                )
            """)
        conn.commit()
    finally:
        conn.close()


def list_games():
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT id, name, created_at, game_state FROM games ORDER BY created_at DESC"
            )
            rows = cur.fetchall()
        result = []
        for row in rows:
            d = dict(row)
            d["has_state"] = d.pop("game_state") is not None
            result.append(d)
        return result
    finally:
        conn.close()


def get_game(id: int):
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM games WHERE id = %s", (id,))
            row = cur.fetchone()
        if row is None:
            return None
        data = dict(row)
        data["config"] = json.loads(data["config"])
        data["categories"] = json.loads(data["categories"])
        if data.get("game_state"):
            data["game_state"] = json.loads(data["game_state"])
        else:
            data["game_state"] = None
        return data
    finally:
        conn.close()


def update_game_state(game_id: int, state_dict: dict):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE games SET game_state = %s WHERE id = %s",
                (json.dumps(state_dict), game_id),
            )
        conn.commit()
    finally:
        conn.close()


def create_game(name: str, config: dict, categories: list):
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO games (name, config, categories) VALUES (%s, %s, %s) RETURNING id",
                (name, json.dumps(config), json.dumps(categories)),
            )
            row = cur.fetchone()
        conn.commit()
        return {"id": row[0], "name": name}
    finally:
        conn.close()


def delete_game(id: int) -> bool:
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM games WHERE id = %s", (id,))
            deleted = cur.rowcount > 0
        conn.commit()
        return deleted
    finally:
        conn.close()
