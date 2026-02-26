# Implementation Plan: Task Time Features (Deadline + Snooze)

## Context
Add time-awareness to tasks: a **Deadline** field (datetime with visual urgency chip on the card) and a **Snooze Until** field (hide/dim tasks until a future date). Both are set inside the task modal with a quick-button bar and an `<input type="datetime-local">`. Urgency thresholds and snooze visibility mode are configurable per-profile via General Configuration. All modal sizes are upgraded to use `clamp()` CSS for better responsive layout.

**Q2 decision (expired snooze in modal):** Option B — if `snoozeUntil` is in the past, the field opens blank (expired snooze = effectively no snooze).
**Auto-move:** NOT in scope for this task.

---

## Files to Modify (11 total)

| File | Change summary |
|---|---|
| `public/js/constants.js` | Add deadline threshold defaults + snooze interval constant |
| `public/js/utils.js` | Add `formatRelativeTime`, `getDeadlineLevel`, `toDatetimeLocalValue` |
| `server.js` | Validate + persist `deadline` and `snoozeUntil` in POST/PUT |
| `public/index.html` | Task form schedule section; general config modal expansion; snooze toggle button in toolbar |
| `public/app.js` | Card creation, scheduler, snooze toggle, general config, imports, DOM refs |
| `public/js/modals.js` | Task modal populate/save for new fields; quick-button logic |
| `public/components/task-card/task-card.js` | New observed attrs + deadline chip render |
| `public/components/task-card/task-card.html` | Add `.taskCard__deadline` element |
| `public/components/task-card/task-card.css` | Deadline chip styles |
| `public/components/modal-dialog/modal-dialog.css` | Replace fixed `max-width` values with `clamp()` |
| `public/styles.css` | Snooze CSS rules; task form schedule styles; general config section styles; toolbar snooze button styles |

**Files NOT needing changes:** `api.js` (passes fields through transparently), `state.js` (updateTaskInState already applies any fields), `filters.js` (snooze is a pure CSS class, no JS filter logic needed), `board-config.js`, `crisis-mode.js`.

---

## Pre-flight Checklist (before writing any code)
- [ ] No `alert()` / `confirm()` — only `elements.toaster.*`
- [ ] No `window.fn` exports or inline `onclick`
- [ ] All quick/clear buttons use event delegation on `elements.taskForm`, not inline handlers
- [ ] `disconnectedCallback` not needed (no new document-level listeners added to components)
- [ ] Optimistic UI: pass `deadline` and `snoozeUntil` through existing snapshot/rollback flow
- [ ] `setQuickDateTime` exported from `modals.js`, imported in `app.js`
- [ ] No new constants duplicated — import from `constants.js`

---

## Step 1 — `public/js/constants.js`

Add at the end of the file:

```javascript
// ===========================================
// Deadline Configuration
// ===========================================

/** Default threshold in hours below which deadline chip turns red/urgent */
export const DEFAULT_DEADLINE_URGENT_HOURS = 24;

/** Default threshold in hours below which deadline chip turns yellow/warning */
export const DEFAULT_DEADLINE_WARNING_HOURS = 72;

// ===========================================
// Snooze Configuration
// ===========================================

/** Interval in ms between snooze expiry checks */
export const SNOOZE_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
```

---

## Step 2 — `public/js/utils.js`

Add three new exported functions at the end of the file:

