# S2 Episode 1: The Entry Point — Where Everything Begins

**Duration:** ~10 minutes
**Files to open:** `public/index.html`, `public/app.js`
**Style:** Code walkthrough — follow along at your computer

---

Hey, welcome to Season 2. This time, you're at the computer, files open. We're going to walk through your actual code, file by file, line by line, and I'll explain exactly what every piece does and why.

Let's start where the browser starts: `index.html`.

## index.html: The Shell

Open `public/index.html`. This is the single page in your Single Page Application. Every URL — `/work`, `/work/archive`, `/work/backlog` — serves this same file. Let's go top to bottom.

**Line 6: `<base href="/">`**

This tiny tag is critical. Without it, when the browser is at `/work/archive`, relative paths like `components/task-card/task-card.js` would resolve to `/work/components/task-card/task-card.js` — which doesn't exist. The base tag tells the browser: "Resolve ALL relative paths from the root." If you ever delete this line, every sub-page breaks instantly.

In React or Next.js, the build system handles this for you. In LWC, the Salesforce platform handles it. In vanilla, it's on you.

**Lines 13-27: The Header**

Look at the structure. There's a sidebar button (`.js-sidebarBtn`), the `<app-welcome>` component, and the `<profile-selector>` component. Notice the `js-` prefix on the button class — that's your JavaScript hook convention. The button also has a BEM class (`.appHeader__sidebarBtn`) for styling. Two classes, two concerns.

**Line 30: `<nav-sidebar>`**

This is a custom element. Just sitting there in the HTML like a native element. The browser doesn't know what to do with it until the JavaScript registers it. We'll explore this component in a later episode.

**Lines 32-44: The App Container**

This is the main board layout. Notice the structure: a left sidebar (checklist + notes widgets) and the `.kanban` container. The kanban container is empty in the HTML — JavaScript fills it with `<kanban-column>` elements dynamically. This is a key pattern in your app: the HTML provides the skeleton, JavaScript provides the content.

**Line 47: The Page View**

```html
<div class="pageView js-pageView"></div>
```

This empty div is where non-board pages render. When you navigate to `/work/archive`, the app container hides, this div shows, and the archive page module fills it with content. Simple page switching.

**Lines 50-131: The Task Modal**

Scroll down to the task modal. This is a big chunk of HTML. Notice it's a `<modal-dialog>` element with `class="js-taskModal"`. Inside, there's a complete form: title input, description textarea, priority checkbox, category pills container, epic picker, deadline and snooze inputs, activity log section.

Two important things here. First, this modal exists in the HTML from the start — it's not created dynamically. It's always there, just hidden until `modal.open()` is called. Second, look at all the `js-` classes: `.js-taskTitle`, `.js-taskDescription`, `.js-taskPriority`, `.js-taskDeadline`. Every interactive element has a JavaScript hook.

**Lines 134-430: All The Other Modals**

Scroll through these. Reports modal, archived modal, confirm modals, epics modal, categories modal, profiles modal, checklist modal, board config, general config, AI config. Every modal is pre-declared in the HTML with its skeleton structure.

Why not create them dynamically? Because having them in the HTML means the DOM structure is predictable. When `app.js` starts, it can immediately grab references to all these elements. No need to create and destroy modals. They're always there.

In React, you WOULD create modals dynamically — a modal component renders only when state says "modal is open." In your vanilla approach, the DOM is static; you show/hide with `.open()` / `.close()`. Both work. React's way uses less memory; your way is simpler.

**Line 433: The Toaster**

```html
<toast-notification class="js-toaster"></toast-notification>
```

One instance. Global. Every part of the app uses `elements.toaster.success('msg')` to show notifications.

**Lines 435-451: The Script Imports**

Look at the bottom. Every component is loaded as an ES module with `type="module"`. The browser downloads them in parallel. Each script registers its custom element. Once registered, any existing element in the HTML "comes alive" — its `connectedCallback()` fires.

Notice `app.js` is last. That's intentional. It needs the components to be registered first.

## app.js: The Brain

Now open `public/app.js`. This is the biggest file — around 1100 lines. Let's break it into sections.

**Lines 1-68: Imports**

The first ~68 lines are imports. Look at how organized they are. State functions from `state.js`, API functions from `api.js`, utility functions from `utils.js`, constants from `constants.js`, modal functions from `modals.js`, filter functions from `filters.js`, router from `router.js`, crisis mode from `crisis-mode.js`.

Each import pulls in exactly what it needs. No "import everything." This is ES module discipline — it makes dependencies explicit. You can look at the imports and immediately know what this file depends on.

**Lines 71-240: The `elements` Object**

This is a big one. Scroll to the `elements` constant. It's an object that caches references to every DOM element the app needs.

```javascript
const elements = {
    appContainer: document.querySelector('.js-appContainer'),
    pageView: document.querySelector('.js-pageView'),
    kanban: document.querySelector('.js-kanban'),
    toaster: document.querySelector('.js-toaster'),
    // ... dozens more
};
```

Why cache them? Because `document.querySelector()` is a search — it scans the DOM tree. If you call it once and store the result, subsequent accesses are instant. If you called it every time you needed an element, you'd be searching the DOM hundreds of times.

