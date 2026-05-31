import json
from datetime import datetime
from typing import Optional
from pydantic import BaseModel
 
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
            assigned_to: int | None = None,
            created_by: int | None = None  # ← изменили с User на int
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
    

    @staticmethod
    async def get_tasks(session: AsyncSession):
        stmt = select(Task)
        result = await session.execute(stmt)
        r = [task[0].to_json() for task in result]
        return r


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


class UserService:
    @staticmethod
    async def create(
            session: AsyncSession,
            user_id: int,
            username: str,
            email: str,
            assigned_tasks_ids: Optional[list[int]] = None
        ) -> User:
        # Create user WITHOUT tasks first
        user = User(
            id=user_id,
            username=username,
            email=email
        )
        session.add(user)
        await session.flush()
        
        # If there are tasks to assign, handle them after user is created
        if assigned_tasks_ids:
            result = await session.execute(
                select(Task).where(Task.id.in_(assigned_tasks_ids))
            )
            tasks = result.scalars().all()
            # Option 1: Set the relationship using the backref
            for task in tasks:
                task.assigned_to = user.id  # Set the foreign key directly
        
        await session.commit()
        await session.refresh(user)
        
        return user.to_json()

    @staticmethod
    async def get_user(user_id: int, session: AsyncSession):
        stmt = select(User).where(User.id == user_id)
        result = await session.scalars(stmt)

        return result.one_or_none()

    @staticmethod
    async def get_users(session: AsyncSession):
        stmt = select(User)
        result = await session.execute(stmt)
        r = [user[0].to_json() for user in result]
        return r
    
    @staticmethod
    async def delete(user_id: int, session: AsyncSession):
        user = await session.get(User, user_id)
        if user is None:
            raise ValueError(f"Участник с id {user_id} не найден")
        
        # await log(session, task_id, "deleted", user_id=user_id, detail={"title": task.title})

        await session.flush()
        await session.delete(user)
        await session.commit()
    
    @staticmethod
    async def update_user_info(user_id: int, username: str, email: str, session: AsyncSession):
        stmt = update(User).where(User.id == user_id).values(
            username=username,
            email=email
        )
        result = await session.execute(stmt)
        await session.commit()
        return result.rowcount > 0
    

class UserCreate(BaseModel):
    user_id: int
    username: str
    email: str
    assigned_tasks_ids: Optional[list[int]] = None

class UserUpdate(BaseModel):
    user_id: int
    username: str
    email: str

class TaskCreate(BaseModel):
    title: str
    description: Optional[str]
    assigned_to: Optional[int] = None
