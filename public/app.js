/**
 * Task Tracker Application - Main Entry Point
 *
 * This is the main application file that wires together all modules:
 * - state.js: Shared application state
 * - api.js: HTTP API functions
 * - filters.js: Category and priority filtering
 * - modals.js: Modal dialog handling
 */

import { DEFAULT_CATEGORY_ID, DEFAULT_DEADLINE_URGENT_HOURS, DEFAULT_DEADLINE_WARNING_HOURS, SNOOZE_CHECK_INTERVAL_MS, MAX_ATTACHMENTS_PER_TASK, MAX_ATTACHMENT_SIZE } from './js/constants.js';
import { parsePath } from './js/router.js';
import { initShortcuts } from './js/shortcuts.js';
import { initAttachments } from './js/attachments.js';
import { buildPreviewPlan, countPreviewedChanges } from './js/board-preview.js';
import { buildSuggestions } from './js/assistant-suggestions.js';
import * as assistantChat from './js/assistant-chat.js';
import { formatRelativeTime, getDeadlineLevel, toDatetimeLocalValue, formatBytes } from './js/utils.js';
import {
    tasks,
    setTasks,
    addTask,
    updateTaskInState,
    activeCategoryFilters,
    priorityFilterActive,
    createTasksSnapshot,
    restoreTasksFromSnapshot,
    findTask,
    removeTask,
    editingTaskId,
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
import { fetchTasksApi, moveTaskApi, archiveTasksApi, fetchEpicsApi, fetchCategoriesApi, fetchProfilesApi, setApiBase, fetchColumnsApi, uploadAttachmentApi, captureTaskApi, classifyTaskApi, deleteTaskApi, fetchProposalsApi, applyProposalApi, applyAllProposalsApi, rejectProposalApi, rejectAllProposalsApi } from './js/api.js';
// Column-delete confirmation is fully handled inside config-page.js — no
// separate import needed since the v2.38.3 dead-modal cleanup.
import {
    renderCategoryFilters,
    handleCategoryFilterChange,
    togglePriorityFilter,
    applyAllFilters,
    renderEpicFilter,
    handleEpicFilterChange
} from './js/filters.js';
import {
    openAddTaskModal,
    openEditModal,
    openCloneTaskModal,
    openDeleteConfirmation,
    openConfirmDialog,
    createTaskFormSubmitHandler,
    setQuickDateTime,
    syncScheduleSummary
} from './js/modals.js';

(function() {
    'use strict';

    // ==========================================
    // DOM Elements
    // ==========================================
    const elements = {
        // Navigation Sidebar (permanent rail — no toggle button needed)
        navSidebar: document.querySelector('.js-navSidebar'),

        // Page view (placeholder for non-board pages)
        pageView: document.querySelector('.js-pageView'),

        // Quick capture bar (global — every page)
        quickCapture: document.querySelector('.js-quickCapture'),

        // Assistant dock (global — every page)
        assistantDock: document.querySelector('.js-assistantDock'),

        // Pending AI proposals / board preview toolbar
        proposalBar: document.querySelector('.js-proposalBar'),
        proposalBarText: document.querySelector('.js-proposalBarText'),
        previewToggleBtn: document.querySelector('.js-previewToggleBtn'),
        previewApplyAllBtn: document.querySelector('.js-previewApplyAllBtn'),
        previewDiscardBtn: document.querySelector('.js-previewDiscardBtn'),

        // Profile Selector component
        profileSelector: document.querySelector('.js-profileSelector'),

        // Board-only elements — null until initBoardToolbar() populates them
        categoryFilter:    null,
        priorityFilterBtn: null,
        epicFilter:        null,
        snoozeToggleBtn:   null,
        privacyToggleBtn:  null,

        // Task Modal
        taskModal: document.querySelector('.js-taskModal'),
        taskForm: document.querySelector('.js-taskForm'),
        taskTitle: document.querySelector('.js-taskTitle'),
        taskDescription: document.querySelector('.js-taskDescription'),
        taskPriority: document.querySelector('.js-taskPriority'),
        taskLogList: document.querySelector('.js-taskLogList'),
        taskModalActions: document.querySelector('.js-taskModalActions'),

        // Attachments tab inside the task modal
        taskTabs: document.querySelector('.js-taskTabs'),
        attachments: document.querySelector('.js-attachments'),
        attachmentsPanel: document.querySelector('.js-attachmentsPanel'),
        taskDropOverlay: document.querySelector('.js-taskDropOverlay'),
        attachmentCount: document.querySelector('.js-attachmentCount'),

        // Attachment viewer modal
        attachmentModal: document.querySelector('.js-attachmentModal'),
        attachmentModalTitle: document.querySelector('.js-attachmentModalTitle'),
        attachmentViewer: document.querySelector('.js-attachmentViewer'),
        attachmentViewerBody: document.querySelector('.js-attachmentViewerBody'),
        attachmentOpen: document.querySelector('.js-attachmentOpen'),
        attachmentDownload: document.querySelector('.js-attachmentDownload'),

        // Reports Modal (opened via sidebar config-action in future pages)
        reportsModal: document.querySelector('.js-reportsModal'),
        markdownModal: document.querySelector('.js-markdownModal'),
        markdownContainer: document.querySelector('.js-markdownContainer'),
        reportsContainer: document.querySelector('.js-reportsContainer'),

        // Archived Tasks Modal (opened via sidebar config-action in future pages)
        archivedModal: document.querySelector('.js-archivedModal'),
        archivedContainer: document.querySelector('.js-archivedContainer'),

        // Privacy (appContainer always in DOM)
        appContainer: document.querySelector('.js-appContainer'),

        // Epic pills in task modal
        epicPills: document.querySelector('.js-epicPills'),

        // Story point pills in task modal
        pointsPills: document.querySelector('.js-pointsPills'),

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

        // AI Configuration (triggered via sidebar config menu)
        aiConfigModal:          document.querySelector('.js-aiConfigModal'),
        aiConfigEntries:        document.querySelector('.js-aiConfigEntries'),
        aiConfigAddBtn:         document.querySelector('.js-aiConfigAddBtn'),
        aiConfigListPanel:      document.querySelector('.js-aiConfigListPanel'),
        aiConfigFormPanel:      document.querySelector('.js-aiConfigFormPanel'),
        aiConfigBackBtn:        document.querySelector('.js-aiConfigBackBtn'),
        aiConfigNameInput:      document.querySelector('.js-aiConfigNameInput'),
        aiConfigProviderSel:    document.querySelector('.js-aiConfigProviderSel'),
        aiConfigCustomUrl:      document.querySelector('.js-aiConfigCustomUrl'),
        aiConfigCustomUrlGroup: document.querySelector('.js-aiConfigCustomUrlGroup'),
        aiConfigModelInput:     document.querySelector('.js-aiConfigModelInput'),
        aiConfigKeyInput:       document.querySelector('.js-aiConfigKeyInput'),
        aiConfigKeyHint:        document.querySelector('.js-aiConfigKeyHint'),
        aiConfigError:          document.querySelector('.js-aiConfigError'),
        aiConfigCancel:         document.querySelector('.js-aiConfigCancel'),
        aiConfigSave:           document.querySelector('.js-aiConfigSave'),

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
     * Sidebar closes itself before dispatching config-action events.
     * (Historical: this was a no-op shim kept after the v2.30 sidebar
     * migration when callers still received a closeMenu function. All
     * dead callers were removed in v2.38.2 along with this shim.)
     */

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
     * Fires the task card's confetti burst when it lands in a column the user
     * flagged as celebrating. Reordering within a column never celebrates —
     * only an actual arrival does.
     * @param {string} taskId - The task that just moved
     * @param {string} columnId - The column it landed in
     */
    function celebrateArrival(taskId, columnId) {
        const column = columns.find(c => c.id === columnId);
        if (!column || !column.celebrate) return;

        // The burst is rendered by the column, not the card: it has to live
        // outside the scrolling task list to avoid being clipped, and above
        // the cards so it isn't hidden behind a neighbouring one.
        const columnEl = document.querySelector(`kanban-column[data-status="${columnId}"]`);
        columnEl?.celebrate?.(taskId);
    }

    /**
     * Moves a task to a different column or reorders within the same column.
     * Uses optimistic UI - updates immediately, rolls back on failure.
     * Uses a lock to prevent race conditions from rapid drag operations.
     * @param {string} id - The task ID to move
     * @param {string} newStatus - Target column status (todo, wait, inprogress, done)
     * @param {number} newPosition - Zero-based position in the target column
     * @returns {Promise<boolean>} true if the move succeeded, false if it
     *     failed or was dropped by the lock — callers must not report success
     *     on false
     */
    async function moveTask(id, newStatus, newPosition) {
        // Prevent race condition: ignore if already processing a move
        if (isMoving) return false;
        isMoving = true;

        // Save snapshot for potential rollback
        const previousTasks = createTasksSnapshot();
        const task = findTask(id);
        if (!task) {
            isMoving = false;
            return false;
        }

        const oldStatus = task.status;

        // Optimistic update: Update task locally
        updateTaskInState(id, { status: newStatus, position: newPosition });

        // Reorder positions in affected columns. Mutates position directly on
        // the live task objects — O(n) instead of updateTaskInState's
        // findIndex-per-call O(n²); the snapshot above covers rollback.
        const affectedStatuses = new Set([oldStatus, newStatus]);
        affectedStatuses.forEach(status => {
            const columnTasks = tasks
                .filter(t => t.status === status)
                .sort((a, b) => a.position - b.position);

            columnTasks.forEach((t, idx) => {
                if (t.id !== id) {
                    t.position = idx >= newPosition && status === newStatus ? idx + 1 : idx;
                }
            });
        });

        // Render immediately
        renderAllColumns();

        try {
            await moveTaskApi(id, newStatus, newPosition);
            // Fetch fresh data to get accurate positions from server
            await fetchTasks();
            // Celebrate only after the final render: fetchTasks() re-renders,
            // which recreates the card elements and would discard a burst
            // started against the optimistic render.
            if (oldStatus !== newStatus) celebrateArrival(id, newStatus);
            return true;
        } catch (error) {
            // Rollback on failure
            restoreTasksFromSnapshot(previousTasks);
            renderAllColumns();
            console.error('Error moving task:', error);
            elements.toaster.error('Failed to move task. Changes have been reverted.');
            return false;
        } finally {
            // Always unlock, even if error occurred
            isMoving = false;
        }
    }

    /**
     * Sends a board task to the backlog column.
     * Closes the edit modal, moves the task via the existing moveTask flow.
     * Only toasts success when the move actually succeeded — moveTask shows
     * its own error toast on failure and returns false when the lock drops
     * the request.
     */
    async function sendTaskToBacklog(taskId, backlogColumnId) {
        elements.taskModal.close();
        const moved = await moveTask(taskId, backlogColumnId, 0);
        if (moved) {
            elements.toaster.success('Task sent to backlog');
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
        const boardCols = cols.filter(col => !col.isBacklog);
        elements.kanban.style.setProperty('--column-count', boardCols.length);
        boardCols.forEach((col, idx) => {
            const columnEl = document.createElement('kanban-column');
            columnEl.dataset.status = col.id;

            const title = document.createElement('span');
            title.slot = 'title';
            title.textContent = col.name;
            columnEl.appendChild(title);

            if (idx === 0) {
                const addBtn = document.createElement('button');
                addBtn.type = 'button';
                addBtn.slot = 'actions';
                // Design-system button: .btn + modifiers, no bespoke CSS.
                // These are slotted, so they live in the document tree and
                // styles.css reaches them (see SPEC § slotted styling).
                addBtn.className = 'btn --primary --sm js-addTaskBtn';
                addBtn.textContent = '+ Add Task';
                columnEl.appendChild(addBtn);
            }

            if (col.hasArchive) {
                const archiveBtn = document.createElement('button');
                archiveBtn.type = 'button';
                archiveBtn.slot = 'actions';
                archiveBtn.className = 'btn --secondary --sm js-archiveBtn';
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
        if (!columnEl) return;

        if (previewPlan) {
            // In preview mode the plan decides what each column shows,
            // including ghost copies of cards moving in from elsewhere.
            const entries = previewPlan.get(columnId) || [];
            columnEl.renderTasks(
                entries.map(e => ({ ...e.task, _preview: e.preview })),
                createTaskCard
            );
            return;
        }

        const columnTasks = tasks
            .filter(t => t.status === columnId)
            .sort((a, b) => a.position - b.position);
        columnEl.renderTasks(columnTasks, createTaskCard);
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

        // Story points — drives the size chip on the card
        if (task.points) card.dataset.points = String(task.points);

        // Captured but not yet classified — the card shows a marker so a later
        // review pass can find what the AI never got to (or got wrong).
        if (task.needsFiling) card.dataset.needsFiling = 'true';

        // Attachment count — drives the paperclip badge on the card
        const attachmentCount = (task.attachments || []).length;
        if (attachmentCount > 0) card.dataset.attachmentCount = String(attachmentCount);

        // Snooze state — apply class for CSS-driven visibility
        if (task.snoozeUntil && new Date(task.snoozeUntil) > new Date()) {
            card.classList.add('--snoozed');
        }

        // Preview annotation. A previewed board is for reviewing, not editing:
        // cards don't drag, and untouched ones recede so the changes are what
        // the eye lands on.
        if (previewPlan) {
            // Not `card.draggable = false`: renderTasks reuses existing card
            // elements and its reconciler deliberately leaves `draggable`
            // alone, so that would only take effect on freshly created cards.
            // The dragstart guard below covers reused ones too.
            if (task._preview) {
                card.dataset.preview = task._preview.kind;
                card.dataset.previewNote = task._preview.note;
                card.dataset.proposalId = task._preview.proposalId;
            } else {
                card.dataset.preview = 'idle';
            }
            return card;
        }

        card.draggable = true;

        // Drag events
        card.addEventListener('dragstart', (e) => {
            // Preview is for reviewing, not editing. Reused cards keep this
            // listener across a mode change, so the guard lives here rather
            // than on the element's draggable attribute.
            if (previewPlan) {
                e.preventDefault();
                return;
            }
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

        // Dropping files onto a card attaches them. `dataTransfer.types`
        // separates this from a card being dragged for reorder — the column's
        // own handlers bail out on the same test, so the two never collide.
        card.addEventListener('dragover', (e) => {
            if (!e.dataTransfer.types.includes('Files')) return;
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = 'copy';
            card.classList.add('--fileDragOver');
        });
        card.addEventListener('dragleave', (e) => {
            if (!card.contains(e.relatedTarget)) card.classList.remove('--fileDragOver');
        });
        card.addEventListener('drop', (e) => {
            if (!e.dataTransfer.types.includes('Files')) return;
            e.preventDefault();
            e.stopPropagation();
            card.classList.remove('--fileDragOver');
            attachDroppedFiles(task.id, Array.from(e.dataTransfer.files));
        });

        return card;
    }

    /**
     * Uploads files dropped directly onto a card on the board.
     *
     * Not optimistic: unlike a title edit there is nothing meaningful to show
     * until the bytes are actually stored, so the badge updates when each
     * upload lands. The task object in state is patched in place and only the
     * affected column re-renders.
     *
     * @param {string} taskId - Card the files were dropped on
     * @param {Array<File>} files
     */
    async function attachDroppedFiles(taskId, files) {
        const task = findTask(taskId);
        if (!task || files.length === 0) return;

        const existing = task.attachments || [];
        const room = MAX_ATTACHMENTS_PER_TASK - existing.length;
        if (room <= 0) {
            elements.toaster.warning(`A task can hold at most ${MAX_ATTACHMENTS_PER_TASK} files`);
            return;
        }

        let accepted = files.slice(0, room);
        const oversized = accepted.filter(f => f.size > MAX_ATTACHMENT_SIZE);
        for (const file of oversized) {
            elements.toaster.error(`"${file.name}" is larger than ${formatBytes(MAX_ATTACHMENT_SIZE)}`);
        }
        accepted = accepted.filter(f => f.size <= MAX_ATTACHMENT_SIZE);
        if (accepted.length === 0) return;

        let attached = 0;
        for (const file of accepted) {
            try {
                const attachment = await uploadAttachmentApi(taskId, file);
                task.attachments = [...(task.attachments || []), attachment];
                attached += 1;
            } catch (error) {
                elements.toaster.error(error.message || `Failed to attach "${file.name}"`);
            }
        }

        if (attached > 0) {
            renderColumn(task.status);
            applyAllFilters();
            elements.toaster.success(`${attached} file${attached === 1 ? '' : 's'} attached`);
        }
    }

    // ==========================================
    // Assistant Dock
    // ==========================================

    /**
     * Wires the dock. Global — it opens on every page, carrying whatever
     * context that page has.
     *
     * The conversation itself lives in `assistant-chat.js`, shared with the
     * `/:alias/ai` page, so the two surfaces show one thread.
     *
     * Only wires events. Loading the transcript has to wait until the active
     * profile is known, because every assistant endpoint is profile-scoped —
     * see the `assistantChat.init()` call after `setApiBase()`.
     */
    function initAssistantDock() {
        const dock = elements.assistantDock;
        if (!dock) return;

        dock.addEventListener('assistant-replied', async (e) => {
            // A reply may have produced proposals; the board's bar and preview
            // read from the same list, so refresh it.
            if (e.detail.proposals?.length) await loadProposals();
            if (e.detail.tasks?.length) {
                elements.toaster.info(`${e.detail.tasks.length} task${e.detail.tasks.length === 1 ? '' : 's'} staged — review on the AI page`);
            }
        });

        dock.addEventListener('review-proposals', () => {
            if (pendingProposals.length > 0 && !previewPlan) enterPreview();
        });

        dock.addEventListener('assistant-closed', () => refreshAssistantSuggestions());

        // Context is implicit: the assistant floats over every page, so what a
        // question means depends on where it was asked. Resolved per send, not
        // when the panel opened — the user may have navigated or opened a card
        // since. An open card is the strongest signal there is.
        assistantChat.setContextProvider(() => {
            const { page } = parsePath();
            const openTaskId = elements.taskModal?.hasAttribute('open') ? editingTaskId : null;
            return { page, taskId: openTaskId || null };
        });

        // The header says what the assistant is currently about, because
        // implicit context the user can't see is just confusing.
        const syncContextLabel = () => {
            const { page } = parsePath();
            const openTask = elements.taskModal?.hasAttribute('open') && editingTaskId
                ? findTask(editingTaskId)
                : null;
            dock.setContextLabel(openTask ? `About "${openTask.title}"` : `About the ${page}`);
        };
        syncContextLabel();
        elements.taskModal?.addEventListener('modal-opened', syncContextLabel);
        elements.taskModal?.addEventListener('modal-closed', syncContextLabel);
    }

    /**
     * Recomputes the dock's opening suggestions from the current board.
     *
     * Local and synchronous: these are facts about the board, not AI output,
     * so they render with the assistant unconfigured or unreachable.
     */
    function refreshAssistantSuggestions() {
        if (!elements.assistantDock || columns.length === 0) return;
        elements.assistantDock.setSuggestions(buildSuggestions(tasks, columns));
        elements.assistantDock.setPendingCount(pendingProposals.length);
    }

    // ==========================================
    // Board Preview (pending AI proposals)
    // ==========================================

    /** @type {Array<Object>} Pending proposals, mirrored from the server. */
    let pendingProposals = [];

    /**
     * The current preview plan, or null when preview is off. Non-null is the
     * single source of truth for "the board is in preview mode" — renderColumn
     * and createTaskCard both branch on it.
     * @type {Map<string, Array<Object>>|null}
     */
    let previewPlan = null;

    /**
     * Loads pending proposals and shows the bar if there are any.
     *
     * Called after the board renders, never before: a proposal is not
     * something the user asked to wait for, and the board must not depend on
     * this request succeeding.
     */
    async function loadProposals() {
        try {
            pendingProposals = await fetchProposalsApi();
        } catch {
            pendingProposals = [];   // the board is unaffected either way
        }
        renderProposalBar();
    }

    /** Shows/hides the proposal bar and sets its wording for the current mode. */
    function renderProposalBar() {
        elements.assistantDock?.setPendingCount(pendingProposals.length);
        if (!elements.proposalBar) return;

        const count = pendingProposals.length;
        elements.proposalBar.hidden = count === 0;
        if (count === 0) {
            if (previewPlan) exitPreview();
            return;
        }

        const noun = `${count} proposed change${count === 1 ? '' : 's'}`;
        elements.proposalBar.classList.toggle('--previewing', Boolean(previewPlan));
        elements.proposalBarText.textContent = previewPlan
            ? `Previewing ${noun} — Esc to exit`
            : noun;
        elements.previewToggleBtn.textContent = previewPlan ? 'Exit preview' : 'Preview on board';
    }

    /** Builds the plan from current state and repaints the board. */
    function enterPreview() {
        previewPlan = buildPreviewPlan(tasks, pendingProposals, columns, {
            columnById:   new Map(columns.map(c => [c.id, c])),
            epicById:     new Map(epics.map(e => [e.id, e])),
            categoryById: new Map(categories.map(c => [c.id, c]))
        });
        document.body.classList.add('--previewing');
        renderAllColumns();
        renderProposalBar();
    }

    /** Drops the plan and repaints the real board. */
    function exitPreview() {
        previewPlan = null;
        document.body.classList.remove('--previewing');
        renderAllColumns();
        renderProposalBar();
    }

    /**
     * Resolves one proposal from a preview card.
     * @param {string} proposalId
     * @param {boolean} accept - true applies, false rejects
     */
    async function resolveProposal(proposalId, accept) {
        // Drop it locally first so the card disappears immediately; the
        // outcome only changes the message, not whether it leaves the list.
        pendingProposals = pendingProposals.filter(p => p.id !== proposalId);

        if (accept) {
            const result = await applyProposalApi(proposalId);
            if (result.ok) {
                await fetchTasks();
                elements.toaster.success('Change applied');
            } else {
                elements.toaster[result.stale ? 'warning' : 'error'](result.error);
            }
        } else {
            try {
                await rejectProposalApi(proposalId);
            } catch {
                elements.toaster.warning('Rejected locally, but not on the server');
            }
        }

        // Rebuild against the new state — an applied move changes where the
        // remaining ghosts belong.
        if (previewPlan && pendingProposals.length > 0) enterPreview();
        else if (previewPlan) exitPreview();
        else renderProposalBar();
    }

    /** Wires the proposal bar and the preview cards' accept/reject events. */
    function initProposalControls() {
        if (!elements.proposalBar) return;

        elements.previewToggleBtn.addEventListener('click', () => {
            previewPlan ? exitPreview() : enterPreview();
        });

        elements.previewApplyAllBtn.addEventListener('click', async () => {
            if (pendingProposals.length === 0) return;
            try {
                const result = await applyAllProposalsApi();
                pendingProposals = [];
                exitPreview();
                await fetchTasks();
                if (result.failed?.length) {
                    elements.toaster.warning(`${result.applied} applied, ${result.failed.length} were out of date`);
                } else {
                    elements.toaster.success(`${result.applied} change${result.applied === 1 ? '' : 's'} applied`);
                }
            } catch {
                elements.toaster.error('Failed to apply changes');
            }
        });

        elements.previewDiscardBtn.addEventListener('click', async () => {
            if (pendingProposals.length === 0) return;
            pendingProposals = [];
            exitPreview();
            try {
                await rejectAllProposalsApi();
            } catch {
                elements.toaster.warning('Discarded locally, but not on the server');
            }
        });

        // Per-card decisions. Delegated from the board container: the buttons
        // live inside each card's shadow root, and the events are composed.
        elements.kanban?.addEventListener('preview-accept', (e) => resolveProposal(e.detail.proposalId, true));
        elements.kanban?.addEventListener('preview-reject', (e) => resolveProposal(e.detail.proposalId, false));

        // Esc leaves preview, matching how every other transient surface here
        // behaves. Guarded so it doesn't fight a modal that is also open.
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && previewPlan && !document.querySelector('modal-dialog[open]')) {
                exitPreview();
            }
        });
    }

    // ==========================================
    // Quick Capture
    // ==========================================

    /**
     * Handles a captured note: create the task, then classify it in the
     * background.
     *
     * Two requests on purpose. The first is instant and must not fail — the
     * note is the thing being protected, and it is safe on the board before
     * anything slower is attempted. The second is best effort: if the AI is
     * unavailable the task simply keeps its "needs filing" marker.
     *
     * There is no confirmation step. Reviewing in the moment is exactly the
     * friction that stops notes being captured at all, so the toast carries an
     * Undo instead — a misfiled card beats a card that was never written down.
     *
     * @param {string} text - The raw captured line
     */
    async function handleCapture(text) {
        let task;
        try {
            task = await captureTaskApi(text);
        } catch (error) {
            // The one failure the user must hear about: nothing was saved.
            elements.toaster.error('Could not capture that note — nothing was saved');
            return;
        }

        // The server inserted at position 0 and shifted every other card in
        // that column down. Mirror that shift locally, or the optimistic
        // insert collides with an existing position 0 and renders in the
        // wrong slot.
        for (const t of tasks) {
            if (t.status === task.status) t.position += 1;
        }

        // Show it immediately. renderColumn is a no-op off the board (no
        // matching kanban-column in the DOM), so this is safe on every page.
        addTask(task);
        renderColumn(task.status);
        applyAllFilters();

        const columnName = columns.find(c => c.id === task.status)?.name || 'the board';
        elements.toaster.success(`Captured to ${columnName}`, 4000, {
            label: 'Undo',
            onClick: () => undoCapture(task.id)
        });

        // Classification is fire-and-forget. classifyTaskApi resolves with
        // { classified: false } rather than rejecting when the AI is down, so
        // only a genuine transport failure lands in the catch.
        let result;
        try {
            result = await classifyTaskApi(task.id);
        } catch {
            return;   // task stands as captured, marker intact
        }
        if (!result?.classified || !result.task) return;

        if (result.task.status !== task.status) {
            // A move re-shuffles positions in the destination column too.
            // Rather than mirror that arithmetic a second time, re-sync from
            // the server — classification is already off the critical path,
            // so correctness is worth one extra GET here.
            await fetchTasks();
        } else {
            updateTaskInState(task.id, result.task);
            renderColumn(task.status);
            applyAllFilters();
        }
    }

    /**
     * Removes a captured task. Undo is deliberately a hard delete rather than
     * an archive: the card is seconds old and was never intended to exist.
     * @param {string} taskId
     */
    async function undoCapture(taskId) {
        const task = findTask(taskId);
        const status = task?.status;
        removeTask(taskId);
        if (status) renderColumn(status);
        applyAllFilters();
        try {
            await deleteTaskApi(taskId);
        } catch {
            elements.toaster.error('Could not undo — refresh to see the current board');
        }
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
     * Handles the archive button click for a specific column.
     * Confirms first — archiving clears a whole column at once, so the count
     * and column name are stated up front. Reversible from the Archive page,
     * hence the primary (not destructive) confirm button.
     * @param {string} columnId - The column ID to archive tasks from
     */
    async function handleArchive(columnId) {
        const column = columns.find(c => c.id === columnId);
        const columnName = column ? column.name : 'this column';
        const count = tasks.filter(t => t.status === columnId).length;

        if (count === 0) {
            elements.toaster.info(`No tasks to archive in ${columnName}`);
            return;
        }

        const confirmed = await openConfirmDialog({
            title: 'Archive Tasks',
            message: `Archive ${count} task${count !== 1 ? 's' : ''} from "${columnName}"? `
                + 'They move to the Archive page, where they can be restored at any time.',
            confirmLabel: 'Archive',
            variant: 'primary'
        });
        if (!confirmed) return;

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
                <custom-picker type="list" placeholder="Categories" size="compact" class="toolbar__categoryFilter js-categoryFilter"></custom-picker>
                <custom-picker type="list" placeholder="Epics" size="compact" class="toolbar__epicFilter js-epicFilter"></custom-picker>
                <button class="toolbar__priorityBtn js-priorityFilterBtn" type="button">★ Priority</button>
                <button class="toolbar__snoozeBtn js-snoozeToggleBtn" style="display:none;" type="button"></button>
                <div class="toolbar__divider"></div>
                <button class="toolbar__privacyBtn js-privacyToggleBtn" type="button">Hide</button>
            </div>
        `;
        elements.categoryFilter    = mount.querySelector('.js-categoryFilter');
        elements.priorityFilterBtn = mount.querySelector('.js-priorityFilterBtn');
        elements.epicFilter        = mount.querySelector('.js-epicFilter');
        elements.snoozeToggleBtn   = mount.querySelector('.js-snoozeToggleBtn');
        elements.privacyToggleBtn  = mount.querySelector('.js-privacyToggleBtn');
    }

    // ==========================================
    // Event Listeners
    // ==========================================

    /**
     * Initializes event listeners that are active on all pages (modals, sidebar, profile, etc.).
     */
    function initEventListeners() {
        // Profile Selector component events
        elements.profileSelector.addEventListener('profile-select', (e) => {
            window.location.href = '/' + e.detail.alias;
        });
        elements.profileSelector.addEventListener('profile-open-new-tab', (e) => {
            window.open('/' + e.detail.alias, '_blank');
        });

        // Profile/Category/Epic delete-confirmation modals are wired inside
        // config-page.js — that page owns the entire CRUD flow.

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
        elements.taskDeadline.addEventListener('input', () => {
            updateDateHint(elements.deadlineHint, elements.taskDeadline.value);
            syncScheduleSummary(elements);
        });
        elements.taskSnooze.addEventListener('input', () => {
            updateDateHint(elements.snoozeHint, elements.taskSnooze.value);
            syncScheduleSummary(elements);
        });

        // Epic and point pills are toggleable: clicking the selected one again
        // clears it (= no epic / unestimated). Radios don't natively un-check,
        // so capture the pre-click state on mousedown and un-check on click if
        // it was already set.
        const wireTogglePills = (container, pillClass) => {
            if (!container) return;
            container.addEventListener('mousedown', (e) => {
                const radio = e.target.closest(pillClass)?.querySelector('input');
                if (radio) radio._wasChecked = radio.checked;
            });
            container.addEventListener('click', (e) => {
                const radio = e.target.closest(pillClass)?.querySelector('input');
                if (radio && radio._wasChecked) radio.checked = false;
            });
        };
        wireTogglePills(elements.epicPills, '.taskForm__epicPill');
        wireTogglePills(elements.pointsPills, '.taskForm__pointPill');

        // Inline-editable task title (contenteditable heading): keep it
        // single-line, plain-text, and capped at the title length.
        const TASK_TITLE_MAX = 200; // mirrors the server-side title length limit
        if (elements.taskTitle) {
            elements.taskTitle.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    elements.taskTitle.blur();
                }
            });
            elements.taskTitle.addEventListener('paste', (e) => {
                e.preventDefault();
                const text = (e.clipboardData || window.clipboardData).getData('text/plain');
                document.execCommand('insertText', false, text.replace(/\s+/g, ' ').trim());
            });
            elements.taskTitle.addEventListener('input', () => {
                if (elements.taskTitle.textContent.length > TASK_TITLE_MAX) {
                    elements.taskTitle.textContent = elements.taskTitle.textContent.slice(0, TASK_TITLE_MAX);
                    const range = document.createRange();
                    range.selectNodeContents(elements.taskTitle);
                    range.collapse(false);
                    const sel = window.getSelection();
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
            });
        }

        // Column delete confirmation is wired inside config-page.js.
        // Checklist editing also lives in config-page.js now (the old modal
        // editor was removed in v2.38.3).

        // The shared confirmation modal (.js-confirmModal) needs no wiring —
        // openConfirmDialog() in modals.js attaches and detaches its own
        // listeners per call and resolves a boolean.
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

        // Category Filter
        elements.categoryFilter.addEventListener('change', () => {
            handleCategoryFilterChange(elements.categoryFilter, applyAllFilters);
        });

        // Epic Filter
        elements.epicFilter.addEventListener('change', () => {
            handleEpicFilterChange(elements.epicFilter, applyAllFilters);
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
                    () => openDeleteConfirmation(elements, renderAllColumns),
                    handleTaskFormSubmit
                );
            }
            if (e.target.classList.contains('js-archiveBtn')) {
                handleArchive(e.target.dataset.columnId);
            }
        });

        // Pending AI proposals: wired here (board only — preview is a board
        // mode), and loaded after the board has painted.
        initProposalControls();
        loadProposals();

        // Keyboard shortcuts — board page gets the full set (quick-add,
        // card focus navigation, Cmd/Ctrl+arrow card moves)
        initShortcuts({
            alias: activeProfile?.alias || '',
            board: {
                quickAdd: () => openAddTaskModal(
                    elements,
                    () => openDeleteConfirmation(elements, renderAllColumns),
                    handleTaskFormSubmit
                ),
                moveCard: (taskId, newStatus, newPosition) => moveTask(taskId, newStatus, newPosition)
            }
        });

        // Listen for edit requests from task-card components
        elements.kanban.addEventListener('request-edit', (e) => {
            const taskId = e.detail.taskId;
            const backlogCol = columns.find(c => c.isBacklog);
            const task = findTask(taskId);
            // Show "Backlog" button only for board tasks (not already in backlog)
            const onSendToBacklog = (backlogCol && task && task.status !== backlogCol.id)
                ? () => sendTaskToBacklog(taskId, backlogCol.id)
                : null;
            openEditModal(
                taskId,
                elements,
                () => openDeleteConfirmation(elements, renderAllColumns),
                handleTaskFormSubmit,
                () => openCloneTaskModal(taskId, elements, () => openDeleteConfirmation(elements, renderAllColumns), handleTaskFormSubmit),
                onSendToBacklog
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
        initAttachments(elements);
        initAssistantDock();

        // Quick capture is global: the bar lives in index.html on every page,
        // and the `c` shortcut opens it wherever the user happens to be.
        elements.quickCapture?.addEventListener('capture-submit', (e) => {
            handleCapture(e.detail.text);
        });

        /** @type {Object|null} Active profile, hoisted out of the try block so
         * the board-data loading below can read its columns array */
        let boardProfile = null;

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
            boardProfile = matchedProfile;
            setApiBase(matchedProfile.alias);

            // The assistant's endpoints are profile-scoped, so its transcript
            // can only be loaded once the API base points at a real profile.
            // Deliberately not awaited: the page must never wait on anything
            // AI-shaped. See the degradation contract in AI_ASSISTANT.md.
            assistantChat.init();
            document.body.classList.add('profile-' + matchedProfile.alias);
            elements.profileSelector.setProfiles(fetchedProfiles);
            elements.profileSelector.setActiveProfile(matchedProfile);
            loadGeneralConfig();

            // Sidebar: set alias + active page for link hrefs and active state
            elements.navSidebar.setAttribute('alias', matchedProfile.alias);
            elements.navSidebar.setAttribute('page', page);

            // Routing: show board or placeholder page
            if (page !== 'board') {
                // Non-board pages get the global shortcuts (g-chords + ? help)
                initShortcuts({ alias: matchedProfile.alias });
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
                } else if (page === 'reports') {
                    const { initReportsPage } = await import('./js/reports-page.js');
                    initReportsPage(elements.pageView, { elements }).catch(err => {
                        console.error('Reports page error:', err);
                        if (elements.toaster) elements.toaster.error('Failed to load reports page');
                    });
                } else if (page === 'config') {
                    const { initConfigPage } = await import('./js/config-page.js');
                    initConfigPage(elements.pageView, { elements }).catch(err => {
                        console.error('Config page error:', err);
                        if (elements.toaster) elements.toaster.error('Failed to load config page');
                    });
                } else if (page === 'design-system') {
                    const { initDesignSystemPage } = await import('./js/design-system-page.js');
                    initDesignSystemPage(elements.pageView).catch(err => {
                        console.error('Design System page error:', err);
                        if (elements.toaster) elements.toaster.error('Failed to load design system page');
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

        // Columns ship with the profile payload (GET /api/profiles includes
        // each profile's columns array) — no separate request needed. Legacy
        // profiles without a columns field fall back to the columns endpoint,
        // which runs the server-side migration.
        try {
            let boardColumns = boardProfile?.columns;
            if (!boardColumns || !boardColumns.length) {
                boardColumns = await fetchColumnsApi();
            }
            setColumns(boardColumns);
            initKanban(columns);
        } catch (error) {
            console.error('Error loading columns:', error);
            elements.toaster.error('Failed to load board columns');
        }

        // Fetch the remaining board data in parallel — independent requests;
        // awaiting them sequentially tripled cold-start latency.
        const [categoriesResult, epicsResult, tasksResult] = await Promise.allSettled([
            fetchCategoriesApi(),
            fetchEpicsApi(),
            fetchTasksApi()
        ]);
        if (categoriesResult.status === 'fulfilled') setCategories(categoriesResult.value);
        else console.error('Error fetching categories:', categoriesResult.reason);
        if (epicsResult.status === 'fulfilled') setEpics(epicsResult.value);
        else console.error('Error fetching epics:', epicsResult.reason);
        if (tasksResult.status === 'fulfilled') setTasks(tasksResult.value);
        else console.error('Error fetching tasks:', tasksResult.reason);
        if ([categoriesResult, epicsResult, tasksResult].some(r => r.status === 'rejected')) {
            elements.toaster.error('Some board data failed to load');
        }

        // Render category filters now that dynamic categories are loaded
        renderCategoryFilters(elements.categoryFilter);
        renderAllColumns();

        // Suggestions are facts about the board, so they can only be computed
        // once the board data has landed — initBoardEventListeners() runs
        // before this point, when tasks and columns are still empty.
        refreshAssistantSuggestions();

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
