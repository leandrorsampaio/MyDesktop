# Task Tracker - Project Specification Document

**Version:** 2.13.0
**Last Updated:** 2026-02-08

---

## Changelog

| Version | Date       | Changes                                                      |
|---------|------------|--------------------------------------------------------------|
| 2.13.0  | 2026-02-08 | Testing: added vanilla Node.js test infrastructure (146 tests) using built-in `node:test` module; tests for utilities, validation, and all API endpoints; npm scripts for running tests |
| 2.12.0  | 2026-02-08 | Security: added DIY rate limiting middleware (no external packages); 100 req/min for reads, 30 req/min for writes; includes informational headers and auto-cleanup |
| 2.11.0  | 2026-02-07 | Documentation: added comprehensive README.md for open source release with project philosophy, setup instructions, API reference, and contributing guidelines; added MIT LICENSE file |
| 2.10.0  | 2026-02-07 | Performance: added template caching to all 7 components (reduces HTTP requests from O(n) to O(1) per component type); removed double filter application; combined getTaskGradient/shouldUseLightText into single getTaskColorInfo function |
| 2.9.0   | 2026-02-07 | Modular architecture: split app.js into 5 modules (state.js, api.js, filters.js, crisis-mode.js, modals.js) for better maintainability and separation of concerns |
| 2.8.0   | 2026-02-07 | Code maintainability: extracted magic numbers to constants.js (CHECKLIST_RESET_HOUR, DEBOUNCE_DELAY_MS, MAX_GRADIENT_STEPS, LIGHT_TEXT_THRESHOLD, DEFAULT_PORT); added JSDoc comments to key functions in app.js; server.js now uses PORT env variable with fallback |
| 2.7.0   | 2026-02-07 | Added comprehensive "Code Guidelines" section documenting coding standards, patterns, and anti-patterns to prevent common issues |
| 2.6.0   | 2026-02-07 | Code consistency: created `toast-notification` component for user feedback; migrated Confirm and Checklist modals to `<modal-dialog>` component; removed window object functions and inline HTML handlers in favor of event delegation; replaced all `alert()` calls with toaster notifications |
| 2.5.0   | 2026-02-07 | Code cleanup: removed console.log statements from production code; fixed deprecated `substr()` to `substring()`; fixed crisis mode CSS selectors to target custom elements (`kanban-column`, `daily-checklist`); removed dead CSS rules targeting Shadow DOM internals |
| 2.4.0   | 2026-02-07 | Refactored shared code: created `/public/js/constants.js` (CATEGORIES, STATUS_COLUMNS, DEFAULT_CHECKLIST_ITEMS) and `/public/js/utils.js` (escapeHtml, getWeekNumber, formatDate); converted app.js to ES module; eliminated code duplication across components |
| 2.3.0   | 2026-02-06 | Migrated Reports and Archived Tasks modals to `<modal-dialog>` component with `size="large"` attribute; fixed category/priority filters to query through Shadow DOM; added complete modal styling to styles.css |
| 2.2.0   | 2026-01-31 | Added delete report: × button on each report in View Reports modal, `DELETE /api/reports/:id` endpoint |
| 2.1.0   | 2026-01-31 | Complete BEM refactoring: camelCase BEM class names (`.blockName__elementName`), modifier classes as separate `.--modifierName`, JS hooks via `.js-camelCase` classes, all IDs removed and replaced with `js-` class selectors, `getElementById` replaced with `querySelector` throughout |
| 2.0.0   | 2026-01-31 | Added priority filter button in toolbar, Crisis Mode (hamburger menu): shows only priority tasks, red border, hides toolbar/done column/checklist via visibility, red favicon, title "!!!" |
| 1.9.0   | 2026-01-31 | Added category filter buttons in header toolbar: one toggle button per category, filters cards across all columns via CSS class (no DOM removal), multiple filters can be active simultaneously |
| 1.8.0   | 2026-01-31 | Added header toolbar card: a right-aligned container (left of hamburger menu) that groups action buttons inline; Hide button moved into toolbar; expandable for future buttons |
| 1.7.0   | 2026-01-31 | Added sidebar privacy toggle (blur overlay), separated Archive and Report into independent functions with separate buttons and API endpoints |
| 1.6.0   | 2026-01-31 | Added task categories (1-6): selectable via pill buttons in modal, badge on cards, logged on change, reports grouped by category |
| 1.5.0   | 2026-01-26 | Complete UI redesign with zen theme: light beige background, Montserrat font, generous spacing, soft shadows |
| 1.4.0   | 2026-01-25 | Added editable daily checklist with external links, favicon |
| 1.3.0   | 2026-01-25 | Responsive design for MacBook Pro 14" (1512px) and external monitor (2304px), sidebar width increased to 560px, textarea min-width 500px |
| 1.2.0   | 2026-01-25 | Added welcome header with date/week info, hamburger menu, notes save timestamp, archived tasks modal |
| 1.1.0   | 2026-01-25 | Notes changed from checkbox list to free-form textarea with debounced auto-save |
| 1.0.0   | 2026-01-25 | Initial implementation complete                              |

---

## Project Overview

A local web-based task management tool that serves as a browser homepage. It features a kanban-style board with drag-and-drop functionality to track tasks across different stages of completion, along with note-taking, daily recurring task checklist, task categorization, report generation, and a sidebar privacy mode.

