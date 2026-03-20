# S2 Episode 8: Navigation — The Sidebar and Router

**Duration:** ~9 minutes
**Files to open:** `public/components/nav-sidebar/nav-sidebar.js`, `public/js/router.js`, `public/app.js` (init section)
**Style:** Code walkthrough

---

Welcome back. Today we're looking at how your app navigates between pages. Two files work together: `router.js` reads the URL, and `nav-sidebar.js` gives the user a way to change it. Let's start with the simpler one.

## router.js: 31 Lines of Clarity

Open `public/js/router.js`. The entire file is about 31 lines. Let's read all of it.

**Line 8:**
```javascript
export const SUB_PAGES = ['dashboard', 'backlog', 'archive', 'reports', 'ai'];
```

The list of valid sub-pages. If a URL contains anything else (like `/work/settings`), the router defaults to the board page.

**Lines 15-20: `parsePath()`**

```javascript
export function parsePath(pathname = window.location.pathname) {
    const segments = pathname.split('/').filter(Boolean);
    const alias = segments[0] || '';
    const rawPage = segments[1] || '';
    const page = SUB_PAGES.includes(rawPage) ? rawPage : 'board';
    return { alias, page };
}
```

Let's trace this for different URLs:

- `/work` → segments = `['work']` → alias = 'work', rawPage = '' → page = 'board'
- `/work/archive` → segments = `['work', 'archive']` → alias = 'work', rawPage = 'archive' → page = 'archive'
- `/work/whatever` → segments = `['work', 'whatever']` → alias = 'work', rawPage = 'whatever' → page = 'board' (fallback)

`pathname.split('/').filter(Boolean)` is a nice pattern. Splitting `'/work/archive'` by `'/'` gives `['', 'work', 'archive']` — there's an empty string from the leading slash. `filter(Boolean)` removes empty strings (because `Boolean('')` is `false`). Result: `['work', 'archive']`.

The default parameter `pathname = window.location.pathname` means you can call `parsePath()` with no arguments and it reads the current URL. But you can also pass a custom path for testing. This is testability by design.

**Lines 28-30: `buildPath()`**

```javascript
export function buildPath(alias, page) {
    return page && page !== 'board' ? `/${alias}/${page}` : `/${alias}`;
}
```

The reverse of `parsePath()`. Given an alias and page, build the URL. Board is the default so it gets no segment — just `/${alias}`.

That's the entire router. No history manipulation, no route matching library, no route guards. Just parse the URL and build URLs. The simplicity is the point.

Compare this to React Router, which has `BrowserRouter`, `Routes`, `Route`, `Link`, `useNavigate`, `useParams`, `Outlet`, loaders, actions... all solving the same fundamental problem but with more features.

In LWC, you'd use `NavigationMixin` and `CurrentPageReference` — the Salesforce platform handles the URL management.

## nav-sidebar.js: The Navigation UI

Open `public/components/nav-sidebar/nav-sidebar.js`. This is a full Web Component — one of the more complex ones.

**The component documentation (lines 1-21):**

This docblock at the top is excellent practice. It describes the API — attributes, methods, events — before you even read the code. When another developer (or future you) needs to use this component, they can read the docblock without diving into the implementation.

**Constructor (lines 26-30):**

```javascript
constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._boundOnKeydown = this._onKeydown.bind(this);
}
```

Same pattern as modal-dialog: bind the keyboard handler once, reuse the reference.

**connectedCallback (lines 32-43):**

Template loading, then `this._init()`. The `_init()` call is conditional on the shadow root being populated — the `await` for the template cache ensures this.

**`_init()` (lines 76-100):**

This is where all the event wiring happens. Let's walk through it.

First, it queries the shadow root for interactive elements:

```javascript
const backdrop = this.shadowRoot.querySelector('.js-backdrop');
const closeBtn = this.shadowRoot.querySelector('.js-closeBtn');
const configBtn = this.shadowRoot.querySelector('.js-configBtn');
const configMenu = this.shadowRoot.querySelector('.js-configMenu');
```

Then it sets up listeners:

- **Backdrop click** → close the sidebar
- **Close button click** → close the sidebar
- **Config button click** → toggle the config submenu
- **Nav link clicks** → regular `<a>` tags, browser navigation
- **Config menu item clicks** → this is the interesting one

**Lines 89-94: Config action dispatch**

```javascript
configMenu.addEventListener('click', (e) => {
    const action = e.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    this.close();
    this.dispatchEvent(new CustomEvent('config-action', {
        bubbles: true, composed: true,
        detail: { action }
    }));
});
```

Event delegation on the config menu. When any menu item is clicked, it finds the closest element with a `data-action` attribute, extracts the action name, closes the sidebar, and dispatches a custom event.

The `close()` call BEFORE the dispatch is intentional. The `config-action` event is caught by `app.js`, which opens a modal. If the sidebar was still visible while the modal opens, it would look messy. Close first, then trigger.

