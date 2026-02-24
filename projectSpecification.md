# Task Tracker - Project Specification Document

**Version:** 2.27.0
**Last Updated:** 2026-02-24

---

## Documentation Maintenance

This document describes the **current** state of the project. Always edit it to reflect reality when features change.

- **New version shipped:** add a row to `CHANGELOG.md` + bump the version header above.
- **Feature changed:** update the relevant section here directly — no changenotes in body text.
- **CSS/visual work:** see `design-system.md` for colors, typography, and breakpoints.

---

## Quick Context

**Stack:** Vanilla JS + Web Components (Shadow DOM) + Node.js/Express. No framework, no build step.
**Port:** 3001. **Data:** JSON files in `data/{alias}/`. No auth. Single user, local only.
**CSS:** BEM camelCase (`.blockName__elementName` / `.--modifier` / `.js-hook`). No IDs.

**Never:** `confirm()`, `alert()`, `window.fn`, inline `onclick`/`onblur`, `console.log`.
**Always:** `<modal-dialog>` for confirmations, `elements.toaster.*` for all user feedback, optimistic UI + rollback for every task operation.
**Shared client code lives in** `constants.js`, `utils.js`, `state.js` — never duplicate across files.
**Every component:** Shadow DOM, `static templateCache`, `disconnectedCallback` for any document-level listeners or timers.

---

## Project Overview

A local web-based kanban task tracker used as a browser homepage. Features: drag-and-drop board, task categories, epics, daily checklist, notes, report generation, privacy blur, crisis mode, and multiple profiles with separate data.

---

## Technical Stack & File Structure

- **Frontend:** HTML5, Vanilla CSS, Vanilla JS — ES modules, no build step
- **Backend:** Node.js + Express, port 3001
- **Data:** JSON files in `./data/{profileAlias}/` (profile-scoped); `./data/profiles.json` (global)
- **No external CSS/JS libraries**

```
/
├── server.js
├── CHANGELOG.md
├── projectSpecification.md        # This file
├── design-system.md
├── data/
│   ├── profiles.json
│   └── {alias}/
│       ├── tasks.json
│       ├── archived-tasks.json
│       ├── reports.json
│       ├── notes.json
│       ├── epics.json
│       └── categories.json
├── tests/
│   ├── unit/                      # utils.test.js, validation.test.js
│   └── api/                       # tasks, notes, reports, rate-limit
└── public/
    ├── index.html
    ├── app.js                     # Main entry — wires everything
    ├── styles.css
    ├── js/
    │   ├── constants.js           # All shared constants
    │   ├── utils.js               # escapeHtml, getWeekNumber, formatDate, toCamelCase
    │   ├── state.js               # Centralized state + optimistic UI helpers
    │   ├── api.js                 # Pure HTTP functions, no side effects
    │   ├── filters.js             # Category, priority, epic filter logic
    │   ├── crisis-mode.js
    │   ├── modals.js              # All modal logic
    │   └── board-config.js        # Board Configuration modal (column CRUD + drag-to-reorder)
    └── components/
        ├── button/
        ├── task-card/
        ├── modal-dialog/
        ├── daily-checklist/
        ├── notes-widget/
        ├── kanban-column/
        ├── custom-picker/         # Inline component (no .html/.css)
        ├── svg-icon/              # Inline component (no .html/.css)
        └── toast-notification/
```

**Component loading:** Each component's `.js` fetches its own `.html`/`.css` at runtime and injects them into Shadow DOM. Inline components (e.g., `svg-icon`, `custom-picker`) define HTML/CSS directly in JS to avoid extra requests.

**Server start:**
```bash
node server.js          # http://localhost:3001
PORT=4000 node server.js
```

**Tests** (vanilla `node:test`, no external packages):
```bash
npm test          # all (API tests require server running)
npm run test:unit # unit only
npm run test:api  # API only
```

---

## API Endpoints

### Profile Management (global)
```
GET    /api/profiles             - Get all profiles
GET    /api/profiles/default     - Get the default profile
POST   /api/profiles             - Create profile (body: { name, color, letters })
PUT    /api/profiles/:id         - Update profile (body: { name?, color?, letters?, isDefault? })
DELETE /api/profiles/:id         - Delete profile (removes data directory)
```

