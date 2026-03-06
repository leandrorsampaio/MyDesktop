/**
 * backlog-row — Flat row for tasks on the Backlog page.
 *
 * API:
 *   setTask(task, { epicName, epicColor, categoryName, categoryIcon })
 *
 * Events dispatched:
 *   backlog-edit    (bubbles, composed) — { detail: { taskId } }
 *   backlog-promote (bubbles, composed) — { detail: { taskId } }
 */
class BacklogRow extends HTMLElement {
    /** @type {Promise<[string, string]>|null} Cached fetch Promise for [html, css] */
    static templateCache = null;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._task = null;
        this._meta = null;
    }

    async connectedCallback() {
        if (!BacklogRow.templateCache) {
            BacklogRow.templateCache = Promise.all([
                fetch('/components/backlog-row/backlog-row.html').then(r => r.text()),
                fetch('/components/backlog-row/backlog-row.css').then(r => r.text())
            ]);
        }
        const [html, css] = await BacklogRow.templateCache;

        const style = document.createElement('style');
        style.textContent = css;
        this.shadowRoot.innerHTML = html;
        this.shadowRoot.prepend(style);

        this._wireEvents();

        if (this._task) {
            this._render();
        }
    }

    /**
     * Sets task data and re-renders the row.
     * @param {Object} task
     * @param {{epicName?: string, epicColor?: string, categoryName?: string, categoryIcon?: string}} meta
     */
    setTask(task, meta = {}) {
        this._task = task;
        this._meta = meta;
        if (this.shadowRoot.childElementCount > 1) {
            this._render();
        }
    }

    _wireEvents() {
        const editBtn    = this.shadowRoot.querySelector('.js-editBtn');
        const promoteBtn = this.shadowRoot.querySelector('.js-promoteBtn');

        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!this._task) return;
            this.dispatchEvent(new CustomEvent('backlog-edit', {
                bubbles: true,
                composed: true,
                detail: { taskId: this._task.id }
            }));
        });

        promoteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!this._task) return;
            this.dispatchEvent(new CustomEvent('backlog-promote', {
                bubbles: true,
                composed: true,
                detail: { taskId: this._task.id }
            }));
        });
    }

    _hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    _formatDate(dateStr) {
        if (!dateStr) return '';
        try {
            return new Date(dateStr).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric'
            });
        } catch {
            return dateStr;
        }
    }

    _render() {
        const task = this._task;
        const meta = this._meta || {};

        // Star
        const starEl = this.shadowRoot.querySelector('.js-star');
        if (starEl) starEl.style.display = task.priority ? 'inline' : 'none';

        // Title
        const titleEl = this.shadowRoot.querySelector('.js-title');
        if (titleEl) titleEl.textContent = task.title || '';

        // Epic pill
        const epicPillEl = this.shadowRoot.querySelector('.js-epicPill');
        if (epicPillEl) {
            if (meta.epicName && meta.epicColor) {
                epicPillEl.style.display = 'inline-block';
                epicPillEl.style.backgroundColor = this._hexToRgba(meta.epicColor, 0.12);
                epicPillEl.style.color = meta.epicColor;
                epicPillEl.textContent = meta.epicName;
            } else {
                epicPillEl.style.display = 'none';
            }
        }

        // Category
        const categoryIconEl = this.shadowRoot.querySelector('.js-categoryIcon');
        const categoryNameEl = this.shadowRoot.querySelector('.js-categoryName');
        if (categoryNameEl) {
            categoryNameEl.textContent = meta.categoryName || '';
        }
        if (categoryIconEl) {
            categoryIconEl.innerHTML = '';
            if (meta.categoryIcon) {
                const icon = document.createElement('svg-icon');
                icon.setAttribute('icon', meta.categoryIcon);
                icon.setAttribute('size', '12');
                categoryIconEl.appendChild(icon);
            }
        }

        // Created date
        const dateEl = this.shadowRoot.querySelector('.js-date');
        if (dateEl) {
            const rawDate = task.createdDate ? task.createdDate.split('T')[0] : '';
            dateEl.textContent = this._formatDate(rawDate);
        }
    }
}

customElements.define('backlog-row', BacklogRow);