The `.closest()` method is worth knowing. Starting from the clicked element, it walks UP the DOM tree looking for an element that matches the selector. If you click on a text node inside a `<li data-action="manage-epics">`, `closest('[data-action]')` finds the `<li>`. It's the event delegation helper.

**The `?.` (optional chaining):** `e.target.closest('[data-action]')?.dataset.action` — if `closest()` returns null (click wasn't on a menu item), the `?.` prevents a "cannot read property of null" error. It short-circuits to `undefined`. Very useful for defensive coding.

**Observed attributes (lines 49-54):**

```javascript
static get observedAttributes() { return ['alias', 'page']; }

attributeChangedCallback(name, oldValue, newValue) {
    if (!this.shadowRoot?.children.length) return;
    if (name === 'alias') this._updateLinks();
    if (name === 'page') this._updateActive();
}
```

When `app.js` sets `sidebar.setAttribute('alias', 'work')`, the component updates all its nav link hrefs. When it sets `sidebar.setAttribute('page', 'archive')`, the component highlights the active link. Reactive to attributes — the same pattern LWC uses with `@api` properties.

The guard `if (!this.shadowRoot?.children.length) return;` prevents the callback from running before the template is loaded. The attribute might be set before `connectedCallback` finishes the async template load.

**`_updateLinks()` (lines 102-108):**

Loops through all nav links in the shadow root and updates their `href` attributes based on the current alias. Each link goes to `/${alias}/${page}`.

**`_updateActive()` (lines 110-115):**

Adds or removes the `--active` class on nav items based on the current page. CSS uses this class to highlight the active link.

**`open()`, `close()`, `toggle()` methods:**

Simple attribute manipulation:
```javascript
open() { this.setAttribute('open', ''); }
close() { this.removeAttribute('open'); }
toggle() { this.hasAttribute('open') ? this.close() : this.open(); }
```

The CSS handles the visual transition based on the `open` attribute presence. Adding or removing one attribute triggers slide animation, backdrop fade, etc. — all CSS, no JavaScript animation.

## How It All Connects in app.js

Now open `app.js` and look at the init section (around line 985).

**Route parsing:**
```javascript
const { alias, page } = parsePath();
```

One call. The app now knows where the user is.

**Sidebar setup:**
```javascript
elements.navSidebar.setAttribute('alias', alias);
elements.navSidebar.setAttribute('page', page);
```

The sidebar updates its links and highlights.

**Config action handling (around line 285):**

```javascript
elements.navSidebar.addEventListener('config-action', (e) => {
    handleConfigAction(e.detail.action);
});
```

When the user clicks a config menu item, the sidebar dispatches `config-action`, and `app.js` routes it:

```javascript
function handleConfigAction(action) {
    switch (action) {
        case 'board-config':
            openBoardConfigModal(elements, closeMenu);
            break;
        case 'manage-epics':
            openEpicsModal(elements, closeMenu, onEpicsChanged);
            break;
        // ... etc
    }
}
```

Clean routing: event → action string → function call.

**Page routing (lines 1022-1050):**

```javascript
if (page === 'archive') {
    elements.appContainer.hidden = true;
    elements.pageView.hidden = false;
    const { initArchivePage } = await import('./js/archive-page.js');
    await initArchivePage(elements.pageView);
} else if (page === 'backlog') {
    // ... similar
} else {
    // Default: show board
    initKanban(columns);
    renderAllColumns();
}
```

Dynamic imports with `await import()`. The archive page module is only loaded when the user visits the archive. If they never visit it, it's never downloaded. This is manual code splitting.

The `elements.appContainer.hidden = true` / `elements.pageView.hidden = false` toggle shows the right container for non-board pages.

## The Navigation Flow

Full trace when a user clicks "Archive" in the sidebar:

1. User clicks "Archive" nav link in the sidebar
2. Browser navigates to `/work/archive` (regular `<a>` tag click)
3. Server receives GET `/work/archive`, matches `/:alias/:page`, serves `index.html`
4. Page loads, all scripts execute, `init()` runs
5. `parsePath()` returns `{ alias: 'work', page: 'archive' }`
6. Sidebar gets `alias` and `page` attributes → highlights "Archive"
7. `init()` hits the `page === 'archive'` branch
8. Board container hides, page view shows
9. `archive-page.js` is dynamically imported
10. `initArchivePage()` runs — fetches data, renders the archive list

It's a full page reload for navigation (step 2-3). Some SPAs prevent this by intercepting clicks and using the History API. Your app lets the browser do a real navigation, which is simpler and works perfectly for a local app.

## Key Takeaway

Navigation in your app is simple by design: a 31-line router parses URLs, a sidebar component dispatches events for config actions and uses regular links for page navigation, and `app.js` orchestrates which page module to load. No routing library, no history manipulation, no route guards. The `<base href="/">` tag in `index.html` makes it all work by ensuring relative paths resolve correctly on sub-pages.

Next episode, we're looking at filters, crisis mode, and how CSS-driven state changes work.

---

*Next: S2E09 — "Filters and Crisis Mode: CSS-Driven State"*
