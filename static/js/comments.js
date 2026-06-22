// ─── КОММЕНТАРИИ К ЗАДАЧЕ ────────────────────────────────────────────────────

function toggleTaskComments() {
    const panel = document.getElementById('modal-comments-section');
    if (panel.style.display === 'none') {
        panel.style.display = 'flex';
        scrollToTaskCommentsBottom();
    } else {
        panel.style.display = 'none';
    }
}

async function loadTaskComments(taskId) {
    const res = await fetch(`/api/tasks/${taskId}/comments`);
    if (res.ok) {
        const comments = await res.json();
        renderTaskComments(comments);
    }
}

function renderTaskComments(comments) {
    const container = document.getElementById('task-comments-list');
    if (!container) return;

    container.innerHTML = '';

    if (comments.length === 0) {
        container.innerHTML = '<div style="text-align:center;color:#777;font-size:13px;margin-top:10px;">Нет комментариев</div>';
        return;
    }

    comments.forEach(c => {
        const div       = document.createElement('div');
        div.className   = 'chat-msg';
        div.innerHTML   = `
            <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                <span class="chat-msg-author">${c.username}</span>
                <span style="font-size:10px;color:#888;">${c.created_at}</span>
            </div>
            <div class="chat-msg-text">${c.content}</div>
        `;
        container.appendChild(div);
    });

    container.scrollTop = container.scrollHeight;
}

async function sendTaskComment() {
    const activeModal = document.getElementById('archived-task-modal')?.style.display === 'block'
        ? document.getElementById('archived-task-modal')
        : document.getElementById('task-modal');

    const input = activeModal?.querySelector('#task-comment-input') || document.getElementById('task-comment-input');
    if (!input) return;

    const content = input.value.trim();
    if (!content || !editingTaskId) return;

    const res = await fetch(`/api/tasks/${editingTaskId}/comments`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ content })
    });

    if (res.ok) {
        input.value = '';
        await loadTaskComments(editingTaskId);
        await loadLogs();
    }
}

function scrollToTaskCommentsBottom(passedContainer = null) {
    let container = passedContainer;
    if (!container) {
        const activeModal = document.getElementById('archived-task-modal')?.style.display === 'block'
            ? document.getElementById('archived-task-modal')
            : document.getElementById('task-modal');
        container = activeModal?.querySelector('#task-comments-list') || document.getElementById('task-comments-list');
    }
    if (container) container.scrollTop = container.scrollHeight;
}
