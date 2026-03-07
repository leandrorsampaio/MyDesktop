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

import { DEFAULT_CATEGORY_ID, DEFAULT_DEADLINE_URGENT_HOURS, DEFAULT_DEADLINE_WARNING_HOURS, SNOOZE_CHECK_INTERVAL_MS } from './js/constants.js';
import { parsePath } from './js/router.js';
import { formatRelativeTime, getDeadlineLevel, toDatetimeLocalValue } from './js/utils.js';
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
    openCloneTaskModal,
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
    setQuickDateTime,
    openAiConfigModal
} from './js/modals.js';

(function() {
    'use strict';

    // ==========================================
    // DOM Elements
    // ==========================================
    const elements = {
        // Navigation Sidebar
        sidebarBtn: document.querySelector('.js-sidebarBtn'),
        navSidebar: document.querySelector('.js-navSidebar'),

        // Page view (placeholder for non-board pages)
        pageView: document.querySelector('.js-pageView'),

        // Profile Selector component
        profileSelector: document.querySelector('.js-profileSelector'),

        // Board-only elements — null until initBoardToolbar() populates them
        categoryFilters:   null,
        priorityFilterBtn: null,
        epicFilter:        null,
        snoozeToggleBtn:   null,
        crisisModeBtn:     null,
        privacyToggleBtn:  null,

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

        // Reports Modal (opened via sidebar config-action in future pages)
        reportsModal: document.querySelector('.js-reportsModal'),
        reportsContainer: document.querySelector('.js-reportsContainer'),

        // Archived Tasks Modal (opened via sidebar config-action in future pages)
        archivedModal: document.querySelector('.js-archivedModal'),
        archivedContainer: document.querySelector('.js-archivedContainer'),

        // Confirm Modal
        confirmModal: document.querySelector('.js-confirmModal'),
        confirmCancel: document.querySelector('.js-confirmCancel'),
        confirmDelete: document.querySelector('.js-confirmDelete'),

        // Privacy (appContainer always in DOM)
        appContainer: document.querySelector('.js-appContainer'),

        // Task Epic dropdown
        taskEpic: document.querySelector('.js-taskEpic'),

        // Category pills in task modal
        categoryPills: document.querySelector('.js-categoryPills'),

        // Epic Delete Confirmation
        epicConfirmModal: document.querySelector('.js-epicConfirmModal'),
        epicConfirmMessage: document.querySelector('.js-epicConfirmMessage'),
        epicConfirmCancel: document.querySelector('.js-epicConfirmCancel'),
        epicConfirmDelete: document.querySelector('.js-epicConfirmDelete'),

        // Category Management (triggered via sidebar config menu)
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

        // Epic Management (triggered via sidebar config menu)
        epicsModal: document.querySelector('.js-epicsModal'),
        epicNameInput: document.querySelector('.js-epicNameInput'),
        epicColorSelect: document.querySelector('.js-epicColorSelect'),
        epicAddBtn: document.querySelector('.js-epicAddBtn'),
        epicAliasPreview: document.querySelector('.js-epicAliasPreview'),
        epicColorError: document.querySelector('.js-epicColorError'),
        epicsList: document.querySelector('.js-epicsList'),

        // Profile Management (triggered via sidebar config menu)
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

        // Generate Report (triggered via sidebar config menu)
        generateReportConfirmModal: document.querySelector('.js-generateReportConfirmModal'),
        generateReportCancel: document.querySelector('.js-generateReportCancel'),
        generateReportConfirm: document.querySelector('.js-generateReportConfirm'),

        // AI Configuration (triggered via sidebar config menu)
        aiConfigModal:      document.querySelector('.js-aiConfigModal'),
        aiConfigCancel:     document.querySelector('.js-aiConfigCancel'),
        aiConfigSave:       document.querySelector('.js-aiConfigSave'),
        aiProviderSelect:   document.querySelector('.js-aiProviderSelect'),
        aiModelInput:       document.querySelector('.js-aiModelInput'),
        aiCustomUrl:        document.querySelector('.js-aiCustomUrl'),
        aiCustomUrlGroup:   document.querySelector('.js-aiCustomUrlGroup'),
        aiKeyInput:         document.querySelector('.js-aiKeyInput'),
        aiKeyHint:          document.querySelector('.js-aiKeyHint'),
        aiConfigError:      document.querySelector('.js-aiConfigError'),

        // General Configuration (triggered via sidebar config menu)
        generalConfigModal: document.querySelector('.js-generalConfigModal'),
        showDailyChecklistToggle: document.querySelector('.js-showDailyChecklist'),
        showNotesToggle: document.querySelector('.js-showNotes'),
        generalConfigCancel: document.querySelector('.js-generalConfigCancel'),
        generalConfigSave: document.querySelector('.js-generalConfigSave'),
        dailyChecklist: document.querySelector('daily-checklist'),
        notesWidget: document.querySelector('notes-widget'),

        // Board Configuration (triggered via sidebar config menu)
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

        // Checklist Modal (triggered via sidebar config menu)
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

        // General config - deadline thresholds
        deadlineUrgentHours:  document.querySelector('.js-deadlineUrgentHours'),
        deadlineWarningHours: document.querySelector('.js-deadlineWarningHours')
    };

    // ==========================================
    // Menu / Sidebar Utilities
    // ==========================================

    /**
     * No-op kept so all existing callers (modals, crisis-mode) require no changes.
     * The sidebar closes itself before dispatching config-action events.
     */
    const closeMenu = () => {};

    /**
     * Renders a "coming soon" placeholder into the pageView container.
     * @param {string} page - One of the SUB_PAGES values
     */
    function renderPlaceholderPage(page) {
        const titles = {
            dashboard: 'Dashboard',
            backlog: 'Backlog',
            archive: 'Archive',
            reports: 'Reports',
            ai: 'AI Assistant',
        };
        const descriptions = {
            dashboard: 'Epic progress overview and overall task health.',
            backlog: 'Future tasks not yet active on the board.',
            archive: 'All completed and archived tasks.',
            reports: 'Weekly snapshots and full work history.',
            ai: 'Convert meeting notes and raw text into structured tasks.',
        };
        elements.pageView.innerHTML = `
            <div class="placeholderPage">
                <p class="placeholderPage__badge">Coming soon</p>
                <h2 class="placeholderPage__title">${titles[page] || page}</h2>
                <p class="placeholderPage__description">${descriptions[page] || ''}</p>
            </div>
        `;
    }

    /**
     * Handles a config-action event dispatched by the nav sidebar.
     * Each action maps to an existing modal or operation.
     * @param {string} action
     */
    function handleConfigAction(action) {
        switch (action) {
            case 'board-config':
                openBoardConfigModal(elements, closeMenu, async () => {
                    initKanban(columns);
                    await fetchTasks();
                });
                break;
            case 'manage-epics':
                openEpicsModal(elements, closeMenu, () => {
                    renderAllColumns();
                });
                break;
            case 'manage-categories':
                openCategoriesModal(elements, closeMenu, () => {
                    if (elements.categoryFilters) {
                        renderCategoryFilters(elements.categoryFilters, (categoryId) => {
                            toggleCategoryFilter(categoryId, elements.categoryFilters, applyAllFilters);
                        });
                    }
                    renderAllColumns();
                });
                break;
            case 'manage-profiles':
                openProfilesModal(elements, closeMenu, async () => {
                    const fetchedProfiles = await fetchProfilesApi();
                    setProfiles(fetchedProfiles);
                    const current = fetchedProfiles.find(p => p.id === activeProfile?.id);
                    if (current) {
                        setActiveProfile(current);
                        setApiBase(current.alias);
                        elements.profileSelector.setProfiles(fetchedProfiles);
                        elements.profileSelector.setActiveProfile(current);
                        if (current.alias !== parsePath().alias) {
                            window.location.href = '/' + current.alias;
                            return;
                        }
                    }
                });
                break;
            case 'edit-checklist':
                openChecklistModal(elements, closeMenu);
                break;
            case 'general-config':
                openGeneralConfigModal();
                break;
            case 'generate-report':
                handleGenerateReport();
                break;
            case 'ai-config':
                openAiConfigModal(elements);
                break;
        }
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
        cols.filter(col => !col.isBacklog).forEach((col, idx) => {
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
     * Guards epic filter and snooze button — null when called from a non-board page.
     */
    function renderAllColumns() {
        // Build epic lookup once per render cycle for O(1) access in createTaskCard
        epicLookup = new Map(epics.map(e => [e.id, e]));
        // Build category lookup once per render cycle
        categoryLookup = new Map(categories.map(c => [c.id, c]));
        columns.filter(col => !col.isBacklog).forEach(col => renderColumn(col.id));
        if (elements.epicFilter) renderEpicFilter(elements.epicFilter);
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
     * Creates a task-card custom element with event handlers.
     * @param {Object} task - The task data object
     * @returns {HTMLElement} The configured task-card custom element
     */
    function createTaskCard(task) {
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
     * No-op on non-board pages where the toolbar is not rendered.
     */
    function updateSnoozeButton() {
        if (!elements.snoozeToggleBtn) return;
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
    // Board Toolbar
    // ==========================================

    /**
     * Injects the board toolbar HTML into the mount point and re-queries
     * board-only elements. Called only when page === 'board'.
     */
    function initBoardToolbar() {
        const mount = document.querySelector('.js-toolbarMount');
        mount.innerHTML = `
            <div class="toolbar js-toolbar">
                <div class="toolbar__filters js-categoryFilters"></div>
                <custom-picker type="list" placeholder="Epics" size="compact" class="toolbar__epicFilter js-epicFilter"></custom-picker>
                <button class="toolbar__priorityBtn js-priorityFilterBtn" type="button">★ Priority</button>
                <button class="toolbar__snoozeBtn js-snoozeToggleBtn" style="display:none;" type="button"></button>
                <div class="toolbar__divider"></div>
                <button class="toolbar__crisisBtn js-crisisModeBtn" type="button">🚨 Crisis</button>
                <button class="toolbar__privacyBtn js-privacyToggleBtn" type="button">Hide</button>
            </div>
        `;
        elements.categoryFilters   = mount.querySelector('.js-categoryFilters');
        elements.priorityFilterBtn = mount.querySelector('.js-priorityFilterBtn');
        elements.epicFilter        = mount.querySelector('.js-epicFilter');
        elements.snoozeToggleBtn   = mount.querySelector('.js-snoozeToggleBtn');
        elements.crisisModeBtn     = mount.querySelector('.js-crisisModeBtn');
        elements.privacyToggleBtn  = mount.querySelector('.js-privacyToggleBtn');
    }

    // ==========================================
    // Event Listeners
    // ==========================================

    /**
     * Initializes event listeners that are active on all pages (modals, sidebar, profile, etc.).
     */
    function initEventListeners() {
        // Navigation Sidebar
        elements.sidebarBtn.addEventListener('click', () => {
            elements.navSidebar.toggle();
        });
        elements.navSidebar.addEventListener('config-action', (e) => {
            handleConfigAction(e.detail.action);
        });

        // Profile Selector component events
        elements.profileSelector.addEventListener('profile-select', (e) => {
            window.location.href = '/' + e.detail.alias;
        });
        elements.profileSelector.addEventListener('profile-open-new-tab', (e) => {
            window.open('/' + e.detail.alias, '_blank');
        });

        // Profile Confirm Delete Modal
        elements.profileConfirmCancel.addEventListener('click', () => {
            elements.profileConfirmModal.close();
        });
        elements.profileConfirmDelete.addEventListener('click', () => {
            confirmDeleteProfile(elements);
        });

        // Category Confirm Delete Modal
        elements.categoryConfirmCancel.addEventListener('click', () => {
            elements.categoryConfirmModal.close();
        });
        elements.categoryConfirmDelete.addEventListener('click', () => {
            confirmDeleteCategory(elements);
        });

        // Generate Report (triggered via sidebar config menu)
        elements.generateReportCancel.addEventListener('click', () => {
            elements.generateReportConfirmModal.close();
        });
        elements.generateReportConfirm.addEventListener('click', executeGenerateReport);

        // General Configuration (triggered via sidebar config menu)
        elements.generalConfigCancel.addEventListener('click', () => {
            elements.generalConfigModal.close();
        });
        elements.generalConfigSave.addEventListener('click', saveGeneralConfig);

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

        // Column Delete Confirmation
        elements.columnConfirmCancel.addEventListener('click', () => {
            elements.columnConfirmModal.close();
        });
        elements.columnConfirmDelete.addEventListener('click', () => {
            confirmDeleteColumn(elements);
        });

        // Checklist Modal (triggered via sidebar config menu)
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
    }

    /**
     * Initializes board-specific event listeners.
     * Called only on the board page, after initBoardToolbar() has injected the toolbar.
     */
    function initBoardEventListeners() {
        // Wrapper that renders a column and applies filters
        const renderColumnWithFilters = (status) => {
            renderColumn(status);
            applyAllFilters();
            updateSnoozeButton();
        };

        // Create the task form submit handler
        const handleTaskFormSubmit = createTaskFormSubmitHandler(
            elements,
            renderColumnWithFilters,
            renderAllColumns,
            addTask,
            updateTaskInState
        );

        // Priority Filter
        elements.priorityFilterBtn.addEventListener('click', () => {
            togglePriorityFilter(elements.priorityFilterBtn, applyAllFilters);
        });

        // Epic Filter
        elements.epicFilter.addEventListener('change', () => {
            handleEpicFilterChange(elements.epicFilter, applyAllFilters);
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

        // Snooze toggle button
        elements.snoozeToggleBtn.addEventListener('click', () => {
            const isActive = elements.kanban.classList.toggle('--showSnoozed');
            elements.snoozeToggleBtn.classList.toggle('--active', isActive);
            applyAllFilters();
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

        // Listen for edit requests from task-card components
        elements.kanban.addEventListener('request-edit', (e) => {
            const taskId = e.detail.taskId;
            openEditModal(
                taskId,
                elements,
                () => openDeleteConfirmation(elements),
                handleTaskFormSubmit,
                () => openCloneTaskModal(taskId, elements, () => openDeleteConfirmation(elements), handleTaskFormSubmit)
            );
        });

        elements.kanban.addEventListener('task-dropped', (e) => {
            const { taskId, newStatus, newPosition } = e.detail;
            moveTask(taskId, newStatus, newPosition);
        });
    }

    // ==========================================
    // Initialize
    // ==========================================

    /**
     * Initializes the application.
     */
    async function init() {
        initEventListeners();

        // Fetch profiles and determine active profile from URL
        try {
            const fetchedProfiles = await fetchProfilesApi();
            setProfiles(fetchedProfiles);

            const { alias, page } = parsePath();
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
            elements.profileSelector.setProfiles(fetchedProfiles);
            elements.profileSelector.setActiveProfile(matchedProfile);
            loadGeneralConfig();

            // Sidebar: set alias + active page for link hrefs and active state
            elements.navSidebar.setAttribute('alias', matchedProfile.alias);
            elements.navSidebar.setAttribute('page', page);

            // Routing: show board or placeholder page
            if (page !== 'board') {
                elements.appContainer.style.display = 'none';
                elements.pageView.style.display = '';
                if (page === 'archive') {
                    const { initArchivePage } = await import('./js/archive-page.js');
                    initArchivePage(elements.pageView).catch(err => {
                        console.error('Archive page error:', err);
                        if (elements.toaster) elements.toaster.error('Failed to load archive page');
                    });
                } else if (page === 'backlog') {
                    const { initBacklogPage } = await import('./js/backlog-page.js');
                    initBacklogPage(elements.pageView, { elements }).catch(err => {
                        console.error('Backlog page error:', err);
                        if (elements.toaster) elements.toaster.error('Failed to load backlog page');
                    });
                } else if (page === 'dashboard') {
                    const { initDashboardPage } = await import('./js/dashboard-page.js');
                    initDashboardPage(elements.pageView).catch(err => {
                        console.error('Dashboard page error:', err);
                        if (elements.toaster) elements.toaster.error('Failed to load dashboard page');
                    });
                } else if (page === 'ai') {
                    const { initAiPage } = await import('./js/ai-page.js');
                    initAiPage(elements.pageView, { elements }).catch(err => {
                        console.error('AI page error:', err);
                        if (elements.toaster) elements.toaster.error('Failed to load AI page');
                    });
                } else {
                    renderPlaceholderPage(page);
                }
                return; // Skip board-only initialization
            }
        } catch (error) {
            console.error('Error fetching profiles:', error);
        }

        // Board-only: inject toolbar and wire board event listeners
        initBoardToolbar();
        initBoardEventListeners();

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

        // Render category filters now that dynamic categories are loaded
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
