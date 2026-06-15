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
let searchTimeout = null;
let activeTaskCheckpoints = [];
let isDraggingTask = false;

// Переменные для прикрепленной к чату задачи
let linkedChatTaskId = null;
let linkedChatTaskTitle = null;

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

const statusMap = {
    'todo': 'В планах',
    'in_progress': 'В разработке',
    'done': 'Готово'
};

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    initListeners();
    initDropzoneTooltips();
});

// Функция обновления WIP-индикаторов (ДОБАВЛЕНО)
function updateWipIndicators() {
    if (!activeBoardData || !activeBoardData.columns) return;
    
    // Подсчитываем задачи в каждой колонке
    const counts = {};
    activeBoardData.columns.forEach(col => {
        if (!col.archived) counts[col.id] = 0;
    });
    
    currentTasks.forEach(task => {
        if (counts[task.status] !== undefined) {
            counts[task.status]++;
        }
    });
    
    // Обновляем каждый индикатор
    activeBoardData.columns.forEach(col => {
        if (col.archived) return;
        
        const indicator = document.getElementById(`wip-indicator-${col.id}`);
        if (indicator) {
            const current = counts[col.id] || 0;
            const limit = col.wip_limit || 0;
            if (limit > 0) {
                indicator.textContent = `WIP: ${current}/${limit}`;
                indicator.style.display = 'inline-block';
                
                indicator.classList.remove('warning', 'danger');
                if (current >= limit) {
                    indicator.classList.add('danger');
                } else if (current >= limit * 0.8) {
                    indicator.classList.add('warning');
                }
            } else {
                indicator.style.display = 'none';
            }
        }
        
        // Обновляем счётчик задач
        const countEl = document.getElementById(`count-${col.id}`);
        if (countEl) {
            countEl.innerText = counts[col.id] || 0;
        }
    });
}

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
    initSearchListener()
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
    
    const descInput = document.getElementById('modal-description');
    if (descInput) {
        descInput.addEventListener('input', window.updateCharCounter);
    }

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
                    <span class="column-name" id="title-${col.id}">${escapeHtml(col.name)}</span>
                    <span class="column-count" id="count-${col.id}">0</span>
                    ${col.wip_limit > 0 ? `<span class="wip-indicator" id="wip-indicator-${col.id}">WIP: 0/${col.wip_limit}</span>` : ''}
                </div>
                <div class="column-controls control-wrapper">
                    <div class="drag-handle" title="Перетащите, чтобы изменить порядок колонок"></div>
                    <button onclick="toggleColumnMenu('menu-wip-${col.id}', event)">⋮</button>
                    <div class="dropdown-menu wip-menu" id="menu-wip-${col.id}" onclick="event.stopPropagation()">
                        <div class="wip-title">Название:</div>
                        <div class="wip-name-group">
                            <input type="text" id="rename-input-${col.id}" value="${col.name}" onclick="this.select()">
                            <button onclick="renameColumn('${col.id}')" class="btn-apply-rename">ОК</button>
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
    
    await fetch(`/api/boards/${activeBoardId}/logs`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action_desc: `Создал(а) новую колонку '${name.trim()}'`}) });
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

// Новая единая функция для синхронизации колонок и WIP (заменяет старые saveWipLimits, renameColumn)
window.syncBoardSettingsToServer = async function() {
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

    // Формируем строгий payload для предотвращения 500 ошибки (Validation Error)
    const payload = {
        wip_enabled: 1,
        dropzones_enabled: activeBoardData.dropzones_enabled !== 0 ? 1 : 0,
        columns_data: activeBoardData.columns_data
    };

    await fetch(`/api/boards/${activeBoardId}/settings`, {
        method: 'PUT', 
        headers: { 'Content-Type': 'application/json'}, 
        body: JSON.stringify(payload)
    });

    applyDropzonesVisibility();
    updateWipIndicators();
     activeBoardData.columns.forEach(col => {
        if (!col.archived) {
            const titleSpan = document.getElementById(`title-${col.id}`);
            if (titleSpan) titleSpan.innerText = col.name;
        }
    });
};



