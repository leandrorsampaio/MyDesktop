class CustomButton extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    static get observedAttributes() {
        return ['label', 'modifier', 'type'];
    }

    async connectedCallback() {
        const [html, css] = await Promise.all([
            fetch('/components/button/button.html').then(response => response.text()),
            fetch('/components/button/button.css').then(response => response.text())
        ]);

        const style = document.createElement('style');
        style.textContent = css;

        this.shadowRoot.innerHTML = html;
        this.shadowRoot.prepend(style);
        
        this._button = this.shadowRoot.querySelector('button');
        this._slot = this.shadowRoot.querySelector('slot');

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
