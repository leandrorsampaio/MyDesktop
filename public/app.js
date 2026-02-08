/**
 * Task Tracker Application - Main Entry Point
 *
 * This is the main application file that wires together all modules:
 * - state.js: Shared application state
 * - api.js: HTTP API functions
 * - filters.js: Category and priority filtering
 * - crisis-mode.js: Crisis mode functionality
 * - modals.js: Modal dialog handling
 */

import { STATUS_COLUMNS, MAX_GRADIENT_STEPS, LIGHT_TEXT_THRESHOLD } from './js/constants.js';
import { getWeekNumber } from './js/utils.js';
import {
    tasks,
    setTasks,
    addTask,
    updateTaskInState,
    removeTask,
    activeCategoryFilters,
    priorityFilterActive,
    createTasksSnapshot,
    restoreTasksFromSnapshot,
    findTask
} from './js/state.js';
import { fetchTasksApi, moveTaskApi, generateReportApi, archiveTasksApi } from './js/api.js';
import {
    renderCategoryFilters,
    toggleCategoryFilter,
    togglePriorityFilter,
    applyAllFilters
} from './js/filters.js';
import { toggleCrisisMode } from './js/crisis-mode.js';
import {
    openAddTaskModal,
    openEditModal,
    openDeleteConfirmation,
    confirmDeleteTask,
    createTaskFormSubmitHandler,
    openReportsModal,
    openArchivedModal,
    openChecklistModal,
    addChecklistItem,
    saveChecklist
} from './js/modals.js';

