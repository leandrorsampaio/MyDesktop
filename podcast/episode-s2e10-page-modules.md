# S2 Episode 10: Page Modules — Archive and Backlog

**Duration:** ~10 minutes
**Files to open:** `public/js/archive-page.js`, `public/js/backlog-page.js`, `public/components/archive-row/archive-row.js`, `public/components/list-header/list-header.js`
**Style:** Code walkthrough

---

Welcome back. Today we're looking at how your sub-pages work — specifically the archive and backlog pages. These are full-page modules that replace the kanban board when the user navigates to them. They showcase a different pattern from the board: list-based layouts with sortable columns, reusable row components, and dynamic imports.

## The Page Module Pattern

Both archive and backlog follow the same structure:

1. Export an `init` function that receives the page container
2. Fetch data in parallel
3. Build the page layout with innerHTML
4. Create and configure `<list-header>` for column headers
5. Render rows using dedicated row components
6. Listen for events from rows (restore, edit, promote)

This is NOT a Web Component. It's a regular JavaScript module that renders into a provided container. Why not a component? Because pages are singletons — there's only ever one archive page. Components are reusable. Pages aren't. Using a plain module with an init function is simpler.

## archive-page.js: The Complete Page

Open `public/js/archive-page.js`. Let's go section by section.

**Utility functions at the top (lines 13-74):**

`getCompletedDate(task)` (around line 13) extracts the completion date from a task's log. It looks for the last log entry that mentions "Moved" to the done column, or falls back to the task's `createdDate`. This is exported because the dashboard page also uses it.

```javascript
export function getCompletedDate(task) {
    if (!task.log || task.log.length === 0) return task.createdDate;
    // Find last "Moved to Done" or similar entry
    const moveEntry = [...task.log].reverse().find(entry =>
        entry.action.startsWith('Moved')
    );
    return moveEntry ? moveEntry.date : task.log[task.log.length - 1].date;
}
```

Notice `[...task.log].reverse()` — it creates a copy before reversing. `reverse()` mutates the original array. Without the spread copy, you'd be reversing the actual log array in the task object. That's a subtle bug: next time you look at the log, it's in the wrong order. Creating a copy first protects the original data.

`sortTasks()` (around line 31) is a comparator function for `Array.sort()`. It handles all four sortable columns: title, epicName, categoryName, and completedDate.

```javascript
export function sortTasks(a, b, field, direction, epicMap, categoryMap) {
    let valA, valB;

    if (field === 'title') {
        valA = a.title.toLowerCase();
        valB = b.title.toLowerCase();
    } else if (field === 'epicName') {
        valA = epicMap.get(a.epicId)?.name?.toLowerCase() ?? '';
        valB = epicMap.get(b.epicId)?.name?.toLowerCase() ?? '';
    }
    // ...

    // Nulls-last sorting
    if (!valA && valB) return 1;
    if (valA && !valB) return -1;
    if (!valA && !valB) return 0;

    const cmp = valA < valB ? -1 : valA > valB ? 1 : 0;
    return direction === 'asc' ? cmp : -cmp;
}
```

Two things worth noting here:

**Nulls-last logic**: Tasks without an epic should appear at the bottom, not the top. Without this, empty strings sort before "A" in ascending order. The explicit null checks push empty values to the end regardless of sort direction.

**The `??` (nullish coalescing) operator**: `epicMap.get(a.epicId)?.name?.toLowerCase() ?? ''` — if any step in the chain is null or undefined, `??` provides the fallback value (empty string). It's different from `||` — the logical OR would also trigger for `0` or `false`, but `??` only triggers for `null`/`undefined`.

**`initArchivePage()` (around line 80):**

This is the main function. It receives the page container element.

```javascript
export async function initArchivePage(pageViewEl) {
    pageViewEl.classList.add('pageView--fullPage');
```

First thing: add `--fullPage` class for full-width layout. The default page view has centered, padded content. Archive needs edge-to-edge.

**Lines 99-103: Parallel data fetching**

```javascript
const [archivedTasks, epicsData, categoriesData] = await Promise.all([
    fetchArchivedTasksApi(),
    fetchEpicsApi(),
    fetchCategoriesApi()
]);
```

Three requests, simultaneously. The page can't render without all three, so `Promise.all` is perfect. If any fails, the error propagates.