```javascript
/**
 * Converts a Date object to the value format required by <input type="datetime-local">.
 * Uses LOCAL time (not UTC).
 * @param {Date} date
 * @returns {string} e.g. "2026-03-01T08:00"
 */
export function toDatetimeLocalValue(date) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Returns a human-readable relative time string for an ISO datetime.
 * Positive diff (future): "in 2d 3h" / "in 45m"
 * Negative diff (past):   "expired 4h ago" / "expired 2d ago"
 * @param {string} isoString - ISO 8601 datetime
 * @returns {string}
 */
export function formatRelativeTime(isoString) {
    const diffMs = new Date(isoString) - new Date();
    const past = diffMs < 0;
    const abs = Math.abs(diffMs);

    const totalMinutes = Math.floor(abs / 60000);
    const totalHours   = Math.floor(abs / 3600000);
    const totalDays    = Math.floor(abs / 86400000);

    let label;
    if (abs < 60000) {
        label = 'just now';
    } else if (abs < 3600000) {
        label = `${totalMinutes}m`;
    } else if (abs < 86400000) {
        const remainingMins = totalMinutes % 60;
        label = remainingMins > 0 ? `${totalHours}h ${remainingMins}m` : `${totalHours}h`;
    } else {
        const remainingHours = totalHours % 24;
        label = remainingHours > 0 ? `${totalDays}d ${remainingHours}h` : `${totalDays}d`;
    }

    return past ? `expired ${label} ago` : `in ${label}`;
}

/**
 * Returns the urgency level of a deadline based on configurable hour thresholds.
 * @param {string} isoString - ISO 8601 deadline datetime
 * @param {number[]} thresholds - [urgentHours, warningHours]
 * @returns {'overdue'|'urgent'|'warning'|'upcoming'}
 */
export function getDeadlineLevel(isoString, thresholds) {
    const diffHours = (new Date(isoString) - new Date()) / 3600000;
    if (diffHours <= 0)             return 'overdue';
    if (diffHours <= thresholds[0]) return 'urgent';
    if (diffHours <= thresholds[1]) return 'warning';
    return 'upcoming';
}
```

---

## Step 3 — `server.js`

### 3a. `validateTaskInput` — add two new optional field validations after the priority block:

```javascript
// Deadline validation
if (data.deadline !== undefined) {
    if (data.deadline !== null) {
        if (typeof data.deadline !== 'string' || isNaN(Date.parse(data.deadline))) {
            errors.push('deadline must be a valid ISO datetime string or null');
        }
    }
}

// snoozeUntil validation
if (data.snoozeUntil !== undefined) {
    if (data.snoozeUntil !== null) {
        if (typeof data.snoozeUntil !== 'string' || isNaN(Date.parse(data.snoozeUntil))) {
            errors.push('snoozeUntil must be a valid ISO datetime string or null');
        }
    }
}
```

### 3b. Task POST handler — add to the new task object:

```javascript
deadline:    data.deadline    || null,
snoozeUntil: data.snoozeUntil || null,
```

### 3c. Task PUT handler — add after the `epicId` assignment block:

```javascript
if (data.deadline !== undefined)    task.deadline    = data.deadline    || null;
if (data.snoozeUntil !== undefined) task.snoozeUntil = data.snoozeUntil || null;
```

---

## Step 4 — `public/index.html`

### 4a. Toolbar — add snooze toggle button after the priority button, before the divider:

```html
<button class="toolbar__snoozeBtn js-snoozeToggleBtn" style="display:none;"></button>
```

### 4b. Task form — add schedule section after the epic picker group, before the log section:

```html
<div class="taskForm__group taskForm__scheduleSection">
    <label>Schedule</label>

    <!-- Deadline -->
    <div class="taskForm__scheduleRow">
        <span class="taskForm__scheduleLabel">Deadline</span>
        <div class="taskForm__scheduleControls">
            <input type="datetime-local" class="taskForm__datetimeInput js-taskDeadline" />
            <button type="button" class="taskForm__clearBtn js-clearDeadline">Clear</button>
        </div>
        <div class="taskForm__quickBtns">
            <button type="button" class="taskForm__quickBtn js-quickDeadline" data-offset="+1h">+1h</button>
            <button type="button" class="taskForm__quickBtn js-quickDeadline" data-offset="+3h">+3h</button>
            <button type="button" class="taskForm__quickBtn js-quickDeadline" data-offset="+1d">+1 day</button>
            <button type="button" class="taskForm__quickBtn js-quickDeadline" data-offset="morning">Next morning</button>
            <button type="button" class="taskForm__quickBtn js-quickDeadline" data-offset="monday">Next Monday</button>
        </div>
        <div class="taskForm__timeHint js-deadlineHint"></div>
    </div>

    <!-- Snooze -->
    <div class="taskForm__scheduleRow">
        <span class="taskForm__scheduleLabel">Snooze until</span>
        <div class="taskForm__scheduleControls">
            <input type="datetime-local" class="taskForm__datetimeInput js-taskSnooze" />
            <button type="button" class="taskForm__clearBtn js-clearSnooze">Clear</button>
        </div>
        <div class="taskForm__quickBtns">
            <button type="button" class="taskForm__quickBtn js-quickSnooze" data-offset="+1h">+1h</button>
            <button type="button" class="taskForm__quickBtn js-quickSnooze" data-offset="+3h">+3h</button>
            <button type="button" class="taskForm__quickBtn js-quickSnooze" data-offset="+1d">+1 day</button>
            <button type="button" class="taskForm__quickBtn js-quickSnooze" data-offset="morning">Next morning</button>
            <button type="button" class="taskForm__quickBtn js-quickSnooze" data-offset="monday">Next Monday</button>
        </div>
        <div class="taskForm__timeHint js-snoozeHint"></div>
    </div>
</div>
```

