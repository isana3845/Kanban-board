// ─── ЧЕКПОИНТЫ ──────────────────────────────────────────────────────────────

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
    const text  = input.value.trim();
    if (!text) return;
    activeTaskCheckpoints.push({ id: Date.now(), text, done: false });
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

/** Возвращает HTML мини-прогрессбара для карточки задачи */
function getCheckpointsProgressHtml(checkpointsStr) {
    try {
        const cps = checkpointsStr ? JSON.parse(checkpointsStr) : [];
        if (cps.length === 0) return '';
        const doneCount = cps.filter(c => c.done).length;
        const pct       = Math.round((doneCount / cps.length) * 100);
        return `
            <div style="display: flex; align-items: center; gap: 6px; margin-right: 12px;" title="Чекпоинты">
                <div style="width: 40px; height: 6px; background: #ccc; border-radius: 3px; overflow: hidden;">
                    <div style="width: ${pct}%; height: 100%; background: #0000ff;"></div>
                </div>
                <span style="font-size: 11px; color: #555; font-weight: bold;">${doneCount}/${cps.length}</span>
            </div>
        `;
    } catch (e) {
        return '';
    }
}
