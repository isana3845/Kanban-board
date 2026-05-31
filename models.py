from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy import ForeignKey, String, DateTime, func
from typing import Optional, List
from datetime import datetime


class Base(DeclarativeBase):
    pass


class Board(Base):
    __tablename__ = "boards"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    columns: Mapped[List["BoardColumn"]] = relationship(back_populates="board", cascade="all, delete-orphan", order_by="BoardColumn.position")

    def to_json(self):
        return {
            "id": self.id,
            "title": self.title
        }

class BoardColumn(Base):
    __tablename__ = 'columns'

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    position: Mapped[int]
    board_id: Mapped[int] = mapped_column(ForeignKey("boards.id"))
    board: Mapped["Board"] = relationship(back_populates="columns")
    tasks: Mapped[List["Task"]] = relationship(back_populates="column", cascade="all, delete-orphan", order_by="Task.position")

    def to_json(self):
        return {
            "id": self.id,
            "title": self.title,
            "position": self.position,
            "board_id": self.board_id
        }

class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(100))
    description: Mapped[Optional[str]] = mapped_column(String(1000))
    column_id: Mapped[int] = mapped_column(ForeignKey("columns.id"))
    assigned_to: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    position: Mapped[int]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    
    column: Mapped["BoardColumn"] = relationship(back_populates="tasks")
    assignee: Mapped[Optional["User"]] = relationship(
        back_populates="assigned_tasks",
        foreign_keys=[assigned_to]
    )

    def to_json(self):
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "column_id": self.column_id,
            "assigned_to": self.assigned_to,
            "position": self.position,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(100), unique=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    assigned_tasks: Mapped[List["Task"]] = relationship(
        back_populates="assignee",
        foreign_keys="Task.assigned_to"
    )

    def to_json(self):
        return {
            "id": self.id,
            "username": self.username,
            "email": self.email
            #"assigned_tasks": [task.to_json() for task in self.assigned_tasks] if self.assigned_tasks else []
        }


class Log(Base):
    __tablename__ = "logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(100))
    detail: Mapped[Optional[str]] = mapped_column(String(1000))

    def to_json(self):
        import json
        return {
            "id": self.id,
            "task_id": self.task_id,
            "user_id": self.user_id,
            "action": self.action,
            "detail": json.loads(self.detail) if self.detail else None
        }