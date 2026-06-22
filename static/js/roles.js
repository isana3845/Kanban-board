// ─── РОЛИ ПОЛЬЗОВАТЕЛЕЙ ─────────────────────────────────────────────────────

const isMentor  = () => activeUser?.role === 'mentor';
const isStudent = () => !isMentor();
const canEdit     = isStudent;
const canViewOnly = isMentor;

// CSS-селекторы элементов интерфейса, зависящих от роли
const SELECTORS = {
    createButtons:  '.btn-create-board, .chat-toggle-btn[onclick*="createNewColumn"], .chat-toggle-btn[onclick*="openModalForCreate"], .chat-toggle-btn[onclick*="toggleColumnMenu"]',
    columnControls: '.column-controls button, .drag-handle',
    sideDropzones:  '.side-dropzone',
    modalButtons:   '#btn-to-archive, #btn-to-backlog, #btn-restore-board, .btn-save',
    archiveButtons: '.archive-modal-delete, .archive-modal-restore, button[onclick*="clearArchive"]',
    backlogCreate:  '.backlog-create-btn',
    memberControls: '#new-member-name, button[onclick*="addMember"], .member-item button',
    settingsCards:  '.settings-card',
    taskCards:      '.task-card',
    cardsDropzones: '.cards-dropzone',
};

function selectRole(role) {
    selectedRole = role;
    document.querySelectorAll('.role-btn').forEach(el => el.classList.remove('selected'));
    document.getElementById(`role-${role}-btn`).classList.add('selected');
}

function updateUserRoleDisplay(role) {
    const roleDisplay = document.getElementById('user-role-display');
    if (!roleDisplay) return;

    const labels = { mentor: 'Наставник', student: 'Студент' };
    roleDisplay.textContent   = labels[role] || 'Студент';
    roleDisplay.style.display = 'inline-block';
}

function applyRoleRestrictions() {
    const mentor = isMentor();
    document.body.classList.toggle('mentor-mode', mentor);

    const toggleDisplay = (selector, hide) => {
        document.querySelectorAll(selector).forEach(el => el.style.display = hide ? 'none' : '');
    };

    toggleDisplay(SELECTORS.createButtons,  mentor);
    toggleDisplay(SELECTORS.columnControls, mentor);
    toggleDisplay(SELECTORS.sideDropzones,  mentor);
    toggleDisplay(SELECTORS.modalButtons,   mentor);
    toggleDisplay(SELECTORS.archiveButtons, mentor);
    toggleDisplay(SELECTORS.backlogCreate,  mentor);
    toggleDisplay(SELECTORS.memberControls, mentor);
    toggleDisplay('#delete-board-btn, button[onclick*="deleteCurrentBoard"]', mentor);
    toggleDisplay(SELECTORS.settingsCards,  mentor);

    const dragState = mentor
        ? { cursor: 'default', draggable: false, disabled: true }
        : { cursor: 'grab',    draggable: true,  disabled: false };

    const mentorFooter = document.getElementById('mentor-footer');
    if (mentorFooter) mentorFooter.style.display = mentor ? 'flex' : 'none';

    document.querySelectorAll('.toolbar > .chat-toggle-btn').forEach(el => {
        el.style.display = mentor ? 'none' : '';
    });

    document.querySelectorAll(SELECTORS.taskCards).forEach(el => {
        el.style.cursor = dragState.cursor;
        el.draggable    = dragState.draggable;
    });

    [columnSortable, ...document.querySelectorAll(SELECTORS.cardsDropzones).map(el => el.sortableInstance)]
        .forEach(instance => { if (instance) instance.option('disabled', dragState.disabled); });

    renderBoardCards();
}

// ── Ограничения для модального окна ─────────────────────────────────────────

function applyModalRestrictions() {
    const mentor = isMentor();

    ['modal-title', 'modal-assignee', 'modal-description'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.readOnly = mentor;
    });

    ['modal-priority', 'modal-date', 'modal-time', 'modal-start-date', 'modal-start-time'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = mentor;
    });

    document.querySelectorAll(SELECTORS.modalButtons).forEach(el => el.style.display = mentor ? 'none' : '');

    const checkpointsSection = document.querySelector('.checkpoints-section');
    if (checkpointsSection) checkpointsSection.style.display = mentor ? 'none' : '';

    const statusContainer = document.getElementById('modal-status-container');
    const locationEl      = document.getElementById('modal-location');
    if (mentor) {
        if (statusContainer) statusContainer.style.display = 'none';
        if (locationEl) { locationEl.style.display = 'block'; locationEl.innerText = 'Просмотр'; }
    } else {
        if (statusContainer) statusContainer.style.display = 'flex';
        if (locationEl)      locationEl.style.display      = 'none';
    }
}

// ── Обёртки для функций, открывающих модалки ─────────────────────────────────

function wrapModalFunction(originalFn, applyRestrictions) {
    return function (...args) {
        const result = originalFn?.apply(this, args);
        setTimeout(applyRestrictions, 50);
        return result;
    };
}

window.openModalForEdit     = wrapModalFunction(window.openModalForEdit,     applyModalRestrictions);
window.openModalForCreate   = wrapModalFunction(window.openModalForCreate,   applyModalRestrictions);
window.openModalForArchived = wrapModalFunction(window.openModalForArchived, applyModalRestrictions);
window.openModalForBacklog  = wrapModalFunction(window.openModalForBacklog,  applyModalRestrictions);

// ── Сброс ограничений при закрытии модалки ───────────────────────────────────

const originalCloseModal = window.closeModal;
window.closeModal = function () {
    originalCloseModal?.();

    ['modal-title', 'modal-assignee', 'modal-description'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.readOnly = false;
    });

    ['modal-priority', 'modal-date', 'modal-time', 'modal-start-date', 'modal-start-time'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.disabled = false;
    });
};

// ── Перехват login / selectBoard / renderColumns / renderBoardCards ───────────

const originalHandleLogin = window.handleLogin;
window.handleLogin = function (userData) {
    if (!userData.role) userData.role = selectedRole;

    activeUser = userData;
    isGuest    = false;

    document.getElementById('auth-screen').style.display    = 'none';
    document.getElementById('app-content').style.display    = 'flex';
    document.getElementById('user-display-name').innerText  = userData.username;
    document.getElementById('header-username-text').innerText = userData.username;

    selectedRole = userData.role || 'student';
    updateUserRoleDisplay(selectedRole);
    applyRoleRestrictions();
    switchView('folders');
};

const originalSelectBoard = window.selectBoard;
window.selectBoard = function (board) {
    if (isGuest) return showLogin();

    activeBoardId   = board.id;
    activeBoardData = board;
    document.getElementById('main-board-title').innerText = board.title;

    const editBtn = document.getElementById('edit-board-title-btn');
    if (editBtn) editBtn.style.display = 'block';

    try {
        activeBoardData.columns = board.columns_data ? JSON.parse(board.columns_data) : getDefaultColumns();
    } catch {
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
    deleteBtn.style.display = (board.owner_username === activeUser.username) ? 'block' : 'none';

    setTimeout(applyRoleRestrictions, 100);
};

const originalRenderColumns = window.renderColumns;
window.renderColumns = function () {
    originalRenderColumns?.();
    setTimeout(applyRoleRestrictions, 50);
};

const originalRenderBoardCards = window.renderBoardCards;
window.renderBoardCards = function () {
    originalRenderBoardCards?.();
    setTimeout(applyRoleRestrictions, 50);
};
