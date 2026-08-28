/**
 * proposal-row — one AI-proposed change awaiting review.
 *
 * The AI never writes to the board. Everything it wants to change lands in a
 * review buffer and appears here, where a human decides. This row is that
 * decision point, so it has to say three things plainly: what would change,
 * to which task, and why.
 *
 * API:
 *   setProposal(proposal, { taskTitle, columnName, epicName, categoryName })
 *
 * Events dispatched (both bubble + composed):
 *   apply-proposal  — { detail: { proposalId } }
 *   reject-proposal — { detail: { proposalId } }
 */

import { escapeHtml } from '../../js/utils.js';

/** Verb shown per proposal kind, and the modifier class that styles it. */
const KIND_LABELS = {
    update: { label: 'Update', modifier: '--update' },
    move:   { label: 'Move',   modifier: '--move'   },
    delete: { label: 'Delete', modifier: '--delete' }
};

/** Human-readable names for the payload fields an update can carry. */
const FIELD_LABELS = {
    title: 'title',
    description: 'description',
    priority: 'priority',
    category: 'category',
    epicId: 'epic',
    points: 'size',
    deadline: 'deadline'
};

class ProposalRow extends HTMLElement {
    /** @type {Promise<[string, string]>|null} Cached templates Promise — store
     * the Promise (not the resolved value) so concurrent connectedCallback()
     * calls don't each trigger their own fetch. See SPEC Code Rule 7. */
    static templateCache = null;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._proposal = null;
        this._meta = {};
    }

    async connectedCallback() {
        if (!ProposalRow.templateCache) {
            ProposalRow.templateCache = Promise.all([
                fetch('/components/proposal-row/proposal-row.html').then(r => r.text()),
                fetch('/components/proposal-row/proposal-row.css').then(r => r.text())
            ]);
        }
        const [html, css] = await ProposalRow.templateCache;

        const style = document.createElement('style');
        style.textContent = css;
        this.shadowRoot.innerHTML = html;
        this.shadowRoot.prepend(style);

        this._wireEvents();
        if (this._proposal) this._render();
    }

    /**
     * @param {Object} proposal
     * @param {{taskTitle?: string, columnName?: string, epicName?: string, categoryName?: string}} meta
     */
    setProposal(proposal, meta = {}) {
        this._proposal = proposal;
        this._meta = meta;
        if (this.shadowRoot.childElementCount > 1) this._render();
    }

    _wireEvents() {
        this.shadowRoot.querySelector('.js-applyBtn').addEventListener('click', () => {
            if (!this._proposal) return;
            this.dispatchEvent(new CustomEvent('apply-proposal', {
                bubbles: true, composed: true, detail: { proposalId: this._proposal.id }
            }));
        });
        this.shadowRoot.querySelector('.js-rejectBtn').addEventListener('click', () => {
            if (!this._proposal) return;
            this.dispatchEvent(new CustomEvent('reject-proposal', {
                bubbles: true, composed: true, detail: { proposalId: this._proposal.id }
            }));
        });
    }

    /**
     * Describes the change in one line, so the row can be judged without
     * opening anything.
     * @returns {string}
     */
    _describe() {
        const p = this._proposal;
        if (p.kind === 'delete') return 'Remove from the board';
        if (p.kind === 'move')   return `→ ${this._meta.columnName || p.payload.newStatus}`;

        return Object.keys(p.payload)
            .map(field => this._describeField(field, p.payload[field]))
            .filter(Boolean)
            .join(', ');
    }

    /**
     * @param {string} field
     * @param {*} value
     * @returns {string}
     */
    _describeField(field, value) {
        const label = FIELD_LABELS[field] || field;
        if (field === 'epicId') return `${label} → ${this._meta.epicName || 'none'}`;
        if (field === 'category') return `${label} → ${this._meta.categoryName || value}`;
        if (field === 'priority') return value ? 'mark priority' : 'clear priority';
        if (field === 'deadline') return value ? `${label} → ${String(value).split('T')[0]}` : 'clear deadline';
        if (field === 'description') return 'rewrite description';
        if (field === 'title') return `${label} → "${value}"`;
        return `${label} → ${value}`;
    }

    _render() {
        const p = this._proposal;
        const kind = KIND_LABELS[p.kind] || { label: p.kind, modifier: '' };

        const kindEl = this.shadowRoot.querySelector('.js-kind');
        kindEl.textContent = kind.label;
        kindEl.className = `proposalRow__kind js-kind ${kind.modifier}`;

        this.shadowRoot.querySelector('.js-taskTitle').textContent =
            this._meta.taskTitle || p.taskId;
        this.shadowRoot.querySelector('.js-change').textContent = this._describe();

        const reasonEl = this.shadowRoot.querySelector('.js-reason');
        reasonEl.textContent = p.reason || '';
        reasonEl.hidden = !p.reason;

        // Deleting is the one irreversible verb here, so its button carries the
        // danger styling rather than the neutral "apply". Buttons are styled
        // locally with the shared tokens, matching backlog-row and
        // ai-staged-row — document `.btn` rules don't cross the shadow boundary.
        const applyBtn = this.shadowRoot.querySelector('.js-applyBtn');
        applyBtn.className = p.kind === 'delete'
            ? 'proposalRow__btn --danger js-applyBtn'
            : 'proposalRow__btn --apply js-applyBtn';
        applyBtn.textContent = p.kind === 'delete' ? 'Delete' : 'Apply';
    }
}

customElements.define('proposal-row', ProposalRow);
