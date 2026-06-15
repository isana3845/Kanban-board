from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy import select
from database import get_db
from services import BoardService, TaskService, UserService, UserCreate, UserUpdate, TaskCreate
from models import Board, BoardColumn, Task, User, Log, Base
from contextlib import asynccontextmanager
from database import engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Создаем таблицы при старте
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    # Закрываем engine при остановке
    await engine.dispose()

app = FastAPI(lifespan=lifespan)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # URL фронтенда
    allow_credentials=True,
    allow_methods=["*"],  # Разрешить все методы (GET, POST, PUT, DELETE, PATCH)
    allow_headers=["*"],  # Разрешить все заголовки
)

# ==================== USERS ====================

@app.get("/users", response_model=List[dict])
async def get_all_users(session: AsyncSession = Depends(get_db)) -> list[dict]:
    r = await UserService.get_users(session=session)
    if not r:
        return []
    return r


@app.get("/users/{id}", response_model=dict)
async def get_user(id: int, session: AsyncSession = Depends(get_db)) -> dict:
    r = await UserService.get_user(user_id=id, session=session)
    if not r:
        raise HTTPException(status_code=404, detail=f"User {id} not found")
    return r


@app.post("/users", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: UserCreate,
    session: AsyncSession = Depends(get_db)
):
    try:
        r = await UserService.create(session=session, **user_data.model_dump())
        return r
    except ValueError as e:
        raise e
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise e
        raise HTTPException(status_code=500, detail="Something went wrong while creating new user")