### 4c. General Configuration modal — change `size="small"` to no size attribute, replace inner `.generalConfig` content:

```html
<modal-dialog class="js-generalConfigModal">
    <span slot="title">General Configuration</span>
    <div class="generalConfig">
        <p class="generalConfig__hint">Settings are saved per profile.</p>

        <!-- Interface Visibility -->
        <div class="generalConfig__section">
            <h4 class="generalConfig__sectionTitle">Interface Visibility</h4>
            <div class="generalConfig__options">
                <label class="generalConfig__option">
                    <input type="checkbox" class="js-showDailyChecklist">
                    <span>Show Daily Checklist</span>
                </label>
                <label class="generalConfig__option">
                    <input type="checkbox" class="js-showNotes">
                    <span>Show Notes</span>
                </label>
            </div>
        </div>

        <!-- Snoozed Tasks -->
        <div class="generalConfig__section">
            <h4 class="generalConfig__sectionTitle">Snoozed Tasks Display</h4>
            <div class="generalConfig__options">
                <label class="generalConfig__option">
                    <input type="radio" name="snoozeVisibility" value="hidden" class="js-snoozeHidden">
                    <span>Hidden — use "Show Snoozed" button to reveal</span>
                </label>
                <label class="generalConfig__option">
                    <input type="radio" name="snoozeVisibility" value="transparent" class="js-snoozeTransparent">
                    <span>Semi-transparent (50% opacity, always visible)</span>
                </label>
            </div>
        </div>

        <!-- Deadline Thresholds -->
        <div class="generalConfig__section">
            <h4 class="generalConfig__sectionTitle">Deadline Urgency Thresholds</h4>
            <p class="generalConfig__hint">Deadline chip changes color when the task is due within these hours.</p>
            <div class="generalConfig__thresholds">
                <div class="generalConfig__thresholdRow">
                    <span class="generalConfig__thresholdLabel --urgent">Urgent (red)</span>
                    <input type="number" class="js-deadlineUrgentHours" min="1" max="999" />
                    <span>hours</span>
                </div>
                <div class="generalConfig__thresholdRow">
                    <span class="generalConfig__thresholdLabel --warning">Warning (yellow)</span>
                    <input type="number" class="js-deadlineWarningHours" min="1" max="999" />
                    <span>hours</span>
                </div>
            </div>
        </div>

        <div class="modal__actions">
            <div class="modal__actionsRight">
                <button type="button" class="btn --cancel js-generalConfigCancel">Cancel</button>
                <button type="button" class="btn --save js-generalConfigSave">Save</button>
            </div>
        </div>
    </div>
</modal-dialog>
```

---

## Step 5 — `public/app.js`

### 5a. Imports — add to existing import statements:

```javascript
// In constants.js import line, add:
import { ..., DEFAULT_DEADLINE_URGENT_HOURS, DEFAULT_DEADLINE_WARNING_HOURS, SNOOZE_CHECK_INTERVAL_MS } from './js/constants.js';

// In utils.js import line, add:
import { ..., formatRelativeTime, getDeadlineLevel, toDatetimeLocalValue } from './js/utils.js';

// In modals.js import line, add:
import { ..., setQuickDateTime } from './js/modals.js';
```

### 5b. `elements` object — add new DOM refs:

```javascript
// Task form - schedule
taskDeadline:         document.querySelector('.js-taskDeadline'),
taskSnooze:           document.querySelector('.js-taskSnooze'),
deadlineHint:         document.querySelector('.js-deadlineHint'),
snoozeHint:           document.querySelector('.js-snoozeHint'),

// Toolbar
snoozeToggleBtn:      document.querySelector('.js-snoozeToggleBtn'),

// General config - new fields
deadlineUrgentHours:  document.querySelector('.js-deadlineUrgentHours'),
deadlineWarningHours: document.querySelector('.js-deadlineWarningHours'),
```

