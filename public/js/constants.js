/**
 * Shared constants for the Task Tracker application.
 * This is the single source of truth for these values.
 *
 * Note: Categories are now dynamic and stored in categories.json per profile.
 * See server.js DEFAULT_CATEGORIES for the initial defaults.
 */

// ===========================================
// Application Configuration
// ===========================================

/** Default server port (used for display purposes on client) */
export const DEFAULT_PORT = 3001;

/** Hour of day (0-23) when daily checklist resets */
export const CHECKLIST_RESET_HOUR = 6;

/** Debounce delay in milliseconds for auto-save operations */
export const DEBOUNCE_DELAY_MS = 500;

/** Maximum number of gradient color steps for task cards */
export const MAX_GRADIENT_STEPS = 20;

/** Gradient index threshold below which light text is used (0-based) */
export const LIGHT_TEXT_THRESHOLD = 12;

// ===========================================
// Data Constants
// ===========================================

/** Maximum number of categories allowed */
export const MAX_CATEGORIES = 20;

/** Default category ID (Non categorized — cannot be deleted) */
export const DEFAULT_CATEGORY_ID = 1;

export const DEFAULT_CHECKLIST_ITEMS = [
    { text: 'Check email', url: '' },
    { text: 'Review calendar', url: '' },
    { text: 'Water plants', url: '' },
    { text: 'Take vitamins', url: '' },
    { text: 'Exercise', url: '' },
    { text: 'Read for 30 minutes', url: '' }
];

export const STATUS_COLUMNS = {
    'todo': 'kanban-column[data-status="todo"]',
    'wait': 'kanban-column[data-status="wait"]',
    'inprogress': 'kanban-column[data-status="inprogress"]',
    'done': 'kanban-column[data-status="done"]'
};

/** Maximum number of epics allowed */
export const MAX_EPICS = 20;

/** Maximum number of profiles allowed */
export const MAX_PROFILES = 20;

/** Maximum length for profile letters */
export const PROFILE_LETTERS_MAX = 3;

/**
 * Pre-defined epic colors (20 rainbow-inspired colors).
 * Each entry has a name and hex value.
 * Note: server.js has its own copy (EPIC_COLORS_SERVER).
 * Source of truth: /public/js/constants.js
 */
export const EPIC_COLORS = [
    { name: 'Ruby Red', hex: '#E74C3C' },
    { name: 'Coral', hex: '#FF6F61' },
    { name: 'Tangerine', hex: '#E67E22' },
    { name: 'Amber', hex: '#F5A623' },
    { name: 'Sunflower', hex: '#F1C40F' },
    { name: 'Lime', hex: '#A8D84E' },
    { name: 'Emerald', hex: '#2ECC71' },
    { name: 'Jade', hex: '#00B894' },
    { name: 'Teal', hex: '#1ABC9C' },
    { name: 'Cyan', hex: '#00CEC9' },
    { name: 'Sky Blue', hex: '#54A0FF' },
    { name: 'Ocean', hex: '#2E86DE' },
    { name: 'Royal Blue', hex: '#3742FA' },
    { name: 'Indigo', hex: '#5758BB' },
    { name: 'Purple', hex: '#8E44AD' },
    { name: 'Orchid', hex: '#B24BDB' },
    { name: 'Magenta', hex: '#E84393' },
    { name: 'Rose', hex: '#FD79A8' },
    { name: 'Slate', hex: '#636E72' },
    { name: 'Charcoal', hex: '#2D3436' }
];
