/**
 * Keyboard shortcuts module.
 *
 * Global (every page):
 *   g then b/d/l/a/r/i/c  — go to Board / Dashboard / backLog / Archive /
 *                           Reports / aI / Config (Linear-style chord)
 *   ?                     — open the shortcuts cheat-sheet modal
 *
 * Board page only (pass `board` actions to enable):
 *   n                     — quick-add task
 *   j/k or ↓/↑            — move focus between cards in a column
 *   h/l or ←/→            — move focus across columns (same row, clamped)
 *   Enter                 — open the focused card (handled by <task-card>)
 *   Cmd/Ctrl + ←/→        — move the focused card to the adjacent column
 *                           (the keyboard alternative to drag-and-drop)
 *
 * All shortcuts are ignored while typing in an input/textarea/select or
 * while any modal is open (Escape inside modals is handled by the modals).
 */

import { buildPath } from './router.js';

/** Chord: pages reachable via `g` + key */
const GO_PAGES = {
    b: 'board',
    d: 'dashboard',
    l: 'backlog',
    a: 'archive',
    r: 'reports',
    i: 'ai',
    c: 'config'
};

/** How long a `g` chord waits for its second key */
const CHORD_TIMEOUT_MS = 1000;

let _active = null;

/**
 * Installs the global keydown handler. Safe to call once per page load;
 * calling again replaces the previous handler (no double-binding).
 * @param {Object} options
 * @param {string} options.alias - Active profile alias (for g-chord URLs)
 * @param {Object|null} [options.board] - Board-only actions, or null on other pages
 * @param {Function} [options.board.quickAdd] - Opens the add-task modal
 * @param {Function} [options.board.moveCard] - (taskId, newStatus, newPosition) => Promise<boolean>
 */
export function initShortcuts({ alias, board = null }) {
    if (_active) document.removeEventListener('keydown', _active.handler);
    const state = { alias, board, chordTimer: null };
    state.handler = (e) => _handleKeydown(e, state);
    _active = state;
    document.addEventListener('keydown', state.handler);
}

// ==========================================
// Keydown dispatch
// ==========================================

function _handleKeydown(e, state) {
    if (_isTypingContext(e) || _anyModalOpen()) {
        _clearChord(state);
        return;
    }

    // Cmd/Ctrl + arrows: move the focused card across columns (board only).
    // Only intercepts when a card is actually focused, so browser shortcuts
    // (e.g. Cmd+← history-back on macOS) keep working otherwise.
    if ((e.metaKey || e.ctrlKey) && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        if (state.board && _getFocusedCard()) {
            e.preventDefault();
            _moveFocusedCard(e.key === 'ArrowRight' ? 1 : -1, state.board);
        }
        return;
    }

    // Other modifier combos are never ours
    if (e.metaKey || e.ctrlKey || e.altKey) {
        _clearChord(state);
        return;
    }

    // Pending `g` chord: second key picks the page
    if (state.chordTimer !== null) {
        _clearChord(state);
        const page = GO_PAGES[e.key.toLowerCase()];
        if (page) {
            e.preventDefault();
            window.location.href = buildPath(state.alias, page);
        }
        return;
    }

    switch (e.key) {
        case 'g':
            state.chordTimer = setTimeout(() => { state.chordTimer = null; }, CHORD_TIMEOUT_MS);
            return;
        case '?':
            e.preventDefault();
            document.querySelector('.js-shortcutsModal')?.open();
            return;
        case 'n':
            if (state.board?.quickAdd) {
                e.preventDefault();
                state.board.quickAdd();
            }
            return;
        case 'j': case 'ArrowDown':
            if (state.board) { e.preventDefault(); _navigateCards('down'); }
            return;
        case 'k': case 'ArrowUp':
            if (state.board) { e.preventDefault(); _navigateCards('up'); }
            return;
        case 'h': case 'ArrowLeft':
            if (state.board) { e.preventDefault(); _navigateCards('left'); }
            return;
        case 'l': case 'ArrowRight':
            if (state.board) { e.preventDefault(); _navigateCards('right'); }
            return;
    }
}

function _clearChord(state) {
    if (state.chordTimer !== null) {
        clearTimeout(state.chordTimer);
        state.chordTimer = null;
    }
}

// ==========================================
// Guards
// ==========================================

/** True when the key event originates in a text-entry element.
 * Uses composedPath() so inputs inside shadow roots are detected too. */
function _isTypingContext(e) {
    const el = e.composedPath()[0];
    if (!el || !el.tagName) return false;
    const tag = el.tagName.toLowerCase();
    return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable === true;
}

function _anyModalOpen() {
    return document.querySelector('modal-dialog[open]') !== null;
}

// ==========================================
// Card focus navigation (board)
// ==========================================

function _getColumnEls() {
    return Array.from(document.querySelectorAll('kanban-column'));
}

/** Visible cards in a column (skips filter-hidden and snooze-hidden cards) */
function _getCards(colEl) {
    return Array.from(colEl.shadowRoot?.querySelectorAll('task-card') || [])
        .filter(card => !card.hidden && card.getClientRects().length > 0);
}

/** The focused task-card, if any. From the document's perspective focus
 * inside a column's shadow root reports the kanban-column host. */
function _getFocusedCard() {
    const host = document.activeElement;
    if (!host) return null;
    if (host.tagName === 'KANBAN-COLUMN') {
        const inner = host.shadowRoot?.activeElement;
        if (inner && inner.tagName === 'TASK-CARD') return inner;
    }
    return null;
}

function _navigateCards(dir) {
    const cols = _getColumnEls();
    const focused = _getFocusedCard();

    if (!focused) {
        // Nothing focused yet: start at the first card of the first non-empty column
        for (const col of cols) {
            const cards = _getCards(col);
            if (cards.length) { cards[0].focus(); return; }
        }
        return;
    }

    const colEl = focused.getRootNode().host;
    const colIdx = cols.indexOf(colEl);
    const cards = _getCards(colEl);
    const idx = cards.indexOf(focused);

    if (dir === 'down') {
        cards[Math.min(idx + 1, cards.length - 1)]?.focus();
    } else if (dir === 'up') {
        cards[Math.max(idx - 1, 0)]?.focus();
    } else {
        const step = dir === 'right' ? 1 : -1;
        for (let i = colIdx + step; i >= 0 && i < cols.length; i += step) {
            const targetCards = _getCards(cols[i]);
            if (targetCards.length) {
                targetCards[Math.min(idx, targetCards.length - 1)].focus();
                return;
            }
        }
    }
}

/** Moves the focused card to the adjacent column (top position) and
 * restores focus to it after the board re-renders. */
async function _moveFocusedCard(step, board) {
    const focused = _getFocusedCard();
    if (!focused || !board.moveCard) return;

    const cols = _getColumnEls();
    const colEl = focused.getRootNode().host;
    const target = cols[cols.indexOf(colEl) + step];
    if (!target) return;

    const taskId = focused.dataset.taskId;
    const moved = await board.moveCard(taskId, target.dataset.status, 0);
    if (!moved) return;

    // renderAllColumns rebuilt the cards asynchronously — refocus shortly after
    setTimeout(() => {
        const newCard = Array.from(target.shadowRoot?.querySelectorAll('task-card') || [])
            .find(card => card.dataset.taskId === taskId);
        newCard?.focus();
    }, 50);
}
