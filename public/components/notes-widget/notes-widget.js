class NotesWidget extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.notes = { content: '' };
        this.saveNotesTimeout = null;
    }

    async connectedCallback() {
        const [html, css] = await Promise.all([
            fetch('/components/notes-widget/notes-widget.html').then(response => response.text()),
            fetch('/components/notes-widget/notes-widget.css').then(response => response.text())
        ]);

        const style = document.createElement('style');
        style.textContent = css;

        this.shadowRoot.innerHTML = html;
        this.shadowRoot.prepend(style);

        this.notesTextarea = this.shadowRoot.querySelector('.js-notesTextarea');
        this.notesSaveStatus = this.shadowRoot.querySelector('.js-notesSaveStatus');

        this.notesTextarea.addEventListener('input', () => this.debouncedSaveNotes());

        this.fetchNotes();
    }

    async fetchNotes() {
        try {
            const response = await fetch('/api/notes');
            const data = await response.json();
            if (data.content !== undefined) {
                this.notes = data;
            } else {
                this.notes = { content: '' };
            }
            this.notesTextarea.value = this.notes.content;
        } catch (error) {
            console.error('Error fetching notes:', error);
        }
    }

    async saveNotes() {
        try {
            this.showNotesSaveStatus('saving');
            await fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(this.notes)
            });
            this.showNotesSaveStatus('saved');
        } catch (error) {
            console.error('Error saving notes:', error);
        }
    }

    showNotesSaveStatus(status) {
        const el = this.notesSaveStatus;
        el.className = 'notes__status js-notesSaveStatus';
        el.style.opacity = '1';

        if (status === 'saving') {
            el.textContent = 'Saving...';
            el.classList.add('--saving');
        } else if (status === 'saved') {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
            el.textContent = `Saved at ${timeStr}`;
            el.classList.add('--saved');
        }
    }

    debouncedSaveNotes() {
        if (this.saveNotesTimeout) {
            clearTimeout(this.saveNotesTimeout);
        }
        this.saveNotesTimeout = setTimeout(() => {
            this.notes.content = this.notesTextarea.value;
            this.saveNotes();
        }, 500);
    }
}

customElements.define('notes-widget', NotesWidget);
