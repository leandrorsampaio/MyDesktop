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
 * Parses a fetch Response, throwing on non-2xx status (with the server's
 * error message when available). Used by the throwing-style wrappers so
 * callers' try/catch rollback paths actually fire on HTTP errors — without
 * this, a 400/429 resolves with the error body and silently corrupts state.
 * The { ok, error } wrappers below handle errors inline instead.
 * @param {Response} response
 * @returns {Promise<any>} Parsed JSON body
 */
async function parseOrThrow(response) {
    if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Request failed (${response.status})`);
    }
    return response.json();
}

/**
 * Fetches all active tasks from the server.
 * @returns {Promise<Array<Object>>} Array of task objects
 */
export async function fetchTasksApi() {
    const response = await fetch(`${apiBase}/tasks`);
    return parseOrThrow(response);
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
    return parseOrThrow(response);
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
    return parseOrThrow(response);
}

/**
 * Deletes a task permanently via the API.
 * @param {string} id - The task ID to delete
 * @returns {Promise<Object>} Success response
 */
export async function deleteTaskApi(id) {
    const response = await fetch(`${apiBase}/tasks/${id}`, { method: 'DELETE' });
    return parseOrThrow(response);
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
    return parseOrThrow(response);
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
 * Archives tasks from a specific column via the API.
 * @param {string} columnId - The column ID whose tasks should be archived
 * @returns {Promise<{ok: boolean, data?: Object, error?: string}>} Result object
 */
export async function archiveTasksApi(columnId) {
    const response = await fetch(`${apiBase}/tasks/archive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(columnId ? { columnId } : {})
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
    return parseOrThrow(response);
}

/**
 * Restores an archived task back to the first board column.
 * @param {string} id - The archived task ID to restore
 * @returns {Promise<{ok: boolean, data?: Object, error?: string}>} Result object
 */
export async function restoreArchivedTaskApi(id) {
    const response = await fetch(`${apiBase}/archived/${id}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
        const error = await response.json();
        return { ok: false, error: error.error || 'Failed to restore task' };
    }

    const data = await response.json();
    return { ok: true, data };
}

/**
 * Fetches the full profile data export bundle (tasks, archive, epics,
 * categories, notes, reports, staged tasks + the profile itself).
 * @returns {Promise<Object>} The export bundle
 */
export async function fetchProfileExportApi() {
    const response = await fetch(`${apiBase}/export`);
    return parseOrThrow(response);
}

/**
 * Fetches all reports from the server.
 * @returns {Promise<Array<Object>>} Array of report objects
 */
export async function fetchReportsApi() {
    const response = await fetch(`${apiBase}/reports`);
    return parseOrThrow(response);
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
    return parseOrThrow(response);
}

/**
 * Deletes a report via the API.
 * @param {string} id - The report ID to delete
 * @returns {Promise<Object>} Success response
 */
export async function deleteReportApi(id) {
    const response = await fetch(`${apiBase}/reports/${id}`, { method: 'DELETE' });
    return parseOrThrow(response);
}

// ===========================================
// Category API Functions
// ===========================================

/**
 * Fetches all categories from the server.
 * @returns {Promise<Array<Object>>} Array of category objects
 */
export async function fetchCategoriesApi() {
    const response = await fetch(`${apiBase}/categories`);
    return parseOrThrow(response);
}

/**
 * Creates a new category via the API.
 * @param {Object} categoryData - The category data { name, icon }
 * @returns {Promise<{ok: boolean, data?: Object, error?: string}>} Result object
 */
export async function createCategoryApi(categoryData) {
    const response = await fetch(`${apiBase}/categories`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(categoryData)
    });

    if (!response.ok) {
        const error = await response.json();
        return { ok: false, error: error.error || 'Failed to create category' };
    }

    const data = await response.json();
    return { ok: true, data };
}

/**
 * Updates an existing category via the API.
 * @param {number} id - The category ID to update
 * @param {Object} categoryData - The fields to update { name?, icon? }
 * @returns {Promise<{ok: boolean, data?: Object, error?: string}>} Result object
 */
export async function updateCategoryApi(id, categoryData) {
    const response = await fetch(`${apiBase}/categories/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(categoryData)
    });

    if (!response.ok) {
        const error = await response.json();
        return { ok: false, error: error.error || 'Failed to update category' };
    }

    const data = await response.json();
    return { ok: true, data };
}

