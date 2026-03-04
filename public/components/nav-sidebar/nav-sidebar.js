/**
 * NavSidebar Web Component
 *
 * Slide-over navigation sidebar with 6 page links and a config submenu.
 *
 * Public API:
 *   open()   — slide panel in
 *   close()  — slide panel out
 *   toggle() — toggle open/closed
 *
 * Attributes:
 *   alias  — profile alias, used to build href values on nav links
 *   page   — active page name ('board'|'dashboard'|'backlog'|'archive'|'reports'|'ai')
 *   open   — boolean presence attribute; managed by open()/close()
 *
 * Dispatches:
 *   config-action (CustomEvent, bubbles+composed)
 *     detail: { action: string }  — one of the data-action values on config items
 *     The component calls close() before dispatching, so the sidebar is already
 *     hidden by the time the host handles the event.
 */
class NavSidebar extends HTMLElement {
    static templateCache = null;
    static observedAttributes = ['alias', 'page'];

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._boundKeydown = this._onKeydown.bind(this);
    }

    async connectedCallback() {
        if (!NavSidebar.templateCache) {
            NavSidebar.templateCache = await Promise.all([
                fetch('/components/nav-sidebar/nav-sidebar.html').then(r => r.text()),
                fetch('/components/nav-sidebar/nav-sidebar.css').then(r => r.text()),
            ]);
        }

        const [html, css] = NavSidebar.templateCache;
        this.shadowRoot.innerHTML = `<style>${css}</style>${html}`;
        this._init();
    }

    disconnectedCallback() {
        document.removeEventListener('keydown', this._boundKeydown);
    }

    attributeChangedCallback(name) {
        // Only react after the shadow root is populated
        if (!this.shadowRoot.innerHTML) return;
        if (name === 'alias') this._updateLinks();
        if (name === 'page') this._updateActive();
    }

    /** Opens the sidebar panel. */
    open() {
        this.setAttribute('open', '');
        document.addEventListener('keydown', this._boundKeydown);
    }

    /** Closes the sidebar panel and the config submenu. */
    close() {
        this.removeAttribute('open');
        document.removeEventListener('keydown', this._boundKeydown);
        this._closeConfigMenu();
    }

    /** Toggles the sidebar between open and closed. */
    toggle() {
        this.hasAttribute('open') ? this.close() : this.open();
    }

    // ---- private ----

    _init() {
        // Backdrop click closes the sidebar
        this.shadowRoot.querySelector('.js-backdrop')
            .addEventListener('click', () => this.close());

        // Config button toggles the config submenu
        this.shadowRoot.querySelector('.js-configBtn')
            .addEventListener('click', () => this._toggleConfigMenu());

        // Config menu items dispatch events and close everything
        this.shadowRoot.querySelectorAll('.navSidebar__configItem').forEach(item => {
            item.addEventListener('click', () => {
                const action = item.dataset.action;
                this.close();
                this.dispatchEvent(new CustomEvent('config-action', {
                    detail: { action },
                    bubbles: true,
                    composed: true,
                }));
            });
        });

        this._updateLinks();
        this._updateActive();
    }

    _updateLinks() {
        const alias = this.getAttribute('alias') || '';
        this.shadowRoot.querySelectorAll('.js-navItem').forEach(item => {
            const page = item.dataset.page;
            item.href = page === 'board' ? `/${alias}` : `/${alias}/${page}`;
        });
    }

    _updateActive() {
        const page = this.getAttribute('page') || 'board';
        this.shadowRoot.querySelectorAll('.js-navItem').forEach(item => {
            item.classList.toggle('--active', item.dataset.page === page);
        });
    }

    _toggleConfigMenu() {
        this.shadowRoot.querySelector('.js-configMenu').classList.toggle('--open');
    }

    _closeConfigMenu() {
        const menu = this.shadowRoot.querySelector('.js-configMenu');
        if (menu) menu.classList.remove('--open');
    }

    _onKeydown(e) {
        if (e.key === 'Escape') this.close();
    }
}

customElements.define('nav-sidebar', NavSidebar);
