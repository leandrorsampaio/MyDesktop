# SPEC — Project Specification

**Version:** 2.44.1
**Last Updated:** 2026-08-18

---

## Doc map

```
AGENTS.md     → LLM / coding agent entry point. Start there if you are an AI.
README.md     → New visitors. Marketing + quickstart only.
SPEC.md       → THIS FILE. Source of truth for current implementation. Edit on every feature change.
VISION.md     → Strategic intent. Edit only when direction shifts.
CHANGELOG.md  → One-line entry per shipped version.
FUTURE.md     → Deferred ideas. Move to active when picked up.
docs/design/  → Live design hire engagement (DESIGN_BRIEF, COMPONENT_CATALOG, DESIGN_PROMPTS).
```

---

## Documentation Maintenance

This document describes the **current** state of the project. Always edit it to reflect reality when features change.

- **New version shipped:** add a row to `CHANGELOG.md` + bump the version header above.
- **Feature changed:** update the relevant section here directly — no changenotes in body text.
- **CSS/visual work:** see `docs/design/COMPONENT_CATALOG.md` for the current UI state catalog and `docs/design/DESIGN_BRIEF.md § Current Design Tokens` for live tokens.
- **Strategic shift (audience, principles, dark-mode plan, naming):** update `VISION.md`.

---

## Quick Context

**Stack:** Vanilla JS + Web Components (Shadow DOM) + Node.js (built-in `http`, no Express — see `mini-server.js`). No framework, no build step, zero npm dependencies.
**Port:** 3001. **Data:** JSON files in `data/{alias}/`. No auth. Single user, local only.
**CSS:** BEM camelCase (`.blockName__elementName` / `.--modifier` / `.js-hook`). No IDs.

**Never:** `confirm()`, `alert()`, `window.fn`, inline `onclick`/`onblur`, `console.log`.
**Always:** `<modal-dialog>` for confirmations, `elements.toaster.*` for all user feedback, optimistic UI + rollback for every task operation.
**Shared client code lives in** `constants.js`, `utils.js`, `state.js` — never duplicate across files.
**Every component:** Shadow DOM, `static templateCache`, `disconnectedCallback` for any document-level listeners or timers.

---

## Project Overview

A local web-based kanban task tracker used as a browser homepage. Features: drag-and-drop board, task categories, epics, daily checklist, notes, report generation, privacy blur, and multiple profiles with separate data.

---

## Technical Stack & File Structure

- **Frontend:** HTML5, Vanilla CSS, Vanilla JS — ES modules, no build step
- **Backend:** Node.js built-in `http` module, wrapped by `mini-server.js` (Express-compatible shim), port 3001
- **Data:** JSON files in `./data/{profileAlias}/` (profile-scoped); `./data/profiles.json` (global)
- **No external CSS/JS libraries. Zero npm dependencies.**

```
/
├── server.js
├── mini-server.js                # Express-compatible shim over Node's `http`. Zero-dep.
├── README.md
├── SPEC.md                        # This file
├── VISION.md
├── FUTURE.md
├── CHANGELOG.md
├── docs/design/                   # DESIGN_BRIEF.md, COMPONENT_CATALOG.md, DESIGN_PROMPTS.md
├── data/
│   ├── profiles.json
│   ├── ai-config.json             # gitignored — provider/model/API key (never served statically)
│   └── {alias}/
│       ├── tasks.json
│       ├── archived-tasks.json
│       ├── reports.json
│       ├── notes.json
│       ├── epics.json
│       ├── categories.json
│       ├── ai-staged-tasks.json   # AI-proposed tasks awaiting promotion
│       ├── ai-conversation.json   # persisted assistant transcript (max 200 turns)
│       ├── ai-proposals.json      # AI-proposed changes awaiting review (max 50)
│       ├── ai-memory.json         # Durable facts about how the user works (max 40)
│       └── attachments/           # gitignored — {taskId}/{attachmentId}{ext}, mode 0600
├── tests/
│   ├── unit/                      # utils, validation, router, archive-page, mini-server, state, filters
│   └── api/                       # tasks, notes, reports, rate-limit, profiles, epics, categories, columns, archived, ai-staged
└── public/
    ├── index.html                 # `<base href="/">` ensures relative assets resolve correctly on sub-pages (/:alias/:page)
    ├── app.js                     # Main entry — wires everything
    ├── styles.css
    ├── js/
    │   ├── constants.js           # All shared constants
    │   ├── utils.js               # escapeHtml, getWeekNumber, formatDate, toCamelCase
    │   ├── state.js               # Centralized state + optimistic UI helpers
    │   ├── api.js                 # Pure HTTP functions, no side effects
    │   ├── filters.js             # Category, priority, epic filter logic
    │   ├── shortcuts.js           # Keyboard shortcuts — initShortcuts()
    │   ├── router.js              # Client-side path parser; parsePath(), buildPath()
    │   ├── modals.js              # All modal logic
    │   ├── attachments.js         # Task attachments — Files tab, drop/paste, viewer
    │   ├── board-preview.js       # Pure plan builder for AI proposal preview mode
    │   ├── assistant-chat.js      # Shared conversation controller (dock + AI page)
    │   ├── assistant-suggestions.js # Pure board-derived openers for the dock
    │   ├── archive-page.js        # Archive page — initArchivePage(), getCompletedDate(), sortTasks()
    │   ├── backlog-page.js        # Backlog page + AI staging — initBacklogPage()
    │   ├── reports-page.js        # Reports page — initReportsPage()
    │   ├── config-page.js         # Configuration page — initConfigPage()
    │   ├── dashboard-page.js      # Dashboard page — initDashboardPage()
    │   ├── ai-page.js             # AI Assistant page — initAiPage()
    │   └── design-system-page.js  # Internal style-guide page — initDesignSystemPage()
    └── components/
        ├── button/
        ├── task-card/
        ├── modal-dialog/
        ├── daily-checklist/
        ├── notes-widget/
        ├── kanban-column/
        ├── nav-sidebar/           # Permanent icon-only navigation rail
        ├── custom-picker/         # Inline component (no .html/.css)
        ├── svg-icon/              # Inline component (no .html/.css)
        ├── list-header/           # Inline component — sortable column header for list pages
        ├── archive-row/           # Expandable archived-task row (.html + .css)
        ├── ai-staged-row/         # Flat AI staged-task row (.html + .css)
        ├── report-row/            # Flat report row (.html + .css)
        ├── page-fab/              # Reusable floating action button (inline, .js only)
        ├── quick-capture/         # Global one-line capture bar (shortcut: c)
        ├── assistant-dock/        # Assistant panel beside the board (shortcut: a)
        └── toast-notification/
```

**Component loading:** Each component's `.js` fetches its own `.html`/`.css` at runtime and injects them into Shadow DOM. Inline components (e.g., `svg-icon`, `custom-picker`) define HTML/CSS directly in JS to avoid extra requests. Sub-page-only components (`list-header`, `archive-row`, `backlog-row`, `ai-staged-row`, `report-row`, `page-fab`) are NOT in `index.html` — their page modules import them lazily, so the board cold start doesn't pay for them. `index.html` also `modulepreload`s app.js's import chain.

**Static file serving:** every static response carries `Last-Modified` + `Cache-Control: no-cache`; a matching `If-Modified-Since` gets a bodyless `304`, so browser-homepage reloads revalidate instead of re-downloading every script and template.

**Server start:**
```bash
node server.js                   # http://localhost:3001 (binds to 127.0.0.1 by default)
PORT=4000 node server.js
HOST=0.0.0.0 node server.js      # also accept LAN connections (off by default for safety)
```

**Tests** (vanilla `node:test`, no external packages):
```bash
# Start the server in test mode (rate limit bypassed so the suite doesn't 429 itself):
RATE_LIMIT_DISABLED=1 node server.js

# Then in another terminal:
npm test          # all (API tests require server running)
npm run test:unit # unit only
npm run test:api  # API only
```

API tests run sequentially (`--test-concurrency=1`) against a dedicated `tests` profile (`data/tests/`, gitignored). The profile is created on first run via `POST /api/profiles` and never deleted — re-running is safe. Real user profiles are never touched.

When `RATE_LIMIT_DISABLED=1` is set, the server also exposes `POST /api/_test/reset-rate-limit` (used by `rate-limit.test.js` to verify the `X-RateLimit-Remaining` header decreases from a fresh counter). The endpoint is not registered in normal mode.

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
POST   /api/:profile/capture             - Quick capture (body: { text }). Creates a task instantly,
                                           NO AI call. Returns the task with needsFiling: true.
POST   /api/:profile/tasks/:id/classify  - Best-effort AI classification of a captured task.
                                           Always 200: { classified, reason?, task }.
POST   /api/:profile/tasks/:id/attachments                 - Upload one file. RAW binary body (not
                                           multipart): type in Content-Type, percent-encoded filename
                                           in X-Attachment-Name. Returns the attachment record.
                                           :id may name a board, backlog, archived or staged task.
GET    /api/:profile/tasks/:id/attachments/:attachmentId   - Stream the file. `?download=1` forces
                                           a save dialog for an otherwise-inline type.
DELETE /api/:profile/tasks/:id/attachments/:attachmentId   - Remove the record and the file
POST   /api/:profile/tasks/archive       - Archive all done tasks
POST   /api/:profile/reports/generate    - Generate a report for the period since the last one
POST   /api/:profile/reports/:id/summarise - Write the AI summary. Always 200; { summarised, reason?, report }
GET    /api/:profile/archived            - Get archived tasks
POST   /api/:profile/archived/:id/restore - Restore task to first column (adds log entry)
GET    /api/:profile/export              - Full profile data export: one JSON bundle
                                           ({ formatVersion, exportedAt, profile, tasks,
                                           archivedTasks, epics, categories, notes, reports,
                                           stagedTasks }) with a download Content-Disposition
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