**Single user, local only.** No authentication, no multi-user support. Data stored as JSON files on the local filesystem.

---

## Technical Stack

- **Frontend:** HTML5, Vanilla CSS, Vanilla JavaScript (single-page, no framework)
- **Backend:** Node.js + Express
- **Server Port:** 3001 (port 3000 is used by another application)
- **Data Storage:** JSON files in `./data/` directory
  - `tasks.json` — Active tasks (all statuses except archived)
  - `archived-tasks.json` — Archived tasks (append-only)
  - `reports.json` — Generated report snapshots
  - `notes.json` — User notes (free-form text, `{ content: string }`)
- **Client-side Storage:** `localStorage` for recurrent tasks config and checked state
- **Favicon:** `public/favicon.png` (star icon)
- **Font:** Montserrat via Google Fonts CDN
- **No external CSS/JS libraries** — all styling and logic is custom vanilla code
- **CSS Naming Convention:** Custom BEM (v2.1.0):
  - **Blocks/Elements:** camelCase — `.blockName__elementName`
  - **Modifiers:** Separate class with `--` prefix — `.--modifierName`
  - **JS hooks:** Separate class with `js-` prefix — `.js-camelCase` (alongside BEM class)
  - **No IDs** — all JS targeting uses `querySelector('.js-xxx')` instead of `getElementById`

### File Structure & Component Model

The project uses a file-based component model with vanilla JavaScript (Web Components) to promote encapsulation and organization, avoiding the need for a build step.

```
/
├── server.js                  # Express backend (API + static serving)
├── projectSpecification.md    # This file
├── package.json
├── data/
│   └── ... (data files)
├── tests/                     # Vanilla Node.js tests (node:test)
│   ├── unit/
│   │   ├── utils.test.js      # Tests for utility functions
│   │   └── validation.test.js # Tests for input validation
│   └── api/
│       ├── tasks.test.js      # Tests for tasks API endpoints
│       ├── notes.test.js      # Tests for notes API endpoints
│       ├── reports.test.js    # Tests for reports API endpoints
│       └── rate-limit.test.js # Tests for rate limiting
└── public/
    ├── index.html             # Single HTML page, loads components
    ├── app.js                 # Main entry point (ES module), wires modules together
    ├── styles.css             # Global styles
    ├── favicon.png
    ├── js/
    │   ├── constants.js       # Shared constants (CATEGORIES, STATUS_COLUMNS, etc.)
    │   ├── utils.js           # Shared utilities (escapeHtml, getWeekNumber, etc.)
    │   ├── state.js           # Shared application state management
    │   ├── api.js             # HTTP API functions for server communication
    │   ├── filters.js         # Category and priority filtering logic
    │   ├── crisis-mode.js     # Crisis mode functionality
    │   └── modals.js          # Modal dialog handling (task, reports, checklist, etc.)
    └── components/
        ├── button/
        │   ├── button.js
        │   ├── button.html
        │   └── button.css
        ├── task-card/
        │   ├── task-card.js
        │   ├── task-card.html
        │   └── task-card.css
        ├── modal-dialog/
        │   ├── modal-dialog.js
        │   ├── modal-dialog.html
        │   └── modal-dialog.css
        ├── daily-checklist/
        │   ├── daily-checklist.js
        │   ├── daily-checklist.html
        │   └── daily-checklist.css
        ├── notes-widget/
        │   ├── notes-widget.js
        │   ├── notes-widget.html
        │   └── notes-widget.css
        ├── kanban-column/
        │   ├── kanban-column.js
        │   ├── kanban-column.html
        │   └── kanban-column.css
        └── toast-notification/
            ├── toast-notification.js
            ├── toast-notification.html
            └── toast-notification.css
```

**Component Architecture:**
-   **Structure:** Each component resides in its own directory (e.g., `public/components/button/`).
-   **Encapsulation:** Components use the **Shadow DOM** for true HTML and CSS encapsulation.
-   **Loading:** The component's `.js` file is its entry point. It uses the `fetch()` API at runtime to load its own `.html` and `.css` files as text. It then injects this content into its Shadow DOM.

**Shared Modules:**
-   **`/public/js/constants.js`:** Single source of truth for shared constants:
    - `CATEGORIES` — Category ID to label mapping
    - `STATUS_COLUMNS` — Column status to CSS selector mapping
    - `DEFAULT_CHECKLIST_ITEMS` — Default daily checklist items
    - `DEFAULT_PORT` — Server port (3001)
    - `CHECKLIST_RESET_HOUR` — Hour of day when checklist resets (6)
    - `DEBOUNCE_DELAY_MS` — Debounce delay for auto-save (500ms)
    - `MAX_GRADIENT_STEPS` — Maximum gradient color steps (20)
    - `LIGHT_TEXT_THRESHOLD` — Gradient index threshold for light text (12)
-   **`/public/js/utils.js`:** Shared utility functions (escapeHtml, getWeekNumber, formatDate). Imported where needed.
-   **`/public/js/state.js`:** Centralized application state (tasks array, editing state, filter states, crisis mode state). Provides getter/setter functions for state mutations.
-   **`/public/js/api.js`:** HTTP API functions for communicating with the server. Pure functions that return data without side effects.
-   **`/public/js/filters.js`:** Category and priority filtering logic. Manages filter button rendering and applies filters to task cards.
-   **`/public/js/crisis-mode.js`:** Crisis mode functionality including favicon generation and visual state changes.
-   **`/public/js/modals.js`:** Modal dialog handling for task add/edit, reports, archived tasks, checklist editor, and delete confirmation.
-   **Note:** `server.js` has its own copy of CATEGORIES and getWeekNumber (documented with comments) because Node.js cannot import ES modules from `/public` without additional setup.
-   **Registration:** The `.js` file defines and registers a custom element (e.g., `<custom-button>`) using `customElements.define()`.
-   **Usage:** Once a component's script is loaded in `index.html`, it can be used declaratively anywhere in the application's JavaScript via `document.createElement('custom-tag')`.

