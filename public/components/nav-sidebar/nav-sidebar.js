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
import { getStoredTheme, setStoredTheme, applyTheme, getThemeAppearance, defaultThemeFor } from '../../js/utils.js';

class NavSidebar extends HTMLElement {
    static templateCache = null;
    static observedAttributes = ['alias', 'page'];

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._boundKeydown = this._onKeydown.bind(this);
        this._boundThemeChanged = this._syncThemeToggle.bind(this);
        this._boundMediaChange = this._onMediaChange.bind(this);
        this._mql = null;
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
        document.removeEventListener('themechanged', this._boundThemeChanged);
        this._mql?.removeEventListener('change', this._boundMediaChange);
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

        // Theme toggle (light <-> dark) — per profile. Applies to <html> and
        // persists at `${alias}:theme`; CSS custom properties do the rest.
        this.shadowRoot.querySelector('.js-themeToggle')
            .addEventListener('click', () => this._toggleTheme());

        // Keep the toggle icon in sync when the theme changes from anywhere
        // (config selector, OS change), and follow the OS while on 'auto'.
        document.addEventListener('themechanged', this._boundThemeChanged);
        if (window.matchMedia) {
            this._mql = window.matchMedia('(prefers-color-scheme: dark)');
            this._mql.addEventListener('change', this._boundMediaChange);
        }

        this._updateLinks();
        this._updateActive();
        this._syncThemeToggle();
    }

    // ---- Theme ----

    _alias() {
        return this.getAttribute('alias')
            || window.location.pathname.split('/').filter(Boolean)[0]
            || '';
    }

    _currentAppearance() {
        return getThemeAppearance(document.documentElement.getAttribute('data-theme'));
    }

    _toggleTheme() {
        // Quick light/dark switch: jump to the DEFAULT theme of the opposite
        // appearance (overriding 'auto'). Specific themes (e.g. Paper) are
        // chosen in Config → General → Appearance.
        const target = defaultThemeFor(this._currentAppearance() === 'dark' ? 'light' : 'dark');
        setStoredTheme(this._alias(), target);  // fires 'themechanged' → _syncThemeToggle
    }

    _onMediaChange() {
        // Only react to OS changes when this profile is on 'auto'.
        if (getStoredTheme(this._alias()) === 'auto') applyTheme(this._alias());
    }

    _syncThemeToggle() {
        const btn = this.shadowRoot.querySelector('.js-themeToggle');
        if (!btn) return;
        const dark = this._currentAppearance() === 'dark';
        const label = dark ? 'Switch to light mode' : 'Switch to dark mode';
        btn.querySelector('svg-icon')?.setAttribute('icon', dark ? 'sun' : 'moon');
        btn.setAttribute('title', label);
        btn.setAttribute('aria-label', label);
        const tip = btn.querySelector('.navSidebar__tooltip');
        if (tip) tip.textContent = label;
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
            const isActive = item.dataset.page === page;
            item.classList.toggle('--active', isActive);
            // aria-current tells assistive tech which page link is active —
            // the --active class is visual-only
            if (isActive) {
                item.setAttribute('aria-current', 'page');
            } else {
                item.removeAttribute('aria-current');
            }
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
