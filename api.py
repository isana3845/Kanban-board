import json
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import get_db
from models import Board, BoardActionLog, BoardColumn, BoardMember, Message, Task, User

router = APIRouter(prefix="/api")

DEFAULT_COLUMNS = [
    {"id": "todo", "name": "В планах", "wip_limit": 0, "archived": False},
    {"id": "in_progress", "name": "В разработке", "wip_limit": 0, "archived": False},
    {"id": "done", "name": "Готово", "wip_limit": 0, "archived": False},
]

COLUMN_TITLES = ["Backlog", "In Progress", "Review", "Done"]


class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, board_id: int):
        await websocket.accept()
        self.active_connections.setdefault(board_id, []).append(websocket)

    def disconnect(self, websocket: WebSocket, board_id: int):
        if board_id in self.active_connections:
            self.active_connections[board_id] = [
                c for c in self.active_connections[board_id] if c is not websocket
            ]

    async def broadcast_update(self, board_id: int):
        for connection in self.active_connections.get(board_id, []):
            await connection.send_text(json.dumps({"type": "update"}))

    async def broadcast_chat(self, board_id: int, message_payload: dict):
        for connection in self.active_connections.get(board_id, []):
            await connection.send_text(json.dumps(message_payload))


manager = ConnectionManager()


class AuthData(BaseModel):
    username: str


class BoardData(BaseModel):
    title: str


class BoardSettingsUpdate(BaseModel):
    wip_enabled: int
    columns_data: str


class TaskData(BaseModel):
    board_id: int
    title: str
    assignee: str = ""
    date: str = ""
    priority: str = "Средняя"
    description: str = ""
    status: str


class ReorderPayload(BaseModel):
    status: str
    task_ids: List[int]


class BoardTitleUpdate(BaseModel):
    title: str


async def next_user_id(session: AsyncSession) -> int:
    result = await session.execute(select(func.coalesce(func.max(User.id), 0)))
    return result.scalar_one() + 1


async def get_or_create_user(session: AsyncSession, username: str) -> User:
    result = await session.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if user:
        return user
    user = User(
        id=await next_user_id(session),
        username=username,
        email=f"{username}@local",
    )
    session.add(user)
    await session.flush()
    return user


async def user_id_for_username(session: AsyncSession, username: str) -> Optional[int]:
    if not username or not username.strip():
        return None
    user = await get_or_create_user(session, username.strip())
    return user.id


async def assignee_name(session: AsyncSession, task: Task) -> str:
    if not task.assigned_to:
        return ""
    user = await session.get(User, task.assigned_to)
    return user.username if user else ""


async def column_id_for_status(session: AsyncSession, board_id: int, status: str) -> int:
    result = await session.execute(
        select(BoardColumn)
        .where(BoardColumn.board_id == board_id)
        .order_by(BoardColumn.position)
    )
    columns = result.scalars().all()
    if not columns:
        raise HTTPException(status_code=400, detail="Board has no columns")

    board = await session.get(Board, board_id)
    try:
        col_defs = json.loads(board.columns_data or "[]")
        active = [c for c in col_defs if not c.get("archived")]
        idx = next((i for i, c in enumerate(active) if c["id"] == status), 0)
    except (json.JSONDecodeError, TypeError):
        idx = 0

    idx = min(idx, len(columns) - 1)
    return columns[idx].id


async def add_log(session: AsyncSession, board_id: int, username: str, action: str):
    session.add(BoardActionLog(
        board_id=board_id,
        username=username or "Неизвестный",
        action_desc=action,
        created_at=datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    ))


async def board_to_api(session: AsyncSession, board: Board) -> dict:
    if board.owner_id:
        await session.refresh(board, ["owner"])
    return board.to_api_json()


async def task_to_api(session: AsyncSession, task: Task) -> dict:
    return task.to_api_json(await assignee_name(session, task))


async def get_user_boards(session: AsyncSession, username: str) -> list[Board]:
    user = await get_or_create_user(session, username)
    stmt = (
        select(Board)
        .join(BoardMember, BoardMember.board_id == Board.id)
        .where(BoardMember.user_id == user.id)
        .options(selectinload(Board.owner))
    )
    result = await session.execute(stmt)
    return list(result.scalars().unique().all())


def require_session(session: Optional[str]) -> str:
    if not session:
        raise HTTPException(status_code=401)
    return session


@router.post("/auth/login")
async def login(data: AuthData, response: Response, session: AsyncSession = Depends(get_db)):
    username = data.username.strip()
    if not username:
        raise HTTPException(status_code=400, detail="Username required")
    await get_or_create_user(session, username)
    response.set_cookie(key="session", value=username)
    return {"user_id": username, "username": username}


