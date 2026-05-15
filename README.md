# MyDesktop

A self-hosted personal kanban tracker. Runs locally as a browser homepage. Vanilla JS + Web Components + Node/Express. No framework, no build step, no cloud.

```
http://localhost:3001
```

---

## Daily use

```bash
npm run dev          # node --watch — auto-restarts on file save
node server.js       # one-shot
PORT=4000 node server.js
```

`StartDesktop.command` (macOS) opens the default profile in the browser.

Set `http://localhost:3001` as the browser homepage to land on the board on every new window.

### Where things live
- **Data:** `data/profiles.json` (global) + `data/{alias}/` per profile — `tasks.json`, `archived-tasks.json`, `reports.json`, `notes.json`, `epics.json`, `categories.json`, `ai-staged-tasks.json`.
- **AI config:** `data/ai-config.json` — gitignored. Stores provider, model, API key.
- **Backups:** just copy `data/`.

### Tests
```bash
npm test              # all (API tests need the server running)
npm run test:unit
npm run test:api
```

### Docs (this repo)
- [AGENTS.md](AGENTS.md) — **point any LLM here first** ("read AGENTS.md, then start"). Stack, rules, doc map, in one page.
- [SPEC.md](SPEC.md) — source of truth for the current implementation. Edit on every feature change.
- [VISION.md](VISION.md) — strategic intent, audience, principles, dark-mode plan.
- [CHANGELOG.md](CHANGELOG.md) — one line per shipped version.
- [FUTURE.md](FUTURE.md) — deferred ideas.
- [docs/design/](docs/design/) — live design hire engagement (brief, component catalog, prompts).

---

## About this project

A solo-use kanban built around a single belief: **your daily task tool should live on your machine, in plain JSON, with no account in between**. Designed to replace the "browser new tab page" with a real board you trust enough to look at every morning.

### What's in the app

| Area | Features |
|---|---|
| Workflow | Multi-page app: Board, Dashboard, Backlog, Archive, Reports, AI Assistant, Configuration |
| Lifecycle | `AI Staging → Backlog → Board` — one direction, one verb ("Promote") |
| Profiles | Multiple profile sandboxes (e.g. Work, Personal) with separate data folders, URLs (`/:alias/...`), and colour avatars |
| Tasks | Title, description, priority, category, epic, deadline, snooze-until, activity log |
| Board | Drag-and-drop columns (dynamic per profile, max 15), epic pill, deadline urgency chip, priority star, category badge |
| AI | Paste meeting notes → AI proposes tasks → review in AI Staging → promote to backlog or board. Provider-agnostic (Anthropic, OpenAI, Groq, LM Studio, Ollama, Jan) |
| Reliability | Optimistic UI with rollback, race-condition lock on drag, server-side input validation, DIY rate limiting, 146 tests via `node:test` |

### Architecture in one paragraph

Single Express server on port 3001 serves a single-page app shell at `/:alias/:page`. The client is a flat tree of ES modules (`app.js` wires `state.js` + `api.js` + per-page modules) and ~15 Web Components with Shadow DOM. Each component fetches its own `.html` + `.css` at runtime (cached as a Promise). Profiles are URL-scoped; data is per-profile JSON in `data/{alias}/`. No build tools — open the file, edit, refresh.

For the full file tree, API surface, data models, and code rules, see [SPEC.md](SPEC.md).

### Design philosophy

"Functional Calm" — restraint over decoration. 1px borders, system font, semantic colour (epic colour + priority dot only), 8px grid. Currently light-mode only; dark mode is the next major design milestone. See [VISION.md](VISION.md) and [docs/design/DESIGN_BRIEF.md](docs/design/DESIGN_BRIEF.md).

### Stack

| Layer | Tech |
|---|---|
| Frontend | Vanilla JS (ES modules), CSS, Web Components (Shadow DOM) |
| Backend | Node.js + Express |
| Storage | JSON files |
| Tests | `node:test` (no external test runner) |
| Dependencies | Express only |

### Conventions

- BEM camelCase: `.blockName__elementName`, `.--modifierName`, `.js-hookName`.
- No `alert()` / `confirm()` — use `<modal-dialog>` + toast notifications.
- No `window.fn` exports or inline `onclick` — event delegation only.
- Optimistic UI with rollback for every task operation.
- Server/client function duplications must carry a `// Source of truth: ...` JSDoc.

Full rule list in [SPEC.md § Code Rules](SPEC.md#code-rules).

---

## License

MIT.
