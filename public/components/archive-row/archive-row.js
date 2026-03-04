/**
 * archive-row — Expandable row for archived tasks on the Archive page.
 *
 * API:
 *   setTask(task, { epicName, epicColor, categoryName, categoryIcon })
 *
 * Events dispatched:
 *   restore-task (bubbles, composed) — { detail: { taskId } }
 */
class ArchiveRow extends HTMLElement {
    /** @type {[string, string]|null} Cached [html, css] templates */
    static templateCache = null;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._task = null;
        this._meta = null;
        this._expanded = false;
    }

    async connectedCallback() {
        if (!ArchiveRow.templateCache) {
            ArchiveRow.templateCache = Promise.all([
                fetch('/components/archive-row/archive-row.html').then(r => r.text()),
                fetch('/components/archive-row/archive-row.css').then(r => r.text())
            ]);
        }
        const [html, css] = await ArchiveRow.templateCache;

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
        const header = this.shadowRoot.querySelector('.js-header');
        const restoreBtn = this.shadowRoot.querySelector('.js-restoreBtn');

        header.addEventListener('click', (e) => {
            // Don't toggle if clicking the restore button or expand button
            if (e.target.closest('.js-restoreBtn')) return;
            this._toggleExpand();
        });

        restoreBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!this._task) return;
            this.dispatchEvent(new CustomEvent('restore-task', {
                bubbles: true,
                composed: true,
                detail: { taskId: this._task.id }
            }));
        });
    }

    _toggleExpand() {
        this._expanded = !this._expanded;
        const panel = this.shadowRoot.querySelector('.js-panel');
        const chevron = this.shadowRoot.querySelector('.js-chevron');
        if (panel) panel.hidden = !this._expanded;
        if (chevron) chevron.classList.toggle('--open', this._expanded);
    }

    _hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    _getCompletedDate(task) {
        if (task.log && task.log.length > 0) {
            return task.log[task.log.length - 1].date;
        }
        return task.createdDate ? task.createdDate.split('T')[0] : '';
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
            categoryIconEl.textContent = meta.categoryIcon ? this._getIconChar(meta.categoryIcon) : '';
        }

        // Completed date
        const dateEl = this.shadowRoot.querySelector('.js-date');
        if (dateEl) {
            const rawDate = this._getCompletedDate(task);
            dateEl.textContent = this._formatDate(rawDate);
        }

        // Panel: description
        const descEl = this.shadowRoot.querySelector('.js-desc');
        if (descEl) {
            if (task.description) {
                descEl.style.display = '';
                descEl.textContent = task.description;
            } else {
                descEl.style.display = 'none';
            }
        }

        // Panel: meta (created, deadline)
        const metaEl = this.shadowRoot.querySelector('.js-meta');
        if (metaEl) {
            const parts = [];
            if (task.createdDate) {
                parts.push(`Created: ${this._formatDate(task.createdDate.split('T')[0])}`);
            }
            if (task.deadline) {
                parts.push(`Deadline: ${this._formatDate(task.deadline.split('T')[0])}`);
            } else {
                parts.push('Deadline: None');
            }
            metaEl.textContent = parts.join('   ');
        }

        // Panel: activity log
        const logSectionEl = this.shadowRoot.querySelector('.js-logSection');
        if (logSectionEl) {
            if (task.log && task.log.length > 0) {
                const reversedLog = [...task.log].reverse();
                const entriesHtml = reversedLog.map(entry => `
                    <div class="archiveRow__logEntry">
                        <span class="archiveRow__logDate">${entry.date || ''}</span>
                        ${this._escapeHtml(entry.action || '')}
                    </div>
                `).join('');
                logSectionEl.innerHTML = `
                    <div class="archiveRow__logTitle">Activity Log</div>
                    ${entriesHtml}
                `;
            } else {
                logSectionEl.innerHTML = '';
            }
        }

        // Restore expanded panel state
        const panel = this.shadowRoot.querySelector('.js-panel');
        if (panel) panel.hidden = !this._expanded;
        const chevron = this.shadowRoot.querySelector('.js-chevron');
        if (chevron) chevron.classList.toggle('--open', this._expanded);
    }

    _getIconChar(iconName) {
        // Map icon names (Bootstrap icons used in categories) to unicode chars
        const map = {
            // Bootstrap icon names used in categories
            'inbox': '📥',
            'code-slash': '⌨',
            'chat-text': '💬',
            'pin-angle': '📌',
            'lightning': '⚡',
            'box-seam': '📦',
            // Legacy svg-icon names
            'close': '×',
            'edit': '✏',
            'newTab': '↗',
            'star': '★',
            'plus': '+',
        };
        return map[iconName] || '•';
    }

    _escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}

customElements.define('archive-row', ArchiveRow);
