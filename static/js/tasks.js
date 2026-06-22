// ─── ЗАДАЧИ ─────────────────────────────────────────────────────────────────

// ── Загрузка ─────────────────────────────────────────────────────────────────

async function loadTasks() {
    if (!activeBoardId) return;
    try {
        const res = await fetch(`/api/tasks?board_id=${activeBoardId}`);
        currentTasks = await res.json();
        renderBoardCards();
        updateWipIndicators();
    } catch (e) {
        console.error("Ошибка загрузки задач:", e);
    }
}

// ── Рендер карточек ──────────────────────────────────────────────────────────

function renderBoardCards() {
    const zones  = {};
    const counts = {};

    if (activeBoardData && activeBoardData.columns) {
        activeBoardData.columns.forEach(col => {
            if (!col.archived) {
                const zone = document.getElementById(`cards-${col.id}`);
                if (zone) {
                    zones[col.id]  = zone;
                    zone.innerHTML = '';
                }
                counts[col.id] = 0;
            }
        });
    }

    let tasksToRender = [...currentTasks];
    const now = new Date();

    // 1. Фильтрация
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

    // 3. Рендер карточек
    tasksToRender.forEach(task => {
        if (counts[task.status] !== undefined) counts[task.status]++;

        const card          = document.createElement('div');
        card.className      = 'task-card';
        card.dataset.id     = task.id;

        const description   = task.description || '';
        const descriptionHtml = description
            ? `<div class="card-description">${escapeHtml(description.length > 100 ? description.substring(0, 97) + '...' : description)}</div>`
            : '';

        let dateHtml = '<span>📅 —</span>';
        if (task.date) {
            const tDate    = new Date(task.date);
            const hoursLeft = (tDate - now) / (1000 * 60 * 60);
            const dateStr  = tDate.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
            dateHtml = hoursLeft <= 24
                ? `<span style="color: #dc3545;">📅 ${escapeHtml(dateStr)}</span>`
                : `<span>📅 ${escapeHtml(dateStr)}</span>`;
        }

        const priorityClass  = task.priority === 'Высокая' ? 'high' : (task.priority === 'Средняя' ? 'medium' : 'low');
        const progressHtml   = getCheckpointsProgressHtml(task.checkpoints);

        card.innerHTML = `
            <div class="card-title">
                <span class="card-priority ${priorityClass}"></span>
                <span style="flex: 1; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(task.title)}</span>
            </div>
            ${descriptionHtml}
            <div class="card-meta-info">
                <span>👤 ${escapeHtml(task.assignee || '—')}</span>
                ${dateHtml}
                <div style="display: flex; align-items: center; gap: 4px;">${progressHtml}</div>
            </div>
        `;

        card.onclick = () => openModalForEdit(task.id);
        if (zones[task.status]) zones[task.status].appendChild(card);
    });

    // 4. Счётчики и WIP-подсветка
    Object.keys(counts).forEach(status => {
        const countEl = document.getElementById(`count-${status}`);
        if (!countEl) return;

        countEl.innerText = counts[status];

        const indicator = document.getElementById(`wip-indicator-${status}`);
        if (indicator && activeBoardData) {
            const col     = activeBoardData.columns.find(c => c.id === status);
            const limit   = col ? col.wip_limit : 0;
            const current = counts[status];

            if (limit > 0) {
                indicator.textContent = `WIP: ${current}/${limit}`;
                indicator.style.display = 'inline-block';
                indicator.classList.remove('warning', 'danger');
                if (current >= limit)          indicator.classList.add('danger');
                else if (current >= limit * 0.8) indicator.classList.add('warning');
            } else {
                indicator.style.display = 'none';
            }
        }

        if (activeBoardData) {
            const col   = activeBoardData.columns.find(c => c.id === status);
            const limit = col ? col.wip_limit : 0;
            countEl.classList.toggle('limit-exceeded', limit > 0 && counts[status] >= limit);
        } else {
            countEl.classList.remove('limit-exceeded');
        }
    });

    updateProjectProgress();
}

// ── Фильтры ──────────────────────────────────────────────────────────────────

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
    currentFilters.assignees  = Array.from(document.querySelectorAll('.filter-assignee:checked')).map(cb => cb.value);
    currentFilters.priorities = Array.from(document.querySelectorAll('.filter-priority:checked')).map(cb => cb.value);
    currentFilters.deadline   = document.getElementById('filter-deadline').value;
    document.getElementById('filter-sort-dropdown').style.display = 'none';
    renderBoardCards();
}

