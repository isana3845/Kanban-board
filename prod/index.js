function board() {
    const board = document.querySelector(".board");
    const folder = document.querySelector(".folder");
    const analytics = document.querySelector(".analytics");

    board.style.display = "flex";
    folder.style.display = "none";
    analytics.style.display = "none";
    
    loadRenderTasks();
}

function folder() {
    const board = document.querySelector(".board");
    const folder = document.querySelector(".folder");
    const analytics = document.querySelector(".analytics");

    board.style.display = "none";
    folder.style.display = "flex";
    analytics.style.display = "none";

    loadFolders();
}

function analytics() {
    const board = document.querySelector(".board");
    const folder = document.querySelector(".folder");
    const analytics = document.querySelector(".analytics");

    board.style.display = "none";
    folder.style.display = "none";
    analytics.style.display = "flex";

    loadAnalytics();
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
    card.setAttribute('draggable', 'true');

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

    tasks.forEach(task => {
        if (task.column_id === 1) countPlans++;
        else if (task.column_id === 2) countInProgress++;
        else if (task.column_id === 4) countDone++;
    });
    
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
    
    const tasks = await fetchTasks();
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
    
    await loadRenderTasks();
    
    console.log("Создали задачу")
    showMessage(`Задача "${title}" создана`);
}

//редактирование задачи(⋮)
async function editTask(taskId) {
    const newTitle = prompt('Введите новое название:');
    if (newTitle) {
        await updateTask(taskId, { title: newTitle });
        await loadRenderTasks();
        showMessage('Название обновлено');
    }
}

// Удаление задачи ("🗑")
async function deleteTaskPrompt(taskId) {
    if (confirm('Удалить задачу?')) {
        await deleteTask(taskId);
        await loadRenderTasks();
        showMessage('Задача удалена');
    }
}

function DragAndDrop() {
    const columns = document.querySelectorAll(".column");

    columns.forEach(column => {
        const columnTitle = column.querySelector(".column-title");
        if (!columnTitle) return;

        const columnName = columnTitle.textContent;
    
        column.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });

        column.addEventListener('drop', async (e) => { 
            e.preventDefault();
            const taskId = e.dataTransfer.getData('text/plain');
            if (!taskId) return;

            let targetColumnId = null;
            
            if (columnName === 'В планах') {
                targetColumnId = 1;
            } else if (columnName === 'В разработке') {
                targetColumnId = 2;
            } else if (columnName === 'Готово') {
                targetColumnId = 4;
            }

            if (targetColumnId) {
                await moveTask(parseInt(taskId), columnName, 0);
                await loadRenderTasks();
                console.log("Задача перенесена");
                showMessage(`Вы перенесли задачу в "${columnName}"`);
            }
        });
    });
}

//сортировка
let sortDirection = 'asc';

function setupSorting() {
    const sortBtn = document.getElementById('sort-btn');
    if (!sortBtn) return;
    
    sortBtn.onclick = async () => {
        const tasks = await fetchTasks();
        if (!tasks || tasks.length === 0) {
            showMessage('Нет задач для сортировки');
            return;
        }
        
        if (sortDirection === 'asc') {
            tasks.sort((a, b) => a.title.localeCompare(b.title));
            sortBtn.textContent = 'Сортировка ↓';
            sortDirection = 'desc';
            showMessage('Сортировка по названию ↓');
        } else {
            tasks.sort((a, b) => b.title.localeCompare(a.title));
            sortBtn.textContent = 'Сортировка ↑';
            sortDirection = 'asc';
            showMessage('Сортировка по названию ↑');
        }
        
        renderCards(tasks);
    };
}

//поиск
function setupSearch() {
    const searchInput = document.getElementById('search-input');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', async (e) => {
        const searchTerm = e.target.value.toLowerCase();
        
        const tasks = await fetchTasks();
        
        const filteredTasks = tasks.filter(task => 
            task.title.toLowerCase().includes(searchTerm) ||
            (task.description && task.description.toLowerCase().includes(searchTerm))
        );
        
        renderCards(filteredTasks);
        
        if (searchTerm && filteredTasks.length === 0) {
            showMessage('Ничего не найдено');
        }
    });
}

//аналитика
async function loadAnalytics() {
    const analyticsSection = document.querySelector('.analytics');
    if (!analyticsSection) return;
    
    try {
        const tasks = await fetchTasks();
        analyticsSection.innerHTML = `
            <div class="analytics-container">
                <h2>Аналитика</h2>
                <div class="stats">
                    <div class="stat-card">
                        <h3>Всего задач</h3>
                        <p class="stat-number">${tasks.length}</p>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        analyticsSection.innerHTML = '<div class="placeholder">Ошибка загрузки аналитики</div>';
    }
}

//функция папок на канбан
async function loadFolders() {
    const folderSection = document.querySelector('.folder');
    if (folderSection) {
        folderSection.innerHTML = '<div class="placeholder">Функция папок в разработке</div>';
    }
}

//работа с кнопками
document.addEventListener('click', async (e) => {
    if (e.target.classList.contains('card-more')) {
        e.stopPropagation();
        const taskId = e.target.getAttribute('data-task-id') || 
                       e.target.closest('.card')?.getAttribute('data-task-id');
        if (taskId) {
            await editTask(parseInt(taskId));
        }
    }
    
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

    // Кнопки "+" в колонках
    const addButtons = document.querySelectorAll('.column-controls button:first-child');
    const columnNames = ['В планах', 'В разработке', 'Готово'];

    addButtons.forEach((btn, index) => {
        btn.onclick = null;
        btn.onclick = () => createTaskByUser(columnNames[index]);
    });
    
    // Настройка сортировки
    setupSorting();
    
    // Настройка поиска
    setupSearch();
    
    // Обновляем аналитику при загрузке
    loadAnalytics();
});