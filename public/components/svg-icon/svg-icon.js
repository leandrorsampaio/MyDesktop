/**
 * SVG Icon Component
 *
 * Renders SVG icons from a static registry. All SVG markup is defined
 * in the ICONS map — no external files needed.
 *
 * Usage: <svg-icon icon="star"></svg-icon>
 *        <svg-icon icon="newTab" size="20"></svg-icon>
 *
 * Attributes:
 *   - icon: Icon name (key in ICONS map)
 *   - size: Icon size in px (default: 24), sets both width and height
 *
 * Styling: SVGs use fill="currentColor" and stroke="currentColor"
 * so they inherit the parent's text color.
 */

/**
 * Registry of all available SVG icons.
 * Each value is a raw SVG string with viewBox but NO width/height
 * (size is controlled via the `size` attribute on the component).
 *
 * To add a new icon:
 *   1. Add an entry here: iconName: `<svg viewBox="...">...</svg>`
 *   2. Use it: <svg-icon icon="iconName"></svg-icon>
 */
const ICONS = {
    star: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,

    newTab: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,

    edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,

    trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,

    plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,

    close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
};

class SvgIcon extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this.render();
    }

    static get observedAttributes() {
        return ['icon', 'size'];
    }

    attributeChangedCallback() {
        if (this.shadowRoot) {
            this.render();
        }
    }

    render() {
        const name = this.getAttribute('icon');
        const size = this.getAttribute('size') || '24';
        const svg = ICONS[name];

        if (!svg) {
            this.shadowRoot.innerHTML = '';
            return;
        }

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: ${size}px;
                    height: ${size}px;
                    line-height: 0;
                }
                svg {
                    width: 100%;
                    height: 100%;
                }
            </style>
            ${svg}
        `;
    }
}

customElements.define('svg-icon', SvgIcon);
