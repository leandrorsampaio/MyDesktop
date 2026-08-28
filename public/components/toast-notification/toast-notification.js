/**
 * Toast Notification Component
 *
 * A simple toast notification system for user feedback.
 * Supports success, error, info, and warning types.
 *
 * Usage:
 *   // Get the toast container (should be added to HTML once)
 *   const toaster = document.querySelector('toast-notification');
 *
 *   // Show different types of toasts
 *   toaster.show('Task created successfully', 'success');
 *   toaster.show('Failed to save', 'error');
 *   toaster.show('Processing...', 'info');
 *   toaster.show('Are you sure?', 'warning');
 *
 *   // With custom duration (default is 4000ms)
 *   toaster.show('Quick message', 'success', 2000);
 */
class ToastNotification extends HTMLElement {
    /** @type {Promise<[string, string]>|null} Cached templates Promise — store
     * the Promise (not the resolved value) so concurrent connectedCallback()
     * calls don't each trigger their own fetch. See SPEC Code Rule 7. */
    static templateCache = null;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.toasts = [];
        this._timeoutIds = new Set(); // Track auto-dismiss timeouts for cleanup
        // Resolved once connectedCallback has built the shadow DOM — show()
        // awaits this so a toast fired during page load doesn't hit a
        // null container and throw
        this._ready = new Promise(resolve => { this._resolveReady = resolve; });
    }

    async connectedCallback() {
        if (!ToastNotification.templateCache) {
            ToastNotification.templateCache = Promise.all([
                fetch('/components/toast-notification/toast-notification.html').then(r => r.text()),
                fetch('/components/toast-notification/toast-notification.css').then(r => r.text())
            ]);
        }
        const [html, css] = await ToastNotification.templateCache;

        const style = document.createElement('style');
        style.textContent = css;

        this.shadowRoot.innerHTML = html;
        this.shadowRoot.prepend(style);

        this.container = this.shadowRoot.querySelector('.toast__container');
        this._resolveReady();
    }

    /**
     * Shows a toast notification
     * @param {string} message - The message to display
     * @param {string} type - Type of toast: 'success', 'error', 'info', 'warning'
     * @param {number} duration - How long to show the toast in ms (default: 4000)
     * @param {{label: string, onClick: Function}} [action] - Optional inline
     *        action, e.g. Undo. Clicking it runs onClick and dismisses the
     *        toast. Used where a flow completes without a confirmation step
     *        and the toast is the only place to take it back.
     */
    async show(message, type = 'info', duration = 4000, action = null) {
        await this._ready;
        const toast = document.createElement('div');
        toast.className = `toast --${type}`;

        const icon = this.getIcon(type);

        toast.innerHTML = `
            <span class="toast__icon">${icon}</span>
            <span class="toast__message">${this.escapeHtml(message)}</span>
            ${action ? `<button class="toast__action">${this.escapeHtml(action.label)}</button>` : ''}
            <button class="toast__close" aria-label="Close">&times;</button>
        `;

        // Add close button handler
        toast.querySelector('.toast__close').addEventListener('click', () => {
            this.dismiss(toast);
        });

        if (action) {
            toast.querySelector('.toast__action').addEventListener('click', () => {
                this.dismiss(toast);
                action.onClick();
            });
        }

        this.container.appendChild(toast);

        // Trigger animation
        requestAnimationFrame(() => {
            toast.classList.add('--visible');
        });

        // Auto-dismiss
        if (duration > 0) {
            const timeoutId = setTimeout(() => {
                this._timeoutIds.delete(timeoutId);
                this.dismiss(toast);
            }, duration);
            this._timeoutIds.add(timeoutId);
        }

        return toast;
    }

    /**
     * Dismisses a toast
     * @param {HTMLElement} toast - The toast element to dismiss
     */
    dismiss(toast) {
        if (!toast || !toast.parentNode) return;

        toast.classList.remove('--visible');
        toast.classList.add('--hiding');

        setTimeout(() => {
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
        }, 300);
    }

    /**
     * Shows a success toast
     * @param {string} message
     * @param {number} [duration]
     * @param {{label: string, onClick: Function}} [action] - Optional inline action
     */
    success(message, duration, action) {
        return this.show(message, 'success', duration, action);
    }

    /**
     * Shows an error toast
     */
    error(message, duration, action) {
        return this.show(message, 'error', duration, action);
    }

    /**
     * Shows an info toast
     */
    info(message, duration, action) {
        return this.show(message, 'info', duration, action);
    }

    /**
     * Shows a warning toast
     */
    warning(message, duration, action) {
        return this.show(message, 'warning', duration, action);
    }

    getIcon(type) {
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };
        return icons[type] || icons.info;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    disconnectedCallback() {
        // Clear all pending auto-dismiss timeouts to prevent memory leaks
        this._timeoutIds.forEach(id => clearTimeout(id));
        this._timeoutIds.clear();
    }
}

customElements.define('toast-notification', ToastNotification);
