// ─── ПОИСК ──────────────────────────────────────────────────────────────────

function initSearchListener() {
    const searchInput = document.getElementById('global-search-input');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        clearTimeout(searchTimeout);
        if (query.length < 2) {
            document.getElementById('search-results-dropdown').style.display = 'none';
            return;
        }
        searchTimeout = setTimeout(() => performSearch(query), 400);
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            const drop = document.getElementById('search-results-dropdown');
            if (drop) drop.style.display = 'none';
        }
    });
}

async function performSearch(query) {
    if (!activeBoardId) return;
    const res = await fetch(`/api/boards/${activeBoardId}/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) return;

    const data     = await res.json();
    const dropdown = document.getElementById('search-results-dropdown');
    dropdown.innerHTML = '';
    let hasResults = false;

    const categories = [
        { key: 'board',   name: 'Доска',              icon: '📝' },
        { key: 'backlog', name: 'Бэклог',              icon: '☰' },
        { key: 'archive', name: 'Архив',               icon: '📦' },
        { key: 'chat',    name: 'Чат',                 icon: '💬' },
        { key: 'logs',    name: 'Журнал действий',     icon: '📋' }
    ];

    categories.forEach(cat => {
        if (!data[cat.key] || data[cat.key].length === 0) return;
        hasResults = true;

        const catHeader       = document.createElement('div');
        catHeader.className   = 'search-category-header';
        catHeader.innerText   = `${cat.icon} ${cat.name}`;
        dropdown.appendChild(catHeader);

        data[cat.key].forEach(item => {
            const row     = document.createElement('div');
            row.className = 'search-result-item';

            if (['board', 'backlog', 'archive'].includes(cat.key)) {
                row.innerText = item.title;
                row.onclick   = () => { dropdown.style.display = 'none'; openTaskFromChat(item.id); };
            } else if (cat.key === 'chat') {
                row.innerHTML = `<strong>${item.username}:</strong> <span style="font-size: 11px;">${item.content}</span>`;
                row.onclick   = () => {
                    dropdown.style.display = 'none';
                    const chat = document.getElementById('chat-sidebar');
                    if (chat.style.display === 'none') toggleChat();
                };
            } else if (cat.key === 'logs') {
                row.innerHTML = `<strong>${item.username}:</strong> <span style="font-size: 11px;">${item.content}</span>`;
                row.onclick   = () => { dropdown.style.display = 'none'; switchView('analytics'); openLogsViewer(); };
            }

            dropdown.appendChild(row);
        });
    });

    if (!hasResults) {
        dropdown.innerHTML = '<div style="padding: 10px; text-align: center; color: #777; font-size: 12px;">Нет совпадений</div>';
    }

    dropdown.style.display = 'block';
}
