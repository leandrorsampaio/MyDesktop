import { DEFAULT_CHECKLIST_ITEMS, CHECKLIST_RESET_HOUR } from '../../js/constants.js';
import { escapeHtml } from '../../js/utils.js';

class DailyChecklist extends HTMLElement {
    /** @type {[string, string]|null} Cached [html, css] templates */
    static templateCache = null;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.recurrentTasks = [];
    }

    async connectedCallback() {
        if (!DailyChecklist.templateCache) {
            DailyChecklist.templateCache = await Promise.all([
                fetch('/components/daily-checklist/daily-checklist.html').then(response => response.text()),
                fetch('/components/daily-checklist/daily-checklist.css').then(response => response.text())
            ]);
        }
        const [html, css] = DailyChecklist.templateCache;

        const style = document.createElement('style');
        style.textContent = css;

        this.shadowRoot.innerHTML = html;
        this.shadowRoot.prepend(style);
        this.listElement = this.shadowRoot.querySelector('.js-recurrentList');

        this.init();
    }

    getStoragePrefix() {
        const segments = window.location.pathname.split('/').filter(Boolean);
        return (segments[0] || 'default') + ':';
    }

    init() {
        this.storagePrefix = this.getStoragePrefix();
        this.loadRecurrentTasks();
        this.checkDailyReset();
        this.render();
    }

    loadRecurrentTasks() {
        const stored = localStorage.getItem(this.storagePrefix + 'checklistConfig');
        if (stored) {
            try {
                this.recurrentTasks = JSON.parse(stored);
            } catch {
                this.recurrentTasks = [...DEFAULT_CHECKLIST_ITEMS];
            }
        } else {
            this.recurrentTasks = [...DEFAULT_CHECKLIST_ITEMS];
        }
    }

    getRecurrentTasksState() {
        const stored = localStorage.getItem(this.storagePrefix + 'recurrentTasksChecked');
        if (!stored) return {};
        try {
            return JSON.parse(stored);
        } catch {
            return {};
        }
    }

    toggleRecurrentTask(index, checked) {
        const state = this.getRecurrentTasksState();
        state[index] = checked;
        localStorage.setItem(this.storagePrefix + 'recurrentTasksChecked', JSON.stringify(state));
    }

    checkDailyReset() {
        const lastResetStr = localStorage.getItem(this.storagePrefix + 'lastRecurrentReset');
        const now = new Date();
        const todayAtResetHour = new Date(now);
        todayAtResetHour.setHours(CHECKLIST_RESET_HOUR, 0, 0, 0);

        if (now.getHours() < CHECKLIST_RESET_HOUR) {
            todayAtResetHour.setDate(todayAtResetHour.getDate() - 1);
        }

        let shouldReset = false;
        if (!lastResetStr) {
            shouldReset = true;
        } else {
            const lastReset = new Date(lastResetStr);
            if (lastReset < todayAtResetHour) {
                shouldReset = true;
            }
        }

        if (shouldReset) {
            localStorage.removeItem(this.storagePrefix + 'recurrentTasksChecked');
            localStorage.setItem(this.storagePrefix + 'lastRecurrentReset', now.toISOString());
        }
    }

    render() {
        this.listElement.innerHTML = '';
        const checkedItems = this.getRecurrentTasksState();

        this.recurrentTasks.forEach((task, index) => {
            const li = document.createElement('li');
            li.className = 'dailyChecklist__item';
            const isChecked = checkedItems[index];
            if (isChecked) li.classList.add('--checked');

            const hasUrl = task.url && task.url.trim() !== '';

            li.innerHTML = `
                <input type="checkbox" ${isChecked ? 'checked' : ''} />
                <span class="dailyChecklist__text">${escapeHtml(task.text)}</span>
                ${hasUrl ? `<a href="${escapeHtml(task.url)}" target="_blank" class="dailyChecklist__link" title="Open link">↗</a>` : ''}
            `;

            li.querySelector('input').addEventListener('change', (e) => {
                this.toggleRecurrentTask(index, e.target.checked);
                li.classList.toggle('--checked', e.target.checked);
            });

            li.querySelector('.dailyChecklist__text').addEventListener('click', () => {
                const checkbox = li.querySelector('input');
                checkbox.checked = !checkbox.checked;
                this.toggleRecurrentTask(index, checkbox.checked);
                li.classList.toggle('--checked', checkbox.checked);
            });

            this.listElement.appendChild(li);
        });
    }
}

customElements.define('daily-checklist', DailyChecklist);