**Lines 105-112: Build lookup Maps**

```javascript
const epicMap = new Map(epicsData.map(e => [e.id, e]));
const categoryMap = new Map(categoriesData.map(c => [c.id, c]));
```

Pre-build Maps for O(1) lookups when rendering rows. With potentially hundreds of archived tasks, each needing epic and category data, the Map avoids thousands of array scans.

**Lines 114-130: Page layout and list-header configuration**

The function builds the page HTML with template literals:

```javascript
pageViewEl.innerHTML = `
    <div class="archivePage">
        <div class="archivePage__header">
            <h2>Archived Tasks</h2>
            <span class="archivePage__count js-archiveCount"></span>
        </div>
        <list-header class="js-listHeader"></list-header>
        <div class="archivePage__list js-archiveList"></div>
    </div>
`;
```

Then it configures the list-header component:

```javascript
const listHeader = pageViewEl.querySelector('.js-listHeader');
listHeader.setColumns([
    { id: 'title', label: 'Task', sortable: true },
    { id: 'epicName', label: 'Epic', sortable: true },
    { id: 'categoryName', label: 'Category', sortable: true },
    { id: 'completedDate', label: 'Completed', sortable: true },
    { id: 'actions', label: '', sortable: false }
]);
listHeader.setSort('completedDate', 'desc');
```

This is a nice declarative API. You tell the header component what columns to show and which are sortable. The component handles click interactions and dispatches `sort-change` events.

**The render and event closure pattern (lines 132-170ish):**

```javascript
let currentSort = { field: 'completedDate', direction: 'desc' };

function renderRows() {
    const sorted = [...archivedTasks].sort((a, b) =>
        sortTasks(a, b, currentSort.field, currentSort.direction, epicMap, categoryMap)
    );
    const list = pageViewEl.querySelector('.js-archiveList');
    list.innerHTML = '';

    sorted.forEach(task => {
        const row = document.createElement('archive-row');
        const epic = epicMap.get(task.epicId);
        const cat = categoryMap.get(task.category);
        row.setTask(task, {
            epicName: epic?.name || '',
            epicColor: epic?.color || '',
            categoryName: cat?.name || 'Unknown',
            categoryIcon: cat?.icon || 'close'
        });
        list.appendChild(row);
    });

    updateCount();
}
```

Notice: `renderRows` is defined inside `initArchivePage`. It's a **closure** that captures `archivedTasks`, `epicMap`, `categoryMap`, `currentSort` from the outer scope. It doesn't need these as parameters — it reads them from the enclosing function's scope.

**Event listeners:**

```javascript
listHeader.addEventListener('sort-change', (e) => {
    currentSort = { field: e.detail.field, direction: e.detail.direction };
    renderRows();
});

pageViewEl.addEventListener('restore-task', async (e) => {
    const { taskId } = e.detail;
    await restoreArchivedTaskApi(taskId);
    archivedTasks = archivedTasks.filter(t => t.id !== taskId);
    renderRows();
    elements.toaster.success('Task restored to board');
});
```

Sort change: update the sort state, re-render. Restore: call the API, remove from local array, re-render, show toast.