/**
 * Deletes a category via the API.
 * @param {number} id - The category ID to delete
 * @returns {Promise<{ok: boolean, error?: string}>} Result object
 */
export async function deleteCategoryApi(id) {
    const response = await fetch(`${apiBase}/categories/${id}`, { method: 'DELETE' });

    if (!response.ok) {
        const error = await response.json();
        return { ok: false, error: error.error || 'Failed to delete category' };
    }

    return { ok: true };
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
    return parseOrThrow(response);
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
    return parseOrThrow(response);
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

// ===========================================
// Column API Functions
// ===========================================

/**
 * Fetches all columns for the active profile (sorted by order).
 * @returns {Promise<Array<Object>>} Array of column objects
 */
export async function fetchColumnsApi() {
    const response = await fetch(`${apiBase}/columns`);
    return parseOrThrow(response);
}

/**
 * Creates a new column via the API.
 * @param {Object} data - The column data { name }
 * @returns {Promise<{ok: boolean, data?: Object, error?: string}>} Result object
 */
export async function createColumnApi(data) {
    const response = await fetch(`${apiBase}/columns`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    if (!response.ok) {
        const error = await response.json();
        return { ok: false, error: error.error || 'Failed to create column' };
    }

    return { ok: true, data: await response.json() };
}

/**
 * Updates a column via the API (rename / toggle hasArchive).
 * @param {string} id - The column ID to update
 * @param {Object} data - The fields to update { name?, hasArchive? }
 * @returns {Promise<{ok: boolean, data?: Object, error?: string}>} Result object
 */
export async function updateColumnApi(id, data) {
    const response = await fetch(`${apiBase}/columns/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    if (!response.ok) {
        const error = await response.json();
        return { ok: false, error: error.error || 'Failed to update column' };
    }

    return { ok: true, data: await response.json() };
}

/**
 * Saves the full reordered columns array via the API.
 * @param {Array<Object>} columns - Full columns array in new order
 * @returns {Promise<{ok: boolean, data?: Array<Object>, error?: string}>} Result object
 */
export async function reorderColumnsApi(columns) {
    const response = await fetch(`${apiBase}/columns`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columns })
    });

    if (!response.ok) {
        const error = await response.json();
        return { ok: false, error: error.error || 'Failed to reorder columns' };
    }

    return { ok: true, data: await response.json() };
}

/**
 * Deletes a column via the API (tasks are moved to the first column).
 * @param {string} id - The column ID to delete
 * @returns {Promise<{ok: boolean, data?: Object, error?: string}>} Result object
 */
export async function deleteColumnApi(id) {
    const response = await fetch(`${apiBase}/columns/${id}`, { method: 'DELETE' });

    if (!response.ok) {
        const error = await response.json();
        return { ok: false, error: error.error || 'Failed to delete column' };
    }

    return { ok: true, data: await response.json() };
}

// ===========================================
// AI Configuration API Functions (global — not profile-scoped)
// ===========================================

/**
 * Fetches AI configuration metadata (never returns API keys).
 * @returns {Promise<{ activeConfigId: string|null, configs: Array<Object> }>}
 */
export async function fetchAiConfigApi() {
    const response = await fetch('/api/ai/config');
    return parseOrThrow(response);
}

/**
 * Creates a new AI config entry.
 * @param {{ name: string, provider: string, model: string, apiKey?: string, baseUrl?: string }} data
 * @returns {Promise<{ok: boolean, data?: Object, error?: string}>}
 */
export async function createAiConfigEntryApi(data) {
    const response = await fetch('/api/ai/config/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        const err = await response.json();
        return { ok: false, error: err.error || 'Failed to create AI config' };
    }
    return { ok: true, data: await response.json() };
}

/**
 * Updates an existing AI config entry.
 * @param {string} id
 * @param {{ name: string, provider: string, model: string, apiKey?: string, baseUrl?: string }} data
 * @returns {Promise<{ok: boolean, data?: Object, error?: string}>}
 */
export async function updateAiConfigEntryApi(id, data) {
    const response = await fetch(`/api/ai/config/entries/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    if (!response.ok) {
        const err = await response.json();
        return { ok: false, error: err.error || 'Failed to update AI config' };
    }
    return { ok: true, data: await response.json() };
}

/**
 * Deletes an AI config entry.
 * @param {string} id
 * @returns {Promise<{ok: boolean, data?: Object, error?: string}>}
 */
export async function deleteAiConfigEntryApi(id) {
    const response = await fetch(`/api/ai/config/entries/${encodeURIComponent(id)}`, {
        method: 'DELETE'
    });
    if (!response.ok) {
        const err = await response.json();
        return { ok: false, error: err.error || 'Failed to delete AI config' };
    }
    return { ok: true, data: await response.json() };
}

/**
 * Sets the active AI config entry.
 * @param {string} configId
 * @returns {Promise<{ok: boolean, data?: Object, error?: string}>}
 */
export async function setActiveAiConfigApi(configId) {
    const response = await fetch('/api/ai/config/active', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ configId })
    });
    if (!response.ok) {
        const err = await response.json();
        return { ok: false, error: err.error || 'Failed to set active AI config' };
    }
    return { ok: true, data: await response.json() };
}

