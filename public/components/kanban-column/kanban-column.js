class KanbanColumn extends HTMLElement {
    /** @type {Promise<[string, string]>|null} Cached templates Promise — store
     * the Promise (not the resolved value) so concurrent connectedCallback()
     * calls don't each trigger their own fetch. See SPEC Code Rule 7. */
    static templateCache = null;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._ready = new Promise(resolve => this._resolveReady = resolve);
        this._dropIndicator = null;
        this._currentIndicatorPosition = -1;
        this._dragRafId = null;
        this._lastDragY = 0;
    }

    async connectedCallback() {
        if (!KanbanColumn.templateCache) {
            KanbanColumn.templateCache = Promise.all([
                fetch('/components/kanban-column/kanban-column.html').then(response => response.text()),
                fetch('/components/kanban-column/kanban-column.css').then(response => response.text())
            ]);
        }
        const [html, css] = await KanbanColumn.templateCache;

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

    /**
     * Plays the confetti burst around a task card that just landed here.
     *
     * JS does three things only — size the layer to the card, hand it the epic
     * hue, toggle a class. Every bit of motion is CSS keyframes in
     * kanban-column.css, and under prefers-reduced-motion none of it runs.
     *
     * The layer lives outside `.column__list` because that element scrolls:
     * its `overflow-y: auto` makes `overflow-x` compute to `auto` as well, so
     * a burst rendered inside it would be clipped to the list box. Out here it
     * also paints above the cards, so particles are never hidden behind a
     * neighbouring card.
     *
     * @param {string} taskId - The task that just arrived
     */
    async celebrate(taskId) {
        await this._ready;
        const layer = this.shadowRoot.querySelector('.js-celebration');
        const card = this.shadowRoot.querySelector(`task-card[data-task-id="${taskId}"]`);
        if (!layer || !card) return;

        // Position the layer over the card. Rects (not offsets) so the list's
        // current scroll position is accounted for.
        const cardRect = card.getBoundingClientRect();
        const hostRect = this.getBoundingClientRect();
        layer.style.setProperty('--burst-left', `${cardRect.left - hostRect.left}px`);
        layer.style.setProperty('--burst-top', `${cardRect.top - hostRect.top}px`);
        layer.style.setProperty('--burst-width', `${cardRect.width}px`);
        layer.style.setProperty('--burst-height', `${cardRect.height}px`);

        // Epic colour keeps the burst semantic (VISION: colour = epic).
        // Cards with no epic fall back to the accent via the CSS var chain.
        const epicColor = card.dataset.epicColor;
        if (epicColor) {
            layer.style.setProperty('--epic-color', epicColor);
        } else {
            layer.style.removeProperty('--epic-color');
        }

        // Restart cleanly if a burst is already running in this column
        layer.classList.remove('--active');
        void layer.offsetWidth;
        layer.classList.add('--active');

        // The layer carries a single no-op animation spanning the whole burst,
        // so one promise covers all sixteen particles. `finished` rather than
        // an animationend listener: no event plumbing, and it rejects cleanly
        // if a re-render cancels the animation mid-flight.
        const [burst] = layer.getAnimations();
        burst?.finished
            .then(() => layer.classList.remove('--active'))
            .catch(() => {});   // cancelled — nothing to clean up
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
        // Cancel any pending dragover frame so it can't re-insert the
        // indicator after the drag has ended
        if (this._dragRafId !== null) {
            cancelAnimationFrame(this._dragRafId);
            this._dragRafId = null;
        }
        if (this._dropIndicator && this._dropIndicator.parentNode) {
            this._dropIndicator.remove();
        }
        this._currentIndicatorPosition = -1;
    }

    disconnectedCallback() {
        if (this._dragRafId !== null) {
            cancelAnimationFrame(this._dragRafId);
            this._dragRafId = null;
        }
    }

    // Drag and Drop Handlers
    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        // dragover fires per mousemove; the position calculation reads
        // getBoundingClientRect on every card, so throttle it to one
        // calculation per animation frame to avoid layout-read jank
        this._lastDragY = e.clientY;
        if (this._dragRafId !== null) return;
        this._dragRafId = requestAnimationFrame(() => {
            this._dragRafId = null;
            this._showDropIndicator(this._getDropPosition(this._lastDragY));
        });
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
