/**
 * Backlog page module — renders and manages the /:alias/backlog page.
 *
 * Also hosts **AI staging**, which used to be its own page. A staged task is
 * proposed work that hasn't been committed to yet — which is exactly what the
 * backlog is for, so the two belong together. It also gives the backlog a
 * second reason to be opened, which it badly needed.
 *
 * Conversation itself lives in the floating assistant, available on every
 * page; this section is for the one thing a small floating panel is bad at —
 * pasting a long transcript and reviewing what came out of it.
 */

import {
    createTaskFormSubmitHandler, openAddTaskModal, openEditModal, openDeleteConfirmation
} from './modals.js';
import {
    tasks, setTasks, addTask, updateTaskInState,
    columns, setColumns, setEpics, setCategories, epics, categories
} from './state.js';
import {
    fetchTasksApi, fetchColumnsApi, fetchEpicsApi, fetchCategoriesApi,
    moveTaskApi,
    fetchStagedTasksApi, updateStagedTaskApi, deleteStagedTaskApi,
    promoteToBacklogApi, promoteToBoardApi, createTaskApi
} from './api.js';
import { openEditStagedTaskModal, openCloneStagedTaskModal } from './modals.js';
import * as assistantChat from './assistant-chat.js';

/**
 * Initialises the backlog page inside the given container element.
 * @param {HTMLElement} pageViewEl
 * @param {{ elements: Object }} opts - elements from app.js (for modals)
 */
