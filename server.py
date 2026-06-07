import sqlite3
import json
from datetime import datetime
from typing import Optional, List, Dict
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Response, Cookie, HTTPException
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI()

# --- Инициализация БД ---
def get_db():
    conn = sqlite3.connect('kanban.db', check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    db = get_db()
    db.execute("""CREATE TABLE IF NOT EXISTS boards (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, owner_username TEXT, wip_enabled INTEGER, wip_todo INTEGER, wip_in_progress INTEGER, wip_done INTEGER)""")
    db.execute("""CREATE TABLE IF NOT EXISTS board_members (board_id INTEGER, username TEXT)""")
    db.execute("""CREATE TABLE IF NOT EXISTS tasks (id INTEGER PRIMARY KEY AUTOINCREMENT, board_id INTEGER, title TEXT, assignee TEXT, date TEXT, priority TEXT, description TEXT, status TEXT, creator TEXT, created_at TEXT)""")
    db.execute("""CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY)""")
    db.execute("""CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, board_id INTEGER, username TEXT, content TEXT, linked_task_id INTEGER, linked_task_title TEXT)""")
    db.execute("""CREATE TABLE IF NOT EXISTS action_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, board_id INTEGER, username TEXT, action_desc TEXT, created_at TEXT)""")
    db.execute("""CREATE TABLE IF NOT EXISTS task_comments (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id INTEGER, username TEXT, content TEXT, created_at TEXT)""")

    def has_column(table, column):
        return any(col["name"] == column for col in db.execute(f"PRAGMA table_info({table})"))

    if not has_column("tasks", "archived"): db.execute("ALTER TABLE tasks ADD COLUMN archived INTEGER DEFAULT 0")
    if not has_column("tasks", "previous_status"): db.execute("ALTER TABLE tasks ADD COLUMN previous_status TEXT DEFAULT ''")
    if not has_column("tasks", "backlog"): db.execute("ALTER TABLE tasks ADD COLUMN backlog INTEGER DEFAULT 0")
    if not has_column("tasks", "sort_order"): db.execute("ALTER TABLE tasks ADD COLUMN sort_order INTEGER DEFAULT 0")
    if not has_column("tasks", "checkpoints"): db.execute("ALTER TABLE tasks ADD COLUMN checkpoints TEXT DEFAULT '[]'")

    
    if not has_column("boards", "columns_data"): 
        db.execute("ALTER TABLE boards ADD COLUMN columns_data TEXT")
        default_cols = json.dumps([
            {"id": "todo", "name": "В планах", "wip_limit": 0, "archived": False},
            {"id": "in_progress", "name": "В разработке", "wip_limit": 0, "archived": False},
            {"id": "done", "name": "Готово", "wip_limit": 0, "archived": False}
        ])
        db.execute("UPDATE boards SET columns_data=?", (default_cols,))

    db.commit()
    db.close()


init_db()

# --- Вспомогательная функция логирования ---
def add_log(db, board_id: int, username: str, action: str):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    db.execute("INSERT INTO action_logs (board_id, username, action_desc, created_at) VALUES (?, ?, ?, ?)",
               (board_id, username, action, timestamp))

# Вспомогательная функция для получения читаемого названия колонки вместо col_id
def get_column_name(db, board_id: int, status_id: str) -> str:
    if status_id == "backlog_creation" or status_id == "backlog": 
        return "Бэклог"
    board = db.execute("SELECT columns_data FROM boards WHERE id=?", (board_id,)).fetchone()
    if board and board["columns_data"]:
        try:
            cols = json.loads(board["columns_data"])
            for c in cols:
                if c["id"] == status_id: 
                    return c["name"]
        except: pass
    return status_id

# --- WebSocket Менеджер ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, board_id: int):
        await websocket.accept()
        if board_id not in self.active_connections:
            self.active_connections[board_id] = []
        self.active_connections[board_id].append(websocket)

    def disconnect(self, websocket: WebSocket, board_id: int):
        if board_id in self.active_connections:
            self.active_connections[board_id].remove(websocket)

    async def broadcast_update(self, board_id: int):
        if board_id in self.active_connections:
            for connection in self.active_connections[board_id]:
                await connection.send_text(json.dumps({"type": "update"}))
                
    async def broadcast_chat(self, board_id: int, message_payload: dict):
        if board_id in self.active_connections:
            for connection in self.active_connections[board_id]:
                await connection.send_text(json.dumps(message_payload))

manager = ConnectionManager()

# --- Pydantic Схемы ---
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

# --- Эндпоинты ---
@app.post("/api/auth/login")
def login(data: AuthData, response: Response):
    db = get_db()
    db.execute("INSERT OR IGNORE INTO users (username) VALUES (?)", (data.username,))
    db.commit()
    response.set_cookie(key="session", value=data.username)
    return {"user_id": data.username, "username": data.username}

@app.get("/api/auth/me")
def get_me(session: Optional[str] = Cookie(None)):
    if not session: raise HTTPException(status_code=401)
    return {"user_id": session, "username": session}

@app.post("/api/auth/logout")
def logout(response: Response):
    response.delete_cookie("session")
    return {"status": "ok"}

@app.get("/api/boards")
def get_boards(session: Optional[str] = Cookie(None)):
    if not session: raise HTTPException(status_code=401)
    db = get_db()
    boards = db.execute('''SELECT b.* FROM boards b 
                           LEFT JOIN board_members bm ON b.id = bm.board_id 
                           WHERE b.owner_username = ? OR bm.username = ? 
                           GROUP BY b.id''', (session, session)).fetchall()
    return [dict(row) for row in boards]

@app.post("/api/boards")
def create_board(data: BoardData, session: Optional[str] = Cookie(None)):
    if not session: raise HTTPException(status_code=401)
    db = get_db()
    cur = db.execute("INSERT INTO boards (title, owner_username, wip_enabled, wip_todo, wip_in_progress, wip_done) VALUES (?, ?, 0, 0, 0, 0)", 
                     (data.title, session))
    board_id = cur.lastrowid
    db.execute("INSERT INTO board_members (board_id, username) VALUES (?, ?)", (board_id, session))
    add_log(db, board_id, session, f"Создал(а) доску '{data.title}'")
    db.commit()
    return {"id": board_id, "title": data.title}

@app.put("/api/boards/{board_id}/settings")
async def update_board_settings(board_id: int, data: BoardSettingsUpdate, session: Optional[str] = Cookie(None)):
    db = get_db()
    db.execute("UPDATE boards SET wip_enabled=?, columns_data=? WHERE id=? AND owner_username=?",
        (data.wip_enabled, data.columns_data, board_id, session))
    db.commit()
    await manager.broadcast_update(board_id)
    return {"status": "ok"}

@app.delete("/api/boards/{board_id}/columns/{column_id}/tasks")
async def delete_col_tasks(board_id: int, column_id: str, session: Optional[str] = Cookie(None)):
    db = get_db()
    db.execute("DELETE FROM tasks WHERE board_id=? AND status=?", (board_id, column_id))
    add_log(db, board_id, session, f"Удалил(а) колонку и все задачи в ней навсегда")
    db.commit()
    return {"status": "ok"}

@app.get("/api/boards/{board_id}/members")
def get_members(board_id: int):
    db = get_db()
    members = db.execute("SELECT username as username, username as id FROM board_members WHERE board_id=?", (board_id,)).fetchall()
    return [dict(row) for row in members]

@app.post("/api/boards/{board_id}/members")
def add_member(board_id: int, data: AuthData, session: Optional[str] = Cookie(None)):
    db = get_db()
    user_exists = db.execute("SELECT 1 FROM users WHERE username=?", (data.username,)).fetchone()
    if not user_exists:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
        
    member_exists = db.execute("SELECT 1 FROM board_members WHERE board_id=? AND username=?", (board_id, data.username)).fetchone()
    if not member_exists:
        db.execute("INSERT INTO board_members (board_id, username) VALUES (?, ?)", (board_id, data.username))
        add_log(db, board_id, session, f"Добавил(а) участника '{data.username}'")
        db.commit()
        
    return {"status": "ok"}

@app.delete("/api/boards/{board_id}/members/{username}")
def remove_member(board_id: int, username: str, session: Optional[str] = Cookie(None)):
    db = get_db()
    board = db.execute("SELECT * FROM boards WHERE id=?", (board_id,)).fetchone()
    if not board: raise HTTPException(status_code=404, detail="Доска не найдена")
    if username == board["owner_username"]: raise HTTPException(status_code=400, detail="Нельзя удалить владельца доски")
        
    db.execute("DELETE FROM board_members WHERE board_id=? AND username=?", (board_id, username))
    add_log(db, board_id, session, f"Удалил(а) пользователя '{username}' с доски")
    db.commit()
    return {"status": "ok"}

@app.post("/api/boards/{board_id}/leave")
def leave_board(board_id: int, payload: dict = None, session: Optional[str] = Cookie(None)):
    if not session:
        raise HTTPException(status_code=401)
        
    db = get_db()
    board = db.execute("SELECT * FROM boards WHERE id=?", (board_id,)).fetchone()
    if not board:
        raise HTTPException(status_code=404)
    
    # Если текущий пользователь — владелец, проверяется передача прав
    if board["owner_username"] == session:
        if not payload or "new_owner" not in payload:
            raise HTTPException(status_code=400, detail="Необходимо указать нового владельца")
        new_owner = payload["new_owner"]
        
        # Проверка, что преемник существует среди участников доски
        member = db.execute("SELECT * FROM board_members WHERE board_id=? AND username=?", (board_id, new_owner)).fetchone()
        if not member or new_owner == session:
            raise HTTPException(status_code=400, detail="Указан некорректный новый владелец")
        
        # Назначение нового владельца
        db.execute("UPDATE boards SET owner_username=? WHERE id=?", (new_owner, board_id))
        
    # Удаление покидающего пользователя из таблицы участников
    db.execute("DELETE FROM board_members WHERE board_id=? AND username=?", (board_id, session))
    add_log(db, board_id, session, "Покинул(а) доску")
    db.commit()
    return {"status": "ok"}

@app.put("/api/boards/{board_id}/title")
def update_board_title(board_id: int, data: BoardTitleUpdate, session: Optional[str] = Cookie(None)):
    db = get_db()
    board = db.execute("SELECT title, owner_username FROM boards WHERE id=?", (board_id,)).fetchone()
    if not board: raise HTTPException(status_code=404)
        
    old_title = board["title"]
    db.execute("UPDATE boards SET title=? WHERE id=?", (data.title, board_id))
    add_log(db, board_id, session, f"Изменил(а) название доски с '{old_title}' на '{data.title}'")
    db.commit()
    return {"status": "ok", "new_title": data.title}

@app.get("/api/tasks")
def get_tasks(board_id: int, session: Optional[str] = Cookie(None)):
    db = get_db()
    access = db.execute("SELECT 1 FROM board_members WHERE board_id=? AND username=?", (board_id, session)).fetchone()
    if not access: raise HTTPException(status_code=403)
    
    tasks = db.execute(
        """SELECT * FROM tasks WHERE board_id=? AND archived=0 AND backlog=0 ORDER BY status, sort_order""",
        (board_id,)
    ).fetchall()
    return [dict(row) for row in tasks]


@app.get("/api/tasks/{task_id}")
def get_task(task_id: int, session: Optional[str] = Cookie(None)):
    db = get_db()
    
    # 1. Сначала ищем задачу
    task = db.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
    
    # 2. Проверяем, есть ли текущий пользователь в участниках доски, которой принадлежит задача
    access = db.execute(
        "SELECT 1 FROM board_members WHERE board_id=? AND username=?", 
        (task['board_id'], session)
    ).fetchone()
    
    if not access:
        raise HTTPException(status_code=403, detail="Доступ запрещен")
        
    return dict(task)



@app.post("/api/tasks")
async def create_task(data: TaskData, session: Optional[str] = Cookie(None)):
    db = get_db()
    max_order = db.execute("SELECT COALESCE(MAX(sort_order), -1) FROM tasks WHERE board_id=? AND status=? AND archived=0 AND backlog=0", (data.board_id, data.status)).fetchone()[0]
    sort_order = max_order + 1

    cur = db.execute(
        """INSERT INTO tasks (board_id, title, assignee, date, priority, description, status, backlog, checkpoints, creator, created_at, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
        (data.board_id, data.title, data.assignee, data.date, data.priority, data.description, data.status, data.backlog, data.checkpoints, session, datetime.now().strftime("%Y-%m-%d %H:%M"), sort_order)
    )
    
    col_name = get_column_name(db, data.board_id, data.status)
    location = "в Бэклог" if data.backlog == 1 else f"в колонку '{col_name}'"
    add_log(db, data.board_id, session, f"Создал(а) задачу '{data.title}' {location}")
    db.commit()
    await manager.broadcast_update(data.board_id)
    return {"id": cur.lastrowid}

# @app.put("/api/tasks/{task_id}")
# async def update_task(task_id: int, data: TaskData, session: Optional[str] = Cookie(None)):
#     db = get_db()

#     old_task = db.execute(
#         "SELECT status FROM tasks WHERE id=?",
#         (task_id,)
#     ).fetchone()

#     if not old_task:
#         raise HTTPException(status_code=404, detail="Задача не найдена")

#     db.execute(
#         """UPDATE tasks
#            SET title=?, assignee=?, date=?, priority=?, description=?, status=?
#            WHERE id=?""",
#         (
#             data.title,
#             data.assignee,
#             data.date,
#             data.priority,
#             data.description,
#             data.status,
#             task_id
#         )
#     )

#     if old_task["status"] != data.status:
#         statuses = {
#             "todo": "В планах",
#             "in_progress": "В разработке",
#             "done": "Готово"
#         }

#         add_log(
#             db,
#             data.board_id,
#             session,
#             f"Переместил(а) задачу '{data.title}' из '{statuses.get(old_task['status'], old_task['status'])}' в '{statuses.get(data.status, data.status)}'"
#         )
#     else:
#         add_log(
#             db,
#             data.board_id,
#             session,
#             f"Отредактировал(а) задачу '{data.title}'"
#         )

#     db.commit()
#     await manager.broadcast_update(data.board_id)

#     return {"status": "ok"}

class TaskUpdatePayload(BaseModel):
    title: str
    assignee: Optional[str] = None
    date: Optional[str] = None
    priority: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None

@app.put("/api/tasks/{task_id}")
async def update_task(task_id: int, data: TaskData, session: Optional[str] = Cookie(None)):
    db = get_db()
    old_task = db.execute("SELECT status FROM tasks WHERE id=?", (task_id,)).fetchone()
    if not old_task: raise HTTPException(status_code=404, detail="Задача не найдена")

    db.execute(
        """UPDATE tasks SET title=?, assignee=?, date=?, priority=?, description=?, status=?, checkpoints=? WHERE id=?""",
        (data.title, data.assignee, data.date, data.priority, data.description, data.status, data.checkpoints, task_id)
    )
    db.execute("UPDATE messages SET linked_task_title = ? WHERE linked_task_id = ?", (data.title, task_id))

    if old_task["status"] != data.status:
        old_col = get_column_name(db, data.board_id, old_task['status'])
        new_col = get_column_name(db, data.board_id, data.status)
        add_log(db, data.board_id, session, f"Переместил(а) задачу '{data.title}' из '{old_col}' в '{new_col}'")
    else:
        add_log(db, data.board_id, session, f"Отредактировал(а) задачу '{data.title}'")

    db.commit()
    await manager.broadcast_update(data.board_id)
    return {"status": "ok"}

@app.put("/api/boards/{board_id}/wip")
async def update_board_wip(board_id: int, payload: BoardWipPayload, session: Optional[str] = Cookie(None)):
    if not session: 
        raise HTTPException(status_code=401)

    db = get_db()
    # Проверка существования доски и прав доступа (изменение доступно только владельцу)
    board = db.execute("SELECT owner_username FROM boards WHERE id=?", (board_id,)).fetchone()
    if not board:
        raise HTTPException(status_code=404, detail="Доска не найдена")
    if board["owner_username"] != session:
        raise HTTPException(status_code=403, detail="Доступ запрещен")

    db.execute("UPDATE boards SET wip_enabled=? WHERE id=?", (payload.wip_enabled, board_id))
    db.commit()

    # Отправка уведомления об обновлении всем подключенным клиентам
    await manager.broadcast_update(board_id)
    return {"status": "ok"}


@app.get("/api/boards/{board_id}/messages")
def get_messages(board_id: int, session: Optional[str] = Cookie(None)):
    db = get_db()
    msgs = db.execute("SELECT * FROM messages WHERE board_id=? ORDER BY id ASC", (board_id,)).fetchall()
    return [dict(row) for row in msgs]

@app.get("/api/boards/{board_id}/logs")
def get_logs(board_id: int, session: Optional[str] = Cookie(None)):
    db = get_db()
    logs = db.execute("SELECT * FROM action_logs WHERE board_id=? ORDER BY id DESC", (board_id,)).fetchall()
    return [dict(row) for row in logs]

@app.websocket("/ws/boards/{board_id}")
async def websocket_endpoint(websocket: WebSocket, board_id: int):
    await manager.connect(websocket, board_id)
    try:
        while True: 
            data = await websocket.receive_text()
            parsed = json.loads(data)
            
            if parsed.get("type") == "chat":
                session = websocket.cookies.get("session", "Неизвестный")
                content = parsed.get("content", "")
                linked_task_id = parsed.get("linked_task_id")
                linked_task_title = parsed.get("linked_task_title")
                
                db = get_db()
                db.execute("INSERT INTO messages (board_id, username, content, linked_task_id, linked_task_title) VALUES (?, ?, ?, ?, ?)",
                           (board_id, session, content, linked_task_id, linked_task_title))
                
                add_log(db, board_id, session, "Отправил(а) сообщение в чат")
                db.commit()
                
                await manager.broadcast_chat(board_id, {
                    "type": "chat",
                    "username": session,
                    "content": content,
                    "linked_task_id": linked_task_id,
                    "linked_task_title": linked_task_title
                })
    except WebSocketDisconnect:
        manager.disconnect(websocket, board_id)

@app.delete("/api/boards/{board_id}")
async def delete_board(board_id: int, session: Optional[str] = Cookie(None)):
    if not session: raise HTTPException(status_code=401)

    db = get_db()

    board = db.execute(
        "SELECT owner_username FROM boards WHERE id=?",
        (board_id,)
    ).fetchone()

    if not board: raise HTTPException(status_code=404)
    if board["owner_username"] != session: raise HTTPException(status_code=403)

    db.execute("DELETE FROM boards WHERE id=?", (board_id,))
    db.execute("DELETE FROM board_members WHERE board_id=?", (board_id,))
    db.execute("DELETE FROM tasks WHERE board_id=?", (board_id,))
    db.execute("DELETE FROM messages WHERE board_id=?", (board_id,))
    db.execute("DELETE FROM action_logs WHERE board_id=?", (board_id,))

    db.commit()

    return {"status": "ok"}

@app.put("/api/tasks/{task_id}/archive")
async def archive_task(task_id:int, session:Optional[str]=Cookie(None)):
    db=get_db()

    task=db.execute(
        "SELECT * FROM tasks WHERE id=?",
        (task_id,)
    ).fetchone()

    if not task:
        raise HTTPException(status_code=404)

    db.execute(
        "UPDATE tasks SET archived=1, previous_status=status WHERE id=?",
        (task_id,)
    )

    add_log(
        db,
        task["board_id"],
        session,
        f"Отправил(а) задачу '{task['title']}' в архив"
    )

    db.commit()
    await manager.broadcast_update(task["board_id"])

    return {"status":"ok"}

@app.put("/api/tasks/{task_id}/restore")
async def restore_task(task_id: int, payload: RestoreArchivePayload, session: Optional[str] = Cookie(None)):
    db = get_db()

    task = db.execute(
        "SELECT * FROM tasks WHERE id=?",
        (task_id,)
    ).fetchone()

    if not task:
        raise HTTPException(status_code=404)

    # Обновляем флаг архива и устанавливаем конкретную колонку
    db.execute(
        "UPDATE tasks SET archived=0, status=? WHERE id=?",
        (payload.status, task_id)
    )

    add_log(
        db,
        task["board_id"],
        session,
        f"Восстановил(а) задачу '{task['title']}' из архива"
    )

    db.commit()
    await manager.broadcast_update(task["board_id"])

    return {"status": "ok"}

@app.get("/api/boards/{board_id}/archive")
def get_archive(board_id: int):
    db = get_db()

    tasks = db.execute(
        """
        SELECT *
        FROM tasks
        WHERE board_id=? AND archived=1
        ORDER BY id DESC
        """,
        (board_id,)
    ).fetchall()

    return [dict(row) for row in tasks]

@app.delete("/api/boards/{board_id}/archive")
def clear_archive(board_id: int, session: Optional[str] = Cookie(None)):
    db = get_db()

    db.execute(
        """
        DELETE FROM tasks
        WHERE board_id=? AND archived=1
        """,
        (board_id,)
    )

    add_log(
        db,
        board_id,
        session,
        "Полностью очистил(а) архив задач"
    )

    db.commit()

    return {"status":"ok"}

@app.delete("/api/tasks/{task_id}")
async def delete_task(task_id: int, session: Optional[str] = Cookie(None)):
    db = get_db()
    task = db.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
    if not task:
        raise HTTPException(status_code=404)

    db.execute("DELETE FROM tasks WHERE id=?", (task_id,))
    
    add_log(db, task["board_id"], session, f"Удалил(а) задачу '{task['title']}' навсегда")
    db.commit()
    
    return {"status": "ok"}

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return Response(status_code=204)

@app.put("/api/boards/{board_id}/reorder")
async def reorder_tasks(
    board_id: int,
    data: ReorderPayload,
    session: Optional[str] = Cookie(None)
):
    db = get_db()

    for index, task_id in enumerate(data.task_ids):
        db.execute(
            """
            UPDATE tasks
            SET sort_order=?, status=?
            WHERE id=?
            """,
            (
                index,
                data.status,
                task_id
            )
        )

    db.commit()

    await manager.broadcast_update(board_id)

    return {"status": "ok"}

@app.get("/api/tasks/{task_id}/comments")
def get_task_comments(task_id: int, session: Optional[str] = Cookie(None)):
    db = get_db()
    
    task = db.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
        
    access = db.execute("SELECT 1 FROM board_members WHERE board_id=? AND username=?", (task['board_id'], session)).fetchone()
    if not access:
        raise HTTPException(status_code=403, detail="Доступ запрещен")
        
    comments = db.execute("SELECT * FROM task_comments WHERE task_id=? ORDER BY id ASC", (task_id,)).fetchall()
    return [dict(row) for row in comments]

@app.post("/api/tasks/{task_id}/comments")
def add_task_comment(task_id: int, data: TaskCommentData, session: Optional[str] = Cookie(None)):
    if not session:
        raise HTTPException(status_code=401)
        
    db = get_db()
    task = db.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
    if not task:
        raise HTTPException(status_code=404, detail="Задача не найдена")
        
    access = db.execute("SELECT 1 FROM board_members WHERE board_id=? AND username=?", (task['board_id'], session)).fetchone()
    if not access:
        raise HTTPException(status_code=403, detail="Доступ запрещен")
        
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    db.execute("INSERT INTO task_comments (task_id, username, content, created_at) VALUES (?, ?, ?, ?)",
               (task_id, session, data.content, timestamp))
    
    add_log(db, task['board_id'], session, f"Оставил(а) комментарий к задаче '{task['title']}'")
    db.commit()
    
    return {"status": "ok"}

@app.get("/api/boards/{board_id}/backlog")
def get_backlog(board_id: int):
    db = get_db()
    tasks = db.execute("SELECT * FROM tasks WHERE board_id=? AND backlog=1 AND archived=0 ORDER BY id DESC", (board_id,)).fetchall()
    return [dict(row) for row in tasks]

@app.put("/api/tasks/{task_id}/backlog")
async def put_to_backlog(task_id: int, session: Optional[str] = Cookie(None)):
    db = get_db()
    task = db.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
    if not task: raise HTTPException(status_code=404)
    
    # Обнуляем флаг archived при переносе в бэклог, чтобы задача исчезала из архива
    db.execute("UPDATE tasks SET backlog=1, archived=0 WHERE id=?", (task_id,))
    
    add_log(db, task["board_id"], session, f"Отправил(а) задачу '{task['title']}' в бэклог")
    db.commit()
    await manager.broadcast_update(task["board_id"])
    return {"status": "ok"}

@app.put("/api/tasks/{task_id}/restore_from_backlog")
async def restore_from_backlog(task_id: int, data: RestoreBacklogPayload, session: Optional[str] = Cookie(None)):
    db = get_db()
    task = db.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone()
    if not task: raise HTTPException(status_code=404)
    db.execute("UPDATE tasks SET backlog=0, status=? WHERE id=?", (data.status, task_id))
    add_log(db, task["board_id"], session, f"Переместил(а) задачу '{task['title']}' из бэклога на доску")
    db.commit()
    await manager.broadcast_update(task["board_id"])
    return {"status": "ok"}

# Эндпоинт для явного логирования событий интерфейса
@app.post("/api/boards/{board_id}/logs")
def create_custom_log(board_id: int, data: LogData, session: Optional[str] = Cookie(None)):
    if not session: raise HTTPException(status_code=401)
    db = get_db()
    add_log(db, board_id, session, data.action_desc)
    db.commit()
    return {"status": "ok"}

# Эндпоинт глобального поиска
@app.get("/api/boards/{board_id}/search")
def search_board(board_id: int, q: str, session: Optional[str] = Cookie(None)):
    if not session: raise HTTPException(status_code=401)
    db = get_db()
    query = f"%{q}%"
    
    tasks = db.execute("SELECT id, title, backlog, archived FROM tasks WHERE board_id=? AND (title LIKE ? OR description LIKE ?)", (board_id, query, query)).fetchall()
    messages = db.execute("SELECT id, username, content FROM messages WHERE board_id=? AND content LIKE ? ORDER BY id DESC LIMIT 20", (board_id, query)).fetchall()
    logs = db.execute("SELECT id, username, action_desc as content FROM action_logs WHERE board_id=? AND action_desc LIKE ? ORDER BY id DESC LIMIT 20", (board_id, query)).fetchall()
    
    results = {"board": [], "archive": [], "backlog": [], "chat": [], "logs": []}
    
    for t in tasks:
        task_data = {"id": t["id"], "title": t["title"]}
        if t["backlog"] == 1: results["backlog"].append(task_data)
        elif t["archived"] == 1: results["archive"].append(task_data)
        else: results["board"].append(task_data)
        
    for m in messages: results["chat"].append(dict(m))
    for l in logs: results["logs"].append(dict(l))
    
    return results

app.mount("/", StaticFiles(directory="static", html=True), name="static")