### AI Assistant (global config + profile-scoped staged tasks)
```
AI providers (`AI_PROVIDERS` in server.js): anthropic (anthropic format);
openai, groq, google, kimi, custom (openai-compatible). A provider with
`allowsBaseUrl` (kimi, custom) may override the registry's base URL —
Kimi has two regional hosts, and switching between them shouldn't cost
you the provider's defaults by forcing a drop to Custom.

GET    /api/ai/config                              - Get AI config (returns { activeConfigId, configs: [{ id, name, provider, model, customUrl?, hasKey: bool }] } — key never returned)
POST   /api/ai/config/entries                      - Create new config entry (body: { name, provider, model, apiKey?, customUrl? })
PUT    /api/ai/config/entries/:id                  - Update a config entry; empty apiKey preserves existing key
DELETE /api/ai/config/entries/:id                  - Delete a config entry
PUT    /api/ai/config/active                       - Set the active config (body: { configId })
GET    /api/ai/availability                        - Is the AI usable right now? { available, reason?, message?, provider?, model?, name? }.
                                                     Always 200, never throws — the basis of graceful degradation. Key never returned.
POST   /api/:profile/ai/chat                       - Send chat messages; returns { narrative, tasks[], proposals[], memories[], usage };
                                                     rate-limited 10 req/min (body: { messages: [{role,content}] }).
                                                     The system prompt carries a compact snapshot of the live board.
POST   /api/:profile/ai/chat/stream                - Same inputs and stored outputs, streamed as server-sent events:
                                                     `text` deltas, then one `done` with the full payload, or `error`.
GET    /api/:profile/ai/memory                     - All memories (approved + awaiting review)
POST   /api/:profile/ai/memory                     - Add one by hand (body: { text }); approved immediately
PUT    /api/:profile/ai/memory/:id                 - Edit text and/or approve (body: { text?, approved? })
DELETE /api/:profile/ai/memory/:id                 - Forget one
GET    /api/:profile/ai/proposals                  - Pending proposed changes (the review buffer)
POST   /api/:profile/ai/proposals/:id/apply        - Apply one. The ONLY path from the buffer to the board.
                                                     409 + { discarded: true } when the proposal is stale.
POST   /api/:profile/ai/proposals/apply-all        - Apply all; returns { applied, failed[] }
DELETE /api/:profile/ai/proposals/:id              - Reject one (board untouched)
DELETE /api/:profile/ai/proposals                  - Reject all (board untouched)
GET    /api/:profile/ai/conversation               - Get the persisted transcript ({ messages: [{role, content, at}] })
PUT    /api/:profile/ai/conversation               - Replace the transcript (body: { messages }); non-user/assistant roles dropped, capped at 200
DELETE /api/:profile/ai/conversation               - Clear the transcript
GET    /api/:profile/ai/staged                     - Get all staged tasks
POST   /api/:profile/ai/staged                     - Create staged task manually (body: StagedTask fields)
PUT    /api/:profile/ai/staged/:id                 - Update staged task
DELETE /api/:profile/ai/staged/:id                 - Delete staged task
POST   /api/:profile/ai/staged/:id/promote/backlog - Promote to backlog (adds log "Added from AI Staging")
POST   /api/:profile/ai/staged/:id/promote/board   - Promote to first non-backlog board column (adds log "Added from AI Staging")
```

### SPA Routing
```
GET    /              - Redirect to default profile alias
GET    /:alias        - Serve index.html if profile exists, else redirect
GET    /:alias/ai     - 301 → /:alias/backlog (the AI page was removed in v2.55.0)
GET    /:alias/:page  - Serve index.html for sub-pages (dashboard, backlog, archive, reports, config, design-system)
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
  createdDate: string, // ISO 8601
  deadline: string|null,    // ISO 8601 datetime — optional, default null
  snoozeUntil: string|null, // ISO 8601 datetime — optional, default null
  attachments: array,       // [{ id, name, mime, ext, size, uploadedAt }] — optional, absent until
                            // the first file is attached. See § Attachments.
  needsFiling: boolean,     // optional. true on a quick-captured task until the AI classifies it.
                            // Drives the "unfiled" chip. See § Quick capture.
  points: number|null       // optional. One of 1, 2, 3, 5, 8, 13. null = unestimated.
                            // See § Story points.
}
```

Existing tasks without `deadline`, `snoozeUntil` or `attachments` behave as `null` / `[]` (no chip, not snoozed, no files) — zero migration needed.

**What gets logged:** moving between columns (`"Moved from 'To Do' to 'In Progress'"`), category changes (`"Category changed from X to Y"`), column deletion (`"Column 'Wait' deleted – moved to 'To Do'"`).
**Not logged:** title/description/priority edits, epic changes, reordering within same column.

### Epic Object
```javascript
{
  // Context fields (stakeholder / cadence / expectations) are optional, max
  // 500 chars each, and absent on profiles created before v2.48.0.
  // See § Epic contexts.
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
  id: string,         // auto-generated (default IDs: "todo", "wait", "inprogress", "done", "backlog")
  name: string,       // required, max 200 chars
  order: number,      // 0-based sort index
  hasArchive: boolean, // if true, column gets an Archive button
  isBacklog: boolean,  // if true, this is the backlog column (exactly one per profile)
  celebrate: boolean   // if true, a task arriving here plays the confetti burst
}
```

**Constraints:** max 15 columns per profile; min 1 (cannot delete last). First column (order 0) is the default — new tasks are created there; deleted-column tasks move there. Column IDs for the 4 default board columns match legacy `task.status` values for zero-migration compatibility. Stored inside `profiles.json` (not a separate file). The **backlog column** (`isBacklog: true`) is permanent — it is included in `DEFAULT_COLUMNS`, auto-added to existing profiles by `resolveProfile` middleware, and cannot be deleted. It is hidden from the Board Configuration modal.

### StagedTask Object
```javascript
{
  id: string,          // Date.now().toString(36) + random — generated by server at chat time
  title: string,       // Required, max 200 chars
  description: string, // Optional, default ""
  priority: boolean,   // default false
  category: number,    // Category ID; invalid values fall back to 1
  epicId: string|null, // Epic ID or null; invalid IDs coerced to null
  deadline: string|null // ISO 8601 datetime or null
}
```

Staged tasks live in `data/{alias}/ai-staged-tasks.json`. They are **not** real tasks — they have no `status`, `position`, `log`, or `createdDate`. Promoting a staged task creates a real `Task` object and deletes the staged entry.

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
  period: {              // v2.56.0 — absent on older reports
    start, end,          // ISO datetimes
    since: 'previous-report' | 'default-window'
  },
  activity: {            // v2.56.0 — what actually happened in the period
    completed, advanced, created, attention   // arrays of report tasks
  },
  summary: {             // v2.56.0 — optional, written by the AI
    tldr, silos: [{ epic, stakeholder, bullets[] }], attention[],
    generatedAt, model
  },
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

Each task in report content: `{ id, title, description, category, categoryName, epicId, epicName, points }`.
`renderReportView` detects which format is present (`content.columns` array vs legacy keys) and renders accordingly.

---

## Non-obvious Behaviors

These are behaviors not evident from reading the code. Know these before making changes.

### Tasks & Board
- **Positions are server-managed:** on every move or reorder, the server recalculates positions for all tasks in the affected column. Frontend sorts by `position` field on render.
- **Drag cross-column** changes `status` and appends a log entry. **Drag within column** reorders `position` only — no log entry.
- **`applyAllFilters()`** uses AND logic across active filters: cards must match the selected category AND the priority filter AND the selected epic. Queries through `kanban-column` shadow roots to reach `task-card` elements. All filter state is in-memory — resets on page reload.
- **Category filter** is a `<custom-picker type="list">` dropdown (same component as epic filter). Shows all categories with their icons. "All categories" clears the filter. Hidden when only the default "Non categorized" category exists. Single-select.
- **Epic filter picker** always includes "All epics" as its first item (value `''`). Selecting it clears the active epic filter. `renderEpicFilter()` sets `pickerEl.value = activeEpicFilter || ''` so the picker always reflects current state.
- **Clone Task:** the edit modal has a "Clone" button (indigo, `modifier="clone"`) between Cancel and Save. Clicking it calls `openCloneTaskModal()` which closes the edit modal and reopens in Add mode with all task fields copied except `log`; title is prefixed with `"(Clone) "`; snooze is copied only if still in the future. The resulting form submits as a new task creation.
- **Send to Backlog:** the edit modal has a "Backlog" button (slate grey, `modifier="backlog"`) between Clone and Update. Only shown for board tasks (not tasks already in the backlog column). Clicking it closes the modal, moves the task to the backlog column at position 0 via `moveTask()`, and shows a success toast. The server generates a log entry: `"Moved from 'X' to 'Backlog'"`.

### Modal keyboard & dismissal behaviour
- **Backdrop click does not close.** Removed in v2.44.0 — a mis-click while editing a task discarded the whole edit. ESC and the ✕ button remain.
- **ESC closes the topmost modal only** (static open-stack in `<modal-dialog>`), so a confirmation layered over the task modal does not take both down.
- **Enter activates the focused button if one is focused; otherwise it activates the modal's `.js-modalDefault`.** One rule, and it makes the immediate-Enter outcome a property of where the modal puts initial focus:
  | Modal | Focus on open | Enter does |
  |---|---|---|
  | Task modal (add/edit/clone) | the title field | **Saves** (`.js-modalDefault` is the Save/Update button) |
  | Shared confirm, `variant: 'primary'` (archive, generate report) | the accept button | **Confirms** |
  | Shared confirm, `variant: 'delete'` (delete task) | Cancel | **Cancels** — a stray Enter can't delete. Tab to the accept button and Enter there to confirm deliberately |
  | Config-page confirms (epic / category / profile / column delete) | Cancel | **Cancels** — they carry no `.js-modalDefault` |
  | Shortcuts cheat-sheet, report viewer | — | **Nothing** — no default action |
- **Enter is ignored inside a `<textarea>`** (the description needs newlines) and when any modifier key is held. It is *not* ignored in the contenteditable task title, which is single-line — there Enter submits instead of inserting a line break.
- **`.js-modalDefault` may be a `custom-button`.** That component wires its behaviour to its *inner* `<button>`, so clicking the host would never reach it; `handleEnter` reaches through the shadow root to activate the inner button.

### Confirmations
- **One dialog, not one per action.** `openConfirmDialog({ title, message, confirmLabel, cancelLabel, variant })` in `modals.js` drives the single `<modal-dialog class="js-confirmModal">` in `index.html` and returns a `Promise<boolean>`. Adding a confirmable action needs **no new markup and no wiring** — just `if (!await openConfirmDialog({…})) return;`. Do not add another confirm modal for a new action.
- **Every dismissal resolves `false`:** Cancel, Escape, backdrop click and the ✕ button. The ✕/ESC/backdrop paths are picked up through the component's `modal-closed` event.
- **Listeners are per-call.** `openConfirmDialog` attaches its three listeners on open and detaches them *before* calling `close()`, so the `modal-closed` handler cannot re-enter and resolve `false` over an accepted answer. A `settled` guard makes the promise single-resolve. Nothing is left attached between calls.
- **`variant` encodes reversibility, not severity:** `'delete'` (red) for irreversible actions (delete task), `'primary'` (blue) for reversible ones (archive, generate report). The message text should say which it is.
- **The element lookup is lazy and cached** inside `modals.js`, so page modules can call it without threading `elements` through.
- **Confirmed actions:** deleting a task (message names the task), archiving a column (message names the column and the task count; skipped entirely with an info toast when the column is empty, so the dialog never asks about zero tasks), generating a report. The four config-page confirmations (epic / category / profile / column delete) still use their own dedicated modals — they predate this helper.
- **Stacking works:** the task-delete confirmation opens over the still-open task modal; `<modal-dialog>`'s open-stack means ESC dismisses only the confirmation.

