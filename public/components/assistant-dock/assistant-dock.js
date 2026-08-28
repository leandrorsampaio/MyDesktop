/**
 * assistant-dock — the assistant as a panel beside the board, not a page.
 *
 * A dock rather than a slide-over: during review the board has to stay visible
 * and interactive, and the rail's existing slide-out panel covers content with
 * a backdrop. This one squeezes the layout instead, so the board keeps working
 * while you talk about it.
 *
 * The conversation itself lives in `js/assistant-chat.js` — the `/:alias/ai`
 * page drives the same controller, so the two surfaces show one thread rather
 * than two copies of it.
 *
 * API:
 *   open(prompt?)  — show the dock; an optional prompt is pre-filled, not sent
 *   close()
 *   toggle()
 *   isOpen
 *   setSuggestions(list)   — board-derived openers for the empty state
 *   setPendingCount(n)     — proposals awaiting review, shown in the header
 *
 * Events dispatched (bubble + composed):
 *   assistant-replied  — { detail: { tasks, proposals } }
 *   assistant-closed
 *   review-proposals   — the header's pending badge was clicked
 */

import * as chat from '../../js/assistant-chat.js';
import { escapeHtml } from '../../js/utils.js';

/** Width bounds, in px. Narrower than this and the transcript stops working. */
const MIN_WIDTH = 300;
const MAX_WIDTH = 720;
const DEFAULT_WIDTH = 380;
const WIDTH_STORAGE_KEY = 'assistantDockWidth';

