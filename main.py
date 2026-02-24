from contextlib import asynccontextmanager
from psycopg2.errors import UniqueViolation

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import database


@asynccontextmanager
async def lifespan(app: FastAPI):
    database.init_db()
    yield


app = FastAPI(lifespan=lifespan)


class CreateGameRequest(BaseModel):
    name: str
    config: dict
    categories: list


class SaveStateRequest(BaseModel):
    answeredCells: dict
    scores: dict
    players: list


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


@app.delete("/api/games/{id}", status_code=204)
def delete_game(id: int):
    deleted = database.delete_game(id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Game not found.")


@app.get("/")
def root():
    return FileResponse("static/index.html")


app.mount("/", StaticFiles(directory="static"), name="static")