### Board rendering (reconciliation)
- **`renderTasks()` reconciles; it does not wipe.** It used to do `columnList.innerHTML = ''` and rebuild every card. Combined with `renderAllColumns()` rendering *all* columns and `moveTask()` rendering twice (optimistic, then again after `fetchTasks()`), a single drag destroyed and recreated **every card on the board, twice** — measured at 20 element teardowns for one move on a 9-card board. Since `task-card` ran a 0.3s `fadeIn` on mount, the whole board visibly blinked on every move.
- **Cards are keyed by `data-task-id`.** Existing elements are reused and updated in place via `KanbanColumn._syncCard()`, which copies `data-*` attributes (adding, updating *and* removing stale ones) plus the renderer-owned classes. Now a same-column reorder reuses 100% of elements and a cross-column move reuses all but the arriving card.
- **Departed cards are removed *before* the placement pass.** Removing them afterwards makes the index-based placement re-insert every card that sat below the departed one — and re-inserting a node restarts its CSS animations, so a card leaving position 0 would replay `fadeIn` down the whole column even though every element was reused.
- **The mount animation is opt-in:** `:host(.--enter)` in `task-card.css`, with `--enter` added by the reconciler to genuinely new cards only and dropped via the card's `Animation.finished`. Putting it on bare `:host` meant any re-insertion replayed it. This makes the blink independent of how many nodes get repositioned, which matters because the placement pass is index-based and can re-insert O(n) nodes for one reorder.
- **`_syncCard` deliberately does not touch** `hidden` (filter state, owned by `applyAllFilters`), `tabindex`/`draggable` (owned by the component), or the transient `--dragging` / `--enter` classes — those are preserved across a re-render, including one that lands mid-drag.
- **The list must contain only `task-card` elements** for index-based placement to line up, so the drop indicator and empty state are removed first.
- **Still O(n) allocations per render:** the renderer builds a detached element for every task on every render just to diff against. That is unchanged from the pre-reconciliation behaviour and is cheap (no `connectedCallback` until insert), but it is the next thing to fix if the N=1000 stress test in RELEASE.md bites.

### Celebration (confetti on arrival)
- **What fires it:** a task *arriving* in a column whose `celebrate` flag is true. `moveTask()` in `app.js` calls `celebrateArrival(id, newStatus)` — guarded by `oldStatus !== newStatus`, so reordering inside the celebrating column does nothing. Every board move funnels through `moveTask` (drag-drop, `Cmd/Ctrl+←/→`, send-to-backlog), so there is one trigger point.
- **Timing matters:** the call sits *after* `await fetchTasks()`, not after the optimistic render. `fetchTasks()` re-renders and recreates every card element, which would silently discard a burst started against the earlier render.
- **The burst belongs to `<kanban-column>`, not `<task-card>`** — `column.celebrate(taskId)`. This is the whole design constraint, and the first implementation got it wrong by putting the layer inside the card:
  - **`.column__list` clips.** It has `overflow-y: auto`, which makes `overflow-x` compute to `auto` as well, so anything rendered inside it is clipped on *both* axes. A card's own edges are only ~17px from the list's padding box, so a burst inside the card could never travel sideways.
  - **Sibling cards paint over it.** Cards are siblings in the list; a particle flying down from one card renders *under* the next one. Nothing inside the card can fix that.

  The layer therefore sits outside `.column__list` as a positioned sibling with `z-index: 2` — unclipped, and painted above every card.