// Обновленная функция изменения числового лимита
function changeWip(status, delta) {
    const input = document.getElementById(`wip-input-${status}`);
    let val = parseInt(input.value) || 0;
    val += delta;
    if (val < 0) val = 0;
    input.value = val;
    
    const col = activeBoardData.columns.find(c => c.id === status);
    if (col) {
        col.wip_limit = val;
        
        // НЕМЕДЛЕННО обновляем индикатор на странице
        const indicator = document.getElementById(`wip-indicator-${status}`);
        if (indicator) {
            // Подсчитываем текущее количество задач в колонке
            const currentCount = currentTasks.filter(t => t.status === status).length;
            indicator.textContent = `WIP: ${currentCount}/${val}`;
            
            indicator.classList.remove('warning', 'danger');
            if (val > 0 && currentCount >= val) {
                indicator.classList.add('danger');
            } else if (val > 0 && currentCount >= val * 0.8) {
                indicator.classList.add('warning');
            }
        }
        
        // Также обновляем счетчик лимита в выпадающем меню
        const wipInput = document.getElementById(`wip-input-${status}`);
        if (wipInput) wipInput.value = val;
    }
    
    // Сохраняем на сервер в фоне
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
    
    const editBtn = document.getElementById('edit-board-title-btn');
    if (editBtn) editBtn.style.display = 'block';

    try {
        activeBoardData.columns = board.columns_data ? JSON.parse(board.columns_data) : [
            {id: 'todo', name: 'В планах', wip_limit: 0, archived: false},
            {id: 'in_progress', name: 'В разработке', wip_limit: 0, archived: false},
            {id: 'done', name: 'Готово', wip_limit: 0, archived: false}
        ];
    } catch(e) {
        activeBoardData.columns = [];
    }
    
    document.getElementById('board-dropzones-toggle').checked = board.dropzones_enabled !== 0;
    
    if (window.applyScrollModeSetting) {
        window.applyScrollModeSetting();
    }
    
    applyDropzonesVisibility();

    switchView('board');
    renderColumns();
    loadTasks();
    loadMembers();
    loadChatMessages();

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
                        activeBoardData.columns = updatedBoard.columns_data ? JSON.parse(updatedBoard.columns_data) : [
                            {id: 'todo', name: 'В планах', wip_limit: 0, archived: false},
                            {id: 'in_progress', name: 'В разработке', wip_limit: 0, archived: false},
                            {id: 'done', name: 'Готово', wip_limit: 0, archived: false}
                        ];
                    } catch(e) {
                        activeBoardData.columns = [];
                    }
                    renderColumns();
                    updateWipIndicators(); 
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

async function syncWipToServer() {
    await fetch(`/api/boards/${activeBoardId}/wip`, {
        method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({wip_enabled: 1, columns_data: activeBoardData.columns_data})});
    renderBoardCards();
}

async function loadTasks() {
    const res = await fetch(`/api/tasks?board_id=${activeBoardId}`);
    currentTasks = await res.json();
    
    // Обновляем список исполнителей в меню фильтров на основе полученных задач
    updateFilterAssigneesUI();
    
    renderBoardCards();
    updateWipIndicators(); // ДОБАВЛЕНО
}


function applySort(method) {
    currentSortMethod = method;
    renderBoardCards();
}

