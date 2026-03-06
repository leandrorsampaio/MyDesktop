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
    moveTaskApi, createColumnApi, updateColumnApi
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
            <button type="button" class="backlogPage__fab js-backlogFab" aria-label="Add task">+</button>
        </div>
    `;

    // Fetch all data in parallel
    let fetchedTasks, fetchedColumns, fetchedEpics, fetchedCategories;
    try {
        [fetchedTasks, fetchedColumns, fetchedEpics, fetchedCategories] = await Promise.all([
            fetchTasksApi(),
            fetchColumnsApi(),
            fetchEpicsApi(),
            fetchCategoriesApi()
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

    // Find or auto-create the backlog column.
    // Check isBacklog flag first; fall back to name match in case flag wasn't persisted.
    let backlogCol = fetchedColumns.find(c => c.isBacklog) ||
                     fetchedColumns.find(c => c.name === 'Backlog');

    if (backlogCol && !backlogCol.isBacklog) {
        // Flag missing — patch it on the server so future loads find it correctly
        try {
            await updateColumnApi(backlogCol.id, { isBacklog: true });
            backlogCol = { ...backlogCol, isBacklog: true };
            const updatedColumns = fetchedColumns.map(c => c.id === backlogCol.id ? backlogCol : c);
            setColumns(updatedColumns);
        } catch (err) {
            // Non-fatal — column still usable without the flag
            console.warn('Backlog page: could not patch isBacklog flag', err);
            setColumns(fetchedColumns);
        }
    } else if (!backlogCol) {
        try {
            const result = await createColumnApi({ name: 'Backlog', isBacklog: true });
            if (result.ok) {
                backlogCol = result.data;
                setColumns([...fetchedColumns, backlogCol]);
            } else {
                if (toaster) toaster.error('Failed to create backlog column');
                pageViewEl.querySelector('.js-backlogCount').textContent = 'Error';
                return;
            }
        } catch (err) {
            console.error('Backlog page: failed to create backlog column', err);
            if (toaster) toaster.error('Failed to create backlog column');
            return;
        }
    } else {
        setColumns(fetchedColumns);
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

    // FAB — open add task modal targeting the backlog column
    pageViewEl.querySelector('.js-backlogFab').addEventListener('click', () => {
        openAddTaskModal(
            elements,
            () => openDeleteConfirmation(elements),
            handleTaskFormSubmit
        );
    });

    // Refresh backlog after task modal closes (handles delete)
    elements.taskModal.addEventListener('modal-closed', renderBacklogRows);
}
