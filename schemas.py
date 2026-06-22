from pydantic import BaseModel, Field
from typing import Optional, List


class AuthData(BaseModel):
    username: str
    role: Optional[str] = "student"


class BoardData(BaseModel):
    title: str


class BoardSettingsUpdate(BaseModel):
    wip_enabled: int
    dropzones_enabled: int = 1
    columns_data: str
    progress_done_columns: Optional[str] = None


class TaskData(BaseModel):
    board_id: int
    title: str
    assignee: str = ""
    date: str = ""
    start_date: str = ""
    priority: str = "Средняя"
    description: str = Field("", max_length=3000)
    status: str
    backlog: int = 0
    checkpoints: str = "[]"


class ReorderPayload(BaseModel):
    status: str
    task_ids: List[int]


class BoardTitleUpdate(BaseModel):
    title: str


class BoardWipPayload(BaseModel):
    wip_enabled: int


class TaskCommentData(BaseModel):
    content: str


class RestoreBacklogPayload(BaseModel):
    status: str


class LogData(BaseModel):
    action_desc: str


class RestoreArchivePayload(BaseModel):
    status: str