export async function initBacklogPage(pageViewEl, { elements }) {
    const toaster = document.querySelector('.js-toaster');

    pageViewEl.classList.add('--fullPage');
    pageViewEl.innerHTML = `
        <div class="backlogPage">
            <div class="backlogPage__header">
                <h2 class="backlogPage__title">Backlog</h2>
                <span class="backlogPage__count js-backlogCount">Loading…</span>
                <button type="button" class="btn --secondary --sm js-stagingToggle" aria-expanded="false">
                    AI staging<span class="backlogPage__stagedBadge js-stagedBadge" hidden></span>
                </button>
            </div>

            <!-- AI staging: collapsed until called for, so the backlog stays
                 the page's subject rather than the assistant. -->
            <section class="aiStaging js-staging" hidden>
                <textarea class="aiStaging__input js-stagingInput" rows="3"
                          placeholder="Paste meeting notes, or describe what came out of a conversation…"
                          aria-label="Notes to turn into tasks"></textarea>
                <div class="aiStaging__actions">
                    <span class="aiStaging__hint js-stagingHint"></span>
                    <button type="button" class="btn --primary --sm js-stagingSend">Extract tasks</button>
                </div>
                <div class="aiStaging__rows js-stagedRows"></div>
                <div class="aiStaging__empty js-stagedEmpty">Nothing staged. Paste something above and the assistant will pull tasks out of it.</div>
            </section>
            <div class="backlogPage__tableWrap js-backlogTableWrap">
                <list-header class="js-listHeader"></list-header>
                <div class="backlogPage__rows js-backlogRows"></div>
            </div>
            <page-fab label="Add task" icon="+"></page-fab>
        </div>
    `;

    // Fetch all data in parallel (page components load alongside — lazy:
    // they're not in index.html so the board cold-start doesn't pay for them)
    let fetchedTasks, fetchedColumns, fetchedEpics, fetchedCategories;
    try {
        [fetchedTasks, fetchedColumns, fetchedEpics, fetchedCategories] = await Promise.all([
            fetchTasksApi(),
            fetchColumnsApi(),
            fetchEpicsApi(),
            fetchCategoriesApi(),
            import('/components/list-header/list-header.js'),
            import('/components/backlog-row/backlog-row.js')
        ]);
    } catch (err) {
        console.error('Backlog page: failed to load data', err);
        if (toaster) toaster.error('Failed to load backlog data');
        pageViewEl.querySelector('.js-backlogCount').textContent = 'Error loading data';
        return;
    }

    // Populate state so modals work (columns set after backlog column resolution below)
    setTasks(fetchedTasks);
    setEpics(fetchedEpics);
    setCategories(fetchedCategories);

    // Backlog column is always present (created by resolveProfile middleware)
    setColumns(fetchedColumns);
    const backlogCol = fetchedColumns.find(c => c.isBacklog);

    if (!backlogCol) {
        if (toaster) toaster.error('Backlog column not found');
        return;
    }

    const backlogColumnId = backlogCol.id;

    function getBacklogTasks() {
        return tasks.filter(t => t.status === backlogColumnId)
                    .sort((a, b) => (a.position || 0) - (b.position || 0));
    }

    function updateCount() {
        const countEl = pageViewEl.querySelector('.js-backlogCount');
        if (countEl) {
            const n = getBacklogTasks().length;
            countEl.textContent = `${n} task${n !== 1 ? 's' : ''}`;
        }
    }

    function renderBacklogRows() {
        const rowsContainer = pageViewEl.querySelector('.js-backlogRows');
        if (!rowsContainer) return;

        // Rebuild epicMap and categoryMap from current state in case they changed
        const currentEpicMap    = new Map(epics.map(e => [e.id, e]));
        const currentCategoryMap = new Map(categories.map(c => [Number(c.id), c]));

        rowsContainer.innerHTML = '';
        const backlogTasks = getBacklogTasks();

        if (backlogTasks.length === 0) {
            rowsContainer.innerHTML = '<div class="backlogPage__empty">No backlog tasks yet. Use the + button to add one.</div>';
            updateCount();
            return;
        }

        backlogTasks.forEach(task => {
            const epic    = task.epicId ? currentEpicMap.get(task.epicId) : null;
            const category = task.category ? currentCategoryMap.get(Number(task.category)) : null;

            const row = document.createElement('backlog-row');
            rowsContainer.appendChild(row);
            row.setTask(task, {
                epicName:     epic ? epic.name : null,
                epicColor:    epic ? epic.color : null,
                categoryName: category ? category.name : null,
                categoryIcon: category ? category.icon : null
            });
        });

        updateCount();
    }

    // Configure list-header
    const headerEl = pageViewEl.querySelector('.js-listHeader');
    headerEl.setColumns([
        { id: 'title',       label: 'Title',    sortable: false },
        { id: 'epicName',    label: 'Epic',     sortable: false },
        { id: 'categoryName', label: 'Category', sortable: false },
        { id: 'createdDate', label: 'Created',  sortable: false },
        { id: 'actions',     label: '',         sortable: false }
    ]);

    // Create the task form submit handler — targets backlog column
    const handleTaskFormSubmit = createTaskFormSubmitHandler(
        elements,
        renderBacklogRows,
        renderBacklogRows,
        addTask,
        updateTaskInState,
        backlogColumnId
    );

    renderBacklogRows();

    // Handle Edit button
    pageViewEl.addEventListener('backlog-edit', (e) => {
        const { taskId } = e.detail;
        openEditModal(
            taskId,
            elements,
            () => openDeleteConfirmation(elements, renderBacklogRows),
            handleTaskFormSubmit
        );
    });

    // Handle Promote button — move task to first non-backlog column
    pageViewEl.addEventListener('backlog-promote', async (e) => {
        const { taskId } = e.detail;
        const boardColumns = columns.filter(c => !c.isBacklog).sort((a, b) => a.order - b.order);
        if (!boardColumns.length) {
            if (toaster) toaster.warning('No board columns available to promote to');
            return;
        }
        const targetColumnId = boardColumns[0].id;
        try {
            await moveTaskApi(taskId, targetColumnId, 0);
            // Remove task from local state and re-render
            const updatedTasks = tasks.map(t =>
                t.id === taskId ? { ...t, status: targetColumnId, position: 0 } : t
            );
            setTasks(updatedTasks);
            renderBacklogRows();
            if (toaster) toaster.success('Task promoted to board');
        } catch (err) {
            console.error('Backlog promote error:', err);
            if (toaster) toaster.error('Failed to promote task');
        }
    });

    // Dynamically import page-fab component
    await import('/components/page-fab/page-fab.js');

    // FAB — open add task modal targeting the backlog column
    pageViewEl.querySelector('page-fab').addEventListener('fab-click', () => {
        openAddTaskModal(
            elements,
            () => openDeleteConfirmation(elements, renderBacklogRows),
            handleTaskFormSubmit
        );
    });

    // Refresh backlog after task modal closes (handles delete)
    elements.taskModal.addEventListener('modal-closed', renderBacklogRows);

    // ==========================================
    // AI staging
    // ==========================================
    const stagingEl    = pageViewEl.querySelector('.js-staging');
    const toggleBtn    = pageViewEl.querySelector('.js-stagingToggle');
    const stagedBadge  = pageViewEl.querySelector('.js-stagedBadge');
    const stagingInput = pageViewEl.querySelector('.js-stagingInput');
    const stagingSend  = pageViewEl.querySelector('.js-stagingSend');
    const stagingHint  = pageViewEl.querySelector('.js-stagingHint');
    const stagedRows   = pageViewEl.querySelector('.js-stagedRows');
    const stagedEmpty  = pageViewEl.querySelector('.js-stagedEmpty');

    /** @type {Array<Object>} Mirror of ai-staged-tasks.json */
    let stagedTasks = [];

    function renderStaged() {
        stagedBadge.hidden = stagedTasks.length === 0;
        stagedBadge.textContent = String(stagedTasks.length);
        stagedEmpty.hidden = stagedTasks.length > 0;

        stagedRows.innerHTML = '';
        // Map lookups rather than .find() per row — SPEC Code Rule 4.
        const epicById = new Map(epics.map(e => [e.id, e]));
        const categoryById = new Map(categories.map(c => [c.id, c]));

        for (const task of stagedTasks) {
            const row = document.createElement('ai-staged-row');
            row.setTask(task, {
                epicName:     epicById.get(task.epicId)?.name,
                epicColor:    epicById.get(task.epicId)?.color,
                categoryName: categoryById.get(task.category)?.name,
                categoryIcon: categoryById.get(task.category)?.icon
            });
            stagedRows.appendChild(row);
        }
    }

    /** Opens the section, e.g. because there is something waiting in it. */
    function openStaging() {
        stagingEl.hidden = false;
        toggleBtn.setAttribute('aria-expanded', 'true');
    }

    toggleBtn.addEventListener('click', () => {
        const open = stagingEl.hidden;
        stagingEl.hidden = !open;
        toggleBtn.setAttribute('aria-expanded', String(open));
        if (open) stagingInput.focus();
    });

    /** Sends the pasted text to the assistant and shows what it staged. */
    async function extractTasks() {
        const text = stagingInput.value.trim();
        if (!text) return;

        stagingSend.disabled = true;
        stagingHint.textContent = 'Reading…';

        const result = await assistantChat.send(text);

        stagingSend.disabled = false;
        if (!result.ok) {
            stagingHint.textContent = result.error;
            return;
        }

        stagingInput.value = '';
        const added = result.tasks?.length || 0;
        stagedTasks = [...stagedTasks, ...(result.tasks || [])];
        renderStaged();
        stagingHint.textContent = added
            ? `${added} task${added === 1 ? '' : 's'} staged`
            : 'Nothing actionable found in that.';
    }

    stagingSend.addEventListener('click', extractTasks);

    // ---- Staged row actions (delegated) ----
    stagedRows.addEventListener('ai-edit', (e) => {
        const task = stagedTasks.find(t => t.id === e.detail.taskId);
        if (!task) return;
        openEditStagedTaskModal(task, elements, {
            onSave: async (data) => {
                const res = await updateStagedTaskApi(task.id, data);
                if (!res.ok) return toaster?.error(res.error || 'Failed to update');
                Object.assign(task, res.data);
                renderStaged();
            }
        });
    });

    stagedRows.addEventListener('ai-clone', (e) => {
        const task = stagedTasks.find(t => t.id === e.detail.taskId);
        if (!task) return;
        openCloneStagedTaskModal(task, elements, {
            onSave: async (data) => {
                try {
                    await createTaskApi({ ...data, status: backlogColumnId });
                    await refreshBacklog();
                    toaster?.success('Added to the backlog');
                } catch (error) {
                    toaster?.error(error.message || 'Failed to create task');
                }
            }
        });
    });

    stagedRows.addEventListener('ai-delete', async (e) => {
        const id = e.detail.taskId;
        stagedTasks = stagedTasks.filter(t => t.id !== id);
        renderStaged();
        const res = await deleteStagedTaskApi(id);
        if (!res.ok) toaster?.error(res.error || 'Failed to delete');
    });

    for (const [event, api, label] of [
        ['ai-promote-backlog', promoteToBacklogApi, 'backlog'],
        ['ai-promote-board',   promoteToBoardApi,   'board']
    ]) {
        stagedRows.addEventListener(event, async (e) => {
            const res = await api(e.detail.taskId);
            if (!res.ok) return toaster?.error(res.error || 'Failed to promote');
            stagedTasks = stagedTasks.filter(t => t.id !== e.detail.taskId);
            renderStaged();
            await refreshBacklog();
            toaster?.success(`Promoted to the ${label}`);
        });
    }

    /** Re-reads tasks so a promotion shows up in the list below. */
    async function refreshBacklog() {
        try {
            setTasks(await fetchTasksApi());
            renderBacklogRows();
        } catch {
            // The promotion succeeded; the list is just momentarily stale.
        }
    }

    // Loaded after the page paints — staging must never delay the backlog.
    Promise.all([
        fetchStagedTasksApi().catch(() => []),
        import('/components/ai-staged-row/ai-staged-row.js')
    ]).then(([fetched]) => {
        stagedTasks = fetched;
        renderStaged();
        // Something is already waiting: open the section rather than hiding a
        // badge behind a click.
        if (stagedTasks.length > 0) openStaging();
    });
}
