// ─── ТОЧКА ВХОДА ────────────────────────────────────────────────────────────
//
// Порядок подключения в index.html:
//   1. Sortable_min.js        — внешняя библиотека
//   2. js/state.js            — глобальные переменные и константы
//   3. js/utils.js            — вспомогательные функции
//   4. js/auth.js             — авторизация
//   5. js/navigation.js       — навигация / switchView
//   6. js/boards.js           — доски
//   7. js/columns.js          — колонки и WIP
//   8. js/checkpoints.js      — чекпоинты
//   9. js/tasks.js            — карточки задач, фильтры, drag&drop
//  10. js/modal.js            — модальное окно задачи
//  11. js/comments.js         — комментарии к задаче
//  12. js/chat.js             — чат доски
//  13. js/members.js          — участники
//  14. js/analytics.js        — архив, бэклог, логи
//  15. js/search.js           — поиск
//  16. js/dropzones.js        — тултипы боковых зон
//  17. js/roles.js            — роли и ограничения
//  18. js/main.js             — этот файл (инициализация)

document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    initListeners();
    initDropzoneTooltips();
    selectRole('student');
});
