/**
 * API module for Task Tracker.
 * Contains all HTTP fetch functions for communicating with the server.
 * These are pure functions that return data - state updates are handled by callers.
 */

/**
 * Fetches all active tasks from the server.
 * @returns {Promise<Array<Object>>} Array of task objects
 */
export async function fetchTasksApi() {
    const response = await fetch('/api/tasks');
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
    const response = await fetch('/api/tasks', {
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
    const response = await fetch(`/api/tasks/${id}`, {
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
    const response = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
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
    const response = await fetch(`/api/tasks/${id}/move`, {
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
    const response = await fetch('/api/reports/generate', {
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
    const response = await fetch('/api/tasks/archive', {
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
    const response = await fetch('/api/archived');
    return await response.json();
}

/**
 * Fetches all reports from the server.
 * @returns {Promise<Array<Object>>} Array of report objects
 */
export async function fetchReportsApi() {
    const response = await fetch('/api/reports');
    return await response.json();
}

/**
 * Updates a report title via the API.
 * @param {string} id - The report ID to update
 * @param {string} title - The new title
 * @returns {Promise<Object>} The updated report object
 */
export async function updateReportTitleApi(id, title) {
    const response = await fetch(`/api/reports/${id}`, {
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
    const response = await fetch(`/api/reports/${id}`, { method: 'DELETE' });
    return await response.json();
}
