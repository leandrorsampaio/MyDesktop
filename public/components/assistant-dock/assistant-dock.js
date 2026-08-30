/**
 * assistant-dock — the assistant as a permanent floating panel.
 *
 * One button, bottom-left, present on every page and above everything else
 * including modals (z-index 1500; toasts stay above at 2000). Clicking it
 * grows a panel out of the button into the bottom band of the screen — the
 * top half is where the real work is, so the assistant never covers it.
 *
 * **Context is implicit.** There is no per-card "Ask AI" button, because
 * there doesn't need to be: the assistant knows what you are looking at.
 * Open it with a card on screen and the conversation is about that card; open
 * it on the archive and it is about the archive. `app.js` supplies that via
 * `assistant-chat.js`'s context provider, resolved fresh on every send.
 *
 * The conversation lives in `js/assistant-chat.js`, shared with the
 * `/:alias/ai` page, so the two surfaces show one thread.
 *
 * API:
 *   open(prompt?)  — show the panel; an optional prompt is pre-filled, not sent
 *   close()
 *   toggle()
 *   isOpen
 *   setSuggestions(list)   — board-derived openers for the empty state
 *   setPendingCount(n)     — proposals awaiting review, badged on the launcher
 *   setContextLabel(text)  — what the assistant is currently about
 *
 * Events dispatched (bubble + composed):
 *   assistant-replied  — { detail: { tasks, proposals } }
 *   assistant-closed
 *   review-proposals   — the pending badge was clicked
 */

