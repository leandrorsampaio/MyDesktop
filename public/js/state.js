/**
 * Shared application state module.
 * Provides centralized state management for the Task Tracker application.
 * All modules import from here to read/write shared state.
 */

/** @type {Array<Object>} All active tasks */
export let tasks = [];

/** @type {string|null} ID of the task currently being edited */
export let editingTaskId = null;

/** @type {Set<number>} Active category filter IDs */
export const activeCategoryFilters = new Set();

/** @type {boolean} Whether priority filter is active */
export let priorityFilterActive = false;

/** @type {boolean} Whether crisis mode is active */
export let crisisModeActive = false;

/** @type {string} Original page title (saved when entering crisis mode) */
export let originalTitle = '';

/**
 * Updates the tasks array with new data.
 * @param {Array<Object>} newTasks - The new tasks array
 */
export function setTasks(newTasks) {
    tasks = newTasks;
}

/**
 * Adds a task to the tasks array.
 * @param {Object} task - The task to add
 */
export function addTask(task) {
    tasks.push(task);
}

/**
 * Updates a task in the tasks array.
 * @param {string} id - The task ID to update
 * @param {Object} updates - The fields to update
 */
export function updateTaskInState(id, updates) {
    const index = tasks.findIndex(t => t.id === id);
    if (index !== -1) {
        tasks[index] = { ...tasks[index], ...updates };
    }
}

/**
 * Removes a task from the tasks array.
 * @param {string} id - The task ID to remove
 */
export function removeTask(id) {
    tasks = tasks.filter(t => t.id !== id);
}

/**
 * Sets the editing task ID.
 * @param {string|null} id - The task ID being edited, or null if not editing
 */
export function setEditingTaskId(id) {
    editingTaskId = id;
}

/**
 * Sets the priority filter state.
 * @param {boolean} active - Whether priority filter should be active
 */
export function setPriorityFilterActive(active) {
    priorityFilterActive = active;
}

/**
 * Sets the crisis mode state.
 * @param {boolean} active - Whether crisis mode should be active
 */
export function setCrisisModeActive(active) {
    crisisModeActive = active;
}

/**
 * Sets the original title (saved before entering crisis mode).
 * @param {string} title - The original page title
 */
export function setOriginalTitle(title) {
    originalTitle = title;
}
