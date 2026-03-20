# S2 Episode 11: Inline Components — Custom Picker and SVG Icon

**Duration:** ~8 minutes
**Files to open:** `public/components/custom-picker/custom-picker.js`, `public/components/svg-icon/svg-icon.js`
**Style:** Code walkthrough

---

Welcome back. We've looked at full components (three files: JS, HTML, CSS) and page modules (regular JS functions). Today we're looking at a third pattern: **inline components** — Web Components that define everything in JavaScript, with no separate HTML or CSS files.

## Why Go Inline?

Your project has a rule: components that are small or need to be available instantly skip the template fetch and define HTML/CSS directly in the JavaScript file.

The trade-off:
- **Full components** (task-card, modal-dialog): cleaner file separation, but the first load requires network requests for the template files
- **Inline components** (svg-icon, custom-picker, list-header): everything's in one file, zero network requests, available immediately

For components used dozens of times on the page (like `<svg-icon>`, which appears on every task card, every category, every toolbar button), that extra network request per component type — even with caching — adds a small delay. Going inline eliminates it entirely.

## svg-icon.js: A Registry of SVG Paths

Open `public/components/svg-icon/svg-icon.js`. Scroll past the usage documentation at the top.

**The SVGIcons registry (starting around line 27):**

This is a JavaScript object where keys are icon names and values are raw SVG markup:

```javascript
const SVGIcons = {
    star: `<path d="M12 2l3.09 6.26L22 9.27l-5 4.87..." fill="currentColor"/>`,
    edit: `<path d="M3 17.25V21h3.75L17.81..." fill="currentColor"/>`,
    close: `<line x1="18" y1="6" x2="6" y2="18"/>...`,
    plus: `<line x1="12" y1="5" x2="12" y2="19"/>...`,
    // ... many more
};
```

Notice `fill="currentColor"` and `stroke="currentColor"`. This is how icons inherit the parent's text color. If a button has `color: blue`, the icon inside it turns blue automatically. No need to pass a color prop. Pure CSS inheritance.

**The component class:**

```javascript
class SvgIcon extends HTMLElement {
    static get observedAttributes() {
        return ['icon', 'size'];
    }

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        this._render();
    }

    attributeChangedCallback() {
        this._render();
    }

    _render() {
        const icon = this.getAttribute('icon');
        const size = this.getAttribute('size') || '24';
        const paths = SVGIcons[icon];
        if (!paths) return;

        this.shadowRoot.innerHTML = `
            <style>
                :host { display: inline-flex; vertical-align: middle; }
                svg { width: ${size}px; height: ${size}px; }
            </style>
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                ${paths}
            </svg>
        `;
    }
}
```

No `static templateCache`. No `fetch`. The CSS and HTML are template literals right in the `_render()` method. This component renders synchronously — no `async`, no `await`. When it's created, it renders immediately.

**`observedAttributes` and `attributeChangedCallback`**: when someone changes `<svg-icon icon="star">` to `<svg-icon icon="edit">`, the component re-renders with the new icon. Reactive to attribute changes.

**The static `availableIcons` array:**

```javascript
static availableIcons = Object.keys(SVGIcons);
```

This exposes the list of all icon names. Used by the category icon picker to populate the grid of choices. Clean metadata.

**Usage in HTML:**
```html
<svg-icon icon="star" size="16"></svg-icon>
```

Looks just like a native element. The `icon` attribute selects which SVG to render. The `size` attribute controls dimensions. That's the whole API.

In React, this would be a component that receives `name` and `size` as props. In LWC, you'd likely use `lightning-icon` from the base component library, or build a similar component with `@api` properties.

## custom-picker.js: The Most Complex Inline Component

Now open `public/components/custom-picker/custom-picker.js`. This is a substantial component — around 520 lines — and it handles three different modes: color picker, icon picker, and list picker (dropdown).

**Constructor (lines 30-37):**

```javascript
constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._items = [];
    this._value = null;
    this._open = false;
    this._onDocClick = this._handleDocClick.bind(this);
}
```

Internal state: items, selected value, open/closed state. And a bound document-click handler for closing the dropdown when clicking outside.

**connectedCallback and disconnectedCallback:**

```javascript
connectedCallback() {
    this._render();
    document.addEventListener('click', this._onDocClick);
}

disconnectedCallback() {
    document.removeEventListener('click', this._onDocClick);
}
```

Here's the `disconnectedCallback` we keep emphasizing. The document-level click listener that closes the picker when you click outside MUST be removed when the component is destroyed. Otherwise, you get ghost listeners accumulating as pickers are created and destroyed.

**The `value` property (lines 48-56):**

