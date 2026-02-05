class DailyChecklist extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.recurrentTasks = [];
        this.DEFAULT_RECURRENT_TASKS = [
            { text: 'Check email', url: '' },
            { text: 'Review calendar', url: '' },
            { text: 'Water plants', url: '' },
            { text: 'Take vitamins', url: '' },
            { text: 'Exercise', url: '' },
            { text: 'Read for 30 minutes', url: '' }
        ];
    }

    async connectedCallback() {
        const [html, css] = await Promise.all([
            fetch('/components/daily-checklist/daily-checklist.html').then(response => response.text()),
            fetch('/components/daily-checklist/daily-checklist.css').then(response => response.text())
        ]);

        const style = document.createElement('style');
        style.textContent = css;

        this.shadowRoot.innerHTML = html;
        this.shadowRoot.prepend(style);
        this.listElement = this.shadowRoot.querySelector('.js-recurrentList');

        this.init();
    }

    init() {
        this.loadRecurrentTasks();
        this.checkDailyReset();
        this.render();
    }

    loadRecurrentTasks() {
        const stored = localStorage.getItem('checklistConfig');
        if (stored) {
            try {
                this.recurrentTasks = JSON.parse(stored);
            } catch {
                this.recurrentTasks = [...this.DEFAULT_RECURRENT_TASKS];
            }
        } else {
            this.recurrentTasks = [...this.DEFAULT_RECURRENT_TASKS];
        }
    }

    getRecurrentTasksState() {
        const stored = localStorage.getItem('recurrentTasksChecked');
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
        localStorage.setItem('recurrentTasksChecked', JSON.stringify(state));
    }

    checkDailyReset() {
        const lastResetStr = localStorage.getItem('lastRecurrentReset');
        const now = new Date();
        const todayAt6AM = new Date(now);
        todayAt6AM.setHours(6, 0, 0, 0);

        if (now.getHours() < 6) {
            todayAt6AM.setDate(todayAt6AM.getDate() - 1);
        }

        let shouldReset = false;
        if (!lastResetStr) {
            shouldReset = true;
        } else {
            const lastReset = new Date(lastResetStr);
            if (lastReset < todayAt6AM) {
                shouldReset = true;
            }
        }

        if (shouldReset) {
            localStorage.removeItem('recurrentTasksChecked');
            localStorage.setItem('lastRecurrentReset', now.toISOString());
        }
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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
                <span class="dailyChecklist__text">${this.escapeHtml(task.text)}</span>
                ${hasUrl ? `<a href="${this.escapeHtml(task.url)}" target="_blank" class="dailyChecklist__link" title="Open link">↗</a>` : ''}
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