### 5c. New private helper `getDeadlineThresholds(alias)` — add near `loadGeneralConfig`:

```javascript
/**
 * Returns the deadline urgency thresholds [urgentHours, warningHours]
 * from profile-scoped localStorage, falling back to defaults.
 * @param {string} alias - Profile alias
 * @returns {number[]}
 */
function getDeadlineThresholds(alias) {
    const stored = localStorage.getItem(`${alias}:deadlineThresholds`);
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length === 2) return parsed;
        } catch {}
    }
    return [DEFAULT_DEADLINE_URGENT_HOURS, DEFAULT_DEADLINE_WARNING_HOURS];
}
```

### 5d. `createTaskCard()` — add after the epic block, before `card.draggable = true`:

```javascript
// Deadline chip data
if (task.deadline) {
    card.dataset.deadline      = task.deadline;
    const thresholds           = getDeadlineThresholds(activeProfile.alias);
    card.dataset.deadlineLevel = getDeadlineLevel(task.deadline, thresholds);
    card.dataset.deadlineText  = formatRelativeTime(task.deadline);
}

// Snooze state — apply class for CSS-driven visibility
if (task.snoozeUntil && new Date(task.snoozeUntil) > new Date()) {
    card.classList.add('--snoozed');
}
```

### 5e. `renderAllColumns()` — add `updateSnoozeButton()` call at the end:

```javascript
function renderAllColumns() {
    epicLookup     = new Map(epics.map(e => [e.id, e]));
    categoryLookup = new Map(categories.map(c => [c.id, c]));
    columns.forEach(col => renderColumn(col.id));
    renderEpicFilter(elements.epicFilter);
    applyAllFilters();
    updateSnoozeButton(); // NEW
}
```

### 5f. New `updateSnoozeButton()` function:

```javascript
/**
 * Shows/hides the snooze toggle button based on whether any tasks are currently snoozed.
 * Also resets the toggle state if no snoozed tasks remain.
 */
function updateSnoozeButton() {
    const now = new Date();
    const snoozedTasks = tasks.filter(t => t.snoozeUntil && new Date(t.snoozeUntil) > now);
    if (snoozedTasks.length > 0) {
        elements.snoozeToggleBtn.style.display = '';
        elements.snoozeToggleBtn.textContent   = `💤 Snoozed (${snoozedTasks.length})`;
    } else {
        elements.snoozeToggleBtn.style.display = 'none';
        elements.kanban.classList.remove('--showSnoozed');
        elements.snoozeToggleBtn.classList.remove('--active');
    }
}
```

### 5g. `loadGeneralConfig()` — extend to also apply snooze mode:

```javascript
function loadGeneralConfig() {
    if (!activeProfile) return;
    const alias = activeProfile.alias;

    const showChecklist = localStorage.getItem(`${alias}:showDailyChecklist`);
    const showNotes     = localStorage.getItem(`${alias}:showNotes`);
    elements.dailyChecklist.classList.toggle('--hidden', showChecklist === 'false');
    elements.notesWidget.classList.toggle('--hidden',    showNotes     === 'false');

    // Snooze display mode
    const snoozeMode = localStorage.getItem(`${alias}:snoozeVisibility`) || 'hidden';
    document.body.classList.toggle('--snoozeTransparent', snoozeMode === 'transparent');
}
```

### 5h. `saveGeneralConfig()` — extend to persist new settings:

```javascript
function saveGeneralConfig() {
    const alias = activeProfile.alias;

    localStorage.setItem(`${alias}:showDailyChecklist`, String(elements.showDailyChecklistToggle.checked));
    localStorage.setItem(`${alias}:showNotes`,          String(elements.showNotesToggle.checked));

    // Snooze visibility mode
    const snoozeMode = document.querySelector('input[name="snoozeVisibility"]:checked')?.value || 'hidden';
    localStorage.setItem(`${alias}:snoozeVisibility`, snoozeMode);

    // Deadline thresholds — validate before saving
    const urgentHours  = parseInt(elements.deadlineUrgentHours.value)  || DEFAULT_DEADLINE_URGENT_HOURS;
    const warningHours = parseInt(elements.deadlineWarningHours.value) || DEFAULT_DEADLINE_WARNING_HOURS;
    if (urgentHours >= warningHours) {
        elements.toaster.warning('Urgent threshold must be less than Warning threshold');
        return;
    }
    localStorage.setItem(`${alias}:deadlineThresholds`, JSON.stringify([urgentHours, warningHours]));

    loadGeneralConfig();
    renderAllColumns(); // Re-render to refresh deadline chips with new thresholds
    elements.generalConfigModal.close();
    elements.toaster.success('Configuration saved');
}
```

