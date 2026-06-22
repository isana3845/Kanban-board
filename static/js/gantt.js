/**
 * Gantt Chart Module
 * Отвечает за отрисовку и интерактивность диаграммы Ганта.
 */

class GanttChart {
    constructor() {
        this.container = document.getElementById('ganttContainer');
        this.excludedPanel = document.getElementById('excludedPanel');
        this.excludedList = document.getElementById('excludedList');
        
        this.tasks = [];
        this.users = {}; // { username: { tasks: [], expanded: true } }
        
        // Настройки отображения
        this.viewRange = 'month'; // week, 2weeks, month, all
        this.dayWidth = 40; // пикселей на день
        this.sidebarWidth = 150; // ширина колонки с именами
        this.rowHeight = 40;
        
        this.startDate = null;
        this.endDate = null;
        this.boardId = null;
    }

    /**
     * Инициализация диаграммы для конкретной доски
     */
    async init(boardId) {
        this.boardId = boardId;
        await this.fetchData();
        this.render();
    }

    /**
     * Получение данных с сервера
     */
    async fetchData() {
        if (!this.boardId) return;
        try {
            const response = await fetch(`/api/tasks?board_id=${this.boardId}`);
            if (!response.ok) throw new Error('Network error');
            const allTasks = await response.json();
            this.processTasks(allTasks);
        } catch (e) {
            console.error("Ошибка загрузки данных для Ганта:", e);
            this.container.innerHTML = '<div style="padding:20px;text-align:center;color:#999">Ошибка загрузки данных</div>';
        }
    }

    /**
     * Обработка задач: разделение на включенные и исключенные
     */
    processTasks(allTasks) {
        this.tasks = [];
        const excluded = [];
        this.users = {};

        allTasks.forEach(task => {
            // Условие включения: есть дата начала, дедлайн и исполнитель
            if (!task.start_date || !task.date || !task.assignee) {
                excluded.push(task);
                return;
            }

            const start = new Date(task.start_date);
            const end = new Date(task.date);
            
            // Корректировка: если конец раньше начала, ставим минимальный срок 1 день
            if (end < start) {
                end.setTime(start.getTime() + 86400000); 
            }

            const taskObj = {
                ...task,
                startDate: start,
                endDate: end,
                // Приоритет для сортировки (Высокая > Средняя > Низкая)
                priorityVal: task.priority === 'Высокая' ? 3 : (task.priority === 'Средняя' ? 2 : 1)
            };

            this.tasks.push(taskObj);

            if (!this.users[task.assignee]) {
                this.users[task.assignee] = { tasks: [], expanded: true };
            }
            this.users[task.assignee].tasks.push(taskObj);
        });

        // Сортировка задач у каждого пользователя: Высокие сверху
        Object.keys(this.users).forEach(user => {
            this.users[user].tasks.sort((a, b) => b.priorityVal - a.priorityVal);
        });

        this.renderExcluded(excluded);
        this.calculateDateRange();
    }

    /**
     * Отрисовка панели исключенных задач
     */
    renderExcluded(list) {
        this.excludedList.innerHTML = '';
        if (list.length === 0) {
            this.excludedPanel.style.display = 'none';
            return;
        }
        this.excludedPanel.style.display = 'block';
        list.forEach(t => {
            const div = document.createElement('div');
            div.className = 'excluded-item';
            div.textContent = t.title;
            div.onclick = () => {
                if (window.openTaskModal) window.openTaskModal(t.id);
            };
            this.excludedList.appendChild(div);
        });
    }

    /**
     * Расчет диапазона дат в зависимости от выбранного вида
     */
    calculateDateRange() {
        if (this.tasks.length === 0) return;
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let min = new Date(Math.min(...this.tasks.map(t => t.startDate)));
        let max = new Date(Math.max(...this.tasks.map(t => t.endDate)));

        if (this.viewRange === 'week') {
            min = new Date(today);
            max = new Date(today);
            max.setDate(max.getDate() + 7);
        } else if (this.viewRange === '2weeks') {
            min = new Date(today);
            max = new Date(today);
            max.setDate(max.getDate() + 14);
        } else if (this.viewRange === 'month') {
            min = new Date(today);
            max = new Date(today);
            max.setMonth(max.getMonth() + 1);
        } else {
            // All: добавляем небольшие отступы
            min.setDate(min.getDate() - 3);
            max.setDate(max.getDate() + 3);
        }

        this.startDate = min;
        this.endDate = max;
    }

    /**
     * Переключение вида (Неделя/Месяц и т.д.)
     */
    setView(range) {
        this.viewRange = range;
        // Обновление активной кнопки
        document.querySelectorAll('.view-toggles button').forEach(b => b.classList.remove('active'));
        const btns = document.querySelectorAll('.view-toggles button');
        // Простой поиск по тексту, можно улучшить через data-атрибуты
        for (let btn of btns) {
            if ((range === 'week' && btn.textContent.includes('Неделя') && !btn.textContent.includes('2')) ||
                (range === '2weeks' && btn.textContent.includes('2')) ||
                (range === 'month' && btn.textContent === 'Месяц') ||
                (range === 'all' && btn.textContent === 'Все')) {
                btn.classList.add('active');
            }
        }
        
        this.calculateDateRange();
        this.render();
    }

