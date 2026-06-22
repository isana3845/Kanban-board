// ─── ЧАТ ДОСКИ ──────────────────────────────────────────────────────────────

function toggleChat() {
    const chat          = document.getElementById('chat-sidebar');
    const viewContainer = document.querySelector('.view-container');
    if (chat.parentElement !== viewContainer) viewContainer.appendChild(chat);
    chat.style.display = chat.style.display === 'none' ? 'flex' : 'none';
    if (chat.style.display === 'flex') scrollToChatBottom();
}

async function loadChatMessages() {
    const res = await fetch(`/api/boards/${activeBoardId}/messages`);
    if (res.ok) {
        const messages = await res.json();
        document.getElementById('chat-messages').innerHTML = '';
        messages.forEach(msg => appendMessageToChat(msg));
    }
}

function appendMessageToChat(msg) {
    const container = document.getElementById('chat-messages');
    const div       = document.createElement('div');
    div.className   = 'chat-msg';

    let linkedHtml = '';
    if (msg.linked_task_id) {
        linkedHtml = `
            <div class="chat-msg-linked" onclick="openTaskFromChat(${msg.linked_task_id})" title="Открыть задачу">
                ↪️ ${msg.linked_task_title}
            </div>
        `;
    }

    div.innerHTML = `
        <div class="chat-msg-author">${msg.username}</div>
        ${linkedHtml}
        <div class="chat-msg-text">${msg.content}</div>
    `;
    container.appendChild(div);
    scrollToChatBottom();
}

function scrollToChatBottom() {
    const container = document.getElementById('chat-messages');
    container.scrollTop = container.scrollHeight;
}

function sendChatMessage() {
    const input   = document.getElementById('chat-input');
    const content = input.value.trim();
    if (!content && !linkedChatTaskId) return;

    const payload = {
        type:              'chat',
        content,
        linked_task_id:    linkedChatTaskId,
        linked_task_title: linkedChatTaskTitle
    };

    if (boardSocket && boardSocket.readyState === WebSocket.OPEN) {
        boardSocket.send(JSON.stringify(payload));
        input.value = '';
        clearTaskPreview();
    }
}

function linkTaskToChat() {
    if (!currentOpenedTask) return;
    linkedChatTaskId    = currentOpenedTask.id;
    linkedChatTaskTitle = currentOpenedTask.title;

    document.getElementById('chat-preview-title').innerText     = 'Связь: ' + currentOpenedTask.title;
    document.getElementById('chat-task-preview').style.display  = 'flex';

    closeModal();

    const chat          = document.getElementById('chat-sidebar');
    const viewContainer = document.querySelector('.view-container');
    if (chat.parentElement !== viewContainer) viewContainer.appendChild(chat);
    if (chat.style.display === 'none') {
        chat.style.display = 'flex';
        scrollToChatBottom();
    }
}

function clearTaskPreview() {
    linkedChatTaskId    = null;
    linkedChatTaskTitle = null;
    document.getElementById('chat-task-preview').style.display = 'none';
}

// Открытие задачи по ссылке из чата (учитывает архивные и бэклог-задачи)
async function openTaskFromChat(taskId) {
    try {
        const res = await fetch(`/api/tasks/${taskId}`);
        if (res.status === 404) { alert('Эта задача была удалена из доски'); return; }
        if (!res.ok)            { alert('Не удалось загрузить задачу');       return; }

        const task     = await res.json();
        const isActive = currentTasks.some(t => t.id == task.id);

        if (isActive)           openModalForEdit(task.id);
        else if (task.archived === 1) window.openModalForArchived(task);
        else if (task.backlog  === 1) window.openModalForBacklog(task);
    } catch (err) {
        console.log('Сетевая ошибка при получении задачи:', err);
    }
}

// Универсальное открытие чата для текущей открытой задачи
window.openTaskChat = function () {
    if (!currentOpenedTask) return;

    linkedChatTaskId    = currentOpenedTask.id;
    linkedChatTaskTitle = currentOpenedTask.title;

    const label = document.getElementById('linked-task-label') || document.getElementById('chat-linked-task');
    if (label) {
        label.innerText     = `Прикреплена задача: ${currentOpenedTask.title}`;
        label.style.display = 'block';
    }

    const chatPanel = document.getElementById('chat-panel') || document.getElementById('chat-sidebar');
    if (chatPanel) {
        chatPanel.style.display = 'flex';
        chatPanel.classList.add('open');
    }

    const archiveView = document.getElementById('analytics-archive-view');
    if (archiveView) archiveView.style.display = 'block';

    const analyticsModal = document.getElementById('view-analytics');
    if (analyticsModal) analyticsModal.style.display = 'block';
};