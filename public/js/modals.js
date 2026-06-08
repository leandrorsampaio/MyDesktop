/**
 * Modals module for Task Tracker.
 * Handles all modal dialogs: task add/edit, reports, archived tasks, checklist, and confirmations.
 */

import { DEFAULT_CATEGORY_ID } from './constants.js';
import { escapeHtml, formatRelativeTime, toDatetimeLocalValue } from './utils.js';
import { tasks, editingTaskId, setEditingTaskId, createTasksSnapshot, restoreTasksFromSnapshot, replaceTask, generateTempId, removeTask, epics, setEpics, categories, setCategories, profiles, setProfiles, activeProfile, columns } from './state.js';
import {
    createTaskApi,
    updateTaskApi,
    deleteTaskApi,
    fetchEpicsApi,
    deleteEpicApi,
    fetchCategoriesApi,
    deleteCategoryApi,
    fetchProfilesApi,
    deleteProfileApi
} from './api.js';

// ==========================================
// Schedule Helper Functions
// ==========================================

/**
 * Sets an <input type="datetime-local"> to a quick preset time relative to now.
 * Exported so app.js can call it via delegated task form click events.
 * @param {HTMLInputElement} inputEl
 * @param {string} offsetType - '+1h'|'+3h'|'+1d'|'morning'|'monday'
 */
export function setQuickDateTime(inputEl, offsetType) {
    const now = new Date();
    let target;
    switch (offsetType) {
        case '+1h':    target = new Date(now.getTime() + 3600000);     break;
        case '+3h':    target = new Date(now.getTime() + 3 * 3600000); break;
        case '+1d':    target = new Date(now.getTime() + 86400000);    break;
        case 'morning': {
            target = new Date(now);
            target.setDate(target.getDate() + 1);
            target.setHours(8, 0, 0, 0);
            break;
        }
        case 'monday': {
            target = new Date(now);
            const day = target.getDay(); // 0=Sun … 6=Sat
            // If today is Monday (1), go 7 days forward; otherwise go to next Monday
            const daysUntil = day === 1 ? 7 : (8 - day) % 7;
            target.setDate(target.getDate() + daysUntil);
            target.setHours(8, 0, 0, 0);
            break;
        }
    }
    if (target) inputEl.value = toDatetimeLocalValue(target);
}

// ==========================================
// Task Modal Functions
// ==========================================

/**
 * Renders the action buttons for the task modal.
 * @param {boolean} isEditing - Whether we're editing an existing task
 * @param {Object} elements - DOM element references
 * @param {Function} onDelete - Callback for delete button click
 * @param {Function} onSubmit - Form submit handler
 * @param {Function} [onClone] - Callback for clone button click
 * @param {Function} [onSendToBacklog] - Callback for send-to-backlog button click
 */
export function renderTaskModalActions(isEditing, elements, onDelete, onSubmit, onClone, onSendToBacklog) {
    elements.taskModalActions.innerHTML = '';

    const rightActions = document.createElement('div');
    rightActions.className = 'modal__actionsRight';

    const cancelBtn = document.createElement('custom-button');
    cancelBtn.setAttribute('label', 'Cancel');
    cancelBtn.addEventListener('click', () => elements.taskModal.close());

    const saveBtn = document.createElement('custom-button');
    saveBtn.setAttribute('label', isEditing ? 'Update' : 'Save');
    saveBtn.setAttribute('modifier', 'save');
    saveBtn.setAttribute('type', 'submit');

    elements.taskForm.onsubmit = onSubmit;

    rightActions.appendChild(cancelBtn);

    if (isEditing && onClone) {
        const cloneBtn = document.createElement('custom-button');
        cloneBtn.setAttribute('label', 'Clone');
        cloneBtn.setAttribute('modifier', 'clone');
        cloneBtn.addEventListener('click', onClone);
        rightActions.appendChild(cloneBtn);
    }

    if (isEditing && onSendToBacklog) {
        const backlogBtn = document.createElement('custom-button');
        backlogBtn.setAttribute('label', 'Backlog');
        backlogBtn.setAttribute('modifier', 'backlog');
        backlogBtn.addEventListener('click', onSendToBacklog);
        rightActions.appendChild(backlogBtn);
    }

    rightActions.appendChild(saveBtn);

    if (isEditing) {
        const deleteBtn = document.createElement('custom-button');
        deleteBtn.setAttribute('label', 'Delete Task');
        deleteBtn.setAttribute('modifier', 'delete');
        deleteBtn.addEventListener('click', onDelete);
        elements.taskModalActions.appendChild(deleteBtn);
    }

    elements.taskModalActions.appendChild(rightActions);
}