- **The animation is 100% CSS.** JS only positions the layer, hands it the epic hue, and toggles `--active`; `kanban-column.css` owns every keyframe. The sixteen particles are static markup in `kanban-column.html` — nothing is created at runtime — and `:nth-child()` gives each its own `--ox`/`--oy` (origin on the card's perimeter), `--dx`/`--dy` (travel), `--delay` and `--spin`, all feeding one shared `@keyframes confettiBurst`.
- **Particles emit from the card's perimeter, not its centre:** five along the top edge, five along the bottom, three on each side. A centre-origin burst is invisible on a card that is ~550px wide and ~80px tall — most particles never clear the card at all.
- **Sideways travel is shorter than vertical** (~45–65px vs ~75–110px) on purpose: the card sits ~17px inside the column and the board gap is 24px, so a longer sideways throw lands particles inside the *neighbouring* column rather than in the gap.
- **Positioning uses `getBoundingClientRect()` deltas**, not `offsetTop`, so the list's current scroll position is accounted for. The burst does not follow the card if the list is scrolled mid-animation — acceptable for 750ms.
- **Colour is the task's epic colour**, read from the card's `data-epic-color` attribute and set as `--epic-color` on the layer, with two theme accents mixed in via `:nth-child()`. Cards with no epic fall back to `--color-accent-primary` through the CSS var chain. This keeps the burst inside VISION's "colour is semantic" rule.
- **Cleanup uses `Animation.finished`, not `animationend`.** The layer carries a single no-op `confettiLayer` animation spanning the whole burst, so one promise covers all sixteen particles; it needs no event plumbing across the shadow boundary and rejects cleanly when a re-render cancels it. (Note for anyone testing this in an automated browser: a **hidden tab freezes CSS animations entirely** — `currentTime` never advances and `animationend` never fires, though `finished` still resolves if you call `finish()`.)
- **Reduced motion:** the whole thing sits inside `@media (prefers-reduced-motion: no-preference)`, so it never runs for users who opted out. The `--active` class then simply stays on and paints nothing.
- **`:host` on `kanban-column` is `position: relative`** solely to be the layer's containing block. The host has no overflow of its own, which is what lets particles spill past the column edge into the board gap.

### Attachments

Files attached to tasks. Metadata lives on the task object (`attachments[]`), bytes live on disk.

**Where the bytes go:** `data/{alias}/attachments/{taskId}/{attachmentId}{ext}` — outside `public/`, so the static handler can never reach them; the only way out is the download route. Written tmp-then-rename with mode `0600`, matching `writeJsonFile`. The directory is gitignored (`data/*/attachments/`); back it up by copying `data/`.

**The user's filename never becomes a path component.** On disk a file is named by its generated id plus an extension from the MIME allowlist. The original name is stored in JSON for display only, with control characters and path separators stripped.

**Why metadata is embedded on the task rather than in its own file:** archiving, restoring and exporting a task carry its attachment list along for free; `GET /tasks` already returns everything the card's paperclip badge needs, so there is no join and no second request.

**One route set, every store.** `findTaskInAnyStore()` looks the task id up in `tasks.json`, then `archived-tasks.json`, then `ai-staged-tasks.json`. Because attachments are keyed by task id alone, archive → restore moves nothing on disk. Promoting a staged task is the one case that mints a *new* id, so `moveTaskAttachments()` renames the directory to match; if the rename fails the metadata is dropped rather than handing the new task dead links.

**Transport is raw bytes, not multipart/form-data.** The client hands `fetch` the `File` as its body verbatim, with the type in `Content-Type` and the percent-encoded filename in `X-Attachment-Name`. `mini-server.js` exposes `app.raw(pattern)` for this: matching requests skip body parsing and arrive as `req.rawBody` (a Buffer) under a 16 MiB outer cap. Parsing the body as text would corrupt any binary payload — a PNG is not valid UTF-8, and invalid sequences decode to U+FFFD.

**Limits** — three constants at the top of `server.js`, mirrored in `constants.js` so the client can reject early:

| Constant | Value | Notes |
|---|---|---|
| `MAX_ATTACHMENT_SIZE` | 5 MB | Per file |
| `MAX_ATTACHMENTS_PER_TASK` | 20 | |
| `MAX_PROFILE_ATTACHMENT_BYTES` | 200 MB | Measured from disk, so orphaned files still count |

**Serving rules.** `ATTACHMENT_TYPES` is an allowlist mapping MIME → `{ ext, inline }`. Anything outside it stores as `application/octet-stream` with a `.bin` extension and can only be downloaded, never rendered. `image/svg+xml` is **deliberately excluded**: a same-origin SVG can execute script against the app, and every download here is same-origin. Every response carries `X-Content-Type-Options: nosniff`; `Content-Disposition` is `inline` only for allowlisted inline types (`?download=1` overrides), with quotes and non-ASCII stripped from the plain `filename` and the real name in `filename*` (RFC 6266).

**Code files upload as `text/plain`.** Browsers report an empty `File.type` for most code files, which would store them as opaque binaries. `attachmentMimeFor()` in `utils.js` overrides the OS for extensions in `TEXT_ATTACHMENT_EXTENSIONS`, so a pasted snippet previews instead of only downloading. Safe: a `text/plain` response with nosniff is never executed.

**UI.** The task modal's main column has a Description/Files tab strip with a count badge. Files arrive four ways: **dropped anywhere on the open dialog**, pasted anywhere in the modal (the Print Screen → Ctrl+V path), picked via *Browse files*, or dropped straight onto a card on the board. The last two both auto-switch to the Files tab. `kanban-column`'s drag handlers bail out when `dataTransfer.types` contains `Files`, so a file drop never draws a drop indicator or tries to move a task.

**Drop overlay.** `.taskForm__dropOverlay` covers the dialog body while files are dragged over it. Two non-obvious details: (1) `dragenter`/`dragleave` fire once per element crossed, so visibility is gated on a **depth counter**, not a boolean — a boolean flickers off whenever the pointer moves between children; a `dragend` window listener and `modal-closed` both reset it, since a drag ending outside the window never fires `drop`. (2) The overlay is `pointer-events: none` — as a real hit target it would swallow the drop it is advertising.

**Buttons are the design system.** Tile actions are `.btn --ghost --icon --sm` (open in new tab / download / remove — three *labelled* buttons don't fit a 140px tile); *Browse files* is `.btn --secondary --sm`; the viewer footer is `.btn --secondary`, matching its `custom-button` Close. `.btn` carries no `display`, so the `<a>`/`<label>` cases get `display: inline-flex` scoped to the attachment blocks rather than added to the shared class.

**No `loading="lazy"` on thumbnails.** The Files panel starts hidden behind the Description tab, so a lazy image never enters the viewport and never loads — every saved thumbnail rendered broken. A capture-phase `error` listener swaps any thumbnail that won't decode for the generic file icon.

**Two panel modes.** Editing an existing task uploads immediately. Adding a *new* task (or cloning) has no id to attach to, so files queue in memory with object-URL previews and `flushPendingAttachments()` uploads them once the server returns a real task. A queued upload that fails is reported but never fails the save — the task was created regardless.

**Where attachments show up:** paperclip + count on task cards, backlog rows and AI-staged rows; expanded archive rows list their files as download links (the archive has no edit modal, and its Shadow DOM doesn't see `styles.css`, so it renders its own compact list rather than reusing the modal's grid).

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
- localStorage keys are profile-scoped: `{alias}:checklistConfig`, `{alias}:recurrentTasksChecked`, `{alias}:showDailyChecklist`, `{alias}:showNotes`, `{alias}:snoozeVisibility`, `{alias}:deadlineThresholds`, `{alias}:theme`.

### Columns & Board Configuration
- Columns are **per-profile**, stored inside each profile object in `profiles.json` (not a separate file).
- **`celebrate` is a one-time default, not a rule.** `resolveProfile` backfills the field on profiles that predate it: the last board column (highest `order`, excluding the backlog) gets `true`, everything else `false`. Once the field exists the backfill never runs again — adding or reordering columns later must not move the flag, because by then it reflects a user choice. Columns created via `POST` always start `false`.
- The **first column** (order 0) is the default: new tasks are created there; tasks are moved there when a column is deleted.
- Column deletion appends a log entry to each moved task: `"Column 'Wait' deleted – moved to 'To Do'"`.
- Renaming a column does **not** change `task.status` (the column ID is immutable after creation). Existing task logs remain accurate.
- The default four board column IDs (`todo`, `wait`, `inprogress`, `done`) intentionally match legacy `task.status` values — no data migration needed for existing tasks. The fifth default column (`backlog`, `isBacklog: true`) is the permanent backlog.
- `task.status` now equals a **column ID** (any string), not one of four hardcoded values.
- Profiles without a `columns` field are auto-migrated to `DEFAULT_COLUMNS` by `resolveProfile` middleware on first request. Profiles that have columns but lack a backlog column get one auto-added.
- The **backlog column** is permanent: it cannot be deleted (server returns 400), and it is hidden from the Board Configuration modal. It is always created as part of `DEFAULT_COLUMNS`.
- **Column reorder (`PUT /api/:profile/columns`) must include every existing column exactly once** — subsets, missing ids, and duplicate ids are rejected with 400. Accepting a subset would silently drop the omitted columns (orphaning their tasks, and potentially deleting the backlog column).
- **`isBacklog` is immutable after creation** (PUT rejects changes with 400 — unsetting it on the real backlog column would make `resolveProfile` push a second column with id `backlog` on the next request). POST rejects creating a second backlog column.
- `app.js` calls `initKanban(columns)` to create `<kanban-column>` elements dynamically. The first column gets the Add Task button; columns with `hasArchive: true` get an Archive button (both are slotted light DOM, event-delegated from `.kanban`). Both use the **design-system button** — `.btn --primary --sm` and `.btn --secondary --sm` — with no bespoke CSS. They are slotted, so they live in the *document* tree and `styles.css` reaches them; the old `::slotted(.column__addBtn / .column__archiveBtn)` rules in `kanban-column.css` were deleted rather than kept, because document rules out-cascade the shadow tree anyway (same cascade rule as the rail panel note above). Columns with `isBacklog: true` are filtered out of the board view.

### Reports & Archive (independent operations)
- **Report generation** (Reports page FAB button) snapshots all columns in order + notes. Does **not** move, archive, or delete any tasks.
- **Archive** (`Archive` button on a column with `hasArchive: true`) moves all tasks in that specific column to `archived-tasks.json`. Accepts a `columnId` in the body; falls back to the first `hasArchive: true` column. Does **not** generate a report.
- **Archive writes `archived-tasks.json` before `tasks.json`** — per-file writes are atomic but the pair is not, so a crash between the two fails toward a harmless duplicate (task in both files), never toward loss.

### General Configuration
- Accessed via Hamburger → General Configuration; opens a default-size modal with three sections.
- Settings are **profile-scoped** and persisted in `localStorage`.
- **Interface Visibility:** `{alias}:showDailyChecklist` and `{alias}:showNotes` (string `"true"` / `"false"`). Default is visible when key is not yet set — checked via `value !== 'false'`.
- **Snoozed Tasks Display:** `{alias}:snoozeVisibility` (`"hidden"` | `"transparent"`). Default `"hidden"` — snoozed cards are invisible until the toolbar toggle is pressed. `"transparent"` — always visible at 50% opacity; toggle button is hidden.
- **Deadline Urgency Thresholds:** `{alias}:deadlineThresholds` (JSON `[urgentHours, warningHours]`). Defaults `[24, 72]`. Urgent must be less than Warning.
- `loadGeneralConfig()` in `app.js` applies all settings (visibility toggles + `body.--snoozeTransparent`); called once during `init()` and again after saving.
- No server calls — purely client-side. Nothing is deleted from the data layer.

**Snoze visibility is CSS-driven (not JS):** snoozed `task-card` elements receive the class `--snoozed` from `createTaskCard()`. The `task-card.css` `:host(.--snoozed)` rule reads CSS custom properties `--snoozed-card-display` and `--snoozed-card-opacity` that are defined on `:root` and overridden by `.kanban.--showSnoozed` (toggle active) and `body.--snoozeTransparent` (transparent mode). These custom properties inherit through Shadow DOM boundaries, so no JS traversal is needed. `task-card.css` also has `:host([hidden]) { display: none !important }` to keep filter-hidden cards hidden regardless of snooze state.

### Theming (Light / Dark / multiple themes)
- **Model — flat named themes.** A theme is a single, self-contained *appearance*; it simply IS light or dark (the VS Code model). "Dark mode" is not a property a theme has. The registry is `THEMES` in `constants.js` — each entry `{ id, name, appearance: 'light'|'dark' }`. Built-ins: **Light** (cool, the base), **Paper** (warm light), **Dark** (warm dark), **Slate** (cool dark), **Dim** (soft dark), **High Contrast**. Adding a theme = one registry entry + one `[data-theme="<id>"]` block.
- **Mechanism:** the resolved theme id is applied as `data-theme="<id>"` on `<html>`. The base `:root` token values ARE the `light` theme (so id `light` needs no block; `:root` declares `color-scheme: light`). Every other theme is a `[data-theme="<id>"]` block overriding only colour tokens. No component CSS is theme-specific — every themed value reaches Shadow DOM through inherited custom properties (attribute selectors can't cross the shadow boundary, so a per-theme value MUST be a token).
- **Dark themes share ancillaries.** The four dark themes are grouped in one selector list that sets the lifted accents, on-accent text, overlay, inverse text, and epic tokens once; each dark theme then defines only its own neutral surfaces/text (+ `--color-bg-inverse`, and HC bumps `--epic-ring`). Keeps the darks consistent and legible.
- **Token architecture:** alpha-composited colours use `-rgb` channel tokens (e.g. `--color-accent-primary-rgb`, `--color-shadow-rgb`) written as `rgba(var(--…-rgb), 0.08)`, so a tint follows its base colour when a theme swaps it. Inverse surfaces (tooltips) use `--color-bg-inverse`/`--color-text-inverse`. Spacing/radius/type/z-index stay theme-independent in `:root`.
- **Per-profile:** stored at `localStorage["{alias}:theme"]` = a theme id (e.g. `'paper'`, `'slate'`) OR `'auto'`. Default (unset) = `'auto'`, which follows the OS `prefers-color-scheme`, mapping to `AUTO_THEME_LIGHT` (`light`) / `AUTO_THEME_DARK` (`dark`) from `constants.js`. Different profiles can run different themes; switching profile is a full page load, so the bootstrap re-resolves from the new alias.
- **FOUC-safe bootstrap:** an inline `<script>` in `index.html` `<head>` parses the alias from `location.pathname` (the server has already redirected `/` → `/{alias}`); an explicit stored theme id is used as-is, `'auto'`/unset falls back to the OS scheme — set before first paint. It duplicates only the *resolve* step; the source of truth is `utils.js`.
- **Source of truth (`utils.js`):** `getThemeById(id)`, `getThemeAppearance(id)`, `defaultThemeFor(appearance)`, `getStoredTheme(alias)`, `systemPrefersDark()`, `resolveTheme(value)` (explicit known id wins, else OS pair), `applyTheme(alias)` (sets `data-theme` + fires a `themechanged` CustomEvent with `{ theme, appearance }`), `setStoredTheme(alias, value)`.
- **Controls:** (1) the **nav-rail footer toggle** (moon/sun) is the quick light↔dark switch — it jumps to the *default* theme of the opposite appearance (`defaultThemeFor`), persists per profile, and follows the OS live while a profile is on `auto` (via `matchMedia` listener, cleaned up in `disconnectedCallback`). Specific themes (e.g. Paper, Slate) are chosen in Config. (2) **Config → General → Appearance** renders radios generated from `THEMES` + an Auto option, applies instantly. `applyTheme`'s `themechanged` event keeps the rail icon in sync.
- **Epic colours per theme:** epic pills and dashboard epic-name text receive the hue as a `--epic-color` custom property; CSS computes background/text via `color-mix()` driven by `--epic-tint` (12% light / 22% dark) and `--epic-lighten` (0% light / 40% dark) so dark hues (Charcoal/Slate) stay legible on dark. Light themes are identical to the prior `rgba(epic, 0.12)`. Colour circles (avatars, picker swatches/dots) carry an `--epic-ring` inset outline (transparent in light, light ring in dark). Requires CSS `color-mix()`.
- **User-created themes (not built):** deliberately deferred — for a single-user local tool the curated set + the "add a `[data-theme]` block + `THEMES` entry" escape hatch covers the need without a theme-editor's maintenance/contrast-footgun cost. See FUTURE.md.

### Navigation & Routing
- **`<nav-sidebar>`** is a permanent icon-only navigation rail (left side), present on every page. It contains the page links, a toggle button for a slide-out panel holding the checklist/notes (slotted light DOM; panel closes on backdrop click or ESC), the gear link to the config page, and a footer link to the internal design-system page.
- **The slide-out panel's card chrome lives in `styles.css`, not in `nav-sidebar.css`.** The checklist/notes elements are slotted, so they belong to the *document* tree — and normal declarations from the outer tree beat the shadow tree **regardless of specificity**. `::slotted(*) { padding: … }` therefore loses to the global `* { padding: 0 }` reset, which is how the cards shipped with zero padding until v2.41.1. Style them via `.sidebar__section` in `styles.css`. For the same reason, never set `display` on that rule: it would override each component's own `:host` display (`notes-widget` is a flex column).
- **Client-side routing** via `router.js`: `parsePath()` reads `window.location.pathname` → `{ alias, page }`. Valid sub-pages: `dashboard`, `backlog`, `archive`, `reports`, `ai`, `config`, `design-system`. Anything else defaults to `board`.
- **Server route `/:alias/:page`** serves `index.html` for all sub-page URLs. JS reads the pathname and renders the correct view.
- **Non-board pages** hide `appContainer`, show `pageView`, then either call a page module or fall back to the "coming soon" placeholder. Archive calls `initArchivePage`; Backlog calls `initBacklogPage`; Dashboard calls `initDashboardPage`; Reports calls `initReportsPage`; AI calls `initAiPage` — all via dynamic import. Unbuilt pages use `renderPlaceholderPage()`.
- **`pageView.--fullPage`** class modifier removes centering and padding from `.pageView` — applied by page modules that render a full-width layout (archive page sets this on init).
- **Config submenu removed** — all config sections are now inline on the `/:alias/config` page. The gear icon at the bottom of the sidebar is a direct nav link. Profiles modal is opened from the config page via a "Manage Profiles" button. `closeMenu` is kept as a no-op so existing modal callers require no signature change.

### Configuration Page
- Route: `/:alias/config` — left tab nav (sticky, 180px) + right content panel. One section visible at a time.
- `config-page.js` → `initConfigPage(pageViewEl, { elements })`: parallel fetches columns/epics/categories, renders all sections.
- **Sections (tab order):** Columns, Epics, Categories, General, Daily Checklist, AI Assistant, Profiles (below a divider).
- **CRUD sections** (columns, epics, categories, profiles): auto-save on blur/change (same behavior as the old modals). Delete uses confirmation modals from `index.html`.
- **Columns section** carries two per-column checkboxes: *Archive btn* (`hasArchive`) and *Celebrate* (`celebrate`, the confetti burst). The row is `flex-wrap: wrap` and the name input has a `min-width` so two toggles can't crush it on a narrow window.
- **General Settings and Checklist:** manual Save button. Changes take effect on the board when user navigates back (board re-initializes and calls `loadGeneralConfig()`).
- **Appearance (General section):** theme radios at the top of the General panel, generated from the `THEMES` registry plus an Auto option (Auto / Light / Paper / Dark / Slate / Dim / High Contrast) — per profile, applies instantly on change (no Save button), persisted to `{alias}:theme`. Each radio shows a **preview swatch** between the radio and label: a `.themeSwatch` carrying `data-theme="<id>"` so plain `var(--color-*)` inside it resolve to *that* theme's tokens (the `[data-theme]` blocks are attribute selectors, hence the `:root, [data-theme="light"]` alias so Light previews too). The swatch is three equal bands — `--color-bg-primary` / `-secondary` / `-tertiary`; Auto instead shows a light/dark split (two halves carrying `data-theme="light"`/`"dark"`). See Non-obvious Behaviors § Theming.
- **Your Data (General section):** "Export data (JSON)" button calls `GET /api/:profile/export` and downloads the bundle as `mydesktop-{alias}-{date}.json` via a Blob + anchor click. Restore is manual (copy `data/{alias}/` back); import is a possible future feature.
- **AI Configuration:** two-panel list/form inline (same UX as the old modal).
- **Profiles:** inline CRUD section (add, rename, recolor, change letters, set default, delete with confirmation). Deleting the active profile navigates to the first remaining profile's config page.
- **Nav-sidebar:** gear icon at bottom is now a nav link (`data-page="config"`), no more config submenu.
- **No nested scrollbars:** editor lists inside config page have `max-height`/`overflow` overridden to `none`/`visible`.

### Reports Page
- Route: `/:alias/reports` — full list page replacing the "coming soon" placeholder.
- `reports-page.js` → `initReportsPage(pageViewEl, { elements })`: fetches reports, sorts newest-first by `generatedDate`.
- `<list-header>` with 3 columns: Title, Generated, Actions (delete button).
- `<report-row>` component: `setReport(report)`, dispatches `view-report` + `delete-report`.
- **View report**: clicking a row opens the existing `reportsModal` (`<modal-dialog class="js-reportsModal">`) with `renderReportView()` from `modals.js` — supports both new format (`content.columns`) and legacy format.
- **Delete report**: calls `deleteReportApi()`, removes from local array, re-renders rows, toast success.
- **Generate report**: `<page-fab>` at bottom-left calls `generateReportApi()`, reloads list on success.
- **"Generate Report" removed from sidebar Config submenu** — report generation now lives exclusively on the reports page via the FAB button. The `generateReportConfirmModal` has been removed from `index.html`.

### Streaming replies (v2.53.0)

`POST /api/:profile/ai/chat/stream` returns server-sent events instead of one JSON body:

```
event: text   data: {"delta":"Three "}
event: done   data: {narrative, tasks, proposals, memories, usage}
event: error  data: {"error":"..."}
```

**A separate endpoint, not a flag.** The buffered `/ai/chat` stays intact as a fallback: not every OpenAI-compatible server streams correctly, and a client whose stream fails before producing any text simply retries there. Once text *has* arrived the stream was working, so a later failure is a real error and is reported rather than re-asked.

**Tool calls are not streamed.** Both providers emit a tool's JSON arguments as fragments that are only valid once complete, so `ToolCallAccumulator` collects them by index and parses at the end; a fragment that never completes is dropped rather than throwing. All validation and persistence happen before `done` is sent, which is why the streamed and buffered routes store identical results — they share `prepareAiChat()` and `persistAiToolOutput()`.

**`parseSseChunk()` is the piece to be careful with.** A network chunk can end mid-line or mid-event, so the incomplete tail is carried into the next chunk. Getting it wrong silently truncates the model's output, so it is a pure function with its own tests — including one that feeds a payload one character at a time and one that asserts every chunk size parses identically. Source of truth is `public/js/utils.js`; `server.js` carries a duplicate with the standard note.

**Rendering is coalesced onto an animation frame.** Re-rendering the whole transcript per token is far too much work per frame. One consequence worth knowing: in a background tab `requestAnimationFrame` is paused, so intermediate text isn't painted — the unconditional final `emit()` still renders the complete reply when the tab is next visible. Correctness is preserved; only intermediate paints are skipped.

### Assistant memory (v2.52.0)

A short, curated list of durable facts about how the user works — sizing conventions, what an epic really covers, which prefixes map to which work — injected into every system prompt. This is what lets story points and epic conventions compound across sessions instead of resetting.

```js
{ id, text, source: 'user'|'ai', approved: boolean, createdAt }
```

**Deliberately a plain, hand-editable JSON list, not an embedding store.** "Your data, your machine" has to mean a file you can read, edit and version; a vector database would also break the zero-dependency rule for a board this size.

**The AI may propose, never add.** A third chat tool, `propose_memory`, stores entries with `approved: false`. They are returned by the API and shown for review, but `renderMemoryForPrompt()` skips them — nothing reaches a prompt until the user approves it on the config page. Approval can also be revoked. Duplicate text is dropped before storing.

Limits: 40 entries, 300 chars each, and a separate **4000-char prompt budget** — memory rides along with the board snapshot on every message, so it needs a ceiling of its own. The section is omitted entirely when nothing is approved, rather than emitting an empty heading the model reads every turn.

**UI:** a "What the assistant remembers" block under Config → AI Assistant. Unapproved suggestions sort to the top and render dashed — the same "not committed yet" vocabulary as pending attachments and previewed cards — with a *Remember this* button. Approved entries are labelled `yours` or `suggested` and are editable inline on blur.

**Note for anyone extending the prompt:** the test-only `/ai/_test/prompt` endpoint must load exactly what the chat handler loads, or it reports a prompt the model never sees. It was briefly wrong about memory for this reason.

### AI staging on the backlog page (v2.55.0)

The `/:alias/ai` page was **removed**. Its three jobs went to where each belongs:

| Was on the AI page | Now |
|---|---|
| Chat transcript | The floating assistant — same conversation, every page, context-aware |
| Proposed changes | The board's proposal bar and preview, where you see them land |
| Model selector | Config → AI Assistant |
| **Staged tasks** | **The backlog page** |

Staged tasks moved rather than died: a staged task is *proposed work not yet committed to*, which is what the backlog is for. It also gives the backlog a second reason to be opened, which a months-stale backlog needs.

An **AI staging** toggle sits at the right of the backlog header, collapsed by default — the backlog is the page's subject, not the assistant — and auto-opens when something is already waiting, with a count badge. Inside: a roomy paste box (the one thing a 30vh floating panel is bad at) and the staged rows, with all five actions intact (Edit / Clone / → Backlog / → Board / Delete). Promoting re-reads tasks so the item appears in the list below immediately.

The old URL 301-redirects to `/:alias/backlog`. Unknown pages fall back to the board, so without the redirect an old bookmark would land there silently.

The rail's lightning icon and the `g i` chord are gone; the assistant is the floating button.

### Assistant panel (v2.51.0, reworked v2.54.0)

A permanent **AI** button, bottom-left, on every page. Clicking it grows a panel out of the button; `a` still toggles it.

**Floats over everything.** `position: fixed`, `z-index: 1500` — above modals (1000), below toasts (2000) so feedback stays visible with the panel open. It takes no layout track and reserves no space.

**Stays in the bottom band.** `height: 30vh` (min 260px, max 50vh), anchored just above the launcher, so the top half of the screen — where the actual work is — is never covered. `transform-origin: bottom left` plus a 180ms scale makes it read as coming *out of* the button rather than appearing over the page; the animation is inside `prefers-reduced-motion: no-preference`.

**Context is implicit — there is no per-card "Ask AI" button.** `app.js` installs a context provider on `assistant-chat.js`, resolved **fresh on every send** rather than when the panel opened, since the user may have navigated or opened a card since. An open task modal wins over the page: `{ page, taskId }`. The server's `renderChatContext()` re-checks both against real data before they reach the prompt — an unknown task id or page name is dropped — and tells the model to assume the conversation is about an open card unless told otherwise. The panel header shows the resolved context ("About the board", `About "Refactor auth"`), because implicit context the user cannot see is just confusing.

The `/:alias/ai` page stays for long paste-a-transcript sessions and shares the same conversation.

**One conversation, two surfaces.** `public/js/assistant-chat.js` owns the transcript, the pending placeholder, token accounting and persistence; the dock and the AI page both subscribe with `onChange()` and render from `getState()`. This is not just tidiness — both surfaces exist on the same page, and two copies of the history would each PUT the whole transcript to `ai-conversation.json` and clobber each other.

`assistantChat.init()` must run **after** `setApiBase()`: every assistant endpoint is profile-scoped, and calling it earlier fetches `/api/ai/conversation` with no profile.

**The empty state is the point.** Not "ask me anything" — `public/js/assistant-suggestions.js` turns the live board into at most three facts with a verb attached ("1 card past its deadline → Triage them"). Pure and local: no AI call, so it renders with the assistant switched off. Rules fire in priority order — overdue, deadlines this week, stale (14d+), unfiled captures, missing epics (3+), stale backlog (30d+), empty in-progress — and any that find nothing are dropped, so a tidy board says little and an empty board says nothing at all.

Suggestions can only be computed once board data has landed; `initBoardEventListeners()` runs before `setColumns`/`setTasks`, so `refreshAssistantSuggestions()` is called after `renderAllColumns()`.

### Board preview mode (v2.50.0)

Pending proposals rendered **on the board, where they would land**, instead of as a list you have to simulate in your head. Entered from the proposal bar under the header; `Esc` or *Exit preview* leaves.

**It annotates rather than simulates.** The obvious design — apply every proposal to a copy of the board and render the result — would mean a second implementation of the server's `applyProposal()` living in the client: exactly the duplication Code Rule 3 exists to prevent, and a place where the preview could quietly start lying about what apply would do. So cards stay put and are annotated, with **one exception**: a `move` also renders a ghost copy at the top of the destination column, because that is the case where position carries the meaning. The other payoff is that rejecting one proposal just drops its annotation — nothing is re-simulated.

| Card state | Treatment |
|---|---|
| `update` | Dashed border, caption of the change (`size → 8, mark priority`) |
| `move` | Origin card dims (`outgoing`); a dashed accent-bordered ghost appears at the top of the destination (`incoming`, captioned `from To Do`) |
| `delete` | Dashed red border, title struck through |
| untouched | Dimmed to 0.4 — the board stays readable, it just isn't the subject |

Each annotated card carries ✓ / ✕ for a per-card decision; the bar carries *Apply all* / *Discard all*.

**`public/js/board-preview.js` is the pure half** — tasks + proposals → a per-column render plan, no DOM, no fetch, unit tested. `app.js` owns the DOM half; a non-null `previewPlan` is the single source of truth for "the board is in preview mode".

Two implementation notes that are easy to get wrong:

- **Preview state is a `data-preview` attribute, never a host class.** `kanban-column`'s reconciler reuses card elements and syncs `data-*` while stripping classes the renderer didn't set, so a class toggled from inside `task-card.render()` is wiped on the next render. All preview styling keys off `:host([data-preview="…"])`.
- **Dragging is blocked in the dragstart handler, not via `card.draggable`.** The same reconciler deliberately leaves `draggable` alone, so setting it would only affect freshly created cards; reused ones would still drag.

A card with several proposals shows only the most consequential (`delete` > `move` > `update`) plus a `+N more` count — a card carries one accept/reject decision, so it must point at exactly one proposal. The rest surface on the next render.

### AI proposed changes (v2.49.0)

The assistant's second verb. `propose_tasks` creates new work; `propose_changes` edits work that already exists — re-filing, rescheduling, resizing, moving, removing duplicates.

**Nothing proposed reaches the board.** Proposals land in `data/{alias}/ai-proposals.json` and only the apply route moves anything. This is the feature's core promise and there is a test named after it.

```js
{ id, kind: 'update'|'move'|'delete', taskId, payload, reason, createdAt }
```

**There is deliberately no `create` kind.** New tasks already have a reviewable flow — AI staging — where they can be edited, cloned and promoted before touching the board. A second creation path would be a worse experience, not a richer one.

**Validated twice, on purpose.** `normaliseProposal()` drops anything referencing a task, column, epic or category the profile doesn't have (a review buffer full of un-appliable rows is worse than a shorter honest one), and an update whose payload would change nothing. Then `applyProposal()` re-runs `validateTaskInput` / `validateMoveInput` **at apply time** — the board may have moved on since the proposal was written, so a stored proposal is never trusted. It shares the *validators* with the hand-driven routes rather than the handlers, and mirrors their logging (`"Moved from 'X' to 'Y'"`, `"Category changed from X to Y"`).

A stale proposal returns `409 { discarded: true }` and is removed: re-offering something that cannot apply is noise. `apply-all` reports per-proposal failures instead of aborting the batch — each proposal is an independent decision the user already made — and consumes the whole buffer either way.

Capped at `MAX_PROPOSALS` (50). An unbounded review list stops being reviewable, which defeats the point.

**UI:** a `<proposal-row>` per change in a Proposed Changes section on the AI page, above Staged Tasks, hidden entirely when the buffer is empty. Each row states the verb, the task, the change in one line, and the AI's reason. `delete` is the only verb that gets colour — it is the only irreversible one.

### Reports have a period (v2.56.0)

A report used to be a **board snapshot** — every column as it stood. That answers "what is on my board", not "what did I do", which is the question a weekly one-to-one actually asks. Two concrete failures on real data: the Done column accumulates until you archive, so it spanned weeks rather than the period; and anything **archived** during the week was missing from the report entirely.

Reports now carry a `period` and an `activity` breakdown:

- **Period** runs from the previous report's `generatedDate` — literally "since we last spoke" — falling back to `DEFAULT_REPORT_PERIOD_DAYS` (7) when there is no previous report.
- **completed** merges tasks in a `hasArchive` column with the archive, filtered by completion time.
- **advanced / created / attention** cover moved-but-unfinished, new, and overdue-or-untouched.
- `epicName` and `points` ride along, so a summary can group by silo even if the epic is later renamed.

**Archiving now stamps `archivedDate`.** Completion used to be inferred from the last log entry, which records the last *move* — usually but not always the moment work finished.

**The date-only trap.** Log entries are `YYYY-MM-DD` app-wide, so a log-derived completion parses to **midnight**. Compared against an exact period start of, say, 15:20 today, everything finished earlier that day is ruled out — silently dropping a day of work from a report shown to a manager. Day-precision stamps are therefore compared against the **start of the period's day** (`taskCompletedAt` returns `{ at, precision }`). Erring toward one duplicated item at a boundary beats losing a day's work.

**And that floor must be UTC.** Log dates are written as `new Date().toISOString().split('T')[0]` — UTC dates — and `Date.parse` reads them back as UTC midnight. Flooring in *local* time mixes the two: east of Greenwich local midnight is later than the UTC midnight it is compared against, so the day's work is ruled out anyway. It bites hardest in the small hours, when the local and UTC dates differ. `startOfDayUtc()`, with a regression test.

### AI report summary (v2.56.0)

`POST /:profile/reports/:id/summarise` turns a report's activity into what gets read out in a one-to-one:

```js
summary: { tldr, silos: [{ epic, stakeholder, bullets[] }], attention[], generatedAt, model }
```

**Grouping and counting are done in code, not by the model** — deterministic, free, and not something to trust a model with. The model does the one thing code cannot: **ticket titles are not presentation bullets**. Rewriting `"ESB-767 - Shipping address not changes on order"` into `"Fixed shipping addresses not updating on orders"`, and merging several related tickets into one line, is the manual work this replaces.

- Grouped **by epic**, with the epic's `stakeholder` attached — which is what makes the grouping useful in a conversation rather than merely tidy.
- `attention[]` is for things to *raise* rather than report; a one-to-one is also where blockers get surfaced.
- Model output is validated: silo names are matched against epics actually present in the report, so **a hallucinated silo cannot reach a document taken into a meeting**.
- The prompt carries only the report's activity, never the board snapshot — one period, cheaper, and no invitation to discuss out-of-scope work.
- Fired **after** generation, never as part of it: the report must appear instantly and must never fail because a model was slow or absent. Same endpoint backs the *Regenerate summary* button.
- Reports predating `activity` return `summarised: false` with a reason rather than being summarised from a snapshot.
- **Copy as bullets** puts it on the clipboard as plain text, which is where it ends up anyway.

### Control height scale (v2.57.0)

`--control-height-sm / md / lg` (28 / 36 / 44px) in `:root`.

Buttons sized themselves by padding while fields added a 1px border on top, so a button and a field with identical padding landed ~2px apart — which is why they never lined up. Both now take an **explicit height** from this scale, making alignment a property of the token rather than of arithmetic. `.btn`, `custom-button` and `custom-picker` all use it, as do the listed single-line text controls.

Textareas are deliberately excluded: they size to content. The control list is explicit rather than a blanket `input` match, so a checkbox is never given a 36px box.

**A button placed beside a field must use the same size.** A `--sm` button next to a default field is the mismatch this scale exists to prevent.

### Story points (v2.48.0)

`task.points` — one of `1, 2, 3, 5, 8, 13, 21, 34, 100`, or `null` for unestimated. `STORY_POINTS` in `server.js` and `constants.js` (source of truth: the server).

| 1 | 2 | 3 | 5 | 8 | 13 | 21 | 34 | 100 |
|---|---|---|---|---|---|---|---|---|
| minutes | under an hour | half a day | a day | nearly too big | one to two days | several days | a week or more | **∞ — too big to size** |

**100 stands for infinity**: not an estimate but a prompt to split. It is stored as `100` rather than a glyph so sorting and validation need no special casing, and rendered as `∞` in the pills and on the card chip. Its pill is dashed for the same reason. The server rejects anything off the scale, including 4, 7 and 55.

**No velocity, burndown or sprint reporting is built on these, and none should be** — that is team ceremony, and this is a single-user tool. Points exist to answer "is this too big?" and "what fits today?".

Rendered as a chip on the task card (tabular figures, no colour — colour means epic and priority) and as toggleable pills in the task modal, matching the epic pills: clicking the selected value again clears the estimate. The AI may suggest a value during quick-capture classification; it is never required to.

### Epic contexts (v2.48.0)

An epic used to be a name and a colour. The pain epics were meant to solve is *silo switching* — different stakeholders, different expectations, different conversations — which needs three optional fields:

```js
stakeholder: string,    // "PM", "my boss", "the team", "compliance"
cadence: string,        // "weekly sync", "he asks Mondays", "deadline-driven"
expectations: string    // what this person needs, and when
```

Max 500 chars each, edited on the config page (auto-save on blur, matching the other CRUD sections), and **fully useful with the AI switched off** — they are notes to yourself first.

When set, they render into the AI system prompt beneath the epic, which is what lets the model reason about stakeholders rather than topics. When unset they are omitted entirely, so older profiles don't pay for empty labels.

`validateEpicContext()` / `applyEpicContext()` are shared by the create and update routes so the two can't drift.

### Quick capture (v2.47.0)

The hallway-conversation problem: someone asks for something in passing, filing it properly costs more attention than is available, so it never gets written down. `c` from any page opens a one-line bar; Enter files it and closes.

**Two requests, deliberately.**

1. `POST /api/:profile/capture` — creates the task and returns. **Makes no AI call at all**, which is what lets capture be instant (measured: ~17ms) and unconditionally reliable. Lands at position 0 of the first non-backlog column with `needsFiling: true` and a `"Captured"` log entry. Text past the 200-char title cap spills into the description rather than being truncated away — a captured note is the user's own words.
2. `POST /api/:profile/tasks/:id/classify` — the slow, optional half. Sets epic, category, priority, destination column and deadline, and may rewrite the title into an actionable phrase (the original wording moves to the description). **Always answers 200**, with `classified: false` and the untouched task when the AI can't help, so callers never treat a missing classification as an error.

**The propose-first rule is relaxed here, and only here.** Capture applies without review because reviewing in the moment *is* the friction that stops notes being captured at all. Creating a card is reversible and non-destructive, and the real alternative is not a correctly-filed card but no card. The toast carries an Undo (a hard delete — the card is seconds old and was never meant to exist), and `needsFiling` marks it for a later review pass.

Classification output is advisory: every field is validated against the profile's actual epics, categories and columns before anything is written. Columns with `hasArchive` are excluded as destinations — nothing captured seconds ago belongs in Done.

`buildClassifyPrompt()` is board-free by design. It runs on every captured note and carries only epics, categories and destination columns, so it stays cheap.

**Client note:** `POST /capture` shifts every other card in the target column down server-side. The optimistic insert must mirror that shift locally, or it collides with an existing `position: 0` and renders in the wrong slot. When classification *moves* the task, `app.js` re-syncs with `fetchTasks()` rather than repeating the arithmetic for the destination column — classification is already off the critical path.

### AI board context (v2.46.0)

The system prompt carries a **compact snapshot of the live board** — this is what turns the feature from a text-to-tickets parser into an assistant. Before this it injected only epic and category *names*; the model had never seen a task.

- `buildBoardSnapshot()` renders columns and their cards as a terse text table — **never raw JSON**. Repeating field names on every card costs several times what a positional line does, and the snapshot is re-sent on **every message**, making it the feature's largest cost driver. Measured against a real 34-card board: ~1,250 tokens.
- Scope: live board + backlog. Descriptions, activity logs, attachments and the archive are excluded, to be loaded on demand.
- Tasks whose `status` matches no column are **excluded**, with the count disclosed to the model. Real profiles carry these from before `archived-tasks.json` existed; including them would pad every request for no benefit.
- Epic `stakeholder` / `cadence` render into the prompt when present — optional, absent on older profiles.
- **`propose_tasks` is no longer mandatory.** The old prompt ordered the model to call it every turn, which made conversation structurally impossible: a question got tickets instead of an answer.
- Test-only `GET /api/:profile/ai/_test/prompt` returns the built prompt so the snapshot can be asserted without a live provider. Registered only under `RATE_LIMIT_DISABLED=1`, like `/api/_test/reset-rate-limit`.

### AI graceful degradation (v2.46.0)

**Contract: no AI call is ever awaited before rendering something the user asked for.** The AI is an accelerator, never a dependency. Full table in [docs/design/AI_ASSISTANT.md](docs/design/AI_ASSISTANT.md).

- `GET /api/ai/availability` reports whether the AI is usable (config present, known provider, key set). It always answers `200` with a boolean and, when false, both a machine-readable `reason` and a human-readable `message`.
- The AI page checks availability **after** it paints, never before. When unavailable the transcript and staged tasks stay fully usable; only the composer is disabled, with the reason stated inline and a pointer to Config → AI Configuration. Silent disabling is the failure mode being avoided.
- `fetchAiAvailabilityApi()` swallows its own transport errors and returns `{ available: false, reason: 'offline' }` — an unreachable server is just another flavour of "no AI", not a broken page.
- A failed conversation save is a warning, not an error: the exchange is already on screen, it just won't survive a reload.

### AI conversation persistence (v2.46.0)

Stored in `data/{alias}/ai-conversation.json`. The client owns the transcript and PUTs it back after each exchange; the server drops any role that isn't `user`/`assistant` (the client's `__thinking__` placeholder must never be replayed as a real turn) and keeps the most recent 200 messages.

### AI Assistant Page
- **Conversation history is in-memory only** — cleared on page reload. The server is stateless per request; the client sends the full `messages` array with every chat call.
- **Dual output** via Tool Use / Function Calling: the `propose_tasks` tool forces the AI to return both a `narrative` (text reply) and a `tasks` array (structured JSON) in a single response. If the model ignores tool calls, `extractTasksFromText` attempts to parse raw JSON from the response text as a fallback.
- **Two provider formats:** `anthropic` calls the Anthropic Messages API directly; `openai-compatible` calls any OpenAI-format REST endpoint (covers OpenAI, Groq, LM Studio, Ollama, Jan, LocalAI). The `custom` provider is an alias for `openai-compatible` with a user-defined `baseUrl`.
- **API key security:** `data/ai-config.json` is gitignored and never served statically. `GET /api/ai/config` returns `hasKey: true/false` but never the raw key. Saving with an empty `apiKey` field preserves the existing key.
- **Custom provider `baseUrl` must start with `http://` or `https://`** — the server fetches the URL itself, so other schemes are rejected with 400 (SSRF guard).
- **System prompt is dynamic:** `buildAiSystemPrompt()` injects the profile's current epics and categories so the AI returns valid IDs. The prompt instructs it to propose tasks only — never delete or move.
- **`normaliseStagedTask()`** validates AI output server-side: invalid category IDs fall back to 1, invalid epic IDs are coerced to null, title is truncated to 200 chars.
- **Staged task edits do not sync back to the conversation.** Editing a staged task updates `ai-staged-tasks.json` only; the AI has no awareness of user edits.
- **Clone from staged** opens the standard task modal pre-filled, saves directly to the first non-backlog board column — it does NOT create another staged task.
- **`--archive-col-actions`** is overridden to `300px` on `.aiPage` to accommodate the 5-button action bar (Edit, Clone, → Backlog, → Board, Delete).
- **Rate limit:** `POST /api/:profile/ai/chat` is limited to 10 requests per minute (separate `aiLimiter` from the standard write limiter).

### Keyboard Shortcuts
- `shortcuts.js` → `initShortcuts({ alias, board })` — one document-level `keydown` listener; calling again replaces the previous handler. Wired by `app.js`: board page passes `board` actions (quickAdd + moveCard via `moveTask`), other pages pass only `alias`.
- **Global:** `g` then `b/d/l/a/r/i/c` navigates pages (1s chord window); `?` opens the cheat-sheet modal (`.js-shortcutsModal` in `index.html`).
- **Board:** `n` quick-add; `j/k`/`↓↑` focus cards within a column; `h/l`/`←→` across columns (same row index, clamped); `Enter` opens the focused card (handled by `<task-card>` itself — host has `tabindex="0"` and dispatches `request-edit` on Enter); `Cmd/Ctrl+←/→` moves the focused card to the adjacent column at position 0 and refocuses it after re-render. This is the keyboard alternative to drag-and-drop.
- **Guards:** all shortcuts are ignored while typing (checked via `e.composedPath()[0]` so shadow-DOM inputs are detected) or while any `modal-dialog[open]` exists. `Cmd/Ctrl+arrow` is only intercepted when a card is focused, so browser history navigation keeps working.
- **Focus ring:** `task-card.css` `:host(:focus-visible)` — keyboard-only outline, no ring on mouse click/drag.

### Design System Page
- Route: `/:alias/design-system` — an **internal style-guide page** (live reference for typography classes and the full button system, rendered from the current `:root` token set). Linked from the nav rail footer.
- `design-system-page.js` → `initDesignSystemPage(pageViewEl)`. Read-only; no API calls.
- Section nav uses `js-` hooks + `scrollIntoView` — fragment hrefs (`#typography`) would resolve against `<base href="/">` and navigate back to the board.
- Audience: development and the design engagement, not end users. Kept in the nav because this is a single-user tool.

### Privacy Toggle
- Purely client-side CSS toggle — no server calls, no persistence.

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

### `<nav-sidebar>`
```html
<nav-sidebar class="js-navSidebar">
    <!-- light DOM children are slotted into the slide-out panel -->
    <daily-checklist></daily-checklist>
    <notes-widget></notes-widget>
</nav-sidebar>
```
- **Permanent icon-only rail** — always visible on the left of every page; there is no open/close API for the rail itself.
- **Attributes:** `alias` (profile alias, builds href values on nav links), `page` (active page name, sets `--active` on the matching link)
- **Slide-out panel:** the panel button toggles a `--panelOpen` class on the host; slotted children (checklist, notes) render inside it. Closes on backdrop click or ESC (document listener added on open, removed on close/disconnect).
- **Gear icon** at the bottom is a plain nav link to `/:alias/config`; the footer also links to `/:alias/design-system`.
- **Theme toggle** (`.js-themeToggle`, moon/sun) in the footer — quick light/dark switch, per profile (see Non-obvious Behaviors § Theming). Imports the theme helpers from `utils.js`; listens for `themechanged` + OS `matchMedia` changes (both cleaned up in `disconnectedCallback`).
- **Accessibility:** the rail `<nav>` has `aria-label="Main navigation"`; the active link carries `aria-current="page"` (kept in sync by `_updateActive`); the slide-out panel is an `<aside aria-label="Checklist and notes">`.

### `<kanban-column>`
```html
<kanban-column data-status="done"></kanban-column>
```
- **JS API:** `celebrate(taskId)` — plays the confetti burst around the named card (see Non-obvious Behaviors § Celebration). Awaits the component's internal `_ready` promise, so it is safe to call immediately after a render. No-ops if the card isn't found.
- Cards are rendered into `.column__list` (a scroller); the celebration layer is a positioned sibling of that list so it is neither clipped nor painted under other cards.

### `<profile-selector>`
```html
<profile-selector class="js-profileSelector"></profile-selector>
```
- Avatar button + profile name + dropdown for switching profiles
- **JS API:** `setProfiles(profiles)`, `setActiveProfile(profile)` — safe to call before connection (renders on connect)
- **Dispatches** (bubble+composed, `detail: { alias }`): `profile-select` (navigate to profile), `profile-open-new-tab`
- ESC + click-outside close the dropdown; document listeners cleaned up in `disconnectedCallback`

### `<app-welcome>`
```html
<app-welcome></app-welcome>
```
- Static greeting + date/weekday/week-number header. No attributes, no JS API, no events.
- **Greeting and date sit side by side on one line** (v2.44.1), baseline-aligned, to keep the header short — it costs ~23px less vertical space than the old stacked layout, on every page. `flex-wrap` returns it to two lines when the header is too narrow; the date group is `white-space: nowrap` so it wraps as a whole rather than breaking between its own parts.

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
- **Used in:** epic/profile color pickers (`type="color" columns="5"`), category icon picker (`type="icon" columns="7"`), epic filter + category filter (`type="list"`). (The task-modal epic field is no longer a picker — it's a clickable pill list, `.taskForm__epicSelector`, like the category pills.)
- **List item `icon` property:** optional; when set, renders an `<svg-icon>` before the label text (used by category filter dropdown)

### `<assistant-dock>`

The assistant panel (`public/components/assistant-dock/`). Present on every page.

- **API:** `open(prompt?)` (pre-fills but never sends), `close()`, `toggle()`, `isOpen`, `setSuggestions(list)`, `setPendingCount(n)`, `setContextLabel(text)`
- **Events:** `assistant-replied` `{ tasks, proposals }`, `assistant-closed`, `review-proposals` (the header's pending badge — the way back to board preview)
- Subscribes to `assistant-chat.js` in `connectedCallback` and unsubscribes in `disconnectedCallback`.
- Escape closes it, except when a modal is open (that Escape is the modal's) or the composer holds unsent text (which it clears instead — a stray Escape must not discard a half-written message).

### `<proposal-row>`

One AI-proposed change awaiting review (`public/components/proposal-row/`).

- **API:** `setProposal(proposal, { taskTitle, columnName, epicName, categoryName })`
- **Events:** `apply-proposal`, `reject-proposal` (both bubble + composed) — `{ detail: { proposalId } }`
- Renders the change as a sentence (`size → 8, mark priority`, `→ In Progress`, `Remove from the board`) so a row can be judged without opening anything.
- Buttons are styled locally from the shared tokens, matching `backlog-row` / `ai-staged-row` — document `.btn` rules don't cross the shadow boundary.

### `<quick-capture>`

Global one-line capture bar (`public/components/quick-capture/`). Present in `index.html` on every page; opened with `c`.

- **API:** `open()`, `close()`, `toggle()`, `isOpen`, `setHint(text)`
- **Events:** `capture-submit` (bubbles, composed) — `{ detail: { text } }`
- Owns no network calls: `app.js` decides what a capture means.
- Deliberately not a `<modal-dialog>` — a dialog asks to be read and dismissed; this takes a line and disappears. Closes on Enter (before the network call resolves), Escape, or backdrop click.

### `<modal-dialog>`
```html
<modal-dialog class="js-myModal" size="large">
    <span slot="title">Title</span>
    <div>Content</div>
</modal-dialog>
```
- Open/close: `element.open()` / `element.close()`
- `size`: `"large"`, `"small"`, or omit for default
- Handles close button and ESC key internally. **Backdrop click does NOT close** (v2.44.0) — it was too easy to lose a half-written task by mis-clicking; ESC and ✕ are the ways out.
- **Enter confirms:** activates the element marked `.js-modalDefault` in the modal's light DOM. See Non-obvious Behaviors § Modal keyboard behaviour.
- **Never** open/close by toggling classes directly
- **Accessibility (v2.39.0):** host carries `role="dialog"` + `aria-modal="true"`; `aria-label` is computed from the slotted title's text on every open (titles change — "Add Task"/"Edit Task"). Focus moves into the dialog on open, Tab is trapped inside (wraps both ends; `custom-button`/`custom-picker` participate via `delegatesFocus`), and focus is restored to the pre-open element on close.
- **Stacked modals:** a static open-stack means ESC and the focus trap only act on the **topmost** modal — a confirmation layered over the task modal no longer closes both on one keypress.

### `<list-header>`
```html
<list-header class="js-listHeader"></list-header>
```
- Inline Web Component (no external .html/.css)
- **JS API:** `setColumns([{ id, label, sortable? }])` — defines columns and renders; `setSort(field, direction)` — sets initial active sort without dispatching an event
- **Dispatches:** `sort-change` (bubbles+composed) → `{ detail: { field, direction: 'asc'|'desc' } }`
- Clicking a sortable column cycles `asc → desc → asc`. First click on a new column defaults to `asc`.
- Column widths controlled via CSS custom properties: `--archive-col-title`, `--archive-col-epic`, `--archive-col-category`, `--archive-col-date`, `--archive-col-actions`

### `<archive-row>`
```html
<archive-row></archive-row>
```
- Shadow DOM, loads `archive-row.html` + `archive-row.css` via fetch (cached in `static templateCache`)
- **JS API:** `setTask(task, { epicName, epicColor, categoryName, categoryIcon })` — sets data and renders
- Expand/collapse: clicking anywhere on the row header toggles the detail panel (description, meta, reversed activity log). Restore button click does NOT toggle expand.
- **Dispatches:** `restore-task` (bubbles+composed) → `{ detail: { taskId } }`
- Column widths match `<list-header>` via the same `--archive-col-*` CSS custom properties (inherit through Shadow DOM)
- Epic pill uses `_hexToRgba(epicColor, 0.12)` background + solid `epicColor` text (same as task-card)

### `<backlog-row>`
```html
<backlog-row></backlog-row>
```
- Shadow DOM, loads `backlog-row.html` + `backlog-row.css` via fetch (cached in `static templateCache`)
- **JS API:** `setTask(task, { epicName, epicColor, categoryName, categoryIcon })` — sets data and renders
- Flat row (no expand): title, epic pill, category icon, created date, Edit + Promote buttons
- **Dispatches** (bubble+composed, `detail: { taskId }`): `backlog-edit`, `backlog-promote`
- Column widths match `<list-header>` via the `--archive-col-*` CSS custom properties

### `<ai-staged-row>`
```html
<ai-staged-row></ai-staged-row>
```
- Shadow DOM, loads `ai-staged-row.html` + `ai-staged-row.css` via fetch (cached in `static templateCache`)
- **JS API:** `setTask(task, { epicName, epicColor, categoryName, categoryIcon })` — sets data and renders
- **Dispatches** (all bubble+composed, `detail: { taskId }`): `ai-edit`, `ai-clone`, `ai-promote-backlog`, `ai-promote-board`, `ai-delete`
- Column widths match `<list-header>` via `--archive-col-*` CSS custom properties; `.aiPage` overrides `--archive-col-actions: 300px` for the 5-button action bar
- Epic pill uses `_hexToRgba(epicColor, 0.12)` background + solid `epicColor` text

### `<report-row>`
```html
<report-row></report-row>
```
- Shadow DOM, loads `report-row.html` + `report-row.css` via fetch (cached in `static templateCache`)
- **JS API:** `setReport(report)` — sets report data and renders (title, generatedDate)
- Clicking the row dispatches `view-report`; clicking the Delete button dispatches `delete-report`
- **Dispatches** (all bubble+composed, `detail: { reportId }`): `view-report`, `delete-report`
- Column widths: `--archive-col-title` (flex 4), `--report-col-date` (flex 1.5), `--archive-col-actions` (80px on `.reportsPage`)

### `<page-fab>`
```html
<page-fab label="Add task" icon="+"></page-fab>
```
- Inline Web Component (no external .html/.css) — reusable floating action button for list pages
- **Attributes:** `label` (aria-label, default "Add"), `icon` (button text, default "+")
- **Dispatches:** `fab-click` (bubbles+composed)
- Used in: backlog page (add task), reports page (generate report)

### `<toast-notification>`
```javascript
elements.toaster.success('msg')  // green
elements.toaster.error('msg')    // red
elements.toaster.warning('msg')  // yellow
elements.toaster.info('msg')     // beige
```
- Single instance in `index.html`: `<toast-notification class="js-toaster">`
- Auto-dismisses after 4s; stacks multiple toasts; has close button
- Container is a `role="status"` / `aria-live="polite"` region, so screen readers announce toasts

---

## Modals Reference

All CRUD editors (categories, epics, profiles, columns, checklist, AI config, general settings) live **inline on the config page** since v2.37.0 — only confirmations and the task/report viewers remain as modals. The 8 modals below are everything in `index.html`.

| JS hook                          | Purpose                          | Size    | Trigger                                    |
|----------------------------------|----------------------------------|---------|--------------------------------------------|
| `.js-taskModal`                  | Add / Edit / Clone task          | large   | [+ Add Task] / [Edit] on card; Clone button in edit mode reopens as add; also reused by backlog + AI pages. The modal **header is the inline-editable task title** (`.taskForm__title`, a `contenteditable` heading — replaces the old "Add Task"/"Edit Task" label *and* the body Title field; new tasks default to `DEFAULT_TASK_TITLE` "New task", pre-selected; reads via `textContent`). Two-column body (`.taskForm__grid`): left = description (textarea fills height), right = priority/category/epic/schedule/log; stacks below 720px |
| `.js-reportsModal`               | View a report                    | large   | Clicking a row on the Reports page                     |
| `.js-confirmModal`               | **Shared confirmation dialog** — generic; every confirmable action reuses it via `openConfirmDialog()` (see Non-obvious Behaviors § Confirmations). Currently: delete task, archive column, generate report. | small   | `openConfirmDialog()` in `modals.js`                   |
| `.js-epicConfirmModal`           | Epic delete confirmation         | small   | Delete in config page → Epics                          |
| `.js-categoryConfirmModal`       | Category delete confirmation     | small   | Delete in config page → Categories                     |
| `.js-profileConfirmModal`        | Profile delete confirmation      | small   | Delete in config page → Profiles                       |
| `.js-columnConfirmModal`         | Column delete confirmation       | small   | Delete in config page → Columns                        |
| `.js-shortcutsModal`             | Keyboard shortcuts cheat-sheet  | default | `?` key (any page)                                     |
| `.js-generalConfigModal`         | **Dead** — general settings moved to the config page; `openGeneralConfigModal()` in app.js has no callers. Flagged for the next dead-code sweep. | default | (none) |

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
body.--privacyMode .column[data-status="done"] { }

/* CORRECT — target the custom element */
body.--privacyMode kanban-column[data-status="done"] { visibility: hidden; }
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
| `task.deadline` | Optional ISO 8601 datetime string or null |
| `task.snoozeUntil` | Optional ISO 8601 datetime string or null |

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
| `router.js`      | Client-side path parser: `parsePath()`, `buildPath()`  |
| `filters.js`     | Category, priority, epic filter logic                  |
| `shortcuts.js`   | Keyboard shortcuts (chords, card navigation, help)     |
| `modals.js`      | All modal dialog logic                                 |
| `*-page.js`      | One module per sub-page: archive, backlog, dashboard, reports, ai, config, design-system — each exports `init<Name>Page(pageViewEl, …)` |
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
