/**
 * report-row — Flat row for reports on the Reports page.
 *
 * API:
 *   setReport(report)
 *
 * Events dispatched:
 *   view-report   (bubbles, composed) — { detail: { reportId } }
 *   delete-report (bubbles, composed) — { detail: { reportId } }
 */
class ReportRow extends HTMLElement {
    /** @type {Promise<[string, string]>|null} Cached fetch Promise for [html, css] */
    static templateCache = null;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._report = null;
    }

    async connectedCallback() {
        if (!ReportRow.templateCache) {
            ReportRow.templateCache = Promise.all([
                fetch('/components/report-row/report-row.html').then(r => r.text()),
                fetch('/components/report-row/report-row.css').then(r => r.text())
            ]);
        }
        const [html, css] = await ReportRow.templateCache;

        const style = document.createElement('style');
        style.textContent = css;
        this.shadowRoot.innerHTML = html;
        this.shadowRoot.prepend(style);

        this._wireEvents();

        if (this._report) {
            this._render();
        }
    }

    /**
     * Sets report data and re-renders the row.
     * @param {Object} report
     */
    setReport(report) {
        this._report = report;
        if (this.shadowRoot.childElementCount > 1) {
            this._render();
        }
    }

    _wireEvents() {
        const deleteBtn = this.shadowRoot.querySelector('.js-deleteBtn');
        const header = this.shadowRoot.querySelector('.js-header');

        header.addEventListener('click', (e) => {
            if (e.target.closest('.js-deleteBtn')) return;
            if (!this._report) return;
            this.dispatchEvent(new CustomEvent('view-report', {
                bubbles: true,
                composed: true,
                detail: { reportId: this._report.id }
            }));
        });

        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!this._report) return;
            this.dispatchEvent(new CustomEvent('delete-report', {
                bubbles: true,
                composed: true,
                detail: { reportId: this._report.id }
            }));
        });
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
        const report = this._report;

        const titleEl = this.shadowRoot.querySelector('.js-title');
        if (titleEl) titleEl.textContent = report.title || '';

        const dateEl = this.shadowRoot.querySelector('.js-date');
        if (dateEl) dateEl.textContent = this._formatDate(report.generatedDate);
    }
}

customElements.define('report-row', ReportRow);