```javascript
get value() {
    return this._value;
}

set value(val) {
    this._value = val;
    this._updateTrigger();
    this._updateSelection();
}
```

This is a JavaScript getter/setter pair. From outside, you can read `picker.value` and write `picker.value = 'red'` as if it's a simple property. But internally, setting it triggers visual updates.

In LWC, you'd decorate this with `@api`:
```javascript
@api
get value() { return this._value; }
set value(val) { this._value = val; /* LWC re-renders automatically */ }
```

Same pattern, but LWC's `@api` makes it a public property that parents can bind to in templates.

**`setItems()` (lines 62-66):**

```javascript
setItems(items) {
    this._items = items;
    this._render();
}
```

Receives an array of items (each with `value`, `label`, and optional `color`, `disabled`). The component re-renders with the new items. This is the "imperative API" approach — calling a method to update the component.

In React, items would be a prop: `<Picker items={epicList} />`. When the prop changes, React re-renders. In your vanilla component, the calling code explicitly calls `setItems()`.

**`_render()` — The Big Method (lines 87-345):**

This is the largest render method in the project. It builds the entire Shadow DOM including all CSS. Let me highlight the key parts:

The CSS section defines three visual modes:
- **Color grid**: colored squares in a grid (for epic/profile color selection)
- **Icon grid**: icon squares in a grid (for category icon selection)
- **List mode**: a dropdown list with labels and colored dots (for epic filter, task epic selection)

The `type` attribute determines which mode to render:
```javascript
const type = this._getType();  // 'color', 'icon', or 'list'
```

Each mode has its own render method: `_renderGrid()` for color/icon, `_renderList()` for list.

**`_renderGrid()` (around line 373):**

```javascript
_renderGrid() {
    return this._items.map(item => `
        <div class="panel__item ${this._value === item.value ? '--selected' : ''} ${item.disabled ? '--disabled' : ''}"
             data-value="${item.value}"
             style="background-color: ${item.color || item.value}"
             title="${item.label}">
        </div>
    `).join('');
}
```

For colors, each item is a colored square. The selected item gets `--selected` class (checkmark overlay). Disabled items (colors already in use by other epics) get `--disabled` class (grayed out, not clickable).

**`_selectItem()` (around line 447):**

```javascript
_selectItem(value) {
    const item = this._items.find(i => i.value === value);
    if (!item || item.disabled) return;

    this._value = value;
    this._close();
    this._updateTrigger();
    this._updateSelection();

    this.dispatchEvent(new CustomEvent('change', {
        bubbles: true,
        composed: true,
        detail: { value, label: item.label }
    }));
}
```

Sets the value, closes the dropdown, updates visuals, dispatches `change` event. The parent listens for `change` and reacts accordingly.

**`_handleDocClick()` — Closing on Outside Click (around line 357):**

```javascript
_handleDocClick(e) {
    if (!this._open) return;
    if (this.contains(e.target) || this.shadowRoot.contains(e.target)) return;
    this._close();
}
```

Two checks: `this.contains(e.target)` checks if the click was on a slotted child (light DOM). `this.shadowRoot.contains(e.target)` checks if it was inside the shadow DOM. If neither, the click was outside — close the picker.

This is a common pattern for dropdown/popover behavior. React developers use a similar approach with `useRef` and a document click handler. LWC would use the same technique.

## Component Size: When to Go Inline vs Full

Here's a practical guideline from your project:

- **`<svg-icon>`**: ~150 lines, mostly data (SVG paths). Inline makes sense — no separate files for such a small render function.
- **`<list-header>`**: ~150 lines, dynamic columns. Inline — the template changes based on `setColumns()` input.
- **`<custom-picker>`**: ~520 lines, three modes. This is pushing the limits of inline. It could benefit from a separate CSS file for maintainability. But it works.
- **`<task-card>`**: ~140 lines of JS + separate HTML + separate CSS. Full component — the template is complex enough to warrant its own file.

The rule of thumb: if the CSS is more than ~30 lines, consider a separate file. If the HTML structure is static (doesn't depend on runtime configuration), consider a separate template.

## Key Takeaway

Inline components eliminate network requests at the cost of mixing concerns in one file. They're ideal for small, frequently-used components (icons) or highly dynamic ones (pickers where the template depends on configuration). The `custom-picker` demonstrates a full-featured form control with three modes, document-level listeners (with cleanup!), and a clean API (value property, setItems method, change event).

Next and final episode, we'll explore the AI page — tool use, provider abstraction, and the most complex integration in the project.

---

*Next: S2E12 — "The AI Integration: ai-page.js and Server-Side AI"*