/**
 * Renders dynamic category pills in the task modal.
 * @param {HTMLElement} container - The container element (.js-categoryPills)
 */
export function renderCategoryPills(container) {
    container.innerHTML = '';
    categories.forEach(cat => {
        const label = document.createElement('label');
        label.className = 'taskForm__categoryPill';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'task-category';
        radio.value = cat.id;
        if (cat.id === DEFAULT_CATEGORY_ID) radio.checked = true;
        const span = document.createElement('span');
        if (cat.icon) {
            const icon = document.createElement('svg-icon');
            icon.setAttribute('icon', cat.icon);
            icon.setAttribute('size', '14');
            span.appendChild(icon);
        }
        span.appendChild(document.createTextNode(cat.name));
        label.appendChild(radio);
        label.appendChild(span);
        container.appendChild(label);
    });
}

/**
 * Sets the category radio button selection.
 * @param {number} value - Category ID to select
 */
export function setCategorySelection(value) {
    const radio = document.querySelector(`input[name="task-category"][value="${value}"]`);
    if (radio) radio.checked = true;
}

/**
 * Gets the currently selected category from radio buttons.
 * @returns {number} The selected category ID
 */
export function getSelectedCategory() {
    const selected = document.querySelector('input[name="task-category"]:checked');
    return selected ? Number(selected.value) : DEFAULT_CATEGORY_ID;
}

/**
 * Opens the add task modal.
 * @param {Object} elements - DOM element references
 * @param {Function} onDelete - Callback for delete button
 * @param {Function} onSubmit - Form submit handler
 */
export function openAddTaskModal(elements, onDelete, onSubmit) {
    setEditingTaskId(null);
    elements.modalTitle.textContent = 'Add Task';
    elements.taskForm.reset();
    renderCategoryPills(elements.categoryPills);
    setCategorySelection(DEFAULT_CATEGORY_ID);
    populateTaskEpicSelect(elements.taskEpic, '');
    elements.taskLogSection.style.display = 'none';

    elements.taskDeadline.value       = '';
    elements.taskSnooze.value         = '';
    elements.deadlineHint.textContent = '';
    elements.snoozeHint.textContent   = '';

    renderTaskModalActions(false, elements, onDelete, onSubmit);

    elements.taskModal.open();
    elements.taskTitle.focus();
}

/**
 * Opens the edit task modal.
 * @param {string} taskId - The ID of the task to edit
 * @param {Object} elements - DOM element references
 * @param {Function} onDelete - Callback for delete button
 * @param {Function} onSubmit - Form submit handler
 * @param {Function} [onClone] - Callback for clone button click
 * @param {Function} [onSendToBacklog] - Callback for send-to-backlog button click
 */