@router.get("/auth/me")
async def get_me(session: Optional[str] = Cookie(None)):
    if not session:
        raise HTTPException(status_code=401)
    return {"user_id": session, "username": session}


@router.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("session")
    return {"status": "ok"}


@router.get("/boards")
async def get_boards(
    session: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_db),
):
    username = require_session(session)
    boards = await get_user_boards(db, username)
    return [await board_to_api(db, board) for board in boards]


@router.post("/boards")
async def create_board(
    data: BoardData,
    session: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_db),
):
    username = require_session(session)
    user = await get_or_create_user(db, username)

    board = Board(
        title=data.title,
        owner_id=user.id,
        wip_enabled=0,
        columns_data=json.dumps(DEFAULT_COLUMNS, ensure_ascii=False),
    )
    db.add(board)
    await db.flush()

    for i, title in enumerate(COLUMN_TITLES):
        db.add(BoardColumn(title=title, position=i, board_id=board.id))
    db.add(BoardMember(board_id=board.id, user_id=user.id))

    await add_log(db, board.id, username, f"Создал(а) доску '{data.title}'")
    await db.commit()
    await db.refresh(board, ["owner"])
    return {"id": board.id, "title": board.title}


@router.put("/boards/{board_id}/settings")
async def update_board_settings(
    board_id: int,
    data: BoardSettingsUpdate,
    session: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_db),
):
    require_session(session)
    board = await db.get(Board, board_id)
    if not board:
        raise HTTPException(status_code=404)
    board.wip_enabled = data.wip_enabled
    board.columns_data = data.columns_data
    await db.commit()
    await manager.broadcast_update(board_id)
    return {"status": "ok"}


@router.put("/boards/{board_id}/title")
async def update_board_title(
    board_id: int,
    data: BoardTitleUpdate,
    session: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_db),
):
    username = session
    board = await db.get(Board, board_id)
    if not board:
        raise HTTPException(status_code=404)
    board.title = data.title
    await add_log(db, board_id, username, f"Изменил(а) название доски на '{data.title}'")
    await db.commit()
    return {"status": "ok", "new_title": data.title}


@router.delete("/boards/{board_id}")
async def delete_board(
    board_id: int,
    session: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_db),
):
    username = require_session(session)
    board = await db.get(Board, board_id)
    if not board:
        raise HTTPException(status_code=404)
    if not board.owner_id:
        raise HTTPException(status_code=403)
    owner = await db.get(User, board.owner_id)
    if not owner or owner.username != username:
        raise HTTPException(status_code=403)

    for model in (Task, BoardMember, Message, BoardActionLog, BoardColumn):
        result = await db.execute(select(model).where(model.board_id == board_id))
        for row in result.scalars().all():
            await db.delete(row)

    await db.delete(board)
    await db.commit()
    return {"status": "ok"}


@router.get("/boards/{board_id}/members")
async def get_members(board_id: int, db: AsyncSession = Depends(get_db)):
    stmt = (
        select(User)
        .join(BoardMember, BoardMember.user_id == User.id)
        .where(BoardMember.board_id == board_id)
    )
    result = await db.execute(stmt)
    return [{"username": user.username, "id": user.username} for user in result.scalars().all()]


@router.post("/boards/{board_id}/members")
async def add_member(
    board_id: int,
    data: AuthData,
    session: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.username == data.username))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    existing = await db.get(BoardMember, (board_id, user.id))
    if not existing:
        db.add(BoardMember(board_id=board_id, user_id=user.id))
        await add_log(db, board_id, session, f"Добавил(а) участника '{data.username}'")
        await db.commit()
    return {"status": "ok"}


@router.delete("/boards/{board_id}/members/{username}")
async def remove_member(
    board_id: int,
    username: str,
    db: AsyncSession = Depends(get_db),
):
    board = await db.get(Board, board_id)
    if not board:
        raise HTTPException(status_code=404, detail="Доска не найдена")
    if board.owner_id:
        owner = await db.get(User, board.owner_id)
        if owner and owner.username == username:
            raise HTTPException(status_code=400, detail="Нельзя удалить владельца доски")

    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if user:
        member = await db.get(BoardMember, (board_id, user.id))
        if member:
            await db.delete(member)
            await db.commit()
    return {"status": "ok"}


