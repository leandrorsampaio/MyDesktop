/**
 * NavSidebar Web Component
 *
 * Permanent icon-only navigation rail with page links, a slide-out panel
 * for checklist/notes (via <slot>), and a config page link.
 *
 * Attributes:
 *   alias  — profile alias, used to build href values on nav links
 *   page   — active page name ('board'|'dashboard'|'backlog'|'archive'|'reports'|'ai'|'config')
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
            NavSidebar.templateCache = Promise.all([
                fetch('/components/nav-sidebar/nav-sidebar.html').then(r => r.text()),
                fetch('/components/nav-sidebar/nav-sidebar.css').then(r => r.text()),
            ]);
        }

        const [html, css] = await NavSidebar.templateCache;
        this.shadowRoot.innerHTML = `<style>${css}</style>${html}`;
        this._init();
    }

    disconnectedCallback() {
        document.removeEventListener('keydown', this._boundKeydown);
    }

    attributeChangedCallback(name) {
        if (!this.shadowRoot.innerHTML) return;
        if (name === 'alias') this._updateLinks();
        if (name === 'page') this._updateActive();
    }

    // ---- private ----

    _init() {
        // Panel toggle button
        this.shadowRoot.querySelector('.js-panelBtn')
            .addEventListener('click', (e) => {
                e.stopPropagation();
                this._togglePanel();
            });

        // Panel backdrop closes panel
        this.shadowRoot.querySelector('.js-panelBackdrop')
            .addEventListener('click', () => this._closePanel());

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

    // ---- Panel (slide-out checklist + notes) ----

    _togglePanel() {
        if (this.classList.contains('--panelOpen')) {
            this._closePanel();
        } else {
            this._openPanel();
        }
    }

    _openPanel() {
        this.classList.add('--panelOpen');
        this.shadowRoot.querySelector('.js-panelBtn').classList.add('--active');
        document.addEventListener('keydown', this._boundKeydown);
    }

    _closePanel() {
        this.classList.remove('--panelOpen');
        this.shadowRoot.querySelector('.js-panelBtn').classList.remove('--active');
        document.removeEventListener('keydown', this._boundKeydown);
    }

    _onKeydown(e) {
        if (e.key === 'Escape') this._closePanel();
    }
}

customElements.define('nav-sidebar', NavSidebar);
