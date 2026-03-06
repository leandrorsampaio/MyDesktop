/**
 * Dashboard page module — renders /:alias/dashboard.
 * Read-only overview: stats, epic progress, deadlines, column load, stale tasks, no-epic tasks.
 */

import { fetchTasksApi, fetchArchivedTasksApi, fetchEpicsApi, fetchColumnsApi } from './api.js';
import { getWeekNumber, escapeHtml } from './utils.js';
import { getCompletedDate } from './archive-page.js';

const STALE_DAYS = 14;

/**
 * Initialises the dashboard page inside the given container element.
 * @param {HTMLElement} pageViewEl
 */
export async function initDashboardPage(pageViewEl) {
    const toaster = document.querySelector('.js-toaster');

    pageViewEl.classList.add('--fullPage');
    pageViewEl.innerHTML = `
        <div class="dashboardPage">
            <h2 class="dashboardPage__title">Dashboard</h2>
            <div class="dashboardPage__stats js-dashStats"></div>
            <div class="dashboardPage__main">
                <div class="dashboardPage__left">
                    <div class="dashboardPage__section">
                        <div class="dashboardPage__sectionTitle">Epic Progress</div>
                        <div class="js-dashEpics"></div>
                    </div>
                    <div class="dashboardPage__section">
                        <div class="dashboardPage__sectionTitle">Column Load</div>
                        <div class="js-dashColumnLoad"></div>
                    </div>
                    <div class="dashboardPage__section dashboardPage__collapsible">
                        <button class="dashboardPage__collapseBtn js-dashStaleToggle" type="button">
                            <span class="js-dashStaleTitle">Stale tasks (&gt;${STALE_DAYS} days)</span>
                            <span class="dashboardPage__chevron js-dashStaleChevron">▼</span>
                        </button>
                        <div class="dashboardPage__collapseBody js-dashStaleBody" hidden></div>
                    </div>
                    <div class="dashboardPage__section dashboardPage__collapsible">
                        <button class="dashboardPage__collapseBtn js-dashNoEpicToggle" type="button">
                            <span class="js-dashNoEpicTitle">No Epic</span>
                            <span class="dashboardPage__chevron js-dashNoEpicChevron">▼</span>
                        </button>
                        <div class="dashboardPage__collapseBody js-dashNoEpicBody" hidden></div>
                    </div>
                </div>
                <div class="dashboardPage__right">
                    <div class="dashboardPage__deadlines js-dashDeadlines">
                        <div class="dashboardPage__sectionTitle">Deadlines</div>
                    </div>
                </div>
            </div>
        </div>
    `;

    let tasks, archivedTasks, epics, columns;
    try {
        [tasks, archivedTasks, epics, columns] = await Promise.all([
            fetchTasksApi(),
            fetchArchivedTasksApi(),
            fetchEpicsApi(),
            fetchColumnsApi()
        ]);
    } catch (err) {
        console.error('Dashboard page: failed to load data', err);
        if (toaster) toaster.error('Failed to load dashboard data');
        return;
    }

    const boardColumns = columns.filter(c => !c.isBacklog).sort((a, b) => a.order - b.order);
    const boardColumnIds = new Set(boardColumns.map(c => c.id));
    const boardTasks = tasks.filter(t => boardColumnIds.has(t.status));
    const epicMap = new Map(epics.map(e => [e.id, e]));

    renderStats(pageViewEl, boardTasks, archivedTasks);
    renderEpicProgress(pageViewEl, boardTasks, archivedTasks, epics, epicMap);
    renderDeadlines(pageViewEl, boardTasks, epicMap);
    renderColumnLoad(pageViewEl, boardTasks, boardColumns);
    renderStaleTasks(pageViewEl, boardTasks, epicMap);
    renderNoEpic(pageViewEl, boardTasks);

    // Collapsible toggles
    pageViewEl.addEventListener('click', (e) => {
        const staleBtn = e.target.closest('.js-dashStaleToggle');
        if (staleBtn) {
            const body = pageViewEl.querySelector('.js-dashStaleBody');
            const chevron = pageViewEl.querySelector('.js-dashStaleChevron');
            const isHidden = body.hasAttribute('hidden');
            if (isHidden) {
                body.removeAttribute('hidden');
                chevron.textContent = '▲';
            } else {
                body.setAttribute('hidden', '');
                chevron.textContent = '▼';
            }
            return;
        }
        const noEpicBtn = e.target.closest('.js-dashNoEpicToggle');
        if (noEpicBtn) {
            const body = pageViewEl.querySelector('.js-dashNoEpicBody');
            const chevron = pageViewEl.querySelector('.js-dashNoEpicChevron');
            const isHidden = body.hasAttribute('hidden');
            if (isHidden) {
                body.removeAttribute('hidden');
                chevron.textContent = '▲';
            } else {
                body.setAttribute('hidden', '');
                chevron.textContent = '▼';
            }
        }
    });
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function renderStats(pageViewEl, boardTasks, archivedTasks) {
    const now = new Date();
    const currentWeek = getWeekNumber(now);
    const currentYear = now.getFullYear();

    const activeCount = boardTasks.length;
    const priorityCount = boardTasks.filter(t => t.priority).length;

    const completedThisWeek = archivedTasks.filter(t => {
        const dateStr = getCompletedDate(t);
        if (!dateStr) return false;
        const d = new Date(dateStr);
        return getWeekNumber(d) === currentWeek && d.getFullYear() === currentYear;
    }).length;

    const overdueCount = boardTasks.filter(t => t.deadline && new Date(t.deadline) < now).length;

    const doneClass = completedThisWeek > 0 ? 'dashStat--positive' : '';
    const overdueClass = overdueCount > 0 ? 'dashStat--danger' : '';

    pageViewEl.querySelector('.js-dashStats').innerHTML = `
        <div class="dashStat">
            <span class="dashStat__value">${activeCount}</span>
            <span class="dashStat__label">Active Tasks</span>
        </div>
        <div class="dashStat">
            <span class="dashStat__value">${priorityCount}</span>
            <span class="dashStat__label">Priority</span>
        </div>
        <div class="dashStat ${doneClass}">
            <span class="dashStat__value">${completedThisWeek}</span>
            <span class="dashStat__label">Done This Week</span>
        </div>
        <div class="dashStat ${overdueClass}">
            <span class="dashStat__value">${overdueCount}</span>
            <span class="dashStat__label">Overdue</span>
        </div>
    `;
}

function renderEpicProgress(pageViewEl, boardTasks, archivedTasks, epics, epicMap) {
    const container = pageViewEl.querySelector('.js-dashEpics');

    if (epics.length === 0) {
        container.innerHTML = '<div class="dashboardPage__empty">No epics yet.</div>';
        return;
    }

    // Build counts per epic (O(n))
    const activeByEpic = new Map();
    const archivedByEpic = new Map();

    boardTasks.forEach(t => {
        if (!t.epicId) return;
        activeByEpic.set(t.epicId, (activeByEpic.get(t.epicId) || 0) + 1);
    });
    archivedTasks.forEach(t => {
        if (!t.epicId) return;
        archivedByEpic.set(t.epicId, (archivedByEpic.get(t.epicId) || 0) + 1);
    });

    const epicStats = epics
        .map(epic => {
            const active = activeByEpic.get(epic.id) || 0;
            const archived = archivedByEpic.get(epic.id) || 0;
            const total = active + archived;
            return { epic, active, archived, total };
        })
        .filter(s => s.total > 0)
        .sort((a, b) => b.total - a.total);

    if (epicStats.length === 0) {
        container.innerHTML = '<div class="dashboardPage__empty">No epic tasks yet.</div>';
        return;
    }

    container.innerHTML = epicStats.map(({ epic, active, archived, total }) => {
        const pct = Math.round((archived / total) * 100);
        return `
            <div class="dashEpicCard" style="border-left-color: ${escapeHtml(epic.color || '#9ca3af')}">
                <div class="dashEpicCard__name">${escapeHtml(epic.name)}</div>
                <div class="dashEpicCard__barTrack">
                    <div class="dashEpicCard__barFill" style="width: ${pct}%; background: ${escapeHtml(epic.color || '#9ca3af')}"></div>
                </div>
                <div class="dashEpicCard__meta">${pct}% complete &middot; ${active} active</div>
            </div>
        `;
    }).join('');
}

function renderDeadlines(pageViewEl, boardTasks, epicMap) {
    const container = pageViewEl.querySelector('.js-dashDeadlines');
    const now = new Date();
    const soon = new Date(now.getTime() + 48 * 3600000);
    const thisWeek = new Date(now.getTime() + 7 * 24 * 3600000);

    const withDeadlines = boardTasks
        .filter(t => t.deadline)
        .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

    if (withDeadlines.length === 0) {
        container.innerHTML += '<div class="dashboardPage__empty">No deadlines set.</div>';
        return;
    }

    const overdue = withDeadlines.filter(t => new Date(t.deadline) < now);
    const soonTasks = withDeadlines.filter(t => {
        const d = new Date(t.deadline);
        return d >= now && d <= soon;
    });
    const thisWeekTasks = withDeadlines.filter(t => {
        const d = new Date(t.deadline);
        return d > soon && d <= thisWeek;
    });

    const buildGroup = (tasks, cls, label) => {
        if (tasks.length === 0) return '';
        const items = tasks.map(t => {
            const epic = t.epicId ? epicMap.get(t.epicId) : null;
            const epicHtml = epic
                ? `<span class="dashDeadlineItem__epic" style="color: ${escapeHtml(epic.color || '#9ca3af')}">${escapeHtml(epic.name)}</span>`
                : '';
            const dateStr = new Date(t.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return `
                <div class="dashDeadlineItem">
                    <span class="dashDeadlineItem__title">${escapeHtml(t.title)}</span>
                    ${epicHtml}
                    <span class="dashDeadlineItem__date">${escapeHtml(dateStr)}</span>
                </div>
            `;
        }).join('');
        return `
            <div class="dashDeadlineGroup ${cls}">
                <span class="dashDeadlineGroup__label">${label}</span>
                ${items}
            </div>
        `;
    };

    container.innerHTML = `
        <div class="dashboardPage__sectionTitle">Deadlines</div>
        ${buildGroup(overdue, 'dashDeadlineGroup--overdue', 'Overdue')}
        ${buildGroup(soonTasks, 'dashDeadlineGroup--soon', 'Next 48h')}
        ${buildGroup(thisWeekTasks, 'dashDeadlineGroup--week', 'This week')}
    `;
}

function renderColumnLoad(pageViewEl, boardTasks, boardColumns) {
    const container = pageViewEl.querySelector('.js-dashColumnLoad');
    const totalBoardTasks = boardTasks.length;

    // Build count per column (O(n))
    const tasksByColumn = new Map(boardColumns.map(c => [c.id, 0]));
    boardTasks.forEach(t => {
        if (tasksByColumn.has(t.status)) {
            tasksByColumn.set(t.status, tasksByColumn.get(t.status) + 1);
        }
    });

    if (boardColumns.length === 0) {
        container.innerHTML = '<div class="dashboardPage__empty">No columns.</div>';
        return;
    }

    container.innerHTML = boardColumns.map(col => {
        const count = tasksByColumn.get(col.id) || 0;
        const pct = totalBoardTasks > 0 ? (count / totalBoardTasks) * 100 : 0;
        return `
            <div class="dashColLoad">
                <span class="dashColLoad__name">${escapeHtml(col.name)}</span>
                <div class="dashColLoad__barTrack">
                    <div class="dashColLoad__barFill" style="width: ${pct.toFixed(1)}%"></div>
                </div>
                <span class="dashColLoad__count">${count}</span>
            </div>
        `;
    }).join('');
}

function renderStaleTasks(pageViewEl, boardTasks, epicMap) {
    const titleEl = pageViewEl.querySelector('.js-dashStaleTitle');
    const body = pageViewEl.querySelector('.js-dashStaleBody');
    const now = new Date();
    const staleThresholdMs = STALE_DAYS * 24 * 3600000;

    const getLastActivityDate = (task) => {
        if (task.log && task.log.length > 0) {
            return task.log[task.log.length - 1].date || '';
        }
        return task.createdDate ? task.createdDate.split('T')[0] : '';
    };

    const staleTasks = boardTasks
        .filter(t => {
            const dateStr = getLastActivityDate(t);
            if (!dateStr) return false;
            return (now - new Date(dateStr)) > staleThresholdMs;
        })
        .sort((a, b) => new Date(getLastActivityDate(a)) - new Date(getLastActivityDate(b)));

    titleEl.textContent = `Stale tasks (>${STALE_DAYS} days) · ${staleTasks.length}`;

    if (staleTasks.length === 0) {
        body.innerHTML = '<div class="dashboardPage__empty" style="padding: 12px 16px;">No stale tasks.</div>';
        return;
    }

    body.innerHTML = `<div class="dashStaleList">` + staleTasks.map(t => {
        const epic = t.epicId ? epicMap.get(t.epicId) : null;
        const dateStr = getLastActivityDate(t);
        const daysAgo = dateStr
            ? Math.floor((now - new Date(dateStr)) / 86400000)
            : '?';
        const epicHtml = epic
            ? `<span class="dashStaleItem__epic" style="color: ${escapeHtml(epic.color || '#9ca3af')}">${escapeHtml(epic.name)}</span>`
            : '';
        return `
            <div class="dashStaleItem">
                <span class="dashStaleItem__title">${escapeHtml(t.title)}</span>
                ${epicHtml}
                <span class="dashStaleItem__age">${daysAgo}d ago</span>
            </div>
        `;
    }).join('') + `</div>`;
}

function renderNoEpic(pageViewEl, boardTasks) {
    const titleEl = pageViewEl.querySelector('.js-dashNoEpicTitle');
    const body = pageViewEl.querySelector('.js-dashNoEpicBody');

    const noEpicTasks = boardTasks.filter(t => !t.epicId);
    titleEl.textContent = `No Epic · ${noEpicTasks.length} task${noEpicTasks.length !== 1 ? 's' : ''}`;

    if (noEpicTasks.length === 0) {
        body.innerHTML = '<div class="dashboardPage__empty" style="padding: 12px 16px;">All tasks have an epic.</div>';
        return;
    }

    body.innerHTML = `<div class="dashNoEpicList">` + noEpicTasks.map(t => {
        const priorityHtml = t.priority
            ? `<span class="dashNoEpicItem__priority">Priority</span>`
            : '';
        return `
            <div class="dashNoEpicItem">
                <span class="dashNoEpicItem__title">${escapeHtml(t.title)}</span>
                ${priorityHtml}
            </div>
        `;
    }).join('') + `</div>`;
}
