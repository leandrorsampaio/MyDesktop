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

import { MAX_GRADIENT_STEPS, LIGHT_TEXT_THRESHOLD, DEFAULT_CATEGORY_ID, DEFAULT_DEADLINE_URGENT_HOURS, DEFAULT_DEADLINE_WARNING_HOURS, SNOOZE_CHECK_INTERVAL_MS } from './js/constants.js';
import { getWeekNumber, escapeHtml, formatRelativeTime, getDeadlineLevel, toDatetimeLocalValue } from './js/utils.js';
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
    findTask,
    epics,
    setEpics,
    categories,
    setCategories,
    profiles,
    setProfiles,
    activeProfile,
    setActiveProfile,
    columns,
    setColumns
} from './js/state.js';
import { fetchTasksApi, moveTaskApi, generateReportApi, archiveTasksApi, fetchEpicsApi, fetchCategoriesApi, fetchProfilesApi, setApiBase, fetchColumnsApi } from './js/api.js';
import { openBoardConfigModal, confirmDeleteColumn } from './js/board-config.js';
import {
    renderCategoryFilters,
    toggleCategoryFilter,
    togglePriorityFilter,
    applyAllFilters,
    renderEpicFilter,
    handleEpicFilterChange
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
    saveChecklist,
    openEpicsModal,
    confirmDeleteEpic,
    openCategoriesModal,
    confirmDeleteCategory,
    openProfilesModal,
    confirmDeleteProfile,
    setQuickDateTime
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

        // Task Epic dropdown
        taskEpic: document.querySelector('.js-taskEpic'),

        // Category pills in task modal
        categoryPills: document.querySelector('.js-categoryPills'),

        // Category Filters
        categoryFilters: document.querySelector('.js-categoryFilters'),
        priorityFilterBtn: document.querySelector('.js-priorityFilterBtn'),
        epicFilter: document.querySelector('.js-epicFilter'),

        // Epic Delete Confirmation
        epicConfirmModal: document.querySelector('.js-epicConfirmModal'),
        epicConfirmMessage: document.querySelector('.js-epicConfirmMessage'),
        epicConfirmCancel: document.querySelector('.js-epicConfirmCancel'),
        epicConfirmDelete: document.querySelector('.js-epicConfirmDelete'),

        // Category Management
        manageCategoriesBtn: document.querySelector('.js-manageCategoriesBtn'),
        categoriesModal: document.querySelector('.js-categoriesModal'),
        categoryNameInput: document.querySelector('.js-categoryNameInput'),
        categoryIconSelect: document.querySelector('.js-categoryIconSelect'),
        categoryAddBtn: document.querySelector('.js-categoryAddBtn'),
        categoryError: document.querySelector('.js-categoryError'),
        categoriesList: document.querySelector('.js-categoriesList'),

        // Category Delete Confirmation
        categoryConfirmModal: document.querySelector('.js-categoryConfirmModal'),
        categoryConfirmMessage: document.querySelector('.js-categoryConfirmMessage'),
        categoryConfirmCancel: document.querySelector('.js-categoryConfirmCancel'),
        categoryConfirmDelete: document.querySelector('.js-categoryConfirmDelete'),

        // Epic Management
        manageEpicsBtn: document.querySelector('.js-manageEpicsBtn'),
        epicsModal: document.querySelector('.js-epicsModal'),
        epicNameInput: document.querySelector('.js-epicNameInput'),
        epicColorSelect: document.querySelector('.js-epicColorSelect'),
        epicAddBtn: document.querySelector('.js-epicAddBtn'),
        epicAliasPreview: document.querySelector('.js-epicAliasPreview'),
        epicColorError: document.querySelector('.js-epicColorError'),
        epicsList: document.querySelector('.js-epicsList'),

        // Profile Selector
        profileSelector: document.querySelector('.js-profileSelector'),
        profileBtn: document.querySelector('.js-profileBtn'),
        profileName: document.querySelector('.js-profileName'),
        profileDropdown: document.querySelector('.js-profileDropdown'),

        // Profile Management
        manageProfilesBtn: document.querySelector('.js-manageProfilesBtn'),
        profilesModal: document.querySelector('.js-profilesModal'),
        profileNameInput: document.querySelector('.js-profileNameInput'),
        profileLettersInput: document.querySelector('.js-profileLettersInput'),
        profileColorSelect: document.querySelector('.js-profileColorSelect'),
        profileAddBtn: document.querySelector('.js-profileAddBtn'),
        profileAliasPreview: document.querySelector('.js-profileAliasPreview'),
        profileError: document.querySelector('.js-profileError'),
        profilesList: document.querySelector('.js-profilesList'),

        // Profile Delete Confirmation
        profileConfirmModal: document.querySelector('.js-profileConfirmModal'),
        profileConfirmMessage: document.querySelector('.js-profileConfirmMessage'),
        profileConfirmCancel: document.querySelector('.js-profileConfirmCancel'),
        profileConfirmDelete: document.querySelector('.js-profileConfirmDelete'),

        // Crisis Mode
        crisisModeBtn: document.querySelector('.js-crisisModeBtn'),
        headerToolbar: document.querySelector('.toolbar'),

        // Generate Report (modal-based, in hamburger menu)
        generateReportBtn: document.querySelector('.js-generateReportBtn'),
        generateReportConfirmModal: document.querySelector('.js-generateReportConfirmModal'),
        generateReportCancel: document.querySelector('.js-generateReportCancel'),
        generateReportConfirm: document.querySelector('.js-generateReportConfirm'),

        // General Configuration
        generalConfigBtn: document.querySelector('.js-generalConfigBtn'),
        generalConfigModal: document.querySelector('.js-generalConfigModal'),
        showDailyChecklistToggle: document.querySelector('.js-showDailyChecklist'),
        showNotesToggle: document.querySelector('.js-showNotes'),
        generalConfigCancel: document.querySelector('.js-generalConfigCancel'),
        generalConfigSave: document.querySelector('.js-generalConfigSave'),
        dailyChecklist: document.querySelector('daily-checklist'),
        notesWidget: document.querySelector('notes-widget'),

        // Board Configuration
        boardConfigBtn: document.querySelector('.js-boardConfigBtn'),
        boardConfigModal: document.querySelector('.js-boardConfigModal'),
        columnsList: document.querySelector('.js-columnsList'),
        columnNameInput: document.querySelector('.js-columnNameInput'),
        columnAddBtn: document.querySelector('.js-columnAddBtn'),
        columnError: document.querySelector('.js-columnError'),

        // Column Delete Confirmation
        columnConfirmModal: document.querySelector('.js-columnConfirmModal'),
        columnConfirmMessage: document.querySelector('.js-columnConfirmMessage'),
        columnConfirmCancel: document.querySelector('.js-columnConfirmCancel'),
        columnConfirmDelete: document.querySelector('.js-columnConfirmDelete'),

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
        toaster: document.querySelector('.js-toaster'),

        // Task form - schedule
        taskDeadline:         document.querySelector('.js-taskDeadline'),
        taskSnooze:           document.querySelector('.js-taskSnooze'),
        deadlineHint:         document.querySelector('.js-deadlineHint'),
        snoozeHint:           document.querySelector('.js-snoozeHint'),

        // Toolbar - snooze toggle
        snoozeToggleBtn:      document.querySelector('.js-snoozeToggleBtn'),

        // General config - deadline thresholds
        deadlineUrgentHours:  document.querySelector('.js-deadlineUrgentHours'),
        deadlineWarningHours: document.querySelector('.js-deadlineWarningHours')
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
    // Profile Selector
    // ==========================================

    /**
     * Gets the profile alias from the current URL pathname.
     * @returns {string} The alias portion of the path (e.g., 'work' from '/work')
     */
    function getProfileAliasFromUrl() {
        const path = window.location.pathname;
        // Remove leading slash and get first segment
        const segments = path.split('/').filter(Boolean);
        return segments[0] || '';
    }

    /**
     * Renders the profile selector button and name.
     */
    function renderProfileSelector() {
        if (!activeProfile) return;
        elements.profileBtn.textContent = activeProfile.letters;
        elements.profileBtn.style.backgroundColor = activeProfile.color;
        elements.profileName.textContent = activeProfile.name;
    }

    /**
     * Renders the profile dropdown with all available profiles.
     */
    function renderProfileDropdown() {
        elements.profileDropdown.innerHTML = profiles.map(p => {
            const isActive = p.id === activeProfile?.id;
            const newTabBtn = !isActive
                ? `<button class="profileSelector__dropdownNewTab" data-alias="${escapeHtml(p.alias)}" title="Open in new tab">&#8599;</button>`
                : '';
            return `
                <button class="profileSelector__dropdownItem ${isActive ? '--active' : ''}"
                        data-alias="${escapeHtml(p.alias)}">
                    <span class="profileSelector__dropdownIcon" style="background-color: ${p.color};">${escapeHtml(p.letters)}</span>
                    <span class="profileSelector__dropdownName">${escapeHtml(p.name)}</span>
                    ${newTabBtn}
                </button>
            `;
        }).join('');

        // New tab buttons — open profile in new tab
        elements.profileDropdown.querySelectorAll('.profileSelector__dropdownNewTab').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.open('/' + btn.dataset.alias, '_blank');
                closeProfileDropdown();
            });
        });

        // Add click handlers via event delegation
        elements.profileDropdown.querySelectorAll('.profileSelector__dropdownItem').forEach(item => {
            item.addEventListener('click', () => {
                const alias = item.dataset.alias;
                if (alias !== activeProfile?.alias) {
                    window.location.href = '/' + alias;
                } else {
                    closeProfileDropdown();
                }
            });
        });
    }

    /**
     * Toggles the profile dropdown open/closed.
     */
    function toggleProfileDropdown() {
        elements.profileDropdown.classList.toggle('--active');
    }

    /**
     * Closes the profile dropdown.
     */
    function closeProfileDropdown() {
        elements.profileDropdown.classList.remove('--active');
    }

    // ==========================================
    // Color Management
    // ==========================================

    /**
     * Calculates the color information for a task card based on its position.
     * All columns share the same --card-gradient-* palette, so color works
     * for any column regardless of its ID (including user-created ones).
     * @param {number} position - Zero-based position of the task in its column
     * @param {number} totalInColumn - Total number of tasks in the column
     * @returns {{gradient: string, useLightText: boolean}} Color info object
     */
    function getTaskColorInfo(position, totalInColumn) {
        let gradientIndex;

        if (totalInColumn <= MAX_GRADIENT_STEPS) {
            gradientIndex = position;
        } else {
            // Distribute evenly across gradient steps
            gradientIndex = Math.floor((position / totalInColumn) * MAX_GRADIENT_STEPS);
        }

        gradientIndex = Math.min(gradientIndex, MAX_GRADIENT_STEPS - 1);

        return {
            gradient: `var(--card-gradient-${gradientIndex})`,
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

    /** @type {Map<string, Object>} Pre-built epic lookup for O(1) access in createTaskCard */
    let epicLookup = new Map();

    /** @type {Map<number, Object>} Pre-built category lookup for O(1) access in createTaskCard */
    let categoryLookup = new Map();

    /**
     * Creates all kanban column elements dynamically from the columns config.
     * The first column receives the "Add Task" button.
     * Columns with hasArchive:true receive an "Archive" button.
     * @param {Array<Object>} cols - The columns array (sorted by order)
     */
    function initKanban(cols) {
        elements.kanban.innerHTML = '';
        cols.forEach((col, idx) => {
            const columnEl = document.createElement('kanban-column');
            columnEl.dataset.status = col.id;

            const title = document.createElement('span');
            title.slot = 'title';
            title.textContent = col.name;
            columnEl.appendChild(title);

            if (idx === 0) {
                const addBtn = document.createElement('button');
                addBtn.slot = 'actions';
                addBtn.className = 'column__addBtn js-addTaskBtn';
                addBtn.textContent = '+ Add Task';
                columnEl.appendChild(addBtn);
            }

            if (col.hasArchive) {
                const archiveBtn = document.createElement('button');
                archiveBtn.slot = 'actions';
                archiveBtn.className = 'column__archiveBtn js-archiveBtn';
                archiveBtn.dataset.columnId = col.id;
                archiveBtn.textContent = 'Archive';
                columnEl.appendChild(archiveBtn);
            }

            elements.kanban.appendChild(columnEl);
        });
    }

    /**
     * Re-renders all kanban columns and applies active filters.
     */
    function renderAllColumns() {
        // Build epic lookup once per render cycle for O(1) access in createTaskCard
        epicLookup = new Map(epics.map(e => [e.id, e]));
        // Build category lookup once per render cycle
        categoryLookup = new Map(categories.map(c => [c.id, c]));
        columns.forEach(col => renderColumn(col.id));
        renderEpicFilter(elements.epicFilter);
        applyAllFilters();
        updateSnoozeButton();
    }

    /**
     * Renders a single kanban column with its tasks.
     * Note: Does not apply filters - caller should call applyAllFilters() if needed.
     * @param {string} columnId - The column ID to render
     */
    function renderColumn(columnId) {
        const columnEl = document.querySelector(`kanban-column[data-status="${columnId}"]`);
        const columnTasks = tasks
            .filter(t => t.status === columnId)
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
        card.dataset.category = String(task.category || DEFAULT_CATEGORY_ID);
        card.dataset.priority = task.priority ? 'true' : 'false';
        card.dataset.title = task.title;
        card.dataset.description = task.description || '';
        card.dataset.epicId = task.epicId || '';

        // Category data for the card (O(1) lookup via pre-built Map)
        const cat = categoryLookup.get(task.category || DEFAULT_CATEGORY_ID);
        if (cat) {
            card.dataset.categoryName = cat.name;
            card.dataset.categoryIcon = cat.icon;
        }

        // Epic data for the card (O(1) lookup via pre-built Map)
        const epic = task.epicId ? epicLookup.get(task.epicId) || null : null;
        if (epic) {
            card.dataset.epicName = epic.name;
            card.dataset.epicColor = epic.color;
            card.dataset.epicAlias = epic.alias;
            card.classList.add(`epic-${epic.alias}`);
        } else {
            card.classList.add('epic-none');
        }

        // Deadline chip data
        if (task.deadline) {
            card.dataset.deadline      = task.deadline;
            const thresholds           = getDeadlineThresholds(activeProfile.alias);
            card.dataset.deadlineLevel = getDeadlineLevel(task.deadline, thresholds);
            card.dataset.deadlineText  = formatRelativeTime(task.deadline);
        }

        // Snooze state — apply class for CSS-driven visibility
        if (task.snoozeUntil && new Date(task.snoozeUntil) > new Date()) {
            card.classList.add('--snoozed');
        }

        card.draggable = true;

        // Apply gradient background and text color
        const colorInfo = getTaskColorInfo(position, totalInColumn);
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
            // Clean up drop indicators in all columns
            document.querySelectorAll('kanban-column').forEach(col => {
                col.removeDropIndicator();
            });
        });

        return card;
    }

    // ==========================================
    // General Configuration
    // ==========================================

    /**
     * Reads the general config from profile-scoped localStorage and applies
     * show/hide state to the sidebar sections and snooze display mode.
     */
    function loadGeneralConfig() {
        if (!activeProfile) return;
        const alias = activeProfile.alias;
        const showChecklist = localStorage.getItem(`${alias}:showDailyChecklist`);
        const showNotes     = localStorage.getItem(`${alias}:showNotes`);
        // Default is true (visible) when key is not set
        elements.dailyChecklist.classList.toggle('--hidden', showChecklist === 'false');
        elements.notesWidget.classList.toggle('--hidden',    showNotes     === 'false');

        // Snooze display mode
        const snoozeMode = localStorage.getItem(`${alias}:snoozeVisibility`) || 'hidden';
        document.body.classList.toggle('--snoozeTransparent', snoozeMode === 'transparent');
    }

    /**
     * Returns the deadline urgency thresholds [urgentHours, warningHours]
     * from profile-scoped localStorage, falling back to defaults.
     * @param {string} alias - Profile alias
     * @returns {number[]}
     */
    function getDeadlineThresholds(alias) {
        const stored = localStorage.getItem(`${alias}:deadlineThresholds`);
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                if (Array.isArray(parsed) && parsed.length === 2) return parsed;
            } catch {}
        }
        return [DEFAULT_DEADLINE_URGENT_HOURS, DEFAULT_DEADLINE_WARNING_HOURS];
    }

    /**
     * Shows/hides the snooze toggle button based on whether any tasks are currently snoozed.
     * Also resets the toggle state if no snoozed tasks remain.
     */
    function updateSnoozeButton() {
        const now = new Date();
        const snoozedTasks = tasks.filter(t => t.snoozeUntil && new Date(t.snoozeUntil) > now);
        if (snoozedTasks.length > 0) {
            elements.snoozeToggleBtn.style.display = '';
            elements.snoozeToggleBtn.textContent   = `💤 Snoozed (${snoozedTasks.length})`;
        } else {
            elements.snoozeToggleBtn.style.display = 'none';
            elements.kanban.classList.remove('--showSnoozed');
            elements.snoozeToggleBtn.classList.remove('--active');
        }
    }

    /**
     * Updates the relative-time hint below a datetime input.
     * @param {HTMLElement} hintEl - The hint container element
     * @param {string} value - The datetime-local input value
     */
    function updateDateHint(hintEl, value) {
        hintEl.textContent = value ? formatRelativeTime(new Date(value).toISOString()) : '';
    }

    /**
     * Opens the General Configuration modal, pre-populated with current settings.
     */
    function openGeneralConfigModal() {
        closeMenu();
        const alias = activeProfile.alias;

        // Existing toggles
        elements.showDailyChecklistToggle.checked = localStorage.getItem(`${alias}:showDailyChecklist`) !== 'false';
        elements.showNotesToggle.checked          = localStorage.getItem(`${alias}:showNotes`)          !== 'false';

        // Snooze visibility
        const snoozeMode  = localStorage.getItem(`${alias}:snoozeVisibility`) || 'hidden';
        const snoozeRadio = document.querySelector(`input[name="snoozeVisibility"][value="${snoozeMode}"]`);
        if (snoozeRadio) snoozeRadio.checked = true;

        // Deadline thresholds
        const thresholds = getDeadlineThresholds(alias);
        elements.deadlineUrgentHours.value  = thresholds[0];
        elements.deadlineWarningHours.value = thresholds[1];

        elements.generalConfigModal.open();
    }

    /**
     * Persists the general config to localStorage and applies visibility changes.
     */
    function saveGeneralConfig() {
        const alias = activeProfile.alias;

        localStorage.setItem(`${alias}:showDailyChecklist`, String(elements.showDailyChecklistToggle.checked));
        localStorage.setItem(`${alias}:showNotes`,          String(elements.showNotesToggle.checked));

        // Snooze visibility mode
        const snoozeMode = document.querySelector('input[name="snoozeVisibility"]:checked')?.value || 'hidden';
        localStorage.setItem(`${alias}:snoozeVisibility`, snoozeMode);

        // Deadline thresholds — validate before saving
        const urgentHours  = parseInt(elements.deadlineUrgentHours.value)  || DEFAULT_DEADLINE_URGENT_HOURS;
        const warningHours = parseInt(elements.deadlineWarningHours.value) || DEFAULT_DEADLINE_WARNING_HOURS;
        if (urgentHours >= warningHours) {
            elements.toaster.warning('Urgent threshold must be less than Warning threshold');
            return;
        }
        localStorage.setItem(`${alias}:deadlineThresholds`, JSON.stringify([urgentHours, warningHours]));

        loadGeneralConfig();
        renderAllColumns(); // Re-render to refresh deadline chips with new thresholds
        elements.generalConfigModal.close();
        elements.toaster.success('Configuration saved');
    }

    // ==========================================
    // Report & Archive Handlers
    // ==========================================

    /**
     * Opens the generate report confirmation modal.
     */
    function handleGenerateReport() {
        closeMenu();
        elements.generateReportConfirmModal.open();
    }

    /**
     * Executes report generation after modal confirmation.
     */
    async function executeGenerateReport() {
        elements.generateReportConfirmModal.close();
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
     * Handles the archive button click for a specific column.
     * @param {string} columnId - The column ID to archive tasks from
     */
    async function handleArchive(columnId) {
        try {
            const result = await archiveTasksApi(columnId);
            if (result.ok) {
                if (result.data.archivedCount === 0) {
                    elements.toaster.info('No tasks to archive in this column');
                    return;
                }
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

        // Profile Selector
        elements.profileBtn.addEventListener('click', () => {
            renderProfileDropdown();
            toggleProfileDropdown();
        });
        elements.profileName.addEventListener('click', () => {
            renderProfileDropdown();
            toggleProfileDropdown();
        });

        // Manage Profiles
        elements.manageProfilesBtn.addEventListener('click', () => {
            openProfilesModal(elements, closeMenu, async () => {
                // Re-fetch profiles after changes
                const fetchedProfiles = await fetchProfilesApi();
                setProfiles(fetchedProfiles);
                // Update active profile in case it was renamed
                const current = fetchedProfiles.find(p => p.id === activeProfile?.id);
                if (current) {
                    setActiveProfile(current);
                    setApiBase(current.alias);
                    renderProfileSelector();
                    // If alias changed, navigate to new URL
                    if (current.alias !== getProfileAliasFromUrl()) {
                        window.location.href = '/' + current.alias;
                        return;
                    }
                }
            });
        });

        // Profile Confirm Delete Modal
        elements.profileConfirmCancel.addEventListener('click', () => {
            elements.profileConfirmModal.close();
        });
        elements.profileConfirmDelete.addEventListener('click', () => {
            confirmDeleteProfile(elements);
        });

        // Hamburger Menu
        elements.menuBtn.addEventListener('click', toggleMenu);

        // Close menu and profile dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!elements.menuBtn.contains(e.target) && !elements.dropdownMenu.contains(e.target)) {
                closeMenu();
            }
            if (!elements.profileSelector.contains(e.target)) {
                closeProfileDropdown();
            }
        });

        // Priority Filter
        elements.priorityFilterBtn.addEventListener('click', () => {
            togglePriorityFilter(elements.priorityFilterBtn, applyAllFilters);
        });

        // Epic Filter
        elements.epicFilter.addEventListener('change', () => {
            handleEpicFilterChange(elements.epicFilter, applyAllFilters);
        });

        // Manage Categories
        elements.manageCategoriesBtn.addEventListener('click', () => {
            openCategoriesModal(elements, closeMenu, () => {
                renderCategoryFilters(elements.categoryFilters, (categoryId) => {
                    toggleCategoryFilter(categoryId, elements.categoryFilters, applyAllFilters);
                });
                renderAllColumns();
            });
        });

        // Category Confirm Delete Modal
        elements.categoryConfirmCancel.addEventListener('click', () => {
            elements.categoryConfirmModal.close();
        });
        elements.categoryConfirmDelete.addEventListener('click', () => {
            confirmDeleteCategory(elements);
        });

        // Manage Epics
        elements.manageEpicsBtn.addEventListener('click', () => {
            openEpicsModal(elements, closeMenu, () => {
                renderAllColumns();
            });
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

        // Add Task & Archive — event delegation on kanban container
        // Buttons are dynamically created inside <kanban-column> by initKanban()
        elements.kanban.addEventListener('click', (e) => {
            if (e.target.classList.contains('js-addTaskBtn')) {
                openAddTaskModal(
                    elements,
                    () => openDeleteConfirmation(elements),
                    handleTaskFormSubmit
                );
            }
            if (e.target.classList.contains('js-archiveBtn')) {
                handleArchive(e.target.dataset.columnId);
            }
        });

        // Generate Report (hamburger menu item + confirm modal)
        elements.generateReportBtn.addEventListener('click', handleGenerateReport);
        elements.generateReportCancel.addEventListener('click', () => {
            elements.generateReportConfirmModal.close();
        });
        elements.generateReportConfirm.addEventListener('click', executeGenerateReport);

        // General Configuration
        elements.generalConfigBtn.addEventListener('click', openGeneralConfigModal);
        elements.generalConfigCancel.addEventListener('click', () => {
            elements.generalConfigModal.close();
        });
        elements.generalConfigSave.addEventListener('click', saveGeneralConfig);

        // Snooze toggle button
        elements.snoozeToggleBtn.addEventListener('click', () => {
            const isActive = elements.kanban.classList.toggle('--showSnoozed');
            elements.snoozeToggleBtn.classList.toggle('--active', isActive);
        });

        // Task form: quick datetime buttons + clear buttons (event delegation)
        elements.taskForm.addEventListener('click', (e) => {
            if (e.target.classList.contains('js-quickDeadline')) {
                setQuickDateTime(elements.taskDeadline, e.target.dataset.offset);
                updateDateHint(elements.deadlineHint, elements.taskDeadline.value);
            } else if (e.target.classList.contains('js-quickSnooze')) {
                setQuickDateTime(elements.taskSnooze, e.target.dataset.offset);
                updateDateHint(elements.snoozeHint, elements.taskSnooze.value);
            } else if (e.target.classList.contains('js-clearDeadline')) {
                elements.taskDeadline.value       = '';
                elements.deadlineHint.textContent = '';
            } else if (e.target.classList.contains('js-clearSnooze')) {
                elements.taskSnooze.value       = '';
                elements.snoozeHint.textContent = '';
            }
        });

        // Task form: manual datetime input → update hints
        elements.taskDeadline.addEventListener('input', () => updateDateHint(elements.deadlineHint, elements.taskDeadline.value));
        elements.taskSnooze.addEventListener('input',   () => updateDateHint(elements.snoozeHint,   elements.taskSnooze.value));

        // Board Configuration
        elements.boardConfigBtn.addEventListener('click', () => {
            openBoardConfigModal(elements, closeMenu, async () => {
                initKanban(columns);
                await fetchTasks();
            });
        });

        // Column Delete Confirmation
        elements.columnConfirmCancel.addEventListener('click', () => {
            elements.columnConfirmModal.close();
        });
        elements.columnConfirmDelete.addEventListener('click', () => {
            confirmDeleteColumn(elements);
        });

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

        // Confirm Delete Modal (task)
        elements.confirmCancel.addEventListener('click', () => {
            elements.confirmModal.close();
        });
        elements.confirmDelete.addEventListener('click', () => {
            confirmDeleteTask(elements, renderAllColumns, removeTask);
        });

        // Confirm Delete Modal (epic)
        elements.epicConfirmCancel.addEventListener('click', () => {
            elements.epicConfirmModal.close();
        });
        elements.epicConfirmDelete.addEventListener('click', () => {
            confirmDeleteEpic(elements);
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

        // Close menu and profile dropdown on ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                closeMenu();
                closeProfileDropdown();
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

        // Fetch profiles and determine active profile from URL
        try {
            const fetchedProfiles = await fetchProfilesApi();
            setProfiles(fetchedProfiles);

            const alias = getProfileAliasFromUrl();
            const matchedProfile = fetchedProfiles.find(p => p.alias === alias);

            if (!matchedProfile) {
                // No matching profile — redirect to first profile
                if (fetchedProfiles.length > 0) {
                    window.location.href = '/' + fetchedProfiles[0].alias;
                }
                return;
            }

            setActiveProfile(matchedProfile);
            setApiBase(matchedProfile.alias);
            document.body.classList.add('profile-' + matchedProfile.alias);
            renderProfileSelector();
            loadGeneralConfig();
        } catch (error) {
            console.error('Error fetching profiles:', error);
        }

        // Fetch data (categories and epics first so cards can reference them)
        try {
            const fetchedCategories = await fetchCategoriesApi();
            setCategories(fetchedCategories);
        } catch (error) {
            console.error('Error fetching categories:', error);
        }
        try {
            const fetchedEpics = await fetchEpicsApi();
            setEpics(fetchedEpics);
        } catch (error) {
            console.error('Error fetching epics:', error);
        }

        // Re-render category filters now that dynamic categories are loaded
        renderCategoryFilters(elements.categoryFilters, (categoryId) => {
            toggleCategoryFilter(categoryId, elements.categoryFilters, applyAllFilters);
        });

        // Fetch columns and build kanban before rendering tasks
        try {
            const fetchedColumns = await fetchColumnsApi();
            setColumns(fetchedColumns);
            initKanban(columns);
        } catch (error) {
            console.error('Error fetching columns:', error);
        }

        await fetchTasks();

        // Snooze expiry scheduler — re-render when snoozed tasks wake up
        let _snoozedIds = new Set(
            tasks.filter(t => t.snoozeUntil && new Date(t.snoozeUntil) > new Date()).map(t => t.id)
        );

        setInterval(() => {
            const now = new Date();
            const currentSnoozedIds = new Set(
                tasks.filter(t => t.snoozeUntil && new Date(t.snoozeUntil) > now).map(t => t.id)
            );
            const anyWokeUp = [..._snoozedIds].some(id => !currentSnoozedIds.has(id));
            _snoozedIds = currentSnoozedIds;
            if (anyWokeUp) {
                renderAllColumns();
                elements.toaster.info('A snoozed task is back on the board');
            }
        }, SNOOZE_CHECK_INTERVAL_MS);
    }

    // Start the application
    document.addEventListener('DOMContentLoaded', init);
})();
