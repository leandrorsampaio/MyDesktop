/**
 * Shared utility functions for the Task Tracker application.
 *
 * Note: server.js has its own copies of getWeekNumber and toCamelCase
 * because it runs in Node.js and cannot import ES modules from /public.
 * If you modify getWeekNumber or toCamelCase here, also update server.js.
 */

/**
 * Escapes HTML special characters to prevent XSS attacks.
 * @param {string} text - The text to escape
 * @returns {string} The escaped HTML string
 */
export function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Calculates the ISO week number for a given date.
 * @param {Date} date - The date to get the week number for
 * @returns {number} The ISO week number (1-53)
 */
export function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

/**
 * Formats an ISO date string to a human-readable format.
 * @param {string} isoString - The ISO date string
 * @returns {string} Formatted date string (e.g., "Jan 25, 2026, 10:30 AM")
 */
export function formatDate(isoString) {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Converts a string to camelCase.
 * Used for epic alias generation.
 * @param {string} str - The string to convert
 * @returns {string} camelCase version
 */
export function toCamelCase(str) {
    return str
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 0)
        .map((word, i) => i === 0
            ? word.toLowerCase()
            : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        )
        .join('');
}
