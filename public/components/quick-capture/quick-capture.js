/**
 * quick-capture — a one-line capture bar for notes taken in passing.
 *
 * The hallway-conversation problem: someone asks you for something on the way
 * past, and filing it properly costs more attention than you have right then,
 * so it never gets written down. This is the fix — a keystroke, one line,
 * Enter, gone. Under three seconds, from any page, with nothing to read.
 *
 * Deliberately NOT a modal: a dialog asks to be read and dismissed. This is a
 * bar that takes a line and disappears.
 *
 * API:
 *   open()   — show and focus the input
 *   close()  — hide and restore previous focus
 *   toggle()
 *
 * Events dispatched:
 *   capture-submit (bubbles, composed) — { detail: { text } }
 *
 * The component owns no network calls; app.js decides what a capture means.
 */
class QuickCapture extends HTMLElement {
    /** @type {Promise<[string, string]>|null} Cached templates Promise — store
     * the Promise (not the resolved value) so concurrent connectedCallback()
     * calls don't each trigger their own fetch. See SPEC Code Rule 7. */
    static templateCache = null;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._open = false;
        /** @type {Element|null} Focus to restore on close */
        this._previousFocus = null;
        this._onDocKeydown = this._handleDocKeydown.bind(this);
    }

    async connectedCallback() {
        if (!QuickCapture.templateCache) {
            QuickCapture.templateCache = Promise.all([
                fetch('/components/quick-capture/quick-capture.html').then(r => r.text()),
                fetch('/components/quick-capture/quick-capture.css').then(r => r.text())
            ]);
        }
        const [html, css] = await QuickCapture.templateCache;

        const style = document.createElement('style');
        style.textContent = css;
        this.shadowRoot.innerHTML = html;
        this.shadowRoot.prepend(style);

        this._input = this.shadowRoot.querySelector('.js-captureInput');
        this._hint = this.shadowRoot.querySelector('.js-captureHint');

        this._input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this._submit();
            }
            // Escape is handled at document level so it works even if focus
            // has wandered out of the input.
        });

        // Clicking the backdrop dismisses — the bar is a transient surface,
        // not a dialog holding unsaved work worth guarding.
        this.shadowRoot.querySelector('.js-captureBackdrop')
            .addEventListener('mousedown', () => this.close());

        document.addEventListener('keydown', this._onDocKeydown);

        // Re-apply state in case open() was called before the template landed
        this._syncOpenState();
    }

    disconnectedCallback() {
        document.removeEventListener('keydown', this._onDocKeydown);
    }

    /** Shows the bar and focuses the input. */
    open() {
        if (this._open) return;
        this._previousFocus = document.activeElement;
        this._open = true;
        this._syncOpenState();
    }

    /** Hides the bar, clears it, and restores focus. */
    close() {
        if (!this._open) return;
        this._open = false;
        this._syncOpenState();
        if (this._previousFocus && typeof this._previousFocus.focus === 'function') {
            this._previousFocus.focus();
        }
        this._previousFocus = null;
    }

    toggle() {
        this._open ? this.close() : this.open();
    }

    /** @returns {boolean} */
    get isOpen() {
        return this._open;
    }

    /**
     * Shows a transient hint under the input (e.g. the AI being unavailable).
     * Cleared on the next open.
     * @param {string} text
     */
    setHint(text) {
        if (this._hint) {
            this._hint.textContent = text || '';
            this._hint.hidden = !text;
        }
    }

    _syncOpenState() {
        this.classList.toggle('--open', this._open);
        if (!this._input) return;

        if (this._open) {
            this._input.value = '';
            this.setHint('');
            // Focus has to wait for the class change to take effect, or the
            // element is still display:none and refuses focus.
            requestAnimationFrame(() => this._input.focus());
        } else {
            this._input.value = '';
        }
    }

    _handleDocKeydown(e) {
        if (!this._open) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            this.close();
        }
    }

    _submit() {
        const text = this._input.value.trim();
        if (!text) {
            this.close();
            return;
        }
        // Close first: capture should feel finished the instant Enter is
        // pressed, not when the network agrees.
        this.close();
        this.dispatchEvent(new CustomEvent('capture-submit', {
            bubbles: true,
            composed: true,
            detail: { text }
        }));
    }
}

customElements.define('quick-capture', QuickCapture);
