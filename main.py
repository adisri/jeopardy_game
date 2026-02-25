import base64
import os
import secrets
from contextlib import asynccontextmanager
from psycopg2.errors import UniqueViolation

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware

import database


@asynccontextmanager
async def lifespan(app: FastAPI):
    database.init_db()
    yield


app = FastAPI(lifespan=lifespan)


class BasicAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Basic "):
            try:
                decoded = base64.b64decode(auth[6:]).decode("utf-8")
                username, _, password = decoded.partition(":")
                valid_user = secrets.compare_digest(username, os.environ["AUTH_USER"])
                valid_pass = secrets.compare_digest(password, os.environ["AUTH_PASS"])
                if valid_user and valid_pass:
                    return await call_next(request)
            except Exception:
                pass
        return Response(
            "Unauthorized",
            status_code=401,
            headers={"WWW-Authenticate": 'Basic realm="Jeopardy"'},
        )


app.add_middleware(BasicAuthMiddleware)


class CreateGameRequest(BaseModel):
    name: str
    config: dict
    categories: list


class SaveStateRequest(BaseModel):
    answeredCells: dict
    scores: dict
    players: list


class UpdateCategoriesRequest(BaseModel):
    categories: list


@app.get("/api/games")
def list_games():
    return database.list_games()


@app.post("/api/games", status_code=201)
def create_game(payload: CreateGameRequest):
    try:
        return database.create_game(payload.name, payload.config, payload.categories)
    except UniqueViolation:
        raise HTTPException(status_code=409, detail="A game with that name already exists.")


@app.get("/api/games/{id}")
def get_game(id: int):
    game = database.get_game(id)
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found.")
    return game


@app.patch("/api/games/{id}/state", status_code=200)
def save_game_state(id: int, payload: SaveStateRequest):
    game = database.get_game(id)
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found.")
    database.update_game_state(id, payload.dict())
    return {"ok": True}


@app.patch("/api/games/{id}/categories", status_code=200)
def update_categories(id: int, payload: UpdateCategoriesRequest):
    game = database.get_game(id)
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found.")
    database.update_game_categories(id, payload.categories)
    return {"ok": True}


@app.delete("/api/games/{id}", status_code=204)
def delete_game(id: int):
    deleted = database.delete_game(id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Game not found.")


@app.get("/")
def root():
    return FileResponse("static/index.html")


app.mount("/", StaticFiles(directory="static"), name="static")
