# Component & Interaction Catalog

Machine-readable reference for every UI element, interaction pattern, and visual state in the application. Companion to `DESIGN_BRIEF.md`.

---

## 1. Global Page Shell

### 1.1 HTML Structure

```
<html>
  <body>
    <div class="appShell">                ← full-viewport flex row
      <nav-sidebar>                       ← permanent icon-only rail, left, all pages
        <daily-checklist>                 ← slotted into the rail's slide-out panel
        <notes-widget>                    ← slotted into the rail's slide-out panel
      </nav-sidebar>

      <div class="appShell__main">        ← header + content column
        <header class="appHeader">        ← top bar, all pages
          <div class="appHeader__left">
            <app-welcome>                 ← "Welcome, {Name}" + date/weekday/week#
          </div>
          <div class="appHeader__actions">
            <div class="js-toolbarMount"> ← board-only toolbar injected here at runtime
            <profile-selector>            ← avatar + dropdown, all pages
          </div>
        </header>

        <div class="appContainer">        ← board page only
          <main class="kanban">           ← columns grid
            <kanban-column> x N
          </main>
        </div>

        <div class="pageView">            ← non-board pages (dashboard, backlog, archive, reports, ai, config, design-system)
      </div>
    </div>

    <modal-dialog> x 8                    ← task, report viewer, 5 delete confirms, 1 legacy (see section 6)
    <toast-notification>                  ← notification stack, bottom-right
  </body>
</html>
```

### 1.2 App Header

| Element | Description | Visual |
|---------|-------------|--------|
| `.appHeader` | Top bar, full width of `.appShell__main` | Flex, space-between, white bg, bottom border |
| `<app-welcome>` | Shadow DOM component | Title: "Welcome, {name}" (22px, weight 600). Subtitle: date + weekday + "Week {n}" separated by bullets (14px, grey) |
| `.toolbar` | Board-page-only filter bar (injected into `.js-toolbarMount` at runtime) | Flex row, gap 8px. Contains: category dropdown, epic dropdown, priority toggle, snooze toggle, privacy toggle |
| `<profile-selector>` | Shadow DOM component | 40px coloured circle (profile colour bg, white letters text, weight 700). Click → dropdown. Hover: scale 1.05 + shadow |

### 1.3 Profile Selector Dropdown

| State | Visual |
|-------|--------|
| Closed | Only the circular avatar button visible |
| Open | Dropdown below avatar. White bg, border, shadow, 8px radius. Slide-down animation 0.2s |
| Profile item | 10px padding, 6px radius. Shows coloured avatar + name |
| Active profile | Blue bg, bold text |
| Hover | Light grey bg |

---

## 2. Navigation Rail (`<nav-sidebar>`)

Shadow DOM component. **Permanent icon-only rail** on the left edge, present on every page. The old slide-over overlay + config submenu pattern was replaced (v2.37) — the rail is always visible and the board content sits beside it.

### 2.1 Anatomy

```
.navSidebar__rail              ← the rail itself: fixed narrow column, full height
  .navSidebar__nav
    .navSidebar__item x 6      ← Board, Dashboard, Backlog, Archive, Reports, AI (svg-icon + tooltip)
    .navSidebar__spacer
    .js-panelBtn               ← toggle for the slide-out panel (checklist + notes)
  .navSidebar__footer
    theme toggle (js-themeToggle) ← moon/sun, quick light↔dark switch (per profile)
    design-system link         ← internal style-guide page
    config gear                ← plain nav link to /:alias/config
.navSidebar__panelBackdrop     ← backdrop behind the open panel
.navSidebar__slidePanel        ← slide-out panel; <slot> renders checklist + notes
```

### 2.2 States

| State | Visual |
|-------|--------|
| Rail | Always visible; no open/closed state |
| Nav item default | Grey icon |
| Nav item hover | Light grey bg + tooltip with page name |
| Nav item active | Accent treatment on the icon for the current page |
| Panel closed | Panel hidden, backdrop invisible |
| Panel open | `--panelOpen` on host; panel slides out beside the rail, backdrop visible |

### 2.3 Interactions

- Nav items: standard links (enable right-click → open new tab)
- Panel button: toggles the checklist/notes slide-out panel
- Panel close: click backdrop or press Escape
- Gear + design-system: plain navigation links (full page loads)