@app.put("/users/{id}", response_model=dict)
async def update_user(
    id: int, 
    data: UserUpdate, 
    session: AsyncSession = Depends(get_db)
):
    try:
        r = await UserService.update_user_info(
            user_id=id, 
            **data.model_dump(exclude_unset=True), 
            session=session
        )
        if not r:
            raise HTTPException(status_code=404, detail=f"User {id} not found")
        return r
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.delete("/users/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(id: int, session: AsyncSession = Depends(get_db)):
    try:
        await UserService.delete(user_id=id, session=session)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ==================== BOARDS ====================

@app.get("/boards", response_model=List[dict])
async def get_boards(session: AsyncSession = Depends(get_db)):
    result = await session.execute(select(Board))
    boards = result.scalars().all()
    return [board.to_json() for board in boards]


@app.get("/boards/{id}", response_model=dict)
async def get_board(id: int, session: AsyncSession = Depends(get_db)):
    board = await session.get(Board, id)
    if not board:
        raise HTTPException(status_code=404, detail=f"Board {id} not found")
    return board.to_json()


@app.post("/boards", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_board(
    title: str,
    session: AsyncSession = Depends(get_db)
):
    board = await BoardService.create_board(session=session, title=title)
    return board.to_json()


@app.put("/boards/{id}", response_model=dict)
async def edit_board(
    id: int, 
    title: str,
    session: AsyncSession = Depends(get_db)
):

    board = await session.get(Board, id)
    if not board:
        raise HTTPException(status_code=404, detail=f"Board {id} not found")
    
    board.title = title
    await session.commit()
    await session.refresh(board)
    return board.to_json()


@app.delete("/boards/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_board(id: int, session: AsyncSession = Depends(get_db)):
    board = await session.get(Board, id)
    if not board:
        raise HTTPException(status_code=404, detail=f"Board {id} not found")
    
    await session.delete(board)
    await session.commit()


# ==================== COLUMNS ====================

@app.get("/boards/{board_id}/columns", response_model=List[dict])
async def get_columns(board_id: int, session: AsyncSession = Depends(get_db)):
    # Жадно загружаем колонки
    stmt = select(Board).options(selectinload(Board.columns)).where(Board.id == board_id)
    result = await session.execute(stmt)
    board = result.scalar_one_or_none()
    
    if not board:
        raise HTTPException(status_code=404, detail=f"Board {board_id} not found")
    
    return [col.to_json() for col in board.columns]


@app.post("/boards/{board_id}/columns", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_column(
    board_id: int,
    title: str,
    position: int,
    session: AsyncSession = Depends(get_db)
):
    board = await session.get(Board, board_id)
    if not board:
        raise HTTPException(status_code=404, detail=f"Board {board_id} not found")
    
    column = BoardColumn(
        title=title,
        position=position,
        board_id=board_id
    )
    session.add(column)
    await session.commit()
    await session.refresh(column)
    return column.to_json()


@app.put("/columns/{id}", response_model=dict)
async def edit_column(
    id: int,
    title: str,
    position: int,
    session: AsyncSession = Depends(get_db)
):
    column = await session.get(BoardColumn, id)
    if not column:
        raise HTTPException(status_code=404, detail=f"Column {id} not found")
    
    column.title = title
    column.position = position
    await session.commit()
    await session.refresh(column)
    return column.to_json()


@app.delete("/columns/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_column(id: int, session: AsyncSession = Depends(get_db)):
    column = await session.get(BoardColumn, id)
    if not column:
        raise HTTPException(status_code=404, detail=f"Column {id} not found")
    
    await session.delete(column)
    await session.commit()


# ==================== TASKS ====================

@app.get("/boards/{board_id}/tasks", response_model=List[dict])
async def get_tasks(board_id: int, session: AsyncSession = Depends(get_db)):
    # Жадно загружаем колонки и их задачи
    stmt = select(Board).options(
        selectinload(Board.columns).selectinload(BoardColumn.tasks)
    ).where(Board.id == board_id)
    
    result = await session.execute(stmt)
    board = result.scalar_one_or_none()
    
    if not board:
        raise HTTPException(status_code=404, detail=f"Board {board_id} not found")
    
    all_tasks = []
    for column in board.columns:
        all_tasks.extend([task.to_json() for task in column.tasks])
    return all_tasks


@app.get("/tasks/{id}", response_model=dict)
async def get_task(id: int, session: AsyncSession = Depends(get_db)):
    task = await session.get(Task, id)
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {id} not found")
    return task.to_json()


@app.post("/boards/{board_id}/tasks", response_model=dict, status_code=status.HTTP_201_CREATED)
async def create_task(
    board_id: int,
    task_data: TaskCreate,
    session: AsyncSession = Depends(get_db)
):
    stmt = select(Board).options(selectinload(Board.columns)).where(Board.id == board_id)
    result = await session.execute(stmt)
    board = result.scalar_one_or_none()
    if not board:
        raise HTTPException(status_code=404, detail=f"Board {board_id} not found")
    
    if not board.columns:
        raise HTTPException(status_code=400, detail="Board has no columns")
    
    first_column = board.columns[0]
    print("=== ОТЛАДКА create_task ===")
    print(f"task_data.column_id = {task_data.column_id}")
    print(f"task_data.title = {task_data.title}")
    print(f"Полные данные: {task_data.model_dump()}")
    task = await TaskService.create(
        session=session,
        column_id=task_data.column_id if task_data.column_id is not None else first_column.id,  # если column_id не передан - используем первую колонку
        title=task_data.title,
        description=task_data.description,
        assigned_to=task_data.assigned_to,
        created_by=1
    )
    return task.to_json()


@app.put("/tasks/{id}", response_model=dict)
async def edit_task(
    id: int,
    title: Optional[str] = None,
    description: Optional[str] = None,
    assigned_to: Optional[int] = None,
    session: AsyncSession = Depends(get_db)
):
    try:
        update_data = {}
        if title is not None:
            update_data['title'] = title
        if description is not None:
            update_data['description'] = description
        if assigned_to is not None:
            update_data['assigned_to'] = assigned_to
        
        task = await TaskService.update(
            session=session,
            task_id=id,
            user_id=2,
            **update_data
        )
        return task.to_json()
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@app.delete("/tasks/{id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_task(id: int, session: AsyncSession = Depends(get_db)):
    try:
        await TaskService.delete(session=session, task_id=id, user_id=1)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ==================== MOVING TASKS ====================

@app.patch("/tasks/{task_id}/move/{target_column}", response_model=dict)
async def move_task(
    task_id: int, 
    target_column: int,
    target_position: int = 0,
    session: AsyncSession = Depends(get_db)
):
    try:
        task = await TaskService.move(
            session=session,
            task_id=task_id,
            target_column_id=target_column,
            target_position=target_position,
            user_id=0
        )
        return task.to_json()
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ==================== EVENTS ====================

@app.get("/boards/{board_id}/events", response_model=List[dict])
async def get_board_history(board_id: int, session: AsyncSession = Depends(get_db)):
    board = await session.get(Board, board_id)
    if not board:
        raise HTTPException(status_code=404, detail=f"Board {board_id} not found")
    
    # Получаем все задачи доски
    task_ids = []
    for column in board.columns:
        for task in column.tasks:
            task_ids.append(task.id)
    
    if not task_ids:
        return []
    
    result = await session.execute(
        select(Log).where(Log.task_id.in_(task_ids)).order_by(Log.id.desc())
    )
    logs = result.scalars().all()
    return [log.to_json() for log in logs] if hasattr(Log, 'to_json') else [{"id": l.id, "action": l.action, "detail": l.detail} for l in logs]


@app.get("/tasks/{task_id}/events", response_model=List[dict])
async def get_task_history(task_id: int, session: AsyncSession = Depends(get_db)):
    task = await session.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")
    
    result = await session.execute(
        select(Log).where(Log.task_id == task_id).order_by(Log.id.desc())
    )
    logs = result.scalars().all()
    return [log.to_json() for log in logs] if hasattr(Log, 'to_json') else [{"id": l.id, "action": l.action, "detail": l.detail} for l in logs]