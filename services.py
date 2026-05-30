import json
from datetime import datetime
from typing import Optional
 
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession
 
from models import Board, BoardColumn, Task, User, Log


async def max_position(session: AsyncSession, column_id: int):
    result = await session.execute(select(func.coalesce(func.max(Task.position), -1)).where(Task.column_id == column_id))

    return result.scalar_one()


async def log(session: AsyncSession, task_id: int, action, user_id: int = None, detail: str = None):
    session.add(Log(
        task_id=task_id,
        user_id=user_id,
        action=action,
        detail=json.dumps(detail) if detail else None
    ))


async def shift_position(session: AsyncSession, column_id: int, from_pos: int, delta: int):
    await session.execute(update(Task).where(Task.column_id == column_id, Task.position >= from_pos).values(position = Task.position + delta))


class TaskService:
    @staticmethod
    async def create(
            session: AsyncSession,
            column_id: int,
            title: str,
            description: str = None,
            assigned_to: User | None = None,
            created_by: User | None = None
        ) -> Task:
        position = await max_position(session, column_id) + 1
        task = Task(
            column_id=column_id,
            title=title,
            description=description,
            assigned_to=assigned_to,
            position=position
        )

        session.add(task)
        await session.flush()
        await log(session, task.id, "created", user_id=created_by, detail={"title": title, "column_id": column_id})
        await session.commit()
        await session.refresh(task)

        return task
    

    @staticmethod
    async def update(session: AsyncSession, task_id: int, user_id: int, **kwargs) -> Task:
        task = await session.get(Task, task_id)
        if task is None:
            raise ValueError(f"Задача {task_id} не найдена")
        

        forbidden = ["id", "column_id", "created_at"]
        allowed = {key: value for key, value in kwargs.items() if key not in forbidden}
        if not allowed:
            raise ValueError("Нет допустимых полей для изменения")

        before = {key: getattr(task, key) for key in allowed}
        
        for key, value in allowed.items():
            setattr(task, key, value)

        await log(session, task_id, "updated", user_id=user_id, detail={"before": before, "after": allowed})
        await session.commit()
        await session.refresh(task)

        return task
    

    @staticmethod
    async def move(session: AsyncSession, task_id: int, target_column_id: int, target_position: int, user_id: int) -> Task:
        task = await session.get(Task, task_id)
        if task is None:
            raise ValueError(f"Задача {task_id} не найдена")
        
        old_column_id = task.column_id
        old_position = task.position

        await shift_position(session, old_column_id, old_position + 1, -1)
        await shift_position(session, target_column_id, target_position, 1)
        
        task.column_id = target_column_id
        task.position = target_position

        await log(session, task_id, "moved", user_id=user_id, detail={
            "from": {"column_id": old_column_id, "position": old_position},
            "to": {"column_id": target_column_id, "position": target_position}
        })
        await session.commit()
        await session.refresh(task)

        return task
    

    @staticmethod
    async def delete(session: AsyncSession, task_id: int, user_id: int):
        task = await session.get(Task, task_id)
        if task is None:
            raise ValueError(f"Задача {task_id} не найдена")
        
        await shift_position(session, task.column_id, task.position + 1, -1)
        await log(session, task_id, "deleted", user_id=user_id, detail={"title": task.title})

        await session.flush()
        await session.delete(task)
        await session.commit()


class BoardService:
    @staticmethod
    async def create_board(session: AsyncSession, title: str) -> Board:
        board = Board(title=title)
        session.add(board)
        await session.flush()

        columns = ["Backlog", "In Progress", "Review", "Done"]
        for i, column in enumerate(columns):
            session.add(BoardColumn(title=column, position=i, board_id=board.id))

        await session.commit()
        await session.refresh(board)

        return board