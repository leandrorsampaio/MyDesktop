# Code Review Findings

**Date:** 2026-02-06
**Reviewer:** Claude Code Analysis
**Scope:** Full codebase analysis for open-source readiness
**Focus:** Code standards, performance, simplification, cleanup, reliability, maintainability

---

## Summary

This document contains actionable findings organized by category. Each finding includes context, impact, and a proposed solution. Review each item and decide whether to implement based on your priorities.

---

## 1. Code Duplication ✅ RESOLVED

### 1.1 CATEGORIES constant is defined in three places ✅

**Files affected:**
- `app.js:16-23`
- `server.js:50-57` (as CATEGORY_LABELS)
- `task-card.js:1-8`

**Impact:** If categories change, all three files must be updated. Risk of inconsistency.

**Solution:** Create a shared `constants.js` file in `/public/` that exports shared constants. Import in components via ES modules. For server.js, either:
- (A) Read from a shared JSON file both client and server can access
- (B) Keep server copy but add a comment referencing the source of truth

---

### 1.2 escapeHtml function is duplicated ✅

**Files affected:**
- `app.js:971-975`
- `daily-checklist.js:93-97`

**Impact:** Maintenance burden, potential for divergent implementations.

**Solution:** Move to a shared `utils.js` file and import where needed.

---

### 1.3 getWeekNumber function is duplicated ✅

**Files affected:**
- `app.js:122-128`
- `server.js:59-65`

**Impact:** Same logic maintained in two places.

**Solution:** For client-side only, keep in `utils.js`. Server needs its own copy due to different runtime, but add a comment noting the duplication.

---

### 1.4 Default checklist items defined in two places ✅

**Files affected:**
- `app.js:900-908` (getDefaultChecklistItems)
- `daily-checklist.js:6-13` (DEFAULT_RECURRENT_TASKS)

**Impact:** Defaults could diverge.

**Solution:** Store defaults in localStorage initializer or a shared config. The component should be the single source of truth.

---

## 2. Code Consistency ✅ RESOLVED

### 2.1 Inconsistent modal implementations ✅

**Current state:**
- Task, Reports, Archived modals use `<modal-dialog>` component with `.open()` and `.close()` methods
- Confirm and Checklist modals use legacy `<div class="modal">` with `--active` class toggle

**Impact:** Different patterns for same concept. Harder to maintain and understand.

**Solution:** Migrate Confirm and Checklist modals to use `<modal-dialog>` component for consistency. This would:
- Eliminate duplicate ESC/backdrop handling code in app.js
- Provide consistent animation and styling
- Reduce app.js complexity

---

### 2.2 Functions exposed on window object ✅

**Files affected:** `app.js:592, 711-717, 749`

**Functions:**
- `window.openEditModal`
- `window.updateReportTitle`
- `window.deleteReport`
- `window.backToReportsList`

**Impact:** Global namespace pollution. Not a clean pattern for module-based code.

**Solution:** Use event delegation instead of inline onclick handlers. For example:
```javascript
// Instead of onclick="window.deleteReport('${id}')"
// Use event delegation:
container.addEventListener('click', (e) => {
    if (e.target.matches('.reportsList__deleteBtn')) {
        const id = e.target.closest('[data-report-id]').dataset.reportId;
        deleteReport(id);
    }
});
```

---

### 2.3 Inline HTML event handlers ✅

**Files affected:** `app.js:689-692, 723`

**Current code uses:**
- `onblur="window.updateReportTitle(...)"`
- `onclick="event.stopPropagation(); ..."`
- `onclick="window.backToReportsList()"`

**Impact:** Mixes HTML generation with JS logic. Harder to debug and maintain.

**Solution:** Use event delegation pattern. Attach listeners after rendering HTML.

---

### 2.4 Inconsistent error handling in API functions ✅

**Current state:**
- Some functions show `alert()` on error (generateReport, archiveTasks)
- Others just `console.error` silently (fetchTasks, createTask, updateTask, deleteTask)

**Impact:** Inconsistent user experience. Some failures are invisible to users.

**Solution:** Created a `toast-notification` web component that provides consistent user feedback. Replaced all `alert()` calls with toaster methods:
- `elements.toaster.success(message)` - for successful operations
- `elements.toaster.error(message)` - for errors
- `elements.toaster.warning(message)` - for warnings
- `elements.toaster.info(message)` - for informational messages

---

## 3. Performance ✅ RESOLVED

### 3.1 Component templates are fetched on every instantiation ✅ RESOLVED

**Files affected:** All component `.js` files

**Previous pattern:** Every component instance fetched its HTML/CSS templates, resulting in O(n) HTTP requests.

**Solution:** Added `static templateCache = null` to all 7 components. Templates are now cached at the class level:
- `button.js` - CustomButton.templateCache
- `task-card.js` - TaskCard.templateCache
- `kanban-column.js` - KanbanColumn.templateCache
- `modal-dialog.js` - ModalDialog.templateCache
- `toast-notification.js` - ToastNotification.templateCache
- `daily-checklist.js` - DailyChecklist.templateCache
- `notes-widget.js` - NotesWidget.templateCache

**Result:** HTTP requests reduced from O(n) to O(1) per component type. With 20+ task cards, this eliminates 40+ redundant HTTP requests.

---

### 3.2 Double filter application ✅ RESOLVED

**Previous issue:** `renderAllColumns()` called `applyAllFilters()` at the end, but `renderColumn()` also called it conditionally, resulting in filters being applied multiple times.

**Solution:** Removed the conditional `applyAllFilters()` from `renderColumn()`. Created a `renderColumnWithFilters()` wrapper in `app.js` for cases where a single column render needs filter application (e.g., after creating a new task).

---

### 3.3 getTaskGradient and shouldUseLightText have duplicated logic ✅ RESOLVED

**Previous issue:** Both functions calculated `gradientIndex` identically.

**Solution:** Combined into a single `getTaskColorInfo()` function that returns an object:
```javascript
function getTaskColorInfo(status, position, totalInColumn) {
    // ... calculate gradientIndex once ...
    return {
        gradient: `var(--${status}-gradient-${gradientIndex})`,
        useLightText: gradientIndex < LIGHT_TEXT_THRESHOLD
    };
}
```

Usage in `createTaskCard()`:
```javascript
const colorInfo = getTaskColorInfo(task.status, position, totalInColumn);
card.style.background = colorInfo.gradient;
card.classList.add(colorInfo.useLightText ? '--lightText' : '--darkText');
```

---

## 4. Code Cleanup ✅ RESOLVED

### 4.1 Console.log statements in production code ✅

**File:** `app.js:344, 350, 353` and `kanban-column.js:37, 47`

**Impact:** Noisy console output in production. Performance overhead.

**Solution:** Remove all debug console.log statements or replace with a debug mode:
```javascript
const DEBUG = false;
function log(...args) { if (DEBUG) console.log(...args); }
```

---

### 4.2 Deprecated substr() usage ✅

**File:** `server.js:46`

```javascript
Math.random().toString(36).substr(2, 9)
```

**Impact:** `substr()` is deprecated. May show warnings in some environments.

**Solution:** Replace with `substring()`:
```javascript
Math.random().toString(36).substring(2, 11)
```

---

### 4.3 Unused CSS classes in crisis mode ✅

**File:** `styles.css:1260-1266`

```css
body.--crisisMode .column[data-status="done"] { visibility: hidden; }
body.--crisisMode .dailyChecklist { visibility: hidden; }
```

**Current state:** These selectors target `.column` and `.dailyChecklist` but:
- Columns are now `kanban-column` custom elements
- Daily checklist is now `daily-checklist` custom element

**Impact:** Crisis mode doesn't hide the done column or checklist as intended.

**Solution:** Update selectors:
```css
body.--crisisMode kanban-column[data-status="done"] { visibility: hidden; }
body.--crisisMode daily-checklist { visibility: hidden; }
```

---

### 4.4 Legacy CSS selectors for removed elements ✅

**File:** `styles.css:1306-1346`

The responsive media queries reference `.column`, `.taskCard`, `.taskCard__title`, `.taskCard__desc` but these are now inside Shadow DOM or are custom elements.

**Impact:** Dead CSS that does nothing.

**Solution:** Remove or update these rules. For Shadow DOM styling, use CSS custom properties (already partially done with --text-light, --text-dark).

---

## 5. Reliability

> **Junior Developer Note:** This section is about making the application more robust — meaning it handles errors gracefully, cleans up after itself, and doesn't break when users do unexpected things (like clicking buttons really fast). These issues won't cause visible bugs during normal use, but they can cause problems in edge cases.

---

### 5.1 No error recovery for failed API calls ✅ RESOLVED

