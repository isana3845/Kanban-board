// ─── АНАЛИТИКА ──────────────────────────────────────────────────────────────

// ── Журнал действий ──────────────────────────────────────────────────────────

async function loadLogs() {
    if (!activeBoardId) return;
    const res = await fetch(`/api/boards/${activeBoardId}/logs`);
    if (res.ok) {
        const logs = await res.json();
        renderLogs(logs);
    }
}

function renderLogs(logs) {
    const container   = document.getElementById('analytics-logs-list');
    container.innerHTML = '';

    if (logs.length === 0) {
        container.innerHTML = '<div class="log-item">Нет зафиксированных действий.</div>';
        return;
    }

    logs.forEach(log => {
        const div     = document.createElement('div');
        div.className = 'log-item';
        div.innerHTML = `
            <span class="log-time">${log.created_at}</span>
            <span class="log-user">${log.username}</span>
            <span class="log-action">${log.action_desc}</span>
        `;
        container.appendChild(div);
    });
}

function openLogsViewer() {
    document.querySelector('#view-analytics .folders-grid').style.display = 'none';
    document.getElementById('analytics-logs-view').style.display          = 'block';
    loadLogs();
}

function closeLogsViewer() {
    document.querySelector('#view-analytics .folders-grid').style.display = 'grid';
    document.getElementById('analytics-logs-view').style.display          = 'none';
}

// ── Архив задач ──────────────────────────────────────────────────────────────