### 5i. General config modal open handler — populate new fields (replace the existing `generalConfigBtn` click listener):

```javascript
elements.generalConfigBtn.addEventListener('click', () => {
    closeMenu();
    const alias = activeProfile.alias;

    // Existing toggles
    elements.showDailyChecklistToggle.checked = localStorage.getItem(`${alias}:showDailyChecklist`) !== 'false';
    elements.showNotesToggle.checked          = localStorage.getItem(`${alias}:showNotes`)          !== 'false';

    // Snooze visibility
    const snoozeMode  = localStorage.getItem(`${alias}:snoozeVisibility`) || 'hidden';
    const snoozeRadio = document.querySelector(`input[name="snoozeVisibility"][value="${snoozeMode}"]`);
    if (snoozeRadio) snoozeRadio.checked = true;

    // Deadline thresholds
    const thresholds = getDeadlineThresholds(alias);
    elements.deadlineUrgentHours.value  = thresholds[0];
    elements.deadlineWarningHours.value = thresholds[1];

    elements.generalConfigModal.open();
});
```

### 5j. Snooze toggle button event listener (in the main event-listener init block):

```javascript
elements.snoozeToggleBtn.addEventListener('click', () => {
    const isActive = elements.kanban.classList.toggle('--showSnoozed');
    elements.snoozeToggleBtn.classList.toggle('--active', isActive);
});
```

### 5k. Task form quick/clear button listeners — event-delegated on `elements.taskForm`:

Add local helper near `loadGeneralConfig`:
```javascript
function updateDateHint(hintEl, value) {
    hintEl.textContent = value ? formatRelativeTime(new Date(value).toISOString()) : '';
}
```

Add delegation listener on `elements.taskForm` (after the existing `taskForm.onsubmit` setup):
```javascript
elements.taskForm.addEventListener('click', (e) => {
    if (e.target.classList.contains('js-quickDeadline')) {
        setQuickDateTime(elements.taskDeadline, e.target.dataset.offset);
        updateDateHint(elements.deadlineHint, elements.taskDeadline.value);
    } else if (e.target.classList.contains('js-quickSnooze')) {
        setQuickDateTime(elements.taskSnooze, e.target.dataset.offset);
        updateDateHint(elements.snoozeHint, elements.taskSnooze.value);
    } else if (e.target.classList.contains('js-clearDeadline')) {
        elements.taskDeadline.value       = '';
        elements.deadlineHint.textContent = '';
    } else if (e.target.classList.contains('js-clearSnooze')) {
        elements.taskSnooze.value       = '';
        elements.snoozeHint.textContent = '';
    }
});

elements.taskDeadline.addEventListener('input', () => updateDateHint(elements.deadlineHint, elements.taskDeadline.value));
elements.taskSnooze.addEventListener('input',   () => updateDateHint(elements.snoozeHint,   elements.taskSnooze.value));
```

### 5l. Snooze expiry scheduler — add after the initial `fetchTasks()` call in `init()`:

```javascript
// Track currently-snoozed task IDs to detect when they expire
let _snoozedIds = new Set(
    tasks.filter(t => t.snoozeUntil && new Date(t.snoozeUntil) > new Date()).map(t => t.id)
);

setInterval(() => {
    const now = new Date();
    const currentSnoozedIds = new Set(
        tasks.filter(t => t.snoozeUntil && new Date(t.snoozeUntil) > now).map(t => t.id)
    );
    const anyWokeUp = [..._snoozedIds].some(id => !currentSnoozedIds.has(id));
    _snoozedIds = currentSnoozedIds;
    if (anyWokeUp) {
        renderAllColumns();
        elements.toaster.info('A snoozed task is back on the board');
    }
}, SNOOZE_CHECK_INTERVAL_MS);
```

---

## Step 6 — `public/js/modals.js`

### 6a. Imports — add new utils:

