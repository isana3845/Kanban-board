// index.js
const API_BASE = 'http://localhost:8000';
let currentBoardId = null;
let isLoggedIn = false;

// ==================== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ====================

function showToast(message, duration = 3000, isError = false) {
    let toast = document.getElementById('toastMsg');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toastMsg';
        toast.className = 'toast-msg';
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.style.backgroundColor = isError ? '#dc3545' : '#1f2f3e';
    toast.style.opacity = '1';

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => {
            toast.style.backgroundColor = '#1f2f3e';
        }, 300);
    }, duration);
}

async function handleResponse(response) {
    if (!response.ok) {
        let errorMessage = `HTTP ${response.status}`;
        try {
            const error = await response.json();
            errorMessage = error.detail || error.message || errorMessage;
        } catch (e) {
            errorMessage = await response.text() || errorMessage;
        }
        throw new Error(errorMessage);
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
        return 1;
    } catch (error) {
        console.error('Ошибка получения пользователя:', error);
        return 1;
    }
}

// ==================== ФУНКЦИИ РЕГИСТРАЦИИ И ВХОДА ====================

async function registerUser(username, email, password) {
    const response = await fetch(`${API_BASE}/users`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            user_id: Date.now(),
            username: username,
            email: email
        })
    });

    const data = await handleResponse(response);
    return data;
}

async function loginUser(email, password) {
    // Для демо: получаем всех пользователей и проверяем email
    const response = await fetch(`${API_BASE}/users`);
    const users = await handleResponse(response);

    const user = users.find(u => u.email === email);

    if (!user) {
        throw new Error('Пользователь не найден');
    }

    // В реальном приложении здесь была бы проверка пароля на сервере
    // Пока просто имитируем успешный вход
    return user;
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

        if (boards.length > 0 && !currentBoardId) {
            currentBoardId = boards[0].id;
            await loadBoard(currentBoardId);
        }
    } catch (error) {
        console.error('Ошибка загрузки досок:', error);
        showToast('Ошибка загрузки досок: ' + error.message, 3000, true);
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
        showToast(`Доска "${title}" создана`);
    } catch (error) {
        console.error('Ошибка создания доски:', error);
        showToast('Не удалось создать доску: ' + error.message, 3000, true);
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
        showToast('Ошибка загрузки доски: ' + error.message, 3000, true);
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
        showToast(`Колонка "${title}" создана`);
    } catch (error) {
        console.error('Ошибка создания колонки:', error);
        showToast('Не удалось создать колонку: ' + error.message, 3000, true);
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
            showToast(`Колонка переименована в "${newTitle}"`);
        }
    } catch (error) {
        console.error('Ошибка редактирования колонки:', error);
        showToast('Не удалось изменить колонку: ' + error.message, 3000, true);
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
            showToast(`Задача "${title}" создана`);
        } else {
            const error = await response.text();
            showToast(`Ошибка: ${error}`, 3000, true);
        }
    } catch (error) {
        console.error('Ошибка создания задачи:', error);
        showToast('Не удалось создать задачу: ' + error.message, 3000, true);
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
            showToast(`Задача обновлена`);
        }
    } catch (error) {
        console.error('Ошибка редактирования задачи:', error);
        showToast('Не удалось изменить задачу: ' + error.message, 3000, true);
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
        showToast('🗑 Задача удалена');
    } catch (error) {
        console.error('Ошибка удаления задачи:', error);
        showToast('Не удалось удалить задачу: ' + error.message, 3000, true);
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
        showToast('Не удалось переместить задачу: ' + error.message, 3000, true);
    }
}

// ==================== ПАПКИ (заглушка) ====================

async function loadFolders() {
    const folderSection = document.querySelector('.folder');
    if (folderSection) {
        folderSection.innerHTML = '<div class="placeholder">📁 Функция папок в разработке</div>';
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
                <h2>📊 Аналитика</h2>
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
        analyticsSection.innerHTML = '<div class="placeholder">Ошибка загрузки аналитики: ' + error.message + '</div>';
    }
}

// ==================== ПОИСК ====================

const searchInput = document.querySelector('.search-box input');
if (searchInput) {
    searchInput.addEventListener('input', async (e) => {
        const searchTerm = e.target.value.toLowerCase();
        if (!currentBoardId) return;

        try {
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
        } catch (error) {
            console.error('Ошибка поиска:', error);
        }
    });
}

// ==================== СОРТИРОВКА ====================

let sortDirection = 'asc';
const sortButton = document.querySelector('.sort-button');
if (sortButton) {
    sortButton.addEventListener('click', async () => {
        if (!currentBoardId) return;

        try {
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
        } catch (error) {
            console.error('Ошибка сортировки:', error);
            showToast('Ошибка сортировки: ' + error.message, 2000, true);
        }
    });
}

// ==================== СИСТЕМА ВХОДА ====================

function showMainApp() {
    const loginPage = document.getElementById('loginPage');
    const mainApp = document.getElementById('mainApp');

    if (loginPage) loginPage.classList.add('hidden');
    if (mainApp) mainApp.style.display = 'flex';
    isLoggedIn = true;
    loadBoards();
}

function showLoginPage() {
    const loginPage = document.getElementById('loginPage');
    const mainApp = document.getElementById('mainApp');

    if (loginPage) loginPage.classList.remove('hidden');
    if (mainApp) mainApp.style.display = 'none';
    isLoggedIn = false;
}

function logout() {
    showLoginPage();
    showToast('Вы вышли из системы');
}

// ==================== ИНИЦИАЛИЗАЦИЯ ====================

