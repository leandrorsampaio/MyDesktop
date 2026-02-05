const CATEGORIES = {
    1: 'Non categorized',
    2: 'Development',
    3: 'Communication',
    4: 'To Remember',
    5: 'Planning',
    6: 'Generic Task'
};

class TaskCard extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    async connectedCallback() {
        const [html, css] = await Promise.all([
            fetch('/components/task-card/task-card.html').then(response => response.text()),
            fetch('/components/task-card/task-card.css').then(response => response.text())
        ]);

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
        return ['data-task-id', 'data-status', 'data-category', 'data-priority', 'data-title', 'data-description'];
    }

    attributeChangedCallback() {
        if (this.shadowRoot.childElementCount > 1) {
            this.render();
        }
    }

    render() {
        const {
            title,
            description,
            priority,
            category
        } = this.dataset;

        const titleEl = this.shadowRoot.querySelector('.js-title');
        const descEl = this.shadowRoot.querySelector('.js-desc');
        const badgeEl = this.shadowRoot.querySelector('.js-badge');
        const starEl = this.shadowRoot.querySelector('.taskCard__star');

        if (titleEl) titleEl.textContent = title;
        if (descEl) descEl.textContent = description;

        if (priority === 'true') {
            starEl.style.display = 'inline';
        } else {
            starEl.style.display = 'none';
        }

        const categoryId = Number(category);
        if (category && categoryId !== 1) {
            badgeEl.style.display = 'inline-block';
            if (badgeEl) badgeEl.textContent = CATEGORIES[categoryId] || 'Unknown';
        } else {
            badgeEl.style.display = 'none';
        }
    }
}

customElements.define('task-card', TaskCard);