```javascript
import { escapeHtml, formatDate, toCamelCase, formatRelativeTime, toDatetimeLocalValue } from './utils.js';
```

### 6b. New exported helper `setQuickDateTime` — add above the Task Modal section:

```javascript
/**
 * Sets an <input type="datetime-local"> to a quick preset time relative to now.
 * Exported so app.js can call it via delegated task form click events.
 * @param {HTMLInputElement} inputEl
 * @param {string} offsetType - '+1h'|'+3h'|'+1d'|'morning'|'monday'
 */
export function setQuickDateTime(inputEl, offsetType) {
    const now = new Date();
    let target;
    switch (offsetType) {
        case '+1h':    target = new Date(now.getTime() + 3600000);     break;
        case '+3h':    target = new Date(now.getTime() + 3 * 3600000); break;
        case '+1d':    target = new Date(now.getTime() + 86400000);    break;
        case 'morning': {
            target = new Date(now);
            target.setDate(target.getDate() + 1);
            target.setHours(8, 0, 0, 0);
            break;
        }
        case 'monday': {
            target = new Date(now);
            const day = target.getDay(); // 0=Sun … 6=Sat
            // If today is Monday (1), go 7 days forward; otherwise go to next Monday
            const daysUntil = day === 1 ? 7 : (8 - day) % 7;
            target.setDate(target.getDate() + daysUntil);
            target.setHours(8, 0, 0, 0);
            break;
        }
    }
    if (target) inputEl.value = toDatetimeLocalValue(target);
}
```

### 6c. `openAddTaskModal()` — clear schedule fields (add after `elements.taskLogSection.style.display = 'none'`):

```javascript
elements.taskDeadline.value       = '';
elements.taskSnooze.value         = '';
elements.deadlineHint.textContent = '';
elements.snoozeHint.textContent   = '';
```

### 6d. `openEditModal()` — populate schedule fields (add after the log section block):

```javascript
// Deadline
if (task.deadline) {
    elements.taskDeadline.value       = toDatetimeLocalValue(new Date(task.deadline));
    elements.deadlineHint.textContent = formatRelativeTime(task.deadline);
} else {
    elements.taskDeadline.value       = '';
    elements.deadlineHint.textContent = '';
}

// Snooze — Option B: show only if snooze is still in the future
const snoozeActive = task.snoozeUntil && new Date(task.snoozeUntil) > new Date();
if (snoozeActive) {
    elements.taskSnooze.value       = toDatetimeLocalValue(new Date(task.snoozeUntil));
    elements.snoozeHint.textContent = formatRelativeTime(task.snoozeUntil);
} else {
    elements.taskSnooze.value       = '';
    elements.snoozeHint.textContent = '';
}
```

### 6e. `createTaskFormSubmitHandler()` — read new fields and pass to API:

After reading `epicId`, add:
```javascript
const deadline    = elements.taskDeadline.value ? new Date(elements.taskDeadline.value).toISOString() : null;
const snoozeUntil = elements.taskSnooze.value   ? new Date(elements.taskSnooze.value).toISOString()   : null;
```

Add `deadline` and `snoozeUntil` to all four call sites:
- `updateTaskInState(taskId, { title, description, priority, category, epicId, deadline, snoozeUntil })`
- `updateTaskApi(taskId, { title, description, priority, category, epicId, deadline, snoozeUntil })`
- `tempTask` object literal: add `deadline, snoozeUntil,`
- `createTaskApi({ title, description, priority, category, epicId, deadline, snoozeUntil })`

---

## Step 7 — `public/components/task-card/task-card.js`

### 7a. `observedAttributes` — add new attributes:

```javascript
static get observedAttributes() {
    return [
        'data-task-id', 'data-status', 'data-category', 'data-category-name',
        'data-category-icon', 'data-priority', 'data-title', 'data-description',
        'data-epic-name', 'data-epic-color', 'data-epic-alias',
        'data-deadline', 'data-deadline-level', 'data-deadline-text',
        'hidden'
    ];
}
```

### 7b. `render()` — add deadline chip block after the epic bar block:

