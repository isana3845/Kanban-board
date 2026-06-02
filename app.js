let currentTasks = [];
let currentBoards = [];
let activeUser = null;
let activeBoardData = null;
let activeBoardId = null;
let editingTaskId = null;
let targetColumnStatus = 'todo';
let currentSortMethod = 'none';
let boardSocket = null;

// Переменные для прикрепленной к чату задачи
let linkedChatTaskId = null;
let linkedChatTaskTitle = null;

const statusMap = {
    'todo': 'В планах',
    'in_progress': 'В разработке',
    'done': 'Готово'
};

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    initListeners();
});

async function checkAuth() {
    try {
        const res = await fetch('/api/auth/me');
        if (res.ok) handleLogin(await res.json());
        else showLogin();
    } catch { showLogin(); }
}

function showLogin() {
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('app-content').style.display = 'none';
}

function handleLogin(userData) {
    activeUser = userData;
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-content').style.display = 'flex';
    document.getElementById('user-display-name').innerText = userData.username;
    switchView('folders');
}

async function loginUser() {
    const username = document.getElementById('auth-username').value.trim();
    if (!username) return;
    const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username })
    });
    if (res.ok) handleLogin(await res.json());
}

async function logoutUser() {
    await fetch('/api/auth/logout', { method: 'POST' });
    location.reload();
}

function initListeners() {
    document.getElementById('menu-to-board').onclick = () => {
        if (activeBoardId) switchView('board');
        else alert('Выберите доску в меню папок.');
    };
    document.getElementById('menu-to-folders').onclick = () => switchView('folders');
    setupDropdown('avatar-trigger', 'user-dropdown');
    setupDropdown('settings-trigger', 'settings-dropdown');
    
    document.addEventListener('click', e => {
        if (!e.target.closest('.control-wrapper')) {
            document.querySelectorAll('.dropdown-menu').forEach(m => m.style.display = 'none');
        }
    });

    document.getElementById('menu-to-analytics').onclick = () => {
        if (activeBoardId) switchView('analytics');
        else alert('Выберите доску в меню папок.');
    };
}

function setupDropdown(trigger, drop) {
    document.getElementById(trigger).onclick = (e) => {
        e.stopPropagation();
        const el = document.getElementById(drop);
        const opened = el.style.display === 'block';
        document.querySelectorAll('.dropdown-menu').forEach(m => m.style.display = 'none');
        el.style.display = opened ? 'none' : 'block';
    };
}

function toggleColumnMenu(menuId, event) {
    event.stopPropagation();
    const el = document.getElementById(menuId);
    const opened = el.style.display === 'block';
    document.querySelectorAll('.dropdown-menu').forEach(m => m.style.display = 'none');
    el.style.display = opened ? 'none' : 'block';
}

function switchView(view) {
    document.getElementById('view-kanban').style.display = view === 'board' ? 'flex' : 'none';
    document.getElementById('view-folders').style.display = view === 'folders' ? 'flex' : 'none';
    document.getElementById('view-analytics').style.display = view === 'analytics' ? 'block' : 'none';
    
    document.getElementById('menu-to-board').classList.toggle('active', view === 'board');
    document.getElementById('menu-to-folders').classList.toggle('active', view === 'folders');
    document.getElementById('menu-to-analytics').classList.toggle('active', view === 'analytics');
    
    if (view === 'folders') loadBoards();
    if (view === 'analytics' && activeBoardId) loadLogs();
}

// --- ЧАТ ДОСКИ ---
function toggleChat() {
    const chat = document.getElementById('chat-sidebar');
    chat.style.display = chat.style.display === 'none' ? 'flex' : 'none';
    if (chat.style.display === 'flex') scrollToChatBottom();
}

async function loadChatMessages() {
    const res = await fetch(`/api/boards/${activeBoardId}/messages`);
    if (res.ok) {
        const messages = await res.json();
        document.getElementById('chat-messages').innerHTML = '';
        messages.forEach(msg => appendMessageToChat(msg));
    }
}

