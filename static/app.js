let currentTasks = [];
let currentBoards = [];
let activeUser = null;
let activeBoardData = null;
let activeBoardId = null;
let editingTaskId = null;
let targetColumnStatus = 'todo';
let currentSortMethod = 'none';
let boardSocket = null;
let currentOpenedTask = null;

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
        
        // Если статус 401 (не авторизован) — это ожидаемое поведение при выходе,
        // сразу показываем экран логина без вызова дефолтных ошибок
        if (res.status === 401) {
            showLogin();
            return;
        }
        
        if (res.ok) {
            const userData = await res.json();
            handleLogin(userData);
        } else {
            showLogin();
        }
    } catch (err) {
        // Ловим исключительно сетевые сбои (отсутствие интернета/падение сервера)
        showLogin();
    }
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
    
    document.getElementById('menu-to-folders').onclick = () => {
        switchView('folders');
    };
    
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
    
    // Переключение контекста настроек
    const boardSettings = document.getElementById('board-settings-content');
    const globalSettings = document.getElementById('global-settings-content');
    
    if (boardSettings && globalSettings) {
        if (activeBoardId) {
            boardSettings.style.display = 'block';
            globalSettings.style.display = 'none';
        } else {
            boardSettings.style.display = 'none';
            globalSettings.style.display = 'block';
        }
    }
    
    if (view === 'folders') loadBoards();
    if (view === 'analytics' && activeBoardId) loadLogs();
}


// --- ЧАТ ДОСКИ ---
// Универсальная функция переключения видимости чата
function toggleChat() {
    const chat = document.getElementById('chat-sidebar');
    const viewContainer = document.querySelector('.view-container');
    
    if (chat.parentElement !== viewContainer) {
        viewContainer.appendChild(chat);
    }
    
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
        // Изменено: вызывается openTaskFromChat вместо openModalForEdit
        linkedHtml = `
            <div class="chat-msg-linked" onclick="openTaskFromChat(${msg.linked_task_id})" title="Открыть задачу">
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
// Функция связывания задачи с чатом
function linkTaskToChat() {
    if (!currentOpenedTask) return;
    
    linkedChatTaskId = currentOpenedTask.id;
    linkedChatTaskTitle = currentOpenedTask.title;
    
    document.getElementById('chat-preview-title').innerText = 'Связь: ' + currentOpenedTask.title;
    document.getElementById('chat-task-preview').style.display = 'flex';
    
    closeModal();
    
    const chat = document.getElementById('chat-sidebar');
    const viewContainer = document.querySelector('.view-container');
    
    // Динамическое перемещение чата в глобальный контейнер, чтобы он отображался поверх архива
    if (chat.parentElement !== viewContainer) {
        viewContainer.appendChild(chat);
    }
    
    if (chat.style.display === 'none') {
        chat.style.display = 'flex';
        scrollToChatBottom();
    }
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
    if (!grid) return;
    grid.innerHTML = '';
    
    currentBoards.forEach(b => {
        const d = document.createElement('div');
        d.className = 'folder-item';
        
        // Если папка активна, просто добавляем класс CSS
        if (activeBoardId === b.id) {
            d.classList.add('active');
        }
        
        // Рендерим чистую структуру без инлайновых стилей
        d.innerHTML = `
            <div class="folder-icon"></div>
            <div class="folder-name">${b.title}</div>
        `;
        
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
    console.log(board);

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
    loadChatMessages();

    if (boardSocket) {
        boardSocket.close();
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    boardSocket = new WebSocket(`${protocol}//${window.location.host}/ws/boards/${board.id}`);
    
    boardSocket.onmessage = function(event) {
        const data = JSON.parse(event.data);
        if (data.type === 'update') {
            loadTasks();
            loadChatMessages();
        } else if (data.type === 'chat') {
            appendMessageToChat(data);
        }
    };

    const deleteBtn = document.getElementById('delete-board-btn');

    if (board.owner_username === activeUser.username) {
        deleteBtn.style.display = 'block';
    } else {
        deleteBtn.style.display = 'none';
    }
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
        
        // Определение статусов пользователя
        const isMe = m.username === activeUser.username;
        const isOwner = activeBoardData && m.username === activeBoardData.owner_username;
        
        let badges = '';
        if (isOwner) badges += ' <span style="color: gray; font-size: 13px;">(Владелец)</span>';
        if (isMe) badges += ' <span style="color: gray; font-size: 13px;">(Вы)</span>';
        
        // Крестик удаления (X) рендерится только в том случае, если пользователь НЕ является владельцем доски
        const deleteBtnHtml = !isOwner ? `<button onclick="removeMember('${m.username}')">&times;</button>` : '';
        
        li.innerHTML = `
            <span>${m.username}${badges}</span>
            ${deleteBtnHtml}
        `;
        list.appendChild(li);
    });
}


