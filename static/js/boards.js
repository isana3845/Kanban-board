// ─── ДОСКИ ──────────────────────────────────────────────────────────────────

function getDefaultColumns() {
    return [
        { id: 'todo',        name: 'В планах',      wip_limit: 0, archived: false },
        { id: 'in_progress', name: 'В разработке',  wip_limit: 0, archived: false },
        { id: 'done',        name: 'Готово',         wip_limit: 0, archived: false }
    ];
}

// ── Загрузка и рендер папок ──────────────────────────────────────────────────

async function loadBoards() {
    if (isGuest) return;
    try {
        const res = await fetch('/api/boards');
        if (!res.ok) {
            if (res.status === 401) { showLogin(); return; }
            console.error('Ошибка загрузки досок:', res.status);
            currentBoards = [];
            renderFolders();
            return;
        }
        const data = await res.json();
        currentBoards = Array.isArray(data) ? data : [];
        renderFolders();
    } catch (err) {
        console.error('Ошибка загрузки досок:', err);
        currentBoards = [];
        renderFolders();
    }
}

function renderFolders() {
    const grid = document.getElementById('folders-grid-container');
    if (!grid) return;
    grid.innerHTML = '';
    if (isGuest) return;

    currentBoards.forEach(b => {
        const d = document.createElement('div');
        d.className = 'folder-item';
        if (activeBoardId === b.id) d.classList.add('active');
        d.innerHTML = `
            <div class="folder-icon"></div>
            <div class="folder-name">${b.title}</div>
        `;
        d.onclick = () => selectBoard(b);
        grid.appendChild(d);
    });
}

async function promptCreateBoard() {
    if (isGuest) return showLogin();
    const t = prompt('Введите название доски:');
    if (t) {
        await fetch('/api/boards', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: t })
        });
        loadBoards();
    }
}

// ── Выбор доски ──────────────────────────────────────────────────────────────

function selectBoard(board) {
    if (isGuest) return showLogin();

    activeBoardId   = board.id;
    activeBoardData = board;
    document.getElementById('main-board-title').innerText = board.title;

    const editBtn = document.getElementById('edit-board-title-btn');
    if (editBtn) editBtn.style.display = 'block';

    try {
        activeBoardData.columns = board.columns_data ? JSON.parse(board.columns_data) : getDefaultColumns();
    } catch (e) {
        activeBoardData.columns = [];
    }

    document.getElementById('board-dropzones-toggle').checked = board.dropzones_enabled !== 0;
    if (window.applyScrollModeSetting) window.applyScrollModeSetting();

    applyDropzonesVisibility();
    switchView('board');
    renderColumns();
    loadTasks();
    loadMembers();
    loadChatMessages();

    const mentorFooter = document.getElementById('mentor-footer');
    if (mentorFooter) mentorFooter.style.display = isMentor() ? 'flex' : 'none';

    document.querySelectorAll('.toolbar > .chat-toggle-btn').forEach(el => {
        el.style.display = isMentor() ? 'none' : '';
    });

    connectBoardSocket(board.id);

    const deleteBtn = document.getElementById('delete-board-btn');
    if (deleteBtn) deleteBtn.style.display = (board.owner_username === activeUser.username) ? 'block' : 'none';

    setTimeout(applyRoleRestrictions, 100);
}

// ── WebSocket доски ──────────────────────────────────────────────────────────

function connectBoardSocket(boardId) {
    if (boardSocket) boardSocket.close();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    boardSocket = new WebSocket(`${protocol}//${window.location.host}/ws/boards/${boardId}`);

    boardSocket.onmessage = async function (event) {
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
                        activeBoardData.columns = updatedBoard.columns_data
                            ? JSON.parse(updatedBoard.columns_data)
                            : getDefaultColumns();
                    } catch (e) {
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
}

// ── Настройки и синхронизация ────────────────────────────────────────────────

window.syncBoardSettingsToServer = async function () {
    if (!activeBoardData) return;

    activeBoardData.columns.forEach(c => {
        if (!c.archived) {
            const nameInput = document.getElementById(`rename-input-${c.id}`);
            const wipInput  = document.getElementById(`wip-input-${c.id}`);
            if (nameInput) c.name      = nameInput.value.trim() === '' ? 'Без названия' : nameInput.value.trim();
            if (wipInput)  c.wip_limit = parseInt(wipInput.value) || 0;
        }
    });

    activeBoardData.columns_data = JSON.stringify(activeBoardData.columns);

    const payload = {
        wip_enabled:       1,
        dropzones_enabled: activeBoardData.dropzones_enabled !== 0 ? 1 : 0,
        columns_data:      activeBoardData.columns_data
    };

    await fetch(`/api/boards/${activeBoardId}/settings`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload)
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

async function renameCurrentBoard() {
    if (!activeBoardId || !activeBoardData) return;

    const currentTitle = activeBoardData.title;
    let newTitle = prompt('Введите новое название доски:', currentTitle);
    if (newTitle === null) return;
    newTitle = newTitle.trim();
    if (newTitle === '') newTitle = 'Без названия';
    if (newTitle === currentTitle) return;

    const res = await fetch(`/api/boards/${activeBoardId}/title`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ title: newTitle })
    });

    if (res.ok) {
        activeBoardData.title = newTitle;
        document.getElementById('main-board-title').innerText = newTitle;
        loadBoards();
    }
}

