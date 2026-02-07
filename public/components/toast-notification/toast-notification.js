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
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this.toasts = [];
    }

    async connectedCallback() {
        const [html, css] = await Promise.all([
            fetch('/components/toast-notification/toast-notification.html').then(r => r.text()),
            fetch('/components/toast-notification/toast-notification.css').then(r => r.text())
        ]);

        const style = document.createElement('style');
        style.textContent = css;

        this.shadowRoot.innerHTML = html;
        this.shadowRoot.prepend(style);

        this.container = this.shadowRoot.querySelector('.toast__container');
    }

    /**
     * Shows a toast notification
     * @param {string} message - The message to display
     * @param {string} type - Type of toast: 'success', 'error', 'info', 'warning'
     * @param {number} duration - How long to show the toast in ms (default: 4000)
     */
    show(message, type = 'info', duration = 4000) {
        const toast = document.createElement('div');
        toast.className = `toast --${type}`;

        const icon = this.getIcon(type);

        toast.innerHTML = `
            <span class="toast__icon">${icon}</span>
            <span class="toast__message">${this.escapeHtml(message)}</span>
            <button class="toast__close" aria-label="Close">&times;</button>
        `;

        // Add close button handler
        toast.querySelector('.toast__close').addEventListener('click', () => {
            this.dismiss(toast);
        });

        this.container.appendChild(toast);

        // Trigger animation
        requestAnimationFrame(() => {
            toast.classList.add('--visible');
        });

        // Auto-dismiss
        if (duration > 0) {
            setTimeout(() => {
                this.dismiss(toast);
            }, duration);
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
     */
    success(message, duration) {
        return this.show(message, 'success', duration);
    }

    /**
     * Shows an error toast
     */
    error(message, duration) {
        return this.show(message, 'error', duration);
    }

    /**
     * Shows an info toast
     */
    info(message, duration) {
        return this.show(message, 'info', duration);
    }

    /**
     * Shows a warning toast
     */
    warning(message, duration) {
        return this.show(message, 'warning', duration);
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
}

customElements.define('toast-notification', ToastNotification);
