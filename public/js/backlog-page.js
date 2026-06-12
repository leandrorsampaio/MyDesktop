/**
 * Backlog page module — renders and manages the /:alias/backlog page.
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
    moveTaskApi
} from './api.js';

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
            </div>
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
            () => openDeleteConfirmation(elements),
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
            () => openDeleteConfirmation(elements),
            handleTaskFormSubmit
        );
    });

    // Refresh backlog after task modal closes (handles delete)
    elements.taskModal.addEventListener('modal-closed', renderBacklogRows);
}
