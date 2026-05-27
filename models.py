from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy import ForeignKey, String, DateTime, CheckConstraint, func
from typing import Optional, List
from datetime import datetime


class Base(DeclarativeBase):
    pass


class Board(Base):
    __tablename__ = "boards"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    columns: Mapped[List["BoardColumn"]] = relationship(back_populates="board", cascade="all, delete-orphan")


class BoardColumn(Base):
    __tablename__ = 'columns'

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    position: Mapped[int]
    board_id: Mapped[int] = mapped_column(ForeignKey("boards.id"))
    board: Mapped["Board"] = relationship(back_populates="columns")
    tasks: Mapped[List["Task"]] = relationship(back_populates="column", cascade="all, delete-orphan")


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(100))
    description: Mapped[Optional[str]] = mapped_column(String(1000))
    status: Mapped[str] = mapped_column(String(50), default="backlog")
    column_id: Mapped[int] = mapped_column(ForeignKey("columns.id"))
    assigned_to: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"))
    position: Mapped[int]
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    column: Mapped["BoardColumn"] = relationship(back_populates="tasks")
    assignee: Mapped[Optional["User"]] = relationship(back_populates="assigned_tasks", foreign_keys=[assigned_to])

    __table_args__ = (CheckConstraint("status IN ('backlog', 'todo', 'in_progress', 'review', 'done')", name="valid_status"),)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(100), unique=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    assigned_tasks: Mapped[List["Task"]] = relationship(back_populates="assignee", foreign_keys="Task.assigned_to")