// ===========================================
// AI Chat API Function (profile-scoped)
// ===========================================

/**
 * Sends a chat message to the AI and returns narrative + newly staged tasks.
 * @param {Array<{ role: string, content: string }>} messages - Full conversation history
 * @returns {Promise<{ok: boolean, data?: { narrative: string, tasks: Array<Object> }, error?: string}>}
 */
export async function sendAiChatApi(messages) {
    const response = await fetch(`${apiBase}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages })
    });

    if (!response.ok) {
        // .catch guards against non-JSON error bodies (e.g. an HTML 502
        // page from a local provider proxy like LM Studio/Ollama)
        const error = await response.json().catch(() => ({}));
        return { ok: false, error: error.error || 'AI request failed' };
    }

    return { ok: true, data: await response.json() };
}

// ===========================================
// AI Staged Tasks API Functions (profile-scoped)
// ===========================================

/**
 * Fetches all staged tasks for the active profile.
 * @returns {Promise<Array<Object>>}
 */
export async function fetchStagedTasksApi() {
    const response = await fetch(`${apiBase}/ai/staged`);
    return parseOrThrow(response);
}

/**
 * Creates a staged task manually.
 * @param {Object} data
 * @returns {Promise<{ok: boolean, data?: Object, error?: string}>}
 */
export async function createStagedTaskApi(data) {
    const response = await fetch(`${apiBase}/ai/staged`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    if (!response.ok) {
        const error = await response.json();
        return { ok: false, error: error.error || 'Failed to create staged task' };
    }

    return { ok: true, data: await response.json() };
}

/**
 * Updates a staged task.
 * @param {string} id
 * @param {Object} data
 * @returns {Promise<{ok: boolean, data?: Object, error?: string}>}
 */
export async function updateStagedTaskApi(id, data) {
    const response = await fetch(`${apiBase}/ai/staged/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });

    if (!response.ok) {
        const error = await response.json();
        return { ok: false, error: error.error || 'Failed to update staged task' };
    }

    return { ok: true, data: await response.json() };
}

/**
 * Deletes a staged task permanently.
 * @param {string} id
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function deleteStagedTaskApi(id) {
    const response = await fetch(`${apiBase}/ai/staged/${id}`, { method: 'DELETE' });

    if (!response.ok) {
        const error = await response.json();
        return { ok: false, error: error.error || 'Failed to delete staged task' };
    }

    return { ok: true };
}

/**
 * Promotes a staged task to the backlog column.
 * Auto-creates the backlog column if none exists.
 * @param {string} id
 * @returns {Promise<{ok: boolean, data?: Object, error?: string}>}
 */
export async function promoteToBacklogApi(id) {
    const response = await fetch(`${apiBase}/ai/staged/${id}/promote/backlog`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
        const error = await response.json();
        return { ok: false, error: error.error || 'Failed to promote to backlog' };
    }

    return { ok: true, data: await response.json() };
}

/**
 * Promotes a staged task to the board's first column.
 * @param {string} id
 * @returns {Promise<{ok: boolean, data?: Object, error?: string}>}
 */
export async function promoteToBoardApi(id) {
    const response = await fetch(`${apiBase}/ai/staged/${id}/promote/board`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
        const error = await response.json();
        return { ok: false, error: error.error || 'Failed to promote to board' };
    }

    return { ok: true, data: await response.json() };
}