export function openEditModal(taskId, elements, onDelete, onSubmit, onClone, onSendToBacklog) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    setEditingTaskId(taskId);
    elements.modalTitle.textContent = 'Edit Task';
    elements.taskTitle.value = task.title;
    elements.taskDescription.value = task.description || '';
    elements.taskPriority.checked = task.priority || false;
    renderCategoryPills(elements.categoryPills);
    setCategorySelection(task.category || DEFAULT_CATEGORY_ID);
    populateTaskEpicSelect(elements.taskEpic, task.epicId || '');

    // Render task log
    if (task.log && task.log.length > 0) {
        elements.taskLogSection.style.display = 'block';
        elements.taskLogList.innerHTML = task.log.map(entry => `
            <li><span class="taskForm__logDate">${entry.date}</span>: ${escapeHtml(entry.action)}</li>
        `).join('');
    } else {
        elements.taskLogSection.style.display = 'none';
    }

    // Deadline
    if (task.deadline) {
        elements.taskDeadline.value       = toDatetimeLocalValue(new Date(task.deadline));
        elements.deadlineHint.textContent = formatRelativeTime(task.deadline);
    } else {
        elements.taskDeadline.value       = '';
        elements.deadlineHint.textContent = '';
    }

    // Snooze — Option B: show only if snooze is still in the future
    const snoozeActive = task.snoozeUntil && new Date(task.snoozeUntil) > new Date();
    if (snoozeActive) {
        elements.taskSnooze.value       = toDatetimeLocalValue(new Date(task.snoozeUntil));
        elements.snoozeHint.textContent = formatRelativeTime(task.snoozeUntil);
    } else {
        elements.taskSnooze.value       = '';
        elements.snoozeHint.textContent = '';
    }

    renderTaskModalActions(true, elements, onDelete, onSubmit, onClone, onSendToBacklog);

    elements.taskModal.open();
    elements.taskTitle.focus();
}

/**
 * Opens the task modal pre-filled with a clone of an existing task.
 * Closes the current modal, updates the form with copied data (no logs),
 * prefixes the title with "(Clone) ", then reopens in Add mode.
 * @param {string} taskId - The ID of the task to clone
 * @param {Object} elements - DOM element references
 * @param {Function} onDelete - Callback for delete button (unused in add mode, kept for consistency)
 * @param {Function} onSubmit - Form submit handler
 */
export function openCloneTaskModal(taskId, elements, onDelete, onSubmit) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    // Close first so content updates are invisible during the transition
    elements.taskModal.close();

    setEditingTaskId(null);
    elements.modalTitle.textContent = 'Clone Task';
    elements.taskForm.reset();
    elements.taskTitle.value = `(Clone) ${task.title}`;
    elements.taskDescription.value = task.description || '';
    elements.taskPriority.checked = task.priority || false;
    renderCategoryPills(elements.categoryPills);
    setCategorySelection(task.category || DEFAULT_CATEGORY_ID);
    populateTaskEpicSelect(elements.taskEpic, task.epicId || '');
    elements.taskLogSection.style.display = 'none';

    if (task.deadline) {
        elements.taskDeadline.value       = toDatetimeLocalValue(new Date(task.deadline));
        elements.deadlineHint.textContent = formatRelativeTime(task.deadline);
    } else {
        elements.taskDeadline.value       = '';
        elements.deadlineHint.textContent = '';
    }

    const snoozeActive = task.snoozeUntil && new Date(task.snoozeUntil) > new Date();
    if (snoozeActive) {
        elements.taskSnooze.value       = toDatetimeLocalValue(new Date(task.snoozeUntil));
        elements.snoozeHint.textContent = formatRelativeTime(task.snoozeUntil);
    } else {
        elements.taskSnooze.value       = '';
        elements.snoozeHint.textContent = '';
    }

    renderTaskModalActions(false, elements, onDelete, onSubmit);

    requestAnimationFrame(() => {
        elements.taskModal.open();
        elements.taskTitle.focus();
    });
}

/**
 * Creates a form submit handler for the task modal using optimistic UI.
 * Updates UI immediately, then makes API call. Rolls back on failure.
 * @param {Object} elements - DOM element references
 * @param {Function} renderColumn - Function to render a column
 * @param {Function} renderAllColumns - Function to render all columns
 * @param {Function} addTaskToState - Function to add task to state
 * @param {Function} updateTaskInState - Function to update task in state
 * @returns {Function} The submit handler
 */
