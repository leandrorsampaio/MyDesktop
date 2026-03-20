# Episode 3: Components: The LEGO Blocks

**Duration:** ~10 minutes
**Topics:** Web Components, Custom Elements, Shadow DOM, component lifecycle, framework comparisons (React, LWC)

---

Hey, welcome back. Today's episode is a big one. We're talking about **components** — and honestly, this might be the single most important concept in modern web development.

When you were building websites in 2010, you probably had one big HTML file, one big CSS file, and maybe a JavaScript file or two. Everything was mixed together. The header HTML was at the top, the footer at the bottom, the sidebar somewhere in the middle. The CSS for all of them was in one stylesheet. If you wanted to reuse a piece of UI on another page, you'd copy and paste.

That world is gone. Today, everything is components.

## What Is a Component?

Think of LEGO blocks. Each block is a self-contained piece. It has a specific shape, a specific color, a specific purpose. You can combine them to build anything. And the important thing: each block doesn't care what's around it. A red 2x4 block works the same whether it's in a house, a spaceship, or a dinosaur.

A component is the same idea applied to UI. Your `<task-card>` component is a LEGO block. It knows how to display a task — title, priority dot, epic badge, category icon. It has its own HTML structure, its own CSS, its own behavior. It doesn't know or care that it's sitting inside a kanban column. You could put it on the archive page, the backlog page, anywhere. It just works.

Your project has about a dozen components: `task-card`, `kanban-column`, `modal-dialog`, `nav-sidebar`, `daily-checklist`, `notes-widget`, `toast-notification`, `custom-picker`, `svg-icon`, `list-header`, `archive-row`, `ai-staged-row`, and a few more. Each one is a LEGO block.

## Custom Elements: Inventing Your Own HTML

The first piece of Web Components is **Custom Elements**. The browser has built-in elements — `<div>`, `<button>`, `<input>`. Custom Elements let you create your own. You literally invent new HTML tags.

In your project, you write a JavaScript class that extends `HTMLElement`, and then you register it. You say: "Hey browser, when you see a `<task-card>` tag in the HTML, use this class to create it." From that moment on, `<task-card>` is a real HTML element, just like `<div>`. You can put it in HTML, create it with JavaScript, add attributes to it — everything.

There's one rule: custom element names must have a hyphen in them. So `<task-card>` works, but `<taskcard>` wouldn't. The hyphen is how the browser tells your custom elements apart from the built-in ones. It's a small thing, but it matters.

## The Lifecycle: Birth, Life, and Death of a Component

Here's where it gets really interesting. Every Custom Element has a **lifecycle** — a series of moments where the browser tells your component "hey, something happened to you." These are called **lifecycle callbacks**.

**`constructor()`** — the component is born. It's been created in memory, but it's not on the page yet. You set up your initial state here. In your project, this is where components create their shadow root and bind event handlers.

**`connectedCallback()`** — the component has been placed on the page. This is the big one. This is when your component should do its setup work: fetch its HTML template, set up its Shadow DOM, load its CSS, attach event listeners. In your project, this is where the template caching happens — the component checks if the template has already been loaded, and if not, fetches it.

**`disconnectedCallback()`** — the component has been removed from the page. This is cleanup time. If your component added an event listener to the document — like listening for the Escape key — this is where you remove it. If you have timers running, you stop them here. Memory leaks happen when you forget this step. Your project spec actually has a rule: every component with document-level listeners must implement `disconnectedCallback`.

**`attributeChangedCallback()`** — an attribute on the element changed. For example, if someone changes `<nav-sidebar page="board">` to `<nav-sidebar page="archive">`, this callback fires. The component can react to the change and update itself.

Now here's the cool part — this lifecycle concept exists in every framework, not just Web Components:

In **React**, they have something similar but different. React uses "hooks" — `useEffect` is the big one. When a React component mounts (appears on the page), `useEffect` runs. When it unmounts (gets removed), the cleanup function inside `useEffect` runs. Before hooks, React had `componentDidMount` and `componentWillUnmount` — which were basically the same as `connectedCallback` and `disconnectedCallback`.

In **LWC**, the lifecycle is almost identical to yours because LWC is built on Web Components! LWC has `connectedCallback()` and `disconnectedCallback()` — literally the same names, same concept. The only difference is LWC adds `renderedCallback()`, which fires after the component's template has finished rendering. Since LWC is based on the same Web Components standard you're using, everything you learn here transfers directly.

In **Angular**, they have `ngOnInit` (like connectedCallback), `ngOnDestroy` (like disconnectedCallback), and several others for different moments.

In **Svelte**, they have `onMount` and `onDestroy` — simpler names, same idea.