### Server Start

```bash
node server.js
# → http://localhost:3001

# With custom port:
PORT=4000 node server.js
# → http://localhost:4000
```

### Testing

The project uses vanilla Node.js testing with the built-in `node:test` module (no external packages).

```bash
# Run all tests (API tests require server running)
npm test

# Run only unit tests (no server needed)
npm run test:unit

# Run only API tests (server must be running)
npm run test:api

# Watch mode - re-runs on file changes
npm run test:watch
```

**Test coverage:**
- Unit tests: Utility functions, validation logic
- API tests: All endpoints (tasks, notes, reports, archive, rate limiting)
- Total: 146 tests

---

## Code Guidelines

This section documents coding standards and patterns to maintain consistency and prevent common issues. All contributors should follow these guidelines.

### 1. Single Source of Truth (No Code Duplication)

**Constants:**
- Define shared constants ONCE in `/public/js/constants.js`
- Import where needed: `import { CATEGORIES } from './js/constants.js';`
- Never duplicate constant definitions across files
- If server.js needs the same constants, document with a comment: `// Source of truth: /public/js/constants.js`

**Utility Functions:**
- Define shared utilities ONCE in `/public/js/utils.js`
- Common utilities: `escapeHtml()`, `getWeekNumber()`, `formatDate()`
- Import where needed: `import { escapeHtml } from './js/utils.js';`
- Never copy-paste utility functions between files

**Default Values:**
- Define default configurations in one place (constants.js or the owning component)
- Other files should import, not redefine

### 2. Modal Implementation

**Always use the `<modal-dialog>` component:**
- Never create modals with raw `<div class="modal">` elements
- Use size attribute: `<modal-dialog size="large">` or `size="small"`
- Open/close via methods: `element.open()` and `element.close()`
- The component handles: close button, backdrop click, ESC key, animations

**Example:**
```html
<modal-dialog class="js-myModal" size="large">
    <span slot="title">Modal Title</span>
    <div>Content here</div>
</modal-dialog>
```

```javascript
elements.myModal.open();   // Correct
elements.myModal.close();  // Correct
// WRONG: elements.myModal.classList.add('--active');
```

### 3. User Feedback (No alert())

**Always use the toaster component for user feedback:**
```javascript
elements.toaster.success('Operation completed');  // Green - success
elements.toaster.error('Something went wrong');   // Red - errors
elements.toaster.warning('Please fill required fields');  // Yellow - warnings
elements.toaster.info('No items to display');     // Beige - informational
```

**Never use:**
- `alert()` — blocks UI, ugly, inconsistent
- `confirm()` — use `<modal-dialog>` with custom buttons instead (for important confirmations)

### 4. Event Handling (No Global Functions)

**Never expose functions on window object:**
```javascript
// WRONG:
window.myFunction = function() { ... };

// CORRECT:
function myFunction() { ... }
```

**Never use inline HTML event handlers:**
```javascript
// WRONG:
`<button onclick="window.doSomething('${id}')">Click</button>`
`<input onblur="window.save(this.value)">`

// CORRECT: Use event delegation after rendering
container.innerHTML = `<button class="js-actionBtn" data-id="${id}">Click</button>`;
container.querySelector('.js-actionBtn').addEventListener('click', (e) => {
    const id = e.target.dataset.id;
    doSomething(id);
});
```

### 5. Shadow DOM Awareness

**Querying elements inside Shadow DOM:**
```javascript
// WRONG: document.querySelectorAll('task-card') — won't find cards inside shadow roots

// CORRECT: Query through each component's shadowRoot
const columns = document.querySelectorAll('kanban-column');
const cards = Array.from(columns).flatMap(col =>
    Array.from(col.shadowRoot?.querySelectorAll('task-card') || [])
);
```

**CSS cannot pierce Shadow DOM:**
- Styles in `styles.css` cannot target elements inside Shadow DOM
- Use CSS custom properties (variables) to pass styling through
- Each component must define its own internal styles

**CSS selectors must target actual elements:**
```css
/* WRONG: targeting old class names or Shadow DOM internals */
body.--crisisMode .column[data-status="done"] { }
body.--crisisMode .dailyChecklist { }

/* CORRECT: target the custom element itself */
body.--crisisMode kanban-column[data-status="done"] { visibility: hidden; }
body.--crisisMode daily-checklist { visibility: hidden; }
```

### 6. Production Code Quality

**No debug statements:**
```javascript
// WRONG: console.log('debug info');

// If debugging is needed, use a debug flag:
const DEBUG = false;
function log(...args) { if (DEBUG) console.log(...args); }
```

**Use modern APIs:**
```javascript
// WRONG (deprecated):
str.substr(2, 9)

// CORRECT:
str.substring(2, 11)
```

