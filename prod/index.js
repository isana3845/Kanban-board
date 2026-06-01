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

function analytics() {
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

    let datestr = 'Нет даты';
    if (task.created_at) {
        const newdate = new Date(task.created_at);
        datestr = `${newdate.getDate()}.${newdate.getMonth() + 1}.${newdate.getFullYear()}`;
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
        <div class="meta-item">📅 ${datestr}</div>
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

//вносим задачи в колонки
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
    //считаем задачи в колонках
    let countPlans = 0;
    let countInProgress = 0;
    let countDone = 0;

    tasks.forEach(task => {
        if (task.column_id === 1) countPlans++;
        else if (task.column_id === 2) countInProgress++;
        else if (task.column_id === 4) countDone++;
    });
    
    //Находим колонки и обновляем цифры
    const columns = document.querySelectorAll('.column');
    if (columns[0]) {
        const counter = columns[0].querySelector('.column-counter');
        if (counter) counter.textContent = countPlans;
    }
    if (columns[1]) {
        const counter = columns[1].querySelector('.column-counter');
        if (counter) counter.textContent = countInProgress;
    }
    if (columns[2]) {
        const counter = columns[2].querySelector('.column-counter');
        if (counter) counter.textContent = countDone;
    }
}

//Показываем задачи
async function loadRenderTasks() {
    const app = await initAPI();
    
    if (!app) {
        console.error('API не инициализирован');
        showMessage('Не удалось подключиться к серверу', true);
        return;
    }
    
    const tasks = await fetchTasks(); //загружаем задачи
    console.log('Загружено задач:', tasks.length);
    
    renderCards(tasks);
}

//cоздание новой задачи(+) и показываем
async function createTaskByUser(columnName) {
    let columnId = null;
    if (columnName === 'В планах') columnId = 1;
    else if (columnName === 'В разработке') columnId = 2;
    else if (columnName === 'Готово') columnId = 4;
    
    const title = prompt('Введите название задачи:');
    if (!title) return;
    
    const description = prompt('Введите описание (необязательно):');
    
    await createTask(title, description || '', columnId, null);
    
    await loadRenderTasks(); //перезагружаем
    
    console.log("Создали задачу")
    showMessage(`Задача "${title}" создана`);
}

//редактирование задачи(⋮)
async function editTask(taskId) {
    const newTitle = prompt('Введите новое название:');
    if (newTitle) {
        await updateTask(taskId, { title: newTitle }); //запрос на обновление
        await loadRenderTasks(); // Перезагружаем доску
        showMessage('Название обновлено');
    }
}

// Удаление задачи ("🗑")
async function deleteTaskPrompt(taskId) {
    if (confirm('Удалить задачу?')) {
        await deleteTask(taskId); //запрос на удаление
        await loadRenderTasks();
        showMessage('Задача удалена');
    }
}

function DragAndDrop() {
    const columns = document.querySelectorAll(".column");

    columns.forEach(column => {
        const columTitle = column.querySelector(".column-title")
        if (!columTitle) return;

        const columName = columTitle.textContent
        const cardList = column.querySelector(".card-list")
        if (!cardList) return;

        //разрешаем перетаскивание задачи над колонкой
        column.addEventListener('dragover', (e) => {
            e.preventDefault(); //чтобы можно было перетащить
            e.dataTransfer.dropEffect = 'move'; //меняем курсор на "+"
        });

        //сбрасываем карточку
        column.addEventListener('drop', async (e) => { 
            e.preventDefault();
            const taskId = e.dataTransfer.getData('text/plain'); //ID
            if (!taskId) return;

            let targetColumnId = null;
            let targetColumnName = null;
            
            if (columName === 'В планах') {
                targetColumnId = 1;
                targetColumnName = 'В планах';
            } else if (columName === 'В разработке') {
                targetColumnId = 2;
                targetColumnName = 'В разработке';
            } else if (columName === 'Готово') {
                targetColumnId = 4;
                targetColumnName = 'Готово';
            }

            if (targetColumnId) {
                // moveTask(taskId, columnName, position = 0)
                await moveTask(parseInt(taskId), targetColumnName, 0);
                await loadRenderTasks(); //перезагружка
                console.log("Задача перенесена");
                showMessage(`Вы перенесли задачу в "${columName}"`)
            }
        });
    
    });
}

document.addEventListener('click', async (e) => {
    //кнопка редактирования (⋮)
    if (e.target.classList.contains('card-more')) {
        e.stopPropagation(); //чтобы другие кнопки не реагировали
        const taskId = e.target.getAttribute('data-task-id') || 
                       e.target.closest('.card')?.getAttribute('data-task-id'); //ID ближайшей карточки сверху
        if (taskId) {
            await editTask(parseInt(taskId));
        }
    }
    
    //кнопка удаления (🗑)
    if (e.target.classList.contains('delete-task-btn')) {
        e.stopPropagation();
        const taskId = e.target.getAttribute('data-task-id') ||
                       e.target.closest('.card')?.getAttribute('data-task-id'); 
        if (taskId) {
            await deleteTaskPrompt(parseInt(taskId));
        }
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    console.log("Страница запускается");

    await loadRenderTasks();

    DragAndDrop();

    //(+)
    const Addbutton = document.querySelectorAll('.column-controls button:first-child'); //первая кнопка
    const columnNames = ['В планах', 'В разработке', 'Готово'];

    Addbutton.forEach((btn, index) => {
        btn.onclick = null;
        btn.onclick = () => createTaskByUser(columnNames[index]);
    });
});

