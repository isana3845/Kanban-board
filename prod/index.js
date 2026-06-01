function board() {
    const board = document.querySelector(".board");
    const folder = document.querySelector(".folder");
    const analytics = document.querySelector(".analytics");

    board.style.display = "flex";
    folder.style.display = "none";
    analytics.style.display = "none";
}

function folder() {
    const board = document.querySelector(".board");
    const folder = document.querySelector(".folder");
    const analytics = document.querySelector(".analytics");

    board.style.display = "none";
    folder.style.display = "flex";
    analytics.style.display = "none";
}

function analitics() {
    const board = document.querySelector(".board");
    const folder = document.querySelector(".folder");
    const analytics = document.querySelector(".analytics");

    board.style.display = "none";
    folder.style.display = "none";
    analytics.style.display = "flex";
}

//пишем текст + от вредоносного
function escapeHtml(str) {
    if (!str) return ''; 
    return str
        .replace(/&/g, '&amp;')   
        .replace(/</g, '&lt;')    
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// создание карточки задачи
function createCard(task) {
    const card = document.createElement('article');
    card.className = 'card'
    card.setAttribute('data-task-id', task.id);
    card.setAttribute('draggable', 'true'); //карточку можно перетащить

    let Date = 'Нет даты';
    if (task.created_at) {
        const date = new Date(task.created_at);
        Date = `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`;
    }

    const assig = task.assigned_to ? `Пользователь ${task.assigned_to}` : 'Не назначен';

    card.innerHTML = `
    <div class = "card-header">
        <span class="card-title">${escapeHtml(task.title)}</span>
        <button class="card-more" data-task-id="${task.id}">⋮</button>
	</div>
    ${task.description ? `<div class="card-description" style="font-size:12px;color:#666;">${escapeHtml(task.description)}</div>` : ''}
    <div class="card-divider"></div>
    <div class="card-footer">
        <div class="meta-item">👤 ${assig}</div>
        <div class="meta-item">📅 ${Date}</div>
    </div>
     <button class="delete-task-btn" data-task-id="${task.id}" style="position:absolute; right:10px; bottom:10px; font-size:12px; background:none; border:none; cursor:pointer;">🗑</button>
    `;

    // перетаскивание карточки
    card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', task.id);
        card.style.opacity = '0.5';
    });
    card.addEventListener('dragend', (e) => {
        card.style.opacity = '1';
    });
    
    return card;
}

// отрисовка задач
function renderCards(tasks) {
    const columns = document.querySelectorAll('.column');

    // очищаем, если были задачи
    columns.forEach(column => {
        const cardList = column.querySelector('.card-list');
        if (cardList) cardList.innerHTML = '';
    });

    tasks.forEach(task => {
        let columnIndex = -1;
        if (task.column_id === 1) columnIndex = 0;
        else if (task.column_id === 2) columnIndex = 1;
        else if (task.column_id === 4) columnIndex = 2;
        
        if (columnIndex !== -1) {
            const column = columns[columnIndex];
            const cardList = column.querySelector('.card-list');
            if (cardList) {
                cardList.appendChild(createCard(task));
            }
        }
    });
    
    updateCounters(tasks);
}

function updateCounters(tasks) {
    let countPlans = 0;
    let countInProgress = 0;
    let countDone = 0;
    // А сколько у нас колонок то :/
}