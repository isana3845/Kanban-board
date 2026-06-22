// ─── КОЛОНКИ ────────────────────────────────────────────────────────────────

function renderColumns() {
    // Запоминаем ID открытого меню колонки перед перерендером
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
        colEl.className    = 'column';
        colEl.dataset.id   = col.id;
        colEl.innerHTML    = `
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
                            <input type="text" id="rename-input-${col.id}" value="${col.name}" onclick="this.select()" maxlength="20">
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
                        <button onclick="deleteColumnDirectly('${col.id}')" style="width:100%; background:#cc0000; color:white; border:none; padding:6px; border-radius:2px; cursor:pointer; font-size:11px; font-weight:bold; margin-bottom:4px;">Удалить колонку</button>
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

    // Восстанавливаем открытое меню после перерендера
    if (openMenuColumnId) {
        const menu = document.getElementById(`menu-wip-${openMenuColumnId}`);
        if (menu) menu.style.display = 'block';
    }
}

async function createNewColumn() {
    if (!activeBoardId) return;
    let name = prompt('Введите название новой колонки (макс. 20 символов):');
    if (!name || name.trim() === '') return;
    if (name.trim().length > 20) {
        alert('Название колонки не может превышать 20 символов. Будут использованы первые 20.');
        name = name.trim().slice(0, 20);
    }

    const colId = 'col_' + Date.now();
    activeBoardData.columns.push({ id: colId, name: name.trim(), wip_limit: 0, archived: false });
    activeBoardData.columns_data = JSON.stringify(activeBoardData.columns);

    await fetch(`/api/boards/${activeBoardId}/logs`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action_desc: `Создал(а) новую колонку '${name.trim()}'` })
    });
    await syncBoardSettingsToServer();
}

async function archiveColumn(colId) {
    if (!activeBoardId || !confirm('Отправить колонку и все её задачи в архив?')) return;
    const col = activeBoardData.columns.find(c => c.id === colId);
    if (col) col.archived = true;
    await syncBoardSettingsToServer();
}

async function deleteColumnDirectly(colId) {
    if (!activeBoardId) return;
    const col    = activeBoardData.columns.find(c => c.id === colId);
    const colName = col ? col.name : 'колонку';
    if (!confirm(`Удалить колонку "${colName}" и все задачи в ней?`)) return;

    const tasksInCol = currentTasks.filter(t => t.status === colId);
    for (const task of tasksInCol) {
        await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
    }

    activeBoardData.columns = activeBoardData.columns.filter(c => c.id !== colId);
    activeBoardData.columns_data = JSON.stringify(activeBoardData.columns);
    await syncBoardSettingsToServer();
    await loadTasks();
}

async function renameColumn(colId) {
    const input = document.getElementById(`rename-input-${colId}`);
    if (!input) return;
    const newName = input.value.trim() === '' ? 'Без названия' : input.value.trim();
    const col     = activeBoardData.columns.find(c => c.id === colId);
    if (col && col.name !== newName) {
        const oldName = col.name;
        col.name = newName;
        await fetch(`/api/boards/${activeBoardId}/logs`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ action_desc: `Изменил(а) название колонки с '${oldName}' на '${newName}'` })
        });
    }
    await syncBoardSettingsToServer();
}

// ── WIP-лимиты ───────────────────────────────────────────────────────────────

function changeWip(status, delta) {
    const input = document.getElementById(`wip-input-${status}`);
    let val = parseInt(input.value) || 0;
    val = Math.max(0, val + delta);
    input.value = val;

    const col = activeBoardData.columns.find(c => c.id === status);
    if (col) {
        col.wip_limit = val;

        const indicator = document.getElementById(`wip-indicator-${status}`);
        if (indicator) {
            const currentCount = currentTasks.filter(t => t.status === status).length;
            indicator.textContent = `WIP: ${currentCount}/${val}`;
            indicator.classList.remove('warning', 'danger');
            if (val > 0 && currentCount >= val) {
                indicator.classList.add('danger');
            } else if (val > 0 && currentCount >= val * 0.8) {
                indicator.classList.add('warning');
            }
        }
    }

    syncBoardSettingsToServer();
}

function updateWipIndicators() {
    if (!activeBoardData || !activeBoardData.columns) return;

    const counts = {};
    activeBoardData.columns.forEach(col => {
        if (!col.archived) counts[col.id] = 0;
    });

    currentTasks.forEach(task => {
        if (counts[task.status] !== undefined) counts[task.status]++;
    });

    activeBoardData.columns.forEach(col => {
        if (col.archived) return;

        const indicator = document.getElementById(`wip-indicator-${col.id}`);
        if (indicator) {
            const current = counts[col.id] || 0;
            const limit   = col.wip_limit || 0;
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

        const countEl = document.getElementById(`count-${col.id}`);
        if (countEl) countEl.innerText = counts[col.id] || 0;
    });
}

async function syncWipToServer() {
    await fetch(`/api/boards/${activeBoardId}/wip`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ wip_enabled: 1, columns_data: activeBoardData.columns_data })
    });
    renderBoardCards();
}
