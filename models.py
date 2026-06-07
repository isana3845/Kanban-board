from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy import ForeignKey, String, DateTime, Text, func
from typing import Optional, List
from datetime import datetime


class Base(DeclarativeBase):
    pass


class Board(Base):
    __tablename__ = "boards"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    owner_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    wip_enabled: Mapped[int] = mapped_column(default=0, server_default="0")
    columns_data: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    columns: Mapped[List["BoardColumn"]] = relationship(back_populates="board", cascade="all, delete-orphan", order_by="BoardColumn.position")
    owner: Mapped[Optional["User"]] = relationship(foreign_keys=[owner_id])

    def to_json(self):
        return {
            "id": self.id,
            "title": self.title
        }

    def to_api_json(self):
        return {
            "id": self.id,
            "title": self.title,
            "owner_username": self.owner.username if self.owner else "",
            "wip_enabled": self.wip_enabled,
            "columns_data": self.columns_data,
            "wip_todo": 0,
            "wip_in_progress": 0,
            "wip_done": 0,
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
    board_id: Mapped[Optional[int]] = mapped_column(ForeignKey("boards.id"), nullable=True)
    assigned_to: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    position: Mapped[int]
    status: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    priority: Mapped[str] = mapped_column(String(50), default="Средняя", server_default="Средняя")
    date: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    creator: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    archived: Mapped[int] = mapped_column(default=0, server_default="0")
    previous_status: Mapped[Optional[str]] = mapped_column(String(255))
    sort_order: Mapped[int] = mapped_column(default=0, server_default="0")
    
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

    def to_api_json(self, assignee: str = ""):
        return {
            "id": self.id,
            "board_id": self.board_id,
            "title": self.title,
            "assignee": assignee,
            "date": self.date or "",
            "priority": self.priority or "Средняя",
            "description": self.description or "",
            "status": self.status or "",
            "creator": self.creator or "",
            "created_at": self.created_at.strftime("%Y-%m-%d %H:%M") if self.created_at else "",
            "archived": self.archived,
            "previous_status": self.previous_status or "",
            "sort_order": self.sort_order,
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


class BoardMember(Base):
    __tablename__ = "board_members"

    board_id: Mapped[int] = mapped_column(ForeignKey("boards.id"), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    user: Mapped["User"] = relationship()


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[int] = mapped_column(primary_key=True)
    board_id: Mapped[int] = mapped_column(ForeignKey("boards.id"))
    username: Mapped[str] = mapped_column(String(100))
    content: Mapped[str] = mapped_column(Text)
    linked_task_id: Mapped[Optional[int]] = mapped_column(nullable=True)
    linked_task_title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)


class BoardActionLog(Base):
    __tablename__ = "action_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    board_id: Mapped[int] = mapped_column(ForeignKey("boards.id"))
    username: Mapped[str] = mapped_column(String(100))
    action_desc: Mapped[str] = mapped_column(String(500))
    created_at: Mapped[str] = mapped_column(String(30))


class Log(Base):
    __tablename__ = "logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id"))
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
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