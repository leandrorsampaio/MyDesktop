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
        const list = this.columnList;

        // Keep the list free of anything but task-cards so the index-based
        // placement below lines up.
        this.removeDropIndicator();
        const emptyState = list.querySelector('.emptyState');
        if (emptyState) emptyState.remove();

        if (tasks.length === 0) {
            list.innerHTML = '<div class="emptyState">No tasks</div>';
            return;
        }

        // Reconcile against what is already on screen instead of wiping the
        // list. A blanket `innerHTML = ''` destroyed and rebuilt every card in
        // every column on every move — and since `task-card` runs a 0.3s
        // fadeIn on mount, the whole board visibly blinked twice per drag
        // (moveTask renders optimistically, then again after fetchTasks).
        // Reusing elements means only genuinely new cards animate.
        const existing = new Map(
            Array.from(list.querySelectorAll('task-card')).map(el => [el.dataset.taskId, el])
        );

        // Drop departed cards BEFORE placing the rest. Doing it afterwards
        // makes the index-based placement below re-insert every card that sat
        // after the departed one — and re-inserting a node restarts its CSS
        // animation, so a card leaving position 0 would replay fadeIn on the
        // whole column even though every element was reused.
        const wanted = new Set(tasks.map(t => t.id));
        existing.forEach((el, id) => {
            if (!wanted.has(id)) {
                el.remove();
                existing.delete(id);
            }
        });

        tasks.forEach((task, index) => {
            // The renderer builds a detached element — cheap, because
            // connectedCallback (and its template fetch) only runs on insert.
            const fresh = taskRenderer(task, index, tasks.length);
            let card = existing.get(task.id);

            if (card) {
                existing.delete(task.id);
                KanbanColumn._syncCard(card, fresh);   // reuse: no re-mount, no fadeIn
            } else {
                card = fresh;
                card.classList.add('--enter');         // only new cards animate in
            }

            // Everything before `index` is already in place, so this both
            // inserts new cards and reorders moved ones.
            if (list.children[index] !== card) {
                list.insertBefore(card, list.children[index] || null);
            }

            // Drop .--enter once the mount animation is done, so a later
            // re-insertion (reordering shifts the cards below a moved one)
            // cannot replay it.
            if (card.classList.contains('--enter')) {
                const [enter] = card.getAnimations();
                enter?.finished
                    .then(() => card.classList.remove('--enter'))
                    .catch(() => {});
            }
        });
    }

    /**
     * Copies renderer-owned state from a freshly built card onto the live one,
     * so an existing element can be reused instead of replaced.
     *
     * Only `data-*` attributes and classes are touched — those are what
     * createTaskCard() owns. `hidden` (filter state), `tabindex` and
     * `draggable` belong to the filters and the component itself and are left
     * alone; `--dragging` (drag state) and `--enter` (in-flight mount
     * animation) are transient and have to survive a re-render.
     *
     * @param {HTMLElement} target - The live card to update
     * @param {HTMLElement} source - The detached card holding the new state
     */
    static _syncCard(target, source) {
        for (const { name, value } of Array.from(source.attributes)) {
            if (name.startsWith('data-') && target.getAttribute(name) !== value) {
                target.setAttribute(name, value);
            }
        }
        for (const { name } of Array.from(target.attributes)) {
            if (name.startsWith('data-') && !source.hasAttribute(name)) {
                target.removeAttribute(name);
            }
        }

        if (target.className !== source.className) {
            // --dragging is transient drag state and --enter is an in-flight
            // mount animation; neither is the renderer's to clear.
            const keep = ['--dragging', '--enter'].filter(c => target.classList.contains(c));
            target.className = source.className;
            if (keep.length) target.classList.add(...keep);
        }
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

    /**
     * True when the drag is carrying files from outside the page rather than a
     * task card being reordered. File drops are the attachment feature's
     * business (app.js wires them per card) — the column must stand aside so
     * it doesn't draw a drop indicator or try to move a task that isn't there.
     * @param {DragEvent} e
     * @returns {boolean}
     */
    _isFileDrag(e) {
        return Array.from(e.dataTransfer?.types || []).includes('Files');
    }

    handleDragOver(e) {
        if (this._isFileDrag(e)) return;
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
        if (this._isFileDrag(e)) return;
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
        if (this._isFileDrag(e)) return;
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
