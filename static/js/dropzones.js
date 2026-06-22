// ─── ТУЛТИПЫ И СОБЫТИЯ БОКОВЫХ ЗОН ─────────────────────────────────────────

function initDropzoneTooltips() {
    const tooltip = document.getElementById('drag-tooltip');
    if (!tooltip) return;

    // Клик по зоне без перетаскивания — переход в соответствующий раздел
    const backlogZone = document.getElementById('dropzone-backlog');
    if (backlogZone) {
        backlogZone.addEventListener('click', () => {
            if (!isDraggingTask && activeBoardId) {
                switchView('analytics');
                window.openBacklogViewer();
            }
        });
    }

    const archiveZone = document.getElementById('dropzone-archive');
    if (archiveZone) {
        archiveZone.addEventListener('click', () => {
            if (!isDraggingTask && activeBoardId) {
                switchView('analytics');
                window.openArchiveViewer();
            }
        });
    }

    const zones = [
        { id: 'dropzone-backlog',  text: 'Перенести в Бэклог' },
        { id: 'dropzone-archive',  text: 'Перенести в Архив'  }
    ];

    zones.forEach(z => {
        const el = document.getElementById(z.id);
        if (!el) return;

        el.addEventListener('mousemove', (e) => {
            tooltip.innerText       = z.text;
            tooltip.style.display   = 'block';
            tooltip.style.left      = e.pageX + 'px';
            tooltip.style.top       = (e.pageY - 15) + 'px';
            if (isDraggingTask) el.classList.add('drag-active');
        });

        el.addEventListener('mouseleave', () => {
            tooltip.style.display = 'none';
            el.classList.remove('drag-active');
        });

        el.addEventListener('dragover', (e) => {
            e.preventDefault();
            tooltip.innerText     = z.text;
            tooltip.style.display = 'block';
            tooltip.style.left    = e.pageX + 'px';
            tooltip.style.top     = (e.pageY - 15) + 'px';
            if (isDraggingTask) el.classList.add('drag-active');
        });

        el.addEventListener('dragleave', () => {
            tooltip.style.display = 'none';
            el.classList.remove('drag-active');
        });

        el.addEventListener('drop', () => {
            tooltip.style.display = 'none';
            el.classList.remove('drag-active');
        });
    });
}
