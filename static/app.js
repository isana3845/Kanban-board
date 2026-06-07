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
let isGuest = true;
let currentFilters = { assignees: [], priorities: [], deadline: 'all' };
let columnSortable = null;
let currentArchivedColId = null;

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
        if (res.status === 401) {
            handleGuest();
            return;
        }
        
        if (res.ok) {
            const userData = await res.json();
            handleLogin(userData);
        } else {
            handleGuest();
        }
    } catch (err) {
        handleGuest();
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

function handleGuest() {
    activeUser = null;
    isGuest = true;
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-content').style.display = 'flex';
    document.getElementById('header-username-text').innerText = 'Вход';
    switchView('folders');
}

function handleLogin(userData) {
    activeUser = userData;
    isGuest = false;
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-content').style.display = 'flex';
    document.getElementById('user-display-name').innerText = userData.username;
    document.getElementById('header-username-text').innerText = userData.username;
    switchView('folders');
}



function initListeners() {
    document.getElementById('menu-to-board').onclick = () => {
        if (activeBoardId) switchView('board');
        else alert('Выберите доску в меню папок.');
    };
    
    document.getElementById('menu-to-folders').onclick = () => {
        switchView('folders');
    };
    
    document.getElementById('menu-to-analytics').onclick = () => {
        if (!activeBoardId) {
            alert('Выберите доску в меню папок.');
            return;
        }
        
        const logsView = document.getElementById('analytics-logs-view');
        const archiveView = document.getElementById('analytics-archive-view');
        const backlogView = document.getElementById('analytics-backlog-view');
        const foldersGrid = document.querySelector('#view-analytics .folders-grid');
        
        if (logsView) logsView.style.display = 'none';
        if (archiveView) archiveView.style.display = 'none';
        if (backlogView) backlogView.style.display = 'none';
        if (foldersGrid) foldersGrid.style.display = 'grid';
        
        switchView('analytics');
    };

    document.getElementById('menu-to-settings').onclick = () => {
        if (activeBoardId) switchView('settings');
        else alert('Выберите доску в меню папок.');
    };
    
    setupDropdown('avatar-trigger', 'user-dropdown');
    
    document.addEventListener('click', e => {
        if (!e.target.closest('.control-wrapper')) {
            document.querySelectorAll('.dropdown-menu').forEach(m => {
                if (m.id !== 'board-column-select') m.style.display = 'none';
            });
        }
        if (!e.target.closest('#btn-restore-board') && !e.target.closest('#board-column-select')) {
            const colSelect = document.getElementById('board-column-select');
            if (colSelect) colSelect.style.display = 'none';
        }
    });
}


function renderColumns() {
    // 1. Запоминаем ID колонки, чьё меню сейчас открыто (исправлен поиск по префиксу menu-wip-)
    let openMenuColumnId = null;
    if (activeBoardData && activeBoardData.columns) {
        activeBoardData.columns.forEach(col => {
            const menu = document.getElementById(`menu-wip-${col.id}`);
            if (menu && (menu.style.display === 'block' || menu.classList.contains('show'))) {
                openMenuColumnId = col.id;
            }
        });
    }

    const container = document.querySelector('.board-columns');
    container.innerHTML = '';
    if (!activeBoardData || !activeBoardData.columns) return;

    const activeCols = activeBoardData.columns.filter(c => !c.archived);

    activeCols.forEach(col => {
        const colEl = document.createElement('div');
        colEl.className = 'column';
        colEl.dataset.id = col.id;
        colEl.innerHTML = `
            <div class="column-header">
                <div class="column-info">
                    <span class="column-name" id="title-${col.id}">${col.name}</span>
                    <span class="column-count" id="count-${col.id}">0</span>
                </div>
                <div class="column-controls control-wrapper">
                    <div class="drag-handle" title="Перетащите, чтобы изменить порядок колонок"></div>
                    <button onclick="openModalForCreate('${col.id}')">+</button>
                    <button onclick="toggleColumnMenu('menu-wip-${col.id}', event)">⋮</button>
                    <div class="dropdown-menu wip-menu" id="menu-wip-${col.id}" onclick="event.stopPropagation()">
                        <div class="wip-title">Название:</div>
                        <div class="wip-name-group">
                            <input type="text" id="rename-input-${col.id}" value="${col.name}" onclick="this.select()">
                            <button onclick="syncBoardSettingsToServer()" class="btn-apply-rename">ОК</button>
                        </div>
                        <hr style="margin: 8px 0;">
                        <div class="wip-title">WIP Лимит (0 - нет):</div>
                        <div class="wip-controls wip-limit-group">
                            <input type="number" id="wip-input-${col.id}" value="${col.wip_limit}" min="0" onchange="syncBoardSettingsToServer()" onclick="this.select()">
                            <button class="btn-wip-math" onclick="event.stopPropagation(); changeWip('${col.id}', 1)">+</button>
                            <button class="btn-wip-math" onclick="event.stopPropagation(); changeWip('${col.id}', -1)">-</button>
                        </div>
                        <hr style="margin: 8px 0;">
                        <button onclick="archiveColumn('${col.id}')" style="width:100%; background:#cc0000; color:white; border:none; padding:6px; border-radius:2px; cursor:pointer; font-size:11px; font-weight:bold;">В архив колонку</button>
                    </div>
                </div>
            </div>
            <div class="cards-dropzone" id="cards-${col.id}" data-status="${col.id}"></div>
        `;
        container.appendChild(colEl);
    });

    setupDragAndDrop();
    renderBoardCards(); 

    // 2. После генерации DOM-структуры восстанавливаем открытое меню по правильному ID
    if (openMenuColumnId) {
        const menu = document.getElementById(`menu-wip-${openMenuColumnId}`);
        if (menu) {
            menu.style.display = 'block';
        }
    }
}


async function createNewColumn() {
    if (!activeBoardId) return;
    const name = prompt('Введите название новой колонки:');
    if (!name || name.trim() === '') return;
    
    const colId = 'col_' + Date.now();
    activeBoardData.columns.push({ id: colId, name: name.trim(), wip_limit: 0, archived: false });
    
    await syncBoardSettingsToServer();
}

async function archiveColumn(colId) {
    if (!activeBoardId || !confirm('Отправить колонку и все её задачи в архив?')) return;
    const col = activeBoardData.columns.find(c => c.id === colId);
    if (col) col.archived = true;
    await syncBoardSettingsToServer();
}

async function renameCurrentBoard() {
    if (!activeBoardId || !activeBoardData) return;
    
    const currentTitle = activeBoardData.title;
    let newTitle = prompt('Введите новое название доски:', currentTitle);
    
    if (newTitle === null) return; 
    newTitle = newTitle.trim();
    if (newTitle === '') newTitle = 'Без названия';
    if (newTitle === currentTitle) return;
    
    const res = await fetch(`/api/boards/${activeBoardId}/title`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: newTitle })
    });
    
    if (res.ok) {
        activeBoardData.title = newTitle;
        document.getElementById('main-board-title').innerText = newTitle;
        loadBoards(); 
    }
}