### Profile-Scoped (`:profile` = alias)
```
GET    /api/:profile/tasks               - Get all active tasks
POST   /api/:profile/tasks               - Create task (body: { title, description, priority, category })
PUT    /api/:profile/tasks/:id           - Update task
DELETE /api/:profile/tasks/:id           - Delete task permanently
POST   /api/:profile/tasks/:id/move      - Move/reorder (body: { newStatus, newPosition })
POST   /api/:profile/tasks/archive       - Archive all done tasks
POST   /api/:profile/reports/generate    - Generate report snapshot
GET    /api/:profile/archived            - Get archived tasks
GET    /api/:profile/reports             - Get all reports
GET    /api/:profile/reports/:id         - Get report by ID
PUT    /api/:profile/reports/:id         - Update report title (body: { title })
DELETE /api/:profile/reports/:id         - Delete report
GET    /api/:profile/notes               - Get notes ({ content: string })
POST   /api/:profile/notes               - Save notes (body: { content })
GET    /api/:profile/categories          - Get all categories
POST   /api/:profile/categories          - Create category (body: { name, icon })
PUT    /api/:profile/categories/:id      - Update category (body: { name?, icon? })
DELETE /api/:profile/categories/:id      - Delete category (reassigns tasks to category 1)
GET    /api/:profile/epics               - Get all epics
POST   /api/:profile/epics               - Create epic (body: { name, color })
PUT    /api/:profile/epics/:id           - Update epic (body: { name?, color? })
DELETE /api/:profile/epics/:id           - Delete epic (removes epicId from all tasks)
GET    /api/:profile/columns             - Get all columns (sorted by order)
POST   /api/:profile/columns             - Create column (body: { name }); max 15
PUT    /api/:profile/columns/:id         - Update column (body: { name?, hasArchive? })
PUT    /api/:profile/columns             - Reorder all columns (body: { columns: [...] })
DELETE /api/:profile/columns/:id         - Delete column; tasks moved to first column with log entry
```

### SPA Routing
```
GET    /           - Redirect to default profile alias
GET    /:alias     - Serve index.html if profile exists, else redirect
```

---

## Data Models

### Task Object
```javascript
{
  id: string,          // Date.now().toString(36) + random
  title: string,       // Required, max 200 chars
  description: string, // Optional, default ""
  priority: boolean,   // default false
  category: number,    // Category ID (integer), default 1
  epicId: string|null, // Epic ID or null
  status: string,      // Column ID (e.g. "todo", "done", or user-created IDs)
  position: number,    // 0-based index within column
  log: array,          // [{ date: "YYYY-MM-DD", action: string }]
  createdDate: string  // ISO 8601
}
```

**What gets logged:** moving between columns (`"Moved from 'To Do' to 'In Progress'"`), category changes (`"Category changed from X to Y"`), column deletion (`"Column 'Wait' deleted – moved to 'To Do'"`).
**Not logged:** title/description/priority edits, epic changes, reordering within same column.

### Epic Object
```javascript
{
  id: string,     // timestamp-based
  name: string,   // required, max 200 chars
  color: string,  // hex from the 20-color palette (must be unique per profile)
  alias: string   // auto-computed camelCase of name — never set manually
}
```

