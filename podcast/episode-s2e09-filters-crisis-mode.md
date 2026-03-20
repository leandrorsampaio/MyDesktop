# S2 Episode 9: Filters and Crisis Mode — CSS-Driven State

**Duration:** ~9 minutes
**Files to open:** `public/js/filters.js`, `public/js/crisis-mode.js`, `public/app.js` (filter setup), `public/components/task-card/task-card.css` (snooze rules)
**Style:** Code walkthrough

---

Welcome back. Today we're looking at filtering and crisis mode — two features that interact in interesting ways, and that showcase a powerful technique: using CSS to drive UI state changes instead of JavaScript.

## filters.js: Three Filters, One Function

Open `public/js/filters.js`. Your app has three independent filters:

1. **Category filter** — show only tasks from selected categories
2. **Priority filter** — show only priority (starred) tasks
3. **Epic filter** — show only tasks from a selected epic

All three converge in one function: `applyAllFilters()`. Let's build up to it.

**`renderCategoryFilters()` (lines 13-33):**

This function creates the category filter buttons in the toolbar. For each category in state, it creates a button with the category icon and name. Look at the click handler:

```javascript
btn.addEventListener('click', () => {
    toggleCategoryFilter(cat.id, filtersContainer, applyAllFilters);
});
```

Each button toggles its category in the active set and then re-applies all filters. Note the callback pattern — `applyAllFilters` is passed as a function reference, not called directly. This keeps `renderCategoryFilters` decoupled from the filter application logic.

**`toggleCategoryFilter()` (lines 41-54):**

```javascript
export function toggleCategoryFilter(categoryId, filtersContainer, applyFilters) {
    if (activeCategoryFilters.has(categoryId)) {
        activeCategoryFilters.delete(categoryId);
    } else {
        activeCategoryFilters.add(categoryId);
    }
    // Update button visual (--active class)
    applyFilters();
}
```

Toggle the ID in the Set, update the button's visual state, re-apply filters. Simple.

**`togglePriorityFilter()` (lines 61-65):**

```javascript
export function togglePriorityFilter(priorityBtn, applyFilters) {
    priorityFilterActive = !priorityFilterActive;
    priorityBtn.classList.toggle('--active', priorityFilterActive);
    applyFilters();
}
```

Even simpler — flip a boolean, toggle a class, re-apply.

## applyAllFilters(): The Central Filter Engine

Now look at `applyAllFilters()` around line 72. This is the most interesting function in the file.

```javascript
export function applyAllFilters() {
    const columns = document.querySelectorAll('kanban-column');

    columns.forEach(column => {
        const cards = column.shadowRoot?.querySelectorAll('task-card') || [];

        cards.forEach(card => {
            // ...
        });
    });
}
```

First thing: it queries through Shadow DOM. Task cards live inside kanban columns' shadow roots. You can't just do `document.querySelectorAll('task-card')` — that wouldn't find them because Shadow DOM hides them from the document-level query. You have to go column by column, access each `shadowRoot`, and query inside.

This is one of the real-world costs of Shadow DOM encapsulation. You get style isolation, but you lose easy global querying. In React, you'd just filter the data array before rendering — no DOM queries needed. In LWC, you'd use `this.template.querySelectorAll()` within a component.

For each card, the filter logic:

```javascript
const task = card._task;
if (!task) return;

let visible = true;

// Category filter (AND with other filters)
if (activeCategoryFilters.size > 0) {
    visible = visible && activeCategoryFilters.has(task.category);
}

// Priority filter
if (priorityFilterActive) {
    visible = visible && task.priority;
}

// Epic filter
if (activeEpicFilter) {
    visible = visible && task.epicId === activeEpicFilter;
}

card.hidden = !visible;
```

The logic is AND — a task must match ALL active filters. If category filter says "show Development" AND priority filter is on, only priority Development tasks appear. This makes sense intuitively: each filter narrows the results.

The `card.hidden = !visible` line sets or removes the `hidden` attribute on the custom element. In `task-card.css`, there's a rule:

```css
:host([hidden]) {
    display: none !important;
}
```

So setting `hidden` makes the card disappear via CSS. The `!important` ensures it overrides everything — even snooze visibility.

Notice: the filter doesn't remove cards from the DOM or from state. It just hides them. The data is unchanged. Turn off the filter, the cards reappear instantly. This is a presentation-layer operation.

## Crisis Mode: Filters + CSS + Drama

Open `public/js/crisis-mode.js`. This is only about 95 lines but it's one of the most fun features.

**`toggleCrisisMode()` (lines 62-94):**