---

## 3. Board Page Components

### 3.1 Kanban Column (`<kanban-column>`)

Shadow DOM component.

**Anatomy:**
```
.column
  .column__header
    h2.column__title           ← column name, uppercase, 11px, 1.5px letter-spacing
    .column__actions           ← slotted buttons from light DOM
  .column__list                ← task cards container, flex column, gap
```

**Slotted buttons (light DOM, styled via `::slotted`):**
- `.column__addBtn` — "Add Task" button. Blue bg (accent). Only on first column.
- `.column__archiveBtn` — "Archive" button. Grey outline. Only on columns with `hasArchive: true`.

| State | Visual |
|-------|--------|
| Default | White bg, 1px border, 8px radius. Min-height: calc(100vh - 200px) |
| Empty | Same, just no cards inside |
| Drag-over (drop target) | Light blue bg tint (rgba(26,115,232,0.04)) |

### 3.2 Task Card (`<task-card>`)

Shadow DOM component. The most important visual element in the app.

**Anatomy:**
```
.taskCard
  .taskCard__epicBar           ← thin colour bar at top (hidden if no epic)
  .taskCard__body
    .taskCard__handle          ← drag handle: 6-dot braille pattern (2x3 grid)
    .taskCard__content
      .taskCard__header        ← title text + priority star (if priority=true)
      .taskCard__desc          ← description text, 2-line clamp with ellipsis
      .taskCard__badge         ← category name + icon (hidden if category=1)
      .taskCard__deadline      ← deadline chip (hidden if no deadline)
    .taskCard__editBtn         ← edit pencil button, absolute top-right, visible on hover
```

**States:**

