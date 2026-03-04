/**
 * ProfileSelector Web Component
 *
 * Avatar button + profile name + dropdown for switching profiles.
 *
 * Public API:
 *   setProfiles(profiles)      — Set all available profiles
 *   setActiveProfile(profile)  — Set the currently active profile
 *
 * Dispatches:
 *   profile-select (CustomEvent, bubbles+composed)
 *     detail: { alias: string }  — alias of the profile to navigate to
 *   profile-open-new-tab (CustomEvent, bubbles+composed)
 *     detail: { alias: string }  — alias of the profile to open in a new tab
 */
class ProfileSelector extends HTMLElement {
    static templateCache = null;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._profiles = [];
        this._activeProfile = null;
        this._boundClickOutside = this._onClickOutside.bind(this);
        this._boundKeydown = (e) => { if (e.key === 'Escape') this._closeDropdown(); };
    }

    async connectedCallback() {
        if (!ProfileSelector.templateCache) {
            ProfileSelector.templateCache = await Promise.all([
                fetch('/components/profile-selector/profile-selector.html').then(r => r.text()),
                fetch('/components/profile-selector/profile-selector.css').then(r => r.text()),
            ]);
        }

        const [html, css] = ProfileSelector.templateCache;
        this.shadowRoot.innerHTML = `<style>${css}</style>${html}`;
        this._init();
        // Render any data set before connectedCallback fired
        this._renderSelector();
        if (this._profiles.length) this._renderDropdown();
    }

    disconnectedCallback() {
        document.removeEventListener('click', this._boundClickOutside);
        document.removeEventListener('keydown', this._boundKeydown);
    }

    /** Sets the full list of profiles and re-renders the dropdown. */
    setProfiles(profiles) {
        this._profiles = profiles || [];
        if (this.shadowRoot.innerHTML) this._renderDropdown();
    }

    /** Sets the active profile and updates the selector display. */
    setActiveProfile(profile) {
        this._activeProfile = profile;
        if (this.shadowRoot.innerHTML) {
            this._renderSelector();
            this._renderDropdown();
        }
    }

    // ---- private ----

    _init() {
        const btn  = this.shadowRoot.querySelector('.js-profileBtn');
        const name = this.shadowRoot.querySelector('.js-profileName');

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            this._toggleDropdown();
        });

        name.addEventListener('click', (e) => {
            e.stopPropagation();
            this._toggleDropdown();
        });
    }

    _renderSelector() {
        if (!this._activeProfile || !this.shadowRoot.innerHTML) return;
        const btn  = this.shadowRoot.querySelector('.js-profileBtn');
        const name = this.shadowRoot.querySelector('.js-profileName');
        btn.textContent = this._activeProfile.letters;
        btn.style.backgroundColor = this._activeProfile.color;
        name.textContent = this._activeProfile.name;
    }

    _renderDropdown() {
        if (!this.shadowRoot.innerHTML) return;
        const dropdown = this.shadowRoot.querySelector('.js-profileDropdown');
        dropdown.innerHTML = this._profiles.map(p => {
            const isActive  = p.id === this._activeProfile?.id;
            const newTabBtn = !isActive
                ? `<button class="profileSelector__dropdownNewTab js-newTabBtn" data-alias="${this._esc(p.alias)}" title="Open in new tab" type="button">&#8599;</button>`
                : '';
            return `
                <button class="profileSelector__dropdownItem${isActive ? ' --active' : ''} js-profileItem"
                        data-alias="${this._esc(p.alias)}" type="button">
                    <span class="profileSelector__dropdownIcon" style="background-color: ${p.color};">${this._esc(p.letters)}</span>
                    <span class="profileSelector__dropdownName">${this._esc(p.name)}</span>
                    ${newTabBtn}
                </button>
            `;
        }).join('');

        // Profile items — navigate or close
        dropdown.querySelectorAll('.js-profileItem').forEach(item => {
            item.addEventListener('click', () => {
                const alias = item.dataset.alias;
                this._closeDropdown();
                if (alias !== this._activeProfile?.alias) {
                    this.dispatchEvent(new CustomEvent('profile-select', {
                        detail: { alias },
                        bubbles: true,
                        composed: true,
                    }));
                }
            });
        });

        // New-tab buttons
        dropdown.querySelectorAll('.js-newTabBtn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this._closeDropdown();
                this.dispatchEvent(new CustomEvent('profile-open-new-tab', {
                    detail: { alias: btn.dataset.alias },
                    bubbles: true,
                    composed: true,
                }));
            });
        });
    }

    _toggleDropdown() {
        const dropdown = this.shadowRoot.querySelector('.js-profileDropdown');
        if (dropdown.classList.contains('--active')) {
            this._closeDropdown();
        } else {
            this._renderDropdown();
            dropdown.classList.add('--active');
            document.addEventListener('click', this._boundClickOutside);
            document.addEventListener('keydown', this._boundKeydown);
        }
    }

    _closeDropdown() {
        const dropdown = this.shadowRoot.querySelector('.js-profileDropdown');
        if (dropdown) dropdown.classList.remove('--active');
        document.removeEventListener('click', this._boundClickOutside);
        document.removeEventListener('keydown', this._boundKeydown);
    }

    _onClickOutside(e) {
        // e.target is retargeted to host element for shadow-root clicks
        if (!this.contains(e.target)) this._closeDropdown();
    }

    _esc(str) {
        const d = document.createElement('div');
        d.appendChild(document.createTextNode(String(str)));
        return d.innerHTML;
    }
}

customElements.define('profile-selector', ProfileSelector);
