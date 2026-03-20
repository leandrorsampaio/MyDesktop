# Episode 9: The Template Game

**Duration:** ~8 minutes
**Topics:** Runtime template loading, template caching, innerHTML, JSX, Svelte templates, LWC HTML templates

---

Hey, welcome back. Today's topic is something you deal with every time you build a component: **templates**. How does a component define what it looks like? How does it describe its HTML structure? Sounds simple, but every framework has a completely different answer.

## Your Approach: Fetch and Inject

In your project, each component has three files: a `.js` file (the logic), an `.html` file (the template), and a `.css` file (the styles). When the component first appears on the page, it fetches the HTML and CSS files from the server, then injects them into its Shadow DOM.

Let's walk through it. Your `task-card.js` connects to the page. In `connectedCallback()`, it checks the static `templateCache`. If it's empty, it starts fetching `task-card.html` and `task-card.css` in parallel using `Promise.all()`. Once both arrive, it creates a `<style>` element with the CSS, adds the HTML, and puts both inside the shadow root.

After the template is loaded, data is injected. The `setTask()` method receives a task object and fills in the blanks — setting text content, adding classes, toggling visibility of elements based on the task's properties.

This approach has a clear benefit: separation of concerns. Your HTML structure is in one file, your styles in another, your logic in a third. A designer could edit the HTML template without touching the JavaScript. A developer could change the logic without restructuring the HTML.

The tradeoff? Runtime fetching. The first time a component type appears, there's a small delay while the files are downloaded. Your template caching eliminates this for subsequent instances, but the first one needs the network.

## The innerHTML Way

For simpler cases, your project skips the file-fetching entirely. Components like `<svg-icon>`, `<custom-picker>`, and `<list-header>` are what your project calls "inline components." They define their HTML and CSS directly in the JavaScript file as template literal strings.

This makes sense when the template is small or when the component needs to be available instantly. `<svg-icon>` is just an SVG path — it doesn't need a separate HTML file for two lines of markup.

Your page modules — `archive-page.js`, `backlog-page.js`, `dashboard-page.js` — also use `innerHTML` to build their layouts. They construct HTML strings with template literals, set them as the container's innerHTML, and then attach event listeners via `js-` hooks.

Is innerHTML bad? It has a reputation because it can create security problems if you put user input directly into it — that's called XSS (Cross-Site Scripting). But your project uses `escapeHtml()` from `utils.js` to sanitize any user-provided text before it goes into innerHTML. That's the correct approach.

## How React Does It: JSX

React uses **JSX**, and it's probably the most different approach you'll see.

JSX looks like HTML but lives inside your JavaScript. You write what appears to be HTML markup right in your functions. But it's not actually HTML — it's a special syntax that gets compiled into JavaScript function calls.

The interesting thing about JSX is that it mixes structure and logic. Instead of having a separate template file, the "template" IS the JavaScript. You can use JavaScript expressions directly in the markup — loops, conditionals, variables. Everything is in one place.

Some people love this. They say it makes components easier to understand because you don't need to jump between files. Others miss the clean separation of HTML and JavaScript.

One key difference: in JSX, you can't just use a string to build HTML. You work with elements and components. This prevents innerHTML-type security issues by design. React automatically escapes content.

## How Svelte Does It: HTML With Superpowers

Svelte takes the opposite approach from React. Your template is an actual HTML file — well, a `.svelte` file that looks like HTML. You write standard HTML tags, and Svelte adds special syntax for dynamic parts.

What makes Svelte templates special is the **reactive declarations**. If a variable changes, the template parts that depend on it update automatically. You don't call `setState` or `render()`. The compiler figured out the dependencies at build time and generated code that updates only what needs to change.

Svelte also has special blocks for logic in templates — loops, conditionals, await blocks for handling Promises. They look different from JavaScript but map to the same concepts.

Svelte's approach is probably the most intuitive for someone with an HTML/CSS background. It feels like writing normal HTML with a few sprinkles of interactivity.

## How Angular Does It: HTML With Directives

Angular templates are HTML files with special attributes called **directives**. These directives add behavior to elements.