function applyBoardSettingsToUI() {
    if (!activeBoardData) return;
    
    document.getElementById('title-todo').innerText = activeBoardData.col_todo_name || 'В планах';
    document.getElementById('title-in_progress').innerText = activeBoardData.col_in_progress_name || 'В разработке';
    document.getElementById('title-done').innerText = activeBoardData.col_done_name || 'Готово';

    document.getElementById('rename-input-todo').value = activeBoardData.col_todo_name || 'В планах';
    document.getElementById('rename-input-in_progress').value = activeBoardData.col_in_progress_name || 'В разработке';
    document.getElementById('rename-input-done').value = activeBoardData.col_done_name || 'Готово';
    
    document.getElementById('wip-input-todo').value = activeBoardData.wip_todo || 0;
    document.getElementById('wip-input-in_progress').value = activeBoardData.wip_in_progress || 0;
    document.getElementById('wip-input-done').value = activeBoardData.wip_done || 0;
    document.getElementById('board-wip-toggle').checked = !!activeBoardData.wip_enabled;
}

// Новая единая функция для синхронизации колонок и WIP (заменяет старые saveWipLimits, renameColumn)
async function syncBoardSettingsToServer() {
    if (!activeBoardData) return;

    activeBoardData.columns.forEach(c => {
        if (!c.archived) {
            const nameInput = document.getElementById(`rename-input-${c.id}`);
            const wipInput = document.getElementById(`wip-input-${c.id}`);
            if (nameInput) c.name = nameInput.value.trim() === '' ? 'Без названия' : nameInput.value.trim();
            if (wipInput) c.wip_limit = parseInt(wipInput.value) || 0;
        }
    });

    activeBoardData.columns_data = JSON.stringify(activeBoardData.columns);

    await fetch(`/api/boards/${activeBoardId}/settings`, {
        method: 'PUT', 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify(activeBoardData)
    });

    renderColumns();
}


// Кнопки плюс/минус
function changeWip(status, delta) {
    const input = document.getElementById(`wip-input-${status}`);
    let val = parseInt(input.value) || 0;
    val += delta;
    if (val < 0) val = 0;
    input.value = val;
    syncBoardSettingsToServer();
}

function updateFilterAssigneesUI() {
    const container = document.getElementById('filter-assignees');
    if (!container) return;
    
    const assigneesSet = new Set(currentTasks.map(t => t.assignee).filter(a => a && a.trim() !== ''));
    container.innerHTML = '';
    
    if (assigneesSet.size === 0) {
        container.innerHTML = '<span style="color:gray;">Нет исполнителей</span>';
        return;
    }

    assigneesSet.forEach(user => {
        const isChecked = currentFilters.assignees.includes(user) ? 'checked' : '';
        container.innerHTML += `<label style="display:block; cursor:pointer;"><input type="checkbox" class="filter-assignee" value="${user}" ${isChecked}> ${user}</label>`;
    });
}

