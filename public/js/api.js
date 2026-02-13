/**
 * API module for Task Tracker.
 * Contains all HTTP fetch functions for communicating with the server.
 * These are pure functions that return data - state updates are handled by callers.
 */

/** Profile-scoped API base path (e.g., '/api/work') */
let apiBase = '/api';

/**
 * Sets the API base path for profile-scoped routes.
 * @param {string} alias - The profile alias
 */
export function setApiBase(alias) {
    apiBase = '/api/' + alias;
}

/**
 * Fetches all active tasks from the server.
 * @returns {Promise<Array<Object>>} Array of task objects
 */
export async function fetchTasksApi() {
    const response = await fetch(`${apiBase}/tasks`);
    return await response.json();
}

/**
 * Creates a new task via the API.
 * @param {Object} taskData - The task data to create
 * @param {string} taskData.title - Task title (required)
 * @param {string} [taskData.description] - Task description
 * @param {boolean} [taskData.priority] - Whether this is a priority task
 * @param {number} [taskData.category] - Category ID (1-6)
 * @returns {Promise<Object>} The created task object
 */
export async function createTaskApi(taskData) {
    const response = await fetch(`${apiBase}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData)
    });
    return await response.json();
}

/**
 * Updates an existing task via the API.
 * @param {string} id - The task ID to update
 * @param {Object} taskData - The fields to update
 * @returns {Promise<Object>} The updated task object
 */
export async function updateTaskApi(id, taskData) {
    const response = await fetch(`${apiBase}/tasks/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData)
    });
    return await response.json();
}

/**
 * Deletes a task permanently via the API.
 * @param {string} id - The task ID to delete
 * @returns {Promise<Object>} Success response
 */
export async function deleteTaskApi(id) {
    const response = await fetch(`${apiBase}/tasks/${id}`, { method: 'DELETE' });
    return await response.json();
}

/**
 * Moves a task to a different column or reorders within the same column.
 * @param {string} id - The task ID to move
 * @param {string} newStatus - Target column status (todo, wait, inprogress, done)
 * @param {number} newPosition - Zero-based position in the target column
 * @returns {Promise<Object>} The moved task object
 */
export async function moveTaskApi(id, newStatus, newPosition) {
    const response = await fetch(`${apiBase}/tasks/${id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newStatus, newPosition })
    });
    return await response.json();
}

/**
 * Generates a report snapshot via the API.
 * @returns {Promise<{ok: boolean, data?: Object, error?: string}>} Result object
 */
export async function generateReportApi() {
    const response = await fetch(`${apiBase}/reports/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
        const error = await response.json();
        return { ok: false, error: error.error || 'Failed to generate report' };
    }

    const data = await response.json();
    return { ok: true, data };
}

/**
 * Archives all completed tasks via the API.
 * @returns {Promise<{ok: boolean, data?: Object, error?: string}>} Result object
 */
export async function archiveTasksApi() {
    const response = await fetch(`${apiBase}/tasks/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
        const error = await response.json();
        return { ok: false, error: error.error || 'Failed to archive tasks' };
    }

    const data = await response.json();
    return { ok: true, data };
}

/**
 * Fetches all archived tasks from the server.
 * @returns {Promise<Array<Object>>} Array of archived task objects
 */
export async function fetchArchivedTasksApi() {
    const response = await fetch(`${apiBase}/archived`);
    return await response.json();
}

/**
 * Fetches all reports from the server.
 * @returns {Promise<Array<Object>>} Array of report objects
 */
export async function fetchReportsApi() {
    const response = await fetch(`${apiBase}/reports`);
    return await response.json();
}

/**
 * Updates a report title via the API.
 * @param {string} id - The report ID to update
 * @param {string} title - The new title
 * @returns {Promise<Object>} The updated report object
 */
export async function updateReportTitleApi(id, title) {
    const response = await fetch(`${apiBase}/reports/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title })
    });
    return await response.json();
}

