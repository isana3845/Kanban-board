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
    db.execute('''CREATE TABLE IF NOT EXISTS boards 
                  (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, owner_username TEXT, 
                   wip_enabled INTEGER, wip_todo INTEGER, wip_in_progress INTEGER, wip_done INTEGER)''')
    db.execute('''CREATE TABLE IF NOT EXISTS board_members 
                  (board_id INTEGER, username TEXT)''')
    db.execute('''CREATE TABLE IF NOT EXISTS tasks 
                  (id INTEGER PRIMARY KEY AUTOINCREMENT, board_id INTEGER, title TEXT, 
                   assignee TEXT, date TEXT, priority TEXT, description TEXT, status TEXT, 
                   creator TEXT, created_at TEXT)''')
    db.execute('''CREATE TABLE IF NOT EXISTS users 
                  (username TEXT PRIMARY KEY)''')
    db.execute('''CREATE TABLE IF NOT EXISTS messages 
                  (id INTEGER PRIMARY KEY AUTOINCREMENT, board_id INTEGER, username TEXT, 
                   content TEXT, linked_task_id INTEGER, linked_task_title TEXT)''')
    # Новая таблица аналитики
    db.execute('''CREATE TABLE IF NOT EXISTS action_logs 
                  (id INTEGER PRIMARY KEY AUTOINCREMENT, board_id INTEGER, username TEXT, 
                   action_desc TEXT, created_at TEXT)''')
    db.commit()
    db.close()

init_db()

# --- Вспомогательная функция логирования ---
def add_log(db, board_id: int, username: str, action: str):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    db.execute("INSERT INTO action_logs (board_id, username, action_desc, created_at) VALUES (?, ?, ?, ?)",
               (board_id, username, action, timestamp))

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

class BoardUpdateData(BaseModel):
    wip_enabled: int
    wip_todo: int
    wip_in_progress: int
    wip_done: int

class TaskData(BaseModel):
    board_id: int
    title: str
    assignee: str = ""
    date: str = ""
    priority: str = "Средняя"
    description: str = ""
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

@app.put("/api/boards/{board_id}/wip")
async def update_wip(board_id: int, data: BoardUpdateData, session: Optional[str] = Cookie(None)):
    db = get_db()
    db.execute("UPDATE boards SET wip_enabled=?, wip_todo=?, wip_in_progress=?, wip_done=? WHERE id=? AND owner_username=?",
               (data.wip_enabled, data.wip_todo, data.wip_in_progress, data.wip_done, board_id, session))
    add_log(db, board_id, session, "Изменил(а) настройки лимитов WIP")
    db.commit()
    await manager.broadcast_update(board_id)
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
    db.execute("DELETE FROM board_members WHERE board_id=? AND username=?", (board_id, username))
    add_log(db, board_id, session, f"Удалил(а) участника '{username}'")
    db.commit()
    return {"status": "ok"}

@app.delete("/api/boards/{board_id}/leave")
def leave_board(board_id: int, session: Optional[str] = Cookie(None)):
    if not session: raise HTTPException(status_code=401)
    db = get_db()
    board = db.execute("SELECT owner_username FROM boards WHERE id=?", (board_id,)).fetchone()
    if board and board['owner_username'] == session:
        raise HTTPException(status_code=400, detail="Владелец не может покинуть доску. Только удалить.")
    
    db.execute("DELETE FROM board_members WHERE board_id=? AND username=?", (board_id, session))
    add_log(db, board_id, session, "Покинул(а) доску")
    db.commit()
    return {"status": "ok"}

@app.get("/api/tasks")
def get_tasks(board_id: int, session: Optional[str] = Cookie(None)):
    db = get_db()
    access = db.execute("SELECT 1 FROM board_members WHERE board_id=? AND username=?", (board_id, session)).fetchone()
    if not access: raise HTTPException(status_code=403)
    tasks = db.execute("SELECT * FROM tasks WHERE board_id=?", (board_id,)).fetchall()
    return [dict(row) for row in tasks]

@app.post("/api/tasks")
async def create_task(data: TaskData, session: Optional[str] = Cookie(None)):
    db = get_db()
    cur = db.execute("INSERT INTO tasks (board_id, title, assignee, date, priority, description, status, creator, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
                     (data.board_id, data.title, data.assignee, data.date, data.priority, data.description, data.status, session, datetime.now().strftime("%Y-%m-%d %H:%M")))
    add_log(db, data.board_id, session, f"Создал(а) задачу '{data.title}'")
    db.commit()
    await manager.broadcast_update(data.board_id)
    return {"id": cur.lastrowid}

@app.put("/api/tasks/{task_id}")
async def update_task(task_id: int, data: TaskData, session: Optional[str] = Cookie(None)):
    db = get_db()
    db.execute("UPDATE tasks SET title=?, assignee=?, date=?, priority=?, description=?, status=? WHERE id=?",
               (data.title, data.assignee, data.date, data.priority, data.description, data.status, task_id))
    add_log(db, data.board_id, session, f"Отредактировал(а) или передвинул(а) задачу '{data.title}'")
    db.commit()
    await manager.broadcast_update(data.board_id)
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

app.mount("/", StaticFiles(directory="static", html=True), name="static")