```javascript
// Deadline chip
const deadlineEl = this.shadowRoot.querySelector('.js-deadline');
if (deadlineEl) {
    const deadlineText  = this.dataset.deadlineText;
    const deadlineLevel = this.dataset.deadlineLevel;
    if (deadlineText) {
        deadlineEl.style.display = '';
        deadlineEl.textContent   = deadlineText;
        deadlineEl.className     = `taskCard__deadline js-deadline --${deadlineLevel}`;
    } else {
        deadlineEl.style.display = 'none';
        deadlineEl.textContent   = '';
    }
}
```

---

## Step 8 — `public/components/task-card/task-card.html`

Add inside `.taskCard__content`, after `.taskCard__badge`:

```html
<div class="taskCard__deadline js-deadline" style="display:none;"></div>
```

---

## Step 9 — `public/components/task-card/task-card.css`

Add at the end of the file:

```css
/* Deadline urgency chip */
.taskCard__deadline {
    display: inline-flex;
    align-items: center;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 6px;
    margin-top: 6px;
    line-height: 1.4;
}

.taskCard__deadline.--overdue,
.taskCard__deadline.--urgent {
    background: rgba(231, 76, 60, 0.15);
    color: #C0392B;
}

.taskCard__deadline.--warning {
    background: rgba(241, 196, 15, 0.2);
    color: #9A7100;
}

.taskCard__deadline.--upcoming {
    background: rgba(100, 100, 100, 0.12);
    color: var(--text-muted, #8A8A8A);
}
```

---

## Step 10 — `public/components/modal-dialog/modal-dialog.css`

Replace the three fixed `max-width` rules with `clamp()` values:

```css
/* Default modal */
.modal__content {
    background-color: #FFFFFF;
    border-radius: 24px;
    width: 92%;
    max-width: clamp(480px, 50vw, 680px);
    max-height: 90vh;
    overflow-y: auto;
    animation: modalSlideIn 0.4s ease-out;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
}

:host([size="large"]) .modal__content {
    max-width: clamp(640px, 72vw, 960px);
}

:host([size="small"]) .modal__content {
    max-width: clamp(360px, 38vw, 540px);
}
```

*Before:* default=500px, large=700px, small=420px
*After:* default≈680px (at 1400px vw), large≈960px, small≈540px

---

## Step 11 — `public/styles.css`

### 11a. Snooze visibility CSS — add near the crisis mode section:

```css
/* ==============================================
   Snooze Visibility
   ============================================== */

/* Default (hidden mode): snoozed task-cards are invisible */
task-card.--snoozed {
    display: none;
}

/* "Show Snoozed" button is toggled on — reveal snoozed cards dimmed */
.kanban.--showSnoozed task-card.--snoozed {
    display: flex;
    opacity: 0.5;
}

/* Transparent mode: always show snoozed cards at 50% opacity */
body.--snoozeTransparent task-card.--snoozed {
    display: flex;
    opacity: 0.5;
}

/* In transparent mode the snooze toggle button is irrelevant — hide it */
body.--snoozeTransparent .js-snoozeToggleBtn {
    display: none !important;
}
```

### 11b. Toolbar snooze button styles — add near the priority button styles:

```css
.toolbar__snoozeBtn {
    padding: 6px 14px;
    border-radius: 20px;
    border: none;
    background: var(--column-bg);
    color: var(--text-secondary);
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
    white-space: nowrap;
}

.toolbar__snoozeBtn.--active {
    background: var(--accent-color);
    color: var(--text-light);
}
```

### 11c. Task form schedule section styles — add near the existing `.taskForm` block:

```css
.taskForm__scheduleRow {
    margin-bottom: 20px;
}

.taskForm__scheduleRow:last-child {
    margin-bottom: 0;
}

.taskForm__scheduleLabel {
    display: block;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.8px;
    margin-bottom: 8px;
}

.taskForm__scheduleControls {
    display: flex;
    gap: 8px;
    align-items: center;
}

.taskForm__datetimeInput {
    flex: 1;
    padding: 10px 14px;
    border: none;
    border-radius: 12px;
    background-color: var(--bg-color);
    color: var(--text-primary);
    font-size: 14px;
    font-family: inherit;
    transition: box-shadow 0.3s, background-color 0.3s;
}

.taskForm__datetimeInput:focus {
    outline: none;
    background-color: #EDE9E3;
    box-shadow: 0 0 0 3px rgba(196, 164, 132, 0.2);
}

.taskForm__clearBtn {
    padding: 8px 12px;
    border-radius: 10px;
    border: none;
    background: var(--bg-color);
    color: var(--text-muted);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
    white-space: nowrap;
}

.taskForm__clearBtn:hover {
    background: var(--danger-color);
    color: #fff;
}

.taskForm__quickBtns {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
}

.taskForm__quickBtn {
    padding: 5px 10px;
    border-radius: 8px;
    border: none;
    background: var(--bg-color);
    color: var(--text-secondary);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s, color 0.2s;
}

.taskForm__quickBtn:hover {
    background: var(--accent-color);
    color: var(--text-light);
}

.taskForm__timeHint {
    margin-top: 6px;
    font-size: 12px;
    color: var(--text-muted);
    font-style: italic;
    min-height: 18px;
}
```