@router.post("/boards/{board_id}/leave")
async def leave_board(
    board_id: int,
    payload: dict | None = None,
    session: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_db),
):
    username = require_session(session)
    board = await db.get(Board, board_id)
    if not board:
        raise HTTPException(status_code=404)

    await db.refresh(board, ["owner"])
    if board.owner and board.owner.username == username:
        if not payload or "new_owner" not in payload:
            raise HTTPException(status_code=400, detail="Необходимо указать нового владельца")
        new_owner_name = payload["new_owner"]
        result = await db.execute(select(User).where(User.username == new_owner_name))
        new_owner = result.scalar_one_or_none()
        if not new_owner or new_owner_name == username:
            raise HTTPException(status_code=400, detail="Указан некорректный новый владелец")
        member = await db.get(BoardMember, (board_id, new_owner.id))
        if not member:
            raise HTTPException(status_code=400, detail="Указан некорректный новый владелец")
        board.owner_id = new_owner.id

    user = await get_or_create_user(db, username)
    member = await db.get(BoardMember, (board_id, user.id))
    if member:
        await db.delete(member)
    await add_log(db, board_id, username, "Покинул(а) доску")
    await db.commit()
    return {"status": "ok"}


@router.get("/tasks")
async def get_tasks(
    board_id: int,
    session: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_db),
):
    user = await get_or_create_user(db, session) if session else None
    if user:
        member = await db.get(BoardMember, (board_id, user.id))
        if not member:
            raise HTTPException(status_code=403)

    result = await db.execute(
        select(Task)
        .where(Task.board_id == board_id, Task.archived == 0)
        .order_by(Task.status, Task.sort_order)
    )
    tasks = result.scalars().all()
    return [await task_to_api(db, task) for task in tasks]


@router.get("/tasks/{task_id}")
async def get_task(
    task_id: int,
    session: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_db),
):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    if session and task.board_id:
        user = await get_or_create_user(db, session)
        member = await db.get(BoardMember, (task.board_id, user.id))
        if not member:
            raise HTTPException(status_code=403, detail="Доступ запрещен")
    return await task_to_api(db, task)


@router.post("/tasks")
async def create_task(
    data: TaskData,
    session: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(func.coalesce(func.max(Task.sort_order), -1)).where(
            Task.board_id == data.board_id,
            Task.status == data.status,
            Task.archived == 0,
        )
    )
    sort_order = result.scalar_one() + 1
    column_id = await column_id_for_status(db, data.board_id, data.status)
    assigned_to = await user_id_for_username(db, data.assignee)

    task = Task(
        board_id=data.board_id,
        column_id=column_id,
        title=data.title,
        description=data.description,
        status=data.status,
        priority=data.priority,
        date=data.date,
        creator=session,
        assigned_to=assigned_to,
        position=sort_order,
        sort_order=sort_order,
    )
    db.add(task)
    await add_log(db, data.board_id, session, f"Создал(а) задачу '{data.title}'")
    await db.flush()
    await db.commit()
    await manager.broadcast_update(data.board_id)
    return {"id": task.id}


@router.put("/tasks/{task_id}")
async def update_task(
    task_id: int,
    data: TaskData,
    session: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_db),
):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")

    old_status = task.status
    task.title = data.title
    task.description = data.description
    task.status = data.status
    task.priority = data.priority
    task.date = data.date
    task.assigned_to = await user_id_for_username(db, data.assignee)
    if old_status != data.status:
        task.column_id = await column_id_for_status(db, data.board_id, data.status)

    result = await db.execute(
        select(Message).where(Message.linked_task_id == task_id)
    )
    for msg in result.scalars().all():
        msg.linked_task_title = data.title

    statuses = {"todo": "В планах", "in_progress": "В разработке", "done": "Готово"}
    if old_status != data.status:
        await add_log(
            db, data.board_id, session,
            f"Переместил(а) задачу '{data.title}' из "
            f"'{statuses.get(old_status, old_status)}' в '{statuses.get(data.status, data.status)}'",
        )
    else:
        await add_log(db, data.board_id, session, f"Отредактировал(а) задачу '{data.title}'")

    await db.commit()
    await manager.broadcast_update(data.board_id)
    return {"status": "ok"}


@router.delete("/tasks/{task_id}")
async def delete_task(
    task_id: int,
    session: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_db),
):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404)
    await add_log(db, task.board_id, session, f"Удалил(а) задачу '{task.title}' навсегда")
    await db.delete(task)
    await db.commit()
    return {"status": "ok"}


