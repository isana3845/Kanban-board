from fastapi import FastAPI, Depends, HTTPException
import asyncio
import json
from models import Base
from database import get_db
from services import BoardService, TaskService, UserCreate
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.ext.asyncio import AsyncSession
from services import *

app = FastAPI()

app = FastAPI()

'''users'''


@app.get("/users")
async def get_all_users(session: AsyncSession = Depends(get_db())) -> list[dict]:
    r = await UserService.get_users(session=session)
    if not r:
        raise HTTPException(status_code=404, detail="User not found")
    return r


@app.get("/users/{id}")
async def get_user(id: int, session: AsyncSession = Depends(get_db())) -> dict:
    r = await UserService.get_user(user_id=id, session=session)
    if not r:
        raise HTTPException(status_code=404, detail="User not found")
    return r


@app.post("/users")
async def create_user(
        user_data: UserCreate,
        session: AsyncSession = Depends(get_db())
        ):
    r = await UserService.create(session=session, user_id=user_data.user_id, username=user_data.username,
                                 email=user_data.email, assigned_tasks=user_data.assigned_tasks)
    
    if not r:
        raise HTTPException(status_code=500, detail="Something went wrong while creating new user")
    
    return r


@app.put("/users/{id}")
def update_user(id: int, data: list, session: AsyncSession = Depends(get_db())):
    ...


@app.delete("/users/{id}")
def delete_user(id: int):
    ...


'''boards'''


@app.get("/boards")
def get_boards():
    ...


@app.get("/boards/{id}")
def get_board(id: int):
    ...


@app.post("/boards") 
def create_board():  
    ...


@app.put("/boards/{id}")
def edit_board(id: int):
    ...


@app.delete("/boards/{id}")
def delete_board(id: int): 
    ...


'''columns'''

@app.get("/boards/{board_id}/columns")
def get_columns(board_id: int):
    ...


@app.post("/boards/{board_id}/columns")
def create_column(board_id: int):
    ...


@app.put("/columns/{id}")
def edit_column(id: int):
    ...


@app.delete("/columns/{id}")
def delete_column(id: int):
    ...


'''tasks'''


@app.get("/boards/{board_id}/tasks")
def get_tasks(board_id: int):
    ...


@app.get("/tasks/{id}")
def get_task(id: int):
    ...


@app.post("/boards/{board_id}/tasks")
def create_task(board_id: int):
    ...


@app.put("/tasks/{id}")
def edit_task(id: int):
    ...


@app.delete("/tasks/{id}")
def delete_task(id: int):
    ...


'''moving tasks'''


@app.patch("/tasks/{task_id}/move/{target_column}")
def move_task(task_id: int):
    ...


'''events'''

@app.get("/boards/{board_id}/events")
def get_board_history(board_id: int):
    ...


@app.get("/tasks/{task_id}/events")
def get_task_history(task_id: int):
    ...


async def init_db():
    # Создаем асинхронный engine
    engine = create_async_engine("sqlite+aiosqlite:///example.db")
    
    # Создаем ВСЕ таблицы
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    return engine

async def main():
    engine = await init_db()
    
    async with AsyncSession(engine, expire_on_commit=False) as session:
        board = await BoardService.create_board(session=session, title="example")
        # await UserService.create(session=session, user_id=2, username="kembi", email='wewewe', assigned_tasks=[])
        r = await UserService.get_users(session=session)
        print(r)
        print(f"Created board: {board.title} with id {board.id}")
    
    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())