function renderBoardCards() {
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

    // 3. Рендеринг карточек с описанием
    tasksToRender.forEach(task => {
        if (counts[task.status] !== undefined) {
            counts[task.status]++;
        }
        
        const card = document.createElement('div');
        card.className = 'task-card';
        card.dataset.id = task.id;
        
        // Описание задачи (обрезаем для безопасности)
        const description = task.description || '';
        let descriptionHtml = '';
        if (description) {
            let shortDesc = description.length > 100 ? description.substring(0, 97) + '...' : description;
            descriptionHtml = `<div class="card-description">${escapeHtml(shortDesc)}</div>`;
        }
        
        let dateHtml = '<span>📅 —</span>';
        if (task.date) {
            const tDate = new Date(task.date);
            const hoursLeft = (tDate - now) / (1000 * 60 * 60);
            const dateStr = tDate.toLocaleString('ru-RU', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'});
            
            if (hoursLeft <= 24) {
                dateHtml = `<span style="color: #dc3545;">📅 ${escapeHtml(dateStr)}</span>`;
            } else {
                dateHtml = `<span>📅 ${escapeHtml(dateStr)}</span>`;
            }
        }

        const priorityClass = task.priority === 'Высокая' ? 'high' : (task.priority === 'Средняя' ? 'medium' : 'low');
        const progressHtml = getCheckpointsProgressHtml(task.checkpoints);
        
        card.innerHTML = `
            <div class="card-title">
                <span class="card-priority ${priorityClass}"></span>
                <span style="flex: 1; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(task.title)}</span>
            </div>
            ${descriptionHtml}
            <div class="card-meta-info">
                <span>👤 ${escapeHtml(task.assignee || '—')}</span>
                ${dateHtml}
                <div style="display: flex; align-items: center; gap: 4px;">
                    ${progressHtml}
                </div>
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
            
            // Обновление WIP-индикатора
            const indicator = document.getElementById(`wip-indicator-${status}`);
            if (indicator && activeBoardData) {
                const col = activeBoardData.columns.find(c => c.id === status);
                const limit = col ? col.wip_limit : 0;
                const current = counts[status];
                
                if (limit > 0) {
                    indicator.textContent = `WIP: ${current}/${limit}`;
                    indicator.style.display = 'inline-block';
                    
                    indicator.classList.remove('warning', 'danger');
                    if (current >= limit) {
                        indicator.classList.add('danger');
                    } else if (current >= limit * 0.8) {
                        indicator.classList.add('warning');
                    }
                } else {
                    indicator.style.display = 'none';
                }
            }
            
            // Подсветка счётчика при превышении лимита
            if (activeBoardData) {
                const col = activeBoardData.columns.find(c => c.id === status);
                const limit = col ? col.wip_limit : 0;
                
                if (limit > 0 && counts[status] >= limit) {
                    countEl.classList.add('limit-exceeded');
                } else {
                    countEl.classList.remove('limit-exceeded');
                }
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
            onStart: () => { isDraggingTask = true; },
            onEnd: async (e) => {
                isDraggingTask = false;
                const taskId = e.item.dataset.id;
                const nextStatus = e.to.dataset.status;

                // Обработка сброса в боковые панели (Бэклог / Архив)
                if (e.to.classList.contains('side-dropzone')) {
                    const target = e.to.dataset.target;
                    e.item.style.display = 'none'; // Немедленно скрываем карточку
                    e.to.classList.remove('drag-active');
                    document.getElementById('drag-tooltip').style.display = 'none';

                    if (target === 'backlog') {
                        await fetch(`/api/tasks/${taskId}/backlog`, { method: 'PUT' });
                    } else if (target === 'archive') {
                        await fetch(`/api/tasks/${taskId}/archive`, { method: 'PUT' });
                    }
                    await loadTasks();
                    return;
                }

                const task = currentTasks.find(t => t.id == taskId);
                if (task && task.status !== nextStatus) {
                    task.status = nextStatus;
                    await fetch(`/api/tasks/${taskId}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(task) });
                }
            },
            put: function (to, from) {
                if (to.el === from.el) return true;
                const limit = col.wip_limit;
                if (!limit || limit <= 0) return true;
                const currentCount = currentTasks.filter(t => t.status === col.id).length;
                return currentCount < limit;
            }
        });
    });

    // Инициализация боковых зон как валидных приемников Sortable
    ['dropzone-backlog', 'dropzone-archive'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.sortableInstance) el.sortableInstance.destroy();

        el.sortableInstance = new Sortable(el, {
            group: 'kanban',
            animation: 150
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


// Полная замена функции openModalForCreate (с учетом добавленных в следующем шаге переменных для чекпоинтов)
window.openModalForCreate = function(status = null) {
    if (!activeBoardId) return;
    editingTaskId = null;
    currentOpenedTask = null;
    
    const selectContainer = document.getElementById('modal-status-container');
    const locContainer = document.getElementById('modal-location');
    const select = document.getElementById('modal-status-select');
    
    select.innerHTML = ''; 
    
    if (status === 'backlog_creation') {
        targetColumnStatus = 'backlog_creation';
        selectContainer.style.display = 'none';
        locContainer.style.display = 'block';
        locContainer.innerText = 'Бэклог';
    } else {
        selectContainer.style.display = 'flex';
        locContainer.style.display = 'none';
        
        if (activeBoardData && activeBoardData.columns) {
            const activeCols = activeBoardData.columns.filter(c => !c.archived);
            activeCols.forEach(col => {
                const opt = document.createElement('option');
                opt.value = col.id;
                opt.innerText = col.name;
                select.appendChild(opt);
            });
            targetColumnStatus = select.value;
        }
    }

    document.getElementById('modal-link-task-btn').style.display = 'none'; 
    document.getElementById('modal-title').value = '';
    document.getElementById('modal-assignee').value = activeUser.username;
    
    setModalDateFields('', 'modal-date', 'modal-time');
    setModalDateFields('', 'modal-start-date', 'modal-start-time');

    document.getElementById('modal-description').value = '';
    document.getElementById('modal-logs').innerHTML = 'Новая задача';
    
    activeTaskCheckpoints = [];
    renderCheckpoints();
    
    const archiveBtn = document.getElementById('btn-to-archive');
    const backlogBtn = document.getElementById('btn-to-backlog');
    const restoreBtn = document.getElementById('btn-restore-board');

    archiveBtn.style.display = 'none';
    backlogBtn.style.display = 'none';
    restoreBtn.style.display = 'none';
    restoreBtn.onclick = window.toggleBoardColumnSelect;

    window.updateCharCounter();

    document.getElementById('task-modal').style.display = 'block';

};



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

    restoreBtn.onclick = window.toggleBoardColumnSelect;

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
    
    setModalDateFields(task.date, 'modal-date', 'modal-time');
    setModalDateFields(task.start_date, 'modal-start-date', 'modal-start-time');

    document.getElementById('modal-priority').value = task.priority || 'Средняя';
    document.getElementById('modal-description').value = task.description || '';
    document.getElementById('modal-logs').innerHTML = `<strong>${task.creator}</strong> создал(а) задачу: <span>${task.created_at || '—'}</span>`;
    
    document.getElementById('modal-status-container').style.display = 'none';
    document.getElementById('modal-location').style.display = 'block';

    document.getElementById('modal-comments-section').style.display = 'none';
    document.getElementById('comments-sidebar-tab').style.left = '-32px';

    loadTaskComments(id);
    
    try {
        activeTaskCheckpoints = task.checkpoints ? JSON.parse(task.checkpoints) : [];
    } catch (e) {
        activeTaskCheckpoints = [];
    }
    renderCheckpoints();
    
    window.updateCharCounter();

    document.getElementById('task-modal').style.display = 'block';
}





function closeModal() { 
    document.getElementById('task-modal').style.display = 'none'; 
    
    const commentsSection = document.getElementById('modal-comments-section');
    const tab = document.getElementById('comments-sidebar-tab');
    if (commentsSection) commentsSection.style.display = 'none';
    if (tab) tab.style.left = '-32px';
    
    const input = document.getElementById('task-comment-input');
    if (input) input.value = '';
    
    editingTaskId = null;
    currentOpenedTask = null;
    activeTaskCheckpoints = [];
}



window.saveTask = async function() {
    const isBacklogCreation = targetColumnStatus === 'backlog_creation';
    const activeCols = activeBoardData && activeBoardData.columns ? activeBoardData.columns.filter(c => !c.archived) : [];
    const defaultCol = activeCols.length > 0 ? activeCols[0].id : 'todo';

    const description = document.getElementById('modal-description').value;
    // Фронтенд-валидация ограничения описания в 1000 символов
    if (description && description.length > 3000) {
        alert('Описание задачи не может превышать 1000 символов!');
        return;
    }

    const payload = {
        board_id: activeBoardId,
        title: document.getElementById('modal-title').value || 'Без названия',
        assignee: document.getElementById('modal-assignee').value,
        date: getModalDateString('modal-date', 'modal-time'),
        start_date: getModalDateString('modal-start-date', 'modal-start-time'),
        priority: document.getElementById('modal-priority').value,
        description: document.getElementById('modal-description').value,
        status: isBacklogCreation ? defaultCol : (editingTaskId ? currentOpenedTask.status : document.getElementById('modal-status-select').value),
        backlog: isBacklogCreation ? 1 : 0,
        checkpoints: JSON.stringify(activeTaskCheckpoints)
    };
    
    if (editingTaskId) await fetch(`/api/tasks/${editingTaskId}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    else await fetch('/api/tasks', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    
    closeModal();
    await loadTasks();

    if (document.getElementById('analytics-archive-view').style.display === 'block') await window.openArchiveViewer();
    if (document.getElementById('analytics-backlog-view').style.display === 'block') await window.openBacklogViewer();
};


async function archiveCurrentTask() {
    if (!editingTaskId) return;

    const payload = {
        board_id: activeBoardId,
        title: document.getElementById('modal-title').value || 'Без названия',
        assignee: document.getElementById('modal-assignee').value,
        date: getModalDateString('modal-date', 'modal-time'),
        start_date: getModalDateString('modal-start-date', 'modal-start-time'),
        priority: document.getElementById('modal-priority').value,
        description: document.getElementById('modal-description').value,
        status: currentOpenedTask.status,
        checkpoints: JSON.stringify(activeTaskCheckpoints)
    };

    await fetch(`/api/tasks/${editingTaskId}`, { 
        method: 'PUT', 
        headers: {'Content-Type': 'application/json'}, 
        body: JSON.stringify(payload) 
    });

    const res = await fetch(`/api/tasks/${editingTaskId}/archive`, {
        method: 'PUT'
    });

    if (!res.ok) {
        alert('Ошибка');
        return;
    }

    closeModal();
    await loadTasks();

    if (document.getElementById('analytics-archive-view').style.display === 'block') {
        await window.openArchiveViewer();
    }
    if (document.getElementById('analytics-backlog-view').style.display === 'block') {
        await window.openBacklogViewer();
    }
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
            
            const progressHtml = getCheckpointsProgressHtml(task.checkpoints);
            
            // Исправлена проблема с версткой: progressHtml вынесен из span
            card.innerHTML = `
                <div class="card-top">
                    <span>${task.title}</span>
                </div>
                <div class="card-meta-info">
                    <div>👤 ${task.assignee || '—'}</div>
                    <div>📅 ${dateStr}</div>
                    <div><button onclick="deleteTaskPermanent(${task.id}, event)" style="color: red; border: none; background: none; font-size: 16px; cursor: pointer; padding: 0;" title="Удалить навсегда">✖</button></div>
                </div>
            `;
            
            // card.innerHTML = `
            //     <div class="card-top">
            //         <span>${task.title}</span>
            //         <div style="display: flex; align-items: center; gap: 8px;">
            //             <div style="display: flex; align-items: center;">
            //                 ${progressHtml}
            //                 <span style="color:${task.priority === 'Высокая' ? 'red' : ''}">⚠</span>
            //             </div>
            //             <button onclick="deleteTaskPermanent(${task.id}, event)" style="color: red; border: none; background: none; font-size: 16px; cursor: pointer; padding: 0;" title="Удалить навсегда">✖</button>
            //         </div>
            //     </div>
            //     <div class="card-meta-info">
            //         <div>👤 ${task.assignee || '—'}</div>
            //         <div>📅 ${dateStr}</div>
            //     </div>
            // `;

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
window.openModalForArchived = function(task) {
    currentOpenedTask = task;
    editingTaskId = task.id;
    
    document.getElementById('modal-title').value = task.title;
    document.getElementById('modal-assignee').value = task.assignee || '';
    
    setModalDateFields(task.date, 'modal-date', 'modal-time');
    setModalDateFields(task.start_date, 'modal-start-date', 'modal-start-time');

    document.getElementById('modal-priority').value = task.priority || 'Средняя';
    document.getElementById('modal-description').value = task.description || '';
    document.getElementById('modal-location').innerText = 'Архив';

    document.getElementById('modal-logs').innerHTML = `<strong>${task.creator}</strong> создал(а) задачу: <span>${task.created_at || '—'}</span>`;

    document.getElementById('modal-status-container').style.display = 'none';
    document.getElementById('modal-location').style.display = 'block';

    document.getElementById('modal-link-task-btn').style.display = 'inline-block';
    
    document.getElementById('modal-comments-section').style.display = 'none';
    document.getElementById('comments-sidebar-tab').style.left = '-32px';

    const commentsList = document.getElementById('task-comments-list');
    if (commentsList) commentsList.innerHTML = '';
    const commentInput = document.getElementById('task-comment-input');
    if (commentInput) commentInput.value = '';

    loadTaskComments(task.id);

    try {
        activeTaskCheckpoints = task.checkpoints ? JSON.parse(task.checkpoints) : [];
    } catch (e) {
        activeTaskCheckpoints = [];
    }
    renderCheckpoints();

    const archiveBtn = document.getElementById('btn-to-archive');
    const backlogBtn = document.getElementById('btn-to-backlog');
    const restoreBtn = document.getElementById('btn-restore-board');

    archiveBtn.textContent = 'В архив';
    archiveBtn.style.display = 'none';
    
    backlogBtn.style.display = 'block'; 
    restoreBtn.style.display = 'block';

    restoreBtn.onclick = window.toggleBoardColumnSelect;

    window.updateCharCounter();

    document.getElementById('task-modal').style.display = 'block';
}




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


// 6. Логика панели комментариев
function toggleTaskComments() {
    const panel = document.getElementById('modal-comments-section');
    const tab = document.getElementById('comments-sidebar-tab');
    
    if (panel.style.display === 'none') {
        panel.style.display = 'flex';
        tab.style.left = '-352px';
        scrollToTaskCommentsBottom();
    } else {
        panel.style.display = 'none';
        tab.style.left = '-32px';
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
            
            const progressHtml = getCheckpointsProgressHtml(task.checkpoints);
            
            // Исправлена проблема с версткой: progressHtml вынесен из span
            card.innerHTML = `
                <div class="card-top">
                    <span>${task.title}</span>
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
    
    setModalDateFields(task.date, 'modal-date', 'modal-time');
    setModalDateFields(task.start_date, 'modal-start-date', 'modal-start-time');

    document.getElementById('modal-priority').value = task.priority || 'Средняя';
    document.getElementById('modal-description').value = task.description || '';
    
    document.getElementById('modal-status-container').style.display = 'none';
    document.getElementById('modal-location').style.display = 'block';

    document.getElementById('modal-location').innerText = 'Бэклог';

    document.getElementById('modal-logs').innerHTML = `<strong>${task.creator}</strong> создал(а) задачу: <span>${task.created_at || '—'}</span>`;

    document.getElementById('modal-link-task-btn').style.display = 'inline-block';

    document.getElementById('modal-comments-section').style.display = 'none';
    document.getElementById('comments-sidebar-tab').style.left = '-32px';

    const commentsList = document.getElementById('task-comments-list');
    if (commentsList) commentsList.innerHTML = '';
    const commentInput = document.getElementById('task-comment-input');
    if (commentInput) commentInput.value = '';

    loadTaskComments(task.id);

    try {
        activeTaskCheckpoints = task.checkpoints ? JSON.parse(task.checkpoints) : [];
    } catch (e) {
        activeTaskCheckpoints = [];
    }
    renderCheckpoints();

    const archiveBtn = document.getElementById('btn-to-archive');
    const backlogBtn = document.getElementById('btn-to-backlog');
    const restoreBtn = document.getElementById('btn-restore-board');

    archiveBtn.textContent = 'В архив';
    archiveBtn.onclick = archiveCurrentTask;
    
    archiveBtn.style.display = 'block';
    backlogBtn.style.display = 'none';
    restoreBtn.style.display = 'block';

    restoreBtn.onclick = window.toggleBoardColumnSelect;

    window.updateCharCounter();

    document.getElementById('task-modal').style.display = 'block';
};


async function sendCurrentTaskToBacklog() {
    if (!editingTaskId) return;
    
    const payload = {
        board_id: activeBoardId,
        title: document.getElementById('modal-title').value || 'Без названия',
        assignee: document.getElementById('modal-assignee').value,
        date: getModalDateString('modal-date', 'modal-time'),
        start_date: getModalDateString('modal-start-date', 'modal-start-time'),
        priority: document.getElementById('modal-priority').value,
        description: document.getElementById('modal-description').value,
        status: currentOpenedTask.status,
        checkpoints: JSON.stringify(activeTaskCheckpoints)
    };

    await fetch(`/api/tasks/${editingTaskId}`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    await fetch(`/api/tasks/${editingTaskId}/backlog`, { method: 'PUT' });
    
    closeModal();
    await loadTasks();

    if (document.getElementById('analytics-archive-view').style.display === 'block') {
        await window.openArchiveViewer();
    }
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
        btn.onclick = () => {
            // Определение источника задачи по ее статусу и перенаправление в правильную функцию
            if (currentOpenedTask && currentOpenedTask.archived === 1) {
                restoreTaskFromArchive(editingTaskId, col.id);
            } else {
                restoreTaskFromBacklog(editingTaskId, col.id);
            }
        };
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

function initSearchListener() {
    const searchInput = document.getElementById('global-search-input');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearTimeout(searchTimeout);
        
        if (query.length < 2) {
            document.getElementById('search-results-dropdown').style.display = 'none';
            return;
        }
        searchTimeout = setTimeout(() => performSearch(query), 400);
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            const drop = document.getElementById('search-results-dropdown');
            if (drop) drop.style.display = 'none';
        }
    });
}

async function performSearch(query) {
    if (!activeBoardId) return;
    
    const res = await fetch(`/api/boards/${activeBoardId}/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) return;
    const data = await res.json();
    
    const dropdown = document.getElementById('search-results-dropdown');
    dropdown.innerHTML = '';
    let hasResults = false;

    const categories = [
        { key: 'board', name: 'Доска', icon: '📝' },
        { key: 'backlog', name: 'Бэклог', icon: '☰' },
        { key: 'archive', name: 'Архив', icon: '📦' },
        { key: 'chat', name: 'Чат', icon: '💬' },
        { key: 'logs', name: 'Журнал действий', icon: '📋' }
    ];

    categories.forEach(cat => {
        if (data[cat.key] && data[cat.key].length > 0) {
            hasResults = true;
            const catHeader = document.createElement('div');
            catHeader.className = 'search-category-header';
            catHeader.innerText = `${cat.icon} ${cat.name}`;
            dropdown.appendChild(catHeader);

            data[cat.key].forEach(item => {
                const row = document.createElement('div');
                row.className = 'search-result-item';
                
                if (['board', 'backlog', 'archive'].includes(cat.key)) {
                    row.innerText = item.title;
                    row.onclick = () => {
                        dropdown.style.display = 'none';
                        openTaskFromChat(item.id);
                    };
                } else if (cat.key === 'chat') {
                    row.innerHTML = `<strong>${item.username}:</strong> <span style="font-size: 11px;">${item.content}</span>`;
                    row.onclick = () => {
                        dropdown.style.display = 'none';
                        const chat = document.getElementById('chat-sidebar');
                        if (chat.style.display === 'none') toggleChat();
                    };
                } else if (cat.key === 'logs') {
                    row.innerHTML = `<strong>${item.username}:</strong> <span style="font-size: 11px;">${item.content}</span>`;
                    row.onclick = () => {
                        dropdown.style.display = 'none';
                        switchView('analytics');
                        openLogsViewer();
                    };
                }
                
                dropdown.appendChild(row);
            });
        }
    });

    if (!hasResults) {
        dropdown.innerHTML = '<div style="padding: 10px; text-align: center; color: #777; font-size: 12px;">Нет совпадений</div>';
    }

    dropdown.style.display = 'block';
}

async function renameColumn(colId) {
    const input = document.getElementById(`rename-input-${colId}`);
    if (!input) return;
    const newName = input.value.trim() === '' ? 'Без названия' : input.value.trim();
    const col = activeBoardData.columns.find(c => c.id === colId);
    
    if (col && col.name !== newName) {
        const oldName = col.name;
        col.name = newName;
        await fetch(`/api/boards/${activeBoardId}/logs`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action_desc: `Изменил(а) название колонки с '${oldName}' на '${newName}'`}) });
    }
    await syncBoardSettingsToServer();
}

