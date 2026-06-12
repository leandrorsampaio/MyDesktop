class ModalDialog extends HTMLElement {
    /** @type {Promise<[string, string]>|null} Cached templates Promise — store
     * the Promise (not the resolved value) so concurrent connectedCallback()
     * calls don't each trigger their own fetch. See SPEC Code Rule 7. */
    static templateCache = null;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._boundOnEsc = this.handleEsc.bind(this);
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
        if (name === 'open') {
            if (newValue === null) {
                document.removeEventListener('keydown', this._boundOnEsc);
            } else {
                document.addEventListener('keydown', this._boundOnEsc);
            }
        }
    }

    disconnectedCallback() {
        // Clean up document-level event listener to prevent memory leaks
        document.removeEventListener('keydown', this._boundOnEsc);
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
        if (e.key === 'Escape') {
            this.close();
        }
    }
}

customElements.define('modal-dialog', ModalDialog);