function renderBoardMembers(members) {
    const container = document.getElementById('board-members-list');
    if (!container) return;
    
    // Очистка контейнера перед повторным рендерингом
    container.innerHTML = '';
    
    members.forEach(member => {
        // Проверка прав текущего элемента списка
        const isOwner = activeBoardData && member === activeBoardData.owner_username;
        const isMe = activeUser && member === activeUser.username;
        
        // Создание элемента интерфейса для участника
        const item = document.createElement('div');
        item.className = 'member-item';
        item.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; padding: 4px 0;';
        
        // Формирование текстовой подписи с суффиксами статуса
        let badges = '';
        if (isOwner) badges += ' <span style="color: gray; font-size: 13px; font-style: italic;">(Владелец)</span>';
        if (isMe) badges += ' <span style="color: gray; font-size: 13px; font-style: italic;">(Вы)</span>';
        
        const nameSpan = document.createElement('span');
        nameSpan.innerHTML = `${member}${badges}`;
        item.appendChild(nameSpan);
        
        // Кнопка удаления (крестик) добавляется для всех, кроме владельца доски
        if (!isOwner) {
            const cross = document.createElement('span');
            cross.innerText = '✖';
            cross.style.cssText = 'color: red; cursor: pointer; margin-left: 8px; font-weight: bold; font-size: 14px;';
            
            cross.onclick = async () => {
                if (!confirm(`Удалить пользователя ${member} из участников доски?`)) return;
                
                try {
                    const res = await fetch(`/api/boards/${activeBoardId}/members/${member}`, {
                        method: 'DELETE'
                    });
                    
                    if (res.ok) {
                        item.remove();
                        // Если текущий пользователь удалил самого себя, страница перезагружается для применения ограничений доступа
                        if (isMe) {
                            location.reload();
                        }
                    } else {
                        const err = await res.json();
                        alert(`Ошибка: ${err.detail || 'Не удалось удалить участника'}`);
                    }
                } catch (error) {
                    console.error('Ошибка при удалении участника:', error);
                    alert('Произошла сетевая ошибка при удалении участника');
                }
            };
            
            item.appendChild(cross);
        }
        
        container.appendChild(item);
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
    
        // Сортировка с приоритетом текущего пользователя без изменения порядка остальных задач
    if (currentSortMethod === 'user') {
        tasksToRender.sort((a, b) => {
            const me = activeUser.username;
            const aIsMe = a.assignee === me;
            const bIsMe = b.assignee === me;
            
            if (aIsMe && !bIsMe) return -1;
            if (!aIsMe && bIsMe) return 1;
            
            return 0; // Остальные задачи остаются на своих местах
        });
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

        if (el.sortableInstance)
            el.sortableInstance.destroy();

        el.sortableInstance = new Sortable(el, {
            group: {
                name: 'kanban',
                put: function(to, from) {
                    if (to.el === from.el)
                        return true;

                    if (!activeBoardData || !activeBoardData.wip_enabled)
                        return true;

                    const status = to.el.dataset.status;
                    const limit = activeBoardData[`wip_${status}`];

                    if (!limit || limit <= 0)
                        return true;

                    const currentCount = currentTasks.filter(
                        t => t.status === status
                    ).length;

                    return currentCount < limit;
                }
            },

            animation: 150,

            onEnd: async function(e) {
                const taskId = Number(e.item.dataset.id);
                const newStatus = e.to.dataset.status;

                const task = currentTasks.find(
                    t => t.id === taskId
                );

                if (task)
                    task.status = newStatus;

                const orderedIds = [...e.to.children]
                    .map(card => Number(card.dataset.id));

                await fetch(
                    `/api/boards/${activeBoardId}/reorder`,
                    {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            status: newStatus,
                            task_ids: orderedIds
                        })
                    }
                );

                if (e.from !== e.to) {
                    const oldStatus = e.from.dataset.status;

                    const oldColumnIds = [...e.from.children]
                        .map(card => Number(card.dataset.id));

                    await fetch(
                        `/api/boards/${activeBoardId}/reorder`,
                        {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                status: oldStatus,
                                task_ids: oldColumnIds
                            })
                        }
                    );
                }
            }
        });
    });
}