function clearFilters() {
    document.querySelectorAll('.filter-assignee, .filter-priority').forEach(cb => cb.checked = false);
    document.getElementById('filter-deadline').value = 'all';
    document.querySelector('.sort-select').value = 'none';
    currentFilters     = { assignees: [], priorities: [], deadline: 'all' };
    currentSortMethod  = 'none';
    renderBoardCards();
}

function applySort(method) {
    currentSortMethod = method;
    renderBoardCards();
}

// ── Прогресс проекта ─────────────────────────────────────────────────────────

function getProgressSettings() {
    if (!activeBoardData || !activeBoardData.columns) return { includedIds: [], doneIds: [] };

    const activeCols = activeBoardData.columns.filter(c => !c.archived);
    let included = null, done = null;

    if (activeBoardData.progress_done_columns) {
        try {
            const parsed = JSON.parse(activeBoardData.progress_done_columns);
            included = Array.isArray(parsed.included) ? parsed.included : null;
            done     = Array.isArray(parsed.done)     ? parsed.done     : null;
        } catch (e) { /* повреждённые данные — используем дефолты */ }
    }

    const activeIds   = activeCols.map(c => c.id);
    const includedIds = included ? included.filter(id => activeIds.includes(id)) : activeIds;

    let doneIds = done ? done.filter(id => activeIds.includes(id)) : null;
    if (!doneIds || doneIds.length === 0) {
        const byName = activeCols.find(c => ['готово', 'done'].includes((c.name || '').trim().toLowerCase()));
        doneIds = byName ? [byName.id] : (activeCols.length > 0 ? [activeCols[activeCols.length - 1].id] : []);
    }

    return { includedIds, doneIds };
}

function updateProjectProgress() {
    const fill  = document.getElementById('board-progress-fill');
    const label = document.getElementById('board-progress-label');
    if (!fill || !label) return;

    if (!activeBoardData || !activeBoardData.columns) {
        fill.style.width    = '0%';
        label.textContent   = '0%';
        return;
    }

    const { includedIds, doneIds } = getProgressSettings();
    if (includedIds.length === 0) { fill.style.width = '0%'; label.textContent = '0%'; return; }

    const includedSet    = new Set(includedIds);
    const doneSet        = new Set(doneIds);
    const relevantTasks  = currentTasks.filter(t => includedSet.has(t.status));
    const totalTasks     = relevantTasks.length;
    const doneTasks      = relevantTasks.filter(t => doneSet.has(t.status)).length;
    const percent        = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

    fill.style.width  = `${percent}%`;
    label.textContent = `${percent}%`;
}

function openProgressSettings(event) {
    event.stopPropagation();
    const dropdown = document.getElementById('progress-settings-dropdown');
    const opened   = dropdown.style.display === 'block';
    document.querySelectorAll('.dropdown-menu').forEach(m => m.style.display = 'none');
    if (opened) return;
    if (!activeBoardData || !activeBoardData.columns) return;

    const activeCols                 = activeBoardData.columns.filter(c => !c.archived);
    const { includedIds, doneIds }   = getProgressSettings();
    const includedSet                = new Set(includedIds);
    const doneSet                    = new Set(doneIds);

    const checkboxList = (idAttr, cssClass, set) =>
        activeCols.map(col => `
            <label>
                <input type="checkbox" class="${cssClass}" value="${col.id}" ${set.has(col.id) ? 'checked' : ''}>
                ${escapeHtml(col.name)}
            </label>
        `).join('');

    document.getElementById('progress-included-list').innerHTML = checkboxList('progress-included-checkbox', 'progress-included-checkbox', includedSet);
    document.getElementById('progress-done-list').innerHTML     = checkboxList('progress-done-checkbox',     'progress-done-checkbox',     doneSet);

    dropdown.style.display = 'block';
}

async function saveProgressSettings() {
    if (!activeBoardData) return;

    const included = Array.from(document.querySelectorAll('.progress-included-checkbox:checked')).map(cb => cb.value);
    const done     = Array.from(document.querySelectorAll('.progress-done-checkbox:checked')).map(cb => cb.value);

    const progressData = JSON.stringify({ included, done });
    activeBoardData.progress_done_columns = progressData;

    await fetch(`/api/boards/${activeBoardId}/settings`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
            wip_enabled:           activeBoardData.wip_enabled ? 1 : 0,
            dropzones_enabled:     activeBoardData.dropzones_enabled !== 0 ? 1 : 0,
            columns_data:          activeBoardData.columns_data || JSON.stringify(activeBoardData.columns),
            progress_done_columns: progressData
        })
    });

    document.getElementById('progress-settings-dropdown').style.display = 'none';
    updateProjectProgress();
}