In React, you don't do this — React manages element references through its virtual DOM and `useRef` hook. In LWC, you use `this.template.querySelector()` inside the component. But in vanilla, caching element references at startup is standard practice.

**Line 250: `closeMenu()`**

```javascript
const closeMenu = () => {};
```

A no-op function. It used to close the hamburger menu, but you replaced that with the sidebar. Instead of updating every function that received `closeMenu` as a parameter, you kept the parameter and made the function do nothing. Practical pragmatism. In a framework, you'd refactor the prop away. In vanilla, the no-op is the simplest fix.

**Lines 345-419: `moveTask()` — The Heart of Drag and Drop**

This is one of the most important functions. Open it up.

Line 345: `let isMoving = false;` — the lock variable. Module-level, private to this file.

Look at the function body. First check: `if (isMoving) return;` — if a move is already in progress, do nothing. Then `isMoving = true`.

Line 370: `const snapshot = createTasksSnapshot();` — save current state before touching anything.

Lines 371-378: Update the task's status and position in state, then render. The user sees the card move immediately.

Lines 380-400: The try/catch. The `try` block calls `moveTaskApi()` and updates with the server's response. The `catch` block restores the snapshot and re-renders — the card goes back to where it was. Toast error message.

Line 418: `finally { isMoving = false; }` — always release the lock, success or failure.

This is your optimistic UI + lock + snapshot pattern, all in one function. Every task operation in the app follows this same structure.

**Lines 447-477: `initKanban()`**

This function creates the kanban board dynamically. It receives the columns array, filters out backlog columns (line 449), and for each column, creates a `<kanban-column>` element. Look at how it sets attributes: `data-status`, `data-name`. The first column gets the "Add Task" button. Columns with `hasArchive: true` get the "Archive" button.

Notice these buttons are regular HTML placed as children of `<kanban-column>`. They're not inside the Shadow DOM — they're in the "light DOM." The component uses `<slot>` to display them. This is the slot pattern we discussed in Season 1.

**Lines 483-492: `renderAllColumns()`**

Short but crucial. It rebuilds the epic and category lookup Maps (O(1) access), then loops through columns and calls `renderColumn()` for each, then applies filters. Every time state changes, this function is called. It's your "re-render the world" function.

In React, this would be automatic — change state, React re-renders. In your code, you call this manually every time.

**Lines 515-575: `createTaskCard()`**

This function creates a single `<task-card>` element. Look at what it does:

- Creates the element
- Calls `card.setTask(task, { epicName, epicColor, ... })` to pass data
- Adds CSS classes for snooze state (`.--snoozed`)
- Adds event listener for `request-edit` — when the user clicks Edit inside the card
- Sets the `hidden` attribute if snoozed and snooze visibility is "hidden"
- Sets `draggable="true"` and adds dragstart/dragend handlers

Notice the dragstart handler: it sets the drag data with the task ID. The kanban column will read this data when the card is dropped.

**Lines 985-1106: `init()` — Where It All Begins**

Scroll to the bottom. This async function is the application entry point.

Lines 987-994: Load profiles, find the default, redirect if needed. This is where multi-profile support starts.

Lines 996-1003: Parse the route using `parsePath()`. Set the API base URL for the active profile.

Lines 1005-1012: Fetch initial data in parallel — `Promise.all([fetchTasksApi(), fetchCategoriesApi(), fetchEpicsApi(), fetchColumnsApi()])`. Four requests, simultaneously. One round trip.

Lines 1015-1020: Populate state with the fetched data.

Lines 1022-1050: Route to the right page. If page is 'archive', hide appContainer, show pageView, dynamically import `archive-page.js`. Same for 'backlog', 'dashboard', 'ai'. If page is 'board' (default), run the board initialization.

Lines 1053-1084: Board initialization — `initKanban(columns)`, `renderAllColumns()`, set up toolbar, event listeners, checklist, notes, general config.

Lines 1091-1102: Snooze check interval — every 5 minutes, check if any snoozed tasks have "woken up."

Line 1106: `init();` — the call that starts everything.

## The Data Flow

Let me trace the full flow from page load:

1. Browser loads `index.html`
2. Script tags load component definitions (components register themselves)
3. `app.js` loads, imports run, `init()` is called
4. `init()` fetches profiles, determines active profile
5. Fetches tasks + categories + epics + columns in parallel
6. Populates centralized state
7. Reads route → decides board vs sub-page
8. If board: creates columns, renders cards, sets up listeners
9. If sub-page: dynamically imports page module, hides board, shows page view

Everything flows from `init()`. If you ever need to understand how something works, start here and trace the calls.

## Key Takeaway

Your entry point pattern — static HTML shell, dynamic content via JavaScript, cached element references, parallel data fetching, route-based page switching — is clean and efficient. It's the vanilla equivalent of what React's `App` component does with router and data loaders, or what LWC's `init` handler does in a Lightning page.

Next episode, we're going inside `task-card.js` — your most complex component — and I'll explain every line of a real Web Component.

---

*Next: S2E02 — "Inside task-card.js: Anatomy of a Web Component"*