Angular also has **two-way data binding** — a concept where changing the UI (like typing in an input) automatically updates the data, and changing the data automatically updates the UI. It's like a two-lane highway. Your vanilla project handles this manually: you read the input value, update the state, then re-render. Angular does it automatically.

Angular templates have a steeper learning curve because of all the directives and special syntax, but they're very powerful once you learn them.

## How LWC Does It: The Closest to Your Approach

OK, here's the one you'll care about most. LWC templates are **HTML files**, separate from the JavaScript. Sound familiar? That's because it IS the same concept as your project.

Each LWC component has a `.html` file and a `.js` file (and optionally a `.css` file). The HTML file defines the structure. The JS file defines the data and behavior.

LWC templates have a few special features:

**Data binding** — you use curly braces to insert data from the JavaScript class. So if your JS has `this.taskTitle = "Buy milk"`, the template says `{taskTitle}` where you want it to appear. When the property changes, LWC re-renders the template.

**Conditional rendering** — `lwc:if={condition}` shows or hides a block. Similar to Angular's directives, but with LWC-specific syntax.

**Iteration** — `for:each={items}` loops through an array and renders a template for each item. Each item needs a unique `key` — this helps LWC efficiently update the list when items change (same concept as React's key prop).

**Slots** — exactly like your Shadow DOM slots! `<slot>` in the template, and parent components inject content into it. Same API, same behavior.

The big difference from your approach: LWC templates are compiled at build time, not fetched at runtime. The Salesforce build system processes the HTML, creates an optimized render function, and bundles it with the JavaScript. When the component renders, there's no fetch — the template is already part of the code.

But conceptually? Separate HTML template + separate JS logic + Shadow DOM + CSS scoping = your project and LWC are doing the same thing. The only difference is when the template gets processed: runtime (yours) vs build time (LWC).

## Template Compilation: The Build Step Advantage

This is worth understanding. When React compiles JSX, or Svelte compiles its templates, or LWC processes its HTML — they're not just converting formats. They're **optimizing**.

The compiler can analyze the template and determine: "This part is static, it never changes. This part depends on the `title` property. This part depends on `priority`." Then it generates code that only updates the parts that actually need to change.

Your project doesn't have this optimization. When you call `renderAllColumns()`, it rebuilds everything. For a small app, that's fine — rebuilding 30 task cards takes milliseconds. But this is why larger applications use frameworks with compiled templates: the compiler does work upfront so the browser does less work at runtime.

## Content Security: Templates and Trust

One important concept: your template approach trusts the HTML files on your server. This is fine because you control both the server and the client. But in a production environment, you'd think about **Content Security Policy** (CSP).

CSP is a security feature where the server tells the browser: "Only run scripts and load resources from these specific sources." It can prevent XSS attacks by blocking inline scripts and unauthorized external resources.

Salesforce has strict CSP rules. LWC components can't use `innerHTML` at all — that's why they use template directives instead. If you try to set innerHTML in a LWC component, Salesforce blocks it. This is more restrictive but much safer.

Your project uses innerHTML responsibly (with escaping), but knowing about CSP is important for production work.

## The Takeaway

Templates are how components describe their visual structure. Your project fetches HTML files at runtime and injects them into Shadow DOM. React uses JSX (logic and markup together). Svelte uses enhanced HTML. Angular uses directive-annotated HTML. LWC uses separate HTML files — closest to your approach.

The key insight: all approaches solve the same problem — connecting data to visual output. They just differ in where the template lives (separate file vs inline), when it's processed (runtime vs build time), and how dynamic parts are expressed.

Your approach is the most transparent. Nothing is hidden. When you move to LWC, you'll find the same file structure (HTML + JS + CSS), the same Shadow DOM, the same slots — just with a compilation step in between.

Next time, we're going deep into data structures and patterns — Maps, modules, race conditions, and the clever tricks in your codebase.

See you there.

---

*Next episode: "Data Structures and Patterns" — Maps vs arrays, module architecture, locks, debouncing, snapshot/rollback.*
