# Episode 6: Routing: One Page, Many Views

**Duration:** ~8 minutes
**Topics:** SPA routing, client-side vs server-side routing, your router.js, the base tag, framework routers

---

Welcome back. Today's topic is something that didn't even exist in the web you knew. When you were building websites, if you wanted five different pages, you created five HTML files. Click a link, the browser loads a new file. Simple.

In a Single Page Application, there's ONE HTML file. But the URL still changes. The user sees `/work/board`, then `/work/archive`, then `/work/backlog`. It looks like different pages. But the browser never actually loads a new document. So... what's going on?

That's routing.

## The Problem

Think about it. In the old web, the URL and the page were the same thing. `/about.html` meant "load the file about.html." The server found the file and sent it. Done.

But in an SPA, the server only has one file: `index.html`. So when the browser asks for `/work/archive`, the server can't send an `archive.html` because it doesn't exist. It needs to send `index.html`, and then JavaScript on the client side looks at the URL and decides "ah, the user wants the archive page — let me render that."

This creates a coordination problem between the server and the client. Both need to understand the URL, but for different reasons. The server needs to know "send `index.html` for this URL." The client needs to know "show the archive page for this URL."

## Your Server-Side Routing

In your `server.js`, you have a catch-all route: `GET /:alias/:page`. This matches URLs like `/work/archive`, `/work/backlog`, `/work/dashboard`. For all of them, the server does the same thing: serve `index.html`. It doesn't care what the page is. That's the client's job.

But there are also specific API routes that come BEFORE the catch-all. Routes like `GET /api/:profile/tasks` are more specific, so Express matches them first. The catch-all only handles what's left — which are the page URLs.

This is important. If you type `localhost:3001/work/archive` directly in your browser — not by clicking a link in the app, but by typing the URL — the browser sends a request to the server. The server sees `/work/archive`, matches the catch-all route, and sends `index.html`. Then the JavaScript starts, reads the URL, and renders the archive page. Without that server-side catch-all, you'd get a 404 error.

## Your Client-Side Routing

Now for the fun part. Your `router.js` has two key functions:

**`parsePath()`** — reads the current URL and extracts the parts. For `/work/archive`, it returns `{ alias: 'work', page: 'archive' }`. For just `/work`, it returns `{ alias: 'work', page: 'board' }` (board is the default). This is how your app knows what to show.

**`buildPath(alias, page)`** — does the reverse. Given an alias and a page name, it constructs the URL string. Used when creating links in the sidebar.

In `app.js`, during initialization, it calls `parsePath()` to figure out where the user is. If the page is 'board', it shows the kanban board. If it's 'archive', it hides the board, shows the page view container, and dynamically imports `archive-page.js` to set up the archive page. Same for backlog, dashboard, and AI.

The "dynamically imports" part is worth noting. Your app doesn't load every page's code upfront. If the user never visits the archive page, `archive-page.js` is never downloaded. This is called **lazy loading** or **code splitting** — only load what you need, when you need it. Your project does this with `await import('./js/archive-page.js')`. The `import()` function (with parentheses, not the `import` statement at the top of a file) loads a module on demand.

## The Base Tag Trick

Here's a subtle but critical detail in your project. In `index.html`, there's a `<base href="/">` tag in the head.

Why? Consider what happens when you're at the URL `/work/archive`. The browser thinks it's in a "directory" called `/work/`. So when your component tries to fetch its template from `components/task-card/task-card.html` (a relative path), the browser resolves it as `/work/components/task-card/task-card.html`. That file doesn't exist. 404 error.

The `<base href="/">` tag tells the browser: "All relative URLs should be resolved from the root, not from the current path." So `components/task-card/task-card.html` resolves to `/components/task-card/task-card.html`. Problem solved.

This is one of those things that you discover the hard way. Everything works fine on the main page, then you navigate to a sub-page and all your components break. The base tag is the fix.

## How Frameworks Handle Routing

Every SPA framework needs a router. Let's compare.

**React Router** is the most popular router for React apps. It lets you define routes declaratively — you write something like "when the URL is /archive, render the ArchivePage component." React Router also supports nested routes (a page within a page), route parameters (like your `:alias`), redirects, and lazy loading. It's a separate package — not built into React itself.

React Router also provides a `Link` component. Instead of regular `<a>` tags, you use `<Link to="/archive">`. This prevents the browser from doing a full page reload. It catches the click, updates the URL using the History API, and tells React to re-render. If you use a regular `<a>` tag, the browser would send a request to the server, which defeats the purpose of an SPA.

**Next.js** (the React framework) has file-system routing. You create a file at `pages/archive.js`, and automatically the URL `/archive` renders that file. No configuration needed. The folder structure IS the routing. This is a very popular pattern now.

**Angular** has a built-in router — one of the most powerful ones. It supports lazy loading of entire feature modules, route guards (checking permissions before navigating), and complex nested route configurations. It's more than what most apps need, but it's there if you need it.

**SvelteKit** (the Svelte framework) also uses file-system routing, similar to Next.js. Create a file in the right folder, and the route exists.

**LWC** routing is... different. In the Salesforce world, navigation is handled by the Lightning platform itself, not by the component. You use a `NavigationMixin` to tell Salesforce "take the user to this page." The platform handles the URL, the navigation history, and which component to render. It's less flexible than a custom router but fits Salesforce's ecosystem where apps run inside the Salesforce platform.

For LWC components used outside Salesforce (LWC Open Source), you'd need to bring your own router — and it would work similarly to what you built.

## The History API

Under the hood, all SPA routing uses the browser's **History API**. This API lets JavaScript change the URL without reloading the page.

`history.pushState()` changes the URL and adds an entry to the browser's history. So the back button works — pressing back goes to the previous URL, and your JavaScript handles showing the right content.

`window.onpopstate` fires when the user presses back or forward. Your app listens for this and re-renders accordingly.

Your project's sidebar uses regular `<a>` tags for navigation links. When you click one, the browser's default behavior would cause a full page load. But since the server serves `index.html` for all routes, it works — you just get a small flash as the page reloads. Some SPA routers intercept these clicks to avoid the reload, but your approach works perfectly fine for a local app.

## Static Routing vs Dynamic Routing

One more concept. Your routing is pretty simple — you have a fixed set of pages (board, archive, backlog, dashboard, reports, AI). This is **static routing**.

Some apps have **dynamic routing** where the route structure depends on data. For example, a blog might have routes like `/posts/:id` where the ID comes from a database. Or a project management tool might have `/teams/:teamId/projects/:projectId`. The router needs to match these patterns and extract the variables.

Your project has a mild version of this with the `:alias` parameter. Different profiles have different aliases, and the router handles them. But the page set is fixed.

## The Takeaway

Routing in an SPA means two things working together: the server sends the same `index.html` for all page URLs, and the client JavaScript reads the URL to decide what to render.

Your project handles this cleanly with a simple `parsePath()` function and dynamic imports. Frameworks add more features — nested routes, guards, file-system routing — but the core concept is the same: read the URL, render the right content, update the URL when the user navigates.

And the `<base href="/">` trick? File that one away. It'll save you a debugging headache someday.

Next episode, we're going deep into CSS — your home turf. Shadow DOM encapsulation, CSS custom properties, design tokens, and how frameworks handle styles differently.

See you there.

---

*Next episode: "CSS in the Modern World" — Shadow DOM styling, CSS custom properties, design tokens, BEM, and framework approaches.*