**20 predefined colors:** Ruby Red (#E74C3C), Coral (#FF6F61), Tangerine (#E67E22), Amber (#F5A623), Sunflower (#F1C40F), Lime (#A8D84E), Emerald (#2ECC71), Jade (#00B894), Teal (#1ABC9C), Cyan (#00CEC9), Sky Blue (#54A0FF), Ocean (#2E86DE), Royal Blue (#3742FA), Indigo (#5758BB), Purple (#8E44AD), Orchid (#B24BDB), Magenta (#E84393), Rose (#FD79A8), Slate (#636E72), Charcoal (#2D3436).

### Category Object
```javascript
{
  id: number,   // auto-incrementing integer (1 = "Non categorized")
  name: string, // required, max 200 chars
  icon: string  // svg-icon name (e.g., "star", "edit")
}
```

**Constraints:** max 20 per profile. Category 1 cannot be deleted (only renamed/re-iconed). Multiple categories may share an icon. Auto-created with 6 defaults on first access.

**Defaults:**

| ID | Name            | Icon   |
|----|-----------------|--------|
| 1  | Non categorized | close  |
| 2  | Development     | edit   |
| 3  | Communication   | newTab |
| 4  | To Remember     | star   |
| 5  | Planning        | plus   |
| 6  | Generic Task    | close  |

### Profile Object
```javascript
{
  id: string,
  name: string,      // required, max 200 chars
  color: string,     // hex from 20-color palette (unique per profile)
  letters: string,   // 1–3 uppercase letters (unique per profile)
  alias: string,     // auto-computed camelCase — used as folder name + URL segment
  isDefault: boolean,// exactly one must be true at all times
  columns: Array     // see Column Object below; stored inline on each profile
}
```

**Constraints:** max 20 profiles. Cannot delete the last profile. Alias must be unique. On first run, existing data migrates to a "Work" profile; fresh installs get "User1". Profiles without a `columns` field are auto-migrated to `DEFAULT_COLUMNS` on first request.

### Column Object
```javascript
{
  id: string,         // auto-generated (default IDs: "todo", "wait", "inprogress", "done")
  name: string,       // required, max 200 chars
  order: number,      // 0-based sort index
  hasArchive: boolean // if true, column gets an Archive button
}
```

**Constraints:** max 15 columns per profile; min 1 (cannot delete last). First column (order 0) is the default — new tasks are created there; deleted-column tasks move there. Column IDs for the 4 default columns match legacy `task.status` values for zero-migration compatibility. Stored inside `profiles.json` (not a separate file).

### Notes
```javascript
{ content: string }  // plain text, stored in notes.json
```

### Report Object
```javascript
{
  id: string,
  title: string,         // default: "Week N (Mon DD-DD)", user-editable
  generatedDate: string, // ISO datetime
  weekNumber: number,
  dateRange: string,
  content: {
    // NEW format (v2.26+): one entry per column in order
    columns: [{ columnId, columnName, tasks }],

    // LEGACY format (pre-v2.26): kept for backward compat
    archived: [],
    inProgress: [],
    waiting: [],
    todo: []
  },
  notes: string          // copy of notes at generation time
}
```

Each task in report content: `{ id, title, description, category, categoryName, epicId }`.
`renderReportView` detects which format is present (`content.columns` array vs legacy keys) and renders accordingly.

---

## Non-obvious Behaviors

These are behaviors not evident from reading the code. Know these before making changes.

### Tasks & Board
- **Positions are server-managed:** on every move or reorder, the server recalculates positions for all tasks in the affected column. Frontend sorts by `position` field on render.
- **Drag cross-column** changes `status` and appends a log entry. **Drag within column** reorders `position` only — no log entry.
- **`applyAllFilters()`** uses AND logic across active filters: cards must match ANY active category AND the priority filter AND the selected epic. Queries through `kanban-column` shadow roots to reach `task-card` elements. All filter state is in-memory — resets on page reload.

### Categories
- **Category 1 cannot be deleted.** Deleting any other category reassigns its active tasks to category 1. Archived tasks are untouched.
- **`categoryName` is snapshotted** onto each task at archive time, so reports show the correct name even if the category is later deleted.
- **Category badge is hidden** when `category === 1` (Non categorized).
- **Category log entries** (`"Category changed from X to Y"`) are generated **server-side** in the PUT handler — the frontend does not construct them. Names are resolved via Map lookup from `categories.json`.

### Epics
- `alias` is auto-computed as camelCase of the name — never set or stored manually.
- Deleting an epic sets `epicId = null` on all tasks referencing it.
- Epic changes do **not** create log entries on tasks.

### Profiles
- Exactly one profile must have `isDefault: true`. Setting `isDefault: true` on one automatically clears all others.
- Deleting the default profile transfers `isDefault` to the first remaining profile.
- Profile `alias` is used as both the **data folder name** (`data/{alias}/`) and the **URL segment** (`/{alias}`).
- localStorage keys are profile-scoped: `{alias}:checklistConfig`, `{alias}:recurrentTasksChecked`, `{alias}:showDailyChecklist`, `{alias}:showNotes`.

### Columns & Board Configuration
- Columns are **per-profile**, stored inside each profile object in `profiles.json` (not a separate file).
- The **first column** (order 0) is the default: new tasks are created there; tasks are moved there when a column is deleted.
- Column deletion appends a log entry to each moved task: `"Column 'Wait' deleted – moved to 'To Do'"`.
- Renaming a column does **not** change `task.status` (the column ID is immutable after creation). Existing task logs remain accurate.
- The default four column IDs (`todo`, `wait`, `inprogress`, `done`) intentionally match legacy `task.status` values — no data migration needed for existing tasks.
- `task.status` now equals a **column ID** (any string), not one of four hardcoded values.
- Profiles without a `columns` field are auto-migrated to `DEFAULT_COLUMNS` by `resolveProfile` middleware on first request.
- `app.js` calls `initKanban(columns)` to create `<kanban-column>` elements dynamically. The first column gets the Add Task button; columns with `hasArchive: true` get an Archive button (both are slotted light DOM, event-delegated from `.kanban`).

### Reports & Archive (independent operations)
- **Report generation** (`Hamburger → Generate Report`) snapshots all columns in order + notes. Does **not** move, archive, or delete any tasks.
- **Archive** (`Archive` button on a column with `hasArchive: true`) moves all tasks in that specific column to `archived-tasks.json`. Accepts a `columnId` in the body; falls back to the first `hasArchive: true` column. Does **not** generate a report.

### General Configuration
- Accessed via Hamburger → General Configuration; opens a small modal with checkbox toggles.
- Settings are **profile-scoped** and persisted in `localStorage` under `{alias}:showDailyChecklist` and `{alias}:showNotes` (string `"true"` / `"false"`).
- Default is **visible** (true) when the key is not yet set — checked via `value !== 'false'`.
- `loadGeneralConfig()` in `app.js` applies visibility by toggling `.--hidden` on the `<daily-checklist>` and `<notes-widget>` elements; it is called once during `init()` (after `setActiveProfile`) and again after saving the modal.
- No server calls — purely client-side. Nothing is deleted from the data layer.

### Crisis Mode & Privacy Toggle
- Both are purely client-side CSS toggles — no server calls, no persistence.
- Crisis Mode reuses `applyAllFilters()` to activate the priority filter; it does not duplicate filter logic.

### Checklist
- Resets daily at 6:00 AM by comparing `localStorage.lastRecurrentReset` to today's 6 AM timestamp.

### Server duplication
- `server.js` has its own copies of `getWeekNumber` and `toCamelCase` because it cannot import ES modules from `/public`. Each copy must carry a JSDoc comment:
  ```javascript
  /** Source of truth: /public/js/utils.js — duplicated here because
   *  server.js cannot import ES modules from /public. */
  ```

---

## Component APIs

### `<svg-icon>`
```html
<svg-icon icon="star" size="16"></svg-icon>
```
- `icon` — required; key in the `SVGIcons` map inside `svg-icon.js`
- `size` — px, default 24; sets both width and height
- Uses `currentColor` — inherits parent text color automatically
- `SvgIcon.availableIcons` — static array of all icon names; used to populate icon pickers
- **To add an icon:** add one entry to the `SVGIcons` object in `svg-icon.js`

### `<custom-picker>`
```html
<custom-picker type="color" placeholder="Select color" columns="5"></custom-picker>
<custom-picker type="icon" placeholder="Select icon" columns="7"></custom-picker>
<custom-picker type="list" placeholder="Choose an epic" size="compact"></custom-picker>
```
- **Attributes:** `type` (`color`|`icon`|`list`), `placeholder`, `columns` (grid modes, default 5), `size="compact"` (toolbar use)
- **JS API:** `setItems([{value, label, color?, disabled?}])`, `picker.value` (get/set), `picker.clear()`
- **Event:** `change` → `CustomEvent({ detail: { value, label } })`, bubbles + composed
- **Used in:** epic/profile color pickers (`type="color" columns="5"`), category icon picker (`type="icon" columns="7"`), epic filter + task modal epic field (`type="list"`)

### `<modal-dialog>`
```html
<modal-dialog class="js-myModal" size="large">
    <span slot="title">Title</span>
    <div>Content</div>
</modal-dialog>
```
- Open/close: `element.open()` / `element.close()`
- `size`: `"large"`, `"small"`, or omit for default
- Handles close button, backdrop click, and ESC key internally
- **Never** open/close by toggling classes directly

### `<toast-notification>`
```javascript
elements.toaster.success('msg')  // green
elements.toaster.error('msg')    // red
elements.toaster.warning('msg')  // yellow
elements.toaster.info('msg')     // beige
```
- Single instance in `index.html`: `<toast-notification class="js-toaster">`
- Auto-dismisses after 4s; stacks multiple toasts; has close button

---

## Modals Reference

| JS hook                          | Purpose                          | Size    | Trigger                                    |
|----------------------------------|----------------------------------|---------|--------------------------------------------|
| `.js-taskModal`                  | Add / Edit task                  | default | [+ Add Task] / [Edit] on card              |
| `.js-reportsModal`               | View reports                     | large   | Hamburger → View Reports                   |
| `.js-archivedModal`              | View archived tasks              | large   | Hamburger → All Completed Tasks            |
| `.js-confirmModal`               | Delete task confirmation         | small   | Delete button in edit modal                |
| `.js-categoriesModal`            | Manage categories CRUD           | large   | Hamburger → Manage Categories              |
| `.js-categoryConfirmModal`       | Category delete confirmation     | small   | Delete in categories modal                 |
| `.js-epicsModal`                 | Manage epics CRUD                | large   | Hamburger → Manage Epics                   |
| `.js-epicConfirmModal`           | Epic delete confirmation         | small   | Delete in epics modal                      |
| `.js-profilesModal`              | Manage profiles CRUD             | large   | Hamburger → Manage Profiles                |
| `.js-profileConfirmModal`        | Profile delete confirmation      | small   | Delete in profiles modal                   |
| `.js-checklistModal`             | Edit daily checklist             | large   | Hamburger → Edit Daily Checklist           |
| `.js-generateReportConfirmModal` | Generate report confirmation     | small   | Hamburger → Generate Report                |
| `.js-boardConfigModal`           | Column CRUD + drag-to-reorder    | large   | Hamburger → Board Configuration            |
| `.js-columnConfirmModal`         | Column delete confirmation       | small   | Delete in board config modal               |
| `.js-generalConfigModal`         | Sidebar visibility toggles       | small   | Hamburger → General Configuration         |

---

## Code Rules

Read these before writing any code. They capture every recurring mistake.

### Pre-flight Checklist
- [ ] No `alert()` or `confirm()` — use `<modal-dialog>` or `elements.toaster.*`
- [ ] No `window.functionName` exports
- [ ] No inline `onclick`, `onblur`, etc. in generated HTML
- [ ] No `console.log` (except behind a `DEBUG` flag)
- [ ] No deprecated APIs (`substr` → `substring`, etc.)
- [ ] No duplicate constants or utility functions — import from `constants.js` / `utils.js`
- [ ] All modals use `<modal-dialog>` component with `.open()` / `.close()`
- [ ] All task operations use optimistic UI pattern with rollback
- [ ] Components with document-level listeners or timers have `disconnectedCallback`
- [ ] Rapid async operations use a lock (`isMoving` pattern)
- [ ] New server-side duplications of client utils have the JSDoc "Source of truth" comment
- [ ] CSS selectors target actual DOM elements, not Shadow DOM internals
- [ ] New components cache templates in `static templateCache`

---

### Rule 1: No `confirm()` / `alert()`

Use `<modal-dialog>` for confirmations. Pattern:
1. Declare a `<modal-dialog>` in `index.html` with cancel/action buttons and a `js-` message element
2. Store context in a module-level variable (`let pendingDelete = null`)
3. Open the modal, set its message via `textContent`
4. Action button executes the operation and clears pending state
5. Cancel button closes modal and clears pending state

---

### Rule 2: No `window` functions or inline handlers

```javascript
// WRONG
window.myFn = () => {};
`<button onclick="window.myFn('${id}')">...</button>`

// CORRECT
container.innerHTML = `<button class="js-actionBtn" data-id="${id}">...</button>`;
container.querySelector('.js-actionBtn').addEventListener('click', e => {
    doSomething(e.target.dataset.id);
});
```

---

### Rule 3: No code duplication

- Constants: define once in `constants.js`, import everywhere. If `server.js` needs the same value, add a comment: `// Source of truth: /public/js/constants.js`
- Utilities: define once in `utils.js`, import everywhere. If `server.js` needs a copy, add the JSDoc comment.
- Never copy-paste helper functions between modules.

---

### Rule 4: Use Map lookups in loops

```javascript
// WRONG — O(n * m)
tasks.forEach(task => {
    const epic = epics.find(e => e.id === task.epicId);
});

// CORRECT — O(n + m)
const epicMap = new Map(epics.map(e => [e.id, e]));
tasks.forEach(task => {
    const epic = epicMap.get(task.epicId);
});
```

---

### Rule 5: Shadow DOM awareness

```javascript
// WRONG — won't find cards inside shadow roots
document.querySelectorAll('task-card')

// CORRECT
const cards = Array.from(document.querySelectorAll('kanban-column'))
    .flatMap(col => Array.from(col.shadowRoot?.querySelectorAll('task-card') || []));
```

```css
/* WRONG — targets Shadow DOM internals */
body.--crisisMode .column[data-status="done"] { }

/* CORRECT — target the custom element */
body.--crisisMode kanban-column[data-status="done"] { visibility: hidden; }
```

---

### Rule 6: Optimistic UI pattern

All task operations (create, update, delete, move) must update the UI immediately and roll back on failure:

```javascript
async function performAction(id) {
    const snapshot = createTasksSnapshot();        // 1. save state
    updateTaskInState(id, { /* changes */ });
    renderAllColumns();                            // 2. update UI immediately

    try {
        await apiFunction(id, { /* data */ });     // 3. API call
    } catch {
        restoreTasksFromSnapshot(snapshot);        // 4. rollback
        renderAllColumns();
        elements.toaster.error('Operation failed. Changes reverted.');
    }
}
```

`state.js` helpers: `createTasksSnapshot()`, `restoreTasksFromSnapshot(snapshot)`, `replaceTask(oldId, newTask)`, `generateTempId()`.

---

### Rule 7: Race condition locks

For async operations triggerable rapidly (e.g., drag-and-drop), use a module-level lock:

```javascript
let isMoving = false;

async function moveTask(...) {
    if (isMoving) return;
    isMoving = true;
    try {
        // ...
    } finally {
        isMoving = false;  // always release
    }
}
```

---

### Rule 8: Component patterns

Every component must:
1. Live in `/public/components/{name}/` with `.js` + `.html` + `.css` (or `.js`-only for inline components)
2. Use Shadow DOM
3. Cache templates with `static templateCache` to avoid repeated fetches
4. Implement `disconnectedCallback()` to remove document-level listeners and clear timers

```javascript
class MyComponent extends HTMLElement {
    static templateCache = null;

    constructor() {
        super();
        this._boundHandler = this._onKey.bind(this);
    }

    async connectedCallback() {
        if (!MyComponent.templateCache) {
            MyComponent.templateCache = await Promise.all([
                fetch('/components/my-component/my-component.html').then(r => r.text()),
                fetch('/components/my-component/my-component.css').then(r => r.text()),
            ]);
        }
        const [html, css] = MyComponent.templateCache;
        // build shadow DOM...
        document.addEventListener('keydown', this._boundHandler);
    }

    disconnectedCallback() {
        document.removeEventListener('keydown', this._boundHandler);
    }
}
```

Not everything needs a Web Component. Editor UIs rendered inside a `<modal-dialog>` (checklists, epics editor) should render HTML directly into a container and use `js-` hook delegation — not a new component.

---

### Rule 9: Server-side validation

All endpoints validate input. Validation constants in `server.js`:

| Field | Rule |
|-------|------|
| `title` | Required on create, string, max 200 chars |
| `description` | Optional, string, max 2000 chars |
| `category` | Optional integer, must exist in profile's `categories.json` |
| `priority` | Optional boolean |
| `newStatus` | Must be a valid column ID from the profile's `columns` array (dynamic, not hardcoded) |
| `newPosition` | Non-negative integer |
| `notes.content` | String, max 10000 chars |
| `epic.name` | Required, string, max 200 chars |
| `epic.color` | Required, must be one of the 20 predefined hex values |
| `task.epicId` | Optional string or null |

Error format: `{ "error": "descriptive message" }` with HTTP 400.

---

### Rule 10: Module architecture

New code must go into the correct existing module. Only create a new module if a feature is large and doesn't fit any existing one.

| Module           | Responsibility                                         |
|------------------|--------------------------------------------------------|
| `constants.js`   | All shared constants (limits, defaults, colors)        |
| `state.js`       | Centralized state + optimistic UI helpers              |
| `api.js`         | Pure HTTP functions — return data, no side effects     |
| `utils.js`       | Shared pure utilities                                  |
| `filters.js`     | Category, priority, epic filter logic                  |
| `modals.js`      | All modal dialog logic                                 |
| `crisis-mode.js` | Crisis mode (favicon, CSS class, filter activation)    |
| `board-config.js`| Board Configuration modal (column CRUD + reorder)      |
| `app.js`         | Entry point — DOM refs, event listeners, renders       |

---

## Data Persistence

| File                  | Written when                                          | Format           |
|-----------------------|-------------------------------------------------------|------------------|
| `tasks.json`          | Any task create/update/delete/move/archive            | Array of tasks   |
| `archived-tasks.json` | Archive operation                                     | Array of tasks   |
| `reports.json`        | Report generation                                     | Array of reports |
| `notes.json`          | Auto-save (debounced 500ms)                           | `{ content }`    |
| `epics.json`          | Epic create/update/delete                             | Array of epics   |
| `categories.json`     | Category create/update/delete; auto-created on first access | Array of categories |

All file I/O uses `readJsonFile()` (with fallback defaults) and `writeJsonFile()` helpers in `server.js`.