document.addEventListener('DOMContentLoaded', () => {
    const folder = document.querySelector('.folder');
    const analytics = document.querySelector('.analytics');
    const board = document.querySelector('.board');

    if (folder) folder.style.display = 'none';
    if (analytics) analytics.style.display = 'none';
    if (board) board.style.display = 'block';

    // ТАБЫ
    const tabBtns = document.querySelectorAll('.tab-btn');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    if (tabBtns.length) {
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const tab = btn.dataset.tab;
                tabBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                if (tab === 'login' && loginForm && registerForm) {
                    loginForm.classList.add('active');
                    registerForm.classList.remove('active');
                } else if (tab === 'register' && loginForm && registerForm) {
                    loginForm.classList.remove('active');
                    registerForm.classList.add('active');
                }
            });
        });
    }

    // РЕГИСТРАЦИЯ — сбор данных и отправка на сервер
    const registerFormElement = document.getElementById('registerForm');
    if (registerFormElement) {
        registerFormElement.addEventListener('submit', async (e) => {
            e.preventDefault();

            const username = document.getElementById('regUsername')?.value.trim();
            const email = document.getElementById('regEmail')?.value.trim();
            const password = document.getElementById('regPassword')?.value;
            const passwordConfirm = document.getElementById('regPasswordConfirm')?.value;

            if (!username || !email || !password) {
                showToast('Заполните все поля', 2000, true);
                return;
            }

            if (password !== passwordConfirm) {
                showToast('Пароли не совпадают', 2000, true);
                return;
            }

            if (password.length < 6) {
                showToast('Пароль должен содержать минимум 6 символов', 2000, true);
                return;
            }

            try {
                showToast('Регистрация...', 1500);
                await registerUser(username, email, password);
                showToast('✅ Регистрация успешна! Теперь можно войти', 3000);

                // Переключаем на форму входа
                if (loginForm && registerForm) {
                    loginForm.classList.add('active');
                    registerForm.classList.remove('active');
                    tabBtns.forEach(btn => {
                        if (btn.dataset.tab === 'login') {
                            btn.classList.add('active');
                        } else {
                            btn.classList.remove('active');
                        }
                    });
                }

                // Очищаем поля регистрации
                document.getElementById('regUsername').value = '';
                document.getElementById('regEmail').value = '';
                document.getElementById('regPassword').value = '';
                document.getElementById('regPasswordConfirm').value = '';

            } catch (error) {
                console.error('Ошибка регистрации:', error);
                showToast('❌ Ошибка регистрации: ' + error.message, 3000, true);
            }
        });
    }

    // ВХОД — сбор данных и отправка на сервер
    const loginFormElement = document.getElementById('loginForm');
    if (loginFormElement) {
        loginFormElement.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = document.getElementById('loginEmail')?.value.trim();
            const password = document.getElementById('loginPassword')?.value;

            if (!email || !password) {
                showToast('Введите email и пароль', 2000, true);
                return;
            }

            try {
                showToast('Вход...', 1500);
                const user = await loginUser(email, password);
                showToast(`✅ Добро пожаловать, ${user.username}!`);
                showMainApp();
            } catch (error) {
                console.error('Ошибка входа:', error);
                showToast('❌ Ошибка входа: ' + error.message, 3000, true);
            }
        });
    }

    // ВЫХОД
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', logout);
    }

    // ССЫЛКИ ДЛЯ ПЕРЕКЛЮЧЕНИЯ ФОРМ
    const showRegisterBtn = document.getElementById('showRegisterBtn');
    const showLoginBtn = document.getElementById('showLoginBtn');

    if (showRegisterBtn && loginForm && registerForm) {
        showRegisterBtn.addEventListener('click', (e) => {
            e.preventDefault();
            loginForm.classList.remove('active');
            registerForm.classList.add('active');
            tabBtns.forEach(btn => {
                if (btn.dataset.tab === 'register') {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        });
    }

    if (showLoginBtn && loginForm && registerForm) {
        showLoginBtn.addEventListener('click', (e) => {
            e.preventDefault();
            registerForm.classList.remove('active');
            loginForm.classList.add('active');
            tabBtns.forEach(btn => {
                if (btn.dataset.tab === 'login') {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        });
    }

    // МОДАЛЬНОЕ ОКНО
    const closeModalBtn = document.getElementById('closeModalBtn');
    const cancelBtn = document.getElementById('cancelBtn');
    const taskModal = document.getElementById('taskModal');

    function closeTaskModal() {
        if (taskModal) taskModal.classList.remove('active');
    }

    if (closeModalBtn) closeModalBtn.addEventListener('click', closeTaskModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeTaskModal);

    // Важность
    document.querySelectorAll('.importance-option').forEach(opt => {
        opt.addEventListener('click', () => {
            const radio = opt.querySelector('input');
            if (radio) {
                radio.checked = true;
                document.querySelectorAll('.importance-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
            }
        });
    });

    // Файлы
    const attachTrigger = document.getElementById('attachTrigger');
    const fileInput = document.getElementById('fileInput');
    if (attachTrigger && fileInput) {
        attachTrigger.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            const fileListDiv = document.getElementById('fileNamesList');
            if (fileListDiv) {
                if (files.length) {
                    fileListDiv.innerHTML = files.map(f => `<span>📄 ${f.name}</span>`).join(', ');
                } else {
                    fileListDiv.innerHTML = '';
                }
            }
        });
    }

    // Сохранение задачи
    const taskForm = document.getElementById('taskForm');
    if (taskForm) {
        taskForm.addEventListener('submit', (e) => {
            e.preventDefault();
            showToast('Задача сохранена (демо-режим)', 2000);
            closeTaskModal();
        });
    }

    showLoginPage();
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
window.logout = logout;