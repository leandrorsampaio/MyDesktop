# S2 Episode 2: Inside task-card.js — Anatomy of a Web Component

**Duration:** ~10 minutes
**Files to open:** `public/components/task-card/task-card.js`, `public/components/task-card/task-card.html`, `public/components/task-card/task-card.css`
**Style:** Code walkthrough — follow along at your computer

---

Welcome back. Today we're dissecting your most important component: `<task-card>`. This is the component that appears on every task on the board. If you understand this file, you understand Web Components.

Open all three files in the `task-card` folder side by side if you can.

## The Three Files

Every full component in your project has three files:

- **task-card.js** — the logic (the class, lifecycle, methods)
- **task-card.html** — the template (HTML structure)
- **task-card.css** — the styles (scoped to this component)

This separation is exactly what LWC uses. In LWC, every component also has a `.js`, `.html`, and `.css` file. The names must match. The structure is the same.

In React, all three would typically be in one `.jsx` file (or a `.tsx` file with a separate `.module.css`). In Svelte, all three go in one `.svelte` file. Your project and LWC keep them separate.

## task-card.js: Line by Line

**Line 3: `static templateCache = null;`**

This is a class-level static property. It's shared across ALL instances of TaskCard. There might be 50 task cards on the board, but there's only ONE `templateCache`. When the first card loads the template, all other cards reuse it.

Why `static`? Because the template doesn't change between instances. Every task card has the same HTML structure — only the data differs. Loading it once and sharing it is efficient.

**Lines 5-8: The Constructor**

```javascript
constructor() {
    super();
    this.attachShadow({ mode: 'open' });
}
```

Three lines that do a lot.

`super()` — calls the parent class constructor (`HTMLElement`). Required for custom elements. Without it, the browser throws an error.

`this.attachShadow({ mode: 'open' })` — creates the Shadow DOM. After this call, `this.shadowRoot` exists. The `mode: 'open'` means external JavaScript CAN access the shadow root (via `element.shadowRoot`). If you used `'closed'`, nobody could reach in. Your project uses 'open' because `applyAllFilters()` in `filters.js` needs to query inside columns to find cards.

In LWC, you never call `attachShadow()` yourself — the framework does it automatically. But the result is the same.

**Lines 10-35: `connectedCallback()`**

This is the big lifecycle hook. Let's go through it.

```javascript
async connectedCallback() {
```

It's `async` — meaning it can use `await` inside. This is necessary because loading the template is asynchronous (it uses `fetch`).

**Lines 12-15: Template Loading**

```javascript
if (!TaskCard.templateCache) {
    TaskCard.templateCache = Promise.all([
        fetch('/components/task-card/task-card.html').then(r => r.text()),
        fetch('/components/task-card/task-card.css').then(r => r.text())
    ]);
}
const [html, css] = await TaskCard.templateCache;
```

Let me break this down carefully because this pattern is subtle and important.

First check: has any TaskCard instance already started loading? If `templateCache` is `null`, no. So this instance starts the load.

Here's the critical part: it assigns the **Promise** to `templateCache`, not the result. `Promise.all(...)` returns a Promise immediately. That Promise is stored in `templateCache` right away, before the fetches complete.

Why? Imagine 30 task cards all connecting at the same moment (which happens when the board renders). Card 1 enters this block, starts the fetch, stores the Promise. Card 2 enters, sees `templateCache` is not null (it has the Promise), skips the `if` block. Card 2 then does `await TaskCard.templateCache` — it waits for the SAME Promise that Card 1 created.

Result: one fetch request, 30 components served. If you stored the resolved value instead of the Promise, you'd have a race condition where multiple cards start fetching before the first one finishes.

After the `await`, both `html` and `css` contain the template strings.

**Lines 17-22: Injecting into Shadow DOM**

```javascript
this.shadowRoot.innerHTML = `<style>${css}</style>${html}`;
```

One line. The CSS goes in a `<style>` tag, the HTML goes right after. Both are inside the shadow root. The CSS is now scoped — it only affects elements inside this shadow root.

**Lines 25-32: Event Setup**

After the template is in the DOM, the component queries for the edit button inside its shadow root and adds a click listener. When clicked, it dispatches a `request-edit` CustomEvent.

```javascript
this.shadowRoot.querySelector('.js-editBtn')
    .addEventListener('click', () => {
        this.dispatchEvent(new CustomEvent('request-edit', {
            bubbles: true,
            composed: true,
            detail: { taskId: this._task?.id }
        }));
    });
```

Notice `bubbles: true` and `composed: true`. Both are needed. `bubbles` makes the event travel up the DOM tree. `composed` makes it cross the Shadow DOM boundary. Without `composed`, the event would be trapped inside the shadow root, and `app.js` would never hear it.

In LWC, you'd write almost the exact same code. The only difference: LWC convention is lowercase event names without hyphens, prefixed with `on` in the parent template. So this would be `requestedit` (one word) in LWC, and the parent would listen with `onrequestedit`.

**Line 34: Initial Render**

```javascript
if (this._task) this.render();
```

If `setTask()` was called before the template finished loading, the data is already waiting. Now that the template is ready, render it.

## The `render()` Method

Scroll to the `render()` method. This is where data meets the template.

The method queries for elements inside the shadow root — `.js-title`, `.js-priority`, `.js-category`, `.js-epic` — and sets their content based on `this._task`.

