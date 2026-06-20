/**
 * page-fab — Reusable floating action button for list pages.
 *
 * Inline component (no external .html/.css).
 *
 * Attributes:
 *   label  — accessible aria-label (default: "Add")
 *   icon   — button text content (default: "+")
 *
 * Events dispatched:
 *   fab-click (bubbles, composed)
 */
class PageFab extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        const label = this.getAttribute('label') || 'Add';
        const icon = this.getAttribute('icon') || '+';

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    position: fixed;
                    bottom: 32px;
                    left: 32px;
                    z-index: 100;
                }
                button {
                    width: 48px;
                    height: 48px;
                    border-radius: 50%;
                    border: none;
                    background: var(--color-accent-primary);
                    color: var(--color-text-on-accent);
                    font-size: 24px;
                    line-height: 1;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    box-shadow: var(--shadow-md);
                    transition: background-color 0.15s, transform 0.1s;
                    font-family: inherit;
                }
                button:hover {
                    background: var(--color-accent-primary-hover);
                    transform: scale(1.08);
                }
            </style>
            <button type="button" aria-label="${label}">${icon}</button>
        `;

        this.shadowRoot.querySelector('button').addEventListener('click', () => {
            this.dispatchEvent(new CustomEvent('fab-click', {
                bubbles: true,
                composed: true
            }));
        });
    }
}

customElements.define('page-fab', PageFab);
