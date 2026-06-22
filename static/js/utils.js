// ─── ВСПОМОГАТЕЛЬНЫЕ УТИЛИТЫ ────────────────────────────────────────────────

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function setupDropdown(triggerId, dropId) {
    document.getElementById(triggerId).onclick = (e) => {
        e.stopPropagation();

        if (isGuest && triggerId === 'avatar-trigger') {
            showLogin();
            return;
        }

        const el = document.getElementById(dropId);
        const opened = el.style.display === 'block';
        document.querySelectorAll('.dropdown-menu').forEach(m => m.style.display = 'none');
        el.style.display = opened ? 'none' : 'block';
    };
}

function toggleColumnMenu(menuId, event) {
    event.stopPropagation();
    const el = document.getElementById(menuId);
    const opened = el.style.display === 'block';
    document.querySelectorAll('.dropdown-menu').forEach(m => m.style.display = 'none');
    el.style.display = opened ? 'none' : 'block';

    // ← добавить:
    const match = menuId.match(/^menu-wip-(.+)$/);
    openMenuColumnId = (!opened && match) ? match[1] : null;
}

window.setModalDateFields = function (dateStr, dateId, timeId) {
    if (dateStr) {
        const parts = dateStr.split('T');
        document.getElementById(dateId).value = parts[0];
        document.getElementById(timeId).value = parts.length > 1 ? parts[1] : '00:00';
    } else {
        document.getElementById(dateId).value = '';
        document.getElementById(timeId).value = '00:00';
    }
};

window.getModalDateString = function (dateId, timeId) {
    const dateVal = document.getElementById(dateId).value;
    const timeVal = document.getElementById(timeId).value || '00:00';
    return dateVal ? `${dateVal}T${timeVal}` : '';
};

window.updateCharCounter = function () {
    const descriptionInput = document.getElementById('modal-description');
    const counterSpan = document.getElementById('char-counter');
    if (!descriptionInput || !counterSpan) return;

    const maxLength = 3000;
    const remaining = maxLength - descriptionInput.value.length;

    counterSpan.textContent = remaining;
    counterSpan.style.color = remaining <= 0 ? '#cc0000' : '';
};
