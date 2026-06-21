class ModalDialog extends HTMLElement {
    /** @type {Promise<[string, string]>|null} Cached templates Promise — store
     * the Promise (not the resolved value) so concurrent connectedCallback()
     * calls don't each trigger their own fetch. See SPEC Code Rule 7. */
    static templateCache = null;

    /** @type {ModalDialog[]} Stack of currently-open modals. Escape and the
     * focus trap only act on the topmost entry, so a confirmation layered
     * over the task modal doesn't take both down with one keypress. */
    static _openStack = [];

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._boundOnEsc = this.handleEsc.bind(this);
        this._boundOnTab = this._handleTabTrap.bind(this);
        /** Element that had focus before open() — restored on close */
        this._restoreFocusTo = null;
    }

    async connectedCallback() {
        if (!ModalDialog.templateCache) {
            ModalDialog.templateCache = Promise.all([
                fetch('/components/modal-dialog/modal-dialog.html').then(response => response.text()),
                fetch('/components/modal-dialog/modal-dialog.css').then(response => response.text())
            ]);
        }
        const [html, css] = await ModalDialog.templateCache;

        const style = document.createElement('style');
        style.textContent = css;

        this.shadowRoot.innerHTML = html;
        this.shadowRoot.prepend(style);

        // Dialog semantics live on the host: the title is slotted light DOM,
        // so aria-labelledby can't cross the shadow boundary — an aria-label
        // computed from the slot text on open() (see _applyDialogAria) does.
        this.setAttribute('role', 'dialog');
        this.setAttribute('aria-modal', 'true');

        this.shadowRoot.querySelector('.modal__closeBtn').addEventListener('click', () => this.close());
        this.shadowRoot.querySelector('.backdrop').addEventListener('click', (e) => {
            if (e.target === this.shadowRoot.querySelector('.backdrop')) {
                this.close();
            }
        });
    }

    static get observedAttributes() {
        return ['open'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name !== 'open') return;
        if (newValue === null) {
            document.removeEventListener('keydown', this._boundOnEsc);
            document.removeEventListener('keydown', this._boundOnTab);
            const idx = ModalDialog._openStack.indexOf(this);
            if (idx !== -1) ModalDialog._openStack.splice(idx, 1);

            // Restore focus to where the user was before the modal opened
            if (this._restoreFocusTo && typeof this._restoreFocusTo.focus === 'function') {
                this._restoreFocusTo.focus();
            }
            this._restoreFocusTo = null;
        } else {
            document.addEventListener('keydown', this._boundOnEsc);
            document.addEventListener('keydown', this._boundOnTab);
            ModalDialog._openStack.push(this);
            this._applyDialogAria();
            this._restoreFocusTo = document.activeElement;
            this._focusInitial();
        }
    }

    disconnectedCallback() {
        // Clean up document-level event listeners to prevent memory leaks
        document.removeEventListener('keydown', this._boundOnEsc);
        document.removeEventListener('keydown', this._boundOnTab);
        const idx = ModalDialog._openStack.indexOf(this);
        if (idx !== -1) ModalDialog._openStack.splice(idx, 1);
    }

    open() {
        this.setAttribute('open', '');
        this.dispatchEvent(new CustomEvent('modal-opened', { bubbles: true, composed: true }));
    }

    close() {
        this.removeAttribute('open');
        this.dispatchEvent(new CustomEvent('modal-closed', { bubbles: true, composed: true }));
    }

    handleEsc(e) {
        if (e.key !== 'Escape') return;
        // Only the topmost open modal responds — without this guard a single
        // Escape closed every stacked modal at once
        if (ModalDialog._openStack[ModalDialog._openStack.length - 1] !== this) return;
        this.close();
    }

    /** Sets the accessible name from the slotted title's current text.
     * Re-computed on every open because callers rewrite the title
     * ("Add Task" / "Edit Task") before opening. */
    _applyDialogAria() {
        const title = this.querySelector('[slot="title"]');
        const text = title ? title.textContent.trim() : '';
        if (text) this.setAttribute('aria-label', text);
    }

    /** Moves focus into the dialog. Callers that focus a specific field
     * (e.g. the task title input) do so after open() and simply win. */
    _focusInitial() {
        const focusables = this._getFocusable();
        // Prefer the first slotted control over the shadow close button
        const target = focusables[1] || focusables[0];
        if (target) target.focus();
    }

    /**
     * Focusable elements in visual order: the shadow close button first,
     * then slotted light-DOM controls. custom-button / custom-picker hosts
     * are focusable because their shadow roots use delegatesFocus.
     * @returns {Array<HTMLElement>}
     */
    _getFocusable() {
        const selector = [
            'a[href]', 'button:not([disabled])', 'input:not([disabled])',
            'select:not([disabled])', 'textarea:not([disabled])',
            'custom-button', 'custom-picker', '[contenteditable="true"]', '[tabindex]:not([tabindex="-1"])'
        ].join(', ');
        const slotted = Array.from(this.querySelectorAll(selector))
            .filter(el => el.getClientRects().length > 0); // visible only
        const closeBtn = this.shadowRoot && this.shadowRoot.querySelector('.modal__closeBtn');
        return closeBtn ? [closeBtn, ...slotted] : slotted;
    }

    /** Keeps Tab cycling inside the open dialog (wraps at both ends). */
    _handleTabTrap(e) {
        if (e.key !== 'Tab') return;
        if (ModalDialog._openStack[ModalDialog._openStack.length - 1] !== this) return;

        const focusables = this._getFocusable();
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        // Focus inside a shadow root reports the host to the document, so
        // host-level comparisons work for custom-button / custom-picker;
        // the close button needs shadowRoot.activeElement.
        const current = this.shadowRoot.activeElement || document.activeElement;
        const focusInside = current === this || this.contains(current) || this.shadowRoot.activeElement !== null;

        if (!focusInside) {
            e.preventDefault();
            first.focus();
        } else if (e.shiftKey && current === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && current === last) {
            e.preventDefault();
            first.focus();
        }
    }
}

customElements.define('modal-dialog', ModalDialog);