    /**
     * Основная функция отрисовки HTML
     */
    render() {
        if (!this.container) return;
        this.container.innerHTML = '';

        if (this.tasks.length === 0) {
            this.container.innerHTML = '<div style="padding:40px;text-align:center;color:#999">Нет задач с датами и исполнителями для отображения</div>';
            return;
        }

        const totalDays = Math.ceil((this.endDate - this.startDate) / (1000 * 60 * 60 * 24));
        const totalWidth = this.sidebarWidth + (totalDays * this.dayWidth);

        // 1. Заголовок с датами
        const header = document.createElement('div');
        header.className = 'gantt-grid-header';
        header.style.width = `${totalWidth}px`;

        const corner = document.createElement('div');
        corner.className = 'gantt-sidebar-header';
        corner.textContent = 'Исполнитель';
        header.appendChild(corner);

        const timeline = document.createElement('div');
        timeline.style.display = 'flex';
        
        for (let i = 0; i <= totalDays; i++) {
            const d = new Date(this.startDate);
            d.setDate(d.getDate() + i);
            const cell = document.createElement('div');
            cell.className = 'gantt-day-cell';
            
            // Подсветка сегодняшнего дня
            if (d.toDateString() === new Date().toDateString()) {
                cell.classList.add('today');
            }
            
            cell.textContent = `${d.getDate()}.${d.getMonth() + 1}`;
            timeline.appendChild(cell);
        }
        header.appendChild(timeline);
        this.container.appendChild(header);

        // 2. Тело диаграммы (строки пользователей)
        const body = document.createElement('div');
        body.style.width = `${totalWidth}px`;

        Object.keys(this.users).forEach(username => {
            const uData = this.users[username];
            // Если свернуто, показываем только самую важную задачу, иначе все
            const tasksToRender = uData.expanded ? uData.tasks : [uData.tasks[0]];

            tasksToRender.forEach((task, index) => {
                const row = document.createElement('div');
                row.className = 'gantt-row';

                // Ячейка с именем
                const label = document.createElement('div');
                label.className = 'gantt-user-label';
                
                const nameSpan = document.createElement('span');
                nameSpan.textContent = username;
                label.appendChild(nameSpan);

                // Кнопка сворачивания/разворачивания (только для первой строки пользователя)
                if (index === 0 && uData.tasks.length > 1) {
                    const btn = document.createElement('button');
                    btn.className = 'toggle-btn';
                    btn.textContent = uData.expanded ? '−' : '+';
                    btn.onclick = (e) => {
                        e.stopPropagation();
                        uData.expanded = !uData.expanded;
                        this.render();
                    };
                    label.appendChild(btn);
                }
                row.appendChild(label);

                // Трек для задачи
                const track = document.createElement('div');
                track.style.flexGrow = '1';
                track.style.position = 'relative';
                
                this.renderBar(task, track, totalDays);
                row.appendChild(track);

                body.appendChild(row);
            });
        });

        this.container.appendChild(body);
    }

    /**
     * Отрисовка полоски задачи
     */
    renderBar(task, container, totalDays) {
        const startDiff = (task.startDate - this.startDate) / (1000 * 60 * 60 * 24);
        const duration = (task.endDate - task.startDate) / (1000 * 60 * 60 * 24) + 1;
        
        const left = startDiff * this.dayWidth;
        const width = duration * this.dayWidth;

        const bar = document.createElement('div');
        bar.className = `gantt-bar ${task.priority.toLowerCase()}`;
        bar.style.left = `${left}px`;
        bar.style.width = `${width}px`;
        bar.dataset.taskId = task.id;

        // Контент: Название и прогресс чекпоинтов
        let contentHtml = `<span>${task.title}</span>`;
        
        if (task.checkpoints && task.checkpoints !== '[]') {
            try {
                const cps = JSON.parse(task.checkpoints);
                const done = cps.filter(c => c.done).length;
                const total = cps.length;
                const percent = (done / total) * 100;
                
                // Фон прогресса
                const progressDiv = document.createElement('div');
                progressDiv.className = 'checkpoint-progress';
                progressDiv.style.width = `${percent}%`;
                bar.appendChild(progressDiv);
                
                // Текст (Название (2/5))
                contentHtml = `<span>${task.title} (${done}/${total})</span>`;
            } catch (e) {}
        }

        // Индикатор высокой важности (красная точка)
        if (task.priority === 'Высокая') {
            const dot = document.createElement('div');
            dot.className = 'priority-dot';
            bar.appendChild(dot);
        }

        // Вставляем текст после прогресс-бара, чтобы он был поверх
        const textSpan = document.createElement('div');
        textSpan.innerHTML = contentHtml;
        textSpan.style.pointerEvents = 'none'; // Чтобы клик проходил на бар
        textSpan.style.whiteSpace = 'nowrap';
        textSpan.style.overflow = 'hidden';
        textSpan.style.textOverflow = 'ellipsis';
        bar.appendChild(textSpan);

        // Обрезание справа, если задача выходит за пределы вида
        if (task.endDate > this.endDate) {
            bar.classList.add('clipped-right');
            bar.onmouseenter = (e) => {
                const tt = document.getElementById('tooltip');
                tt.textContent = `Дедлайн: ${new Date(task.date).toLocaleDateString()}`;
                tt.style.display = 'block';
                tt.style.left = e.pageX + 10 + 'px';
                tt.style.top = e.pageY + 10 + 'px';
            };
            bar.onmouseleave = () => {
                document.getElementById('tooltip').style.display = 'none';
            };
        }

        // Клик для открытия модалки
        bar.onclick = () => {
            if (window.openTaskModal) window.openTaskModal(task.id);
        };

        // Drag & Drop логика (изменение дат)
        this.makeDraggable(bar, task);

        container.appendChild(bar);
    }