export function createTaskFormSubmitHandler(elements, renderColumn, renderAllColumns, addTaskToState, updateTaskInState, overrideColumnId = null) {
    return async function handleTaskFormSubmit(e) {
        e.preventDefault();

        const title = elements.taskTitle.value.trim();
        const description = elements.taskDescription.value.trim();
        const priority = elements.taskPriority.checked;
        const category = getSelectedCategory();
        const epicId = elements.taskEpic.value || null;
        const deadline    = elements.taskDeadline.value ? new Date(elements.taskDeadline.value).toISOString() : null;
        const snoozeUntil = elements.taskSnooze.value   ? new Date(elements.taskSnooze.value).toISOString()   : null;

        if (!title) {
            elements.toaster.warning('Title is required');
            return;
        }

        if (editingTaskId) {
            // UPDATE: Optimistic UI with rollback
            const previousTasks = createTasksSnapshot();
            const taskId = editingTaskId;

            // Optimistic update
            updateTaskInState(taskId, { title, description, priority, category, epicId, deadline, snoozeUntil });
            renderAllColumns();
            elements.taskModal.close();

            try {
                const updatedTask = await updateTaskApi(taskId, { title, description, priority, category, epicId, deadline, snoozeUntil });
                // Replace with server response (includes updated log, etc.)
                updateTaskInState(taskId, updatedTask);
                renderAllColumns();
            } catch (error) {
                // Rollback on failure
                restoreTasksFromSnapshot(previousTasks);
                renderAllColumns();
                console.error('Error updating task:', error);
                elements.toaster.error('Failed to update task. Changes have been reverted.');
            }
        } else {
            // CREATE: Optimistic UI with rollback
            const defaultColumnId = overrideColumnId || columns[0]?.id || 'todo';
            const tempId = generateTempId();
            const tempTask = {
                id: tempId,
                title,
                description,
                priority,
                category,
                epicId,
                deadline,
                snoozeUntil,
                status: defaultColumnId,
                position: 0, // Will be at top
                log: [],
                createdDate: new Date().toISOString()
            };

            // Optimistic add
            addTaskToState(tempTask);
            renderColumn(defaultColumnId);
            elements.taskModal.close();

            try {
                const newTask = await createTaskApi({ title, description, priority, category, epicId, deadline, snoozeUntil, status: defaultColumnId });
                // Replace temp task with real one from server
                replaceTask(tempId, newTask);
                renderColumn(defaultColumnId);
            } catch (error) {
                // Rollback on failure - remove temp task
                removeTask(tempId);
                renderColumn(defaultColumnId);
                console.error('Error creating task:', error);
                elements.toaster.error('Failed to create task. Changes have been reverted.');
            }
        }
    };
}

/**
 * Opens the delete confirmation modal.
 * @param {Object} elements - DOM element references
 */
export function openDeleteConfirmation(elements) {
    elements.confirmModal.open();
}

/**
 * Confirms and executes task deletion using optimistic UI.
 * Updates UI immediately, then makes API call. Rolls back on failure.
 * @param {Object} elements - DOM element references
 * @param {Function} renderAllColumns - Function to render all columns
 * @param {Function} removeTaskFromState - Function to remove task from state
 */
export async function confirmDeleteTask(elements, renderAllColumns, removeTaskFromState) {
    if (!editingTaskId) return;

    // Save snapshot for potential rollback
    const previousTasks = createTasksSnapshot();
    const taskId = editingTaskId;

    // Optimistic UI: Update immediately
    removeTaskFromState(taskId);
    renderAllColumns();
    elements.confirmModal.close();
    elements.taskModal.close();
    setEditingTaskId(null);

    try {
        await deleteTaskApi(taskId);
        // Success! UI already shows correct state
    } catch (error) {
        // Rollback: Restore previous state
        restoreTasksFromSnapshot(previousTasks);
        renderAllColumns();
        console.error('Error deleting task:', error);
        elements.toaster.error('Failed to delete task. Changes have been reverted.');
    }
}

// ==========================================
// Reports Modal Functions
// ==========================================

/**
 * Renders a single report view.
 * Supports both the new format (content.columns array) and the legacy format
 * (content.todo / content.inProgress / content.waiting / content.archived).
 * The back button is rendered with no handler — the caller is expected to
 * attach one (e.g., reports-page.js attaches a "close modal" handler).
 * @param {Object} report - The report to display
 * @param {Object} elements - DOM element references
 */
