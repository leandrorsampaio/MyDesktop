# AGENTS.md

**Entry point for any LLM / coding agent working on this repo.** Read this file first. It tells you what the project is, where things live, and the rules you must not break. Dive into the linked docs only as the task demands.

---

## What this project is

A self-hosted personal kanban tracker. Runs locally as a browser homepage. Vanilla JS + Web Components (Shadow DOM) + Node (built-in `http` module, no Express). **No framework, no build step, no bundler, zero npm dependencies.** Edit a file, refresh the page.

- **Current version:** 2.38.1 (see [CHANGELOG.md](CHANGELOG.md))
- **Today's date for this session:** check the user's environment header
- **Single user, local only.** Multi-profile (Work, Personal, …) via URL-scoped data folders.

---

## How to start a task

1. **Read this file in full** (you're doing that now).
2. **Read [SPEC.md](SPEC.md)** if the task touches code, data models, or the API. It is the source of truth.
3. **Skim [CHANGELOG.md](CHANGELOG.md)** if you need to know what shipped recently or what something used to be called.
4. **Then start.** Don't read more docs than you need. The catalog below tells you which file owns which question.

If the task is small (typo, copy edit, a single CSS tweak), this file alone is usually enough.

---

## Doc map

| File | Purpose | When to read |
|---|---|---|
| **AGENTS.md** | This file. Entry point + rules. | Always first. |
| [SPEC.md](SPEC.md) | Current implementation: file tree, API endpoints, data models, code rules, component APIs, non-obvious behaviors. **Source of truth.** | Any code change. |
| [VISION.md](VISION.md) | Strategic intent: audience, principles, task lifecycle, "Functional Calm" design philosophy, dark-mode plan, name candidates. | Direction questions, taste calls, UX proposals. |
| [CHANGELOG.md](CHANGELOG.md) | One line per shipped version. | "When did X ship?" / "What did v2.X do?" |
| [FUTURE.md](FUTURE.md) | Deferred ideas not yet picked up. | Considering a feature that may already be parked. |
| [README.md](README.md) | Public-facing readme + quickstart. | Rarely needed for code work. |
| [docs/design/DESIGN_BRIEF.md](docs/design/DESIGN_BRIEF.md) | Brief for the active design-hire engagement (dark-mode redesign). Includes current tokens. | Design work, token changes, dark mode. |
| [docs/design/COMPONENT_CATALOG.md](docs/design/COMPONENT_CATALOG.md) | Exhaustive catalog of every UI component, state, and page layout. | Touching any component's CSS or markup. |
| [docs/design/DESIGN_PROMPTS.md](docs/design/DESIGN_PROMPTS.md) | Prompts used with the design AI. | Only if you ARE the design AI. |

If a doc disagrees with the code, **the code wins** — then update the doc.

---

## Stack & how to run

```bash
npm run dev              # node --watch — auto-restarts on save (use this in dev)
node server.js           # one-shot
PORT=4000 node server.js
RATE_LIMIT_DISABLED=1 node server.js   # test-mode: bypass rate limiter so the test suite doesn't 429 itself
npm test                 # all tests (API tests need server running in test-mode)
npm run test:unit
npm run test:api
```

API tests run sequentially against a dedicated `tests` profile (`data/tests/`, gitignored). The profile is created idempotently on first run.

- **Frontend:** ES modules in `public/js/`, Web Components in `public/components/`. Entry: `public/app.js`.
- **Backend:** `server.js` + `mini-server.js` (tiny Express-compatible shim built on Node's `http` module — see "House style" below). JSON file persistence in `data/`.
- **Data:** `data/profiles.json` (global) + `data/{alias}/*.json` per profile.
- **Routing:** server serves `index.html` for `/`, `/:alias`, `/:alias/:page`. Client parses `window.location.pathname` via `public/js/router.js`.

For the full file tree and API surface, see [SPEC.md](SPEC.md).

---

## Non-negotiable code rules

These are the ones that get violated most often. Full list in [SPEC.md § Code Rules](SPEC.md#code-rules).

1. **No `confirm()` / `alert()`** — use the `<modal-dialog>` component for confirmations and `elements.toaster.success/error/warning/info()` for feedback.
2. **No `window.fn` exports.** No inline `onclick=` in generated HTML. Use event delegation against `.js-camelCase` hooks.
3. **No `console.log` in production code** (unless behind a `DEBUG` flag).
4. **BEM camelCase**: `.blockName__elementName`, `.--modifierName`, `.js-hookName`. No IDs in HTML.
5. **Optimistic UI with rollback** for every task CRUD. Snapshot → mutate → API → rollback on error.
6. **`disconnectedCallback`** on any component that adds document-level listeners or timers. Use a stored bound reference for `addEventListener` / `removeEventListener`.
7. **Template caching** in Web Components: store the **Promise** (`static templateCache = Promise.all([fetch(html), fetch(css)])`), not the resolved value. Otherwise N component instances trigger N parallel fetches on cold start.
8. **Shared client utilities** belong in `public/js/utils.js`. Shared constants in `public/js/constants.js`. Never copy across modules.
9. **Server/client duplications** (e.g., `getWeekNumber`, `toCamelCase` copied into `server.js` because Node can't import ES modules from `public/`) must carry the JSDoc comment: `Source of truth: /public/js/<file>.js`.
10. **Map lookups in loops.** When iterating one list and looking up items from another inside the loop, build a `Map` first. No `.find()` per iteration.
11. **Race-condition lock on concurrent ops.** `moveTask` uses the `isMoving` flag with `try/finally`. Follow the same pattern for any other rapid async op.
12. **Backlog column is permanent and hidden from Board Configuration.** Never let a user delete it; server enforces a 400. There is exactly one per profile.

---

## Where to look for what

| Task | Start with |
|---|---|
| Add / change a feature | [SPEC.md](SPEC.md) → relevant section. Then bump CHANGELOG. |
| Touch a Web Component | [docs/design/COMPONENT_CATALOG.md](docs/design/COMPONENT_CATALOG.md) (its states + events) → the component's own files in `public/components/<name>/`. |
| Add a new API endpoint | [SPEC.md § API Endpoints](SPEC.md#api-endpoints) (mirror existing shape: rate-limit middleware, input validation, log entries). |
| Change task / column / epic data model | [SPEC.md § Data Models](SPEC.md#data-models). Mind backward-compat with existing `data/` files. |
| CSS / visual change | [docs/design/DESIGN_BRIEF.md § Current Design Tokens](docs/design/DESIGN_BRIEF.md) for the live tokens. Use `var(--...)`; don't hardcode hex. |
| Dark mode work | [docs/design/DESIGN_BRIEF.md](docs/design/DESIGN_BRIEF.md) is the spec. Not yet implemented. |
| Adding a deferred / nice-to-have idea | [FUTURE.md](FUTURE.md). |
| Why something exists / is named oddly | [CHANGELOG.md](CHANGELOG.md) — search for the feature name. |
| Product direction / taste call | [VISION.md](VISION.md). |

---

## What's currently built

All 6 planned pages have shipped:

| Page | Route | Shipped |
|---|---|---|
| Board | `/:alias` | v1.0 |
| Dashboard | `/:alias/dashboard` | v2.34.0 |
| Backlog | `/:alias/backlog` | v2.33.0 |
| Archive | `/:alias/archive` | v2.32.0 |
| Reports | `/:alias/reports` | v2.36.0 |
| AI Assistant | `/:alias/ai` | v2.35.0 |
| Configuration | `/:alias/config` | v2.37.0 |

Backend includes: optimistic UI, rate limiting, input validation, race-condition lock, AI provider abstraction (Anthropic + OpenAI-compatible), 146 tests via `node:test`.

**Not yet built:** dark mode (designed, not implemented), streaming AI responses, drag-resize handle between AI chat/staged sections.

---

## House style for agent output

- **Match existing patterns.** Copy from a neighbouring component or module before inventing. The codebase is consistent on purpose.
- **No new dependencies.** The project has **zero npm deps** as of v2.38.0 — `mini-server.js` is a hand-written Express-compatible shim over Node's built-in `http`. Don't suggest adding Express, a test runner, a CSS preprocessor, or a bundler — they were deliberately rejected.
- **No frameworks.** This is a stake-in-the-ground choice. Don't propose React/Vue/Svelte/etc.
- **Extending `mini-server.js`** is fine when a route needs something the shim doesn't expose (e.g., `req.query` — it's set but undocumented). Keep additions small and match the existing API shape so swapping back to real Express remains theoretically possible.
- **Edit, don't add.** Prefer editing an existing file to creating a new one. Especially: don't create new markdown docs unless explicitly asked.
- **Commit only when asked.** Always create new commits — never `--amend` or `git push --force` without explicit instruction.
- **Update CHANGELOG when shipping.** One row, newest first, matching the existing terse single-sentence style.
- **Update SPEC.md when behavior changes.** Edit it in the same change; don't leave doc drift for later.

---

If something here is wrong, fix it in the same PR as the work that proved it wrong.
