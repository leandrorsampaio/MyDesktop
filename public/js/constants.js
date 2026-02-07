/**
 * Shared constants for the Task Tracker application.
 * This is the single source of truth for these values.
 *
 * Note: server.js has its own copy of CATEGORIES (as CATEGORY_LABELS)
 * because it runs in Node.js and cannot import ES modules from /public.
 * If you modify CATEGORIES here, also update server.js.
 */

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