/**
 * Deletes a report via the API.
 * @param {string} id - The report ID to delete
 * @returns {Promise<Object>} Success response
 */
export async function deleteReportApi(id) {
    const response = await fetch(`${apiBase}/reports/${id}`, { method: 'DELETE' });
    return await response.json();
}

// ===========================================
// Epic API Functions
// ===========================================

/**
 * Fetches all epics from the server.
 * @returns {Promise<Array<Object>>} Array of epic objects
 */
export async function fetchEpicsApi() {
    const response = await fetch(`${apiBase}/epics`);
    return await response.json();
}

/**
 * Creates a new epic via the API.
 * @param {Object} epicData - The epic data { name, color }
 * @returns {Promise<{ok: boolean, data?: Object, error?: string}>} Result object
 */
export async function createEpicApi(epicData) {
    const response = await fetch(`${apiBase}/epics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(epicData)
    });

    if (!response.ok) {
        const error = await response.json();
        return { ok: false, error: error.error || 'Failed to create epic' };
    }

    const data = await response.json();
    return { ok: true, data };
}

/**
 * Updates an existing epic via the API.
 * @param {string} id - The epic ID to update
 * @param {Object} epicData - The fields to update { name?, color? }
 * @returns {Promise<{ok: boolean, data?: Object, error?: string}>} Result object
 */
export async function updateEpicApi(id, epicData) {
    const response = await fetch(`${apiBase}/epics/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(epicData)
    });

    if (!response.ok) {
        const error = await response.json();
        return { ok: false, error: error.error || 'Failed to update epic' };
    }

    const data = await response.json();
    return { ok: true, data };
}

/**
 * Deletes an epic via the API.
 * @param {string} id - The epic ID to delete
 * @returns {Promise<{ok: boolean, error?: string}>} Result object
 */
export async function deleteEpicApi(id) {
    const response = await fetch(`${apiBase}/epics/${id}`, { method: 'DELETE' });

    if (!response.ok) {
        const error = await response.json();
        return { ok: false, error: error.error || 'Failed to delete epic' };
    }

    return { ok: true };
}

// ===========================================
// Profile API Functions (use /api/profiles directly, NOT apiBase)
// ===========================================

/**
 * Fetches all profiles from the server.
 * @returns {Promise<Array<Object>>} Array of profile objects
 */
export async function fetchProfilesApi() {
    const response = await fetch('/api/profiles');
    return await response.json();
}

/**
 * Creates a new profile via the API.
 * @param {Object} data - The profile data { name, color, letters }
 * @returns {Promise<{ok: boolean, data?: Object, error?: string}>} Result object
 */
export async function createProfileApi(data) {
    const response = await fetch('/api/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    if (!response.ok) {
        const error = await response.json();
        return { ok: false, error: error.error || 'Failed to create profile' };
    }

    const result = await response.json();
    return { ok: true, data: result };
}

/**
 * Updates an existing profile via the API.
 * @param {string} id - The profile ID to update
 * @param {Object} data - The fields to update { name?, color?, letters? }
 * @returns {Promise<{ok: boolean, data?: Object, error?: string}>} Result object
 */
export async function updateProfileApi(id, data) {
    const response = await fetch(`/api/profiles/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    if (!response.ok) {
        const error = await response.json();
        return { ok: false, error: error.error || 'Failed to update profile' };
    }

    const result = await response.json();
    return { ok: true, data: result };
}

/**
 * Deletes a profile via the API.
 * @param {string} id - The profile ID to delete
 * @returns {Promise<{ok: boolean, error?: string}>} Result object
 */
export async function deleteProfileApi(id) {
    const response = await fetch(`/api/profiles/${id}`, { method: 'DELETE' });

    if (!response.ok) {
        const error = await response.json();
        return { ok: false, error: error.error || 'Failed to delete profile' };
    }

    return { ok: true };
}
