/**
 * AppWelcome Web Component
 *
 * Displays a hardcoded "Welcome, Leandro" greeting with the current date,
 * weekday, and ISO week number. Self-contained — no public API or attributes.
 */
class AppWelcome extends HTMLElement {
    static templateCache = null;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    async connectedCallback() {
        if (!AppWelcome.templateCache) {
            AppWelcome.templateCache = await Promise.all([
                fetch('/components/app-welcome/app-welcome.html').then(r => r.text()),
                fetch('/components/app-welcome/app-welcome.css').then(r => r.text()),
            ]);
        }

        const [html, css] = AppWelcome.templateCache;
        this.shadowRoot.innerHTML = `<style>${css}</style>${html}`;
        this._initDate();
    }

    _initDate() {
        const now = new Date();
        const dateOptions = { year: 'numeric', month: 'long', day: 'numeric' };
        this.shadowRoot.querySelector('.appWelcome__date').textContent =
            now.toLocaleDateString('en-US', dateOptions);

        const weekdayOptions = { weekday: 'long' };
        this.shadowRoot.querySelector('.appWelcome__weekday').textContent =
            now.toLocaleDateString('en-US', weekdayOptions);

        this.shadowRoot.querySelector('.appWelcome__week').textContent =
            `Week ${this._getWeekNumber(now)}`;
    }

    /** Returns the ISO week number for the given date. */
    _getWeekNumber(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }
}

customElements.define('app-welcome', AppWelcome);
