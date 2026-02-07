/**
 * Shared constants for the Task Tracker application.
 * This is the single source of truth for these values.
 *
 * Note: server.js has its own copy of CATEGORIES (as CATEGORY_LABELS)
 * because it runs in Node.js and cannot import ES modules from /public.
 * If you modify CATEGORIES here, also update server.js.
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

export const CATEGORIES = {
    1: 'Non categorized',
    2: 'Development',
    3: 'Communication',
    4: 'To Remember',
    5: 'Planning',
    6: 'Generic Task'
};

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
