class KanbanColumn extends HTMLElement {
    /** @type {[string, string]|null} Cached [html, css] templates */
    static templateCache = null;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._ready = new Promise(resolve => this._resolveReady = resolve);
        this._dropIndicator = null;
        this._currentIndicatorPosition = -1;
    }

    async connectedCallback() {
        if (!KanbanColumn.templateCache) {
            KanbanColumn.templateCache = await Promise.all([
                fetch('/components/kanban-column/kanban-column.html').then(response => response.text()),
                fetch('/components/kanban-column/kanban-column.css').then(response => response.text())
            ]);
        }
        const [html, css] = KanbanColumn.templateCache;

        const style = document.createElement('style');
        style.textContent = css;

        this.shadowRoot.innerHTML = html;
        this.shadowRoot.prepend(style);

        this.columnList = this.shadowRoot.querySelector('.column__list');
        this.status = this.dataset.status;
        this.columnList.dataset.status = this.status;

        // Create reusable drop indicator element
        this._dropIndicator = document.createElement('div');
        this._dropIndicator.className = 'column__dropIndicator';

        this.addDragAndDropListeners();
        this._resolveReady(); // Signal that the component is ready
    }

    addDragAndDropListeners() {
        this.columnList.addEventListener('dragover', this.handleDragOver.bind(this));
        this.columnList.addEventListener('dragenter', this.handleDragEnter.bind(this));
        this.columnList.addEventListener('dragleave', this.handleDragLeave.bind(this));
        this.columnList.addEventListener('drop', this.handleDrop.bind(this));
    }

    async renderTasks(tasks, taskRenderer) {
        await this._ready; // Wait until the component is initialized
        this.columnList.innerHTML = '';

        if (tasks.length === 0) {
            this.columnList.innerHTML = '<div class="emptyState">No tasks</div>';
            return;
        }

        tasks.forEach((task, index) => {
            const card = taskRenderer(task, index, tasks.length);
            this.columnList.appendChild(card);
        });
    }

    /**
     * Calculates the drop position index based on mouse Y coordinate.
     * @param {number} clientY - The mouse Y position
     * @returns {number} The 0-based insertion index
     */
    _getDropPosition(clientY) {
        const cards = Array.from(this.columnList.querySelectorAll('task-card:not(.--dragging)'));
        let position = cards.length;

        for (let i = 0; i < cards.length; i++) {
            const rect = cards[i].getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            if (clientY < midY) {
                position = i;
                break;
            }
        }

        return position;
    }

    /**
     * Shows the drop indicator line at the calculated position.
     * @param {number} position - The insertion index
     */
    _showDropIndicator(position) {
        // Skip DOM manipulation if position hasn't changed
        if (position === this._currentIndicatorPosition && this._dropIndicator.parentNode) {
            return;
        }

        const cards = Array.from(this.columnList.querySelectorAll('task-card:not(.--dragging)'));

        // Remove indicator from current position before reinserting
        if (this._dropIndicator.parentNode) {
            this._dropIndicator.remove();
        }

        if (position >= cards.length) {
            this.columnList.appendChild(this._dropIndicator);
        } else {
            this.columnList.insertBefore(this._dropIndicator, cards[position]);
        }

        this._currentIndicatorPosition = position;
    }

    /**
     * Removes the drop indicator from the column.
     */
    removeDropIndicator() {
        if (this._dropIndicator && this._dropIndicator.parentNode) {
            this._dropIndicator.remove();
        }
        this._currentIndicatorPosition = -1;
    }

    // Drag and Drop Handlers
    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const position = this._getDropPosition(e.clientY);
        this._showDropIndicator(position);
    }

    handleDragEnter(e) {
        e.preventDefault();
        this.columnList.classList.add('--dragOver');
    }

    handleDragLeave(e) {
        if (!this.columnList.contains(e.relatedTarget)) {
            this.columnList.classList.remove('--dragOver');
            this.removeDropIndicator();
        }
    }

    handleDrop(e) {
        e.preventDefault();
        this.columnList.classList.remove('--dragOver');
        this.removeDropIndicator();

        const taskId = e.dataTransfer.getData('text/plain');
        if (!taskId) return;

        const newPosition = this._getDropPosition(e.clientY);

        this.dispatchEvent(new CustomEvent('task-dropped', {
            bubbles: true,
            composed: true,
            detail: {
                taskId,
                newStatus: this.status,
                newPosition
            }
        }));
    }
}

customElements.define('kanban-column', KanbanColumn);