export function renderReportView(report, elements) {
    // Determine which format this report uses
    const isNewFormat = Array.isArray(report.content?.columns);

    const columnSectionsHtml = isNewFormat
        ? report.content.columns.map(col =>
            renderReportSection(escapeHtml(col.columnName), col.tasks)
          ).join('')
        : [
            renderReportSection('Completed Tasks (Archived)', report.content.archived),
            renderReportSection('In Progress', report.content.inProgress),
            renderReportSection('Waiting/Blocked', report.content.waiting),
            renderReportSection('To Do', report.content.todo)
          ].join('');

    elements.reportsContainer.innerHTML = `
        <div class="reportDetail">
            <div class="reportDetail__header">
                <button class="reportDetail__backBtn js-backToReportsBtn">← Back to Reports</button>
                <h3>${escapeHtml(report.title)}</h3>
            </div>

            ${columnSectionsHtml}

            <div class="reportDetail__section">
                <h4>Notes</h4>
                ${report.notes && (typeof report.notes === 'string' ? report.notes.trim() : report.notes.length > 0) ?
                    (typeof report.notes === 'string' ?
                        `<pre class="reportDetail__notesText">${escapeHtml(report.notes)}</pre>` :
                        report.notes.map(note => `
                            <div class="reportDetail__notesItem ${note.checked ? '--checked' : ''}">
                                ${note.checked ? '☑' : '☐'} ${escapeHtml(note.text)}
                            </div>
                        `).join('')
                    ) :
                    '<div class="emptyState">No notes</div>'
                }
            </div>
        </div>
    `;
}

/**
 * Renders a section of a report with tasks grouped by category.
 * @param {string} title - Section title (e.g., "Completed Tasks")
 * @param {Array<Object>} taskList - Array of task objects to display
 * @returns {string} HTML string for the report section
 */
export function renderReportSection(title, taskList) {
    if (!taskList || taskList.length === 0) {
        return `
            <div class="reportDetail__section">
                <h4>${title}</h4>
                <div class="emptyState">No tasks</div>
            </div>
        `;
    }

    // Group tasks by category
    const grouped = {};
    taskList.forEach(task => {
        const cat = task.category || 1;
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(task);
    });

    // Sort category keys numerically
    const sortedKeys = Object.keys(grouped).map(Number).sort((a, b) => a - b);

    // Build category + epic lookups from state ONCE (SPEC Code Rule 4 — no
    // .find() inside loops). Was O(tasks × epics) before; now O(epics + tasks).
    const categoryLookup = new Map(categories.map(c => [c.id, c.name]));
    const epicLookup     = new Map(epics.map(e => [e.id, e]));

    const taskHtml = sortedKeys.map(catKey => {
        // Prefer categoryName stored on tasks (for reports with snapshot data), else use dynamic lookup
        const catTasks = grouped[catKey];
        const catLabel = catTasks[0]?.categoryName || categoryLookup.get(catKey) || 'Unknown';
        return `
            <div class="reportDetail__categoryGroup">
                <div class="reportDetail__categoryLabel">${escapeHtml(catLabel)}</div>
                ${catTasks.map(task => {
                    const epicName = task.epicId ? (epicLookup.get(task.epicId)?.name || '') : '';
                    const epicLabel = epicName ? ` | ${escapeHtml(epicName)}` : '';
                    return `
                    <div class="reportDetail__task">
                        <div class="reportDetail__taskId">[${task.id.substring(0, 8)}${epicLabel}]</div>
                        <div class="reportDetail__taskTitle">${escapeHtml(task.title)}</div>
                        ${task.description ? `<div class="reportDetail__taskDesc">Description: ${escapeHtml(task.description)}</div>` : ''}
                    </div>
                    `;
                }).join('')}
            </div>
        `;
    }).join('');

    return `
        <div class="reportDetail__section">
            <h4>${title}</h4>
            ${taskHtml}
        </div>
    `;
}


/**
 * Populates the epic picker in the task modal.
 * @param {HTMLElement} pickerEl - The custom-picker element
 * @param {string} selectedEpicId - The currently selected epic ID
 */
export function populateTaskEpicSelect(pickerEl, selectedEpicId) {
    const items = epics.map(epic => ({
        value: epic.id,
        label: epic.name,
        color: epic.color
    }));
    pickerEl.setItems(items);
    if (selectedEpicId) {
        pickerEl.value = selectedEpicId;
    } else {
        pickerEl.clear();
    }
}