// 2. Логика чекпоинтов
function renderCheckpoints() {
    const list = document.getElementById('checkpoints-list');
    if (!list) return;
    list.innerHTML = '';
    
    activeTaskCheckpoints.forEach(cp => {
        const div = document.createElement('div');
        div.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-bottom: 6px;';
        div.innerHTML = `
            <input type="checkbox" ${cp.done ? 'checked' : ''} onchange="toggleCheckpoint(${cp.id})">
            <span style="flex: 1; font-size: 13px; text-decoration: ${cp.done ? 'line-through' : 'none'}; color: ${cp.done ? '#777' : '#000'};">${cp.text}</span>
            <button onclick="deleteCheckpoint(${cp.id})" style="background: none; border: none; color: #cc0000; cursor: pointer; font-size: 16px;">&times;</button>
        `;
        list.appendChild(div);
    });
}

function addCheckpoint() {
    const input = document.getElementById('new-checkpoint-input');
    const text = input.value.trim();
    if (!text) return;
    activeTaskCheckpoints.push({ id: Date.now(), text: text, done: false });
    input.value = '';
    renderCheckpoints();
}

function toggleCheckpoint(id) {
    const cp = activeTaskCheckpoints.find(c => c.id === id);
    if (cp) cp.done = !cp.done;
    renderCheckpoints();
}

