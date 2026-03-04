/**
 * Archive page module — renders and manages the /:alias/archive page.
 */

import { fetchArchivedTasksApi, fetchEpicsApi, fetchCategoriesApi, restoreArchivedTaskApi } from './api.js';

/**
 * Returns the completed date string for a task.
 * Uses the last log entry date, falling back to createdDate.
 * @param {Object} task
 * @returns {string} date string (YYYY-MM-DD or similar)
 */
export function getCompletedDate(task) {
    if (task.log && task.log.length > 0) {
        return task.log[task.log.length - 1].date || '';
    }
    return task.createdDate ? task.createdDate.split('T')[0] : '';
}

/**
 * Sorts two tasks by a given field and direction.
 * Null/undefined values sort to the end.
 * @param {Object} a
 * @param {Object} b
 * @param {string} field - 'title' | 'epicName' | 'categoryName' | 'completedDate'
 * @param {'asc'|'desc'} direction
 * @param {Map} epicMap
 * @param {Map} categoryMap
 * @returns {number}
 */
export function sortTasks(a, b, field, direction, epicMap, categoryMap) {
    let aVal, bVal;

    switch (field) {
        case 'title':
            aVal = (a.title || '').toLowerCase();
            bVal = (b.title || '').toLowerCase();
            break;
        case 'epicName': {
            const aEpic = a.epicId ? epicMap.get(a.epicId) : null;
            const bEpic = b.epicId ? epicMap.get(b.epicId) : null;
            aVal = aEpic ? aEpic.name.toLowerCase() : null;
            bVal = bEpic ? bEpic.name.toLowerCase() : null;
            break;
        }
        case 'categoryName': {
            const aCat = a.category ? categoryMap.get(Number(a.category)) : null;
            const bCat = b.category ? categoryMap.get(Number(b.category)) : null;
            aVal = aCat ? aCat.name.toLowerCase() : null;
            bVal = bCat ? bCat.name.toLowerCase() : null;
            break;
        }
        case 'completedDate':
            aVal = getCompletedDate(a);
            bVal = getCompletedDate(b);
            break;
        default:
            return 0;
    }

    // Nulls sort to end regardless of direction
    if (aVal === null && bVal === null) return 0;
    if (aVal === null) return 1;
    if (bVal === null) return -1;

    let cmp;
    if (field === 'completedDate') {
        cmp = new Date(aVal) - new Date(bVal);
    } else {
        cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    }

    return direction === 'asc' ? cmp : -cmp;
}

/**
 * Initialises the archive page inside the given container element.
 * @param {HTMLElement} pageViewEl
 */
export async function initArchivePage(pageViewEl) {
    const toaster = document.querySelector('.js-toaster');

    pageViewEl.classList.add('--fullPage');
    pageViewEl.innerHTML = `
        <div class="archivePage">
            <div class="archivePage__header">
                <h2 class="archivePage__title">Archive</h2>
                <span class="archivePage__count js-archiveCount">Loading…</span>
            </div>
            <div class="archivePage__tableWrap js-archiveTableWrap">
                <list-header class="js-listHeader"></list-header>
                <div class="archivePage__rows js-archiveRows"></div>
            </div>
        </div>
    `;

    let tasks, epics, categories;
    try {
        [tasks, epics, categories] = await Promise.all([
            fetchArchivedTasksApi(),
            fetchEpicsApi(),
            fetchCategoriesApi()
        ]);
    } catch (err) {
        console.error('Archive page: failed to load data', err);
        if (toaster) toaster.error('Failed to load archive data');
        pageViewEl.querySelector('.js-archiveCount').textContent = 'Error loading data';
        return;
    }

    const epicMap = new Map(epics.map(e => [e.id, e]));
    const categoryMap = new Map(categories.map(c => [Number(c.id), c]));

    let sortedTasks = [...tasks];
    let currentField = 'completedDate';
    let currentDirection = 'desc';

    // Apply default sort
    sortedTasks.sort((a, b) => sortTasks(a, b, currentField, currentDirection, epicMap, categoryMap));

    // Configure header
    const headerEl = pageViewEl.querySelector('.js-listHeader');
    headerEl.setColumns([
        { id: 'title',         label: 'Title',     sortable: true },
        { id: 'epicName',      label: 'Epic',       sortable: true },
        { id: 'categoryName',  label: 'Category',   sortable: true },
        { id: 'completedDate', label: 'Completed',  sortable: true },
        { id: 'actions',       label: '',           sortable: false }
    ]);
    headerEl.setSort(currentField, currentDirection);

    function updateCount() {
        const countEl = pageViewEl.querySelector('.js-archiveCount');
        if (countEl) {
            const n = sortedTasks.length;
            countEl.textContent = `${n} task${n !== 1 ? 's' : ''}`;
        }
    }

    function renderRows() {
        const rowsContainer = pageViewEl.querySelector('.js-archiveRows');
        rowsContainer.innerHTML = '';

        if (sortedTasks.length === 0) {
            rowsContainer.innerHTML = '<div class="archivePage__empty">No archived tasks yet.</div>';
            return;
        }

        sortedTasks.forEach(task => {
            const epic = task.epicId ? epicMap.get(task.epicId) : null;
            const category = task.category ? categoryMap.get(Number(task.category)) : null;

            const row = document.createElement('archive-row');
            rowsContainer.appendChild(row);
            row.setTask(task, {
                epicName:     epic ? epic.name : null,
                epicColor:    epic ? epic.color : null,
                categoryName: category ? category.name : null,
                categoryIcon: category ? category.icon : null
            });
        });
    }

    renderRows();
    updateCount();

    // Sort-change from list-header
    headerEl.addEventListener('sort-change', (e) => {
        currentField = e.detail.field;
        currentDirection = e.detail.direction;
        sortedTasks.sort((a, b) => sortTasks(a, b, currentField, currentDirection, epicMap, categoryMap));
        renderRows();
    });

    // Restore-task from archive rows (event delegation on container)
    pageViewEl.addEventListener('restore-task', async (e) => {
        const { taskId } = e.detail;
        const result = await restoreArchivedTaskApi(taskId);
        if (result.ok) {
            // Remove from local array
            sortedTasks = sortedTasks.filter(t => t.id !== taskId);
            updateCount();
            // Remove the row element from DOM
            const rowsContainer = pageViewEl.querySelector('.js-archiveRows');
            const rows = rowsContainer.querySelectorAll('archive-row');
            rows.forEach(row => {
                if (row._task && row._task.id === taskId) {
                    row.remove();
                }
            });
            if (sortedTasks.length === 0) {
                rowsContainer.innerHTML = '<div class="archivePage__empty">No archived tasks yet.</div>';
            }
            if (toaster) toaster.success('Task restored to board');
        } else {
            if (toaster) toaster.error(result.error || 'Failed to restore task');
        }
    });
}
