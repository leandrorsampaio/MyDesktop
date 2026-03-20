# Future Episode Ideas (Season 3+)

Ideas for additional episodes that emerged while writing Seasons 1 and 2. Each could be a 5-10 minute episode.

**Season 1** (conceptual, walking-friendly) — 12 episodes delivered
**Season 2** (code walkthroughs, at the computer) — 12 episodes delivered

---

## Deep Dives Into Your Project

- **~~Drag and Drop~~** ✅ Covered in S2E03
- **~~Modals~~** ✅ Covered in S2E07
- **~~AI Integration~~** ✅ Covered in S2E12
- **Touch Events and Mobile DnD** — HTML5 DnD doesn't work well on mobile; touch event alternatives, how frameworks handle it (react-beautiful-dnd, SortableJS)
- **The Toaster Pattern** — Notification systems, stacking, auto-dismiss, accessibility of live regions (`aria-live`), how design systems handle notifications
- **Custom Pickers and Form Components** — Building custom form controls, the `<custom-picker>` component, color/icon grids, dropdown behavior, accessibility of custom inputs
- **Your AI Integration** — Tool use / function calling with LLMs, system prompt engineering, provider abstraction (Anthropic vs OpenAI-compatible), how to build AI features into web apps

## Web Platform Deep Dives

- **The Browser Rendering Pipeline** — DOM, CSSOM, render tree, layout, paint, composite. Why some CSS properties are "expensive" and others are "cheap." Will-change, transform, opacity.
- **Web Storage: The Full Picture** — localStorage, sessionStorage, IndexedDB, cookies, Cache API. When to use which. Your localStorage usage (checklist, config) vs server-side JSON files
- **Service Workers and Offline** — Making your app work without internet. Cache strategies. PWA (Progressive Web App) concepts. Turning your task tracker into a PWA
- **Web Sockets and Real-Time** — Your project uses request/response (REST). What if you wanted real-time updates? WebSockets, Server-Sent Events, Socket.io
- **Security Deep Dive** — XSS, CSRF, CSP, CORS. Your escapeHtml, rate limiting, input validation. How Salesforce LWC Locker Service restricts DOM access for security
- **Accessibility from Scratch** — ARIA attributes, semantic HTML, keyboard navigation, screen reader testing. How to audit your task tracker. Salesforce SLDS accessibility requirements

## Backend & Infrastructure

- **Databases 101** — SQL vs NoSQL, when to use what. Migrating your JSON files to SQLite. ORMs (Prisma, Sequelize). How Salesforce SOQL differs from SQL
- **Authentication & Authorization** — Sessions, JWTs, OAuth2. Why your app doesn't need auth (single user, local) and when you would. Salesforce's built-in auth model
- **Docker and Deployment** — Containerizing your Node.js app. Docker basics. Deploying to a VPS, Vercel, Railway. Differences from Salesforce deployment (metadata, scratch orgs)
- **CI/CD Pipelines** — GitHub Actions, automated testing, deployment pipelines. How Salesforce uses pipelines with scratch orgs and metadata deployment

## Framework-Specific Episodes

- **React Hooks Explained** — useState, useEffect, useRef, useContext, useMemo, useCallback. When to use each. Common mistakes
- **React Server Components** — The newest paradigm. Server vs client components. Why it matters. Next.js App Router
- **Svelte: The Compiled Framework** — How Svelte's compiler works. Stores. The new Svelte 5 runes. SvelteKit for full apps
- **Angular Signals and Standalone Components** — Angular's modernization. Moving away from NgModules. The new signal-based reactivity
- **LWC Deep Dive: Wire Service** — How @wire works, cacheable vs non-cacheable Apex, wire adapters, error handling, reactive wire parameters
- **LWC Deep Dive: Apex Integration** — Writing Apex classes, imperative calls, error handling, governor limits, bulkification
- **LWC Deep Dive: SLDS and Base Components** — Lightning Design System, using base components effectively, custom theming, styling hooks

## Computer Science Fundamentals

- **How the Internet Actually Works** — DNS, TCP/IP, HTTP/HTTPS, TLS. What happens between typing a URL and seeing a page
- **Algorithms You Should Know** — Sorting (your archive page sorts!), searching, recursion. Not for interviews — for real understanding
- **Design Patterns for Web Developers** — Observer (your events), Strategy (your provider abstraction in AI), Singleton (your state store), Factory (your component registration)
- **Functional Programming Concepts** — Pure functions, immutability, higher-order functions. Array methods (map, filter, reduce) as functional programming in JavaScript

## Career & Industry

- **The Salesforce Ecosystem** — Trailhead, certifications, AppExchange, consulting vs in-house. Why Salesforce developers are in demand
- **Open Source Contributions** — How to contribute, reading other people's code, pull request etiquette. Your project as a portfolio piece
- **The Modern Developer Toolkit** — VS Code, GitHub Copilot, Chrome DevTools, Postman/Insomnia, Figma for developers
- **Technical Interviews in 2026** — What companies ask, system design basics, live coding tips, portfolio presentation

---

*Add new ideas here as they come up. Each episode should be self-contained and accessible while walking.*