function deleteCheckpoint(id) {
    activeTaskCheckpoints = activeTaskCheckpoints.filter(c => c.id !== id);
    renderCheckpoints();
}

// Хелпер генерации HTML прогресс-бара для карточек
function getCheckpointsProgressHtml(checkpointsStr) {
    try {
        const cps = checkpointsStr ? JSON.parse(checkpointsStr) : [];
        if (cps.length === 0) return '';
        const doneCount = cps.filter(c => c.done).length;
        const pct = Math.round((doneCount / cps.length) * 100);
        return `
            <div style="display: flex; align-items: center; gap: 6px; margin-right: 12px;" title="Чекпоинты">
                <div style="width: 40px; height: 6px; background: #ccc; border-radius: 3px; overflow: hidden;">
                    <div style="width: ${pct}%; height: 100%; background: #0000ff;"></div>
                </div>
                <span style="font-size: 11px; color: #555; font-weight: bold;">${doneCount}/${cps.length}</span>
            </div>
        `;
    } catch(e) {
        return '';
    }
}

function initDropzoneTooltips() {
    const tooltip = document.getElementById('drag-tooltip');
    if (!tooltip) return;

    const zones = [
        { id: 'dropzone-backlog', text: 'Перенести в Бэклог' },
        { id: 'dropzone-archive', text: 'Перенести в Архив' }
    ];

    zones.forEach(z => {
        const el = document.getElementById(z.id);
        if (!el) return;

        // Обработка обычного наведения (без перетаскивания)
        el.addEventListener('mousemove', (e) => {
            tooltip.innerText = z.text;
            tooltip.style.display = 'block';
            tooltip.style.left = e.pageX + 'px';
            tooltip.style.top = (e.pageY - 15) + 'px';

            if (isDraggingTask) {
                el.classList.add('drag-active');
            }
        });

        el.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
            el.classList.remove('drag-active');
        });

        // Обработка наведения в процессе активного перетаскивания (Drag & Drop)
        el.addEventListener('dragover', (e) => {
            e.preventDefault(); // Обязательно для разрешения drop и отключения блокирующего курсора
            tooltip.innerText = z.text;
            tooltip.style.display = 'block';
            tooltip.style.left = e.pageX + 'px';
            tooltip.style.top = (e.pageY - 15) + 'px';

            if (isDraggingTask) {
                el.classList.add('drag-active');
            }
        });

        el.addEventListener('dragleave', (e) => {
            tooltip.style.display = 'none';
            el.classList.remove('drag-active');
        });

        el.addEventListener('drop', () => {
            tooltip.style.display = 'none';
            el.classList.remove('drag-active');
        });
    });
}