// ==========================================
// AI Staged Task Modals
// ==========================================

/**
 * Internal helper: populates the task modal form with staged task data and opens it.
 * @param {Object} stagedTask
 * @param {Object} elements
 * @param {string} title - Modal title text
 * @param {string} titlePrefix - Prefix to prepend to task title (e.g. "(Clone) ")
 * @param {Function} onSave - Called with { title, description, priority, epicId, category, deadline }
 */
function _openStagedTaskForm(stagedTask, elements, title, titlePrefix, onSave) {
    setEditingTaskId(null);
    elements.modalTitle.textContent = title;
    elements.taskForm.reset();

    elements.taskTitle.value       = titlePrefix + (stagedTask.title || '');
    elements.taskDescription.value = stagedTask.description || '';
    elements.taskPriority.checked  = stagedTask.priority || false;

    renderCategoryPills(elements.categoryPills);
    setCategorySelection(stagedTask.category || DEFAULT_CATEGORY_ID);
    populateTaskEpicSelect(elements.taskEpic, stagedTask.epicId || '');

    elements.taskLogSection.style.display = 'none';

    if (stagedTask.deadline && !titlePrefix) {
        elements.taskDeadline.value       = toDatetimeLocalValue(new Date(stagedTask.deadline));
        elements.deadlineHint.textContent = formatRelativeTime(stagedTask.deadline);
    } else {
        elements.taskDeadline.value       = '';
        elements.deadlineHint.textContent = '';
    }
    elements.taskSnooze.value       = '';
    elements.snoozeHint.textContent = '';

    // Render Cancel + Save only (no Delete, no Clone)
    elements.taskModalActions.innerHTML = '';
    const rightActions = document.createElement('div');
    rightActions.className = 'modal__actionsRight';

    const cancelBtn = document.createElement('custom-button');
    cancelBtn.setAttribute('label', 'Cancel');

    const saveBtn = document.createElement('custom-button');
    saveBtn.setAttribute('label', 'Save');
    saveBtn.setAttribute('modifier', 'save');
    saveBtn.setAttribute('type', 'submit');

    rightActions.appendChild(cancelBtn);
    rightActions.appendChild(saveBtn);
    elements.taskModalActions.appendChild(rightActions);

    function cleanup() {
        elements.taskForm.onsubmit = null;
        cancelBtn.removeEventListener('click', onCancel);
    }

    function onCancel() {
        cleanup();
        elements.taskModal.close();
    }

    elements.taskForm.onsubmit = (e) => {
        e.preventDefault();
        cleanup();
        onSave({
            title:       elements.taskTitle.value.trim(),
            description: elements.taskDescription.value,
            priority:    elements.taskPriority.checked,
            epicId:      elements.taskEpic.value || null,
            category:    getSelectedCategory(),
            deadline:    elements.taskDeadline.value
                ? new Date(elements.taskDeadline.value).toISOString()
                : null
        });
        elements.taskModal.close();
    };

    cancelBtn.addEventListener('click', onCancel);

    elements.taskModal.open();
    elements.taskTitle.focus();
}

/**
 * Opens the task modal pre-filled with a staged task for editing.
 * On save, calls onSave(updatedFields) — the caller persists the change.
 * @param {Object} stagedTask
 * @param {Object} elements
 * @param {{ onSave: Function }} opts
 */
export function openEditStagedTaskModal(stagedTask, elements, { onSave }) {
    _openStagedTaskForm(stagedTask, elements, 'Edit Staged Task', '', onSave);
}

/**
 * Opens the task modal pre-filled as a clone of a staged task.
 * Title is prefixed with "(Clone) ". Deadline is cleared.
 * On save, calls onSave(taskData) — the caller decides the destination.
 * @param {Object} stagedTask
 * @param {Object} elements
 * @param {{ onSave: Function }} opts
 */
export function openCloneStagedTaskModal(stagedTask, elements, { onSave }) {
    _openStagedTaskForm(stagedTask, elements, 'Clone Staged Task', '(Clone) ', onSave);
}