The restore event bubbles up from the `<archive-row>` component through the Shadow DOM (because it's composed). The page-level listener catches it. Same pattern as the kanban board catching `task-dropped` events from columns.

## list-header.js: An Inline Component

Open `public/components/list-header/list-header.js`. This is an **inline component** — no separate `.html` or `.css` files. Everything is in the JavaScript.

It's inline because the template is small and dynamic — the columns are defined at runtime via `setColumns()`. Fetching a template file would add unnecessary complexity.

**`_render()` (around line 38):**

This method builds the entire Shadow DOM from scratch:

```javascript
_render() {
    const style = `
        <style>
            :host { display: block; }
            .header { display: flex; /* ... */ }
            .header__col { /* ... */ }
            .header__col.--sortable { cursor: pointer; }
            .header__col.--active { color: var(--color-accent-primary); }
            /* Column widths from CSS custom properties */
            .header__col[data-col="title"] { flex: 1; min-width: var(--archive-col-title, 200px); }
            .header__col[data-col="epicName"] { width: var(--archive-col-epic, 120px); }
            /* ... more columns */
        </style>
    `;

    const cols = this._columns.map(col => `
        <div class="header__col ${col.sortable ? '--sortable' : ''} ${this._isActive(col.id) ? '--active' : ''}"
             data-col="${col.id}">
            ${col.label}
            ${this._getSortArrow(col.id)}
        </div>
    `).join('');

    this.shadowRoot.innerHTML = `${style}<div class="header">${cols}</div>`;

    // Wire click handlers
    this.shadowRoot.querySelectorAll('.--sortable').forEach(el => {
        el.addEventListener('click', () => this._handleColClick(el.dataset.col));
    });
}
```

The CSS uses custom properties for column widths — `var(--archive-col-title, 200px)`. These properties are defined on `:root` in `styles.css` and inherited through Shadow DOM. The same properties are read by `<archive-row>` and `<backlog-row>` components. This is how column widths stay synchronized between the header and the rows — they all read the same CSS custom properties.

**`_handleColClick()` (around line 137):**

```javascript
_handleColClick(colId) {
    if (this._sort.field === colId) {
        this._sort.direction = this._sort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        this._sort = { field: colId, direction: 'asc' };
    }
    this._render();
    this.dispatchEvent(new CustomEvent('sort-change', {
        bubbles: true, composed: true,
        detail: { field: this._sort.field, direction: this._sort.direction }
    }));
}
```

Click on same column: toggle direction. Click on different column: switch to it, default ascending. Re-render to update the arrow, dispatch the event. The page module catches it and re-sorts.

## backlog-page.js: Reusing Patterns

Open `public/js/backlog-page.js`. It follows the same pattern as archive but with differences:

- Uses `<backlog-row>` instead of `<archive-row>`
- Shows `createdDate` instead of `completedDate`
- Has Edit and Promote buttons instead of Restore
- Has a FAB (floating action button) for adding new backlog tasks
- Populates centralized state (so the edit modal can access data)

**The FAB (Floating Action Button):**

```javascript
const fab = document.createElement('button');
fab.className = 'backlogPage__fab js-backlogFab';
fab.textContent = '+ Add Task';
fab.addEventListener('click', () => {
    openAddTaskModal(elements, /* ... */);
});
pageViewEl.appendChild(fab);
```

Positioned with CSS `position: fixed; bottom: 32px; left: 32px`. It floats above the content, always accessible. This is a common mobile UI pattern (Material Design popularized it) adapted for desktop.

**The promote handler:**

```javascript
pageViewEl.addEventListener('backlog-promote', async (e) => {
    const { taskId } = e.detail;
    const firstBoardColumn = columns.find(c => !c.isBacklog);
    await moveTaskApi(taskId, firstBoardColumn.id, 0);
    // ... re-render
});
```

Promoting a backlog task moves it to the first non-backlog board column at position 0 (top). The `columns.find(c => !c.isBacklog)` filters out the backlog column itself.

**Edit reuse:**

```javascript
pageViewEl.addEventListener('backlog-edit', (e) => {
    const { taskId } = e.detail;
    openEditModal(taskId, elements, /* ... */);
});
```

The backlog page reuses the same `openEditModal` from `modals.js`. It works because `initBacklogPage` populated the centralized state with `setTasks()`, `setColumns()`, etc. The edit modal reads from state, not from a local variable. This is a benefit of centralized state.

## The Key Pattern

Sub-pages follow a lifecycle:

1. **Init** — called once when the page loads
2. **Fetch** — parallel API calls
3. **Layout** — innerHTML for the page structure
4. **Wire** — configure components, attach listeners
5. **Render** — create row elements from data
6. **React** — event listeners handle sort, restore, edit, promote

Each step is clear and sequential. There's no hidden state machine, no component tree to manage. Just a function that sets up a page.

## Key Takeaway

Page modules demonstrate that not everything needs to be a component. The `init` function pattern — fetch, layout, wire, render — is a clean alternative for singleton pages. Reusable row components (`<archive-row>`, `<backlog-row>`) handle the repetitive parts, while the page module orchestrates the whole. CSS custom properties synchronize column widths across independent Shadow DOM boundaries.

Next episode, we're looking at the inline components — `<custom-picker>` and `<svg-icon>` — and the interesting patterns they use.

---

*Next: S2E11 — "Inline Components: Custom Picker and SVG Icon"*