async function restoreTaskFromArchive(taskId, columnId) {
    await fetch(`/api/tasks/${taskId}/restore`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: columnId })
    });
    
    document.getElementById('board-column-select').style.display = 'none';
    closeModal();
    await loadTasks();
    if (document.getElementById('analytics-archive-view').style.display === 'block') {
        await window.openArchiveViewer();
    }
}

// Функция-обработчик тумблера боковых панелей
window.toggleBoardDropzones = async function() {
    if (!activeBoardData) return;
    const isEnabled = document.getElementById('board-dropzones-toggle').checked ? 1 : 0;
    activeBoardData.dropzones_enabled = isEnabled;
    const actionDesc = isEnabled ? 'Включил(а) боковые зоны' : 'Отключил(а) боковые зоны';
    await fetch(`/api/boards/${activeBoardId}/logs`, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({action_desc: actionDesc}) });
    await syncBoardSettingsToServer();
};

// Функция переключения видимости боковых зон
window.applyDropzonesVisibility = function() {
    const dzLeft = document.getElementById('dropzone-backlog');
    const dzRight = document.getElementById('dropzone-archive');
    const isEnabled = activeBoardData && activeBoardData.dropzones_enabled !== 0; 
    
    if (!isEnabled) {
        if (dzLeft) dzLeft.style.display = 'none';
        if (dzRight) dzRight.style.display = 'none';
    } else {
        if (dzLeft) dzLeft.style.display = 'flex';
        if (dzRight) dzRight.style.display = 'flex';
    }
};

