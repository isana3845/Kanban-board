// index.js
const API_BASE = 'http://localhost:8000';
let currentBoardId = null;

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

async function handleResponse(response) {
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`HTTP ${response.status}: ${error}`);
    }
    return response.json();
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

async function getCurrentUserId() {
    try {
        const response = await fetch(`${API_BASE}/users`);
        const users = await response.json();
        if (users && users.length > 0) {
            return users[0].id;
        }
        const createResponse = await fetch(`${API_BASE}/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: 'default_user',
                email: 'default@example.com'
            })
        });
        const newUser = await createResponse.json();
        return newUser.id;
    } catch (error) {
        console.error('Ошибка получения пользователя:', error);
        return 1;
    }
}

// ==================== РАБОТА С ХРАНЕНИЕМ ВЫБРАННОЙ ДОСКИ ====================

function saveSelectedBoard(boardId) {
    if (boardId) {
        localStorage.setItem('selectedBoardId', boardId);
    }
}

function getSelectedBoard() {
    const saved = localStorage.getItem('selectedBoardId');
    return saved ? parseInt(saved) : null;
}

// ==================== НАВИГАЦИЯ ====================

function board() {
    document.querySelector('.board').style.display = 'block';
    document.querySelector('.folder').style.display = 'none';
    document.querySelector('.analytics').style.display = 'none';
    loadBoards();
}

function folder() {
    document.querySelector('.board').style.display = 'none';
    document.querySelector('.folder').style.display = 'block';
    document.querySelector('.analytics').style.display = 'none';
    loadFolders();
}

function analytics() {
    document.querySelector('.board').style.display = 'none';
    document.querySelector('.folder').style.display = 'none';
    document.querySelector('.analytics').style.display = 'block';
    loadAnalytics();
}

// ==================== РАБОТА С ДОСКАМИ ====================

async function loadBoards() {
    try {
        const response = await fetch(`${API_BASE}/boards`);
        const boards = await handleResponse(response);
        
        let boardSelect = document.getElementById('board-select');
        if (!boardSelect) {
            const headerRight = document.querySelector('.header-right');
            const selectHtml = `
                <select id="board-select" class="board-select">
                    <option value="">Выберите доску</option>
                </select>
                <button id="create-board-btn" class="create-board-btn" onclick="createBoard()">+ Новая доска</button>
            `;
            headerRight.insertAdjacentHTML('afterbegin', selectHtml);
            boardSelect = document.getElementById('board-select');
            boardSelect.addEventListener('change', (e) => {
                if (e.target.value) {
                    currentBoardId = parseInt(e.target.value);
                    saveSelectedBoard(currentBoardId);
                    loadBoard(currentBoardId);
                }
            });
        }
        
        boardSelect.innerHTML = '<option value="">Выберите доску</option>';
        boards.forEach(board => {
            const option = document.createElement('option');
            option.value = board.id;
            option.textContent = board.title;
            boardSelect.appendChild(option);
        });
        
        // Восстанавливаем выбранную доску
        let selectedBoardId = currentBoardId || getSelectedBoard();
        
        if (selectedBoardId && !boards.find(b => b.id === selectedBoardId)) {
            selectedBoardId = null;
        }
        
        if (boards.length > 0) {
            if (!selectedBoardId) {
                selectedBoardId = boards[0].id;
            }
            
            currentBoardId = selectedBoardId;
            saveSelectedBoard(currentBoardId);
            boardSelect.value = currentBoardId;
            await loadBoard(currentBoardId);
        }
    } catch (error) {
        console.error('Ошибка загрузки досок:', error);
        alert('Ошибка загрузки досок. Убедитесь, что сервер запущен на порту 8000');
    }
}

async function createBoard() {
    const title = prompt('Введите название доски:');
    if (!title) return;
    
    try {
        await fetch(`${API_BASE}/boards?title=${encodeURIComponent(title)}`, {
            method: 'POST'
        });
        await loadBoards();
    } catch (error) {
        console.error('Ошибка создания доски:', error);
        alert('Не удалось создать доску');
    }
}

// ==================== ЗАГРУЗКА ДОСКИ ====================

async function loadBoard(boardId) {
    try {
        const [columns, tasks] = await Promise.all([
            fetch(`${API_BASE}/boards/${boardId}/columns`).then(handleResponse),
            fetch(`${API_BASE}/boards/${boardId}/tasks`).then(handleResponse)
        ]);
        
        renderBoard(columns, tasks);
    } catch (error) {
        console.error('Ошибка загрузки доски:', error);
        alert('Ошибка загрузки доски');
    }
}

// ==================== РЕНДЕРИНГ ====================

function renderBoard(columns, tasks) {
    const columnsContainer = document.querySelector('.columns');
    if (!columnsContainer) return;
    
    columnsContainer.innerHTML = '';
    
    columns.forEach(column => {
        const columnTasks = tasks.filter(task => task.column_id === column.id)
            .sort((a, b) => a.position - b.position);
        
        const columnElement = createColumnElement(column, columnTasks);
        columnsContainer.appendChild(columnElement);
    });
    
    const addColumnBtn = document.createElement('button');
    addColumnBtn.className = 'add-column-btn';
    addColumnBtn.textContent = '+ Добавить колонку';
    addColumnBtn.onclick = () => createColumn();
    columnsContainer.appendChild(addColumnBtn);
}

function createColumnElement(column, tasks) {
    const columnDiv = document.createElement('section');
    columnDiv.className = 'column';
    columnDiv.setAttribute('data-column-id', column.id);
    
    columnDiv.innerHTML = `
        <div class="column-header">
            <div class="column-title-wrapper">
                <span class="column-title">${escapeHtml(column.title)}</span>
                <span class="column-counter">${tasks.length}</span>
            </div>
            <div class="column-controls">
                <button class="add-task-btn" title="Добавить задачу">+</button>
                <button class="edit-column-btn" title="Редактировать">⋮</button>
            </div>
        </div>
        <div class="card-list" data-column-id="${column.id}">
            ${tasks.map(task => createTaskElement(task)).join('')}
        </div>
    `;
    
    const addBtn = columnDiv.querySelector('.add-task-btn');
    addBtn.addEventListener('click', () => createTask(column.id));
    
    const editBtn = columnDiv.querySelector('.edit-column-btn');
    editBtn.addEventListener('click', () => editColumn(column.id));
    
    const cardList = columnDiv.querySelector('.card-list');
    cardList.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    });
    
    cardList.addEventListener('drop', async (e) => {
        e.preventDefault();
        const taskId = e.dataTransfer.getData('text/plain');
        if (!taskId) return;
        
        const targetColumnId = column.id;
        const tasksInColumn = Array.from(cardList.querySelectorAll('.card'));
        let targetPosition = tasksInColumn.length;
        
        const mouseY = e.clientY;
        for (let i = 0; i < tasksInColumn.length; i++) {
            const rect = tasksInColumn[i].getBoundingClientRect();
            const middle = rect.top + rect.height / 2;
            if (mouseY < middle) {
                targetPosition = i;
                break;
            }
        }
        
        await moveTask(parseInt(taskId), targetColumnId, targetPosition);
    });
    
    return columnDiv;
}

function createTaskElement(task) {
    return `
        <article class="card" draggable="true" data-task-id="${task.id}" data-column-id="${task.column_id}">
            <div class="card-header">
                <span class="card-title">${escapeHtml(task.title)}</span>
                <button class="edit-task-btn" title="Редактировать">⋮</button>
            </div>
            ${task.description ? `<div class="card-description">${escapeHtml(task.description)}</div>` : ''}
            <div class="card-divider"></div>
            <div class="card-footer">
                <div class="meta-item">👤 ${task.assigned_to ? 'Пользователь ' + task.assigned_to : 'Не назначен'}</div>
                <div class="meta-item">📅 ${task.created_at ? new Date(task.created_at).toLocaleString() : 'Дата не указана'}</div>
            </div>
            <button class="delete-task-btn" title="Удалить">🗑</button>
        </article>
    `;
}

// ==================== ОБРАБОТЧИКИ СОБЫТИЙ ====================

document.addEventListener('click', async (e) => {
    if (e.target.classList.contains('edit-task-btn')) {
        e.stopPropagation();
        const card = e.target.closest('.card');
        if (card) {
            const taskId = parseInt(card.dataset.taskId);
            await editTask(taskId);
        }
    }
    
    if (e.target.classList.contains('delete-task-btn')) {
        e.stopPropagation();
        const card = e.target.closest('.card');
        if (card) {
            const taskId = parseInt(card.dataset.taskId);
            await deleteTask(taskId);
        }
    }
});

document.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.card');
    if (card) {
        e.dataTransfer.setData('text/plain', card.dataset.taskId);
        e.dataTransfer.effectAllowed = 'move';
        card.style.opacity = '0.5';
    }
});

document.addEventListener('dragend', (e) => {
    const card = e.target.closest('.card');
    if (card) {
        card.style.opacity = '1';
    }
});

// ==================== РАБОТА С КОЛОНКАМИ ====================

async function createColumn() {
    const title = prompt('Введите название колонки:');
    if (!title) return;
    
    try {
        const columnsResponse = await fetch(`${API_BASE}/boards/${currentBoardId}/columns`);
        const columns = await handleResponse(columnsResponse);
        const position = columns.length;
        
        await fetch(`${API_BASE}/boards/${currentBoardId}/columns?title=${encodeURIComponent(title)}&position=${position}`, {
            method: 'POST'
        });
        await loadBoard(currentBoardId);
    } catch (error) {
        console.error('Ошибка создания колонки:', error);
        alert('Не удалось создать колонку');
    }
}

async function editColumn(columnId) {
    const newTitle = prompt('Введите новое название колонки:');
    if (!newTitle) return;
    
    try {
        const columnsResponse = await fetch(`${API_BASE}/boards/${currentBoardId}/columns`);
        const columns = await handleResponse(columnsResponse);
        const column = columns.find(c => c.id === columnId);
        
        if (column) {
            await fetch(`${API_BASE}/columns/${columnId}?title=${encodeURIComponent(newTitle)}&position=${column.position}`, {
                method: 'PUT'
            });
            await loadBoard(currentBoardId);
        }
    } catch (error) {
        console.error('Ошибка редактирования колонки:', error);
        alert('Не удалось изменить колонку');
    }
}

// ==================== РАБОТА С ЗАДАЧАМИ ====================

async function createTask(columnId) {
    const title = prompt('Введите название задачи:');
    if (!title) return;
    
    const description = prompt('Введите описание (необязательно):');
    
    try {
        const userId = await getCurrentUserId();
        const response = await fetch(`${API_BASE}/boards/${currentBoardId}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                title: title,
                description: description || null,
                assigned_to: userId,
                column_id: columnId
            })
        });
        
        if (response.ok) {
            await loadBoard(currentBoardId);
        } else {
            const error = await response.text();
            alert(`Ошибка: ${error}`);
        }
    } catch (error) {
        console.error('Ошибка создания задачи:', error);
        alert('Не удалось создать задачу');
    }
}

