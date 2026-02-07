class KanbanColumn extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._ready = new Promise(resolve => this._resolveReady = resolve);
    }

    async connectedCallback() {
        const [html, css] = await Promise.all([
            fetch('/components/kanban-column/kanban-column.html').then(response => response.text()),
            fetch('/components/kanban-column/kanban-column.css').then(response => response.text())
        ]);

        const style = document.createElement('style');
        style.textContent = css;

        this.shadowRoot.innerHTML = html;
        this.shadowRoot.prepend(style);

        this.columnList = this.shadowRoot.querySelector('.column__list');
        this.status = this.dataset.status;
        this.columnList.dataset.status = this.status;

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

    // Drag and Drop Handlers
    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }

    handleDragEnter(e) {
        e.preventDefault();
        this.columnList.classList.add('--dragOver');
    }

    handleDragLeave(e) {
        if (!this.columnList.contains(e.relatedTarget)) {
            this.columnList.classList.remove('--dragOver');
        }
    }

    handleDrop(e) {
        e.preventDefault();
        this.columnList.classList.remove('--dragOver');
        
        const taskId = e.dataTransfer.getData('text/plain');
        if (!taskId) return;

        const cards = Array.from(this.columnList.querySelectorAll('task-card:not(.--dragging)'));
        let newPosition = cards.length;

        for (let i = 0; i < cards.length; i++) {
            const rect = cards[i].getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            if (e.clientY < midY) {
                newPosition = i;
                break;
            }
        }

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