import * as chat from '../../js/assistant-chat.js';
import { escapeHtml } from '../../js/utils.js';

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
        this._contextLabel = 'Assistant';
        this._historyOpen = false;
        this._skillsOpen = false;
        this._unsubscribe = null;
        this._onDocKeydown = this._handleDocKeydown.bind(this);
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

        this._panelEl = this.shadowRoot.querySelector('.js-panel');
        this._launcherEl = this.shadowRoot.querySelector('.js-launcher');
        this._messagesEl = this.shadowRoot.querySelector('.js-messages');
        this._inputEl = this.shadowRoot.querySelector('.js-input');
        this._sendBtn = this.shadowRoot.querySelector('.js-sendBtn');
        this._usageEl = this.shadowRoot.querySelector('.js-usage');
        this._noticeEl = this.shadowRoot.querySelector('.js-notice');
        this._pendingEl = this.shadowRoot.querySelector('.js-pending');
        this._contextEl = this.shadowRoot.querySelector('.js-context');
        this._historyDrawerEl = this.shadowRoot.querySelector('.js-historyDrawer');
        this._historyListEl = this.shadowRoot.querySelector('.js-historyList');
        this._historyBtn = this.shadowRoot.querySelector('.js-historyBtn');
        this._skillsBarEl = this.shadowRoot.querySelector('.js-skillsBar');
        this._skillsToggleEl = this.shadowRoot.querySelector('.js-skillsToggle');
        this._skillsSummaryEl = this.shadowRoot.querySelector('.js-skillsSummary');
        this._skillsMenuEl = this.shadowRoot.querySelector('.js-skillsMenu');

        this._wireEvents();

        // Re-render on every controller change, including ones the *other*
        // surface caused.
        this._unsubscribe = chat.onChange(() => this._render());
        this._render();
    }

    disconnectedCallback() {
        this._unsubscribe?.();
        document.removeEventListener('keydown', this._onDocKeydown);
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
        if (this._panelEl) this._panelEl.hidden = false;
        this._launcherEl?.setAttribute('aria-expanded', 'true');
        if (prompt && this._inputEl) {
            this._inputEl.value = prompt;
            this._autoGrow();
        }
        requestAnimationFrame(() => this._inputEl?.focus());
        this._render();
        // Skills are edited on the config page, so the cached list can be stale
        // by the time the dock is opened again. Not awaited: the panel is
        // already usable, and the list re-renders when it lands.
        chat.refreshSkills();
    }

    close() {
        this._open = false;
        this._setHistoryOpen(false);
        this._setSkillsOpen(false);
        this.classList.remove('--open');
        if (this._panelEl) this._panelEl.hidden = true;
        this._launcherEl?.setAttribute('aria-expanded', 'false');
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

    /**
     * Starts an interview and shows any failure where the user is looking.
     *
     * The trigger lives on the config page, but the conversation lands here —
     * so a failed start has to report into this panel. Routing it back to a
     * toast on the page behind leaves an empty transcript and no explanation.
     *
     * @returns {Promise<{ok: boolean, error?: string}>}
     */
    async startInterview() {
        this.open();
        const result = await chat.startInterview();
        if (!result.ok) this._showNotice(result.error, 'send-failed');
        else this._hideNotice();
        return result;
    }

    /** @param {number} count - Proposals awaiting review. */
    setPendingCount(count) {
        this._pendingCount = count || 0;
        if (this._pendingEl) this._render();
    }

    /**
     * Sets the header line describing what the assistant is currently about.
     * Context is implicit, so it has to be visible — otherwise the user can't
     * tell whether a question will be read as being about the open card.
     * @param {string} text
     */
    setContextLabel(text) {
        this._contextLabel = text || 'Assistant';
        if (this._contextEl) this._contextEl.textContent = this._contextLabel;
    }

    // ==========================================
    // Internals
    // ==========================================

    _wireEvents() {
        this._launcherEl.addEventListener('click', () => this.toggle());
        this.shadowRoot.querySelector('.js-closeBtn').addEventListener('click', () => this.close());

        // Starting a new thread no longer destroys the old one — that was the
        // whole complaint about the button this replaces.
        this.shadowRoot.querySelector('.js-newBtn').addEventListener('click', async () => {
            const result = await chat.startNewConversation();
            if (!result.ok) this._showNotice(result.error, 'send-failed');
            this._setHistoryOpen(false);
            this._inputEl?.focus();
        });

        this._historyBtn.addEventListener('click', () => this._setHistoryOpen(!this._historyOpen));
        this.shadowRoot.querySelector('.js-historyCloseBtn')
            .addEventListener('click', () => this._setHistoryOpen(false));

        // Delegated: the list is rebuilt on every state change.
        this._historyListEl.addEventListener('click', async (e) => {
            const deleteBtn = e.target.closest('.js-convoDelete');
            if (deleteBtn) {
                e.stopPropagation();
                const result = await chat.deleteConversation(deleteBtn.dataset.convoId);
                if (!result.ok) this._showNotice(result.error, 'send-failed');
                return;
            }
            const row = e.target.closest('.js-convoRow');
            if (!row) return;
            const result = await chat.openConversation(row.dataset.convoId);
            if (!result.ok) { this._showNotice(result.error, 'send-failed'); return; }
            this._setHistoryOpen(false);
            this._inputEl?.focus();
        });

        this._skillsToggleEl.addEventListener('click', () => this._setSkillsOpen(!this._skillsOpen));
        this._skillsMenuEl.addEventListener('click', async (e) => {
            const row = e.target.closest('.js-skillRow');
            if (!row || row.dataset.alwaysOn === 'true') return;
            const result = await chat.toggleSkill(row.dataset.skillId);
            if (!result.ok) this._showNotice(result.error, 'send-failed');
        });

        this._pendingEl.addEventListener('click', (e) => {
            // The badge lives inside the launcher, so its click would toggle
            // the panel as well without this.
            e.stopPropagation();
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

        document.addEventListener('keydown', this._onDocKeydown);
    }

    _handleDocKeydown(e) {
        if (!this._open || e.key !== 'Escape') return;
        // Stand aside for anything stacked on top — a modal's Escape is its own.
        if (document.querySelector('modal-dialog[open]')) return;
        // Escape closes the innermost thing first.
        if (this._skillsOpen) { this._setSkillsOpen(false); return; }
        if (this._historyOpen) { this._setHistoryOpen(false); return; }
        const active = this.shadowRoot.activeElement;
        if (active === this._inputEl && this._inputEl.value.trim()) {
            // Don't discard a half-written message on a stray Escape.
            this._inputEl.value = '';
            return;
        }
        this.close();
    }

    // ---- Sending ----

    async _send() {
        const text = this._inputEl.value;
        if (!text.trim()) return;

        this._inputEl.value = '';
        this._autoGrow();

        const result = await chat.send(text);
        if (!result.ok) {
            this._showNotice(result.error, 'send-failed');
            return;
        }
        this._hideNotice();
        this.dispatchEvent(new CustomEvent('assistant-replied', {
            bubbles: true,
            composed: true,
            detail: { tasks: result.tasks, proposals: result.proposals }
        }));
    }

    /**
     * @param {string} text
     * @param {'unavailable'|'send-failed'} kind - Why it is showing
     */
    _showNotice(text, kind) {
        this._noticeEl.textContent = text;
        this._noticeEl.dataset.kind = kind;
        this._noticeEl.hidden = false;
    }

    _hideNotice() {
        this._noticeEl.hidden = true;
        this._noticeEl.textContent = '';
        delete this._noticeEl.dataset.kind;
    }

    _autoGrow() {
        this._inputEl.style.height = 'auto';
        this._inputEl.style.height = `${Math.min(this._inputEl.scrollHeight, 160)}px`;
    }

    // ---- Rendering ----

    /** @param {boolean} open */
    _setHistoryOpen(open) {
        this._historyOpen = open;
        if (this._historyDrawerEl) this._historyDrawerEl.hidden = !open;
        this._historyBtn?.setAttribute('aria-expanded', String(open));
        if (open) this._setSkillsOpen(false);
    }

    /** @param {boolean} open */
    _setSkillsOpen(open) {
        this._skillsOpen = open;
        if (this._skillsMenuEl) this._skillsMenuEl.hidden = !open;
        this._skillsToggleEl?.setAttribute('aria-expanded', String(open));
    }

    /** Short relative age, so a list of threads is scannable without dates. */
    _relativeTime(iso) {
        const then = Date.parse(iso);
        if (Number.isNaN(then)) return '';
        const mins = Math.round((Date.now() - then) / 60000);
        if (mins < 1) return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.round(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        const days = Math.round(hours / 24);
        return days < 7 ? `${days}d ago` : new Date(then).toLocaleDateString();
    }

    _renderHistory(conversations, activeId) {
        if (conversations.length === 0) {
            this._historyListEl.innerHTML = `<div class="assistant__drawerEmpty">No saved conversations yet.</div>`;
            return;
        }
        this._historyListEl.innerHTML = conversations.map(c => `
            <div class="assistant__convo js-convoRow${c.id === activeId ? ' --current' : ''}" data-convo-id="${escapeHtml(c.id)}" role="button" tabindex="0">
                <span class="assistant__convoTitle">${escapeHtml(c.title)}</span>
                <span class="assistant__convoMeta">${escapeHtml(this._relativeTime(c.updatedAt))} · ${c.messageCount} msg${c.messageCount === 1 ? '' : 's'}</span>
                <button type="button" class="assistant__convoDelete js-convoDelete" data-convo-id="${escapeHtml(c.id)}" title="Delete conversation" aria-label="Delete conversation">&times;</button>
            </div>
        `).join('');
    }

    _renderSkills(skills, activeSkills, selectedIds) {
        // Nothing to show and nothing to choose — keep the bar out of the way.
        if (skills.length === 0) {
            this._skillsBarEl.hidden = true;
            this._setSkillsOpen(false);
            return;
        }
        this._skillsBarEl.hidden = false;

        this._skillsSummaryEl.textContent = activeSkills.length === 0
            ? 'Skills'
            : `Skills: ${activeSkills.map(sk => sk.name).join(', ')}`;

        this._skillsMenuEl.innerHTML = skills.map(sk => {
            const on = sk.alwaysOn || selectedIds.includes(sk.id);
            return `
                <div class="assistant__skillRow js-skillRow${on ? ' --on' : ''}"
                     data-skill-id="${escapeHtml(sk.id)}" data-always-on="${sk.alwaysOn}"
                     role="button" tabindex="${sk.alwaysOn ? -1 : 0}">
                    <span class="assistant__skillCheck">${on ? '✓' : ''}</span>
                    <span class="assistant__skillName">${escapeHtml(sk.name)}</span>
                    ${sk.alwaysOn ? '<span class="assistant__skillAlways">always on</span>' : ''}
                </div>
            `;
        }).join('');
    }

    _render() {
        const { history, busy, availability, conversations, activeConversation, skills, activeSkills } = chat.getState();

        this._renderHistory(conversations, activeConversation.id);
        this._renderSkills(skills, activeSkills, activeConversation.skillIds || []);

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
        //
        // The notice serves two purposes — "the AI is unavailable" and "that
        // last message failed" — so it records which one it is showing. Reading
        // the reason off a `dataset` flag rather than sniffing the message text
        // means rewording a string can't silently break the clearing logic.
        if (!usable) {
            this._showNotice(
                availability.reason === 'offline'
                    ? `${availability.message} The conversation is still here.`
                    : `${availability.message || 'AI is not configured.'} Set one up in Config → AI Configuration.`,
                'unavailable'
            );
            this._inputEl.placeholder = 'AI unavailable';
        } else if (this._noticeEl.dataset.kind === 'unavailable') {
            // Availability came back; a stale "not configured" notice would lie.
            this._hideNotice();
            this._inputEl.placeholder = 'Ask about your board…';
        }
    }

    /**
     * The empty state is the point of the dock: facts about this board with a
     * verb attached, computed locally so they render with the AI switched off.
     */
    _emptyStateHtml() {
        if (this._suggestions.length === 0) {
            return `<div class="assistant__empty">Ask about your board, paste meeting notes, or describe what you need to do.</div>`;
        }
        return `
            <div class="assistant__suggestions">
                ${this._suggestions.map(s => `
                    <button type="button" class="assistant__suggestion js-suggestion" data-suggestion-id="${escapeHtml(s.id)}">
                        <span class="assistant__suggestionFact">${escapeHtml(s.fact)}</span>
                        <span class="assistant__suggestionAction">${escapeHtml(s.action)} →</span>
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
            return `<div class="assistant__message --pending">Reading your board…</div>`;
        }

        const outcomes = [];
        if (message.tasksAdded) outcomes.push(`${message.tasksAdded} task${message.tasksAdded === 1 ? '' : 's'} staged`);
        if (message.proposalsAdded) outcomes.push(`${message.proposalsAdded} change${message.proposalsAdded === 1 ? '' : 's'} proposed`);

        return `
            <div class="assistant__message --${message.role}">
                <div class="assistant__messageText">${escapeHtml(message.content)}</div>
                ${outcomes.length ? `<div class="assistant__messageMeta">${escapeHtml(outcomes.join(' · '))}</div>` : ''}
            </div>
        `;
    }
}

customElements.define('assistant-dock', AssistantDock);