window.setModalDateFields = function(dateStr, dateId, timeId) {
    if (dateStr) {
        const parts = dateStr.split('T');
        document.getElementById(dateId).value = parts[0];
        document.getElementById(timeId).value = parts.length > 1 ? parts[1] : '00:00';
    } else {
        document.getElementById(dateId).value = '';
        document.getElementById(timeId).value = '00:00';
    }
};

window.getModalDateString = function(dateId, timeId) {
    const dateVal = document.getElementById(dateId).value;
    const timeVal = document.getElementById(timeId).value || '00:00';
    return dateVal ? `${dateVal}T${timeVal}` : '';
};

window.toggleScrollMode = function() {
    const scrollToggle = document.getElementById('board-scroll-toggle');
    if (!scrollToggle) return;
    
    const isEnabled = scrollToggle.checked;
    if (isEnabled) {
        document.body.classList.add('global-scroll-mode');
        localStorage.setItem('kanban-global-scroll', 'true');
    } else {
        document.body.classList.remove('global-scroll-mode');
        localStorage.setItem('kanban-global-scroll', 'false');
    }
};

window.applyScrollModeSetting = function() {
    const scrollToggle = document.getElementById('board-scroll-toggle');
    if (!scrollToggle) return;
    
    const isEnabled = localStorage.getItem('kanban-global-scroll') === 'true';
    scrollToggle.checked = isEnabled;
    if (isEnabled) {
        document.body.classList.add('global-scroll-mode');
    } else {
        document.body.classList.remove('global-scroll-mode');
    }
};

window.updateCharCounter = function() {
    const descriptionInput = document.getElementById('modal-description');
    const counterSpan = document.getElementById('char-counter');
    
    if (!descriptionInput || !counterSpan) return;
    
    const maxLength = 3000;
    const currentLength = descriptionInput.value.length;
    const remaining = maxLength - currentLength;
    
    // Обновляем текст счетчика
    counterSpan.textContent = remaining;
    
    // Если осталось 0 символов (или меньше, на случай непредвиденного обхода), красим в красный
    if (remaining <= 0) {
        counterSpan.style.color = '#cc0000';
    } else {
        counterSpan.style.color = ''; // Возвращаем стандартный цвет, если текст стерли
    }
};