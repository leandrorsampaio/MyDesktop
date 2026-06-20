class TaskCard extends HTMLElement {
    /** @type {Promise<[string, string]>|null} Cached templates Promise — store
     * the Promise (not the resolved value) so concurrent connectedCallback()
     * calls don't each trigger their own fetch. See SPEC Code Rule 7. */
    static templateCache = null;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    async connectedCallback() {
        if (!TaskCard.templateCache) {
            TaskCard.templateCache = Promise.all([
                fetch('/components/task-card/task-card.html').then(response => response.text()),
                fetch('/components/task-card/task-card.css').then(response => response.text())
            ]);
        }
        const [html, css] = await TaskCard.templateCache;

        const style = document.createElement('style');
        style.textContent = css;

        this.shadowRoot.innerHTML = html;
        this.shadowRoot.prepend(style);

        // Keyboard access: the card is focusable (j/k navigation in
        // shortcuts.js) and Enter opens it for editing
        if (!this.hasAttribute('tabindex')) this.setAttribute('tabindex', '0');
        this.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.composedPath()[0] === this) {
                this.dispatchEvent(new CustomEvent('request-edit', {
                    bubbles: true,
                    composed: true,
                    detail: { taskId: this.dataset.taskId }
                }));
            }
        });

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

        // Epic bar — inline pill badge. The epic colour flows in as --epic-color;
        // tint + dark-mode lightening are handled in CSS (theme-reactive).
        if (epicBarEl) {
            if (epicName && epicColor) {
                epicBarEl.style.display = 'inline-block';
                epicBarEl.style.setProperty('--epic-color', epicColor);
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