function appendMessageToChat(msg) {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'chat-msg';
    
    let linkedHtml = '';
    if (msg.linked_task_id) {
        linkedHtml = `
            <div class="chat-msg-linked" onclick="openModalForEdit(${msg.linked_task_id})" title="Открыть задачу">
                ↪️ ${msg.linked_task_title}
            </div>
        `;
    }
    
    div.innerHTML = `
        <div class="chat-msg-author">${msg.username}</div>
        ${linkedHtml}
        <div class="chat-msg-text">${msg.content}</div>
    `;
    container.appendChild(div);
    scrollToChatBottom();
}

function scrollToChatBottom() {
    const container = document.getElementById('chat-messages');
    container.scrollTop = container.scrollHeight;
}

function sendChatMessage() {
    const input = document.getElementById('chat-input');
    const content = input.value.trim();
    if (!content && !linkedChatTaskId) return;
    
    const payload = {
        type: 'chat',
        content: content,
        linked_task_id: linkedChatTaskId,
        linked_task_title: linkedChatTaskTitle
    };
    
    if (boardSocket && boardSocket.readyState === WebSocket.OPEN) {
        boardSocket.send(JSON.stringify(payload));
        input.value = '';
        clearTaskPreview();
    }
}

// Связывание задачи с чатом
function linkTaskToChat() {
    if (!editingTaskId) return;
    const task = currentTasks.find(t => t.id == editingTaskId);
    if (!task) return;
    
    linkedChatTaskId = task.id;
    linkedChatTaskTitle = task.title;
    
    document.getElementById('chat-preview-title').innerText = 'Связь: ' + task.title;
    document.getElementById('chat-task-preview').style.display = 'flex';
    
    closeModal();
    const chat = document.getElementById('chat-sidebar');
    if (chat.style.display === 'none') toggleChat();
}

function clearTaskPreview() {
    linkedChatTaskId = null;
    linkedChatTaskTitle = null;
    document.getElementById('chat-task-preview').style.display = 'none';
}


// --- ДОСКИ ---
async function loadBoards() {
    const res = await fetch('/api/boards');
    currentBoards = await res.json();
    renderFolders();
}

function renderFolders() {
    const grid = document.getElementById('folders-grid-container');
    grid.innerHTML = '';
    currentBoards.forEach(b => {
        const d = document.createElement('div');
        d.className = 'folder-item';
        d.innerHTML = `<div class="folder-icon"></div><div class="folder-name">${b.title}</div>`;
        d.onclick = () => selectBoard(b);
        grid.appendChild(d);
    });
}

async function promptCreateBoard() {
    const t = prompt('Введите название доски:');
    if (t) {
        await fetch('/api/boards', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({title: t}) });
        loadBoards();
    }
}

function selectBoard(board) {
    activeBoardId = board.id;
    activeBoardData = board;
    document.getElementById('main-board-title').innerText = board.title;
    
    document.getElementById('board-wip-toggle').checked = !!board.wip_enabled;
    document.getElementById('wip-input-todo').value = board.wip_todo || 0;
    document.getElementById('wip-input-in_progress').value = board.wip_in_progress || 0;
    document.getElementById('wip-input-done').value = board.wip_done || 0;
    
    switchView('board');
    setupDragAndDrop();
    loadTasks();
    loadMembers();
    loadChatMessages(); // Загрузка истории чата

    if (boardSocket) {
        boardSocket.close();
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    boardSocket = new WebSocket(`${protocol}//${window.location.host}/ws/boards/${board.id}`);
    
    boardSocket.onmessage = function(event) {
        const data = JSON.parse(event.data);
        if (data.type === 'update') {
            loadTasks();
        } else if (data.type === 'chat') {
            appendMessageToChat(data);
        }
    };
}

async function loadMembers() {
    if (!activeBoardId) return;
    const res = await fetch(`/api/boards/${activeBoardId}/members`);
    const members = await res.json();
    renderMembers(members);
}

function renderMembers(members) {
    const list = document.getElementById('connected-members-list');
    list.innerHTML = '';
    members.forEach(m => {
        const li = document.createElement('li');
        li.className = 'member-item';
        const isMe = m.id === activeUser.user_id;
        li.innerHTML = `
            <span>${m.username} ${isMe ? '<span class="owner-badge">(Вы)</span>' : ''}</span>
            ${!isMe ? `<button onclick="removeMember('${m.username}')">&times;</button>` : ''}
        `;
        list.appendChild(li);
    });
}

async function addMember() {
    const input = document.getElementById('new-member-name');
    const username = input.value.trim();
    if (!username || !activeBoardId) return;
    
    const res = await fetch(`/api/boards/${activeBoardId}/members`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username })
    });
    if (res.ok) {
        input.value = '';
        loadMembers();
    } else {
        alert('Пользователь не найден в системе');
    }
}

