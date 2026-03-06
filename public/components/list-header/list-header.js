/**
 * list-header — Sortable column header for list pages (archive, backlog, etc.)
 * Inline Web Component (no external .html/.css files).
 *
 * API:
 *   setColumns([{ id, label, sortable? }]) — define columns and re-render
 *
 * Events dispatched:
 *   sort-change (bubbles, composed) — { detail: { field, direction: 'asc'|'desc' } }
 */
class ListHeader extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._columns = [];
        this._sort = { field: null, direction: 'asc' };
    }

    /**
     * Sets column definitions and re-renders.
     * @param {Array<{id: string, label: string, sortable?: boolean}>} columns
     */
    setColumns(columns) {
        this._columns = columns;
        this._render();
    }

    /**
     * Sets the active sort state without dispatching an event (for initial state).
     * @param {string} field
     * @param {'asc'|'desc'} direction
     */
    setSort(field, direction) {
        this._sort = { field, direction };
        this._render();
    }

    _render() {
        const style = `
            :host {
                display: block;
            }
            .listHeader {
                display: flex;
                align-items: center;
                padding: 0 12px;
                height: 36px;
                background: var(--color-bg-tertiary);
                border: 1px solid var(--color-border);
                border-radius: var(--radius-md) var(--radius-md) 0 0;
                user-select: none;
            }
            .listHeader__col {
                display: flex;
                align-items: center;
                gap: 4px;
                font-size: 12px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.4px;
                color: var(--color-text-secondary);
                white-space: nowrap;
                overflow: hidden;
            }
            .listHeader__col.--sortable {
                cursor: pointer;
            }
            .listHeader__col.--sortable:hover {
                color: var(--color-text-primary);
            }
            .listHeader__col.--active {
                color: var(--color-accent-primary);
            }
            .listHeader__arrow {
                font-size: 11px;
                opacity: 0.4;
                flex-shrink: 0;
            }
            .listHeader__col.--active .listHeader__arrow {
                opacity: 1;
            }
            /* Column widths via CSS custom properties */
            .listHeader__col[data-col="title"] {
                flex: var(--archive-col-title, 4);
            }
            .listHeader__col[data-col="epicName"] {
                flex: var(--archive-col-epic, 1.5);
            }
            .listHeader__col[data-col="categoryName"] {
                flex: var(--archive-col-category, 1.5);
            }
            .listHeader__col[data-col="completedDate"] {
                flex: var(--archive-col-date, 1);
            }
            .listHeader__col[data-col="createdDate"] {
                flex: var(--archive-col-date, 1);
            }
            .listHeader__col[data-col="actions"] {
                flex: 0 0 var(--archive-col-actions, 104px);
                justify-content: flex-end;
            }
        `;

        const colsHtml = this._columns.map(col => {
            const isActive = this._sort.field === col.id;
            const isSortable = col.sortable !== false;
            let arrow = '';
            if (isSortable) {
                if (isActive) {
                    arrow = this._sort.direction === 'asc' ? '↑' : '↓';
                } else {
                    arrow = '↕';
                }
            }
            const classes = [
                'listHeader__col',
                isSortable ? '--sortable' : '',
                isActive ? '--active' : ''
            ].filter(Boolean).join(' ');

            return `<div class="${classes}" data-col="${col.id}" data-sortable="${isSortable}">
                <span>${col.label}</span>
                ${isSortable ? `<span class="listHeader__arrow">${arrow}</span>` : ''}
            </div>`;
        }).join('');

        this.shadowRoot.innerHTML = `
            <style>${style}</style>
            <div class="listHeader">${colsHtml}</div>
        `;

        this.shadowRoot.querySelectorAll('.listHeader__col[data-sortable="true"]').forEach(el => {
            el.addEventListener('click', () => this._handleColClick(el.dataset.col));
        });
    }

    _handleColClick(field) {
        if (this._sort.field === field) {
            this._sort.direction = this._sort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            this._sort = { field, direction: 'asc' };
        }
        this._render();
        this.dispatchEvent(new CustomEvent('sort-change', {
            bubbles: true,
            composed: true,
            detail: { field: this._sort.field, direction: this._sort.direction }
        }));
    }
}

customElements.define('list-header', ListHeader);