**Remove dead code:**
- Delete unused CSS rules (especially those targeting removed elements)
- Delete commented-out code blocks
- Delete unused functions and variables

### 7. ES Modules

**app.js and components use ES modules:**
```html
<script type="module" src="app.js"></script>
```

```javascript
// Importing
import { CATEGORIES } from './js/constants.js';
import { escapeHtml } from './js/utils.js';

// Exporting (in constants.js, utils.js)
export const CATEGORIES = { ... };
export function escapeHtml(text) { ... }
```

### 8. Component Patterns

**Every new component should:**
1. Reside in `/public/components/[name]/` with `.js`, `.html`, `.css` files
2. Use Shadow DOM for encapsulation
3. Cache templates at class level to avoid repeated fetches (see Performance section)
4. Clean up event listeners in `disconnectedCallback()`

**Template caching pattern:**
```javascript
class MyComponent extends HTMLElement {
    static templateCache = null;

    async connectedCallback() {
        if (!MyComponent.templateCache) {
            MyComponent.templateCache = await Promise.all([
                fetch('/components/my-component/my-component.html').then(r => r.text()),
                fetch('/components/my-component/my-component.css').then(r => r.text())
            ]);
        }
        const [html, css] = MyComponent.templateCache;
        // Use cached templates...
    }
}
```

### 9. Naming Conventions

**CSS (BEM with camelCase):**
- Blocks/Elements: `.blockName__elementName`
- Modifiers: `.--modifierName` (separate class)
- JS hooks: `.js-camelCase` (never style these)

**JavaScript:**
- Functions: `camelCase` — `fetchTasks()`, `openEditModal()`
- Constants: `UPPER_SNAKE_CASE` — `CATEGORIES`, `STATUS_COLUMNS`
- Private/internal: prefix with underscore — `_handleClick()`

**Files:**
- Components: `kebab-case` — `task-card.js`, `modal-dialog.css`
- Modules: `kebab-case` — `constants.js`, `utils.js`

### 10. Error Handling

**API functions should provide user feedback on errors:**
```javascript
async function myApiCall() {
    try {
        const response = await fetch('/api/endpoint');
        if (!response.ok) {
            const error = await response.json();
            elements.toaster.error(error.message || 'Operation failed');
            return null;
        }
        return await response.json();
    } catch (error) {
        console.error('API Error:', error);
        elements.toaster.error('Network error. Please try again.');
        return null;
    }
}
```

### Quick Reference Checklist

Before submitting code, verify:

- [ ] No duplicate constants or utility functions
- [ ] All modals use `<modal-dialog>` component
- [ ] No `alert()` or `confirm()` calls — use toaster/modal
- [ ] No `window.functionName` exports
- [ ] No inline `onclick`, `onblur`, etc. handlers
- [ ] CSS selectors target actual DOM elements (not Shadow DOM internals)
- [ ] No `console.log` statements (except behind DEBUG flag)
- [ ] No deprecated APIs (`substr`, etc.)
- [ ] Shared code imported from `/public/js/` modules
- [ ] Components cache their templates

---

## API Endpoints

```
GET    /api/tasks               - Retrieve all active tasks
POST   /api/tasks               - Create new task (body: { title, description, priority, category })
PUT    /api/tasks/:id           - Update existing task (body: any subset of { title, description, priority, category })
DELETE /api/tasks/:id           - Delete a task permanently
POST   /api/tasks/:id/move      - Move task between columns or reorder (body: { newStatus, newPosition })
POST   /api/tasks/archive       - Archive completed tasks only (moves done → archived-tasks.json, no report)
POST   /api/reports/generate    - Generate report snapshot of all columns + notes (no archiving, tasks stay in place)
GET    /api/archived            - Get all archived/completed tasks
GET    /api/reports             - Get list of all reports
GET    /api/reports/:id         - Get specific report by ID
PUT    /api/reports/:id         - Update report title (body: { title })
DELETE /api/reports/:id         - Delete a report permanently
GET    /api/notes               - Get notes object ({ content: string })
POST   /api/notes               - Save notes (body: { content })
```

**Key design decision (v1.7.0):** Report generation and archiving are **independent operations**. You can generate a report without archiving, and archive without generating a report. The old combined `/api/archive` endpoint was removed.

---

## Data Model

### Task Object

```javascript
{
  id: string,            // Unique ID (timestamp-based: Date.now().toString(36) + random)
  title: string,         // Required
  description: string,   // Optional, default: ""
  priority: boolean,     // true = show ★ star icon, default: false
  category: number,      // 1-6, default: 1. See Category Definitions.
  status: string,        // "todo" | "wait" | "inprogress" | "done" | "archived"
  position: number,      // 0-based index within column (used for ordering)
  log: array,            // Activity log entries (see below)
  createdDate: string    // ISO 8601 datetime string
}
```

### Log Entry

```javascript
{
  date: string,    // YYYY-MM-DD (date only, no time)
  action: string   // Human-readable description of what changed
}
```

**What gets logged:**
- Moving between columns: `"Moved from To Do to In Progress"`
- Category changes: `"Category changed from Development to Planning"`

**What does NOT get logged:**
- Title/description/priority edits
- Reordering within the same column
- Privacy toggle

### Category Definitions

| ID | Label              | Notes                    |
|----|--------------------|--------------------------|
| 1  | Non categorized    | Default if none selected |
| 2  | Development        |                          |
| 3  | Communication      |                          |
| 4  | To Remember        |                          |
| 5  | Planning           |                          |
| 6  | Generic Task       |                          |

