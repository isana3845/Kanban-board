// ─── МОДАЛЬНОЕ ОКНО ЗАДАЧИ ───────────────────────────────────────────────────

window.openModalForCreate = function (status = null) {
    if (!activeBoardId) return;
    editingTaskId     = null;
    currentOpenedTask = null;

    const selectContainer = document.getElementById('modal-status-container');
    const locContainer    = document.getElementById('modal-location');
    const select          = document.getElementById('modal-status-select');

    select.innerHTML = '';

    if (status === 'backlog_creation') {
        targetColumnStatus = 'backlog_creation';
        selectContainer.style.display = 'none';
        locContainer.style.display    = 'block';
        locContainer.innerText        = 'Бэклог';
    } else {
        selectContainer.style.display = 'flex';
        locContainer.style.display    = 'none';

        if (activeBoardData && activeBoardData.columns) {
            const activeCols = activeBoardData.columns.filter(c => !c.archived);
            activeCols.forEach(col => {
                const opt       = document.createElement('option');
                opt.value       = col.id;
                opt.innerText   = col.name;
                select.appendChild(opt);
            });
            targetColumnStatus = select.value;
        }
    }

    document.getElementById('modal-link-task-btn').style.display = 'none';
    document.getElementById('modal-title').value                 = '';
    document.getElementById('modal-assignee').value              = activeUser.username;

    setModalDateFields('', 'modal-date',       'modal-time');
    setModalDateFields('', 'modal-start-date', 'modal-start-time');

    document.getElementById('modal-description').value  = '';
    document.getElementById('modal-logs').innerHTML     = 'Новая задача';

    activeTaskCheckpoints = [];
    renderCheckpoints();

    document.getElementById('btn-to-archive').style.display  = 'none';
    document.getElementById('btn-to-backlog').style.display  = 'none';
    document.getElementById('btn-restore-board').style.display = 'none';
    document.getElementById('btn-restore-board').onclick = window.toggleBoardColumnSelect;

    const deleteTaskBtnCreate = document.getElementById('btn-delete-task');
    if (deleteTaskBtnCreate) deleteTaskBtnCreate.style.display = 'none';

    window.updateCharCounter();
    document.getElementById('task-modal').style.display = 'block';
};

function openModalForEdit(id) {
    editingTaskId = id;
    const task    = currentTasks.find(t => t.id == id);
    if (!task) { alert('Задача была удалена'); return; }
    currentOpenedTask = task;

    const col   = activeBoardData.columns.find(c => c.id === task.status);
    const locEl = document.getElementById('modal-location');

    const archiveBtn = document.getElementById('btn-to-archive');
    const backlogBtn = document.getElementById('btn-to-backlog');
    const restoreBtn = document.getElementById('btn-restore-board');
    restoreBtn.onclick = window.toggleBoardColumnSelect;

    if (locEl) {
        if (col && col.archived) {
            locEl.innerText          = `${col.name} (архив)`;
            archiveBtn.textContent   = 'Извлечь на доску';
            archiveBtn.onclick       = async () => {
                const firstCol = activeBoardData.columns.find(c => !c.archived);
                if (!firstCol) { alert('Нет активных колонок!'); return; }
                task.status = firstCol.id;
                await fetch(`/api/tasks/${task.id}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(task)
                });
                closeModal();
                await loadTasks();
                if (currentArchivedColId) openArchivedColumnModal(currentArchivedColId);
            };
            backlogBtn.style.display  = 'none';
            restoreBtn.style.display  = 'none';
            archiveBtn.style.display  = 'block';
        } else {
            locEl.innerText          = col ? col.name : task.status;
            archiveBtn.textContent   = 'В архив';
            archiveBtn.onclick       = archiveCurrentTask;
            backlogBtn.style.display = 'block';
            restoreBtn.style.display = 'none';
            archiveBtn.style.display = 'block';
        }
    }

    const deleteTaskBtn = document.getElementById('btn-delete-task');
    if (deleteTaskBtn) deleteTaskBtn.style.display = 'block';

    document.getElementById('modal-link-task-btn').style.display = 'inline-block';
    document.getElementById('modal-title').value                 = task.title;
    document.getElementById('modal-assignee').value              = task.assignee || '';

    setModalDateFields(task.date,       'modal-date',       'modal-time');
    setModalDateFields(task.start_date, 'modal-start-date', 'modal-start-time');

    document.getElementById('modal-priority').value    = task.priority    || 'Средняя';
    document.getElementById('modal-description').value = task.description || '';
    document.getElementById('modal-logs').innerHTML    =
        `<strong>${task.creator}</strong> создал(а) задачу: <span>${task.created_at || '—'}</span>`;

    document.getElementById('modal-status-container').style.display = 'none';
    document.getElementById('modal-location').style.display         = 'block';
    document.getElementById('modal-comments-section').style.display = 'none';

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

    const deleteTaskBtn = document.getElementById('btn-delete-task');
    if (deleteTaskBtn) deleteTaskBtn.style.display = 'none';

    const commentsSection = document.getElementById('modal-comments-section');
    if (commentsSection) commentsSection.style.display = 'none';

    const input = document.getElementById('task-comment-input');
    if (input) input.value = '';

    editingTaskId     = null;
    currentOpenedTask = null;
    activeTaskCheckpoints = [];
}

window.saveTask = async function () {
    const isBacklogCreation = targetColumnStatus === 'backlog_creation';
    const activeCols        = activeBoardData && activeBoardData.columns
        ? activeBoardData.columns.filter(c => !c.archived)
        : [];
    const defaultCol = activeCols.length > 0 ? activeCols[0].id : 'todo';

    const description = document.getElementById('modal-description').value;
    if (description && description.length > 3000) {
        alert('Описание задачи не может превышать 1000 символов!');
        return;
    }

    const payload = {
        board_id:    activeBoardId,
        title:       document.getElementById('modal-title').value || 'Без названия',
        assignee:    document.getElementById('modal-assignee').value,
        date:        getModalDateString('modal-date',       'modal-time'),
        start_date:  getModalDateString('modal-start-date', 'modal-start-time'),
        priority:    document.getElementById('modal-priority').value,
        description: document.getElementById('modal-description').value,
        status:      isBacklogCreation
            ? defaultCol
            : (editingTaskId ? currentOpenedTask.status : document.getElementById('modal-status-select').value),
        backlog:     isBacklogCreation ? 1 : 0,
        checkpoints: JSON.stringify(activeTaskCheckpoints)
    };

    if (editingTaskId) {
        await fetch(`/api/tasks/${editingTaskId}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
    } else {
        await fetch('/api/tasks', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
    }

    closeModal();
    await loadTasks();
    if (document.getElementById('analytics-archive-view').style.display === 'block') await window.openArchiveViewer();
    if (document.getElementById('analytics-backlog-view').style.display === 'block') await window.openBacklogViewer();
};

async function archiveCurrentTask() {
    if (!editingTaskId) return;

    const payload = {
        board_id:    activeBoardId,
        title:       document.getElementById('modal-title').value || 'Без названия',
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

    const res = await fetch(`/api/tasks/${editingTaskId}/archive`, { method: 'PUT' });
    if (!res.ok) { alert('Ошибка'); return; }

    closeModal();
    await loadTasks();
    if (document.getElementById('analytics-archive-view').style.display === 'block') await window.openArchiveViewer();
    if (document.getElementById('analytics-backlog-view').style.display === 'block') await window.openBacklogViewer();
}
