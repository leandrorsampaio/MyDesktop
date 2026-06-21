# Future Features

Backlog of nice-to-have features deferred from active development. Review before each planning cycle.

---

## User-created themes
**Added:** 2026-06-20 (after the theming system shipped in v2.41.0)

The theming system uses a flat registry of named themes (`constants.js` `THEMES`, each tagged light/dark) applied via `data-theme` token blocks. Letting *users* create themes was considered and **deliberately not built**: this is a single-user local tool with no theme-sharing ecosystem, a GUI colour editor fights the "Functional Calm / curated" philosophy, and it's a contrast (WCAG) footgun. Power users already have a zero-maintenance escape hatch — add a `[data-theme="mine"]` block to `styles.css` + an entry to `THEMES`.

Only revisit if the product ever becomes multi-user / shareable / gains a theme gallery. A real build would need: themes as **data** (JSON token sets) rather than CSS blocks, a theme editor (name + light/dark flag + the ~12 key colour pickers), a registry/storage layer, runtime token application to `:root`, the FOUC bootstrap reading the active theme's tokens, and contrast validation.

Smaller, safe follow-ups that don't need the editor:
- More curated themes (just another `[data-theme]` block + `THEMES` entry).
- Configurable **Auto** pairing (per profile, pick which theme fills the OS-light vs OS-dark slot — currently fixed to the `light`/`dark` built-ins; VS Code's preferred-light/preferred-dark model).
- `<meta name="theme-color">` synced to the active theme for mobile browser chrome.

---

## Keyboard shortcuts — remaining tiers
**Updated:** 2026-06-12 — Tiers 1–2 SHIPPED in v2.40.0 (`shortcuts.js`): `n` quick-add, `g`-chords for page navigation, `?` cheat-sheet, `j/k/h/l` + arrow card focus, `Enter` to open, `Cmd/Ctrl+←/→` card move (the keyboard drag alternative).

**Still deferred (Tier 3):**
- `Cmd+K` command palette — jump to page, find a task by title, run actions. Highest ceiling, biggest build; do it after the basics prove themselves.
- Single-key actions on the focused card: `p` toggle priority, `s` snooze, `b` send to backlog, `Backspace` delete-with-confirm.
- `n` quick-add on the Backlog page (currently board-only; backlog has its own FAB + submit handler to wire through).

---

## Profile data import
**Added:** 2026-06-12 (counterpart to the export shipped in v2.40.0)

`GET /api/:profile/export` produces a single-JSON bundle; import is deliberately not built yet. A real import needs: `formatVersion` handling, ID-collision strategy (merge vs replace), validation that `task.status` values reference columns present in the bundle, and category/epic referential checks. Until then the restore story is "copy `data/{alias}/` back", documented in the README.

---

## AI Page

### Streaming AI responses
**Deferred from:** v2.35.0 (AI page V1)

Stream the narrative portion of the AI response token-by-token so the chat feels live, instead of waiting for the full response. Tasks are only added to the staged list once the full response (including the tool call) is received and parsed.

**Implementation notes:**
- Use Server-Sent Events (SSE) or chunked Transfer-Encoding from the server endpoint (mini-server exposes the raw Node response, so streaming writes work)
- The `/api/:profile/ai/chat` endpoint switches to a streaming response; the client reads it via `EventSource` or `fetch` with `response.body.getReader()`
- Only the `narrative` text streams; `tasks` are emitted as a final event once the tool call resolves
- Anthropic and OpenAI-compatible providers both support streaming with `stream: true`; the server handles format differences transparently

---

### Drag-resize handle between chat and task sections
**Deferred from:** v2.35.0 (AI page V1)

A draggable horizontal divider between the chat area (top) and the staged-task list (bottom), letting the user set their preferred split. The ratio should be persisted in `localStorage` as `{alias}:aiPageSplit` (a value between 0.2 and 0.8, default 0.55).

**Implementation notes:**
- `mousedown` on the divider element starts a drag; `mousemove` on `document` updates a CSS custom property `--ai-split` on the page container; `mouseup` ends drag
- Use `pointer-events: none` on iframes/embeds during drag to prevent capture issues
- The two sections use `height: calc(var(--ai-split) * 100%)` and `height: calc((1 - var(--ai-split)) * 100%)` respectively
- Min height on each section to prevent collapse (e.g. 120px)
- A double-click on the handle resets to the default 55/45 split