@router.put("/tasks/{task_id}/archive")
async def archive_task(
    task_id: int,
    session: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_db),
):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404)
    task.archived = 1
    task.previous_status = task.status
    await add_log(db, task.board_id, session, f"Отправил(а) задачу '{task.title}' в архив")
    await db.commit()
    await manager.broadcast_update(task.board_id)
    return {"status": "ok"}


@router.put("/tasks/{task_id}/restore")
async def restore_task(
    task_id: int,
    session: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_db),
):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404)
    task.archived = 0
    task.status = task.previous_status or task.status
    await add_log(db, task.board_id, session, f"Восстановил(а) задачу '{task.title}' из архива")
    await db.commit()
    await manager.broadcast_update(task.board_id)
    return {"status": "ok"}


@router.put("/boards/{board_id}/reorder")
async def reorder_tasks(
    board_id: int,
    data: ReorderPayload,
    db: AsyncSession = Depends(get_db),
):
    for index, task_id in enumerate(data.task_ids):
        task = await db.get(Task, task_id)
        if task:
            task.sort_order = index
            task.status = data.status
            task.column_id = await column_id_for_status(db, board_id, data.status)
    await db.commit()
    await manager.broadcast_update(board_id)
    return {"status": "ok"}


@router.delete("/boards/{board_id}/columns/{column_id}/tasks")
async def delete_col_tasks(
    board_id: int,
    column_id: str,
    session: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Task).where(Task.board_id == board_id, Task.status == column_id)
    )
    for task in result.scalars().all():
        await db.delete(task)
    await add_log(db, board_id, session, "Удалил(а) колонку и все задачи в ней навсегда")
    await db.commit()
    return {"status": "ok"}


@router.get("/boards/{board_id}/archive")
async def get_archive(board_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Task)
        .where(Task.board_id == board_id, Task.archived == 1)
        .order_by(Task.id.desc())
    )
    tasks = result.scalars().all()
    return [await task_to_api(db, task) for task in tasks]


@router.delete("/boards/{board_id}/archive")
async def clear_archive(
    board_id: int,
    session: Optional[str] = Cookie(None),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Task).where(Task.board_id == board_id, Task.archived == 1)
    )
    for task in result.scalars().all():
        await db.delete(task)
    await add_log(db, board_id, session, "Полностью очистил(а) архив задач")
    await db.commit()
    return {"status": "ok"}


@router.get("/boards/{board_id}/messages")
async def get_messages(board_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Message).where(Message.board_id == board_id).order_by(Message.id)
    )
    return [
        {
            "id": msg.id,
            "board_id": msg.board_id,
            "username": msg.username,
            "content": msg.content,
            "linked_task_id": msg.linked_task_id,
            "linked_task_title": msg.linked_task_title,
        }
        for msg in result.scalars().all()
    ]


@router.get("/boards/{board_id}/logs")
async def get_logs(board_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(BoardActionLog)
        .where(BoardActionLog.board_id == board_id)
        .order_by(BoardActionLog.id.desc())
    )
    return [
        {
            "id": log.id,
            "board_id": log.board_id,
            "username": log.username,
            "action_desc": log.action_desc,
            "created_at": log.created_at,
        }
        for log in result.scalars().all()
    ]


@router.put("/boards/{board_id}/wip")
async def update_wip(
    board_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db),
):
    board = await db.get(Board, board_id)
    if not board:
        raise HTTPException(status_code=404)
    if "wip_enabled" in data:
        board.wip_enabled = data["wip_enabled"]
    if "columns_data" in data:
        board.columns_data = data["columns_data"]
    await db.commit()
    return {"status": "ok"}


async def board_websocket(websocket: WebSocket, board_id: int):
    await manager.connect(websocket, board_id)
    try:
        while True:
            raw = await websocket.receive_text()
            parsed = json.loads(raw)
            if parsed.get("type") != "chat":
                continue

            username = websocket.cookies.get("session", "Неизвестный")
            content = parsed.get("content", "")
            linked_task_id = parsed.get("linked_task_id")
            linked_task_title = parsed.get("linked_task_title")

            from database import async_session_maker
            async with async_session_maker() as db:
                db.add(Message(
                    board_id=board_id,
                    username=username,
                    content=content,
                    linked_task_id=linked_task_id,
                    linked_task_title=linked_task_title,
                ))
                await add_log(db, board_id, username, "Отправил(а) сообщение в чат")
                await db.commit()

            await manager.broadcast_chat(board_id, {
                "type": "chat",
                "username": username,
                "content": content,
                "linked_task_id": linked_task_id,
                "linked_task_title": linked_task_title,
            })
    except WebSocketDisconnect:
        manager.disconnect(websocket, board_id)