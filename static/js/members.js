// ─── УЧАСТНИКИ ДОСКИ ────────────────────────────────────────────────────────

async function loadMembers() {
    if (!activeBoardId) return;
    const res     = await fetch(`/api/boards/${activeBoardId}/members`);
    const members = await res.json();
    renderMembers(members);
}

function renderMembers(members) {
    const list    = document.getElementById('connected-members-list');
    list.innerHTML = '';

    members.forEach(m => {
        const li      = document.createElement('li');
        li.className  = 'member-item';

        const isMe    = m.username === activeUser.username;
        const isOwner = activeBoardData && m.username === activeBoardData.owner_username;

        let badges = '';
        if (isOwner) badges += ' <span style="color: gray; font-size: 13px;">(Владелец)</span>';
        if (isMe)    badges += ' <span style="color: gray; font-size: 13px;">(Вы)</span>';

        const deleteBtnHtml = !isOwner
            ? `<button onclick="removeMember('${m.username}')">&times;</button>`
            : '';

        li.innerHTML = `<span>${m.username}${badges}</span>${deleteBtnHtml}`;
        list.appendChild(li);
    });
}

function renderBoardMembers(members) {
    const container = document.getElementById('board-members-list');
    if (!container) return;
    container.innerHTML = '';

    members.forEach(member => {
        const isOwner = activeBoardData && member === activeBoardData.owner_username;
        const isMe    = activeUser      && member === activeUser.username;

        const item = document.createElement('div');
        item.className   = 'member-item';
        item.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; padding: 4px 0;';

        let badges = '';
        if (isOwner) badges += ' <span style="color: gray; font-size: 13px; font-style: italic;">(Владелец)</span>';
        if (isMe)    badges += ' <span style="color: gray; font-size: 13px; font-style: italic;">(Вы)</span>';

        const nameSpan       = document.createElement('span');
        nameSpan.innerHTML   = `${member}${badges}`;
        item.appendChild(nameSpan);

        if (!isOwner) {
            const cross        = document.createElement('span');
            cross.innerText    = '✖';
            cross.style.cssText = 'color: red; cursor: pointer; margin-left: 8px; font-weight: bold; font-size: 14px;';
            cross.onclick = async () => {
                if (!confirm(`Удалить пользователя ${member} из участников доски?`)) return;
                try {
                    const res = await fetch(`/api/boards/${activeBoardId}/members/${member}`, { method: 'DELETE' });
                    if (res.ok) {
                        item.remove();
                        if (isMe) location.reload();
                    } else {
                        const err = await res.json();
                        alert(`Ошибка: ${err.detail || 'Не удалось удалить участника'}`);
                    }
                } catch (error) {
                    console.error('Ошибка при удалении участника:', error);
                    alert('Произошла сетевая ошибка при удалении участника');
                }
            };
            item.appendChild(cross);
        }
        container.appendChild(item);
    });
}

async function addMember() {
    const input    = document.getElementById('new-member-name');
    const username = input.value.trim();
    if (!username || !activeBoardId) return;

    const res = await fetch(`/api/boards/${activeBoardId}/members`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username })
    });

    if (res.ok) {
        input.value = '';
        loadMembers();
    } else {
        alert('Пользователь не найден в системе');
    }
}

async function removeMember(username) {
    if (!activeBoardId || !confirm('Удалить участника?')) return;
    const res = await fetch(`/api/boards/${activeBoardId}/members/${username}`, { method: 'DELETE' });
    if (res.ok) loadMembers();
}
