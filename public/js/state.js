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

/** @type {Array<Object>} All categories */
export let categories = [];

/** @type {Array<Object>} All epics */
export let epics = [];

/** @type {string|null} Active epic filter ID (null = no filter) */
export let activeEpicFilter = null;

/** @type {Array<Object>} All profiles */
export let profiles = [];

/** @type {Object|null} Currently active profile */
export let activeProfile = null;

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
 * Creates a deep copy snapshot of the current tasks array for rollback purposes.
 * @returns {Array<Object>} A deep copy of the tasks array
 */
export function createTasksSnapshot() {
    return JSON.parse(JSON.stringify(tasks));
}

/**
 * Restores the tasks array from a snapshot (used for rollback on API failure).
 * @param {Array<Object>} snapshot - The snapshot to restore from
 */
export function restoreTasksFromSnapshot(snapshot) {
    tasks = snapshot;
}

/**
 * Finds a task by ID.
 * @param {string} id - The task ID to find
 * @returns {Object|undefined} The task object, or undefined if not found
 */
export function findTask(id) {
    return tasks.find(t => t.id === id);
}

/**
 * Replaces a task in the tasks array by ID.
 * Used for replacing temporary tasks with server-confirmed ones.
 * @param {string} oldId - The ID of the task to replace
 * @param {Object} newTask - The new task object
 */
export function replaceTask(oldId, newTask) {
    const index = tasks.findIndex(t => t.id === oldId);
    if (index !== -1) {
        tasks[index] = newTask;
    }
}

/**
 * Generates a temporary task ID for optimistic UI.
 * Prefixed with 'temp-' to identify optimistic tasks.
 * @returns {string} A temporary task ID
 */
export function generateTempId() {
    return 'temp-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
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

/**
 * Updates the categories array with new data.
 * @param {Array<Object>} newCategories - The new categories array
 */
export function setCategories(newCategories) {
    categories = newCategories;
}

/**
 * Updates the epics array with new data.
 * @param {Array<Object>} newEpics - The new epics array
 */
export function setEpics(newEpics) {
    epics = newEpics;
}

/**
 * Sets the active epic filter.
 * @param {string|null} epicId - The epic ID to filter by, or null to clear
 */
export function setActiveEpicFilter(epicId) {
    activeEpicFilter = epicId;
}

/**
 * Updates the profiles array with new data.
 * @param {Array<Object>} newProfiles - The new profiles array
 */
export function setProfiles(newProfiles) {
    profiles = newProfiles;
}

/**
 * Sets the active profile.
 * @param {Object|null} profile - The active profile object
 */
export function setActiveProfile(profile) {
    activeProfile = profile;
}
