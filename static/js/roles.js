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
    modalButtons:   '#btn-to-archive, #btn-to-backlog, .btn-save',
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

    // Обновляем Sortable
    if (columnSortable) {
        columnSortable.option('disabled', dragState.disabled);
    }
    
    document.querySelectorAll(SELECTORS.cardsDropzones).forEach(el => {
        if (el.sortableInstance) {
            el.sortableInstance.option('disabled', dragState.disabled);
        }
    });
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

    // btn-restore-board исключена из общего сброса: её видимость зависит от контекста
    // (доска / архив / бэклог), который выставляется в modal.js и analytics.js.
    // Для наставника кнопка всегда скрыта, для студента — не трогаем текущее состояние.
    if (mentor) {
        const restoreBtn = document.getElementById('btn-restore-board');
        if (restoreBtn) restoreBtn.style.display = 'none';
    }

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

// Сохраняем оригинальные функции ДО переопределения
const _originalOpenModalForEdit = window.openModalForEdit;
const _originalOpenModalForCreate = window.openModalForCreate;
const _originalOpenModalForArchived = window.openModalForArchived;
const _originalOpenModalForBacklog = window.openModalForBacklog;

// Переопределяем с сохранением оригинального поведения
window.openModalForEdit = function (...args) {
    if (isMentor()) {
        // Для наставника — открываем в режиме просмотра
        const result = _originalOpenModalForEdit?.apply(this, args);
        setTimeout(applyModalRestrictions, 50);
        return result;
    }
    const result = _originalOpenModalForEdit?.apply(this, args);
    setTimeout(applyModalRestrictions, 50);
    return result;
};

window.openModalForCreate = function (...args) {
    if (isMentor()) {
        alert('Наставник не может создавать задачи');
        return;
    }
    const result = _originalOpenModalForCreate?.apply(this, args);
    setTimeout(applyModalRestrictions, 50);
    return result;
};

window.openModalForArchived = function (...args) {
    const result = _originalOpenModalForArchived?.apply(this, args);
    setTimeout(applyModalRestrictions, 50);
    return result;
};

window.openModalForBacklog = function (...args) {
    const result = _originalOpenModalForBacklog?.apply(this, args);
    setTimeout(applyModalRestrictions, 50);
    return result;
};

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