See the pattern? Every framework has to solve the same problem: when does the component set up, and when does it clean up? The names change, the syntax changes, but the concept is universal.

## Shadow DOM: The Force Field

This is the part you, as a CSS specialist, will find fascinating.

Shadow DOM creates an **encapsulation boundary** around your component. Think of it as a force field. CSS from outside the component cannot reach inside. CSS from inside the component cannot leak out. The component's internal structure is completely hidden from the rest of the page.

In your project, each component creates a Shadow DOM using `this.attachShadow({ mode: 'open' })`. Then it puts its HTML and CSS inside that shadow. The styles in `task-card.css` only affect elements inside `task-card`. They can't accidentally break the header, the sidebar, or any other component. And the global `styles.css` can't accidentally break the task card's internal layout.

This is a big deal. Remember the old days of CSS? You'd write `.header { color: red }` and suddenly three things turned red because they all had that class name. With Shadow DOM, that problem is gone.

But — and this is important — CSS Custom Properties (variables) DO cross the shadow boundary. They inherit down through Shadow DOM. That's why your project defines things like `--color-accent-primary` on `:root` and they work inside every component. This is by design. The shadow boundary blocks selectors and rules, but custom properties pass through. Think of it like this: the force field blocks bullets, but light passes through.

Your project uses this cleverly. The column widths on the archive page are controlled by CSS custom properties: `--archive-col-title`, `--archive-col-epic`, etc. These are defined on `:root`, and both `<list-header>` and `<archive-row>` — which are separate components with their own Shadow DOM — can read those values. The columns line up perfectly without the components needing to know about each other.

**How do frameworks compare?**

**React** doesn't use Shadow DOM at all. It uses a different approach to style isolation — you can use CSS Modules (where class names are automatically made unique), or styled-components (where CSS is written in JavaScript), or just careful naming. But there's no built-in encapsulation like Shadow DOM.

**LWC** uses Shadow DOM — well, mostly. LWC actually has two modes: "shadow" (real Shadow DOM, the default for custom components) and "light DOM" (for when you need parent styles to reach in). But the default behavior is the same as what you're doing.

**Svelte** has its own scoping mechanism. It automatically adds unique attributes to elements and rewrites your CSS selectors to include those attributes. So `.card { }` becomes `.card.svelte-abc123 { }`. Similar effect to Shadow DOM, but achieved differently.

**Angular** does something similar to Svelte — it uses a technique called "View Encapsulation" that adds attributes to scope styles.

## Template Loading: Your Unique Pattern

Your project has an interesting pattern that's worth understanding. Each component loads its HTML template and CSS at runtime using `fetch`. The first time a `<task-card>` appears on the page, it fetches `task-card.html` and `task-card.css` from the server. Then it caches them in a static property — `static templateCache` — so the second, third, and hundredth task card don't need to fetch again.

There's a subtle but important detail here. Your project stores the **Promise** in the cache, not the resolved value. Why? Imagine 20 task cards all connect to the page at the same time. If you stored the resolved value, all 20 would start fetching before the first one finishes and caches the result. By storing the Promise, the first card starts the fetch, the second card sees "oh, there's already a fetch in progress," and waits for the same one. One fetch instead of twenty.

In React and Angular and Svelte, this problem doesn't exist because there's a build step. All the templates are compiled into the JavaScript bundle at build time. No runtime fetching needed. The tradeoff: they need that build step. Your project runs directly in the browser.

In LWC, templates are also compiled at build time. Each LWC component has an `.html` file and a `.js` file, and the Salesforce build system combines them. But the concept — one template per component, separate from the logic — is the same as what you're doing.

## Putting It Together

So, components. They're the fundamental unit of modern UI. Your project uses the browser's native implementation — Web Components with Custom Elements and Shadow DOM. React, Angular, Svelte, and LWC all provide their own component systems that solve the same problems.

The beautiful thing about your approach is that it's the foundation layer. Web Components are what the browser itself provides. Frameworks build on top of this, adding convenience features like reactive data binding, template syntax, and build-time optimization. But the core idea — a self-contained, reusable, isolated piece of UI with a lifecycle — that's the same everywhere.

And especially for LWC, you're basically already writing LWC components. Different syntax, yes. Different tooling, yes. But the mental model? The lifecycle? The Shadow DOM encapsulation? You've already internalized all of that.

Next episode, we're going to talk about **state** — the data that drives your components. What it is, why it's tricky, and how your `state.js` compares to what React and LWC do.

See you there.

---

*Next episode: "State: The Brain of Your App" — State management, reactive updates, optimistic UI, and framework comparisons.*
