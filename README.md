# Канбан-доска

---

## Возможности

- Доски, задачи, колонки
- Перетаскивание карточек
- Бэклог и архив
- Чат доски
- Журнал действий
- Роли: студент и наставник

---

## Технологический стек

- Python + FastAPI
- SQLite
- HTML + CSS + JavaScript
- SortableJS (Drag&Drop)

---

## Структура
```text
.
├── server.py               # Основной файл сервера (API и WebSocket)
├── schemas.py              # Pydantic-схемы для валидации данных
├── requirements.txt        # Зависимости Python
├── static/
    ├── index.html              # Главная страница
    ├── style.css               # Стили
    ├── Sortable.min.js         # Библиотека для Drag&Drop
    ├── js/                     
    │   ├── state.js            # Глобальное состояние
    │   ├── auth.js             # Авторизация
    │   ├── boards.js           # Доски
    │   ├── columns.js          # Колонки
    │   ├── tasks.js            # Задачи
    │   ├── modal.js            # Модальное окно
    │   ├── chat.js             # Чат
    │   ├── comments.js         # Комментарии
    │   ├── analytics.js        # Аналитика (логи, архив, бэклог)
    │   ├── members.js          # Участники
    │   ├── roles.js            # Роли
    │   ├── search.js           # Поиск
    │   ├── dropzones.js        # Боковые зоны
    │   ├── checkpoints.js      # Чеклисты
    │   ├── navigation.js       # Навигация
    │   ├── utils.js            # Вспомогательные функции
    │   └── main.js             # Точка входа
```
