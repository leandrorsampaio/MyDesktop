/**
 * Modals module for Task Tracker.
 * Handles all modal dialogs: task add/edit, reports, archived tasks, checklist, and confirmations.
 */

import { CATEGORIES, DEFAULT_CHECKLIST_ITEMS } from './constants.js';
import { escapeHtml, formatDate } from './utils.js';
import { tasks, editingTaskId, setEditingTaskId } from './state.js';
import {
    createTaskApi,
    updateTaskApi,
    deleteTaskApi,
    fetchReportsApi,
    updateReportTitleApi,
    deleteReportApi,
    fetchArchivedTasksApi
} from './api.js';

// ==========================================
// Task Modal Functions
// ==========================================

/**
 * Renders the action buttons for the task modal.
 * @param {boolean} isEditing - Whether we're editing an existing task
 * @param {Object} elements - DOM element references
 * @param {Function} onDelete - Callback for delete button click
 * @param {Function} onSubmit - Form submit handler
 */
export function renderTaskModalActions(isEditing, elements, onDelete, onSubmit) {
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
    return selected ? Number(selected.value) : 1;
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
    setCategorySelection(1);
    elements.taskLogSection.style.display = 'none';

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
 */
export function openEditModal(taskId, elements, onDelete, onSubmit) {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;

    setEditingTaskId(taskId);
    elements.modalTitle.textContent = 'Edit Task';
    elements.taskTitle.value = task.title;
    elements.taskDescription.value = task.description || '';
    elements.taskPriority.checked = task.priority || false;
    setCategorySelection(task.category || 1);

    // Render task log
    if (task.log && task.log.length > 0) {
        elements.taskLogSection.style.display = 'block';
        elements.taskLogList.innerHTML = task.log.map(entry => `
            <li><span class="taskForm__logDate">${entry.date}</span>: ${escapeHtml(entry.action)}</li>
        `).join('');
    } else {
        elements.taskLogSection.style.display = 'none';
    }

    renderTaskModalActions(true, elements, onDelete, onSubmit);

    elements.taskModal.open();
    elements.taskTitle.focus();
}

/**
 * Creates a form submit handler for the task modal.
 * @param {Object} elements - DOM element references
 * @param {Function} renderColumn - Function to render a column
 * @param {Function} renderAllColumns - Function to render all columns
 * @param {Function} addTaskToState - Function to add task to state
 * @param {Function} updateTaskInState - Function to update task in state
 * @returns {Function} The submit handler
 */
export function createTaskFormSubmitHandler(elements, renderColumn, renderAllColumns, addTaskToState, updateTaskInState) {
    return async function handleTaskFormSubmit(e) {
        e.preventDefault();

        const title = elements.taskTitle.value.trim();
        const description = elements.taskDescription.value.trim();
        const priority = elements.taskPriority.checked;
        const category = getSelectedCategory();

        if (!title) {
            elements.toaster.warning('Title is required');
            return;
        }

        try {
            if (editingTaskId) {
                const updatedTask = await updateTaskApi(editingTaskId, { title, description, priority, category });
                updateTaskInState(editingTaskId, updatedTask);
                renderAllColumns();
            } else {
                const newTask = await createTaskApi({ title, description, priority, category });
                addTaskToState(newTask);
                renderColumn('todo');
            }
            elements.taskModal.close();
        } catch (error) {
            console.error('Error saving task:', error);
            elements.toaster.error('Failed to save task');
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
 * Confirms and executes task deletion.
 * @param {Object} elements - DOM element references
 * @param {Function} renderAllColumns - Function to render all columns
 * @param {Function} removeTaskFromState - Function to remove task from state
 */
export async function confirmDeleteTask(elements, renderAllColumns, removeTaskFromState) {
    if (editingTaskId) {
        try {
            await deleteTaskApi(editingTaskId);
            removeTaskFromState(editingTaskId);
            renderAllColumns();
            elements.confirmModal.close();
            elements.taskModal.close();
            setEditingTaskId(null);
        } catch (error) {
            console.error('Error deleting task:', error);
            elements.toaster.error('Failed to delete task');
        }
    }
}

// ==========================================
// Reports Modal Functions
// ==========================================

/**
 * Opens the reports modal and loads reports.
 * @param {Object} elements - DOM element references
 * @param {Function} closeMenu - Function to close dropdown menu
 */
export async function openReportsModal(elements, closeMenu) {
    closeMenu();
    try {
        const reports = await fetchReportsApi();
        renderReportsList(reports, elements);
        elements.reportsModal.open();
    } catch (error) {
        console.error('Error fetching reports:', error);
        elements.toaster.error('Failed to load reports');
    }
}

/**
 * Renders the list of reports in the reports modal.
 * @param {Array<Object>} reports - Array of report objects
 * @param {Object} elements - DOM element references
 */
export function renderReportsList(reports, elements) {
    if (reports.length === 0) {
        elements.reportsContainer.innerHTML = '<div class="emptyState">No reports generated yet</div>';
        return;
    }

    // Sort reports by date (newest first)
    reports.sort((a, b) => new Date(b.generatedDate) - new Date(a.generatedDate));

    elements.reportsContainer.innerHTML = `
        <ul class="reportsList">
            ${reports.map(report => `
                <li class="reportsList__item" data-report-id="${report.id}">
                    <div class="reportsList__row">
                        <input type="text" class="reportsList__titleEdit js-reportTitleEdit"
                            value="${escapeHtml(report.title)}" data-report-id="${report.id}" />
                        <button class="reportsList__deleteBtn js-reportDeleteBtn"
                            data-report-id="${report.id}" title="Delete report">delete</button>
                    </div>
                    <div class="reportsList__date">${formatDate(report.generatedDate)}</div>
                </li>
            `).join('')}
        </ul>
    `;

    // Event delegation for title edits
    elements.reportsContainer.querySelectorAll('.js-reportTitleEdit').forEach(input => {
        input.addEventListener('click', (e) => e.stopPropagation());
        input.addEventListener('blur', async () => {
            try {
                await updateReportTitleApi(input.dataset.reportId, input.value);
            } catch (error) {
                console.error('Error updating report title:', error);
            }
        });
    });

    // Event delegation for delete buttons
    elements.reportsContainer.querySelectorAll('.js-reportDeleteBtn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (confirm('Delete this report?')) {
                try {
                    await deleteReportApi(btn.dataset.reportId);
                    const updatedReports = await fetchReportsApi();
                    renderReportsList(updatedReports, elements);
                } catch (error) {
                    console.error('Error deleting report:', error);
                }
            }
        });
    });

    // Add click listeners to view reports
    elements.reportsContainer.querySelectorAll('.reportsList__item').forEach(li => {
        li.addEventListener('click', (e) => {
            if (e.target.classList.contains('js-reportTitleEdit') || e.target.classList.contains('js-reportDeleteBtn')) return;
            const reportId = li.dataset.reportId;
            const report = reports.find(r => r.id === reportId);
            if (report) renderReportView(report, reports, elements);
        });
    });
}

