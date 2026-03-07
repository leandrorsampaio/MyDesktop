/**
 * ai-staged-row — Flat row for AI-staged task proposals.
 *
 * API:
 *   setTask(task, { epicName, epicColor, categoryName, categoryIcon })
 *
 * Events dispatched (all bubble + composed, detail: { taskId }):
 *   ai-edit
 *   ai-clone
 *   ai-promote-backlog
 *   ai-promote-board
 *   ai-delete
 */
class AiStagedRow extends HTMLElement {
    /** @type {Promise<[string, string]>|null} Cached fetch Promise for [html, css] */
    static templateCache = null;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._task = null;
        this._meta = null;
    }

    async connectedCallback() {
        if (!AiStagedRow.templateCache) {
            AiStagedRow.templateCache = Promise.all([
                fetch('/components/ai-staged-row/ai-staged-row.html').then(r => r.text()),
                fetch('/components/ai-staged-row/ai-staged-row.css').then(r => r.text())
            ]);
        }
        const [html, css] = await AiStagedRow.templateCache;

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
     * @param {{ epicName?: string, epicColor?: string, categoryName?: string, categoryIcon?: string }} meta
     */
    setTask(task, meta = {}) {
        this._task = task;
        this._meta = meta;
        if (this.shadowRoot.childElementCount > 1) {
            this._render();
        }
    }

    _wireEvents() {
        const dispatch = (eventName) => (e) => {
            e.stopPropagation();
            if (!this._task) return;
            this.dispatchEvent(new CustomEvent(eventName, {
                bubbles: true,
                composed: true,
                detail: { taskId: this._task.id }
            }));
        };

        this.shadowRoot.querySelector('.js-editBtn').addEventListener('click', dispatch('ai-edit'));
        this.shadowRoot.querySelector('.js-cloneBtn').addEventListener('click', dispatch('ai-clone'));
        this.shadowRoot.querySelector('.js-promoteBacklogBtn').addEventListener('click', dispatch('ai-promote-backlog'));
        this.shadowRoot.querySelector('.js-promoteBoardBtn').addEventListener('click', dispatch('ai-promote-board'));
        this.shadowRoot.querySelector('.js-deleteBtn').addEventListener('click', dispatch('ai-delete'));
    }

    _hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    _render() {
        const task = this._task;
        const meta = this._meta || {};

        // Star (priority)
        const starEl = this.shadowRoot.querySelector('.js-star');
        if (starEl) starEl.style.display = task.priority ? 'inline' : 'none';

        // Title
        const titleEl = this.shadowRoot.querySelector('.js-title');
        if (titleEl) titleEl.textContent = task.title || '';

        // Epic pill
        const epicPillEl = this.shadowRoot.querySelector('.js-epicPill');
        if (epicPillEl) {
            if (meta.epicName && meta.epicColor) {
                epicPillEl.style.display         = 'inline-block';
                epicPillEl.style.backgroundColor = this._hexToRgba(meta.epicColor, 0.12);
                epicPillEl.style.color           = meta.epicColor;
                epicPillEl.textContent           = meta.epicName;
            } else {
                epicPillEl.style.display = 'none';
            }
        }

        // Category
        const categoryIconEl = this.shadowRoot.querySelector('.js-categoryIcon');
        const categoryNameEl = this.shadowRoot.querySelector('.js-categoryName');
        if (categoryNameEl) categoryNameEl.textContent = meta.categoryName || '';
        if (categoryIconEl) {
            categoryIconEl.innerHTML = '';
            if (meta.categoryIcon) {
                const icon = document.createElement('svg-icon');
                icon.setAttribute('icon', meta.categoryIcon);
                icon.setAttribute('size', '12');
                categoryIconEl.appendChild(icon);
            }
        }
    }
}

customElements.define('ai-staged-row', AiStagedRow);