```javascript
export function toggleCrisisMode(elements, closeMenu) {
    closeMenu();

    if (!crisisModeActive) {
        // ENTER crisis mode
        crisisModeActive = true;
        document.body.classList.add('--crisisMode');

        // Save current title, set crisis title
        originalTitle = document.title;
        document.title = '!!!';

        // Change favicon to red star
        setFavicon(generateRedStarFavicon());

        // Activate priority filter
        setPriorityFilter(true, elements.priorityBtn);
        applyAllFilters();

        elements.crisisModeBtn.textContent = '🚨 Exit Crisis';
    } else {
        // EXIT crisis mode
        crisisModeActive = false;
        document.body.classList.remove('--crisisMode');
        document.title = originalTitle;
        setFavicon('/favicon.png');

        setPriorityFilter(false, elements.priorityBtn);
        applyAllFilters();

        elements.crisisModeBtn.textContent = 'Crisis Mode';
    }
}
```

Crisis mode does four things:
1. Adds `--crisisMode` class to `<body>` — CSS handles the red border
2. Changes the page title to "!!!" — useful if your boss walks by and the tab shows your task tracker
3. Changes the favicon to a red star — same reason
4. Activates the priority filter — shows only urgent tasks

The red star favicon is dynamically generated using the Canvas API:

**`generateRedStarFavicon()` (lines 14-36):**

```javascript
export function generateRedStarFavicon() {
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    // ... draw a red 5-point star using canvas paths
    return canvas.toDataURL('image/png');
}
```

It creates an invisible canvas, draws a star shape, and exports it as a data URL (a base64-encoded image string). This data URL is set as the favicon source. No image file needed — it's generated on the fly.

The `setFavicon()` function (lines 42-51) finds or creates the `<link rel="icon">` element and sets its `href`. Changing the favicon dynamically is a neat trick. Some apps use it to show notification counts (a badge on the favicon).

**The CSS-driven part:**

In `styles.css`, you'll find rules like:
```css
body.--crisisMode {
    border: 3px solid red;
}

body.--crisisMode kanban-column[data-status="done"] {
    visibility: hidden;
}
```

The "done" column disappears. A red border appears around the page. All from one CSS class on `<body>`. No JavaScript iterating through columns. CSS selectors do the work.

## Snooze Visibility: Pure CSS Magic

Now open `task-card.css` and look for the `:host(.--snoozed)` rule. This is the most elegant CSS-driven state in your project.

The snooze visibility system has three modes:
1. **Hidden** (default) — snoozed cards are invisible
2. **Transparent** — snoozed cards are always visible at 50% opacity
3. **Shown** — toggle button pressed, snoozed cards fully visible

Instead of JavaScript checking each card, this is done with CSS custom properties:

In `styles.css` (on `:root`):
```css
:root {
    --snoozed-card-display: none;
    --snoozed-card-opacity: 0;
}

.kanban.--showSnoozed {
    --snoozed-card-display: block;
    --snoozed-card-opacity: 1;
}

body.--snoozeTransparent {
    --snoozed-card-display: block;
    --snoozed-card-opacity: 0.5;
}
```

And in `task-card.css`:
```css
:host(.--snoozed) {
    display: var(--snoozed-card-display, none);
    opacity: var(--snoozed-card-opacity, 0);
}
```

The card reads CSS custom properties that are defined on ancestors. When the board's toggle button adds `--showSnoozed` to `.kanban`, the properties change, and every snoozed card updates instantly. No JavaScript loops. No event listeners. Pure CSS inheritance through Shadow DOM.

This works because CSS custom properties inherit through Shadow DOM boundaries. Regular CSS selectors can't cross the shadow boundary, but custom properties can. The card defines `display: var(--snoozed-card-display)` — it reads whatever value the ancestor provides.

Toggle one class → one property change → every snoozed card responds. It's reactive CSS.

The specificity cascade matters here:
- Default: hidden (`:root` sets `none/0`)
- Transparent mode: `body.--snoozeTransparent` overrides to `block/0.5`
- Show toggle: `.kanban.--showSnoozed` overrides to `block/1`
- Filter hidden: `:host([hidden]) { display: none !important }` overrides everything

The `!important` on the filter rule is the highest priority. A snoozed card that's also filtered out stays hidden. Correct behavior: filters win.

## How Crisis Mode Reuses Filters

Notice that crisis mode doesn't have its own card-hiding logic. It calls `setPriorityFilter(true)` and `applyAllFilters()`. It reuses the existing filter infrastructure. This is the Single Responsibility Principle in action — filtering is one module's job, crisis mode just activates a specific filter.

If you added a new filter type (say, deadline-based), crisis mode wouldn't need to change. It only cares about priority.

## Key Takeaway

Filters work by querying through Shadow DOM boundaries and setting the `hidden` attribute on cards. Crisis mode reuses filters and adds CSS-driven visual changes via body classes. Snooze visibility is entirely CSS-driven using custom property inheritance through Shadow DOM.

The CSS-driven approach is powerful: one class toggle can affect hundreds of elements without JavaScript touching each one. This is a technique that works in every framework, but is especially natural in vanilla CSS + Web Components.

Next episode, we're looking at the page modules — how the archive and backlog pages work.

---

*Next: S2E10 — "Page Modules: Archive and Backlog"*