async function removeMember(username) {
    if (!activeBoardId || !confirm('Удалить участника?')) return;
    const res = await fetch(`/api/boards/${activeBoardId}/members/${username}`, { method: 'DELETE' });
    if (res.ok) loadMembers();
}

async function toggleBoardWip() {
    if (!activeBoardData) return;
    activeBoardData.wip_enabled = document.getElementById('board-wip-toggle').checked ? 1 : 0;
    await syncWipToServer();
}

async function saveWipLimits() {
    if (!activeBoardData) return;
    activeBoardData.wip_todo = parseInt(document.getElementById('wip-input-todo').value) || 0;
    activeBoardData.wip_in_progress = parseInt(document.getElementById('wip-input-in_progress').value) || 0;
    activeBoardData.wip_done = parseInt(document.getElementById('wip-input-done').value) || 0;
    await syncWipToServer();
}

async function syncWipToServer() {
    await fetch(`/api/boards/${activeBoardId}/wip`, {
        method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(activeBoardData)
    });
    renderBoardCards();
}

async function loadTasks() {
    const res = await fetch(`/api/tasks?board_id=${activeBoardId}`);
    currentTasks = await res.json();
    renderBoardCards();
}

function applySort(method) {
    currentSortMethod = method;
    renderBoardCards();
}

function renderBoardCards() {
    const zones = { todo: document.getElementById('cards-todo'), in_progress: document.getElementById('cards-in_progress'), done: document.getElementById('cards-done') };
    Object.values(zones).forEach(z => z.innerHTML = '');

    let tasksToRender = [...currentTasks];
    if (currentSortMethod === 'user') tasksToRender.sort((a,b) => (a.assignee||'').localeCompare(b.assignee||''));
    else if (currentSortMethod === 'date') tasksToRender.sort((a,b) => new Date(a.date || '9999-01-01') - new Date(b.date || '9999-01-01'));
    else if (currentSortMethod === 'priority') {
        const p = {'Высокая': 1, 'Средняя': 2, 'Низкая': 3};
        tasksToRender.sort((a,b) => (p[a.priority]||9) - (p[b.priority]||9));
    }

    const counts = { todo: 0, in_progress: 0, done: 0 };

    tasksToRender.forEach(task => {
        counts[task.status]++;
        const card = document.createElement('div');
        card.className = 'task-card';
        card.dataset.id = task.id;
        
        const dateStr = task.date ? new Date(task.date).toLocaleString('ru-RU', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}) : '—';

        card.innerHTML = `
            <div class="card-top"><span>${task.title}</span><span style="color:${task.priority==='Высокая'?'red':''}">⚠</span></div>
            <div class="card-meta-info">
                <div>👤 ${task.assignee || '—'}</div>
                <div>📅 ${dateStr}</div>
            </div>
        `;
        card.onclick = () => openModalForEdit(task.id);
        if (zones[task.status]) zones[task.status].appendChild(card);
    });

    Object.keys(counts).forEach(status => {
        const countEl = document.getElementById(`count-${status}`);
        countEl.innerText = counts[status];
        
        if (activeBoardData && activeBoardData.wip_enabled) {
            const limit = activeBoardData[`wip_${status}`];
            if (limit > 0 && counts[status] >= limit) {
                countEl.classList.add('limit-exceeded');
                return;
            }
        }
        countEl.classList.remove('limit-exceeded');
    });
}

