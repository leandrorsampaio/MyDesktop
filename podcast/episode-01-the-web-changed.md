# Episode 1: The Web Changed While You Were Away

**Duration:** ~8 minutes
**Topics:** What happened 2010-2026, ES Modules, Web Components, SPA vs MPA, frameworks overview

---

Hey, welcome. So, you used to build websites. You were a CSS specialist — and a good one. Then life happened, you stepped away, and now you're back. And the web... well, the web went through a whole transformation while you were gone.

Let me paint the picture of what you left behind. Around 2010, the web was mostly server-rendered pages. You had your HTML, your CSS, maybe some jQuery to make things move around. Every time a user clicked a link, the browser asked the server for a brand new page. The server built that page — maybe with PHP, maybe with Java, maybe with Python — and sent back a complete HTML document. The browser threw away what it had and rendered the new one. That was it. Simple. A bit slow sometimes, but it worked.

Now, here's what happened while you were away.

## JavaScript Grew Up

The biggest change? JavaScript went from being that annoying little language you used to validate forms... to being the most important programming language in the world. I'm not exaggerating.

In 2015, a huge update called ES6 — or ECMAScript 2015 — landed. It brought things like `let` and `const` instead of just `var`. Arrow functions, which are a shorter way to write functions. Template literals — those strings with backticks where you can put variables inside. Classes. Destructuring. And the big one for us: **modules**.

Before modules, if you had five JavaScript files, you loaded them all with script tags and they all shared the same global space. It was chaos. One file could accidentally overwrite a variable from another file. Modules changed that. Now each file is its own little world. You explicitly say "I want to share this function" using `export`, and another file says "I want to use that function" using `import`. Clean. Organized. No more global mess.

Your project uses this everywhere. When you open `app.js`, right at the top you'll see it importing functions from `state.js`, `api.js`, `utils.js`, `filters.js`. Each file has a clear job, and they only share what they need to share. This is the modern way.

## The Single Page Application Revolution

OK so here's probably the biggest shift in how we build web apps. Remember how I said the old web sent a new HTML page for every click? Around 2010-2013, people started thinking: "What if we just load ONE page, and then JavaScript handles everything after that?"

That's a Single Page Application — an SPA. The server sends one HTML file, one big JavaScript bundle, and from that point on, JavaScript takes over. When you click a link, JavaScript catches that click, fetches just the data it needs from the server, and updates the page right there. No full reload. It feels fast and smooth, like a desktop app.

Your task tracker? It's an SPA. There's one `index.html` file. When you go from the board to the archive page, or to the backlog, the browser doesn't ask the server for a new HTML page. Your JavaScript — specifically your `router.js` — looks at the URL, figures out which page you want, and renders the right content. The page never fully reloads.

Now, SPAs brought their own problems — we'll talk about those later — but they changed everything.

## The Framework Explosion

Here's where it gets interesting. Building an SPA from scratch, like you did with your project, is hard. You need to manage state, update the screen efficiently, handle routing, deal with components... So people built frameworks to handle all that.

**React** came from Facebook in 2013. Its big idea: the UI is a function of your data. You describe what the screen should look like for any given state, and React figures out what actually needs to change in the page. It introduced this thing called JSX, which looks like HTML inside your JavaScript. Weird at first, but it works.

**Angular** came from Google. Version 1 was around in 2010, but they completely rewrote it in 2016. It's a full framework — it has everything built in: routing, forms, HTTP calls, testing tools. It uses TypeScript, which is JavaScript with type checking. It's popular in big companies.

**Svelte** showed up around 2016 with a completely different approach. Instead of running a framework in the browser, Svelte does its work at build time. It compiles your components into efficient vanilla JavaScript. The result? Smaller files, faster apps. Very clever.

And then there's **LWC — Lightning Web Components**. This one is from Salesforce, and here's what's special about it: it's built on top of the same Web Components standards that YOUR project uses. Web Components are a browser feature — not a framework. They're part of the actual web platform. When Salesforce decided to build LWC, they said "let's use what the browser already gives us." That's exactly what you did too.

So your project, even though it has no framework, uses the same foundation as LWC. Custom Elements, Shadow DOM, templates — you're already learning the concepts that LWC is built on. That's not a coincidence. That's a great position to be in.

## Web Components: The Browser's Built-In Framework

Let's talk about Web Components for a second, because your whole project is built on them.

Web Components are actually three technologies working together. First, **Custom Elements**: the ability to define your own HTML tags. In your project, you have `<task-card>`, `<modal-dialog>`, `<kanban-column>`, `<nav-sidebar>`. These aren't standard HTML — you invented them. The browser lets you do that, and you can define what they look like and how they behave.

Second, **Shadow DOM**: this is like a force field around your component. The CSS inside a component can't leak out, and the CSS outside can't leak in. Each component is isolated. In your project, every component has its own Shadow DOM. That's why the styles in `task-card.css` don't affect the rest of the page.

Third, **HTML Templates**: reusable chunks of HTML that aren't rendered until you need them. Your components fetch their HTML templates at runtime and inject them into the Shadow DOM.

This is the actual web platform. No library needed. No npm install. It just works in the browser. React, Angular, and Svelte all solve the same problem — creating reusable, isolated UI components — but they do it with their own systems. Web Components do it with the browser itself.

## Where Your Project Sits

So let me put this all together. Your task tracker is what I'd call a "vanilla modern web application." It uses:

- ES Modules for code organization — no bundler needed
- Web Components for the UI — no React, no Angular
- A Node.js server with Express for the backend — simple, straightforward
- JSON files for data storage — no database
- No build step — you write the code, the browser runs it directly

This is actually a beautiful learning setup. You're touching every layer, with nothing hidden behind a framework's magic. When you eventually pick up React or LWC, you'll understand what they're doing under the hood, because you've already done it yourself, the hard way.

In the next episode, we're going to talk about that backend — your server, what it does, and why it exists. Because for someone coming from a CSS background, the server side can feel like a black box. We're going to open that box.

See you in the next one.

---

*Next episode: "Your Server is Just a Waiter" — Backend fundamentals, Node.js, Express, and how your server.js works.*
