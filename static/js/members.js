// ─── УЧАСТНИКИ ДОСКИ ────────────────────────────────────────────────────────

async function loadMembers() {
    if (!activeBoardId) return;
    const res = await fetch(`/api/boards/${activeBoardId}/members`);
    const members = await res.json();
    if (activeBoardData) {
        activeBoardData.members = members;
    }
    renderMembers(members);
}

function renderMembers(members) {
    const list = document.getElementById('connected-members-list');
    list.innerHTML = '';

    const currentUserIsOwner = activeBoardData && activeUser && activeUser.username === activeBoardData.owner_username;

    members.forEach(m => {
        const li = document.createElement('li');
        li.className = 'member-item';

        const isMe = m.username === activeUser.username;
        const isBoardOwner = activeBoardData && m.username === activeBoardData.owner_username;

        let badges = '';
        if (isBoardOwner) badges += ' <span class="member-role-badge owner">Владелец</span>';
        
        const userRole = m.role || 'student';
        const roleLabel = userRole === 'mentor' ? 'Наставник' : 'Студент';
        const roleClass = userRole === 'mentor' ? 'mentor' : 'student';
        const roleBadge = ` <span class="member-role-badge ${roleClass}">${roleLabel}</span>`;
        
        let roleToggleHtml = '';
        if (currentUserIsOwner && !isMe && !isBoardOwner) {
            // Кнопка смены роли с текстом
            roleToggleHtml = `<button class="role-toggle-btn-text" onclick="toggleUserRole('${m.username}')">Сменить роль</button>`;
        }
        
        const removeBtnHtml = !isBoardOwner 
            ? `<button class="remove-member-btn" onclick="removeMember('${m.username}')">&times;</button>` 
            : '';
        
        li.innerHTML = `
            <span class="member-info">
                <span>${m.username}</span>
                ${badges}
                ${roleBadge}
                ${isMe ? ' <span style="color: gray; font-size: 12px;">(Вы)</span>' : ''}
            </span>
            <span class="member-actions">
                ${roleToggleHtml}
                ${removeBtnHtml}
            </span>
        `;
        list.appendChild(li);
    });
}

async function toggleUserRole(username) {
    if (!activeBoardId) return;
    
    // Находим пользователя
    const member = activeBoardData.members.find(m => m.username === username);
    if (!member) return;
    
    const currentRole = member.role || 'student';
    // Если сейчас студент → меняем на наставника, если наставник → меняем на студента
    const newRole = currentRole === 'mentor' ? 'student' : 'mentor';
    const roleLabel = newRole === 'mentor' ? 'Наставника' : 'Студента';
    
    if (!confirm(`Сменить роль пользователя ${username} на ${roleLabel}?`)) return;
    
    try {
        const res = await fetch(`/api/boards/${activeBoardId}/members/${username}/role`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: newRole })
        });
        
        const data = await res.json();
        
        if (res.ok) {
            // Обновляем данные участников в памяти
            if (activeBoardData && activeBoardData.members) {
                const member = activeBoardData.members.find(m => m.username === username);
                if (member) {
                    member.role = newRole;
                }
            }
            
            // Если меняем роль текущего пользователя
            if (username === activeUser.username) {
                activeUser.role = newRole;
                selectedRole = newRole;
                updateUserRoleDisplay(newRole);
                applyRoleRestrictions();
            }
            
            // Обновляем список участников
            await loadMembers();
            
        } else {
            alert(data.detail || 'Ошибка при смене роли');
            console.error('Error:', data);
        }
    } catch (error) {
        console.error('Network error:', error);
        alert('Ошибка сети. Проверьте соединение с сервером.');
    }
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

    try {
        const res = await fetch(`/api/boards/${activeBoardId}/members`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ username })
        });

        const data = await res.json();

        if (res.ok) {
            input.value = '';
            loadMembers();
        } else {
            alert(data.detail || 'Пользователь не найден в системе');
        }
    } catch (error) {
        console.error('Network error:', error);
        alert('Ошибка сети. Проверьте соединение с сервером.');
    }
}

async function removeMember(username) {
    if (!activeBoardId || !confirm('Удалить участника?')) return;
    try {
        const res = await fetch(`/api/boards/${activeBoardId}/members/${username}`, { method: 'DELETE' });
        if (res.ok) loadMembers();
    } catch (error) {
        console.error('Network error:', error);
        alert('Ошибка сети. Проверьте соединение с сервером.');
    }
}