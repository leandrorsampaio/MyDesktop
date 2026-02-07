class CustomButton extends HTMLElement {
    /** @type {[string, string]|null} Cached [html, css] templates */
    static templateCache = null;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    static get observedAttributes() {
        return ['label', 'modifier', 'type'];
    }

    async connectedCallback() {
        if (!CustomButton.templateCache) {
            CustomButton.templateCache = await Promise.all([
                fetch('/components/button/button.html').then(response => response.text()),
                fetch('/components/button/button.css').then(response => response.text())
            ]);
        }
        const [html, css] = CustomButton.templateCache;

        const style = document.createElement('style');
        style.textContent = css;

        this.shadowRoot.innerHTML = html;
        this.shadowRoot.prepend(style);

        this._button = this.shadowRoot.querySelector('button');
        this._slot = this.shadowRoot.querySelector('slot');

        // Shadow DOM clicks need special handling:
        // 1. Form submission doesn't work across Shadow DOM boundary
        // 2. Click listeners on the host element don't fire from inner button clicks
        this._button.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent any bubbling issues

            // Handle form submission for buttons with type="submit"
            if (this.getAttribute('type') === 'submit') {
                const form = this.closest('form');
                if (form) {
                    form.requestSubmit();
                    return; // Don't dispatch click for submit buttons (form handles it)
                }
            }

            // For non-submit buttons, dispatch click on host so external listeners work
            this.dispatchEvent(new MouseEvent('click', {
                bubbles: true,
                cancelable: true
            }));
        });

        this.updateAttributes();
    }

    updateAttributes() {
        const label = this.getAttribute('label');
        const modifier = this.getAttribute('modifier');
        const type = this.getAttribute('type');

        if (label) this.textContent = label;
        if (modifier) this._button.setAttribute('modifier', modifier);
        if (type) this._button.setAttribute('type', type);
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (this.shadowRoot.childElementCount > 1) { // Ensure connectedCallback has run
            if (name === 'label') {
                this.textContent = newValue;
            } else if (name === 'modifier') {
                this._button.setAttribute('modifier', newValue);
            } else if (name === 'type') {
                this._button.setAttribute('type', newValue);
            }
        }
    }
}

customElements.define('custom-button', CustomButton);