async function editTask(taskId) {
    try {
        const response = await fetch(`${API_BASE}/tasks/${taskId}`);
        const task = await handleResponse(response);
        
        const newTitle = prompt('Введите новое название:', task.title);
        if (newTitle && newTitle !== task.title) {
            const userId = await getCurrentUserId();
            await fetch(`${API_BASE}/tasks/${taskId}?user_id=${userId}&title=${encodeURIComponent(newTitle)}`, {
                method: 'PUT'
            });
            await loadBoard(currentBoardId);
        }
    } catch (error) {
        console.error('Ошибка редактирования задачи:', error);
        alert('Не удалось изменить задачу');
    }
}

async function deleteTask(taskId) {
    if (!confirm('Удалить задачу?')) return;
    
    try {
        const userId = await getCurrentUserId();
        await fetch(`${API_BASE}/tasks/${taskId}?user_id=${userId}`, {
            method: 'DELETE'
        });
        await loadBoard(currentBoardId);
    } catch (error) {
        console.error('Ошибка удаления задачи:', error);
        alert('Не удалось удалить задачу');
    }
}

async function moveTask(taskId, targetColumnId, targetPosition) {
    try {
        const userId = await getCurrentUserId();
        const response = await fetch(`${API_BASE}/tasks/${taskId}/move/${targetColumnId}?target_position=${targetPosition}&user_id=${userId}`, {
            method: 'PATCH'
        });
        
        if (response.ok) {
            await loadBoard(currentBoardId);
        } else {
            console.error('Move failed');
        }
    } catch (error) {
        console.error('Ошибка перемещения задачи:', error);
        alert('Не удалось переместить задачу');
    }
}

