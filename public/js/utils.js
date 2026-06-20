/**
 * Shared utility functions for the Task Tracker application.
 *
 * Note: server.js has its own copies of getWeekNumber and toCamelCase
 * because it runs in Node.js and cannot import ES modules from /public.
 * If you modify getWeekNumber or toCamelCase here, also update server.js.
 */

import { THEMES, AUTO_THEME_LIGHT, AUTO_THEME_DARK } from './constants.js';

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

/**
 * Converts a Date object to the value format required by <input type="datetime-local">.
 * Uses LOCAL time (not UTC).
 * @param {Date} date
 * @returns {string} e.g. "2026-03-01T08:00"
 */
export function toDatetimeLocalValue(date) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Returns a human-readable relative time string for an ISO datetime.
 * Positive diff (future): "in 2d 3h" / "in 45m"
 * Negative diff (past):   "expired 4h ago" / "expired 2d ago"
 * @param {string} isoString - ISO 8601 datetime
 * @returns {string}
 */
export function formatRelativeTime(isoString) {
    const diffMs = new Date(isoString) - new Date();
    const past = diffMs < 0;
    const abs = Math.abs(diffMs);

    const totalMinutes = Math.floor(abs / 60000);
    const totalHours   = Math.floor(abs / 3600000);
    const totalDays    = Math.floor(abs / 86400000);

    let label;
    if (abs < 60000) {
        label = 'just now';
    } else if (abs < 3600000) {
        label = `${totalMinutes}m`;
    } else if (abs < 86400000) {
        const remainingMins = totalMinutes % 60;
        label = remainingMins > 0 ? `${totalHours}h ${remainingMins}m` : `${totalHours}h`;
    } else {
        const remainingHours = totalHours % 24;
        label = remainingHours > 0 ? `${totalDays}d ${remainingHours}h` : `${totalDays}d`;
    }

    return past ? `expired ${label} ago` : `in ${label}`;
}

/**
 * Returns the urgency level of a deadline based on configurable hour thresholds.
 * @param {string} isoString - ISO 8601 deadline datetime
 * @param {number[]} thresholds - [urgentHours, warningHours]
 * @returns {'overdue'|'urgent'|'warning'|'upcoming'}
 */
export function getDeadlineLevel(isoString, thresholds) {
    const diffHours = (new Date(isoString) - new Date()) / 3600000;
    if (diffHours <= 0)             return 'overdue';
    if (diffHours <= thresholds[0]) return 'urgent';
    if (diffHours <= thresholds[1]) return 'warning';
    return 'upcoming';
}

/* ============================================================================
 * Theme — profile-scoped, flat named themes.
 *
 * A theme is a single appearance (see constants.js THEMES); it simply IS light
 * or dark. Stored per profile at localStorage `${alias}:theme` as a theme id
 * (e.g. 'light' | 'paper' | 'dark') OR 'auto'. 'auto' (the default when unset)
 * follows the OS `prefers-color-scheme`, mapping to AUTO_THEME_LIGHT/DARK. The
 * resolved theme id is applied as `data-theme` on <html>; the matching
 * `[data-theme="<id>"]` token block does the rest (id 'light' = base :root).
 *
 * Source of truth for this logic. The inline bootstrap in index.html duplicates
 * only the *resolve* step (read key → explicit id, else fall back to OS) because
 * it must run before ES modules load to avoid a flash of the wrong theme.
 * ========================================================================== */

/** The theme object for an id, or null. */
export function getThemeById(id) {
    return THEMES.find(t => t.id === id) || null;
}

/** A theme id's appearance ('light' | 'dark'); defaults to 'light' for unknowns. */
export function getThemeAppearance(id) {
    return getThemeById(id)?.appearance || 'light';
}

/** The default theme id for an appearance — used by the rail light/dark toggle. */
export function defaultThemeFor(appearance) {
    return appearance === 'dark' ? AUTO_THEME_DARK : AUTO_THEME_LIGHT;
}

/** Reads a profile's stored theme choice. Returns a theme id or 'auto'. */
export function getStoredTheme(alias) {
    try {
        return localStorage.getItem(`${alias}:theme`) || 'auto';
    } catch (e) {
        return 'auto';
    }
}

/** Whether the OS currently prefers a dark colour scheme. */
export function systemPrefersDark() {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

/** Resolves a stored value (theme id or 'auto') to a concrete theme id. */
export function resolveTheme(value) {
    if (value && value !== 'auto' && getThemeById(value)) return value;
    return systemPrefersDark() ? AUTO_THEME_DARK : AUTO_THEME_LIGHT;
}

/**
 * Applies the given profile's resolved theme to <html> and fires a
 * `themechanged` event on document so live UI (e.g. the rail toggle) can sync.
 * Returns the resolved theme id.
 */
export function applyTheme(alias) {
    const id = resolveTheme(getStoredTheme(alias));
    document.documentElement.setAttribute('data-theme', id);
    document.dispatchEvent(new CustomEvent('themechanged', {
        detail: { theme: id, appearance: getThemeAppearance(id) }
    }));
    return id;
}

/** Persists a theme choice (theme id or 'auto') for a profile and applies it. */
export function setStoredTheme(alias, value) {
    try {
        localStorage.setItem(`${alias}:theme`, value);
    } catch (e) { /* private mode — still apply below */ }
    return applyTheme(alias);
}
