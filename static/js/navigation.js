// ─── НАВИГАЦИЯ / ПЕРЕКЛЮЧЕНИЕ ВИДОВ ─────────────────────────────────────────

function _switchViewOnly(view) {
    // 1. Управляем классом analytics-mode для изоляции стилей Ганта
    if (view === 'analytics') {
        document.body.classList.add('analytics-mode');
    } else {
        document.body.classList.remove('analytics-mode');
    }

    // 2. Переключаем основные виды
    document.getElementById('view-kanban').style.display    = view === 'board'     ? 'flex'   : 'none';
    document.getElementById('view-folders').style.display   = view === 'folders'   ? 'flex'   : 'none';
    document.getElementById('view-analytics').style.display = view === 'analytics' ? 'block'  : 'none';
    document.getElementById('view-settings').style.display  = view === 'settings'  ? 'block'  : 'none';

    document.getElementById('menu-to-board').classList.toggle('active',     view === 'board');
    document.getElementById('menu-to-folders').classList.toggle('active',   view === 'folders');
    document.getElementById('menu-to-analytics').classList.toggle('active', view === 'analytics');
    document.getElementById('menu-to-settings').classList.toggle('active',  view === 'settings');

    const hasBoard = !!activeBoardId;
    const actions  = document.getElementById('user-board-actions');
    const noMsg    = document.getElementById('user-no-board-msg');
    if (actions) actions.style.display = hasBoard ? 'block' : 'none';
    if (noMsg)   noMsg.style.display   = hasBoard ? 'none'  : 'block';

    if (view === 'folders') loadBoards();
}

function switchView(view) {
    // ✅ Сброс флага при любом переключении вида
    window.isDraggingActive = false;
    
    sessionStorage.setItem('kanban-view', view);
    if (activeBoardId) sessionStorage.setItem('kanban-board-id', activeBoardId);

    _switchViewOnly(view);

    if (!activeBoardId) updateProjectProgress();
    if (view === 'analytics' && activeBoardId) loadLogs();
}

// Вспомогательная функция для скрытия всех подвью аналитики
function closeAllAnalyticsSubViews() {
    const subviews = ['logs', 'archive', 'backlog', 'gantt'];
    subviews.forEach(type => {
        const el = document.getElementById(`analytics-${type}-view`);
        if (el) el.style.display = 'none';
    });
    
    const foldersGrid = document.querySelector('#view-analytics .folders-grid');
    if (foldersGrid) foldersGrid.style.display = 'grid';
}

function initListeners() {
    initSearchListener();

    document.getElementById('menu-to-board').onclick = () => {
        if (activeBoardId) switchView('board');
        else alert('Выберите доску в меню папок.');
    };

    document.getElementById('menu-to-folders').onclick = () => switchView('folders');

    document.getElementById('menu-to-analytics').onclick = () => {
        if (!activeBoardId) { alert('Выберите доску в меню папок.'); return; }
        
        // Сброс подвью перед показом главного меню аналитики
        closeAllAnalyticsSubViews();
        switchView('analytics');
    };

    document.getElementById('menu-to-settings').onclick = () => {
        if (activeBoardId) switchView('settings');
        else alert('Выберите доску в меню папок.');
    };

    const descInput = document.getElementById('modal-description');
    if (descInput) descInput.addEventListener('input', window.updateCharCounter);

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