### 11d. General Config expanded section styles — add near the existing `.generalConfig` block:

```css
.generalConfig__section {
    margin-bottom: 24px;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--bg-color);
}

.generalConfig__section:last-of-type {
    border-bottom: none;
    margin-bottom: 0;
    padding-bottom: 0;
}

.generalConfig__sectionTitle {
    font-size: 12px;
    font-weight: 700;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin: 0 0 14px 0;
}

.generalConfig__thresholds {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.generalConfig__thresholdRow {
    display: flex;
    align-items: center;
    gap: 10px;
}

.generalConfig__thresholdLabel {
    flex: 1;
    font-size: 13px;
    color: var(--text-secondary);
}

.generalConfig__thresholdLabel.--urgent  { color: #C0392B; }
.generalConfig__thresholdLabel.--warning { color: #9A7100; }

.generalConfig__thresholds input[type="number"] {
    width: 70px;
    padding: 8px 10px;
    border-radius: 8px;
    border: none;
    background: var(--bg-color);
    color: var(--text-primary);
    font-size: 14px;
    text-align: center;
    font-family: inherit;
}
```

---

## Data Model — Updated Task Object

```javascript
{
  id:          string,
  title:       string,
  description: string,
  priority:    boolean,
  category:    number,
  epicId:      string | null,
  status:      string,
  position:    number,
  log:         array,
  createdDate: string,
  deadline:    string | null,   // ISO 8601 datetime — NEW
  snoozeUntil: string | null    // ISO 8601 datetime — NEW
}
```

Existing tasks without these fields behave as `null` (no chip, not snoozed) — **zero migration needed**.

---

## localStorage Keys (profile-scoped)

| Key | Type | Default |
|---|---|---|
| `{alias}:deadlineThresholds` | `JSON: [number, number]` | `[24, 72]` |
| `{alias}:snoozeVisibility` | `string: "hidden"\|"transparent"` | `"hidden"` |

---

## Verification Steps

1. **Server start:** `node server.js` — confirm no parse errors.
2. **Create a task** — open task modal, set a deadline +1h via quick button, observe hint text shows "in 1h". Save. Confirm card shows a red chip with the time text.
3. **Urgency levels** — set deadlines for: 5h from now (red), 50h from now (yellow), 10 days from now (gray). Verify correct chip colors.
4. **Snooze** — snooze a task to +1h. Confirm card disappears from board. Confirm "💤 Snoozed (1)" button appears in toolbar. Click it — task appears at 50% opacity. Click again — hidden again.
5. **Snooze expiry** — snooze a task to +1min (manually type value). Wait 5 minutes (or temporarily reduce `SNOOZE_CHECK_INTERVAL_MS` to 30000ms for testing). Confirm toast appears and task reappears.
6. **Transparent mode** — General Config → Snooze display → Semi-transparent. Save. Confirm snoozed tasks are visible at 50% opacity without needing the toggle button. Confirm toggle button is hidden.
7. **Deadline thresholds** — General Config → change Urgent to 2h, Warning to 4h. Save. Update a task's deadline to 3h from now — confirm chip is now yellow (warning), not red (urgent).
8. **Expired snooze in modal** — snooze a task to 1 minute ago (type past date). Open edit modal. Confirm snooze field is blank (Option B behavior).
9. **Optimistic UI rollback** — stop the server, save a task with deadline set. Confirm toast error appears and changes revert.
10. **Modal sizes** — open all modals (task, reports, epics, categories, board config, general config) and confirm they are visibly larger and responsive.
11. **Run unit tests:** `npm run test:unit` — confirm no regressions.
