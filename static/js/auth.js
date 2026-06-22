// ─── АУТЕНТИФИКАЦИЯ ─────────────────────────────────────────────────────────

async function checkAuth() {
    try {
        const res = await fetch('/api/auth/me');
        if (res.status === 401) { handleGuest(); return; }
        if (res.ok) {
            const userData = await res.json();
            selectedRole = 'student';
            handleLoginRestore(userData);
        } else {
            handleGuest();
        }
    } catch (err) {
        handleGuest();
    }
}

async function handleLoginRestore(userData) {
    userData.role = 'student';
    activeUser = userData;
    isGuest = false;

    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-content').style.display = 'flex';
    document.getElementById('user-display-name').innerText = userData.username;
    document.getElementById('header-username-text').innerText = userData.username;

    updateUserRoleDisplay('student');

    const savedView = sessionStorage.getItem('kanban-view') || 'folders';
    const savedBoardId = sessionStorage.getItem('kanban-board-id');

    let board = null;
    try {
        const res = await fetch('/api/boards');
        if (res.ok) {
            const boards = await res.json();
            currentBoards = Array.isArray(boards) ? boards : [];
            if (savedBoardId) {
                board = currentBoards.find(b => String(b.id) === String(savedBoardId)) || null;
            }
        }
    } catch (e) { /* network error — переходим к папкам */ }

    if (board && savedView !== 'folders') {
        activeBoardId = board.id;
        activeBoardData = board;
        document.getElementById('main-board-title').innerText = board.title;

        const editBtn = document.getElementById('edit-board-title-btn');
        if (editBtn) editBtn.style.display = 'block';

        try {
            activeBoardData.columns = board.columns_data ? JSON.parse(board.columns_data) : getDefaultColumns();
        } catch (e) { activeBoardData.columns = []; }

        document.getElementById('board-dropzones-toggle').checked = board.dropzones_enabled !== 0;
        if (window.applyScrollModeSetting) window.applyScrollModeSetting();
        applyDropzonesVisibility();
        renderColumns();
        loadTasks();
        loadMembers();
        loadChatMessages();

        const deleteBtn = document.getElementById('delete-board-btn');
        if (deleteBtn) deleteBtn.style.display = (board.owner_username === activeUser.username) ? 'block' : 'none';

        connectBoardSocket(board.id);
        setTimeout(() => {
            applyRoleRestrictions();
        }, 300);
        _switchViewOnly(savedView);
    } else {
        applyRoleRestrictions();
        _switchViewOnly('folders');
    }
}

function showLogin() {
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('app-content').style.display = 'none';
}

async function loginUser() {
    const username = document.getElementById('auth-username').value.trim();
    if (!username) return;

    const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, role: selectedRole })
    });
    if (res.ok) {
        const userData = await res.json();
        handleLogin(userData);
    }
}

async function logoutUser() {
    await fetch('/api/auth/logout', { method: 'POST' });
    location.reload();
}

function handleGuest() {
    activeUser = null;
    isGuest = true;
    currentBoards = [];

    const roleDisplay = document.getElementById('user-role-display');
    if (roleDisplay) roleDisplay.style.display = 'none';

    showLogin();
}

function handleLogin(userData) {
    userData.role = 'student';
    activeUser = userData;
    isGuest = false;

    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app-content').style.display = 'flex';
    document.getElementById('user-display-name').innerText = userData.username;
    document.getElementById('header-username-text').innerText = userData.username;

    if (userData.role) {
        selectedRole = userData.role;
        updateUserRoleDisplay(userData.role);
    } else {
        updateUserRoleDisplay('student');
    }

    switchView('folders');
}