function setupDragAndDrop() {
    ['cards-todo', 'cards-in_progress', 'cards-done'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.sortableInstance) el.sortableInstance.destroy();
        
        el.sortableInstance = new Sortable(el, {
            group: {
                name: 'kanban',
                put: function (to, from) {
                    if (to.el === from.el) return true;
                    if (!activeBoardData || !activeBoardData.wip_enabled) return true;
                    
                    const status = to.el.dataset.status;
                    const limit = activeBoardData[`wip_${status}`];
                    if (!limit || limit <= 0) return true;
                    
                    const currentCount = currentTasks.filter(t => t.status === status).length;
                    return currentCount < limit;
                }
            },
            animation: 150,
            onEnd: async (e) => {
                const taskId = e.item.dataset.id;
                const nextStatus = e.to.dataset.status;
                const task = currentTasks.find(t => t.id == taskId);
                if (task && task.status !== nextStatus) {
                    task.status = nextStatus;
                    await fetch(`/api/tasks/${taskId}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(task) });
                }
            }
        });
    });
}

function openModalForCreate(status) {
    if (!activeBoardId) return;
    editingTaskId = null;
    targetColumnStatus = status;
    
    const locEl = document.getElementById('modal-location');
    if (locEl) locEl.innerText = statusMap[status] || status;

    document.getElementById('modal-link-task-btn').style.display = 'none'; // Скрываем кнопку в новой задаче

    document.getElementById('modal-title').value = '';
    document.getElementById('modal-assignee').value = activeUser.username;
    document.getElementById('modal-date').value = '';
    document.getElementById('modal-description').value = '';
    document.getElementById('modal-logs').innerHTML = 'Новая задача';
    document.getElementById('task-modal').style.display = 'block';
}

function openModalForEdit(id) {
    editingTaskId = id;
    const task = currentTasks.find(t => t.id == id);
    if (!task) {
        alert('Задача была удалена');
        return;
    }
    
    const locEl = document.getElementById('modal-location');
    if (locEl) locEl.innerText = statusMap[task.status] || task.status;

    document.getElementById('modal-link-task-btn').style.display = 'inline-block'; // Показываем кнопку пересылки

    document.getElementById('modal-title').value = task.title;
    document.getElementById('modal-assignee').value = task.assignee || '';
    document.getElementById('modal-date').value = task.date || '';
    document.getElementById('modal-priority').value = task.priority || 'Средняя';
    document.getElementById('modal-description').value = task.description || '';
    document.getElementById('modal-logs').innerHTML = `<strong>${task.creator}</strong> создал(а) задачу: <span>${task.created_at || '—'}</span>`;
    document.getElementById('task-modal').style.display = 'block';
}

function closeModal() { document.getElementById('task-modal').style.display = 'none'; }

async function saveTask() {
    const payload = {
        board_id: activeBoardId,
        title: document.getElementById('modal-title').value || 'Без названия',
        assignee: document.getElementById('modal-assignee').value,
        date: document.getElementById('modal-date').value,
        priority: document.getElementById('modal-priority').value,
        description: document.getElementById('modal-description').value,
        status: editingTaskId ? currentTasks.find(t => t.id == editingTaskId).status : targetColumnStatus
    };
    
    if (editingTaskId) await fetch(`/api/tasks/${editingTaskId}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    else await fetch('/api/tasks', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    
    closeModal();
}

async function leaveCurrentBoard() {
    if (!activeBoardId) return;
    if (!confirm('Вы уверены, что хотите покинуть эту доску? Вы потеряете доступ к ней.')) return;
    
    const res = await fetch(`/api/boards/${activeBoardId}/leave`, { method: 'DELETE' });
    if (res.ok) {
        if (boardSocket) boardSocket.close();
        activeBoardId = null;
        activeBoardData = null;
        document.getElementById('main-board-title').innerText = 'Выберите доску...';
        switchView('folders');
    } else {
        const data = await res.json();
        alert(data.detail || 'Не удалось покинуть доску.');
    }
}

async function loadLogs() {
    if (!activeBoardId) return;
    const res = await fetch(`/api/boards/${activeBoardId}/logs`);
    if (res.ok) {
        const logs = await res.json();
        renderLogs(logs);
    }
}

function renderLogs(logs) {
    const container = document.getElementById('analytics-logs-list');
    container.innerHTML = '';
    
    if (logs.length === 0) {
        container.innerHTML = '<div class="log-item">Нет зафиксированных действий.</div>';
        return;
    }
    
    logs.forEach(log => {
        const div = document.createElement('div');
        div.className = 'log-item';
        div.innerHTML = `
            <span class="log-time">${log.created_at}</span> 
            <span class="log-user">${log.username}</span> 
            <span class="log-action">${log.action_desc}</span>
        `;
        container.appendChild(div);
    });
}