// ==================== ПАПКИ (заглушка) ====================

async function loadFolders() {
    const folderSection = document.querySelector('.folder');
    if (folderSection) {
        folderSection.innerHTML = '<div class="placeholder">Функция папок в разработке</div>';
    }
}

// ==================== АНАЛИТИКА ====================

async function loadAnalytics() {
    const analyticsSection = document.querySelector('.analytics');
    if (!analyticsSection) return;
    
    try {
        const response = await fetch(`${API_BASE}/boards`);
        const boards = await handleResponse(response);
        
        let totalTasks = 0;
        for (const board of boards) {
            const tasksResponse = await fetch(`${API_BASE}/boards/${board.id}/tasks`);
            const tasks = await handleResponse(tasksResponse);
            totalTasks += tasks.length;
        }
        
        analyticsSection.innerHTML = `
            <div class="analytics-container">
                <h2>Аналитика</h2>
                <div class="stats">
                    <div class="stat-card">
                        <h3>Всего досок</h3>
                        <p class="stat-number">${boards.length}</p>
                    </div>
                    <div class="stat-card">
                        <h3>Всего задач</h3>
                        <p class="stat-number">${totalTasks}</p>
                    </div>
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Ошибка загрузки аналитики:', error);
        analyticsSection.innerHTML = '<div class="placeholder">Ошибка загрузки аналитики</div>';
    }
}

// ==================== ПОИСК ====================

const searchInput = document.querySelector('.search-box input');
if (searchInput) {
    searchInput.addEventListener('input', async (e) => {
        const searchTerm = e.target.value.toLowerCase();
        if (!currentBoardId) return;
        
        const tasksResponse = await fetch(`${API_BASE}/boards/${currentBoardId}/tasks`);
        const tasks = await handleResponse(tasksResponse);
        
        const filteredTaskIds = tasks
            .filter(task => 
                task.title.toLowerCase().includes(searchTerm) ||
                (task.description && task.description.toLowerCase().includes(searchTerm))
            )
            .map(task => task.id);
        
        document.querySelectorAll('.card').forEach(card => {
            const taskId = parseInt(card.dataset.taskId);
            if (searchTerm && filteredTaskIds.includes(taskId)) {
                card.style.backgroundColor = '#fff3cd';
                card.style.border = '1px solid #ffc107';
            } else {
                card.style.backgroundColor = '';
                card.style.border = '';
            }
        });
    });
}

// ==================== СОРТИРОВКА ====================

let sortDirection = 'asc';
const sortButton = document.querySelector('.sort-button');
if (sortButton) {
    sortButton.addEventListener('click', async () => {
        if (!currentBoardId) return;
        
        const tasksResponse = await fetch(`${API_BASE}/boards/${currentBoardId}/tasks`);
        let tasks = await handleResponse(tasksResponse);
        
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
        tasks.sort((a, b) => {
            return sortDirection === 'asc' 
                ? a.title.localeCompare(b.title)
                : b.title.localeCompare(a.title);
        });
        
        const columnsResponse = await fetch(`${API_BASE}/boards/${currentBoardId}/columns`);
        const columns = await handleResponse(columnsResponse);
        renderBoard(columns, tasks);
        
        sortButton.textContent = `Сортировка ${sortDirection === 'asc' ? '↑' : '↓'}`;
    });
}

// ==================== ИНИЦИАЛИЗАЦИЯ ====================

document.addEventListener('DOMContentLoaded', () => {
    const folder = document.querySelector('.folder');
    const analytics = document.querySelector('.analytics');
    const board = document.querySelector('.board');
    
    if (folder) folder.style.display = 'none';
    if (analytics) analytics.style.display = 'none';
    if (board) board.style.display = 'block';
    
    loadBoards();
});


// ==================== ТЕМНАЯ ТЕМА ====================

function initTheme() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        updateThemeButton('dark');
    } else {
        document.documentElement.setAttribute('data-theme', 'light');
        updateThemeButton('light');
    }
}

function updateThemeButton(theme) {
    const themeBtn = document.getElementById('theme-toggle-btn');
    if (themeBtn) {
        themeBtn.textContent = theme === 'dark' ? '☀️' : '🌙';
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeButton(newTheme);
}

// Добавьте кнопку в DOM
function addThemeToggle() {
    const btn = document.createElement('button');
    btn.id = 'theme-toggle-btn';
    btn.className = 'theme-toggle';
    btn.onclick = toggleTheme;
    document.body.appendChild(btn);
    
    initTheme();
}

// Вызовите при загрузке
document.addEventListener('DOMContentLoaded', () => {
    // ... ваш существующий код ...
    addThemeToggle();
});


// Глобальные функции
window.board = board;
window.folder = folder;
window.analytics = analytics;
window.createBoard = createBoard;
window.createColumn = createColumn;
window.editColumn = editColumn;
window.createTask = createTask;
window.editTask = editTask;
window.deleteTask = deleteTask;