**The epic pill is interesting.** Look for `_hexToRgba()`. When a task has an epic, the component converts the epic's hex color to an rgba value with low opacity (0.12) for the background, and uses the full color for the text. This creates those nice colored pill badges.

```javascript
_hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
```

This helper parses a hex color like `#E74C3C` into its red, green, blue components and returns an rgba string. It's used in task-card, archive-row, backlog-row, and ai-staged-row — but each component has its own copy. Why not share it? Because Shadow DOM components are self-contained. They don't import from shared utility files for internal presentation helpers. Each component is a standalone unit.

In React, you'd put this in a shared util and import it. In LWC, you'd put it in a shared utility module. In vanilla Web Components, the convention leans toward self-contained components.

**The deadline chip** — look for how the component handles the deadline display. It calls `getDeadlineLevel()` to determine if the deadline is overdue, urgent, warning, or upcoming, and applies the corresponding CSS class. The chip shows `formatRelativeTime()` — things like "in 2d 3h" or "expired 4h ago."

**The snooze indicator** — if `task.snoozeUntil` is set and in the future, a snooze chip appears.

## task-card.html: The Template

Open the HTML file. This is pure HTML with `js-` hooks:

```html
<div class="taskCard">
    <div class="taskCard__header">
        <span class="taskCard__priority js-priority"></span>
        <span class="taskCard__title js-title"></span>
    </div>
    <div class="taskCard__meta">
        <span class="taskCard__category js-category"></span>
        <span class="taskCard__epic js-epic"></span>
    </div>
    <!-- ... deadline, snooze, edit button ... -->
</div>
```

No logic in the template. No conditionals, no loops, no bindings. Just structure with hooks. JavaScript fills in the content. JavaScript shows/hides sections by toggling classes or setting `display`.

Compare this to LWC, where templates have logic:
```html
<!-- LWC equivalent would be: -->
<template>
    <div class="taskCard">
        <span if:true={task.priority}>★</span>
        <span>{task.title}</span>
        <template for:each={badges} for:item="badge">
            <span key={badge.id}>{badge.label}</span>
        </template>
    </div>
</template>
```

LWC templates are smarter — they handle conditionals and loops declaratively. Your templates are dumb containers that JavaScript manipulates. Both work; LWC's way is less code.

## task-card.css: Scoped Styles

Open the CSS file. Notice:

**`:host` selector** — at the top. This styles the `<task-card>` element itself (the outer shell):

```css
:host {
    display: block;
    /* ... */
}
```

Without `:host`, the custom element would have no default display. Custom elements are `display: inline` by default, which is usually not what you want.

**`:host(.--snoozed)` selector** — this is the clever CSS-driven snooze system:

```css
:host(.--snoozed) {
    display: var(--snoozed-card-display, none);
    opacity: var(--snoozed-card-opacity, 0);
}
```

The component reads CSS custom properties that are defined on `:root`. When you toggle snooze visibility, the `:root` variables change, and EVERY snoozed card updates automatically. No JavaScript loops. Pure CSS.

This is one of the most elegant patterns in your codebase. CSS custom properties + `:host` + Shadow DOM inheritance = zero-JS reactivity for visual state.

**`:host([hidden])` selector** — this ensures that when filters hide a card (by setting the `hidden` attribute), it stays hidden regardless of snooze state:

```css
:host([hidden]) {
    display: none !important;
}
```

The `!important` is justified here — filter hiding must override everything.

## The Component Lifecycle in Action

Let me trace what happens when a task card appears on the board:

1. `createTaskCard(task)` in `app.js` calls `document.createElement('task-card')`
2. Constructor runs: shadow root is created
3. `card.setTask(task, meta)` is called — stores data in `this._task` and `this._meta`
4. The card is appended to a kanban column's shadow root
5. `connectedCallback()` fires (because the element is now in the DOM)
6. Template is loaded (or cache is hit)
7. HTML + CSS are injected into shadow root
8. Edit button listener is attached
9. `render()` is called — fills in title, priority, epic, category, deadline, snooze
10. The card is visible and interactive

Steps 1-4 happen in `app.js`. Steps 5-9 happen inside the component. This separation is the whole point — the parent doesn't know how the card renders internally, and the card doesn't know what parent it's in.

## What LWC Does Differently

If this were a LWC component, the flow would be:

1. Parent template has `<c-task-card task={item}></c-task-card>`
2. LWC creates the element, sets the `task` property (marked `@api`)
3. `connectedCallback()` fires
4. LWC runs the compiled render function (no fetch needed — template was compiled at build time)
5. Reactive properties bind data to template expressions automatically
6. When `task` property changes, LWC re-renders only the affected parts

The main differences: no manual `render()` call, no template fetching, no `innerHTML`. But the lifecycle flow — constructor → connected → render → events — is the same.

## Key Takeaway

`task-card.js` demonstrates every core Web Component pattern: template caching with Promise, Shadow DOM creation, lifecycle callbacks, scoped styles, CustomEvent dispatch, and CSS custom property inheritance. Master this file, and you understand the building blocks for all your components — and for LWC.

Next episode, we're going into `kanban-column.js` — how drag and drop actually works under the hood.

---

*Next: S2E03 — "Drag and Drop: kanban-column.js"*