(function() {
    'use strict';

    // ==========================================
    // DOM Elements
    // ==========================================
    const elements = {
        // Header
        currentDate: document.querySelector('.js-currentDate'),
        currentWeekday: document.querySelector('.js-currentWeekday'),
        currentWeek: document.querySelector('.js-currentWeek'),
        menuBtn: document.querySelector('.js-menuBtn'),
        dropdownMenu: document.querySelector('.js-dropdownMenu'),

        // Task Modal
        taskModal: document.querySelector('.js-taskModal'),
        taskForm: document.querySelector('.js-taskForm'),
        modalTitle: document.querySelector('.js-modalTitle'),
        taskTitle: document.querySelector('.js-taskTitle'),
        taskDescription: document.querySelector('.js-taskDescription'),
        taskPriority: document.querySelector('.js-taskPriority'),
        taskLogSection: document.querySelector('.js-taskLogSection'),
        taskLogList: document.querySelector('.js-taskLogList'),
        taskModalActions: document.querySelector('.js-taskModalActions'),
        addTaskBtn: document.querySelector('.js-addTaskBtn'),

        // Reports Modal
        reportsModal: document.querySelector('.js-reportsModal'),
        reportsContainer: document.querySelector('.js-reportsContainer'),
        viewReportsBtn: document.querySelector('.js-viewReportsBtn'),

        // Archived Tasks Modal
        archivedModal: document.querySelector('.js-archivedModal'),
        archivedContainer: document.querySelector('.js-archivedContainer'),
        viewArchivedBtn: document.querySelector('.js-viewArchivedBtn'),

        // Confirm Modal
        confirmModal: document.querySelector('.js-confirmModal'),
        confirmCancel: document.querySelector('.js-confirmCancel'),
        confirmDelete: document.querySelector('.js-confirmDelete'),

        // Privacy
        appContainer: document.querySelector('.js-appContainer'),
        privacyToggleBtn: document.querySelector('.js-privacyToggleBtn'),

        // Category Filters
        categoryFilters: document.querySelector('.js-categoryFilters'),
        priorityFilterBtn: document.querySelector('.js-priorityFilterBtn'),

        // Crisis Mode
        crisisModeBtn: document.querySelector('.js-crisisModeBtn'),
        headerToolbar: document.querySelector('.toolbar'),

        // Archive & Report
        archiveBtn: document.querySelector('.js-archiveBtn'),
        reportBtn: document.querySelector('.js-reportBtn'),

        // Kanban container
        kanban: document.querySelector('.kanban'),

        // Checklist Modal
        editChecklistBtn: document.querySelector('.js-editChecklistBtn'),
        checklistModal: document.querySelector('.js-checklistModal'),
        checklistItemsContainer: document.querySelector('.js-checklistItemsContainer'),
        addChecklistItemBtn: document.querySelector('.js-addChecklistItemBtn'),
        checklistCancelBtn: document.querySelector('.js-checklistCancelBtn'),
        checklistSaveBtn: document.querySelector('.js-checklistSaveBtn'),

        // Toast Notifications
        toaster: document.querySelector('.js-toaster')
    };

    // ==========================================
    // Header Date Functions
    // ==========================================

    /**
     * Initializes the header date display with current date info.
     */
    function initHeaderDate() {
        const now = new Date();

        // Format date: "January 25, 2026"
        const dateOptions = { year: 'numeric', month: 'long', day: 'numeric' };
        elements.currentDate.textContent = now.toLocaleDateString('en-US', dateOptions);

        // Weekday: "Saturday"
        const weekdayOptions = { weekday: 'long' };
        elements.currentWeekday.textContent = now.toLocaleDateString('en-US', weekdayOptions);

        // Week number
        const weekNumber = getWeekNumber(now);
        elements.currentWeek.textContent = `Week ${weekNumber}`;
    }

    // ==========================================
    // Hamburger Menu
    // ==========================================

    /**
     * Toggles the hamburger menu open/closed.
     */
    function toggleMenu() {
        elements.menuBtn.classList.toggle('--active');
        elements.dropdownMenu.classList.toggle('--active');
    }

    /**
     * Closes the hamburger menu.
     */
    function closeMenu() {
        elements.menuBtn.classList.remove('--active');
        elements.dropdownMenu.classList.remove('--active');
    }

    // ==========================================
    // Color Management
    // ==========================================

    /**
     * Calculates the color information for a task card based on its position.
     * Returns both the CSS gradient variable and whether to use light text.
     * @param {string} status - The task status (todo, wait, inprogress, done)
     * @param {number} position - Zero-based position of the task in its column
     * @param {number} totalInColumn - Total number of tasks in the column
     * @returns {{gradient: string, useLightText: boolean}} Color info object
     */
    function getTaskColorInfo(status, position, totalInColumn) {
        let gradientIndex;

        if (totalInColumn <= MAX_GRADIENT_STEPS) {
            gradientIndex = position;
        } else {
            // Distribute evenly across gradient steps
            gradientIndex = Math.floor((position / totalInColumn) * MAX_GRADIENT_STEPS);
        }

        gradientIndex = Math.min(gradientIndex, MAX_GRADIENT_STEPS - 1);

        return {
            gradient: `var(--${status}-gradient-${gradientIndex})`,
            useLightText: gradientIndex < LIGHT_TEXT_THRESHOLD
        };
    }

    // ==========================================
    // Task Operations
    // ==========================================

    /** @type {boolean} Lock to prevent race conditions during move operations */
    let isMoving = false;

    /**
     * Fetches all active tasks from the server and re-renders all columns.
     * @returns {Promise<void>}
     */
    async function fetchTasks() {
        try {
            const fetchedTasks = await fetchTasksApi();
            setTasks(fetchedTasks);
            renderAllColumns();
        } catch (error) {
            console.error('Error fetching tasks:', error);
        }
    }

    /**
     * Moves a task to a different column or reorders within the same column.
     * Uses optimistic UI - updates immediately, rolls back on failure.
     * Uses a lock to prevent race conditions from rapid drag operations.
     * @param {string} id - The task ID to move
     * @param {string} newStatus - Target column status (todo, wait, inprogress, done)
     * @param {number} newPosition - Zero-based position in the target column
     * @returns {Promise<Object|undefined>} The moved task object, or undefined on error
     */
    async function moveTask(id, newStatus, newPosition) {
        // Prevent race condition: ignore if already processing a move
        if (isMoving) return;
        isMoving = true;

        // Save snapshot for potential rollback
        const previousTasks = createTasksSnapshot();
        const task = findTask(id);
        if (!task) {
            isMoving = false;
            return;
        }

        const oldStatus = task.status;

        // Optimistic update: Update task locally
        updateTaskInState(id, { status: newStatus, position: newPosition });

        // Reorder positions in affected columns
        const affectedStatuses = new Set([oldStatus, newStatus]);
        affectedStatuses.forEach(status => {
            const columnTasks = tasks
                .filter(t => t.status === status)
                .sort((a, b) => a.position - b.position);

            columnTasks.forEach((t, idx) => {
                if (t.id !== id) {
                    updateTaskInState(t.id, { position: idx >= newPosition && status === newStatus ? idx + 1 : idx });
                }
            });
        });

        // Render immediately
        renderAllColumns();

        try {
            await moveTaskApi(id, newStatus, newPosition);
            // Fetch fresh data to get accurate positions from server
            await fetchTasks();
        } catch (error) {
            // Rollback on failure
            restoreTasksFromSnapshot(previousTasks);
            renderAllColumns();
            console.error('Error moving task:', error);
            elements.toaster.error('Failed to move task. Changes have been reverted.');
        } finally {
            // Always unlock, even if error occurred
            isMoving = false;
        }
    }

    // ==========================================
    // Render Functions
    // ==========================================

    /**
     * Re-renders all kanban columns and applies active filters.
     */
    function renderAllColumns() {
        Object.keys(STATUS_COLUMNS).forEach(status => renderColumn(status));
        applyAllFilters();
    }

    /**
     * Renders a single kanban column with its tasks.
     * Note: Does not apply filters - caller should call applyAllFilters() if needed.
     * @param {string} status - The column status to render (todo, wait, inprogress, done)
     */
    function renderColumn(status) {
        const columnEl = document.querySelector(STATUS_COLUMNS[status]);
        const columnTasks = tasks
            .filter(t => t.status === status)
            .sort((a, b) => a.position - b.position);

        if (columnEl) {
            columnEl.renderTasks(columnTasks, createTaskCard);
        }
    }

    /**
     * Creates a task-card custom element with proper styling and event handlers.
     * @param {Object} task - The task data object
     * @param {number} position - Zero-based position in the column
     * @param {number} totalInColumn - Total number of tasks in the column
     * @returns {HTMLElement} The configured task-card custom element
     */
    function createTaskCard(task, position, totalInColumn) {
        const card = document.createElement('task-card');

        card.dataset.taskId = task.id;
        card.dataset.status = task.status;
        card.dataset.category = String(task.category || 1);
        card.dataset.priority = task.priority ? 'true' : 'false';
        card.dataset.title = task.title;
        card.dataset.description = task.description || '';

        card.draggable = true;

        // Apply gradient background and text color
        const colorInfo = getTaskColorInfo(task.status, position, totalInColumn);
        card.style.background = colorInfo.gradient;
        card.classList.add(colorInfo.useLightText ? '--lightText' : '--darkText');

        // Drag events
        card.addEventListener('dragstart', (e) => {
            e.target.classList.add('--dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', task.id);
        });

        card.addEventListener('dragend', (e) => {
            e.target.classList.remove('--dragging');
        });

        return card;
    }

    // ==========================================
    // Report & Archive Handlers
    // ==========================================

    /**
     * Handles the generate report button click.
     */
    async function handleGenerateReport() {
        if (!confirm('Generate a report snapshot of all current tasks?')) {
            return;
        }

        try {
            const result = await generateReportApi();
            if (result.ok) {
                elements.toaster.success(`Report generated: ${result.data.title}`);
            } else {
                elements.toaster.error(result.error);
            }
        } catch (error) {
            console.error('Error generating report:', error);
            elements.toaster.error('Failed to generate report');
        }
    }

    /**
     * Handles the archive button click.
     */
    async function handleArchive() {
        const doneTasks = tasks.filter(t => t.status === 'done');
        if (doneTasks.length === 0) {
            elements.toaster.info('No completed tasks to archive');
            return;
        }

        if (!confirm(`Archive ${doneTasks.length} completed task${doneTasks.length !== 1 ? 's' : ''}?`)) {
            return;
        }

        try {
            const result = await archiveTasksApi();
            if (result.ok) {
                await fetchTasks();
                elements.toaster.success(`${result.data.archivedCount} task${result.data.archivedCount !== 1 ? 's' : ''} archived`);
            } else {
                elements.toaster.error(result.error);
            }
        } catch (error) {
            console.error('Error archiving tasks:', error);
            elements.toaster.error('Failed to archive tasks');
        }
    }

    // ==========================================
    // Event Listeners
    // ==========================================

    /**
     * Initializes all event listeners.
     */
    function initEventListeners() {
        // Wrapper that renders a column and applies filters
        const renderColumnWithFilters = (status) => {
            renderColumn(status);
            applyAllFilters();
        };

        // Create the task form submit handler
        const handleTaskFormSubmit = createTaskFormSubmitHandler(
            elements,
            renderColumnWithFilters,
            renderAllColumns,
            addTask,
            updateTaskInState
        );

        // Hamburger Menu
        elements.menuBtn.addEventListener('click', toggleMenu);

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!elements.menuBtn.contains(e.target) && !elements.dropdownMenu.contains(e.target)) {
                closeMenu();
            }
        });

        // Priority Filter
        elements.priorityFilterBtn.addEventListener('click', () => {
            togglePriorityFilter(elements.priorityFilterBtn, applyAllFilters);
        });

        // Crisis Mode
        elements.crisisModeBtn.addEventListener('click', () => {
            toggleCrisisMode(elements, closeMenu);
        });

        // Privacy Toggle
        elements.privacyToggleBtn.addEventListener('click', () => {
            elements.appContainer.classList.toggle('--privacyMode');
            const isHidden = elements.appContainer.classList.contains('--privacyMode');
            elements.privacyToggleBtn.textContent = isHidden ? 'Show' : 'Hide';
            elements.privacyToggleBtn.classList.toggle('--active', isHidden);
        });

        // Add Task
        elements.addTaskBtn.addEventListener('click', () => {
            openAddTaskModal(
                elements,
                () => openDeleteConfirmation(elements),
                handleTaskFormSubmit
            );
        });

        // Report & Archive
        elements.reportBtn.addEventListener('click', handleGenerateReport);
        elements.archiveBtn.addEventListener('click', handleArchive);

        // Reports
        elements.viewReportsBtn.addEventListener('click', () => {
            openReportsModal(elements, closeMenu);
        });

        // Archived Tasks
        elements.viewArchivedBtn.addEventListener('click', () => {
            openArchivedModal(elements, closeMenu);
        });

        // Checklist Modal
        elements.editChecklistBtn.addEventListener('click', () => {
            openChecklistModal(elements, closeMenu);
        });
        elements.addChecklistItemBtn.addEventListener('click', () => {
            addChecklistItem(elements);
        });
        elements.checklistCancelBtn.addEventListener('click', () => {
            elements.checklistModal.close();
        });
        elements.checklistSaveBtn.addEventListener('click', () => {
            saveChecklist(elements);
        });

        // Confirm Delete Modal
        elements.confirmCancel.addEventListener('click', () => {
            elements.confirmModal.close();
        });
        elements.confirmDelete.addEventListener('click', () => {
            confirmDeleteTask(elements, renderAllColumns, removeTask);
        });

        // Listen for edit requests from task-card components
        elements.kanban.addEventListener('request-edit', (e) => {
            openEditModal(
                e.detail.taskId,
                elements,
                () => openDeleteConfirmation(elements),
                handleTaskFormSubmit
            );
        });

        elements.kanban.addEventListener('task-dropped', (e) => {
            const { taskId, newStatus, newPosition } = e.detail;
            moveTask(taskId, newStatus, newPosition);
        });

        // Close menu on ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeMenu();
            }
        });
    }

    // ==========================================
    // Initialize
    // ==========================================

    /**
     * Initializes the application.
     */
    async function init() {
        // Initialize header date
        initHeaderDate();

        // Initialize UI
        renderCategoryFilters(elements.categoryFilters, (categoryId) => {
            toggleCategoryFilter(categoryId, elements.categoryFilters, applyAllFilters);
        });
        initEventListeners();

        // Fetch data
        await fetchTasks();
    }

    // Start the application
    document.addEventListener('DOMContentLoaded', init);
})();