function openModalForCreate(status) {
    if (!activeBoardId) return;
    editingTaskId = null;
    currentOpenedTask = null;
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

    const archiveBtn = document.querySelector('.btn-archive');

    archiveBtn.textContent = 'В архив';

    archiveBtn.onclick = archiveCurrentTask;
}

function openModalForEdit(id) {
    editingTaskId = id;
    const task = currentTasks.find(t => t.id == id);
    if (!task) {
        alert('Задача была удалена');
        return;
    }
    currentOpenedTask = task;

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

    const archiveBtn = document.querySelector('.btn-archive');

    archiveBtn.textContent = 'В архив';

    archiveBtn.onclick = archiveCurrentTask;
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
        status: editingTaskId
            ? currentOpenedTask.status
            : targetColumnStatus
    };
    
    if (editingTaskId) await fetch(`/api/tasks/${editingTaskId}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    else await fetch('/api/tasks', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    
    closeModal();

    // Обновление отображения архива, если окно аналитики открыто
    if (document.getElementById('analytics-archive-view').style.display === 'block') {
        await window.openArchiveViewer();
    }
}

async function archiveCurrentTask() {
    if (!editingTaskId) return;

    // Сначала сохраняем внесенные изменения (решение задачи 1)
    const payload = {
        board_id: activeBoardId,
        title: document.getElementById('modal-title').value || 'Без названия',
        assignee: document.getElementById('modal-assignee').value,
        date: document.getElementById('modal-date').value,
        priority: document.getElementById('modal-priority').value,
        description: document.getElementById('modal-description').value,
        status: currentOpenedTask.status
    };

    await fetch(`/api/tasks/${editingTaskId}`, { 
        method: 'PUT', 
        headers: {'Content-Type': 'application/json'}, 
        body: JSON.stringify(payload) 
    });

    // Затем отправляем в архив
    const res = await fetch(`/api/tasks/${editingTaskId}/archive`, {
        method: 'PUT'
    });

    if (!res.ok) {
        alert('Ошибка');
        return;
    }

    closeModal();
    await loadTasks();

    if (document.getElementById('analytics-archive-view').style.display === 'block')
        await window.openArchiveViewer();
}


async function leaveCurrentBoard() {
    if (!activeBoardId) {
        alert('Активная доска не выбрана');
        return;
    }
    
    // Гарантированный поиск объекта доски по ID в общем массиве
    const board = activeBoardData || currentBoards.find(b => b.id === Number(activeBoardId) || b.id === activeBoardId);
    const boardTitle = board ? board.title : 'текущую доску';
    const isOwner = board && activeUser && activeUser.username === board.owner_username;
    
    let payload = {};
    if (isOwner) {
        const newOwner = prompt("Вы являетесь владельцем этой доски. Для выхода необходимо передать права. Введите точное имя пользователя, которому перейдут права:");
        if (!newOwner) return; 
        payload.new_owner = newOwner.trim();
    } else {
        // Подстановка проверенного названия доски в окно подтверждения
        if (!confirm(`Вы уверены, что хотите покинуть доску "${boardTitle}"?`)) return;
    }
    
    const res = await fetch(`/api/boards/${activeBoardId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    
    if (res.ok) {
        alert(`Вы вышли из доски "${boardTitle}"`);
        activeBoardId = null;
        activeBoardData = null;
        switchView('folders');
        loadBoards();
    } else {
        const err = await res.json();
        alert(err.detail || 'Ошибка при выходе из доски');
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

async function deleteCurrentBoard() {
    if (!activeBoardId) return;

    if (!confirm('Удалить доску без возможности восстановления?'))
        return;

    const res = await fetch(
        `/api/boards/${activeBoardId}`,
        { method: 'DELETE' }
    );

    if (res.ok) {
        activeBoardId = null;
        activeBoardData = null;

        if (boardSocket)
            boardSocket.close();

        switchView('folders');
        loadBoards();
    }
}

function openLogsViewer() {
    document.getElementById(
        'analytics-home'
    ).style.display = 'none';

    document.getElementById(
        'analytics-logs-view'
    ).style.display = 'block';

    loadLogs();
}

function closeLogsViewer() {
    document.getElementById(
        'analytics-home'
    ).style.display = 'block';

    document.getElementById(
        'analytics-logs-view'
    ).style.display = 'none';
}

function openLogsViewer() {

    document.querySelector(
        '#view-analytics .folders-grid'
    ).style.display = 'none';

    document.getElementById(
        'analytics-logs-view'
    ).style.display = 'block';

    loadLogs();
}

function closeLogsViewer() {

    document.querySelector(
        '#view-analytics .folders-grid'
    ).style.display = 'grid';

    document.getElementById(
        'analytics-logs-view'
    ).style.display = 'none';
}

window.openArchiveViewer = async function () {
    if (!activeBoardId) return;

    const res = await fetch(`/api/boards/${activeBoardId}/archive`);
    if (!res.ok) return;

    const tasks = await res.json();

    const list = document.getElementById('archive-tasks-list');
    list.innerHTML = '';

    tasks.forEach(task => {
        const card = document.createElement('div');
        card.className = 'task-card';
        card.dataset.id = task.id;

        const dateStr = task.date
            ? new Date(task.date).toLocaleString('ru-RU', {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
            })
            : '—';

        // Добавлена кнопка удаления для отдельной задачи
        card.innerHTML = `
            <div class="card-top">
                <span>${task.title}</span>
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="color:${task.priority === 'Высокая' ? 'red' : ''}">⚠</span>
                    <button onclick="deleteTaskPermanent(${task.id}, event)" style="color: red; border: none; background: none; font-size: 16px; cursor: pointer; padding: 0;" title="Удалить навсегда">✖</button>
                </div>
            </div>
            <div class="card-meta-info">
                <div>👤 ${task.assignee || '—'}</div>
                <div>📅 ${dateStr}</div>
            </div>
        `;

        card.onclick = () => window.openModalForArchived(task);
        list.appendChild(card);
    });

    document.querySelector('#view-analytics .folders-grid').style.display = 'none';
    document.getElementById('analytics-logs-view').style.display = 'none';
    document.getElementById('analytics-archive-view').style.display = 'block';
};

// Функция удаления задачи из архива
window.deleteTaskPermanent = async function(taskId, event) {
    event.stopPropagation(); // Предотвращает открытие модального окна задачи
    if (!confirm('Удалить эту задачу навсегда?')) return;
    
    const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    if (res.ok) {
        await window.openArchiveViewer();
    } else {
        alert('Ошибка удаления задачи');
    }
};


window.closeArchiveViewer = function () {
    document.querySelector('#view-analytics .folders-grid').style.display = 'grid';
    document.getElementById('analytics-archive-view').style.display = 'none';
};

window.clearArchive = async function () {
    if (!activeBoardId) return;
    if (!confirm('Удалить весь архив без возможности восстановления?')) return;

    const res = await fetch(`/api/boards/${activeBoardId}/archive`, {
        method: 'DELETE'
    });

    if (!res.ok) {
        alert('Ошибка очистки архива');
        return;
    }

    document.getElementById('archive-tasks-list').innerHTML = '';
};

// Открытие модального окна для архивной задачи
window.openModalForArchived = function (task) {
    currentOpenedTask = task;
    editingTaskId = task.id;

    document.getElementById('modal-title').value = task.title;
    document.getElementById('modal-assignee').value = task.assignee || '';
    document.getElementById('modal-date').value = task.date || '';
    document.getElementById('modal-priority').value = task.priority || 'Средняя';
    document.getElementById('modal-description').value = task.description || '';

    document.getElementById('modal-location').innerText = 'Архив';

    document.getElementById('modal-logs').innerHTML =`
        <strong>${task.creator}</strong> создал(а) задачу: <span>${task.created_at || '—'}</span>`;

    // Принудительное отображение кнопки "В чат"
    document.getElementById('modal-link-task-btn').style.display = 'inline-block';

    const archiveBtn = document.querySelector('.btn-archive');
    archiveBtn.textContent = 'Вернуть';

    archiveBtn.onclick = async () => {
        const res = await fetch(`/api/tasks/${task.id}/restore`, {
            method: 'PUT'
        });

        if (!res.ok) {
            alert('Ошибка восстановления задачи');
            return;
        }

        closeModal();

        await loadTasks();
        await openArchiveViewer();
    };

    document.getElementById('task-modal').style.display = 'block';
};

// Универсальная функция открытия чата для текущей открытой задачи (активной или архивной)
window.openTaskChat = function() {
    if (!currentOpenedTask) return;

    // Привязываем ID и название задачи к переменным чата
    linkedChatTaskId = currentOpenedTask.id;
    linkedChatTaskTitle = currentOpenedTask.title;

    // Обновляем текстовый индикатор прикрепленной задачи над полем ввода чата
    const label = document.getElementById('linked-task-label') || document.getElementById('chat-linked-task');
    if (label) {
        label.innerText = `Прикреплена задача: ${currentOpenedTask.title}`;
        label.style.display = 'block';
    }

    // Делаем видимой боковую панель чата
    const chatPanel = document.getElementById('chat-panel') || document.getElementById('chat-sidebar');
    if (chatPanel) {
        chatPanel.style.display = 'flex';
        chatPanel.classList.add('open');
    }

    // Принудительно сохраняем видимость окон архива и аналитики
    const archiveView = document.getElementById('analytics-archive-view');
    if (archiveView) {
        archiveView.style.display = 'block';
    }
    const analyticsModal = document.getElementById('view-analytics');
    if (analyticsModal) {
        analyticsModal.style.display = 'block';
    }
};

// Новая функция для открытия задачи по ссылке из чата (учитывает архивные задачи)
async function openTaskFromChat(taskId) {
    try {
        const res = await fetch(`/api/tasks/${taskId}`);
        
        // Обрабатываем 404 статус до того, как он вызовет ошибку парсинга JSON
        if (res.status === 404) {
            alert('Эта задача была удалена из доски');
            return;
        }
        
        if (!res.ok) {
            alert('Не удалось загрузить задачу');
            return;
        }
        
        const task = await res.json();
        // Дальнейший ваш код открытия модального окна (например, openModal(task))
        
    } catch (err) {
        console.log('Сетевая ошибка при получении задачи');
    }
}