- Stored as numeric IDs in the task object for extensibility (easy to add 7, 8, etc.)
- Label mapping defined in both `server.js` (`CATEGORY_LABELS` object) and `app.js` (`CATEGORIES` object)
- Existing tasks without a `category` field are treated as `1` (Non categorized) at read time — no migration needed
- Category badge is **not shown** on the card when category is 1 (Non categorized)

### Notes Data

```javascript
{ content: string }  // Plain text, stored in notes.json
```

### Report Data

```javascript
{
  id: string,
  title: string,            // Default: "Week [N] (Jan 20-25)", editable by user
  generatedDate: string,    // ISO datetime
  weekNumber: number,
  dateRange: string,        // e.g., "Jan 20-25"
  content: {
    archived: [],           // Snapshot of Done tasks at time of report
    inProgress: [],         // Snapshot of In Progress tasks
    waiting: [],            // Snapshot of Wait tasks
    todo: []                // Snapshot of To Do tasks
  },
  notes: string             // Copy of notes content at time of generation
}
```

Each task in the report content arrays contains: `{ id, title, description, category }`.

**Report display groups tasks by category** within each status section (e.g., all "Development" tasks together under "Completed Tasks").

---

## Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│ Welcome, Leandro                              [Hide] [≡]  │
│ January 31, 2026 • Friday • Week 5                             │
├─────────────────────────────────────────────────────────────────┤
│  Left Sidebar (560px)  │     Main Kanban Board (remaining)     │
│                [Hide]  │                                        │
│  ┌──────────────────┐  │  ┌──────┬──────┬──────┬──────────┐   │
│  │ Daily Checklist   │  │  │ TODO │ WAIT │ PROG │   DONE   │   │
│  │                   │  │  │ [+]  │      │      │[Rpt][Arc]│   │
│  │ ☐ Check email     │  │  │      │      │      │          │   │
│  │ ☐ Water plants    │  │  │ Card │ Card │ Card │ Card     │   │
│  │ ☐ Exercise        │  │  │ Card │ Card │ Card │ Card     │   │
│  └──────────────────┘  │  └──────┴──────┴──────┴──────────┘   │
│                         │                                       │
│  ┌──────────────────┐  │  Hamburger Menu [≡]:                  │
│  │ Notes   Saved at │  │   - View Reports                      │
│  │         2:30 PM  │  │   - All Completed Tasks               │
│  │ ┌──────────────┐ │  │   - Edit Daily Checklist              │
│  │ │              │ │  │   - Crisis Mode                       │
│  │ │ Free-form    │ │  │                                       │
│  │ │ textarea...  │ │  │                                       │
│  │ └──────────────┘ │  │                                       │
│  └──────────────────┘  │                                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Feature Reference

### 1. Kanban Board (4 Columns)

| Column       | Status key     | Special buttons                |
|--------------|----------------|--------------------------------|
| To Do        | `todo`         | [+ Add Task] at top            |
| Wait         | `wait`         | None                           |
| In Progress  | `inprogress`   | None                           |
| Done         | `done`         | [Report] and [Archive] at top  |

- Tasks are ordered by `position` field within each column
- Drag-and-drop between columns changes `status` and adds a log entry
- Drag-and-drop within a column reorders `position` values (no log entry)
- Each card shows a gradient background based on its position (see Color System)

### 2. Task Card

```
┌─────────────────────────────────┐
│ ⋮⋮  ★ Task Title          [Edit]│  ← Gradient background
│     Short description...        │     based on position
│     [Development]               │  ← Category badge (if not "Non categorized")
└─────────────────────────────────┘
```