class AssistantDock extends HTMLElement {
    /** @type {Promise<[string, string]>|null} Cached templates Promise — store
     * the Promise (not the resolved value) so concurrent connectedCallback()
     * calls don't each trigger their own fetch. See SPEC Code Rule 7. */
    static templateCache = null;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._open = false;
        this._suggestions = [];
        this._pendingCount = 0;
        this._unsubscribe = null;
        this._onDocKeydown = this._handleDocKeydown.bind(this);
        this._onDragMove = this._handleDragMove.bind(this);
        this._onDragEnd = this._handleDragEnd.bind(this);
    }

    async connectedCallback() {
        if (!AssistantDock.templateCache) {
            AssistantDock.templateCache = Promise.all([
                fetch('/components/assistant-dock/assistant-dock.html').then(r => r.text()),
                fetch('/components/assistant-dock/assistant-dock.css').then(r => r.text())
            ]);
        }
        const [html, css] = await AssistantDock.templateCache;

        const style = document.createElement('style');
        style.textContent = css;
        this.shadowRoot.innerHTML = html;
        this.shadowRoot.prepend(style);

        this._messagesEl = this.shadowRoot.querySelector('.js-messages');
        this._inputEl = this.shadowRoot.querySelector('.js-input');
        this._sendBtn = this.shadowRoot.querySelector('.js-sendBtn');
        this._usageEl = this.shadowRoot.querySelector('.js-usage');
        this._noticeEl = this.shadowRoot.querySelector('.js-notice');
        this._pendingEl = this.shadowRoot.querySelector('.js-pending');

        this._applyStoredWidth();
        this._wireEvents();

        // Re-render on every controller change, including ones the *other*
        // surface caused.
        this._unsubscribe = chat.onChange(() => this._render());
        this._render();
    }

    disconnectedCallback() {
        this._unsubscribe?.();
        document.removeEventListener('keydown', this._onDocKeydown);
        window.removeEventListener('mousemove', this._onDragMove);
        window.removeEventListener('mouseup', this._onDragEnd);
    }

    // ==========================================
    // Public API
    // ==========================================

    /**
     * @param {string} [prompt] - Pre-filled but NOT sent: an entry point should
     *        start the sentence, never speak for the user.
     */
    open(prompt) {
        this._open = true;
        this.classList.add('--open');
        document.body.classList.add('--assistantOpen');
        if (prompt && this._inputEl) {
            this._inputEl.value = prompt;
            this._autoGrow();
        }
        requestAnimationFrame(() => this._inputEl?.focus());
        this._render();
    }

    close() {
        this._open = false;
        this.classList.remove('--open');
        document.body.classList.remove('--assistantOpen');
        this.dispatchEvent(new CustomEvent('assistant-closed', { bubbles: true, composed: true }));
    }

    toggle(prompt) {
        this._open ? this.close() : this.open(prompt);
    }

    get isOpen() {
        return this._open;
    }

    /** @param {Array<{id: string, fact: string, action: string, prompt: string}>} list */
    setSuggestions(list) {
        this._suggestions = Array.isArray(list) ? list : [];
        if (this._messagesEl) this._render();
    }

    /** @param {number} count - Proposals awaiting review. */
    setPendingCount(count) {
        this._pendingCount = count || 0;
        if (this._pendingEl) this._render();
    }

    // ==========================================
    // Internals
    // ==========================================

    _wireEvents() {
        this.shadowRoot.querySelector('.js-closeBtn').addEventListener('click', () => this.close());

        this.shadowRoot.querySelector('.js-clearBtn').addEventListener('click', async () => {
            await chat.clear();
        });

        this._pendingEl.addEventListener('click', () => {
            this.dispatchEvent(new CustomEvent('review-proposals', { bubbles: true, composed: true }));
        });

        this._sendBtn.addEventListener('click', () => this._send());
        this._inputEl.addEventListener('input', () => this._autoGrow());
        this._inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this._send();
            }
        });

        // Suggestions are delegated: they are re-rendered on every state change.
        this._messagesEl.addEventListener('click', (e) => {
            const btn = e.target.closest('.js-suggestion');
            if (!btn) return;
            const suggestion = this._suggestions.find(s => s.id === btn.dataset.suggestionId);
            if (!suggestion) return;
            this._inputEl.value = suggestion.prompt;
            this._send();
        });

        this.shadowRoot.querySelector('.js-resizer')
            .addEventListener('mousedown', (e) => this._handleDragStart(e));

        document.addEventListener('keydown', this._onDocKeydown);
    }

    _handleDocKeydown(e) {
        if (!this._open || e.key !== 'Escape') return;
        // Stand aside for anything stacked on top — a modal's Escape is its own.
        if (document.querySelector('modal-dialog[open]')) return;
        const active = this.shadowRoot.activeElement;
        if (active === this._inputEl && this._inputEl.value.trim()) {
            // Don't discard a half-written message on a stray Escape.
            this._inputEl.value = '';
            return;
        }
        this.close();
    }

    // ---- Resizing ----

    _applyStoredWidth() {
        let width = DEFAULT_WIDTH;
        try {
            const stored = Number(localStorage.getItem(WIDTH_STORAGE_KEY));
            if (stored) width = stored;
        } catch {
            // Private mode or blocked storage — the default is fine.
        }
        this._setWidth(width);
    }

    _setWidth(width) {
        const clamped = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width)));
        this.style.setProperty('--dock-width', `${clamped}px`);
        return clamped;
    }

    _handleDragStart(e) {
        e.preventDefault();
        this._dragStartX = e.clientX;
        this._dragStartWidth = this.getBoundingClientRect().width;
        document.body.classList.add('--dockResizing');
        window.addEventListener('mousemove', this._onDragMove);
        window.addEventListener('mouseup', this._onDragEnd);
    }

    _handleDragMove(e) {
        // The dock is on the right, so dragging left widens it.
        this._setWidth(this._dragStartWidth + (this._dragStartX - e.clientX));
    }

    _handleDragEnd() {
        document.body.classList.remove('--dockResizing');
        window.removeEventListener('mousemove', this._onDragMove);
        window.removeEventListener('mouseup', this._onDragEnd);
        try {
            localStorage.setItem(WIDTH_STORAGE_KEY, String(this.getBoundingClientRect().width));
        } catch {
            // Not being able to remember the width is not worth telling anyone.
        }
    }

    // ---- Sending ----

    async _send() {
        const text = this._inputEl.value;
        if (!text.trim()) return;

        this._inputEl.value = '';
        this._autoGrow();

        const result = await chat.send(text);
        if (!result.ok) {
            this._noticeEl.hidden = false;
            this._noticeEl.textContent = result.error;
            return;
        }
        this.dispatchEvent(new CustomEvent('assistant-replied', {
            bubbles: true,
            composed: true,
            detail: { tasks: result.tasks, proposals: result.proposals }
        }));
    }

    _autoGrow() {
        this._inputEl.style.height = 'auto';
        this._inputEl.style.height = `${Math.min(this._inputEl.scrollHeight, 160)}px`;
    }

    // ---- Rendering ----

    _render() {
        const { history, busy, availability } = chat.getState();

        this._messagesEl.innerHTML = history.length === 0
            ? this._emptyStateHtml()
            : history.map(m => this._messageHtml(m)).join('');
        this._messagesEl.scrollTop = this._messagesEl.scrollHeight;

        this._usageEl.textContent = chat.formatUsage();

        this._pendingEl.hidden = this._pendingCount === 0;
        this._pendingEl.textContent = `${this._pendingCount} to review`;

        const usable = availability.available;
        this._inputEl.disabled = !usable || busy;
        this._sendBtn.disabled = !usable || busy;
        this._sendBtn.textContent = busy ? 'Thinking…' : 'Send';

        // Silent disabling is the failure mode to avoid: always say why.
        if (!usable) {
            this._noticeEl.hidden = false;
            this._noticeEl.textContent = availability.reason === 'offline'
                ? `${availability.message} The conversation is still here.`
                : `${availability.message || 'AI is not configured.'} Set one up in Config → AI Configuration.`;
            this._inputEl.placeholder = 'AI unavailable';
        } else if (this._noticeEl.textContent && this._noticeEl.textContent.includes('Config →')) {
            this._noticeEl.hidden = true;
            this._inputEl.placeholder = 'Ask about your board…';
        }
    }

    /**
     * The empty state is the point of the dock: facts about this board with a
     * verb attached, computed locally so they render with the AI switched off.
     */
    _emptyStateHtml() {
        if (this._suggestions.length === 0) {
            return `<div class="dock__empty">Ask about your board, paste meeting notes, or describe what you need to do.</div>`;
        }
        return `
            <div class="dock__suggestions">
                ${this._suggestions.map(s => `
                    <button type="button" class="dock__suggestion js-suggestion" data-suggestion-id="${escapeHtml(s.id)}">
                        <span class="dock__suggestionFact">${escapeHtml(s.fact)}</span>
                        <span class="dock__suggestionAction">${escapeHtml(s.action)} →</span>
                    </button>
                `).join('')}
            </div>
        `;
    }

    /** @param {{role: string, content: string, tasksAdded?: number, proposalsAdded?: number}} message */
    _messageHtml(message) {
        if (message.role === 'pending') {
            // A quiet line, not animated dots — see the visual rules in
            // docs/design/AI_ASSISTANT.md.
            return `<div class="dock__message --pending">Reading your board…</div>`;
        }

        const outcomes = [];
        if (message.tasksAdded) outcomes.push(`${message.tasksAdded} task${message.tasksAdded === 1 ? '' : 's'} staged`);
        if (message.proposalsAdded) outcomes.push(`${message.proposalsAdded} change${message.proposalsAdded === 1 ? '' : 's'} proposed`);

        return `
            <div class="dock__message --${message.role}">
                <div class="dock__messageText">${escapeHtml(message.content)}</div>
                ${outcomes.length ? `<div class="dock__messageMeta">${escapeHtml(outcomes.join(' · '))}</div>` : ''}
            </div>
        `;
    }
}

customElements.define('assistant-dock', AssistantDock);
