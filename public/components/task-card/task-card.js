class TaskCard extends HTMLElement {
    /** @type {[string, string]|null} Cached [html, css] templates */
    static templateCache = null;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    async connectedCallback() {
        if (!TaskCard.templateCache) {
            TaskCard.templateCache = await Promise.all([
                fetch('/components/task-card/task-card.html').then(response => response.text()),
                fetch('/components/task-card/task-card.css').then(response => response.text())
            ]);
        }
        const [html, css] = TaskCard.templateCache;

        const style = document.createElement('style');
        style.textContent = css;

        this.shadowRoot.innerHTML = html;
        this.shadowRoot.prepend(style);

        this.shadowRoot.querySelector('.taskCard__editBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.dispatchEvent(new CustomEvent('request-edit', {
                bubbles: true,
                composed: true,
                detail: { taskId: this.dataset.taskId }
            }));
        });

        this.render();
    }

    static get observedAttributes() {
        return [
            'data-task-id', 'data-status', 'data-category', 'data-category-name',
            'data-category-icon', 'data-priority', 'data-title', 'data-description',
            'data-epic-name', 'data-epic-color', 'data-epic-alias',
            'data-deadline', 'data-deadline-level', 'data-deadline-text',
            'hidden'
        ];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'hidden') {
            // display handled by :host([hidden]) CSS rule in task-card.css
            return;
        }

        if (this.shadowRoot.childElementCount > 1) {
            this.render();
        }
    }

    _hexToRgba(hex, alpha) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }

    render() {
        const {
            title,
            description,
            priority,
            category,
            categoryName,
            categoryIcon,
            epicName,
            epicColor,
            epicAlias
        } = this.dataset;

        const titleEl = this.shadowRoot.querySelector('.js-title');
        const descEl = this.shadowRoot.querySelector('.js-desc');
        const badgeEl = this.shadowRoot.querySelector('.js-badge');
        const starEl = this.shadowRoot.querySelector('.taskCard__star');
        const epicBarEl = this.shadowRoot.querySelector('.js-epicBar');

        if (titleEl) titleEl.textContent = title;
        if (descEl) descEl.textContent = description;

        if (priority === 'true') {
            starEl.style.display = 'inline';
        } else {
            starEl.style.display = 'none';
        }

        const categoryId = Number(category);
        if (category && categoryId !== 1 && categoryName) {
            badgeEl.style.display = 'inline-flex';
            badgeEl.innerHTML = '';
            if (categoryIcon) {
                const icon = document.createElement('svg-icon');
                icon.setAttribute('icon', categoryIcon);
                icon.setAttribute('size', '12');
                badgeEl.appendChild(icon);
            }
            const nameSpan = document.createElement('span');
            nameSpan.textContent = categoryName;
            badgeEl.appendChild(nameSpan);
        } else {
            badgeEl.style.display = 'none';
        }

        // Epic bar — inline pill badge with rgba tint bg + solid colored text
        if (epicBarEl) {
            if (epicName && epicColor) {
                epicBarEl.style.display = 'inline-block';
                epicBarEl.style.backgroundColor = this._hexToRgba(epicColor, 0.12);
                epicBarEl.style.color = epicColor;
                epicBarEl.textContent = epicName;
            } else {
                epicBarEl.style.display = 'none';
            }
        }

        // Deadline chip
        const deadlineEl = this.shadowRoot.querySelector('.js-deadline');
        if (deadlineEl) {
            const deadlineText  = this.dataset.deadlineText;
            const deadlineLevel = this.dataset.deadlineLevel;
            if (deadlineText) {
                deadlineEl.style.display = '';
                deadlineEl.textContent   = deadlineText;
                deadlineEl.className     = `taskCard__deadline js-deadline --${deadlineLevel}`;
            } else {
                deadlineEl.style.display = 'none';
                deadlineEl.textContent   = '';
            }
        }
    }
}

customElements.define('task-card', TaskCard);