**Components:**
- **Drag handle (⋮⋮):** 2x3 dot grid on left for reordering
- **Priority star (★):** Gold (#E8B923), shown only when `priority: true`
- **Title:** Font-weight 600, 14px (13px on compact)
- **Description:** 12px (11px compact), max 2 lines with ellipsis
- **Category badge:** Small rounded tag below description, semi-transparent background. Hidden when category is 1 (Non categorized)
- **Edit button:** Appears on hover (opacity transition), top-right corner
- **Entire card is draggable** for column moves

### 3. Task Modal (Add / Edit)

**Fields (top to bottom):**
1. **Title** — text input (required)
2. **Description** — textarea (optional)
3. **Priority Task** — checkbox toggle
4. **Category** — horizontal row of pill/radio buttons (1-6), default: 1 "Non categorized"
5. **Activity Log** — read-only list (edit mode only, hidden if empty)
6. **Actions:** Delete (edit mode only) | Cancel | Save

The category selector uses styled radio buttons that look like selectable pills. Selected pill has accent color (#C4A484) background.

### 4. Generate Report (v1.7.0)

- **Trigger:** Click [Report] button in Done column header
- **API:** `POST /api/reports/generate`
- **Behavior:**
  1. Takes a snapshot of ALL columns (todo, wait, inprogress, done) + notes
  2. Creates a report object with week number and date range
  3. Saves to `reports.json`
  4. **Does NOT move, delete, or archive any tasks**
  5. Shows confirmation alert with report title
- **Report view** groups tasks by category within each status section

### 5. Archive Tasks (v1.7.0)

- **Trigger:** Click [Archive] button in Done column header
- **API:** `POST /api/tasks/archive`
- **Behavior:**
  1. Moves all tasks with `status: "done"` to `archived-tasks.json` (sets status to `"archived"`)
  2. Removes them from `tasks.json`
  3. **Does NOT generate a report**
  4. Shows confirmation alert with count of archived tasks
  5. If no done tasks exist, shows an alert and does nothing

### 6. View Reports (via Hamburger Menu)

- Opens a modal with all reports sorted newest first
- Each report title is inline-editable (blur saves via `PUT /api/reports/:id`)
- Each report row has a × delete button (right side) — deletes via `DELETE /api/reports/:id` and re-renders list
- Click a report row to view its full content
- Report view shows: Completed Tasks, In Progress, Waiting/Blocked, To Do, Notes
- Within each section, tasks are **sub-grouped by category** with a label header

### 7. All Completed Tasks (via Hamburger Menu)

- Modal showing all tasks from `archived-tasks.json`
- Sorted by last log entry date (newest first), fallback to `createdDate`
- Shows: priority star, title, description (1-line truncated), completion date
- Total count displayed at top

### 8. Notes

- Free-form textarea in left sidebar
- **Debounced auto-save:** 500ms after last keystroke → `POST /api/notes`
- Visual status: "Saving..." then "Saved at [time]"
- Stored in `notes.json` as `{ content: string }`
- Included in reports but **never cleared** by report generation

### 9. Daily Recurrent Tasks (Checklist)

- Displayed at top of sidebar
- User-configurable via hamburger menu → "Edit Daily Checklist"
- Each item has: text (required) + URL (optional, shown as ↗ link icon)
- Checkbox with strike-through on check
- **Auto-reset at 6:00 AM daily** (compares `localStorage.lastRecurrentReset` to today's 6 AM)
- Configuration stored in `localStorage.checklistConfig`
- Checked state stored in `localStorage.recurrentTasksChecked` (reset daily)
- Default items: Check email, Review calendar, Water plants, Take vitamins, Exercise, Read for 30 minutes

### 10. Header Toolbar (v1.8.0)

- **Element:** `div.toolbar` inside `.appHeader__actions`, positioned to the left of the hamburger menu
- **Purpose:** Card-style container that groups action buttons inline in the header area
- **Layout:** Flexbox row with `gap: 8px`, right-aligned (grows leftward as buttons are added)
- **Styling:** Semi-transparent white background (`rgba(255,255,255, 0.6)`), `border-radius: 14px`, soft shadow, `padding: 6px 10px`
- **Current contents:** Hide (privacy toggle) button
- **Expandable:** New buttons can be added inside this container as needed; they will align inline and the card expands to the left
- Buttons inside the toolbar have transparent backgrounds (the card itself provides the visual grouping)

### 11. Category Filters (v1.9.0)

- **Location:** Inside `.toolbar`, to the left of the Priority filter button
- **Buttons:** One `toolbar__categoryBtn` per category (1-6), rendered dynamically from `CATEGORIES` constant
- **Behavior:** Each button is an independent toggle. Clicking activates/deactivates that category filter.
  - When **no filters active**: all cards visible
  - When **one or more filters active**: only cards matching ANY active category are visible; non-matching cards are hidden
  - Multiple filters can be active simultaneously (additive/OR logic)
- **Implementation:** Purely DOM-based — toggling adds/removes `--filtered` CSS class on `.taskCard` elements (`display: none`). No tasks are removed from the DOM, no API calls, no re-fetching. Uses shared `applyAllFilters()` function.
- **Card attribute:** Each `.taskCard` has `data-category` attribute set during render
- **Persistence:** Filters are re-applied after every column render (cards are rebuilt by `renderColumn`). Filter state lives in `activeCategoryFilters` Set (in-memory, resets on page reload).
- **Active button style:** Accent color background, white text (same as other active toggle buttons)

### 12. Priority Filter (v2.0.0)

- **Location:** Inside `.toolbar`, between category filter buttons and the divider/Hide button
- **Button:** `toolbar__priorityBtn` with text "★ Priority"
- **Behavior:** Toggle button — when active, only cards with `priority: true` are shown; non-priority cards are hidden
- **Implementation:** Reuses the same `applyAllFilters()` function as category filters. Cards have `data-priority` attribute (`"true"` or `"false"`). Non-matching cards get `--filtered` CSS class.
- **Interaction with category filters:** Both filters apply simultaneously (AND logic — card must pass both filters to be visible)
- **Active button style:** Same accent color as category filter buttons

### 13. Crisis Mode (v2.0.0)

- **Trigger:** Hamburger menu → "Crisis Mode" button (🚨 icon)
- **Purpose:** Emergency focus mode — strips the UI down to only priority tasks with urgent visual cues
- **Behavior (on activate):**
  1. Activates the priority filter (reuses `applyAllFilters()`, no duplicated code)
  2. Adds `--crisisMode` class to `<body>`
  3. 5px solid red border (`#C0392B`) around the entire page
  4. Hides the header toolbar via `visibility: hidden` (layout preserved)
  5. Hides the Done column via `visibility: hidden` (layout preserved)
  6. Hides the Daily Checklist section via `visibility: hidden` (layout preserved)
  7. Changes the page title to `"!!!"`
  8. Replaces favicon with a dynamically generated red star (canvas-drawn PNG)
  9. Menu button text changes to "Exit Crisis Mode"
- **Behavior (on deactivate):** Reverses all of the above — deactivates priority filter, removes red border, restores visibility, restores original title and favicon
- **No persistence, no server calls** — purely client-side state toggle
- **Key CSS rules:**
  - `body.--crisisMode` — red border
  - `body.--crisisMode .toolbar` — `visibility: hidden`
  - `body.--crisisMode .column[data-status="done"]` — `visibility: hidden`
  - `body.--crisisMode .dailyChecklist` — `visibility: hidden`

### 14. Sidebar Privacy Toggle (v1.7.0)

- **Button:** "Hide" / "Show" toggle at top-right of sidebar
- **Behavior:** Toggles CSS class `--privacyMode` on the `.appContainer` element
- **Effect:** All `.sidebar__section` elements get `filter: blur(8px)`, `pointer-events: none`, `user-select: none`
- **Purpose:** Quick privacy screen when someone walks by — blurs notes and checklist
- **No persistence, no logs, no server calls** — purely client-side CSS toggle
- Default state: unblurred (Hide button shown)
- When active: button shows "Show" with accent color background

### 15. Color System

**Position-based gradients** — color is tied to card position, not the task itself.

Each column has 20 gradient levels defined as CSS custom properties:
- `--todo-gradient-0` through `--todo-gradient-19` (warm red spectrum)
- `--wait-gradient-0` through `--wait-gradient-19` (cool blue-gray spectrum)
- `--inprogress-gradient-0` through `--inprogress-gradient-19` (teal/green spectrum)
- `--done-gradient-0` through `--done-gradient-19` (purple spectrum)

**Text color:** Gradients 0-11 (darker) use light/white text. Gradients 12-19 (lighter) use dark text. Controlled by `shouldUseLightText()` function and `.--lightText` / `.--darkText` CSS classes.

**Gradient assignment:** `getTaskGradient(status, position, totalInColumn)` — if column has ≤20 tasks, gradient index = position. If >20, distributes evenly across the 20 levels.

---

## Design System

### Colors (CSS Custom Properties)

| Variable           | Value                        | Usage                      |
|--------------------|------------------------------|----------------------------|
| `--bg-color`       | `#F5F1EB`                    | Page background            |
| `--text-primary`   | `#2D2D2D`                    | Main text                  |
| `--text-secondary` | `#5A5A5A`                    | Secondary text             |
| `--text-muted`     | `#8A8A8A`                    | Labels, hints              |
| `--text-light`     | `#FFFFFF`                    | Text on dark backgrounds   |
| `--text-dark`      | `#2D2D2D`                    | Text on light backgrounds  |
| `--accent-color`   | `#C4A484`                    | Buttons, highlights        |
| `--accent-hover`   | `#B8956F`                    | Button hover states        |
| `--danger-color`   | `#C97065`                    | Delete buttons             |
| `--success-color`  | `#7BA37B`                    | Save confirmations         |

### Typography

- **Font:** Montserrat (weights: 300, 400, 500, 600, 700)
- **Welcome title:** 28px, weight 300
- **Section headers:** 12px uppercase, letter-spacing 2px, weight 600
- **Task title:** 14px (13px compact), weight 600
- **Task description:** 12px (11px compact), weight 400
- **Body text:** 14-15px, weight 400

### Spacing & Borders

- **Border radius:** 10-24px throughout (no sharp corners)
- **No hard borders** — depth conveyed through soft shadows
- **Shadows:** `--shadow-soft` (2px 12px), `--shadow-medium` (4px 20px), `--shadow-card` (2px 8px)
- **Animations:** 0.3s ease for all transitions

### Responsive Breakpoints

| Viewport                | Behavior                                    |
|-------------------------|---------------------------------------------|
| ≥2000px (external)      | Full layout, 560px sidebar, 28px column gaps |
| 1400-1999px (MacBook)   | Compact layout, 560px sidebar, 16px gaps, smaller fonts |
| <1400px                 | Sidebar stacks above kanban, 2-column grid   |
| <768px                  | Single column kanban                         |

---

## Technical Implementation Notes

### Key Functions in `app.js`

| Function                    | Purpose                                          |
|-----------------------------|--------------------------------------------------|
| `fetchTasks()`              | GET /api/tasks → renders all columns             |
| `createTask(data)`          | POST /api/tasks                                  |
| `updateTask(id, data)`      | PUT /api/tasks/:id (includes category log logic) |
| `deleteTask(id)`            | DELETE /api/tasks/:id                            |
| `deleteReport(id)`          | DELETE /api/reports/:id, re-renders report list   |
| `moveTask(id, status, pos)` | POST /api/tasks/:id/move                         |
| `generateReport()`          | POST /api/reports/generate                       |
| `archiveTasks()`            | POST /api/tasks/archive                          |
| `createTaskCard(task, pos, total)` | Creates DOM element for a task card        |
| `getTaskGradient(status, pos, total)` | Returns CSS gradient variable           |
| `shouldUseLightText(status, pos, total)` | Returns boolean for text color        |
| `renderReportSection(title, taskList)` | Renders report section grouped by category |
| `setCategorySelection(value)` | Sets radio button for category in modal       |
| `getSelectedCategory()`     | Reads selected category from modal radios        |
| `renderCategoryFilters()`   | Renders filter buttons in header toolbar from CATEGORIES |
| `toggleCategoryFilter(id)`  | Toggles a category filter on/off, updates button state and cards |
| `togglePriorityFilter()`    | Toggles priority-only filter on/off                      |
| `applyAllFilters()`         | Applies all active filters (category + priority) via `hidden` attribute. Queries through kanban-column Shadow DOMs to find task-cards. |
| `toggleCrisisMode()`        | Toggles crisis mode on/off (priority filter, red border, hide elements, favicon, title) |
| `generateRedStarFavicon()`  | Creates a red star favicon dynamically via canvas         |
| `setFavicon(url)`           | Updates the page favicon link element                     |
| `openAddTaskModal()`        | Resets and opens modal for new task              |
| `openEditModal(taskId)`     | Populates and opens modal for editing            |
| `handleTaskFormSubmit(e)`   | Form submit handler (create or update)           |
| `debouncedSaveNotes()`      | 500ms debounce for notes auto-save               |
| `checkDailyReset()`         | Resets recurrent task checkboxes after 6 AM      |
| `openChecklistModal()`      | Opens the Edit Daily Checklist modal             |
| `renderChecklistEditor()`   | Renders editable checklist items in modal        |
| `saveChecklist()`           | Saves checklist config to localStorage and refreshes component |

### Key Constants in `app.js`

```javascript
const STATUS_COLUMNS = { 'todo': 'kanban-column[data-status="todo"]', 'wait': 'kanban-column[data-status="wait"]', 'inprogress': 'kanban-column[data-status="inprogress"]', 'done': 'kanban-column[data-status="done"]' };
const CATEGORIES = { 1: 'Non categorized', 2: 'Development', 3: 'Communication', 4: 'To Remember', 5: 'Planning', 6: 'Generic Task' };
```

### Key Constants in `server.js`

```javascript
const CATEGORY_LABELS = { 1: 'Non categorized', 2: 'Development', 3: 'Communication', 4: 'To Remember', 5: 'Planning', 6: 'Generic Task' };
```

### Category Change Logging (server.js)

When `PUT /api/tasks/:id` receives a `category` field that differs from the current value, the server automatically appends a log entry:
```javascript
{ date: "2026-01-31", action: "Category changed from Development to Planning" }
```
This happens server-side in the PUT handler — the frontend does not need to construct the log entry.

### Status Name Mapping (server.js)

Used for log entries when tasks move between columns:
```javascript
const statusNames = { 'todo': 'To Do', 'wait': 'Wait', 'inprogress': 'In Progress', 'done': 'Done' };
```

### Position Management

- Each task has a `position` field (0-based index within its column)
- When a task is moved or reordered, the server recalculates positions for all tasks in the target column
- Frontend sorts by `position` when rendering: `.sort((a, b) => a.position - b.position)`

---

## Data Persistence Strategy

| File                  | Written when                                     | Format         |
|-----------------------|--------------------------------------------------|----------------|
| `tasks.json`          | Any task create/update/delete/move/archive       | Array of tasks |
| `archived-tasks.json` | Archive operation                                | Array of tasks |
| `reports.json`        | Report generation                                | Array of reports |
| `notes.json`          | Notes auto-save (debounced 500ms)                | `{ content }` |

All file I/O uses `readJsonFile()` (with fallback defaults) and `writeJsonFile()` helper functions in server.js.

---

## Modals Reference

| Modal JS hook          | Purpose                      | Trigger                              | Implementation |
|------------------------|------------------------------|--------------------------------------|----------------|
| `.js-taskModal`        | Add/Edit task                | [+ Add Task] button / [Edit] on card | `<modal-dialog>` component |
| `.js-reportsModal`     | View reports list & detail   | Hamburger menu → View Reports        | `<modal-dialog size="large">` component |
| `.js-archivedModal`    | View all archived tasks      | Hamburger menu → All Completed Tasks | `<modal-dialog size="large">` component |
| `.js-confirmModal`     | Delete confirmation          | Delete button inside edit modal      | `<modal-dialog size="small">` component |
| `.js-checklistModal`   | Edit daily checklist config  | Hamburger menu → Edit Daily Checklist | `<modal-dialog size="large">` component |

**Modal implementation:**
All modals use the `<modal-dialog>` component which provides Shadow DOM encapsulation, handles its own close button, backdrop click, and ESC key. Supports `size` attribute (`"large"` or `"small"`). Uses `.open()` and `.close()` methods.

All modals close on: close button (×), Cancel button, clicking backdrop, pressing ESC.

## Toast Notifications

The `<toast-notification>` component provides user feedback for operations. It's included in `index.html` as a single instance:

```html
<toast-notification class="js-toaster"></toast-notification>
```

**Usage in app.js:**
```javascript
elements.toaster.success('Task created successfully');
elements.toaster.error('Failed to save changes');
elements.toaster.warning('Title is required');
elements.toaster.info('No completed tasks to archive');
```

**Toast types:** success (green), error (red), warning (yellow), info (beige)
**Duration:** 4 seconds default (configurable per-call)
**Features:** Stacking (multiple toasts can show at once), slide-in/out animations, close button, auto-dismiss

---

## Future Considerations (Out of Scope)

- Export reports to PDF or formatted HTML file
- Search/filter tasks
- Due dates
- Tags/labels (beyond categories)
- Custom color themes
- Dark mode
- Keyboard shortcuts for power users
- Undo/redo functionality
- Multiple boards/projects

---

**Server Start Command:** `node server.js` (runs on port 3001)

**Browser Homepage:** Set to `http://localhost:3001`