/**
 * Renders a single report view.
 * @param {Object} report - The report to display
 * @param {Array<Object>} allReports - All reports (for back navigation)
 * @param {Object} elements - DOM element references
 */
export function renderReportView(report, allReports, elements) {
    elements.reportsContainer.innerHTML = `
        <div class="reportDetail">
            <div class="reportDetail__header">
                <button class="reportDetail__backBtn js-backToReportsBtn">← Back to Reports</button>
                <h3>${escapeHtml(report.title)}</h3>
            </div>

            ${renderReportSection('Completed Tasks (Archived)', report.content.archived)}
            ${renderReportSection('In Progress', report.content.inProgress)}
            ${renderReportSection('Waiting/Blocked', report.content.waiting)}
            ${renderReportSection('To Do', report.content.todo)}

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

    // Event delegation for back button
    elements.reportsContainer.querySelector('.js-backToReportsBtn').addEventListener('click', () => {
        renderReportsList(allReports, elements);
    });
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

    const taskHtml = sortedKeys.map(catKey => {
        const catLabel = CATEGORIES[catKey] || 'Non categorized';
        const catTasks = grouped[catKey];
        return `
            <div class="reportDetail__categoryGroup">
                <div class="reportDetail__categoryLabel">${escapeHtml(catLabel)}</div>
                ${catTasks.map(task => `
                    <div class="reportDetail__task">
                        <div class="reportDetail__taskId">[${task.id.substring(0, 8)}]</div>
                        <div class="reportDetail__taskTitle">${escapeHtml(task.title)}</div>
                        ${task.description ? `<div class="reportDetail__taskDesc">Description: ${escapeHtml(task.description)}</div>` : ''}
                    </div>
                `).join('')}
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

// ==========================================
// Archived Tasks Modal Functions
// ==========================================

/**
 * Opens the archived tasks modal.
 * @param {Object} elements - DOM element references
 * @param {Function} closeMenu - Function to close dropdown menu
 */
export async function openArchivedModal(elements, closeMenu) {
    closeMenu();
    try {
        const archivedTasks = await fetchArchivedTasksApi();
        renderArchivedTasks(archivedTasks, elements);
        elements.archivedModal.open();
    } catch (error) {
        console.error('Error fetching archived tasks:', error);
        elements.toaster.error('Failed to load archived tasks');
    }
}

/**
 * Renders the list of archived tasks.
 * @param {Array<Object>} archivedTasks - Array of archived task objects
 * @param {Object} elements - DOM element references
 */
export function renderArchivedTasks(archivedTasks, elements) {
    if (archivedTasks.length === 0) {
        elements.archivedContainer.innerHTML = '<div class="emptyState">No completed tasks yet</div>';
        return;
    }

    // Sort by createdDate descending (newest completed first)
    archivedTasks.sort((a, b) => {
        const aDate = a.log && a.log.length > 0
            ? new Date(a.log[a.log.length - 1].date)
            : new Date(a.createdDate);
        const bDate = b.log && b.log.length > 0
            ? new Date(b.log[b.log.length - 1].date)
            : new Date(b.createdDate);
        return bDate - aDate;
    });

    elements.archivedContainer.innerHTML = `
        <div class="archivedView__count">${archivedTasks.length} completed task${archivedTasks.length !== 1 ? 's' : ''}</div>
        <ul class="archivedView__list">
            ${archivedTasks.map(task => {
                const completedDate = task.log && task.log.length > 0
                    ? task.log[task.log.length - 1].date
                    : task.createdDate.split('T')[0];
                return `
                    <li class="archivedView__item">
                        <div class="archivedView__itemHeader">
                            ${task.priority ? '<span class="archivedView__itemStar">★</span>' : ''}
                            <span class="archivedView__itemTitle">${escapeHtml(task.title)}</span>
                        </div>
                        ${task.description ? `<div class="archivedView__itemDesc">${escapeHtml(task.description)}</div>` : ''}
                        <div class="archivedView__itemDate">Completed: ${completedDate}</div>
                    </li>
                `;
            }).join('')}
        </ul>
    `;
}

// ==========================================
// Checklist Modal Functions
// ==========================================

let checklistItems = [];

/**
 * Opens the daily checklist editor modal.
 * @param {Object} elements - DOM element references
 * @param {Function} closeMenu - Function to close dropdown menu
 */
export function openChecklistModal(elements, closeMenu) {
    closeMenu();
    // Load current config from localStorage
    const stored = localStorage.getItem('checklistConfig');
    if (stored) {
        try {
            checklistItems = JSON.parse(stored);
        } catch {
            checklistItems = getDefaultChecklistItems();
        }
    } else {
        checklistItems = getDefaultChecklistItems();
    }
    renderChecklistEditor(elements);
    elements.checklistModal.open();
}

/**
 * Gets the default checklist items.
 * @returns {Array<Object>} Default checklist items
 */
function getDefaultChecklistItems() {
    return [...DEFAULT_CHECKLIST_ITEMS];
}

/**
 * Renders the checklist editor in the modal.
 * @param {Object} elements - DOM element references
 */
export function renderChecklistEditor(elements) {
    elements.checklistItemsContainer.innerHTML = checklistItems.map((item, index) => `
        <div class="checklistEditor__row" data-index="${index}">
            <input type="text" class="checklistEditor__textInput" value="${escapeHtml(item.text)}" placeholder="Task text" />
            <input type="text" class="checklistEditor__urlInput" value="${escapeHtml(item.url || '')}" placeholder="URL (optional)" />
            <button type="button" class="checklistEditor__removeBtn" data-index="${index}">&times;</button>
        </div>
    `).join('');

    // Add remove button listeners
    elements.checklistItemsContainer.querySelectorAll('.checklistEditor__removeBtn').forEach(btn => {
        btn.addEventListener('click', () => {
            const index = parseInt(btn.dataset.index);
            checklistItems.splice(index, 1);
            renderChecklistEditor(elements);
        });
    });
}

/**
 * Adds a new empty item to the checklist editor.
 * @param {Object} elements - DOM element references
 */
export function addChecklistItem(elements) {
    checklistItems.push({ text: '', url: '' });
    renderChecklistEditor(elements);
    // Focus the new text input
    const inputs = elements.checklistItemsContainer.querySelectorAll('.checklistEditor__textInput');
    if (inputs.length > 0) {
        inputs[inputs.length - 1].focus();
    }
}

/**
 * Saves the checklist configuration and refreshes the component.
 * @param {Object} elements - DOM element references
 */
export function saveChecklist(elements) {
    // Read values from inputs
    const items = [];
    elements.checklistItemsContainer.querySelectorAll('.checklistEditor__row').forEach(itemEl => {
        const text = itemEl.querySelector('.checklistEditor__textInput').value.trim();
        const url = itemEl.querySelector('.checklistEditor__urlInput').value.trim();
        if (text) {
            items.push({ text, url });
        }
    });

    // Save to localStorage
    localStorage.setItem('checklistConfig', JSON.stringify(items));

    // Refresh the daily-checklist component
    const checklistComponent = document.querySelector('daily-checklist');
    if (checklistComponent) {
        checklistComponent.loadRecurrentTasks();
        checklistComponent.render();
    }

    elements.checklistModal.close();
}