**Current state:** If an API call fails, the operation silently fails or shows an alert.

**Impact:** Users may think operations succeeded when they didn't. Data could be lost.

#### What's happening now (the problem)

When you delete a task, the code does this:
1. Send DELETE request to server
2. Wait for response
3. If successful, refresh the task list
4. If error, show an alert (or sometimes nothing at all)

The problem? The user sees the task sitting there the whole time the request is happening. If it fails, they just see an error message and nothing changes. This is called **"pessimistic UI"** — we wait for the server to confirm before showing any change.

#### The proposed solution: Optimistic UI with Rollback

**Optimistic UI** means: "Assume the operation will succeed and update the UI immediately. If it fails, undo the change."

```javascript
async function deleteTask(id) {
    const previousTasks = [...tasks]; // Save state BEFORE we change anything
    tasks = tasks.filter(t => t.id !== id); // Remove task from local array immediately
    renderAllColumns(); // Update UI right away - user sees task disappear instantly!

    try {
        await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
        // Success! The UI already shows the correct state
    } catch (error) {
        tasks = previousTasks; // ROLLBACK: restore the old state
        renderAllColumns(); // Re-render with the task back in place
        showError('Failed to delete task. Please try again.');
    }
}
```

#### Why this matters for user experience

| Scenario | Pessimistic UI | Optimistic UI |
|----------|----------------|---------------|
| Fast network | User waits 200ms, then sees change | User sees change instantly |
| Slow network | User waits 2+ seconds, UI feels sluggish | User sees change instantly |
| Network error | User sees error, task never moved | User sees change, then it "undoes" with error message |

#### Pros of Optimistic UI

1. **Feels instant** — The app feels snappy and responsive
2. **Better perceived performance** — Even on slow networks, the UI responds immediately
3. **Modern UX pattern** — Apps like Trello, Gmail, and Slack all use this approach

#### Cons of Optimistic UI

1. **More complex code** — You need to save state before changes and handle rollbacks
2. **Can confuse users if overused** — If errors happen frequently, users see things appearing/disappearing
3. **Harder to debug** — The UI state temporarily doesn't match the server state

#### Alternative approaches

**Option A: Optimistic UI (proposed above)**
- Best for: Apps where network is usually reliable, fast feedback is important
- This project: Good fit because it's a local app (network is localhost = very fast/reliable)

**Option B: Loading states**
- Show a spinner or "deleting..." state while waiting
- Less jarring than rollback, but still has a delay
```javascript
card.classList.add('--deleting'); // Show visual feedback
await fetch(...);
// Then remove from DOM
```

**Option C: Queue-based approach**
- Queue all operations and process them in the background
- Show a "syncing" indicator
- Most complex, but most robust for offline-capable apps

#### Recommendation for this project

Since this is a **local-only app** (server runs on localhost), network failures are extremely rare. The current approach is actually fine for this use case. However, implementing optimistic UI would be a good learning exercise and would make the app feel more polished.

**If you decide to implement this:**
1. Start with just one function (like `deleteTask`)
2. Test it by temporarily making the API fail
3. Gradually apply to other functions

**Solution implemented (v2.14.0):**

Optimistic UI with rollback has been implemented for all task operations:

1. **State management functions added to `/public/js/state.js`:**
   - `createTasksSnapshot()` — Creates a deep copy of tasks for rollback
   - `restoreTasksFromSnapshot(snapshot)` — Restores tasks from a snapshot
   - `replaceTask(oldId, newTask)` — Replaces temporary tasks with server-confirmed ones
   - `generateTempId()` — Generates prefixed IDs for optimistic creates

2. **Operations updated:**
   - **Create task** (`modals.js`): Creates temp task immediately, replaces with server response on success, removes on failure
   - **Update task** (`modals.js`): Updates state immediately, rolls back on failure
   - **Delete task** (`modals.js`): Removes task immediately, restores on failure
   - **Move task** (`app.js`): Moves task immediately, fetches fresh positions on success, rolls back on failure

3. **User feedback:** All failures show a toast notification with "Changes have been reverted."

---

### 5.2 Missing disconnectedCallback in components ✅ RESOLVED

**Files affected:** All component `.js` files

**Impact:** Event listeners and references aren't cleaned up when components are removed. Potential memory leaks.

#### What is disconnectedCallback?

Web Components have **lifecycle callbacks** — special methods the browser calls automatically at certain times:

