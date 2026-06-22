// ─── ГЛОБАЛЬНОЕ СОСТОЯНИЕ ПРИЛОЖЕНИЯ ───────────────────────────────────────

window.isDraggingActive = false;
let currentTasks = [];
let currentBoards = [];
let activeUser = null;
let activeBoardData = null;
let activeBoardId = null;
let editingTaskId = null;
let targetColumnStatus = 'todo';
let currentSortMethod = 'none';
let boardSocket = null;
let currentOpenedTask = null;
let isGuest = true;
let currentFilters = { assignees: [], priorities: [], deadline: 'all' };
let columnSortable = null;
let currentArchivedColId = null;
let openMenuColumnId = null;
let searchTimeout = null;
let activeTaskCheckpoints = [];
let isDraggingTask = false;
let selectedRole = 'student';

// Переменные для прикреплённой к чату задачи
let linkedChatTaskId = null;
let linkedChatTaskTitle = null;

// ─── КОНСТАНТЫ ──────────────────────────────────────────────────────────────

const statusMap = {
    'todo': 'В планах',
    'in_progress': 'В разработке',
    'done': 'Готово'
};

// ─── НАСТРОЙКИ SORTABLE ─────────────────────────────────────────────────────

Sortable.defaults = {
    animation: 0,
    delay: 0,
    delayOnTouchOnly: false,
    touchStartThreshold: 0,
    forceFallback: true,
    fallbackTolerance: 0,
    ghostClass: 'sortable-ghost',
    dragClass: 'sortable-drag',
};