| State | Visual |
|-------|--------|
| Default | White bg, 1px border, 6px radius, subtle shadow. Fade-in animation 0.3s on mount |
| Hover | translateY(-1px) lift, slightly stronger shadow. Edit button becomes visible |
| Dragging | 50% opacity, cursor: grabbing |
| Priority | Yellow star icon (#f59e0b) next to title |
| Has epic | Top colour bar visible in epic's colour. Epic pill badge below description |
| Has deadline (normal) | Grey chip with date text |
| Has deadline (warning) | Orange/yellow chip |
| Has deadline (urgent/overdue) | Red chip |
| Snoozed (hidden mode) | display: none (invisible) |
| Snoozed (transparent mode) | 50% opacity |
| Category badge | Small pill: icon + category name. Hidden when category = 1 |
| Filter-hidden | `[hidden]` attribute → display: none |

**Epic pill badge rendering:**
- Background: `rgba(epicColor, 0.12)`
- Text: solid `epicColor`
- Small pill shape, inline with other metadata

### 3.3 Board Toolbar

Injected into `.appHeader__actions` on board page only. Not visible on other pages.

**Elements (left to right):**

| Element | Type | Behaviour |
|---------|------|-----------|
| Category filter picker | `<custom-picker type="list">` | Dropdown with category icons. "All categories" clears the filter. Hidden when only the default category exists. Single-select. |
| Epic filter picker | `<custom-picker type="list">` | Dropdown. "All epics" option clears filter. Selecting an epic filters to that epic only. |
| Priority filter button | Single toggle | Click toggles. Active = filled bg with star icon. |
| Snooze toggle button | Single toggle | Shows/hides snoozed tasks. Hidden in "transparent" mode (when body has `.--snoozeTransparent`). |
| Privacy toggle button | Single toggle | Activates privacy blur (see section 7.2). |

### 3.4 Checklist & Notes (rail slide-out panel)

The daily checklist and notes widget are slotted into the nav rail's slide-out panel (see §2) — available on every page, opened via the rail's panel button. They were previously a fixed board-page sidebar.

#### Daily Checklist (`<daily-checklist>`)

Shadow DOM component.

```
h3                              ← "Daily Checklist", uppercase, 11px, grey
ul
  li.dailyChecklist__item       ← 12px padding, border-bottom 1px
    input[type="checkbox"]
    span.dailyChecklist__text   ← item text
    a.dailyChecklist__link      ← optional URL link icon (26px square, blue)
```

| State | Visual |
|-------|--------|
| Item unchecked | Normal text |
| Item checked | Strikethrough text, 40% opacity |
| Link icon default | 0.5 opacity |
| Link icon hover | 1.0 opacity, light blue bg |

Resets daily at 6:00 AM.

#### Notes Widget (`<notes-widget>`)

Shadow DOM component.

```
.notes__header
  h3                            ← "Notes", uppercase, 11px, grey
  .notes__status                ← "Saving..." / "Saved" indicator
.notes__textarea                ← auto-save textarea, debounced 500ms
```

| State | Visual |
|-------|--------|
| Default | Light grey bg (tertiary), 1px border, 6px radius, min-height 200px |
| Focus | Blue border, blue shadow outline (3px) |
| Saving | Status text: "Saving...", blue colour, visible |
| Saved | Status text: "Saved", green colour, fades out |

---

## 4. List Page Components (Archive, Backlog, AI)

These three pages share the same list pattern: a sortable header + rows.

### 4.1 List Header (`<list-header>`)

Inline Shadow DOM component (no external HTML/CSS files).

Renders a row of column headers. Column widths controlled by CSS custom properties that inherit through Shadow DOM.

| Column | CSS Var | Default Flex/Width |
|--------|---------|-------------------|
| Title | `--archive-col-title` | flex: 4 |
| Epic | `--archive-col-epic` | flex: 1.5 |
| Category | `--archive-col-category` | flex: 1.5 |
| Date | `--archive-col-date` | flex: 1 |
| Actions | `--archive-col-actions` | 104px (archive), 140px (backlog), 300px (AI) |

**States:**

| State | Visual |
|-------|--------|
| Column header default | Grey text, uppercase, small font |
| Sortable hover | Cursor pointer, slightly darker text |
| Active sort ascending | Arrow indicator pointing up |
| Active sort descending | Arrow indicator pointing down |

Click cycle: ascending → descending → ascending. First click on new column = ascending.

### 4.2 Archive Row (`<archive-row>`)

Shadow DOM component. Expandable.

**Collapsed (header only):**
```
.archiveRow__header              ← 44px min-height, 12px padding, flex
  .archiveRow__col--title        ← title text + priority star (if priority)
  .archiveRow__col--epic         ← epic pill badge (if epic assigned)
  .archiveRow__col--category     ← icon + category name
  .archiveRow__col--date         ← completion date
  .archiveRow__col--actions      ← Restore button + Expand chevron
```

**Expanded (detail panel):**
```
.archiveRow__panel               ← slides open below header
  Description text
  Metadata (created date, etc.)
  Activity log (reversed chronological)
```

| State | Visual |
|-------|--------|
| Default | White bg, bottom border, side borders |
| Hover | Light grey bg |
| Last row | Rounded bottom corners |
| Expanded | Chevron rotated 180deg, detail panel visible |
| Restore button hover | Blue bg + border |

**Events dispatched:** `restore-task` (with taskId)

### 4.3 Backlog Row (`<backlog-row>`)

Shadow DOM component. Flat (no expand).

```
.backlogRow__header              ← same column structure as archive
  .backlogRow__col--title
  .backlogRow__col--epic
  .backlogRow__col--category
  .backlogRow__col--date         ← created date (not completion date)
  .backlogRow__col--actions      ← Edit button + Promote button
```

| State | Visual |
|-------|--------|
| Default | Same as archive row |
| Edit hover | Light grey bg |
| Promote hover | Blue bg + border + white text |

**Events dispatched:** `backlog-edit`, `backlog-promote`

### 4.4 AI Staged Row (`<ai-staged-row>`)

Shadow DOM component. Flat (no expand). Wider actions column (300px) for 5 buttons.

```
.aiStagedRow__header
  .aiStagedRow__col--title
  .aiStagedRow__col--epic
  .aiStagedRow__col--category
  .aiStagedRow__col--actions     ← 5 buttons: Edit, Clone, →Backlog, →Board, Delete
```

| Button | Hover State |
|--------|-------------|
| Edit | Light grey bg |
| Clone | Light grey bg |
| → Backlog | Light grey bg + blue border + blue text |
| → Board | Blue bg + white text |
| Delete | Red bg + white text |

Button sizing: 4px vertical, 8px horizontal padding, 11px font (smaller than other rows).

**Events dispatched:** `ai-edit`, `ai-clone`, `ai-promote-backlog`, `ai-promote-board`, `ai-delete`

### 4.5 FAB (Floating Action Button)

Used on backlog page. Plain HTML element (not a Web Component).

| Property | Value |
|----------|-------|
| Position | Fixed, bottom 32px, left 32px |
| Shape | Circular or rounded |
| Action | Opens "Add Task" modal targeting the backlog column |
| Visual | Primary accent colour, "+" icon, shadow for elevation |

---

## 5. Page-Specific Layouts

### 5.1 Board Page (`/:alias`)

Default landing page. Two-column grid layout.

```
.appContainer                    ← CSS Grid: [sidebar 560px] [kanban 1fr]
  .sidebar                       ← flex column, gap 28px
    <daily-checklist>
    <notes-widget>
  .kanban                        ← CSS Grid: repeat(N, 1fr), gap 24px
    <kanban-column> x N          ← one per non-backlog column (default: 4)
```

**Responsive behaviour:**
- >= 2000px: sidebar 560px, 28px column gaps
- 1400-1999px: sidebar 560px, 16px gaps, smaller fonts
- < 1400px: sidebar stacks above kanban, 2-column grid for columns
- < 768px: single column

Board never shows backlog-flagged columns.

### 5.2 Dashboard Page (`/:alias/dashboard`)

Full-width page. All content rendered into `.pageView`.

```
.dashboardPage
  h1                             ← "Dashboard"
  .dashStats                     ← flex row of 4 stat cards
    .dashStat x 4               ← active tasks, priority count, done this week, overdue
  .dashSection (Epic Progress)   ← one card per epic with progress bar
  .dashSection (Column Load)     ← horizontal bars showing task count per column
  .dashSection (Deadlines)       ← grouped: overdue, next 48h, this week
  .dashSection (Stale Tasks)     ← collapsible, tasks with no activity > 14 days
  .dashSection (No Epic)         ← collapsible, tasks without an epic assigned
```

**Stat card states:**
- Default: neutral styling
- `.dashStat--positive`: green accent (done this week)
- `.dashStat--danger`: red accent (overdue count)

**Deadline groups:**
- `.dashDeadlineGroup--overdue`: red treatment
- `.dashDeadlineGroup--soon`: orange/warning treatment
- `.dashDeadlineGroup--week`: neutral treatment

**Collapsible sections:** Toggle button with chevron. Chevron rotates on expand/collapse.

### 5.3 Backlog Page (`/:alias/backlog`)

Full-width list page.

```
.backlogPage
  h1                             ← "Backlog"
  .js-backlogCount               ← task count badge
  <list-header>                  ← columns: Title, Epic, Category, Created Date, Actions
  .js-backlogRows                ← container
    <backlog-row> x N
  .js-backlogFab                 ← FAB button (fixed, bottom-left)
```

Actions column: 140px (2 buttons: Edit, Promote).

### 5.4 Archive Page (`/:alias/archive`)

Full-width list page. `.pageView.--fullPage` modifier (removes centering/padding).

```
.archivePage
  h1                             ← "Archive"
  .js-archiveCount               ← task count badge
  <list-header>                  ← columns: Title, Epic, Category, Completed Date, Actions
  .js-archiveRows                ← container
    <archive-row> x N
```

Default sort: completed date descending.

### 5.5 Reports Page (`/:alias/reports`) — PLANNED

Split panel layout.

```
.reportsPage
  .reportsPage__list             ← left panel, scrollable
    Report items (title + date + week number)
  .reportsPage__detail           ← right panel, scrollable
    Report title (inline-editable)
    Column-grouped task lists
    Notes section
    Delete button
```

Deep-linkable: `/:alias/reports/:reportId`.

### 5.6 AI Assistant Page (`/:alias/ai`)

Vertical split layout.

```
.aiPage
  .aiPage__chat                  ← top section (~55% height)
    .aiPage__messages            ← scrollable message list
      .aiPage__message--user     ← right-aligned, user bubble
      .aiPage__message--ai       ← left-aligned, AI bubble
      .aiPage__message--thinking ← animated dots indicator
    .aiPage__inputArea
      .aiPage__modelSelect       ← AI model selector dropdown
      .aiPage__input             ← textarea, auto-grows to 120px max
      .aiPage__inputActions      ← Clear conversation + Send buttons
  .aiPage__staged                ← bottom section (~45% height)
    h2 + .js-stagedCount         ← "Staged Tasks" + count badge
    <list-header>
    .js-stagedRows
      <ai-staged-row> x N
```

**Chat message states:**
- User message: right-aligned bubble
- AI message: left-aligned bubble
- Thinking: animated 3-dot indicator
- Task chip: "↓ N task(s) staged" displayed inline in AI response

**Input states:**
- Default: single-line height textarea
- Typing: auto-grows vertically (max 120px)
- Send: disabled while waiting for AI response
- Shift+Enter: sends message. Enter alone: newline.

Actions column: 300px (5 buttons).

---

## 6. Modals & Config-Page Editors

All modals use the `<modal-dialog>` Shadow DOM component. 3 sizes: small (540px), default (680px), large (960px). All clamped with min/max.

> **Note (v2.37+):** the CRUD editors in §6.3–6.7 are **no longer modals** — they render inline as sections of the Configuration page (`/:alias/config`, left tabs + right panel). Their element anatomy and visual specs below still apply to the inline versions. The only modals left in the app are the task modal (§6.2), the report viewer, and the small delete-confirmation modals (§6.8).

### 6.1 Modal Dialog Component

```
.backdrop                        ← fixed overlay, z-index 1000
  .modal__content                ← white bg, border, radius, shadow
    .modal__header
      h2 (slot="title")          ← modal title
      .modal__closeBtn           ← "×" close button
    .modal__body (default slot)  ← modal content
```

**Animations:**
- Open: fade-in 0.2s (backdrop) + slide-up + scale 0.2s (content)
- Close: reverse

**Close triggers:** close button click, backdrop click, Escape key.

### 6.2 Task Modal (Add / Edit / Clone)

Size: default. The most complex modal.

```
.taskForm
  .taskForm__group               ← Title input (required, max 200 chars)
  .taskForm__group               ← Description textarea (optional, max 2000 chars)
  .taskForm__checkboxGroup       ← Priority checkbox
  .taskForm__categorySelector    ← Pill-style radio buttons (one per category, grid layout)
  .taskForm__epicPicker           ← <custom-picker type="list"> for epic selection
  .taskForm__scheduleSection     ← Deadline section
    .taskForm__scheduleRow       ← datetime input + quick buttons (+1h, +3h, +1d, Morning, Next Monday)
    .taskForm__timeHint          ← calculated "in X hours/days" text
  .taskForm__scheduleSection     ← Snooze section (same layout as deadline)
  .taskForm__logSection          ← Activity log (edit mode only, read-only)
    .taskForm__logList           ← chronological entries: date + action text
  Action buttons bar             ← varies by mode (see below)
```

**Mode variations:**

| Mode | Title | Buttons (left to right) |
|------|-------|------------------------|
| Add | "Add Task" | Cancel, Save (blue) |
| Edit | "Edit Task" | Cancel, Clone (indigo), Backlog (slate, hidden if task is already in backlog), Update (blue), Delete (red) |
| Clone | "Add Task" | Cancel, Save (blue) — form pre-filled from source task, title prefixed with "(Clone) " |

**Category selector:** Grid of pill-shaped radio buttons. Each shows icon + category name. Selected pill has accent bg. Category 1 included but badge hidden on cards.

**Custom picker (epic):** Dropdown list. First option "No epic" (clears selection). Each item shows colour dot + epic name.

**Quick datetime buttons:** `+1h`, `+3h`, `+1d`, `Morning` (next 9am), `Next Monday` (next Monday 9am). Click sets the datetime input value.

### 6.3 Management Editors (Epics, Categories, Profiles) — inline on Config page

Size: large. All follow the same CRUD list pattern.

```
[Add form]                       ← input(s) + picker(s) + "Add" button + error message
[List of existing items]         ← each item has inline-editable fields + delete button
```

**Epic management:**
- Add: name input + colour picker (5-column grid, used colours disabled) + alias preview
- List item: colour dot + name input (blur-to-save) + colour picker (change-to-save) + delete button

**Category management:**
- Add: name input + icon picker (7-column grid) + "Add" button
- List item: icon + name input (blur-to-save) + icon picker (change-to-save) + delete button
- Category 1: delete button hidden

**Profile management:**
- Add: name input + letters input (1-3 uppercase, alphanumeric) + colour picker + alias preview
- List item: coloured avatar + name input + letters input + colour picker + default toggle (star) + delete button
- Last profile: delete button hidden
- Default profile: star button highlighted

### 6.4 Columns Editor — inline on Config page

Size: large. Column CRUD with drag-to-reorder.

```
[Add form]                       ← column name input + "Add" button + error
[Column list]                    ← draggable items
  Each item:
    ⠿ drag handle                ← braille pattern, cursor: grab
    Name input                   ← inline editable (blur-to-save)
    Archive checkbox             ← toggle hasArchive flag
    Delete button                ← opens confirm modal
    "Default" badge              ← on first column only (cannot be reordered away from position 0?)
```

Backlog column is NOT shown in this list (hidden, permanent).

**Drag states:**
- Dragging: `.--dragging` (opacity reduced)
- Drop target: `.--dragOver` (highlight border/bg)

### 6.5 Checklist Editor — inline on Config page

Size: large.

```
[Item list]
  Each item:
    Text input                   ← checklist item text
    URL input                    ← optional link URL
    Remove button                ← removes item
[Add Item button]                ← appends empty row
[Save button]                    ← saves to localStorage, refreshes component
```

### 6.6 General Settings — inline on Config page

Size: default. Three settings sections. All profile-scoped, stored in localStorage.

```
Section 0: Appearance (v2.41.0)
  Radio: Auto (follow system) / Light / Paper / Dark / Slate / Dim / High Contrast
         — per profile, applies instantly; generated from the THEMES registry
         — each radio has a preview swatch (.themeSwatch[data-theme]): three
           bands of bg-primary/secondary/tertiary; Auto = light/dark split

Section 1: Interface Visibility
  Checkbox: Show Daily Checklist (default: true)
  Checkbox: Show Notes Widget (default: true)

Section 2: Snoozed Tasks Display
  Radio: Hidden (default) — snoozed tasks invisible until toggle pressed
  Radio: Transparent — snoozed tasks always visible at 50% opacity

Section 3: Deadline Urgency Thresholds
  Number input: Urgent threshold (hours, default 24)
  Number input: Warning threshold (hours, default 72)
  Constraint: Urgent < Warning

[Save button]
```

### 6.7 AI Configuration — inline on Config page

Size: default.

```
Provider selector               ← dropdown: Anthropic, OpenAI, Groq, Custom
Model input                      ← text input for model ID
API Key input                    ← password field (never pre-filled from server)
Custom URL input                 ← shown only for "Custom" provider
[Save button]
```

### 6.8 Confirmation Modals

Size: small. Used for destructive actions.

```
Message text                     ← "Are you sure you want to delete {name}?"
[Cancel button]                  ← closes modal
[Delete/Confirm button]          ← executes action (red/danger styling)
```

Used for: task delete, epic delete, category delete, profile delete, column delete, report delete, generate report confirmation.

### 6.9 Reports Modal (Legacy — Being Replaced by Reports Page)

Size: large. Two views inside one modal.

**List view:**
```
Report items                     ← click to view detail
  Title + date + week number
```

**Detail view:**
```
Back button
Title (inline-editable, blur-to-save)
Column-grouped task lists        ← one section per column: column name header + task entries
Notes section
Delete button
```

---

## 7. Special Modes & Visual States

### 7.1 Crisis Mode — REMOVED (v2.37.2)

Crisis Mode was deleted from the product. Do not design for it. (The priority filter in the toolbar covers the "show only what's urgent" need.)

### 7.2 Privacy Mode

Activated by privacy toggle in toolbar. CSS class `.--privacyMode` on `.appContainer`.

**Visual:** Text content blurred/masked. Sensitive information hidden. Exact treatment is a design decision — current implementation is CSS blur on text elements.

### 7.3 Snooze States

Tasks with `snoozeUntil` in the future receive `.--snoozed` class.

**Two modes (set in General Configuration):**

| Mode | Visual | Snooze toggle button |
|------|--------|---------------------|
| Hidden (default) | Snoozed cards: `display: none`. Toggle button visible in toolbar. Click toggle: shows snoozed cards. | Visible |
| Transparent | Snoozed cards: 50% opacity, always visible. No toggle needed. | Hidden |

CSS custom properties on `:root` control this: `--snoozed-card-display` and `--snoozed-card-opacity`. These inherit through Shadow DOM into task-card components.

When snooze expires (current time > snoozeUntil), the card automatically becomes visible (checked every `SNOOZE_CHECK_INTERVAL_MS`).

### 7.4 Filter States

Filters are board-page-only, toolbar-driven, in-memory (reset on reload).

| Filter | Type | Logic |
|--------|------|-------|
| Category | Multi-select toggle buttons | OR: task matches ANY active category |
| Priority | Single toggle | AND with category: only priority tasks |
| Epic | Single-select dropdown | AND with above: only tasks with selected epic |

Combined: task must match (any active category) AND (priority if active) AND (selected epic if active).

Non-matching cards receive `[hidden]` attribute → `display: none`.

### 7.5 Drag-and-Drop

**Task card DnD (board):**
- Lift: card becomes semi-transparent (50% opacity), cursor: grabbing
- Drag over column: column list gets light blue bg tint
- Drop: card moves to new column at drop position, optimistic UI update
- Cross-column drop: changes task status (column ID) + creates log entry
- Same-column drop: reorders position only, no log entry
- Race condition lock: `isMoving` flag prevents concurrent drops

**Column reorder DnD (board config modal):**
- HTML5 drag and drop on column list items
- Dragging item: reduced opacity
- Drop target: highlighted border/bg
- Drop: reorders columns via API, optimistic update with rollback

---

## 8. Shared UI Primitives

### 8.1 Button (`<custom-button>`)

Shadow DOM component. Renders a `<button>` with a slot for content.

**Variants via `modifier` attribute:**

| Modifier | Colour | Use Case |
|----------|--------|----------|
| (none) | Light grey bg, grey text | Cancel, secondary actions |
| `save` | Blue bg (#1a73e8), white text | Save, Create, Update |
| `clone` | Indigo bg (#5758BB), white text | Clone task |
| `backlog` | Slate grey bg (#636E72), white text | Send to Backlog |
| `delete` | Red bg (#ef4444), white text | Delete actions |

**All variants:** Hover darkens + translateY(-1px) lift. Transition 0.15s.

### 8.2 Custom Picker (`<custom-picker>`)

Shadow DOM component. Three modes.

**Mode: `type="color"` (colour grid)**
- Grid of colour swatches. Default 5 columns.
- Selected swatch: border/ring indicator.
- Disabled swatch (used colour): reduced opacity, not clickable.

**Mode: `type="icon"` (icon grid)**
- Grid of icon options. Default 7 columns.
- Each cell shows an `<svg-icon>`.
- Selected icon: border/ring indicator.

**Mode: `type="list"` (dropdown)**
- Button showing current selection (or placeholder text).
- Click opens dropdown list.
- Items show optional colour dot + label.
- Selected item: highlighted.
- Compact size variant (`size="compact"`) for toolbar use.

### 8.3 SVG Icon (`<svg-icon>`)

Inline Shadow DOM component. Renders SVG by name.

- Attributes: `icon` (name), `size` (px, default 24)
- Inherits `currentColor` from parent.
- Available icons: star, edit, close, plus, newTab, check, chevron, drag, and others.

### 8.4 Toast Notification (`<toast-notification>`)

Shadow DOM component. Single instance. Fixed bottom-right corner, z-index 2000.

**Anatomy per toast:**
```
.toast                           ← white bg, border, shadow, 6px radius, left coloured border
  .toast__icon                   ← 22px coloured circle with icon
  .toast__message                ← text content
  .toast__close                  ← dismiss "×" button
```

**Variants:**

| Variant | Left Border | Icon Background |
|---------|-------------|-----------------|
| Success | Green (#10b981) | Green |
| Error | Red (#ef4444) | Red |
| Warning | Orange (#f59e0b) | Orange |
| Info | Grey (#6b7280) | Grey |

**Behaviour:**
- Entrance: slide-in from right (translateX 120% → 0), 0.2s
- Stack: column-reverse (newest at bottom), gap 10px
- Auto-dismiss: 4 seconds
- Manual close: click "×" button
- Max-width: 360px

---

## 9. Empty States

Each page/section needs an empty state design.

| Context | When | Current Treatment |
|---------|------|-------------------|
| Kanban column | No tasks in column | Empty space (no message) |
| Backlog page | No backlog tasks | Text message |
| Archive page | No archived tasks | Text message |
| AI staged tasks | No staged tasks | Text message |
| Dashboard: stale tasks | All tasks have recent activity | Section hidden or "All tasks are active" |
| Dashboard: no-epic tasks | All tasks have an epic | Section hidden or "All tasks have an epic" |
| Reports page | No reports generated | Text message |
| Checklist | No checklist items configured | Empty list |
| AI chat | No messages yet | Empty area |

---

## 10. Form Elements Reference

All forms are inside modals. No standalone form pages.

### Text Input
```html
<input type="text" class="taskForm__input">
```
States: default, focus (blue border + blue shadow ring), error (red border), disabled (greyed out).

### Textarea
```html
<textarea class="taskForm__textarea"></textarea>
```
Same states as text input. Description textarea: max 2000 chars. Notes textarea: auto-save, min-height 200px. AI chat input: auto-grows to max 120px.

### Datetime Input
```html
<input type="datetime-local" class="taskForm__datetimeInput">
```
Used for deadline and snooze fields. Accompanied by quick-set buttons and a time hint ("in X hours/days").

### Checkbox
```html
<label class="taskForm__checkboxGroup">
  <input type="checkbox"> Label text
</label>
```
Standard checkbox. Used for: priority toggle, archive toggle on columns, visibility settings.

### Category Pill Selector
```html
<div class="taskForm__categorySelector">
  <label class="taskForm__categoryPill">
    <input type="radio" name="category">
    <svg-icon> + Category Name
  </label>
  <!-- repeated per category -->
</div>
```
Grid of pill-shaped radio buttons. Selected pill: accent background. Only one can be selected.

---

## 11. Responsive Breakpoints (Current)

| Breakpoint | Layout Changes |
|------------|---------------|
| >= 2000px | Full: 560px sidebar + 4-column kanban grid, 28px gaps |
| 1400-1999px | Compact: 560px sidebar + columns, 16px gaps, smaller fonts |
| < 1400px | Stack: sidebar above kanban, 2-column grid for kanban |
| < 768px | Single column kanban, simplified layout |

The designer should propose improved breakpoints. Desktop is primary. Mobile must be functional.

---

## 12. Current Icon Set

SVG icons are defined inline in `svg-icon.js`. The designer should document which icons are needed and whether the set should be expanded or replaced.

Current icons used:
- star (priority)
- edit (pencil, category icon + edit action)
- close (×, dismiss)
- plus (+, add actions)
- newTab (external link)
- check (checkmark)
- chevron (expand/collapse arrows)
- drag (braille pattern, drag handles)

Additional icons needed for:
- Navigation items (board, dashboard, backlog, archive, reports, AI)
- Toolbar actions (filter, privacy, snooze)
- Config page tabs
- Promote/move actions
- Search (if added)
- Sort indicators

---

## 13. Interaction Patterns Summary

| Pattern | Where Used | Mechanism |
|---------|-----------|-----------|
| Drag-and-drop | Board cards, column reorder | HTML5 DnD API |
| Blur-to-save | Inline name editing in management modals | `blur` event → API call |
| Click-to-toggle | Filter buttons, checkboxes, collapsible sections | CSS class toggle |
| Modal open/close | All config and CRUD operations | `element.open()` / `element.close()` |
| Optimistic UI | All task CRUD, all entity CRUD | Update UI → API call → rollback on error |
| Auto-save | Notes widget | Debounced 500ms after last keystroke |
| Auto-grow textarea | AI chat input | JS sets `style.height` on input |
| Quick-set buttons | Deadline/snooze datetime fields | Click → sets datetime input to calculated value |
| Event delegation | Kanban container, form containers, page containers | Parent listens for custom events bubbling from children |
| Custom events through Shadow DOM | Task cards, list rows | `bubbles: true, composed: true` allows events to cross Shadow DOM boundaries |
