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
        return ['data-task-id', 'data-status', 'data-category', 'data-category-name', 'data-category-icon', 'data-priority', 'data-title', 'data-description', 'data-epic-name', 'data-epic-color', 'data-epic-alias', 'hidden'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'hidden') {
            this.style.display = newValue === '' ? 'none' : 'flex';
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

        // Epic bar
        if (epicBarEl) {
            if (epicName && epicColor) {
                epicBarEl.style.display = 'block';
                epicBarEl.style.backgroundColor = epicColor;
                epicBarEl.textContent = epicName;
            } else {
                epicBarEl.style.display = 'none';
            }
        }
    }
}

customElements.define('task-card', TaskCard);
