const API_BASE_URL = 'http://127.0.0.1:8000';
// ID доски 
let BOARD_ID = null;
// соответствие названий колонок
let COLUMN_MAP = {};

// отправка http-запроса на сервер
async function sendRequest(endpoint, method = 'GET', body = null) {
    const url = `${API_BASE_URL}${endpoint}`;
    
    const options = {
        method: method,
        headers: {
            'Content-Type': 'application/json'
        }
    };
    
    if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
        options.body = JSON.stringify(body);
    }
    
    const response = await fetch(url, options);
    
    if (!response.ok) {
        throw new Error(`Ошибка ${response.status}: ${response.statusText}`);
    }
    if (response.status === 204) {
        return null;
    }
    return response.json();
}


//получаем доски автоматически
async function g_c_Board() {
    const boards = await sendRequest('/boards', 'GET');
    
    if (boards && boards.length > 0) {
        console.log('boards[0]');
        return boards[0].id;
    }
    
    const newBoard = await sendRequest('/boards?title=Канбан-доска', 'POST');
    console.log('Создали доску', newBoard.id);
    return newBoard.id;
}

//получаем id-колонок
async function loadColumn() {
    try {
        const columns = await sendRequest(`/boards/${BOARD_ID}/columns`, 'GET');
        
        if (columns && columns.length > 0) {
            const server = {
                'Backlog': 'В планах',
                'In Progress': 'В разработке',
                'Done': 'Готово'
            };
            for (const col of columns) {
                const htmlName = server[col.title];
                if (htmlName) {
                    COLUMN_MAP[htmlName] = col.id;
                }
            }
            
            console.log('Загружены следующие колонки', COLUMN_MAP);
            return COLUMN_MAP;
        }
    } catch (error) {
        console.warn('Не удалось загрузить колонки с сервера');
    }
}


//иницализация API
async function initAPI() {
    try {
        BOARD_ID = await g_c_Board();
        await loadColumn();
        
        console.log('API рабочий');
        return true;
    } catch (error) {
        console.error('API не загрузилось', error);
        showMessage('Не удалось подключиться к серверу', true);
        return false;
    }
}



async function fetchTasks() {
    if (!BOARD_ID) {
        return [];
    }
    
    try {
        const tasks = await sendRequest(`/boards/${BOARD_ID}/tasks`, 'GET');
        return tasks;
    } catch (error) {
        console.error('Загрузка задач не удалась', error);
        showMessage('Не удалось загрузить задачи', true);
        return [];
    }
}

// создаём задачу
async function createTask(title, description = '', assig = null) {
    if (!BOARD_ID) {
        return null;
    }
    
    const taskData = {
        title: title,
        description: description
    };
    
    if (assig !== null) {
        taskData.assigned_to = assig;
    }
    
    try {
        const newTask = await sendRequest(`/boards/${BOARD_ID}/tasks`, 'POST', taskData);
        return newTask;
    } catch (error) {
        console.error('Не создали задачу', error);
        showMessage('Не удалось создать задачу', true);
        return null;
    }
}

// перемещаем задачу в другую колонку
async function moveTask(taskId, columnName, position = 0) {
    if (!BOARD_ID) {
        return null;
    }
    // получаем ID колонки
    const columnId = COLUMN_MAP[columnName];

    if (!columnId) {
        console.error('Неизвестная колонка:', columnName);
        return null;
    }
    
    try {
        const movedTask = await sendRequest(
            `/tasks/${taskId}/move/${columnId}?target_position=${position}`,
            'PATCH'
        );
        return movedTask;
    } catch (error) {
        console.error('Ошибка перемещения задачи:', error);
        showMessage('Не удалось переместить задачу', true);
        return null;
    }
}

// обновляем задачу
async function updateTask(taskId, updates) {
    try {
        const updatedTask = await sendRequest(`/tasks/${taskId}`, 'PUT', updates);
        console.log('Обновлена задача:', updatedTask);
        return updatedTask;
    } catch (error) {
        console.error('Ошибка обновления задачи:', error);
        showMessage('Не удалось обновить задачу', true);
        return null;
    }
}

// удаляем задачу
async function deleteTask(taskId) {
    try {
        await sendRequest(`/tasks/${taskId}`, 'DELETE');
        console.log('Удалена задача:', taskId);
        return true;
    } catch (error) {
        console.error('Ошибка удаления задачи:', error);
        showMessage('Не удалось удалить задачу', true);
        return false;
    }
}

// получаем пользователей
async function fetchUsers() {
    try {
        const users = await sendRequest('/users', 'GET');
        console.log('Загружено пользователей:', users.length);
        return users;
    } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
        return [];
    }
}

// уведомления
function showMessage(text, isError = false) {
    const messageDiv = document.createElement('div');
    messageDiv.textContent = text;
    messageDiv.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 8px;
        color: white;
        background-color: ${isError ? '#e53935' : '#43a047'};
        z-index: 9999;
        font-size: 14px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        font-family: Arial, sans-serif;
    `;
    document.body.appendChild(messageDiv);
    setTimeout(() => messageDiv.remove(), 3000);
}