| Callback | When it's called |
|----------|------------------|
| `constructor()` | When the element is created (before it's in the DOM) |
| `connectedCallback()` | When the element is added to the DOM |
| `disconnectedCallback()` | When the element is removed from the DOM |
| `attributeChangedCallback()` | When an observed attribute changes |

Think of it like this:
- `connectedCallback` = "Hello, I'm here! Let me set things up."
- `disconnectedCallback` = "Goodbye! Let me clean up after myself."

#### What's the problem?

Look at this simplified version of what `modal-dialog.js` does:

```javascript
class ModalDialog extends HTMLElement {
    connectedCallback() {
        // When modal is added to page, listen for ESC key
        document.addEventListener('keydown', this.handleKeyDown);
    }

    handleKeyDown = (e) => {
        if (e.key === 'Escape') this.close();
    }

    // ❌ PROBLEM: No disconnectedCallback!
    // When modal is removed, the event listener stays attached to document
}
```

Every time you add and remove this component, a NEW event listener gets added to `document`, but the old ones are never removed. After opening/closing the modal 100 times, you'd have 100 event listeners all running!

#### Why memory leaks matter

**Memory leak** = Your program keeps using more and more memory without releasing it.

In this project:
- If components are created and destroyed frequently (like task cards when filtering), listeners pile up
- Each listener holds a reference to the component, preventing garbage collection
- Over time, the page uses more memory and gets slower

For a local app that gets refreshed often, this is low-impact. But it's a bad habit to form.

#### The solution

```javascript
class ModalDialog extends HTMLElement {
    connectedCallback() {
        // Save reference so we can remove the SAME listener later
        this._boundKeyHandler = this.handleKeyDown.bind(this);
        document.addEventListener('keydown', this._boundKeyHandler);
    }

    disconnectedCallback() {
        // Clean up when removed from DOM
        document.removeEventListener('keydown', this._boundKeyHandler);
    }

    handleKeyDown(e) {
        if (e.key === 'Escape') this.close();
    }
}
```

#### Important: Why we use `bind(this)`

This is a common gotcha for junior developers:

```javascript
// ❌ WRONG - These are different function references!
document.addEventListener('keydown', this.handleKeyDown.bind(this));
document.removeEventListener('keydown', this.handleKeyDown.bind(this));
// removeEventListener won't work because .bind() creates a NEW function each time

// ✅ CORRECT - Save the bound function once, use same reference
this._boundKeyHandler = this.handleKeyDown.bind(this);
document.addEventListener('keydown', this._boundKeyHandler);
document.removeEventListener('keydown', this._boundKeyHandler);
```

#### What needs cleanup in each component

| Component | What to clean up |
|-----------|------------------|
| `modal-dialog.js` | Document keydown listener (ESC key) |
| `task-card.js` | Any drag/drop listeners on document |
| `notes-widget.js` | Debounce timeout (use `clearTimeout`) |
| `daily-checklist.js` | LocalStorage event listeners (if any) |

#### Pros of adding disconnectedCallback

1. **Prevents memory leaks** — Proper resource management
2. **Professional code quality** — Shows understanding of component lifecycle
3. **Required for reusable components** — If these components were used in other projects

#### Cons / Why you might skip it

1. **Extra code to maintain** — More lines, more potential bugs
2. **Low impact in this project** — Components aren't frequently destroyed
3. **Page refresh resets everything** — Memory leaks reset on refresh anyway

#### Recommendation for this project

**Priority: Low but educational.** The modal-dialog is the most important one to fix since it adds a document-level listener. Task cards are created/destroyed during filtering, but they don't add document-level listeners.

If you want to learn, start with `modal-dialog.js` — it's the clearest example of the pattern.

**Solution implemented (v2.15.0):**

Added `disconnectedCallback` lifecycle method to components that need cleanup:

1. **modal-dialog.js:**
   - Already had `_boundOnEsc` bound in constructor
   - Added `disconnectedCallback()` that removes the document keydown listener
   - Ensures listener is cleaned up even if modal is removed while open

2. **notes-widget.js:**
   - Added `disconnectedCallback()` that clears the debounce timeout
   - Prevents delayed save from executing after component is removed

3. **toast-notification.js:**
   - Added `_timeoutIds` Set to track auto-dismiss timeout IDs
   - Added `disconnectedCallback()` that clears all pending timeouts
   - Prevents auto-dismiss from executing after component is removed

**Components that don't need cleanup:**
- `task-card.js` — Only shadow DOM listeners (cleaned up automatically)
- `kanban-column.js` — Only shadow DOM listeners
- `daily-checklist.js` — Only shadow DOM listeners
- `button.js` — Only shadow DOM listeners

---

### 5.3 Race condition in moveTask ✅ RESOLVED

**File:** `app.js:234-247`

```javascript
async function moveTask(id, newStatus, newPosition) {
    // ...
    await fetchTasks(); // Refresh all tasks
}
```

**Impact:** If user moves multiple cards quickly, overlapping fetchTasks() calls could cause UI inconsistency.

#### What is a race condition?

A **race condition** happens when the outcome of your code depends on the timing/order of events that you can't control.

Imagine two people editing the same document:
1. Person A opens document (sees "Hello")
2. Person B opens document (sees "Hello")
3. Person A adds "World" → saves "Hello World"
4. Person B adds "Everyone" → saves "Hello Everyone"
5. Person A's changes are lost! 😱

#### How this applies to moveTask

Here's what happens when you drag a card:

```
Timeline (normal case - one move):
─────────────────────────────────────────────────
0ms    User drags card A to "Done"
10ms   moveTask() starts, sends request to server
200ms  Server responds "OK"
210ms  fetchTasks() starts, gets fresh data
400ms  UI renders with new data
```

Now what happens if the user moves two cards quickly:

```
Timeline (race condition - two moves):
─────────────────────────────────────────────────
0ms    User drags card A to "Done"
10ms   moveTask(A) starts → fetch #1 begins
50ms   User drags card B to "In Progress"    ← Before first move finished!
60ms   moveTask(B) starts → fetch #2 begins
200ms  Server responds to move A
210ms  fetchTasks() #1 starts (for move A)
250ms  Server responds to move B
260ms  fetchTasks() #2 starts (for move B)   ← Now TWO fetches running!
400ms  fetchTasks() #1 completes → renders   ← This might show OLD data for B!
410ms  fetchTasks() #2 completes → renders   ← This overwrites with correct data

The 10ms gap between 400ms and 410ms could show incorrect UI state
```

#### Why this matters

1. **UI flicker** — Cards might briefly appear in wrong positions
2. **Confusing feedback** — User sees card jump around
3. **Data inconsistency** — In rare cases, the older fetch could complete AFTER the newer one, overwriting correct state with stale data

#### Solution 1: Simple Lock (proposed in the doc)

```javascript
let isMoving = false;

async function moveTask(id, newStatus, newPosition) {
    if (isMoving) return; // Ignore if already moving something
    isMoving = true;

    try {
        await fetch(`/api/tasks/${id}/move`, { ... });
        await fetchTasks();
    } finally {
        isMoving = false; // Always unlock, even if error
    }
}
```

**How it works:** If user tries to move a second card while the first is still processing, we simply ignore it.

**Pros:**
- Very simple to implement (4 lines of code)
- Easy to understand
- Prevents the race condition entirely

**Cons:**
- User's second action is silently ignored (frustrating if network is slow)
- Not ideal UX — user might think their drag didn't work

#### Solution 2: Queue System

```javascript
const moveQueue = [];
let isProcessing = false;

async function moveTask(id, newStatus, newPosition) {
    // Add to queue
    moveQueue.push({ id, newStatus, newPosition });

    // If already processing, this move will be handled later
    if (isProcessing) return;

    isProcessing = true;
    while (moveQueue.length > 0) {
        const move = moveQueue.shift(); // Take first item
        await fetch(`/api/tasks/${move.id}/move`, { ... });
    }
    await fetchTasks(); // Only fetch once at the end!
    isProcessing = false;
}
```

**How it works:** All moves are queued and processed one by one. Only one fetchTasks() at the end.

**Pros:**
- No user actions are lost
- More efficient (one fetch instead of many)
- Handles rapid clicking gracefully

**Cons:**
- More complex code
- User might see delayed feedback for later moves
- Need to handle queue cancellation if user leaves page

#### Solution 3: Debounce the fetch (not the moves)

```javascript
let fetchDebounceTimer = null;

async function moveTask(id, newStatus, newPosition) {
    await fetch(`/api/tasks/${id}/move`, { ... });

    // Debounce: Only fetch tasks 300ms after the LAST move
    clearTimeout(fetchDebounceTimer);
    fetchDebounceTimer = setTimeout(() => {
        fetchTasks();
    }, 300);
}
```

**How it works:** The actual move happens immediately, but we wait 300ms after the last move before refreshing the UI.

**Pros:**
- Moves are never ignored
- Very efficient for burst operations
- Simple concept

**Cons:**
- UI might be briefly out of sync
- Magic number (300ms) needs tuning

#### Solution 4: AbortController (advanced)

```javascript
let currentFetchController = null;

async function moveTask(id, newStatus, newPosition) {
    await fetch(`/api/tasks/${id}/move`, { ... });

    // Cancel any previous fetch that's still running
    if (currentFetchController) {
        currentFetchController.abort();
    }

    currentFetchController = new AbortController();
    try {
        await fetchTasks({ signal: currentFetchController.signal });
    } catch (e) {
        if (e.name === 'AbortError') {
            // Fetch was cancelled, that's OK
        }
    }
}
```

**How it works:** If a new move starts while a fetch is happening, we cancel the old fetch and start a new one.

**Pros:**
- Always shows the latest state
- No ignored user actions
- Modern browser feature

**Cons:**
- Most complex solution
- Need to modify fetchTasks to accept AbortController
- Older code patterns might not expect aborted fetches

#### Recommendation for this project

**Use Solution 1 (Simple Lock)** for now because:
1. This is a local app — network is fast, race conditions are rare
2. It's easy to implement and understand
3. You can always upgrade to a queue later if needed

If you want to learn more advanced patterns, try Solution 3 (debounce) — it's a very common pattern in web development.

**Solution implemented (v2.16.0):**

Used Solution 1 (Simple Lock) as recommended:

```javascript
let isMoving = false;

async function moveTask(id, newStatus, newPosition) {
    if (isMoving) return; // Ignore if already processing
    isMoving = true;

    // ... optimistic UI update ...

    try {
        await moveTaskApi(id, newStatus, newPosition);
        await fetchTasks();
    } catch (error) {
        // ... rollback ...
    } finally {
        isMoving = false; // Always unlock
    }
}
```

**Key implementation details:**
- Lock check happens before any state changes
- Early return with lock release if task not found
- `finally` block ensures lock is always released, even on error
- Simple and effective for a local app where network is fast

---

### 5.4 No input sanitization on server

**File:** `server.js`

**Current state:** Only validates that title exists. No length limits, no character validation.

**Impact:** Very long titles could cause display issues. Special characters could cause problems.

#### What is input sanitization/validation?

**Validation** = Checking that data meets your requirements (right format, right length, right type)
**Sanitization** = Cleaning data to remove or escape potentially harmful content

Think of it like a nightclub bouncer:
- **Validation**: "Do you have ID? Are you on the guest list?"
- **Sanitization**: "Leave your weapons at the door."

#### Why does the server need to validate?

"But the frontend already checks the title isn't empty!" — True, but...

```
                    ┌──────────────┐
                    │   Browser    │
                    │  (your app)  │
                    └──────┬───────┘
                           │ Normal users go through UI
                           ▼
┌──────────────┐    ┌──────────────┐
│   Attacker   │───▶│   Server     │
│  (curl, etc) │    │  (your API)  │
└──────────────┘    └──────────────┘
      │
      └── Attackers can skip the frontend entirely!
```

Anyone can open Terminal and type:
```bash
curl -X POST http://localhost:3001/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title": "A"}'  # Repeat "A" 10 million times
```

Or using browser DevTools:
```javascript
fetch('/api/tasks', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({title: 'x'.repeat(10000000)})
});
```

**The golden rule:** Never trust data from the client. Always validate on the server.

#### What could go wrong without validation?

| Attack | What happens | Impact |
|--------|--------------|--------|
| Very long title (10MB) | Server tries to save huge JSON file | Disk fills up, app crashes |
| Very long title (10KB) | Card display breaks, CSS overflows | UI looks broken |
| Special characters | Depends on how data is used | Could break JSON parsing |
| Negative category number | Category badge shows "undefined" | UI confusion |
| Non-integer position | Sort order breaks | Cards appear random |

#### The proposed solution

```javascript
// Add these constants at the top of server.js
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;

// In the POST /api/tasks handler:
app.post('/api/tasks', (req, res) => {
    const { title, description, priority, category } = req.body;

    // Validate title
    if (!title || typeof title !== 'string') {
        return res.status(400).json({ error: 'Title is required' });
    }

    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0) {
        return res.status(400).json({ error: 'Title cannot be empty' });
    }

    if (trimmedTitle.length > MAX_TITLE_LENGTH) {
        return res.status(400).json({
            error: `Title must be ${MAX_TITLE_LENGTH} characters or less`
        });
    }

    // Validate description (optional, but limit length)
    let validDescription = '';
    if (description) {
        if (typeof description !== 'string') {
            return res.status(400).json({ error: 'Description must be text' });
        }
        if (description.length > MAX_DESCRIPTION_LENGTH) {
            return res.status(400).json({
                error: `Description must be ${MAX_DESCRIPTION_LENGTH} characters or less`
            });
        }
        validDescription = description;
    }

    // Validate category (must be 1-6)
    let validCategory = 1; // Default
    if (category !== undefined) {
        const catNum = parseInt(category, 10);
        if (isNaN(catNum) || catNum < 1 || catNum > 6) {
            return res.status(400).json({ error: 'Category must be 1-6' });
        }
        validCategory = catNum;
    }

    // Validate priority (must be boolean)
    const validPriority = priority === true;

    // Now create the task with validated data
    const task = {
        id: generateId(),
        title: trimmedTitle,
        description: validDescription,
        priority: validPriority,
        category: validCategory,
        // ... rest of task properties
    };

    // Save and respond...
});
```

#### Understanding HTTP status codes

| Code | Meaning | When to use |
|------|---------|-------------|
| `200 OK` | Success | Everything worked |
| `201 Created` | Created | New resource was created |
| `400 Bad Request` | Client error | Invalid input data ← **Use this for validation errors** |
| `404 Not Found` | Not found | Resource doesn't exist |
| `500 Internal Server Error` | Server error | Something broke on server |

Always return 400 for validation errors — it tells the client "your request was wrong, fix it and try again."

#### Pros of server-side validation

1. **Security** — Protects against malicious input
2. **Data integrity** — Database only contains valid data
3. **Clear error messages** — Users know exactly what's wrong
4. **Defense in depth** — Even if frontend validation fails, server catches it

#### Cons / Trade-offs

1. **More code to write** — Validation logic for every field
2. **Duplication** — Often need similar validation on frontend AND backend
3. **Maintenance** — If rules change, update both places

#### What about XSS (Cross-Site Scripting)?

XSS is when an attacker injects JavaScript that runs in other users' browsers:

```javascript
// Attacker creates task with title:
"<script>alert('hacked!')</script>"

// If you display it without escaping:
card.innerHTML = task.title; // ❌ Script executes!

// Safe way:
card.textContent = task.title; // ✅ Displayed as text
// OR use escapeHtml():
card.innerHTML = escapeHtml(task.title); // ✅ Displayed as text
```

This project already uses `escapeHtml()` in most places (good!), but server-side validation adds another layer of protection.

#### Recommendation for this project

**Priority: Medium.** Since this is a local-only app (only YOU use it), the security risk is low. But it's still good practice:

1. **Start simple:** Add length limits first (easiest)
2. **Add type checking:** Make sure numbers are numbers, booleans are booleans
3. **Consider validation library later:** For more complex validation, libraries like `zod` or `joi` make this easier

```javascript
// Example with zod (if you want to learn)
const taskSchema = z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    category: z.number().int().min(1).max(6).optional(),
    priority: z.boolean().optional()
});

// Then in your handler:
const result = taskSchema.safeParse(req.body);
if (!result.success) {
    return res.status(400).json({ error: result.error.message });
}
const validData = result.data;
```

### Section 5 Summary: What Should a Junior Developer Do?

Here's my recommendation for how to approach these items, considering this is a **local-only, single-user app**:

| Item | Effort | Impact | Learn? | Recommendation |
|------|--------|--------|--------|----------------|
| 5.1 Error recovery | Medium | Low (local network is reliable) | ⭐⭐⭐ Great for learning | ✅ Implemented (v2.14.0) |
| 5.2 disconnectedCallback | Low | Low (page refreshes clean up) | ⭐⭐ Good concept | ✅ Implemented (v2.15.0) |
| 5.3 Race condition | Low | Low (local = fast) | ⭐⭐⭐ Very common issue | ✅ Implemented (v2.16.0) |
| 5.4 Input validation | Medium | Medium (prevents weird bugs) | ⭐⭐⭐ Essential skill | Add length limits at minimum |

#### Suggested order of implementation:

1. ~~**5.1 (Error recovery)** — Optimistic UI with rollback~~ ✅ DONE (v2.14.0)
2. ~~**5.2 (disconnectedCallback)** — Component cleanup~~ ✅ DONE (v2.15.0)
3. ~~**5.3 (Race condition)** — Simple lock pattern~~ ✅ DONE (v2.16.0)
4. **5.4 (Input validation)** — Important skill to learn, prevents data issues

#### Key takeaways for your career:

- **Always validate on the server** — Never trust client-side validation alone
- **Clean up after yourself** — Remove listeners, clear timers, abort fetches
- **Think about concurrent operations** — What if the user clicks twice? Fast?
- **Consider failure modes** — What if the network fails? What does the user see?

These patterns apply to ALL web development, not just this project. Learning them now will make you a better developer.

---

## 6. Maintainability

### 6.1 Large app.js file (1090+ lines) ✅ RESOLVED

**Impact:** Hard to navigate, understand, and maintain.

**Solution:** Split into logical modules:
```
/public/js/
    app.js           # Main entry point (~500 lines), wires modules together
    state.js         # Shared application state management
    api.js           # HTTP API functions for server communication
    filters.js       # Category/priority filtering logic
    crisis-mode.js   # Crisis mode functionality
    modals.js        # Modal dialog handling
    constants.js     # Shared constants (already existed)
    utils.js         # Shared utilities (already existed)
```

**Architecture:**
- `state.js` provides centralized state with getter/setter functions
- `api.js` contains pure functions that make HTTP calls and return data
- `filters.js`, `crisis-mode.js`, `modals.js` handle specific UI features
- `app.js` is the main entry that imports all modules and wires them together

**Benefits:**
- Each module has a single responsibility
- Easier to navigate and understand (~100-400 lines per module)
- Can be tested independently
- Clear separation of concerns

---

### 6.2 Magic numbers throughout codebase ✅ RESOLVED

**Examples:**
- `6` - checklist reset hour (`daily-checklist.js:71`)
- `500` - debounce delay (`notes-widget.js:81`)
- `20` - max gradients (`app.js:147`)
- `12` - light/dark text threshold (`app.js:173`)
- `3001` - server port (`server.js:6`)

**Solution:** Added named constants to `/public/js/constants.js`:
```javascript
export const DEFAULT_PORT = 3001;
export const CHECKLIST_RESET_HOUR = 6;
export const DEBOUNCE_DELAY_MS = 500;
export const MAX_GRADIENT_STEPS = 20;
export const LIGHT_TEXT_THRESHOLD = 12;
```

Components now import and use these constants instead of magic numbers.

---

### 6.3 No JSDoc comments ✅ RESOLVED

**Impact:** New contributors won't understand function purposes, parameters, or return values.

**Solution:** Added JSDoc comments to key functions in `app.js`:
- `getTaskGradient()`, `shouldUseLightText()` - Color management
- `fetchTasks()`, `createTask()`, `updateTask()`, `deleteTask()`, `moveTask()` - API functions
- `generateReport()`, `archiveTasks()` - Report/archive operations
- `createTaskCard()`, `renderAllColumns()`, `renderColumn()` - Render functions
- `applyAllFilters()`, `toggleCategoryFilter()`, `togglePriorityFilter()` - Filter functions
- `toggleCrisisMode()`, `generateRedStarFavicon()`, `setFavicon()` - Crisis mode
- `renderReportSection()` - Report rendering

---

### 6.4 Hardcoded server port ✅ RESOLVED

**File:** `server.js:6`

**Previous:** `const PORT = 3001;`

**Solution:** Now uses environment variable with fallback:
```javascript
const PORT = process.env.PORT || 3001;
```

Additionally, `DEFAULT_PORT` is exported from `/public/js/constants.js` for client-side reference.

---

## 7. Security Considerations

> **Junior Developer Note:** Security might seem less important for a local-only app, but learning these concepts now is crucial. The habits you build here will carry into your future projects where security IS critical. Plus, even local apps can have security issues if you ever share your screen or if someone accesses your computer.

---

### 7.1 XSS potential in dynamically generated HTML

**Files:** `app.js` various render functions

**Current state:** `escapeHtml()` is used in some places but not consistently.

**Examples of potentially unsafe code:**
- `app.js:692`: `onclick="...window.deleteReport('${report.id}')..."` - if report.id contained malicious content
- `app.js:114`: URL in daily checklist link could be malicious

#### What is XSS (Cross-Site Scripting)?

XSS is one of the most common web security vulnerabilities. It happens when an attacker injects malicious code (usually JavaScript) into your application, and that code runs in someone's browser.

**The attack flow:**
```
1. Attacker creates a task with malicious title:
   "<img src=x onerror='alert(document.cookie)'>"

2. Your app saves this to tasks.json (server doesn't check)

3. When the page loads, your app renders:
   card.innerHTML = task.title;  // ❌ DANGEROUS!

4. Browser sees an <img> tag, tries to load "x", fails,
   and executes the onerror JavaScript!

5. Attacker's code now runs with full access to:
   - Your cookies
   - Your localStorage
   - The entire DOM
   - Can make requests as you
```

#### Why is this dangerous even for a local app?

| Scenario | Risk |
|----------|------|
| You paste a task title from the internet | Could contain hidden malicious code |
| Someone sends you a "tasks.json" backup | Could be poisoned with XSS |
| You share your screen | Malicious code could run visibly |
| Future feature: import/export | Opens door to XSS attacks |

#### The three types of XSS

| Type | How it works | Example |
|------|--------------|---------|
| **Stored XSS** | Malicious script saved to database/file | Task title with `<script>` tag |
| **Reflected XSS** | Script in URL gets displayed | `?search=<script>alert(1)</script>` |
| **DOM XSS** | Script injected via client-side JS | `innerHTML = userInput` |

This project is vulnerable to **Stored XSS** (saved in tasks.json) and **DOM XSS** (using innerHTML).

#### Safe vs Unsafe ways to display user content

```javascript
// ❌ UNSAFE - HTML is parsed and executed
element.innerHTML = userInput;
element.innerHTML = `<div>${userInput}</div>`;

// ✅ SAFE - Displayed as plain text, HTML not parsed
element.textContent = userInput;
element.innerText = userInput;

// ✅ SAFE - Escaped before insertion
element.innerHTML = `<div>${escapeHtml(userInput)}</div>`;
```

#### How escapeHtml() works

```javascript
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;  // Browser escapes automatically
    return div.innerHTML;    // Returns escaped string
}

// What it does:
escapeHtml('<script>alert("xss")</script>')
// Returns: '&lt;script&gt;alert("xss")&lt;/script&gt;'
// Browser displays: <script>alert("xss")</script>
// But it's just TEXT, not executable!
```

#### The specific issues in this project

**Issue 1: Inline event handlers with IDs**
```javascript
// Current code (simplified):
`<button onclick="window.deleteReport('${report.id}')">Delete</button>`

// If report.id was: "'); alert('xss'); ('"
// The result would be:
`<button onclick="window.deleteReport(''); alert('xss'); ('')">Delete</button>`
//                                         ^^^^^^^^^^^^^^^ Injected code!
```

**Solution:** Use event delegation instead of inline handlers:
```javascript
// Generate HTML without inline handlers:
`<button class="js-deleteBtn" data-id="${escapeHtml(report.id)}">Delete</button>`

// Attach listener after rendering:
container.addEventListener('click', (e) => {
    if (e.target.matches('.js-deleteBtn')) {
        const id = e.target.dataset.id; // Already safe
        deleteReport(id);
    }
});
```

**Issue 2: URLs in checklist items**
```javascript
// Current code might do:
`<a href="${item.url}">Link</a>`

// If item.url was: "javascript:alert('xss')"
// Clicking the link executes JavaScript!
```

**Solution:** Validate URLs before using:
```javascript
function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

// Only render link if URL is valid
if (item.url && isValidUrl(item.url)) {
    html += `<a href="${escapeHtml(item.url)}">↗</a>`;
}
```

#### Audit checklist for XSS prevention

Go through your code and check every place where user data is displayed:

| Location | User Data | Currently Safe? | Fix Needed? |
|----------|-----------|-----------------|-------------|
| Task card title | `task.title` | Check if using escapeHtml | Audit |
| Task card description | `task.description` | Check if using escapeHtml | Audit |
| Report list titles | `report.title` | Check if using escapeHtml | Audit |
| Checklist item text | `item.text` | Check if using escapeHtml | Audit |
| Checklist item URL | `item.url` | Needs URL validation | Yes |
| Modal activity log | `log.action` | Check if using escapeHtml | Audit |
| Notes content | `notes.content` | Uses textarea (safe) | No |

#### Pros of fixing XSS issues

1. **Security habit** — Learn patterns you'll use forever
2. **Defense in depth** — Multiple layers of protection
3. **Future-proofing** — Safe if you ever add multi-user features

#### Cons / Why you might deprioritize

1. **Local-only app** — Only you can create tasks
2. **Time investment** — Need to audit entire codebase
3. **Low practical risk** — You're not likely to XSS yourself

#### Recommendation for this project

**Priority: Medium-Low for security, High for learning.**

1. **Quick win:** Replace all inline `onclick` handlers with event delegation (also improves code quality)
2. **Audit:** Search for `innerHTML` and verify each one uses `escapeHtml()`
3. **Add URL validation:** For the checklist URL feature

### 7.2 No request rate limiting ✅ RESOLVED

**File:** `server.js`

**Impact:** Server could be overwhelmed by rapid requests.

**Solution implemented:** DIY vanilla rate limiter (no external packages)

#### What is rate limiting?

Rate limiting is like a bouncer at a club who says "you can only enter 5 times per hour." It prevents anyone (or any program) from making too many requests in a short time.

```
Without rate limiting:
─────────────────────────────────────────────────────
Client: GET GET GET GET GET GET GET GET GET GET GET GET...
Server: 😰 Processing all requests... CPU at 100%... crash!

With rate limiting (max 5 requests per second):
─────────────────────────────────────────────────────
Client: GET GET GET GET GET GET GET GET GET GET GET GET...
Server: ✓   ✓   ✓   ✓   ✓   ❌  ❌  ❌  ❌  ❌  ❌  ❌
                              └── "429 Too Many Requests"
```

#### Why would someone make too many requests?

| Source | Intent | Impact |
|--------|--------|--------|
| Bug in your code | Accidental infinite loop | Server overload |
| User clicking fast | Impatience | Duplicate operations |
| Script/bot | Malicious (DoS attack) | Server crash |
| Browser auto-retry | Network issues | Request storm |

#### Why this is LOW priority for self-hosted apps

```
Public web app:                    Self-hosted app:
──────────────────                 ──────────────────
Internet → Server                  localhost → Server
    ↑                                    ↑
Millions of                        Only YOU
potential attackers                (and maybe your cat)
```

For a self-hosted, local-only app like this:
1. Only YOU can access the server
2. You're not going to DoS yourself
3. No internet exposure = no external attackers

#### When you WOULD want rate limiting

Even for self-hosted apps, consider rate limiting if:

1. **You expose it to your local network** — Other devices can access
2. **You add any remote access** — VPN, port forwarding, etc.
3. **You have background sync** — Could create accidental request storms
4. **Learning purposes** — Practice implementing it

#### How to implement rate limiting

**Option 1: Express Rate Limit (npm package)**

```bash
npm install express-rate-limit
```

```javascript
// In server.js
const rateLimit = require('express-rate-limit');

// Create a limiter: max 100 requests per minute per IP
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,  // 1 minute window
    max: 100,              // Max 100 requests per window
    message: {
        error: 'Too many requests, please try again later.'
    },
    standardHeaders: true, // Return rate limit info in headers
    legacyHeaders: false
});

// Apply to all API routes
app.use('/api/', apiLimiter);
```

**What this does:**
- Tracks requests per IP address
- After 100 requests in 1 minute, returns 429 error
- Resets counter after the window expires

**Option 2: Simple DIY rate limiter (no dependencies)**

```javascript
// Simple in-memory rate limiter
const requestCounts = new Map();

function simpleRateLimiter(maxRequests, windowMs) {
    return (req, res, next) => {
        const ip = req.ip;
        const now = Date.now();

        // Get or create entry for this IP
        let entry = requestCounts.get(ip);
        if (!entry || now - entry.windowStart > windowMs) {
            entry = { count: 0, windowStart: now };
            requestCounts.set(ip, entry);
        }

        entry.count++;

        if (entry.count > maxRequests) {
            return res.status(429).json({
                error: 'Too many requests. Please slow down.'
            });
        }

        next();
    };
}

// Usage
app.use('/api/', simpleRateLimiter(100, 60000));
```

**Pros:** No dependencies, educational, simple
**Cons:** Doesn't persist across restarts, memory grows with IPs

**Option 3: Per-operation limiting**

Instead of limiting all API calls, limit specific risky operations:

```javascript
// Only limit operations that are expensive or risky
app.post('/api/reports/generate', generateReportLimiter, (req, res) => {
    // Generate report...
});

// Generous limit for read operations
app.get('/api/tasks', readLimiter, (req, res) => {
    // Get tasks...
});
```

#### Understanding HTTP 429

When rate limit is exceeded, return status code `429 Too Many Requests`:

```javascript
res.status(429).json({
    error: 'Rate limit exceeded',
    retryAfter: 60  // Tell client when to retry (seconds)
});
```

Your frontend should handle this:
```javascript
async function fetchTasks() {
    const response = await fetch('/api/tasks');

    if (response.status === 429) {
        elements.toaster.warning('Too many requests. Please wait a moment.');
        return null;
    }

    // ... rest of handling
}
```

#### Pros of adding rate limiting

1. **Protection** — Prevents accidental or intentional overload
2. **Learning** — Common pattern in web development
3. **Future-proofing** — Ready if you ever expose the app

#### Cons / Why skip it for this project

1. **Unnecessary** — Local-only means no external threats
2. **Added dependency** — One more package to manage
3. **Could interfere** — Might break normal usage if limits are too strict
4. **Premature optimization** — Solving a problem that doesn't exist

#### Recommendation for this project

**Priority: Very Low (Skip for now).**

This is the one item you can safely ignore for a self-hosted, local-only app. Focus your energy on:
- Learning the concept (read this section)
- Add it later if you ever expose the app to a network

If you DO want to implement it for learning:
- Use the simple DIY version (Option 2)
- Set generous limits (1000 requests/minute)
- Only apply to write operations (POST/PUT/DELETE)

---

### Section 7 Summary: Security for Self-Hosted Apps

| Item | Applies to Self-Hosted? | Priority | Status |
|------|------------------------|----------|--------|
| 7.1 XSS | Yes (data could come from outside) | Medium | Audit innerHTML usage |
| 7.2 Rate limiting | Optional (only you access it) | Very Low | ✅ Implemented (DIY) |

**The key insight:** Even for local apps, **input handling** matters because data might come from external sources (copy/paste, imports, shared files). But **network protection** is less relevant when there's no network exposure.

---

## 8. Testing Readiness

> **Junior Developer Note:** This section is ESPECIALLY important for a self-hosted, open-source project. Why? Because:
> 1. **You are the QA team** — No one else will test before you deploy
> 2. **Contributors need confidence** — Tests let others contribute without fear of breaking things
> 3. **You'll forget how it works** — Tests document expected behavior
> 4. **Regressions are silent** — Without tests, bugs sneak back in unnoticed

---

### 8.1 No test infrastructure ✅ RESOLVED

**Previous state:** No test files, no test framework configured.

**Impact:** Changes can't be verified automatically. Regressions go unnoticed.

**Solution implemented:** Vanilla Node.js test runner (zero dependencies)

**Test files created:**
```
tests/
├── unit/
│   ├── utils.test.js        # 15 tests - getWeekNumber, formatDateRange, generateId
│   └── validation.test.js   # 54 tests - title, category, priority, status, position
└── api/
    ├── tasks.test.js        # 32 tests - CRUD operations for tasks
    ├── notes.test.js        # 12 tests - Notes save/retrieve
    ├── reports.test.js      # 25 tests - Report generation, archive
    └── rate-limit.test.js   # 8 tests - Rate limiting headers
```

**Test commands added to package.json:**
```json
{
  "scripts": {
    "test": "node --test 'tests/**/*.test.js'",
    "test:unit": "node --test 'tests/unit/*.test.js'",
    "test:api": "node --test 'tests/api/*.test.js'",
    "test:watch": "node --test --watch 'tests/**/*.test.js'"
  }
}
```

**Total: 146 tests using vanilla Node.js `node:test` module (no npm packages)**

#### What is automated testing?

Instead of manually clicking through your app to check if things work, you write code that checks for you:

```javascript
// Manual testing (what you do now):
// 1. Open browser
// 2. Create a task
// 3. Check if it appears
// 4. Edit the task
// 5. Check if changes saved
// ... repeat for every feature, every time you change code

// Automated testing (what you could do):
test('creating a task adds it to the list', async () => {
    const response = await fetch('/api/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: 'Test task' })
    });
    const task = await response.json();

    expect(task.title).toBe('Test task');
    expect(task.id).toBeDefined();
    expect(task.status).toBe('todo');
});
// Run this 1000 times with one command!
```

#### Types of tests (Testing Pyramid)

```
                    /\
                   /  \      E2E Tests (slowest, most realistic)
                  /    \     - Test entire app in real browser
                 /──────\    - Example: Puppeteer, Playwright, Cypress
                /        \
               /          \  Integration Tests (medium speed)
              /            \ - Test multiple parts together
             /──────────────\- Example: API endpoints with real database
            /                \
           /                  \ Unit Tests (fastest, most numerous)
          /                    \- Test individual functions
         /────────────────────────- Example: escapeHtml(), getWeekNumber()
```

| Type | Speed | Confidence | Maintenance | Start Here? |
|------|-------|------------|-------------|-------------|
| Unit | ⚡ Fast | Low (isolated) | Easy | Yes |
| Integration | 🚗 Medium | Medium | Medium | Yes |
| E2E | 🐢 Slow | High (realistic) | Hard | No |

**For this project, start with Unit and Integration tests.**

#### Why testing matters for self-hosted projects

| Scenario | Without Tests | With Tests |
|----------|---------------|------------|
| You add a new feature | Might break existing features without knowing | Tests catch regressions immediately |
| Someone contributes code | You manually test everything | CI runs tests automatically |
| You return after 3 months | "Does this still work?" *clicks around nervously* | Run tests, get instant confidence |
| Refactoring code | Terrifying, might break something | Refactor freely, tests verify behavior |

#### Step 1: Choose a test framework

**For Node.js/JavaScript, the main options:**

| Framework | Pros | Cons | Best For |
|-----------|------|------|----------|
| **Node Test Runner** | Built into Node.js, no install, vanilla | Less features than Jest | ✅ **This project** |
| **Jest** | Most popular, great docs, built-in coverage | Slower, heavy, external dependency | Large projects |
| **Vitest** | Very fast, modern, Jest-compatible API | Newer, external dependency | Vite projects |

**Recommendation for this project: Node.js Built-in Test Runner** — It aligns with your vanilla philosophy: zero dependencies, built into Node.js since v18.

> **Why vanilla testing fits this project:**
> - No `npm install` needed — just use what Node.js provides
> - No configuration files (`.babelrc`, `jest.config.js`, etc.)
> - No version conflicts or security updates to manage
> - Same syntax concepts as Jest (easy to learn Jest later if needed)
> - Perfect for a self-hosted project that values simplicity

#### Step 2: Setup (Zero Install!)

**Check your Node.js version:**
```bash
node --version
# Must be v18.0.0 or higher (you likely have v20+)
```

**That's it!** No packages to install. The test runner is built into Node.js.

Add to `package.json`:
```json
{
  "scripts": {
    "test": "node --test",
    "test:watch": "node --test --watch"
  }
}
```

#### Step 3: Create test directory structure

```
/
├── server.js
├── package.json
├── tests/                      # All tests go here
│   ├── api/                    # API/Integration tests
│   │   ├── tasks.test.js       # Tests for /api/tasks endpoints
│   │   ├── reports.test.js     # Tests for /api/reports endpoints
│   │   └── notes.test.js       # Tests for /api/notes endpoints
│   └── unit/                   # Unit tests
│       ├── utils.test.js       # Tests for utility functions
│       └── validation.test.js  # Tests for validation logic
└── public/
    └── js/
        └── utils.js
```

#### Step 4: Write your first tests (Vanilla Node.js)

**The built-in test runner uses `node:test` and `node:assert` modules:**

Create `tests/unit/utils.test.js`:
```javascript
// Import Node.js built-in test modules (no npm install needed!)
const { describe, it } = require('node:test');
const assert = require('node:assert');

// Copy the function here for now (later we'll import from shared module)
function getWeekNumber(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// Group related tests with describe()
describe('getWeekNumber', () => {

    it('returns week 1 for January 1st, 2026', () => {
        const result = getWeekNumber(new Date('2026-01-01'));
        assert.strictEqual(result, 1);
    });

    it('returns week 52 or 53 for end of year', () => {
        const week = getWeekNumber(new Date('2026-12-31'));
        assert.ok(week >= 52, 'Week should be at least 52');
        assert.ok(week <= 53, 'Week should be at most 53');
    });

    it('returns correct week for mid-year date', () => {
        // July 15, 2026 should be around week 29
        const week = getWeekNumber(new Date('2026-07-15'));
        assert.strictEqual(week, 29);
    });

    it('handles string date input', () => {
        const week = getWeekNumber('2026-03-15');
        assert.strictEqual(typeof week, 'number');
        assert.ok(week > 0 && week <= 53);
    });
});

// Test input validation (example for future validation logic)
describe('input validation', () => {

    it('category must be between 1 and 6', () => {
        const isValidCategory = (cat) => Number.isInteger(cat) && cat >= 1 && cat <= 6;

        assert.strictEqual(isValidCategory(1), true);
        assert.strictEqual(isValidCategory(6), true);
        assert.strictEqual(isValidCategory(0), false);
        assert.strictEqual(isValidCategory(7), false);
        assert.strictEqual(isValidCategory(3.5), false);
        assert.strictEqual(isValidCategory('2'), false);
    });

    it('title must not be empty after trimming', () => {
        const isValidTitle = (title) => typeof title === 'string' && title.trim().length > 0;

        assert.strictEqual(isValidTitle('Hello'), true);
        assert.strictEqual(isValidTitle('  Hello  '), true);
        assert.strictEqual(isValidTitle(''), false);
        assert.strictEqual(isValidTitle('   '), false);
        assert.strictEqual(isValidTitle(null), false);
    });
});
```

**Run with:**
```bash
npm test
# Or directly:
node --test
```

#### Node.js Assert Methods (Cheat Sheet)

| Method | What it checks | Example |
|--------|----------------|---------|
| `assert.strictEqual(a, b)` | a === b (exact match) | `assert.strictEqual(1 + 1, 2)` |
| `assert.notStrictEqual(a, b)` | a !== b | `assert.notStrictEqual(1, 2)` |
| `assert.deepStrictEqual(a, b)` | Objects/arrays match | `assert.deepStrictEqual([1,2], [1,2])` |
| `assert.ok(value)` | Value is truthy | `assert.ok(result > 0)` |
| `assert.throws(fn)` | Function throws error | `assert.throws(() => badFn())` |
| `assert.rejects(promise)` | Promise rejects | `await assert.rejects(asyncBadFn())` |

**Jest vs Node.js comparison:**
```javascript
// Jest syntax:
expect(value).toBe(2);
expect(value).toEqual({ a: 1 });
expect(value).toBeTruthy();

// Node.js syntax (what we use):
assert.strictEqual(value, 2);
assert.deepStrictEqual(value, { a: 1 });
assert.ok(value);
```

The concepts are identical — only the syntax differs. If you learn Node.js testing, you can easily switch to Jest later.

#### Step 5: Write API integration tests (Vanilla Node.js)

These test your Express endpoints. We'll use Node.js built-in `http` module — no `supertest` needed!

Create `tests/api/tasks.test.js`:
```javascript
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs').promises;
const path = require('node:path');

// Simple HTTP helper (vanilla replacement for supertest)
function makeRequest(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const http = require('node:http');
        const options = {
            hostname: 'localhost',
            port: 3001,
            path: path,
            method: method,
            headers: { 'Content-Type': 'application/json' }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    body: data ? JSON.parse(data) : null
                });
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

// Helper shortcuts
const get = (path) => makeRequest('GET', path);
const post = (path, body) => makeRequest('POST', path, body);
const del = (path) => makeRequest('DELETE', path);

describe('Tasks API', () => {
    const DATA_DIR = './data';
    const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
    let originalTasks;

    // Save original tasks before all tests
    before(async () => {
        try {
            originalTasks = await fs.readFile(TASKS_FILE, 'utf8');
        } catch {
            originalTasks = '[]';
        }
    });

    // Reset tasks file before each test
    beforeEach(async () => {
        await fs.writeFile(TASKS_FILE, '[]');
    });

    // Restore original tasks after all tests
    after(async () => {
        await fs.writeFile(TASKS_FILE, originalTasks);
    });

    describe('POST /api/tasks', () => {

        it('creates a new task with valid data', async () => {
            const newTask = {
                title: 'Test Task',
                description: 'Test Description',
                category: 2,
                priority: true
            };

            const response = await post('/api/tasks', newTask);

            assert.strictEqual(response.status, 201);
            assert.strictEqual(response.body.title, 'Test Task');
            assert.ok(response.body.id, 'Task should have an ID');
            assert.strictEqual(response.body.status, 'todo');
            assert.strictEqual(response.body.position, 0);
        });

        it('returns 400 when title is missing', async () => {
            const response = await post('/api/tasks', { description: 'No title' });

            assert.strictEqual(response.status, 400);
            assert.ok(response.body.error, 'Should return error message');
        });

        it('returns 400 when title is empty string', async () => {
            const response = await post('/api/tasks', { title: '   ' });

            assert.strictEqual(response.status, 400);
            assert.ok(response.body.error, 'Should return error message');
        });

        it('sets default category to 1 if not provided', async () => {
            const response = await post('/api/tasks', { title: 'No category' });

            assert.strictEqual(response.status, 201);
            assert.strictEqual(response.body.category, 1);
        });
    });

    describe('GET /api/tasks', () => {

        it('returns empty array when no tasks exist', async () => {
            const response = await get('/api/tasks');

            assert.strictEqual(response.status, 200);
            assert.deepStrictEqual(response.body, []);
        });

        it('returns all tasks', async () => {
            // Create two tasks first
            await post('/api/tasks', { title: 'Task 1' });
            await post('/api/tasks', { title: 'Task 2' });

            const response = await get('/api/tasks');

            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.body.length, 2);
        });
    });

    describe('DELETE /api/tasks/:id', () => {

        it('deletes an existing task', async () => {
            // Create a task
            const createResponse = await post('/api/tasks', { title: 'To Delete' });
            const taskId = createResponse.body.id;

            // Delete it
            const deleteResponse = await del(`/api/tasks/${taskId}`);
            assert.strictEqual(deleteResponse.status, 200);

            // Verify it's gone
            const getResponse = await get('/api/tasks');
            assert.strictEqual(getResponse.body.length, 0);
        });

        it('returns 404 for non-existent task', async () => {
            const response = await del('/api/tasks/nonexistent123');

            assert.strictEqual(response.status, 404);
        });
    });
});
```

**Important:** API tests require the server to be running. Run in two terminals:
```bash
# Terminal 1: Start the server
node server.js

# Terminal 2: Run API tests
node --test tests/api/
```

Or create a test script that starts/stops the server automatically (advanced).

#### Step 6: Test Lifecycle Hooks

The Node.js test runner provides hooks to run code before/after tests:

```javascript
const { describe, it, before, after, beforeEach, afterEach } = require('node:test');

describe('my tests', () => {

    before(() => {
        // Runs ONCE before all tests in this describe block
        console.log('Setting up...');
    });

    beforeEach(() => {
        // Runs before EACH test
        // Good for resetting state
    });

    afterEach(() => {
        // Runs after EACH test
        // Good for cleanup
    });

    after(() => {
        // Runs ONCE after all tests complete
        console.log('Tearing down...');
    });

    it('test 1', () => { /* ... */ });
    it('test 2', () => { /* ... */ });
});
```

**Common use cases:**
| Hook | Use For |
|------|---------|
| `before` | Start server, create test database |
| `beforeEach` | Reset data to known state |
| `afterEach` | Clean up created resources |
| `after` | Stop server, delete test files |

#### What to test first (priority order)

| Priority | What | Why | Difficulty |
|----------|------|-----|------------|
| 1 | API endpoints (CRUD) | Core functionality, easy to test | Easy |
| 2 | Utility functions | Pure functions, no dependencies | Easy |
| 3 | Validation logic | Prevents bad data | Easy |
| 4 | Report generation | Complex logic | Medium |
| 5 | Position/ordering | Tricky edge cases | Medium |
| 6 | Frontend components | Needs browser environment | Hard |

#### Running tests

```bash
# Run all tests once
npm test
# Or directly:
node --test

# Run tests in watch mode (re-runs on file changes)
npm run test:watch
# Or directly:
node --test --watch

# Run only unit tests
node --test tests/unit/

# Run only API tests
node --test tests/api/

# Run a specific test file
node --test tests/unit/utils.test.js

# Run tests matching a pattern in the name
node --test --test-name-pattern="creates a new task"
```

#### Understanding test output

```
▶ getWeekNumber
  ✔ returns week 1 for January 1st, 2026 (1.234ms)
  ✔ returns week 52 or 53 for end of year (0.456ms)
  ✔ returns correct week for mid-year date (0.234ms)
  ✔ handles string date input (0.123ms)
▶ getWeekNumber (2.345ms)

▶ input validation
  ✔ category must be between 1 and 6 (0.567ms)
  ✔ title must not be empty after trimming (0.234ms)
▶ input validation (0.890ms)

ℹ tests 6
ℹ suites 2
ℹ pass 6
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ duration_ms 45.678
```

- ✔ = passing test (green)
- ✖ = failing test (red)
- ℹ = summary information

#### Test coverage (optional)

Node.js has experimental built-in coverage (no npm packages needed):

```bash
# Run tests with coverage
node --test --experimental-test-coverage

# Output includes:
# ℹ coverage 75.5%
```

For detailed coverage reports, you'd need an external tool, but for a vanilla project, the basic coverage indicator is often enough.

**Don't aim for 100%** — that's often counterproductive. 70-80% is usually good enough.

#### Common testing patterns (Vanilla Node.js)

**1. Arrange-Act-Assert (AAA)**
```javascript
it('something works', () => {
    // ARRANGE: Set up the test
    const input = 'test';

    // ACT: Do the thing you're testing
    const result = myFunction(input);

    // ASSERT: Check the result
    assert.strictEqual(result, 'expected');
});
```

**2. Testing error cases**
```javascript
it('throws error for invalid input', () => {
    assert.throws(
        () => myFunction(null),
        { message: 'Input cannot be null' }
    );
});
```

**3. Testing async code**
```javascript
it('async operation completes', async () => {
    const result = await fetchData();
    assert.ok(result, 'Result should be defined');
});

// Testing that async code rejects
it('rejects with invalid input', async () => {
    await assert.rejects(
        async () => await badAsyncFunction(),
        { message: 'Expected error message' }
    );
});
```

**4. Using test fixtures**
```javascript
// tests/fixtures/tasks.js
const sampleTasks = [
    { id: '1', title: 'Task 1', status: 'todo' },
    { id: '2', title: 'Task 2', status: 'done' }
];

module.exports = { sampleTasks };

// In your test file
const { sampleTasks } = require('./fixtures/tasks');

beforeEach(() => {
    // Use sample data for each test
});
```

**5. Skipping tests**
```javascript
// Skip a single test
it.skip('this test is not ready yet', () => {
    // This won't run
});

// Skip an entire describe block
describe.skip('these tests are not ready', () => {
    it('test 1', () => { });
    it('test 2', () => { });
});

// Only run specific tests (useful during development)
it.only('only this test will run', () => {
    // All other tests are skipped
});
```

#### Pros of adding tests

1. **Confidence** — Change code without fear
2. **Documentation** — Tests show how code should work
3. **Faster debugging** — Tests pinpoint what's broken
4. **Collaboration** — Contributors can verify their changes
5. **Professional skill** — Required in most dev jobs

#### Cons / Challenges

1. **Time investment** — Writing tests takes time upfront
2. **Learning curve** — New concepts and tools to learn
3. **Maintenance** — Tests need updating when features change
4. **False confidence** — Passing tests don't guarantee bug-free code

#### Recommendation for this project

**Priority: HIGH for a self-hosted/open-source project.**

**Why vanilla testing is perfect for this project:**
- Zero dependencies — aligns with your project philosophy
- Built into Node.js — no npm install, no version conflicts
- Simple and educational — you learn the fundamentals, not framework magic
- Portable skills — the concepts transfer to any testing framework

Here's a realistic implementation plan:

**Day 1-2: Setup and first tests**
1. Create `tests/unit/` directory
2. Write tests for `getWeekNumber()` function (copy from example above)
3. Run `node --test` and see it work
4. Add `"test": "node --test"` to package.json

**Day 3-4: Validation tests**
1. Add tests for input validation logic (category, title, priority)
2. These tests will help you implement the validation from Section 5.4

**Day 5-7: API tests**
1. Create `tests/api/` directory
2. Write tests for GET /api/tasks
3. Write tests for POST /api/tasks
4. Run server in one terminal, tests in another

**Week 2:**
1. Add tests for PUT, DELETE, and move operations
2. Add tests for error cases (400, 404)
3. Test report generation logic

**Ongoing:**
1. Write tests for new features BEFORE implementing (TDD approach)
2. When you find a bug, write a test that reproduces it first
3. Run tests before every commit

---

### Section 8 Summary: Testing for Self-Hosted Projects ✅ IMPLEMENTED

| Aspect | Without Tests | With Tests |
|--------|---------------|------------|
| Making changes | Scary, might break things | ✅ Confident, tests catch issues |
| Accepting contributions | Must test manually | ✅ CI runs automatically |
| Documentation | Just the code | ✅ Tests show expected behavior |
| Debugging | Console.log everywhere | ✅ Tests isolate the problem |
| Refactoring | Avoid it | ✅ Do it freely |

**Why vanilla Node.js testing is ideal for this project:**

| Consideration | Vanilla (node:test) | Jest/Vitest |
|--------------|---------------------|-------------|
| Dependencies | Zero | 50+ packages |
| Setup time | 0 minutes | 10+ minutes |
| Config files | None | jest.config.js, babel.config.js |
| Node.js version | 18+ (you likely have this) | Any |
| Security updates | Automatic with Node.js | Manual npm updates |
| Philosophy match | ✅ Perfect | ❌ Adds complexity |

**Key insight for self-hosted projects:** You don't have a QA team, staging environment, or production monitoring. Tests are your safety net. Start small, build the habit, and grow coverage over time.

**Getting started is as simple as:**
```bash
# Create your first test file
mkdir -p tests/unit
# Write tests (copy from examples above)
# Run them
node --test
```

No npm install. No configuration. Just write tests and run them.

---

## 9. Documentation ✅ RESOLVED

### 9.1 README.md doesn't exist ✅ RESOLVED

**Impact:** New contributors won't know how to set up, run, or contribute.

**Solution:** Created comprehensive README.md with:
- Project description and philosophy (self-hosted, privacy-first, no subscriptions)
- Features overview
- Quick start and installation instructions
- Configuration options
- Technology stack explanation
- Project structure
- API reference
- Contributing guidelines
- Roadmap
- Comparison with SaaS alternatives
- MIT License file added

---

## Quick Wins (Low Effort, High Impact)

1. ~~**Remove console.log statements** - 5 minutes~~ ✅ DONE (v2.5.0)
2. ~~**Fix deprecated substr()** - 1 minute~~ ✅ DONE (v2.5.0)
3. ~~**Cache component templates** - 15 minutes per component~~ ✅ DONE (v2.10.0)
4. ~~**Remove double applyAllFilters() call** - 2 minutes~~ ✅ DONE (v2.10.0)
5. ~~**Fix crisis mode CSS selectors** - 5 minutes~~ ✅ DONE (v2.5.0)
6. ~~**Add environment variable for PORT** - 2 minutes~~ ✅ DONE (v2.8.0)
7. ~~**Combine getTaskGradient/shouldUseLightText** - 10 minutes~~ ✅ DONE (v2.10.0)
8. ~~**Add DIY rate limiting** - 30 minutes~~ ✅ DONE (vanilla, no dependencies)
9. ~~**Add test infrastructure** - 2 hours~~ ✅ DONE (146 tests, vanilla Node.js)
10. ~~**Add optimistic UI with rollback** - 1 hour~~ ✅ DONE (v2.14.0)
11. ~~**Add disconnectedCallback to components** - 30 minutes~~ ✅ DONE (v2.15.0)
12. ~~**Add race condition lock to moveTask** - 5 minutes~~ ✅ DONE (v2.16.0)

---

## Recommended Priority Order

1. ~~**High Priority (Bugs/Breaking):** Items 4.3 (crisis mode broken)~~ ✅ DONE
2. ~~**Medium Priority (Performance):** Items 3.1 (template caching), 3.2 (double filtering), 3.3 (combined gradient functions)~~ ✅ ALL DONE
3. ~~**Medium Priority (Code Quality):** Items 1.1-1.4 (duplication), 2.1-2.4 (consistency)~~ ✅ DONE
4. ~~**Lower Priority (Polish):** Items 4.1, 4.2, 6.1-6.4~~ ✅ ALL DONE
5. ~~**Documentation:** Item 9.1 (README.md)~~ ✅ DONE (v2.11.0)
6. ~~**Security:** Item 7.2 (rate limiting)~~ ✅ DONE (DIY vanilla implementation)
7. ~~**Testing:** Item 8.1 (test infrastructure)~~ ✅ DONE (146 tests, vanilla Node.js)

---

*End of Code Review Findings*