// ── Drag & Drop ───────────────────────────────────────────────────────────────

function setupDragAndDrop() {
    const activeCols = activeBoardData.columns.filter(c => !c.archived);

    // Сортировка карточек внутри и между колонками
    activeCols.forEach(col => {
        const el = document.getElementById(`cards-${col.id}`);
        if (!el) return;
        
        // Уничтожаем старую инстанцию если есть
        if (el.sortableInstance) {
            el.sortableInstance.destroy();
            el.sortableInstance = null;
        }

        el.sortableInstance = new Sortable(el, {
            group:     'kanban',
            animation: 150,
            ghostClass: 'sortable-ghost',
            dragClass:  'sortable-drag',
            
            // ✅ Блокируем перерисовку при начале перетаскивания
            onStart: () => { 
                window.isDraggingActive = true; 
            },
            
                    onEnd: async (e) => {
            try {
                const taskId     = e.item.dataset.id;
                const nextStatus = e.to.dataset.status;

                // Логика боковых зон
                if (e.to.classList.contains('side-dropzone')) {
                    const target = e.to.dataset.target;
                    e.item.style.display = 'none';
                    e.to.classList.remove('drag-active');
                    document.getElementById('drag-tooltip').style.display = 'none';

                    if (target === 'backlog') await fetch(`/api/tasks/${taskId}/backlog`,  { method: 'PUT' });
                    else if (target === 'archive') await fetch(`/api/tasks/${taskId}/archive`, { method: 'PUT' });
                    
                    await loadTasks();
                    return; // finally выполнится автоматически
                }

                // Обновление статуса задачи
                const task = currentTasks.find(t => t.id == taskId);
                if (task && task.status !== nextStatus) {
                    task.status = nextStatus;
                    await fetch(`/api/tasks/${taskId}`, {
                        method:  'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body:    JSON.stringify(task)
                    });
                }
            } catch (err) {
                console.error('Ошибка при сохранении перетаскивания:', err);
            } finally {
                // ✅ ГАРАНТИРОВАННЫЙ СБРОС ФЛАГА
                // Задержка нужна, чтобы SortableJS успел завершить внутренние процессы
                setTimeout(() => { 
                    window.isDraggingActive = false; 
                }, 100);
            }
        },
            
            put: function (to, from) {
                if (to.el === from.el) return true;
                const limit = col.wip_limit;
                if (!limit || limit <= 0) return true;
                return currentTasks.filter(t => t.status === col.id).length < limit;
            }
        });
    });

    // Боковые зоны как приёмники Sortable
    ['dropzone-backlog', 'dropzone-archive'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (el.sortableInstance) {
            el.sortableInstance.destroy();
            el.sortableInstance = null;
        }
        el.sortableInstance = new Sortable(el, { 
            group: 'kanban', 
            animation: 150 
        });
    });

    // Сортировка самих колонок
    const colContainer = document.querySelector('.board-columns');
    if (colContainer) {
        if (window.columnSortable) {
            window.columnSortable.destroy();
            window.columnSortable = null;
        }

        window.columnSortable = new Sortable(colContainer, {
            animation:     200,
            handle:        '.drag-handle',
            direction:     'horizontal',
            forceFallback: true,
            onStart: () => { window.isDraggingActive = true; },
            onEnd: async (e) => {
                const active   = activeBoardData.columns.filter(c => !c.archived);
                const archived = activeBoardData.columns.filter(c => c.archived);
                const moved    = active.splice(e.oldIndex, 1)[0];
                active.splice(e.newIndex, 0, moved);
                activeBoardData.columns = [...active, ...archived];
                
                setTimeout(() => { window.isDraggingActive = false; }, 100);
                await syncBoardSettingsToServer();
            }
        });
    }
}

// ── CRUD задач ───────────────────────────────────────────────────────────────

async function deleteCurrentTask() {
    if (!editingTaskId) return;
    if (!confirm('Удалить задачу безвозвратно?')) return;
    const res = await fetch(`/api/tasks/${editingTaskId}`, { method: 'DELETE' });
    if (res.ok) {
        closeModal();
        await loadTasks();
        if (document.getElementById('analytics-archive-view').style.display === 'block') await window.openArchiveViewer();
        if (document.getElementById('analytics-backlog-view').style.display === 'block') await window.openBacklogViewer();
    } else {
        alert('Ошибка при удалении задачи');
    }
}

async function deleteTaskDirectly(taskId) {
    if (!confirm('Удалить задачу?')) return;
    const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
    if (res.ok) await loadTasks();
    else alert('Ошибка при удалении задачи');
}