function applyFilters() {
    currentFilters.assignees = Array.from(document.querySelectorAll('.filter-assignee:checked')).map(cb => cb.value);
    currentFilters.priorities = Array.from(document.querySelectorAll('.filter-priority:checked')).map(cb => cb.value);
    currentFilters.deadline = document.getElementById('filter-deadline').value;
    
    document.getElementById('filter-sort-dropdown').style.display = 'none';
    renderBoardCards();
}

function clearFilters() {
    document.querySelectorAll('.filter-assignee, .filter-priority').forEach(cb => cb.checked = false);
    document.getElementById('filter-deadline').value = 'all';
    document.querySelector('.sort-select').value = 'none';
    
    currentFilters = { assignees: [], priorities: [], deadline: 'all' };
    currentSortMethod = 'none';
    
    renderBoardCards();
}

function setupDropdown(trigger, drop) {
    document.getElementById(trigger).onclick = (e) => {
        e.stopPropagation();
        
        // Перехват клика, если пользователь не авторизован
        if (isGuest && trigger === 'avatar-trigger') {
            showLogin();
            return;
        }
        
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
    document.getElementById('view-settings').style.display = view === 'settings' ? 'block' : 'none'; 
    
    document.getElementById('menu-to-board').classList.toggle('active', view === 'board');
    document.getElementById('menu-to-folders').classList.toggle('active', view === 'folders');
    document.getElementById('menu-to-analytics').classList.toggle('active', view === 'analytics');
    document.getElementById('menu-to-settings').classList.toggle('active', view === 'settings'); 

    // Ограничение меню профиля
    const hasBoard = !!activeBoardId;
    const actions = document.getElementById('user-board-actions');
    const noMsg = document.getElementById('user-no-board-msg');
    if (actions) actions.style.display = hasBoard ? 'block' : 'none';
    if (noMsg) noMsg.style.display = hasBoard ? 'none' : 'block';
    
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

// Защита от действий без авторизации
async function promptCreateBoard() {
    if (isGuest) return showLogin();
    const t = prompt('Введите название доски:');
    if (t) {
        await fetch('/api/boards', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({title: t}) });
        loadBoards();
    }
}

function selectBoard(board) {
    if (isGuest) return showLogin();
    
    activeBoardId = board.id;
    activeBoardData = board;
    document.getElementById('main-board-title').innerText = board.title;
    
    // Показ кнопки переименования доски
    const editBtn = document.getElementById('edit-board-title-btn');
    if (editBtn) editBtn.style.display = 'block';

    // Разбор динамических колонок
    try {
        activeBoardData.columns = board.columns_data ? JSON.parse(board.columns_data) : [
            {id: 'todo', name: 'В планах', wip_limit: 0, archived: false},
            {id: 'in_progress', name: 'В разработке', wip_limit: 0, archived: false},
            {id: 'done', name: 'Готово', wip_limit: 0, archived: false}
        ];
    } catch(e) {
        activeBoardData.columns = [];
    }
    
    document.getElementById('board-wip-toggle').checked = !!board.wip_enabled;
    
    switchView('board');
    renderColumns(); // Генерирует HTML колонок и вызывает setupDragAndDrop + renderBoardCards
    loadTasks();
    loadMembers();
    loadChatMessages();

    // Переподключение WebSocket
    if (boardSocket) {
        boardSocket.close();
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    boardSocket = new WebSocket(`${protocol}//${window.location.host}/ws/boards/${board.id}`);
    
    boardSocket.onmessage = async function(event) {
        const data = JSON.parse(event.data);
        if (data.type === 'update') {
            const res = await fetch('/api/boards');
            if (res.ok) {
                currentBoards = await res.json();
                const updatedBoard = currentBoards.find(b => b.id === activeBoardId);
                if (updatedBoard) {
                    activeBoardData = updatedBoard;
                    document.getElementById('main-board-title').innerText = activeBoardData.title;
                    try {
                        activeBoardData.columns = updatedBoard.columns_data ? JSON.parse(updatedBoard.columns_data) : [];
                    } catch(e) {}
                    document.getElementById('board-wip-toggle').checked = !!activeBoardData.wip_enabled;
                    renderColumns();
                }
            }
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


// Возврат из меню Хаба при повторном клике на иконку
document.getElementById('menu-to-analytics').onclick = () => {
    if (!activeBoardId) return alert('Выберите доску в меню папок.');
    
    document.getElementById('analytics-logs-view').style.display = 'none';
    document.getElementById('analytics-archive-view').style.display = 'none';
    document.querySelector('#view-analytics .folders-grid').style.display = 'grid';
    
    switchView('analytics');
};

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

// async function saveWipLimits() {
//     if (!activeBoardData) return;
//     activeBoardData.wip_todo = parseInt(document.getElementById('wip-input-todo').value) || 0;
//     activeBoardData.wip_in_progress = parseInt(document.getElementById('wip-input-in_progress').value) || 0;
//     activeBoardData.wip_done = parseInt(document.getElementById('wip-input-done').value) || 0;
//     await syncWipToServer();
// }

async function syncWipToServer() {
    await fetch(`/api/boards/${activeBoardId}/wip`, {
        method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(activeBoardData)
    });
    renderBoardCards();
}

async function loadTasks() {
    const res = await fetch(`/api/tasks?board_id=${activeBoardId}`);
    currentTasks = await res.json();
    
    // Обновляем список исполнителей в меню фильтров на основе полученных задач
    updateFilterAssigneesUI();
    
    renderBoardCards();
}


function applySort(method) {
    currentSortMethod = method;
    renderBoardCards();
}

function renderBoardCards() {
    // Динамическое получение зон отрисовки и инициализация счетчиков
    const zones = {};
    const counts = {};
    
    if (activeBoardData && activeBoardData.columns) {
        activeBoardData.columns.forEach(col => {
            if (!col.archived) {
                const zone = document.getElementById(`cards-${col.id}`);
                if (zone) {
                    zones[col.id] = zone;
                    zone.innerHTML = ''; // очистка контейнера перед рендерингом
                }
                counts[col.id] = 0;
            }
        });
    }

    let tasksToRender = [...currentTasks];
    const now = new Date();

    // 1. Применение фильтров
    if (currentFilters.assignees.length > 0) {
        tasksToRender = tasksToRender.filter(t => currentFilters.assignees.includes(t.assignee));
    }
    
    if (currentFilters.priorities.length > 0) {
        tasksToRender = tasksToRender.filter(t => currentFilters.priorities.includes(t.priority));
    }
    
    if (currentFilters.deadline !== 'all') {
        const limitDays = parseInt(currentFilters.deadline);
        tasksToRender = tasksToRender.filter(t => {
            if (!t.date) return false;
            const diffDays = (new Date(t.date) - now) / (1000 * 60 * 60 * 24);
            return diffDays >= 0 && diffDays <= limitDays;
        });
    }

    // 2. Сортировка
    if (currentSortMethod === 'date') {
        tasksToRender.sort((a, b) => {
            if (!a.date) return 1;
            if (!b.date) return -1;
            return new Date(a.date) - new Date(b.date);
        });
    } else if (currentSortMethod === 'user') {
        tasksToRender.sort((a, b) => {
            const me = activeUser ? activeUser.username : '';
            if (a.assignee === me && b.assignee !== me) return -1;
            if (a.assignee !== me && b.assignee === me) return 1;
            return 0;
        });
    } else if (currentSortMethod === 'priority') {
        const weights = { 'Высокая': 3, 'Средняя': 2, 'Низкая': 1 };
        tasksToRender.sort((a, b) => (weights[b.priority] || 0) - (weights[a.priority] || 0));
    }

    // 3. Рендеринг карточек и обработка дедлайнов
    tasksToRender.forEach(task => {
        if (counts[task.status] !== undefined) {
            counts[task.status]++;
        }
        
        const card = document.createElement('div');
        card.className = 'task-card';
        card.dataset.id = task.id;
        
        let dateHtml = '<div>📅 —</div>';
        if (task.date) {
            const tDate = new Date(task.date);
            const hoursLeft = (tDate - now) / (1000 * 60 * 60);
            const dateStr = tDate.toLocaleString('ru-RU', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
            
            // Если осталось менее 24 часов или просрочено
            if (hoursLeft <= 24) {
                dateHtml = `<div style="color: #cc0000; font-weight: bold;">📅 ${dateStr}</div>`;
            } else {
                dateHtml = `<div>📅 ${dateStr}</div>`;
            }
        }

        card.innerHTML = `
            <div class="card-top"><span>${task.title}</span><span style="color:${task.priority === 'Высокая' ? 'red' : ''}">⚠</span></div>
            <div class="card-meta-info">
                <div>👤 ${task.assignee || '—'}</div>
                ${dateHtml}
            </div>
        `;
        
        card.onclick = () => openModalForEdit(task.id);
        if (zones[task.status]) {
            zones[task.status].appendChild(card);
        }
    });

    // 4. Обновление счетчиков в шапках колонок и проверка WIP-лимитов
    Object.keys(counts).forEach(status => {
        const countEl = document.getElementById(`count-${status}`);
        if (countEl) {
            countEl.innerText = counts[status];
            
            // Использование динамического лимита для текущей архитектуры колонок
            if (activeBoardData && activeBoardData.wip_enabled) {
                const col = activeBoardData.columns.find(c => c.id === status);
                const limit = col ? col.wip_limit : 0;
                
                if (limit > 0 && counts[status] >= limit) {
                    countEl.classList.add('limit-exceeded');
                } else {
                    countEl.classList.remove('limit-exceeded');
                }
            } else {
                countEl.classList.remove('limit-exceeded');
            }
        }
    });
}



function setupDragAndDrop() {
    const activeCols = activeBoardData.columns.filter(c => !c.archived);
    
    // Сортировка задач внутри колонок
    activeCols.forEach(col => {
        const el = document.getElementById(`cards-${col.id}`);
        if (!el) return;
        if (el.sortableInstance) el.sortableInstance.destroy();
        
        el.sortableInstance = new Sortable(el, {
            group: 'kanban',
            animation: 150,
            put: function (to, from) {
                if (to.el === from.el) return true;
                if (!activeBoardData || !activeBoardData.wip_enabled) return true;
                const limit = col.wip_limit;
                if (!limit || limit <= 0) return true;
                const currentCount = currentTasks.filter(t => t.status === col.id).length;
                return currentCount < limit;
            },
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

    // Сортировка (перемещение) самих колонок
    const colContainer = document.querySelector('.board-columns');
    if (columnSortable) columnSortable.destroy();
    
    columnSortable = new Sortable(colContainer, {
        animation: 200,
        handle: '.drag-handle',
        direction: 'horizontal',
        forceFallback: true,
        onEnd: async (e) => {
            const active = activeBoardData.columns.filter(c => !c.archived);
            const archived = activeBoardData.columns.filter(c => c.archived);
            
            const moved = active.splice(e.oldIndex, 1)[0];
            active.splice(e.newIndex, 0, moved);
            
            activeBoardData.columns = [...active, ...archived];
            await syncBoardSettingsToServer();
        }
    });
}

function openModalForCreate(status) {
    if (!activeBoardId) return;
    editingTaskId = null;
    currentOpenedTask = null;
    targetColumnStatus = status;
    
    const locEl = document.getElementById('modal-location');
    if (locEl) locEl.innerText = status === 'backlog_creation' ? 'Бэклог' : (statusMap[status] || status);

    document.getElementById('modal-link-task-btn').style.display = 'none'; 
    document.getElementById('modal-title').value = '';
    document.getElementById('modal-assignee').value = activeUser.username;
    document.getElementById('modal-date').value = '';
    document.getElementById('modal-description').value = '';
    document.getElementById('modal-logs').innerHTML = 'Новая задача';
    
    document.getElementById('modal-comments-toggle-btn').style.display = 'none';
    document.getElementById('modal-comments-section').style.display = 'none';
    
    const archiveBtn = document.getElementById('btn-to-archive');
    const backlogBtn = document.getElementById('btn-to-backlog');
    const restoreBtn = document.getElementById('btn-restore-board');

    archiveBtn.textContent = 'В архив';
    archiveBtn.onclick = archiveCurrentTask;

    archiveBtn.style.display = 'none';
    backlogBtn.style.display = 'none';
    restoreBtn.style.display = 'none';

    document.getElementById('task-modal').style.display = 'block';
}

function openModalForEdit(id) {
    editingTaskId = id;
    const task = currentTasks.find(t => t.id == id);
    if (!task) {
        alert('Задача была удалена');
        return;
    }
    currentOpenedTask = task;

    const col = activeBoardData.columns.find(c => c.id === task.status);
    const locEl = document.getElementById('modal-location');
    
    const archiveBtn = document.getElementById('btn-to-archive');
    const backlogBtn = document.getElementById('btn-to-backlog');
    const restoreBtn = document.getElementById('btn-restore-board');

    if (locEl) {
        if (col && col.archived) {
            locEl.innerText = `${col.name} (архив)`;
            archiveBtn.textContent = 'Извлечь на доску';
            archiveBtn.onclick = async () => {
                const firstCol = activeBoardData.columns.find(c => !c.archived);
                if (!firstCol) { alert('Нет активных колонок!'); return; }
                task.status = firstCol.id;
                await fetch(`/api/tasks/${task.id}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(task) });
                closeModal();
                await loadTasks();
                if (currentArchivedColId) openArchivedColumnModal(currentArchivedColId);
            };
            backlogBtn.style.display = 'none';
            restoreBtn.style.display = 'none';
            archiveBtn.style.display = 'block';
        } else {
            locEl.innerText = col ? col.name : task.status;
            archiveBtn.textContent = 'В архив';
            archiveBtn.onclick = archiveCurrentTask;
            backlogBtn.style.display = 'block';
            restoreBtn.style.display = 'none';
            archiveBtn.style.display = 'block';
        }
    }

    document.getElementById('modal-link-task-btn').style.display = 'inline-block';
    document.getElementById('modal-title').value = task.title;
    document.getElementById('modal-assignee').value = task.assignee || '';
    document.getElementById('modal-date').value = task.date || '';
    document.getElementById('modal-priority').value = task.priority || 'Средняя';
    document.getElementById('modal-description').value = task.description || '';
    document.getElementById('modal-logs').innerHTML = `<strong>${task.creator}</strong> создал(а) задачу: <span>${task.created_at || '—'}</span>`;
    
    document.getElementById('modal-comments-toggle-btn').style.display = 'block';
    document.getElementById('modal-comments-section').style.display = 'none';
    loadTaskComments(id);
    
    document.getElementById('task-modal').style.display = 'block';
}




function closeModal() { 
    document.getElementById('task-modal').style.display = 'none'; 
    
    const commentsSection = document.getElementById('modal-comments-section');
    if (commentsSection) commentsSection.style.display = 'none';
    
    const input = document.getElementById('task-comment-input');
    if (input) input.value = '';
    
    editingTaskId = null;
    currentOpenedTask = null;
}



async function saveTask() {
    const isBacklogCreation = targetColumnStatus === 'backlog_creation';
    const activeCols = activeBoardData && activeBoardData.columns ? activeBoardData.columns.filter(c => !c.archived) : [];
    const defaultCol = activeCols.length > 0 ? activeCols[0].id : 'todo';

    const payload = {
        board_id: activeBoardId,
        title: document.getElementById('modal-title').value || 'Без названия',
        assignee: document.getElementById('modal-assignee').value,
        date: document.getElementById('modal-date').value,
        priority: document.getElementById('modal-priority').value,
        description: document.getElementById('modal-description').value,
        status: isBacklogCreation ? defaultCol : (editingTaskId ? currentOpenedTask.status : targetColumnStatus),
        backlog: isBacklogCreation ? 1 : 0
    };
    
    if (editingTaskId) await fetch(`/api/tasks/${editingTaskId}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    else await fetch('/api/tasks', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    
    closeModal();

    if (document.getElementById('analytics-archive-view').style.display === 'block') await window.openArchiveViewer();
    if (document.getElementById('analytics-backlog-view').style.display === 'block') await window.openBacklogViewer();
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

    // Сначала отрисовывается список архивных колонок
    renderArchivedColumnsList();

    const list = document.getElementById('archive-tasks-list');
    if (list) {
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
    }

    document.querySelector('#view-analytics .folders-grid').style.display = 'none';
    
    const logsView = document.getElementById('analytics-logs-view');
    if (logsView) logsView.style.display = 'none';
    
    document.getElementById('analytics-archive-view').style.display = 'block';
};


function renderArchivedColumnsList() {
    let container = document.getElementById('archive-columns-list');
    if (!container) {
        const listContainer = document.getElementById('archive-tasks-list').parentNode;
        const colSection = document.createElement('div');
        colSection.innerHTML = `<h3 style="margin:20px 0 10px; border-bottom:2px solid #0000ff; padding-bottom:5px;">Архив колонок</h3><div id="archive-columns-list" style="display:flex; flex-wrap:wrap; gap:16px;"></div><h3 style="margin:20px 0 10px; border-bottom:2px solid #0000ff; padding-bottom:5px;">Архив задач</h3>`;
        listContainer.insertBefore(colSection, document.getElementById('archive-tasks-list'));
        container = document.getElementById('archive-columns-list');
    }
    container.innerHTML = '';
    const archivedCols = activeBoardData.columns.filter(c => c.archived);
    archivedCols.forEach(col => {
        const card = document.createElement('div');
        card.className = 'task-card';
        card.style.cursor = 'pointer';
        card.style.width = '320px';
        card.innerHTML = `<div style="font-weight:bold; text-align:center;">📦 ${col.name}</div>`;
        card.onclick = () => openArchivedColumnModal(col.id);
        container.appendChild(card);
    });
}

function openArchivedColumnModal(colId) {
    currentArchivedColId = colId;
    const col = activeBoardData.columns.find(c => c.id === colId);
    document.getElementById('archived-col-modal-name').innerText = col.name;
    
    const tasksContainer = document.getElementById('archived-col-tasks');
    tasksContainer.innerHTML = '';
    
    // Задачи архивированной колонки, которые не были отправлены в архив персонально
    const colTasks = currentTasks.filter(t => t.status === colId && t.archived === 0);
    
    colTasks.forEach(task => {
        const card = document.createElement('div');
        card.className = 'task-card';
        card.dataset.id = task.id;
        const dateStr = task.date ? new Date(task.date).toLocaleString('ru-RU', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}) : '—';
        card.innerHTML = `<div class="card-top"><span>${task.title}</span></div><div class="card-meta-info"><div>👤 ${task.assignee || '—'}</div><div>📅 ${dateStr}</div></div>`;
        card.onclick = () => openModalForEdit(task.id);
        tasksContainer.appendChild(card);
    });
    
    document.getElementById('col-archive-modal').style.display = 'flex';
}

function closeArchivedColumnModal() {
    document.getElementById('col-archive-modal').style.display = 'none';
    currentArchivedColId = null;
}

async function restoreArchivedColumn() {
    const col = activeBoardData.columns.find(c => c.id === currentArchivedColId);
    if (col) {
        col.archived = false;
        activeBoardData.columns = activeBoardData.columns.filter(c => c.id !== col.id);
        activeBoardData.columns.push(col); // Перенос в конец
        await syncBoardSettingsToServer();
        closeArchivedColumnModal();
        window.openArchiveViewer(); 
    }
}

async function deleteArchivedColumn() {
    if (!confirm('Удалить колонку и ВСЕ задачи внутри неё безвозвратно?')) return;
    await fetch(`/api/boards/${activeBoardId}/columns/${currentArchivedColId}/tasks`, { method: 'DELETE' });
    activeBoardData.columns = activeBoardData.columns.filter(c => c.id !== currentArchivedColId);
    await syncBoardSettingsToServer();
    closeArchivedColumnModal();
    await loadTasks();
    window.openArchiveViewer();
}

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

    document.getElementById('modal-comments-toggle-btn').style.display = 'block';
    document.getElementById('modal-comments-section').style.display = 'none';

    const commentsList = document.getElementById('task-comments-list');
    if (commentsList) {
        commentsList.innerHTML = '';
    }

    const commentInput = document.getElementById('task-comment-input');
    if (commentInput) {
        commentInput.value = '';
    }

    loadTaskComments(task.id);

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
// Функция для открытия задачи по ссылке из чата (учитывает архивные задачи)
async function openTaskFromChat(taskId) {
    try {
        const res = await fetch(`/api/tasks/${taskId}`);
        if (res.status === 404) {
            alert('Эта задача была удалена из доски');
            return;
        }
        if (!res.ok) {
            alert('Не удалось загрузить задачу');
            return;
        }
        
        const task = await res.json();
        const isActive = currentTasks.some(t => t.id == task.id);
        
        if (isActive) {
            openModalForEdit(task.id);
        } else if (task.archived === 1) {
            window.openModalForArchived(task);
        } else if (task.backlog === 1) {
            window.openModalForBacklog(task);
        }
        
    } catch (err) {
        console.log('Сетевая ошибка при получении задачи:', err);
    }
}


function toggleTaskComments() {
    const activeModal = document.getElementById('archived-task-modal')?.style.display === 'block' 
        ? document.getElementById('archived-task-modal') 
        : document.getElementById('task-modal');
        
    const section = activeModal?.querySelector('#modal-comments-section') || document.getElementById('modal-comments-section');
    
    if (section) {
        if (section.style.display === 'none') {
            section.style.display = 'flex';
            scrollToTaskCommentsBottom();
        } else {
            section.style.display = 'none';
        }
    }
}


async function loadTaskComments(taskId) {
    const res = await fetch(`/api/tasks/${taskId}/comments`);
    if (res.ok) {
        const comments = await res.json();
        renderTaskComments(comments);
    }
}

function renderTaskComments(comments) {
    const container = document.getElementById('task-comments-list');
    if (!container) return;

    container.innerHTML = '';

    if (comments.length === 0) {
        container.innerHTML =
            '<div style="text-align:center;color:#777;font-size:13px;margin-top:10px;">Нет комментариев</div>';
        return;
    }

    comments.forEach(c => {
        const div = document.createElement('div');
        div.className = 'chat-msg';

        div.innerHTML = `
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                <span class="chat-msg-author">${c.username}</span>
                <span style="font-size:10px;color:#888;">${c.created_at}</span>
            </div>
            <div class="chat-msg-text">${c.content}</div>
        `;

        container.appendChild(div);
    });

    container.scrollTop = container.scrollHeight;
}


async function sendTaskComment() {
    const activeModal = document.getElementById('archived-task-modal')?.style.display === 'block' 
        ? document.getElementById('archived-task-modal') 
        : document.getElementById('task-modal');
        
    const input = activeModal?.querySelector('#task-comment-input') || document.getElementById('task-comment-input');
    if (!input) return;
    
    const content = input.value.trim();
    if (!content || !editingTaskId) return;
    
    const res = await fetch(`/api/tasks/${editingTaskId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content })
    });
    
    if (res.ok) {
        input.value = '';
        await loadTaskComments(editingTaskId);
        await loadLogs();
    }
}


function scrollToTaskCommentsBottom(passedContainer = null) {
    let container = passedContainer;
    if (!container) {
        const activeModal = document.getElementById('archived-task-modal')?.style.display === 'block' 
            ? document.getElementById('archived-task-modal') 
            : document.getElementById('task-modal');
        container = activeModal?.querySelector('#task-comments-list') || document.getElementById('task-comments-list');
    }
    
    if (container) {
        container.scrollTop = container.scrollHeight;
    }
}


window.openBacklogViewer = async function () {
    if (!activeBoardId) return;

    const res = await fetch(`/api/boards/${activeBoardId}/backlog`);
    if (!res.ok) return;

    const tasks = await res.json();

    const list = document.getElementById('backlog-tasks-list');
    if (list) {
        list.innerHTML = '';
        tasks.forEach(task => {
            const card = document.createElement('div');
            card.className = 'task-card';
            card.dataset.id = task.id;

            const dateStr = task.date ? new Date(task.date).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

            card.innerHTML = `
                <div class="card-top">
                    <span>${task.title}</span>
                    <span style="color:${task.priority === 'Высокая' ? 'red' : ''}">⚠</span>
                </div>
                <div class="card-meta-info">
                    <div>👤 ${task.assignee || '—'}</div>
                    <div>📅 ${dateStr}</div>
                </div>
            `;
            card.onclick = () => window.openModalForBacklog(task);
            list.appendChild(card);
        });
    }

    document.querySelector('#view-analytics .folders-grid').style.display = 'none';
    const logsView = document.getElementById('analytics-logs-view');
    if (logsView) logsView.style.display = 'none';
    const archiveView = document.getElementById('analytics-archive-view');
    if (archiveView) archiveView.style.display = 'none';

    document.getElementById('analytics-backlog-view').style.display = 'block';
};

window.closeBacklogViewer = function () {
    document.querySelector('#view-analytics .folders-grid').style.display = 'grid';
    document.getElementById('analytics-backlog-view').style.display = 'none';
};

window.openModalForBacklog = function (task) {
    currentOpenedTask = task;
    editingTaskId = task.id;

    document.getElementById('modal-title').value = task.title;
    document.getElementById('modal-assignee').value = task.assignee || '';
    document.getElementById('modal-date').value = task.date || '';
    document.getElementById('modal-priority').value = task.priority || 'Средняя';
    document.getElementById('modal-description').value = task.description || '';
    document.getElementById('modal-location').innerText = 'Бэклог';

    document.getElementById('modal-logs').innerHTML = `<strong>${task.creator}</strong> создал(а) задачу: <span>${task.created_at || '—'}</span>`;

    document.getElementById('modal-link-task-btn').style.display = 'inline-block';
    document.getElementById('modal-comments-toggle-btn').style.display = 'block';
    document.getElementById('modal-comments-section').style.display = 'none';

    const commentsList = document.getElementById('task-comments-list');
    if (commentsList) commentsList.innerHTML = '';
    const commentInput = document.getElementById('task-comment-input');
    if (commentInput) commentInput.value = '';

    loadTaskComments(task.id);

    const archiveBtn = document.getElementById('btn-to-archive');
    const backlogBtn = document.getElementById('btn-to-backlog');
    const restoreBtn = document.getElementById('btn-restore-board');

    archiveBtn.textContent = 'В архив';
    archiveBtn.onclick = archiveCurrentTask;
    
    archiveBtn.style.display = 'block';
    backlogBtn.style.display = 'none';
    restoreBtn.style.display = 'block';

    document.getElementById('task-modal').style.display = 'block';
};

async function sendCurrentTaskToBacklog() {
    if (!editingTaskId) return;
    
    const payload = {
        board_id: activeBoardId,
        title: document.getElementById('modal-title').value || 'Без названия',
        assignee: document.getElementById('modal-assignee').value,
        date: document.getElementById('modal-date').value,
        priority: document.getElementById('modal-priority').value,
        description: document.getElementById('modal-description').value,
        status: currentOpenedTask.status
    };

    await fetch(`/api/tasks/${editingTaskId}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    await fetch(`/api/tasks/${editingTaskId}/backlog`, { method: 'PUT' });
    
    closeModal();
    await loadTasks();
}

window.toggleBoardColumnSelect = function(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('board-column-select');
    if (dropdown.style.display === 'block') {
        dropdown.style.display = 'none';
        return;
    }
    
    const activeCols = activeBoardData.columns.filter(c => !c.archived);
    dropdown.innerHTML = '';
    activeCols.forEach(col => {
        const btn = document.createElement('button');
        btn.innerText = col.name;
        btn.onclick = () => restoreTaskFromBacklog(editingTaskId, col.id);
        dropdown.appendChild(btn);
    });
    
    dropdown.style.display = 'block';
};

async function restoreTaskFromBacklog(taskId, columnId) {
    await fetch(`/api/tasks/${taskId}/restore_from_backlog`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: columnId })
    });
    
    document.getElementById('board-column-select').style.display = 'none';
    closeModal();
    await loadTasks();
    if (document.getElementById('analytics-backlog-view').style.display === 'block') {
        await window.openBacklogViewer();
    }
}