window.openArchiveViewer = async function () {
    if (!activeBoardId) return;

    const res = await fetch(`/api/boards/${activeBoardId}/archive`);
    if (!res.ok) return;

    const tasks = await res.json();
    renderArchivedColumnsList();

    const list = document.getElementById('archive-tasks-list');
    if (list) {
        list.innerHTML = '';
        tasks.forEach(task => {
            const card      = document.createElement('div');
            card.className  = 'task-card';
            card.dataset.id = task.id;

            const dateStr       = task.date
                ? new Date(task.date).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                : '—';

            card.innerHTML = `
                <div class="card-top"><span>${task.title}</span></div>
                <div class="card-meta-info">
                    <div>👤 ${task.assignee || '—'}</div>
                    <div>📅 ${dateStr}</div>
                    <div>
                        <button onclick="deleteTaskPermanent(${task.id}, event)"
                            style="color: red; border: none; background: none; font-size: 16px; cursor: pointer; padding: 0;"
                            title="Удалить навсегда">✖</button>
                    </div>
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

window.closeArchiveViewer = function () {
    document.querySelector('#view-analytics .folders-grid').style.display = 'grid';
    document.getElementById('analytics-archive-view').style.display       = 'none';
};

window.clearArchive = async function () {
    if (!activeBoardId) return;
    if (!confirm('Удалить весь архив без возможности восстановления?')) return;

    const res = await fetch(`/api/boards/${activeBoardId}/archive`, { method: 'DELETE' });
    if (!res.ok) { alert('Ошибка очистки архива'); return; }

    document.getElementById('archive-tasks-list').innerHTML = '';
};

window.deleteTaskPermanent = async function (taskId, event) {
    event.stopPropagation();
    if (!confirm('Удалить эту задачу навсегда?')) return;
    const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    if (res.ok) await window.openArchiveViewer();
    else alert('Ошибка удаления задачи');
};

// ── Архивные колонки ─────────────────────────────────────────────────────────

function renderArchivedColumnsList() {
    let container = document.getElementById('archive-columns-list');
    if (!container) {
        const listContainer = document.getElementById('archive-tasks-list').parentNode;
        const colSection    = document.createElement('div');
        colSection.innerHTML = `
            <h3 style="margin:20px 0 10px; border-bottom:2px solid #0000ff; padding-bottom:5px;">Архив колонок</h3>
            <div id="archive-columns-list" style="display:flex; flex-wrap:wrap; gap:16px;"></div>
            <h3 style="margin:20px 0 10px; border-bottom:2px solid #0000ff; padding-bottom:5px;">Архив задач</h3>
        `;
        listContainer.insertBefore(colSection, document.getElementById('archive-tasks-list'));
        container = document.getElementById('archive-columns-list');
    }
    container.innerHTML = '';

    const archivedCols = activeBoardData.columns.filter(c => c.archived);
    archivedCols.forEach(col => {
        const card          = document.createElement('div');
        card.className      = 'task-card';
        card.style.cursor   = 'pointer';
        card.style.width    = '320px';
        card.innerHTML      = `<div style="font-weight:bold; text-align:center;">📦 ${col.name}</div>`;
        card.onclick        = () => openArchivedColumnModal(col.id);
        container.appendChild(card);
    });
}

function openArchivedColumnModal(colId) {
    currentArchivedColId = colId;
    const col            = activeBoardData.columns.find(c => c.id === colId);
    document.getElementById('archived-col-modal-name').innerText = col.name;

    const tasksContainer  = document.getElementById('archived-col-tasks');
    tasksContainer.innerHTML = '';

    const colTasks = currentTasks.filter(t => t.status === colId && t.archived === 0);
    colTasks.forEach(task => {
        const card      = document.createElement('div');
        card.className  = 'task-card';
        card.dataset.id = task.id;

        const dateStr = task.date
            ? new Date(task.date).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
            : '—';

        card.innerHTML = `
            <div class="card-top"><span>${task.title}</span></div>
            <div class="card-meta-info"><div>👤 ${task.assignee || '—'}</div><div>📅 ${dateStr}</div></div>
        `;
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
        col.archived        = false;
        activeBoardData.columns = activeBoardData.columns.filter(c => c.id !== col.id);
        activeBoardData.columns.push(col);
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

// ── Открытие задачи из архива в модалке ──────────────────────────────────────

window.openModalForArchived = function (task) {
    currentOpenedTask = task;
    editingTaskId     = task.id;

    document.getElementById('modal-title').value       = task.title;
    document.getElementById('modal-assignee').value    = task.assignee || '';
    setModalDateFields(task.date,       'modal-date',       'modal-time');
    setModalDateFields(task.start_date, 'modal-start-date', 'modal-start-time');

    document.getElementById('modal-priority').value    = task.priority    || 'Средняя';
    document.getElementById('modal-description').value = task.description || '';
    document.getElementById('modal-location').innerText = 'Архив';
    document.getElementById('modal-logs').innerHTML    =
        `<strong>${task.creator}</strong> создал(а) задачу: <span>${task.created_at || '—'}</span>`;

    document.getElementById('modal-status-container').style.display = 'none';
    document.getElementById('modal-location').style.display         = 'block';
    document.getElementById('modal-link-task-btn').style.display    = 'inline-block';
    document.getElementById('modal-comments-section').style.display = 'none';

    const commentsList = document.getElementById('task-comments-list');
    if (commentsList) commentsList.innerHTML = '';
    const commentInput = document.getElementById('task-comment-input');
    if (commentInput)  commentInput.value    = '';

    loadTaskComments(task.id);

    try {
        activeTaskCheckpoints = task.checkpoints ? JSON.parse(task.checkpoints) : [];
    } catch (e) {
        activeTaskCheckpoints = [];
    }
    renderCheckpoints();

    document.getElementById('btn-to-archive').textContent           = 'В архив';
    document.getElementById('btn-to-archive').style.display         = 'none';
    document.getElementById('btn-to-backlog').style.display         = 'block';
    document.getElementById('btn-restore-board').style.display      = 'block';
    document.getElementById('btn-restore-board').onclick            = window.toggleBoardColumnSelect;

    window.updateCharCounter();
    document.getElementById('task-modal').style.display = 'block';
};

async function restoreTaskFromArchive(taskId, columnId) {
    await fetch(`/api/tasks/${taskId}/restore`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: columnId })
    });
    document.getElementById('board-column-select').style.display = 'none';
    closeModal();
    await loadTasks();
    if (document.getElementById('analytics-archive-view').style.display === 'block') {
        await window.openArchiveViewer();
    }
}

// ── Бэклог ───────────────────────────────────────────────────────────────────

window.openBacklogViewer = async function () {
    if (!activeBoardId) return;

    const res = await fetch(`/api/boards/${activeBoardId}/backlog`);
    if (!res.ok) return;

    const tasks = await res.json();
    const list  = document.getElementById('backlog-tasks-list');

    if (list) {
        list.innerHTML = '';
        tasks.forEach(task => {
            const card      = document.createElement('div');
            card.className  = 'task-card';
            card.dataset.id = task.id;

            const dateStr = task.date
                ? new Date(task.date).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
                : '—';

            card.innerHTML = `
                <div class="card-top"><span>${task.title}</span></div>
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
    document.getElementById('analytics-backlog-view').style.display       = 'none';
};

window.openModalForBacklog = function (task) {
    currentOpenedTask = task;
    editingTaskId     = task.id;

    document.getElementById('modal-title').value       = task.title;
    document.getElementById('modal-assignee').value    = task.assignee || '';
    setModalDateFields(task.date,       'modal-date',       'modal-time');
    setModalDateFields(task.start_date, 'modal-start-date', 'modal-start-time');

    document.getElementById('modal-priority').value    = task.priority    || 'Средняя';
    document.getElementById('modal-description').value = task.description || '';
    document.getElementById('modal-status-container').style.display = 'none';
    document.getElementById('modal-location').style.display         = 'block';
    document.getElementById('modal-location').innerText             = 'Бэклог';
    document.getElementById('modal-logs').innerHTML =
        `<strong>${task.creator}</strong> создал(а) задачу: <span>${task.created_at || '—'}</span>`;

    document.getElementById('modal-link-task-btn').style.display    = 'inline-block';
    document.getElementById('modal-comments-section').style.display = 'none';

    const commentsList = document.getElementById('task-comments-list');
    if (commentsList) commentsList.innerHTML = '';
    const commentInput = document.getElementById('task-comment-input');
    if (commentInput)  commentInput.value    = '';

    loadTaskComments(task.id);

    try {
        activeTaskCheckpoints = task.checkpoints ? JSON.parse(task.checkpoints) : [];
    } catch (e) {
        activeTaskCheckpoints = [];
    }
    renderCheckpoints();

    const archiveBtn = document.getElementById('btn-to-archive');
    archiveBtn.textContent   = 'В архив';
    archiveBtn.onclick       = archiveCurrentTask;
    archiveBtn.style.display = 'block';
    document.getElementById('btn-to-backlog').style.display    = 'none';
    document.getElementById('btn-restore-board').style.display = 'block';
    document.getElementById('btn-restore-board').onclick       = window.toggleBoardColumnSelect;

    window.updateCharCounter();
    document.getElementById('task-modal').style.display = 'block';
};

async function sendCurrentTaskToBacklog() {
    if (!editingTaskId) return;
    const payload = {
        board_id:    activeBoardId,
        title:       document.getElementById('modal-title').value    || 'Без названия',
        assignee:    document.getElementById('modal-assignee').value,
        date:        getModalDateString('modal-date',       'modal-time'),
        start_date:  getModalDateString('modal-start-date', 'modal-start-time'),
        priority:    document.getElementById('modal-priority').value,
        description: document.getElementById('modal-description').value,
        status:      currentOpenedTask.status,
        checkpoints: JSON.stringify(activeTaskCheckpoints)
    };

    await fetch(`/api/tasks/${editingTaskId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    await fetch(`/api/tasks/${editingTaskId}/backlog`, { method: 'PUT' });
    closeModal();
    await loadTasks();

    if (document.getElementById('analytics-archive-view').style.display === 'block') {
        await window.openArchiveViewer();
    }
}

window.toggleBoardColumnSelect = function (event) {
    event.stopPropagation();
    const dropdown = document.getElementById('board-column-select');
    if (dropdown.style.display === 'block') { dropdown.style.display = 'none'; return; }

    const activeCols = activeBoardData.columns.filter(c => !c.archived);
    dropdown.innerHTML = '';
    activeCols.forEach(col => {
        const btn     = document.createElement('button');
        btn.innerText = col.name;
        btn.onclick   = () => {
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
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ status: columnId })
    });
    document.getElementById('board-column-select').style.display = 'none';
    closeModal();
    await loadTasks();
    if (document.getElementById('analytics-backlog-view').style.display === 'block') {
        await window.openBacklogViewer();
    }
}