    /**
     * Реализация перетаскивания для изменения дат
     */
    makeDraggable(element, task) {
        let isDragging = false;
        let startX = 0;
        let initialLeft = 0;
        let initialWidth = 0;
        let mode = 'move'; // 'move', 'resize-l', 'resize-r'

        element.onmousedown = (e) => {
            e.stopPropagation(); // Чтобы не триггерить другие события
            const rect = element.getBoundingClientRect();
            const offset = e.clientX - rect.left;
            
            // Определение зоны клика (края для ресайза)
            if (offset < 10) mode = 'resize-l';
            else if (offset > rect.width - 10) mode = 'resize-r';
            else mode = 'move';

            isDragging = true;
            startX = e.clientX;
            initialLeft = parseFloat(element.style.left);
            initialWidth = parseFloat(element.style.width);
            
            document.onmousemove = onMouseMove;
            document.onmouseup = onMouseUp;
        };

        const onMouseMove = (e) => {
            if (!isDragging) return;
            const deltaX = e.clientX - startX;

            if (mode === 'move') {
                element.style.left = `${initialLeft + deltaX}px`;
            } else if (mode === 'resize-r') {
                let newW = initialWidth + deltaX;
                // Минимальная ширина 1 день
                if (newW < this.dayWidth) newW = this.dayWidth;
                element.style.width = `${newW}px`;
            } else if (mode === 'resize-l') {
                let newL = initialLeft + deltaX;
                let newW = initialWidth - deltaX;
                // Минимальная ширина 1 день
                if (newW < this.dayWidth) {
                    newW = this.dayWidth;
                    newL = initialLeft + initialWidth - this.dayWidth;
                }
                element.style.left = `${newL}px`;
                element.style.width = `${newW}px`;
            }
        };

        const onMouseUp = async (e) => {
            if (!isDragging) return;
            isDragging = false;
            document.onmousemove = null;
            document.onmouseup = null;

            // Расчет новых дат на основе финальной позиции
            const currentLeft = parseFloat(element.style.left);
            const daysOffset = Math.round(currentLeft / this.dayWidth);
            
            const newStart = new Date(this.startDate);
            newStart.setDate(newStart.getDate() + daysOffset);

            const currentWidth = parseFloat(element.style.width);
            const durationDays = Math.round(currentWidth / this.dayWidth);
            
            const newEnd = new Date(newStart);
            newEnd.setDate(newEnd.getDate() + durationDays - 1);

            // Отправка обновлений на сервер
            await this.updateTaskDates(task.id, newStart, newEnd);
            
            // Перезагрузка данных для синхронизации
            this.fetchData();
        };
    }

    /**
     * Обновление дат задачи на сервере
     */
    async updateTaskDates(taskId, start, end) {
        // Формируем payload для обновления
        // Нам нужно получить текущие данные задачи, чтобы не потерять другие поля
        // Но для простоты отправим только даты, предполагая, что бэкенд умеет их принимать
        // Или лучше вызвать full update, если API требует все поля
        
        // В данном случае мы используем существующий PUT /api/tasks/{id}, но нам нужны остальные поля.
        // Поэтому сначала получаем задачу, меняем даты и отправляем обратно.
        
        try {
            const res = await fetch(`/api/tasks/${taskId}`);
            const taskData = await res.json();
            
            taskData.start_date = start.toISOString().split('T')[0];
            taskData.date = end.toISOString().split('T')[0];
            
            await fetch(`/api/tasks/${taskId}`, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(taskData)
            });
        } catch (e) {
            console.error("Ошибка обновления дат:", e);
            alert("Не удалось сохранить изменения");
        }
    }
}

// Создаем глобальный экземпляр
window.ganttChart = new GanttChart();