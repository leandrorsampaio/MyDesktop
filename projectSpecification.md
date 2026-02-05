# Task Tracker - Project Specification Document

**Version:** 2.2.0
**Last Updated:** 2026-01-31

---

## Changelog

| Version | Date       | Changes                                                      |
|---------|------------|--------------------------------------------------------------|
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
└── public/
    ├── index.html             # Single HTML page, loads components
    ├── app.js                 # Main application logic
    ├── styles.css             # Global styles
    ├── favicon.png
    └── components/
        └── button/
            ├── button.js      # Component logic (Custom Element class)
            ├── button.html    # Component's encapsulated HTML
            └── button.css     # Component's encapsulated styles
```

**Component Architecture:**
-   **Structure:** Each component resides in its own directory (e.g., `public/components/button/`).
-   **Encapsulation:** Components use the **Shadow DOM** for true HTML and CSS encapsulation.
-   **Loading:** The component's `.js` file is its entry point. It uses the `fetch()` API at runtime to load its own `.html` and `.css` files as text. It then injects this content into its Shadow DOM.
-   **Registration:** The `.js` file defines and registers a custom element (e.g., `<custom-button>`) using `customElements.define()`.
-   **Usage:** Once a component's script is loaded in `index.html`, it can be used declaratively anywhere in the application's JavaScript via `document.createElement('custom-tag')`.

### Server Start

```bash
node server.js
# → http://localhost:3001
```

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
| `applyAllFilters()`         | Applies all active filters (category + priority) via `--filtered` class |
| `toggleCrisisMode()`        | Toggles crisis mode on/off (priority filter, red border, hide elements, favicon, title) |
| `generateRedStarFavicon()`  | Creates a red star favicon dynamically via canvas         |
| `setFavicon(url)`           | Updates the page favicon link element                     |
| `openAddTaskModal()`        | Resets and opens modal for new task              |
| `openEditModal(taskId)`     | Populates and opens modal for editing            |
| `handleTaskFormSubmit(e)`   | Form submit handler (create or update)           |
| `debouncedSaveNotes()`      | 500ms debounce for notes auto-save               |
| `checkDailyReset()`         | Resets recurrent task checkboxes after 6 AM      |

### Key Constants in `app.js`

```javascript
const STATUS_COLUMNS = { 'todo': '.js-todoList', 'wait': '.js-waitList', 'inprogress': '.js-inprogressList', 'done': '.js-doneList' };
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

| Modal JS hook          | Purpose                      | Trigger                              |
|------------------------|------------------------------|--------------------------------------|
| `.js-taskModal`        | Add/Edit task                | [+ Add Task] button / [Edit] on card |
| `.js-reportsModal`     | View reports list & detail   | Hamburger menu → View Reports        |
| `.js-archivedModal`    | View all archived tasks      | Hamburger menu → All Completed Tasks |
| `.js-confirmModal`     | Delete confirmation          | Delete button inside edit modal      |
| `.js-checklistModal`   | Edit daily checklist config  | Hamburger menu → Edit Daily Checklist |

All modals close on: close button (×), Cancel button, clicking backdrop, pressing ESC.

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