async function deleteCurrentBoard() {
    if (!activeBoardId) return;

    const board      = activeBoardData || currentBoards.find(b => b.id === Number(activeBoardId) || b.id === activeBoardId);
    const boardTitle = board ? board.title : 'текущую доску';

    if (!confirm(`Удалить доску "${boardTitle}" без возможности восстановления?`)) return;

    const res = await fetch(`/api/boards/${activeBoardId}`, { method: 'DELETE' });

    if (res.ok) {
        activeBoardId   = null;
        activeBoardData = null;
        if (boardSocket) boardSocket.close();
        switchView('folders');
        loadBoards();
    }
}

async function leaveCurrentBoard() {
    if (!activeBoardId) { alert('Активная доска не выбрана'); return; }

    const board      = activeBoardData || currentBoards.find(b => b.id === Number(activeBoardId) || b.id === activeBoardId);
    const boardTitle = board ? board.title : 'текущую доску';
    const isOwner    = board && activeUser && activeUser.username === board.owner_username;

    let payload = {};
    if (isOwner) {
        const newOwner = prompt(`Вы являетесь владельцем доски "${boardTitle}". Введите имя пользователя для передачи прав:`);
        if (!newOwner) return;
        payload.new_owner = newOwner.trim();
    } else {
        if (!confirm(`Вы уверены, что хотите покинуть доску "${boardTitle}"?`)) return;
    }

    const res = await fetch(`/api/boards/${activeBoardId}/leave`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload)
    });

    if (res.ok) {
        alert(`Вы вышли из доски "${boardTitle}"`);
        activeBoardId   = null;
        activeBoardData = null;
        switchView('folders');
        loadBoards();
    } else {
        const err = await res.json();
        alert(err.detail || 'Ошибка при выходе из доски');
    }
}

// ── Настройки видимости и скролла ────────────────────────────────────────────

function applyBoardSettingsToUI() {
    if (!activeBoardData) return;

    document.getElementById('title-todo').innerText        = activeBoardData.col_todo_name        || 'В планах';
    document.getElementById('title-in_progress').innerText = activeBoardData.col_in_progress_name || 'В разработке';
    document.getElementById('title-done').innerText        = activeBoardData.col_done_name        || 'Готово';

    document.getElementById('rename-input-todo').value        = activeBoardData.col_todo_name        || 'В планах';
    document.getElementById('rename-input-in_progress').value = activeBoardData.col_in_progress_name || 'В разработке';
    document.getElementById('rename-input-done').value        = activeBoardData.col_done_name        || 'Готово';

    document.getElementById('wip-input-todo').value        = activeBoardData.wip_todo        || 0;
    document.getElementById('wip-input-in_progress').value = activeBoardData.wip_in_progress || 0;
    document.getElementById('wip-input-done').value        = activeBoardData.wip_done        || 0;
    document.getElementById('board-wip-toggle').checked    = !!activeBoardData.wip_enabled;
}

window.toggleBoardDropzones = async function () {
    if (!activeBoardData) return;
    const isEnabled   = document.getElementById('board-dropzones-toggle').checked ? 1 : 0;
    activeBoardData.dropzones_enabled = isEnabled;
    const actionDesc  = isEnabled ? 'Включил(а) боковые зоны' : 'Отключил(а) боковые зоны';
    await fetch(`/api/boards/${activeBoardId}/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_desc: actionDesc })
    });
    await syncBoardSettingsToServer();
};

window.applyDropzonesVisibility = function () {
    const dzLeft    = document.getElementById('dropzone-backlog');
    const dzRight   = document.getElementById('dropzone-archive');
    const isEnabled = activeBoardData && activeBoardData.dropzones_enabled !== 0;

    if (dzLeft)  dzLeft.style.display  = isEnabled ? 'flex' : 'none';
    if (dzRight) dzRight.style.display = isEnabled ? 'flex' : 'none';
};

window.toggleScrollMode = function () {
    const scrollToggle = document.getElementById('board-scroll-toggle');
    if (!scrollToggle) return;
    const isEnabled = scrollToggle.checked;
    document.body.classList.toggle('global-scroll-mode', isEnabled);
    localStorage.setItem('kanban-global-scroll', isEnabled ? 'true' : 'false');
};

window.applyScrollModeSetting = function () {
    const scrollToggle = document.getElementById('board-scroll-toggle');
    if (!scrollToggle) return;
    const isEnabled = localStorage.getItem('kanban-global-scroll') === 'true';
    scrollToggle.checked = isEnabled;
    document.body.classList.toggle('global-scroll-mode', isEnabled);
};
