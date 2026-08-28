# AI Assistant — Design Spec

Design intent and build plan for turning the AI page from a text-to-tickets parser into a board-aware assistant.

**Altitude:** this file states intent, data models and phasing. Once a phase ships, its implementation detail moves to [SPEC.md](../../SPEC.md) and this file keeps only the intent. Do not let this document accumulate pixel values or component APIs.

---

## Why

The feature shipped in v2.35.0 and is under-used. Reading the code says why:

1. **It cannot see a single task.** `buildAiSystemPrompt(epics, categories)` injects epic and category *names*. No cards, no columns, no deadlines, no logs, no archive.
2. **It has one verb.** `propose_tasks` is the only tool, and the system prompt orders the model to call it *every turn* — so conversation is structurally impossible.
3. **The conversation evaporates on reload** (in-memory only).
4. **It's a destination.** You must decide to go to `/ai` before it can help.

It is used after meetings because parsing pasted text is the only thing it is built to do.

---

## Principles

- **The board is the centre.** The assistant orbits it, never replaces it. (VISION)
- **Propose, don't apply.** The AI writes to a review buffer. Only a human click reaches the board. One deliberate exception — see Quick Capture.
- **Graceful degradation is a hard requirement.** Every feature here must remain usable with the AI switched off, misconfigured, rate-limited, or unreachable. The AI is an accelerator, never a dependency. See the contract below.
- **No new visual language.** Colour is semantic (epic + priority). The assistant gets no colour, no gradient, no sparkle iconography. It looks like the rest of the app.
- **Zero dependencies.** Vanilla JS, Web Components, `mini-server.js`. No SDK, no vector database, no framework. Unchanged.
- **Memory is a file you can read.** Anything the AI "learns" lives in human-readable, hand-editable JSON. No opaque stores.

---

## Graceful degradation contract

Every phase must satisfy this. It is not a nice-to-have; it is the acceptance criterion.

| Surface | AI unavailable |
|---|---|
| Quick capture | Card is still created with the raw text, unclassified, in the default column. A badge marks it "needs filing". **Capture must never fail.** |
| Assistant dock | Opens, shows history, explains it can't reach the provider, offers a link to config. Input disabled with a reason, never a silent failure. |
| Proposed changes | Existing proposals stay reviewable and applicable — they're plain JSON on disk, not an AI session. |
| Story points | Fully manual. The AI only ever suggests. |
| Epic contexts | Fully manual fields. Neglect alerts degrade to a plain "last activity" date, computed locally. |
| Backlog surfacing | Degrades to local heuristics (age, epic match) with no narrative. |
| Board / all other pages | Entirely unaffected. No AI code on the board's critical path. |

**Rule:** no AI call is ever awaited before rendering something the user asked for.

---

## Data model changes

### Task — story points

```js
points: number|null   // one of 1, 2, 3, 5, 8, 13. null = unestimated
```

Scale is fixed and deliberately short:

| Points | Meaning |
|---|---|
| 1 | Do it now — minutes |
| 2 | Under an hour |
| 3 | Half a day |
| 5 | A day |
| 8 | Approaching too big |
| 13 | One to two days — the ceiling |

**Anything bigger than 13 is not a number, it's a split.** Points exist for splitting and sequencing, not velocity. No burndown, no charts, no per-week reporting — that is team ceremony and this is a single-user tool.

### Epic — context, not just a topic

Epics today are a name and a colour. The pain they were meant to solve is *silo switching*: different stakeholders, different expectations, different conversations. That needs three fields:

```js
stakeholder: string,    // "PM", "boss", "the team", "compliance"
cadence: string,        // "weekly sync", "he asks Mondays", "deadline-driven"
expectations: string    // freeform: what this person needs and when
```

All optional, all hand-editable on the config page, all useful with the AI off.

### New — proposed changes (`ai-proposals.json`, per profile)

Generalises today's `ai-staged-tasks.json` from staged *tasks* to staged *changes*:

```js
{
  id, kind: 'create'|'update'|'move'|'delete',
  taskId,            // null for create
  payload,           // fields to set, or target column+position for move
  reason,            // one line: why the AI proposes this
  createdAt
}
```

Reviewable individually. Applying one runs the same validated API path a human click would.

### New — long-term memory (`ai-memory.json`, per profile)

A short, curated list of durable facts, injected on every call:

```json
[
  { "id": "...", "text": "Solenis = bureaucratic compliance work. Low priority, hard deadlines." },
  { "id": "...", "text": "\"ESB-\" prefix = ecommerce ticket, always epic ECOM." },
  { "id": "...", "text": "My 5 is one focused day. A 13 is the ceiling — bigger gets split." }
]
```

The AI may *propose* entries; the user approves and can edit or delete any of them on the config page. Budget ~1–2k tokens. This is what makes points-sizing and epic conventions compound over time instead of resetting each session.

### New — conversations (`ai-conversations.json`, per profile)

Persisted chat history. Survives restart. Trimmed by age/size, not kept forever.

---

## Board context

A compact snapshot injected into the system prompt. **Never raw JSON** — a terse table costs a fraction of the tokens.

Scope, in order of inclusion:
1. Columns (names, order, which is backlog)
2. Live board cards: title, column, epic, points, priority, deadline, age
3. Backlog: titles + age + epic
4. Epics with their stakeholder/cadence
5. Memory entries

**Not included by default:** the archive, task descriptions, activity logs, attachments. Those load on demand.

Budget check against real data (2026-08): ~34 live cards ≈ 2k tokens. Headroom is not a near-term concern; conversation history will grow faster than the board.

The snapshot is re-sent every message — that is the main cost driver, and the reason the compact format matters from day one. Surface a token/cost readout in the dock so this stays visible.

---

## UX

### The dock

A **right-hand dock** that squeezes the board rather than covering it — during review the board must stay visible and interactive. (The existing rail slide-over covers content with a backdrop; wrong tool here.) Resizable, opens from any page, carries that page's context.

The `/ai` page stays for long paste-a-transcript sessions.

### Empty state — the highest-leverage screen

Not "ask me anything". Suggestions computed from the real board, locally, with no AI call:

- "3 cards haven't moved in 3 weeks → Review them"
- "2 deadlines this week → Plan the week"
- "Nothing in In Progress → Pick today's work"

Each is a fact plus a verb. This is the fix for under-use: rituals, not conversation. These render with the AI offline too — they're computed from local data.

### Quick capture

Keystroke → one line → Enter → gone. Under three seconds, from any page, no dialog to read.

**The one place the propose-first rule is relaxed.** The card is created immediately with the raw text; classification (epic, category, points, destination) settles a second later in the background. Justification: creating a card is reversible and non-destructive, and the real alternative is not "a correctly filed card" but *no card at all*. Misfiled beats missing.

- No confirmation step. A toast — "Added to Today · ECOM" — with undo.
- Auto-filed cards carry a marker so the weekly review can correct them cheaply.
- **Never fails.** See the degradation contract.

### Preview on the board

Proposals appear **inline in the conversation** (reasoning and proposal belong together), with a persistent pending count in the dock header so nothing is lost to scroll.

*Preview* puts the board into a mode — precedent: the privacy-blur board mode — rendering cards **where they would end up**, dashed, with a one-line "moved from Wait" caption and per-card accept/reject on hover. Deletions dashed + struck through. New cards dashed in their target column.

You look at your board as it *would be*, rather than simulating a list of sentences in your head. Dashed borders already mean "not committed yet" in this codebase (pending attachments) — reuse that vocabulary, don't invent a new one.

### Visual rules

- No AI colour, no gradients, no ✨.
- No chat bubbles with tails, no avatars. User message subtly indented; assistant message plain text, full width. The only bordered card in the thread is a proposal block — elevation means interactivity.
- No animated typing dots. A quiet status line ("Reading your board…").
- Not monospace for UI text (VISION rules it out — it signals code editor).
- Design-system buttons only (`.btn` variants / `custom-button`). New components are fine when the pattern is genuinely new, following the existing Web Component conventions (template caching as a Promise, `disconnectedCallback`, `js-` hooks, BEM camelCase).

---

## The assistant's jobs

What it should be *good at*, in rough value order:

1. **Quick capture + classification** — the hallway-conversation problem.
2. **Per-stakeholder status drafts** — "what do I tell the PM about ECOM this week", written from completed cards and their logs. Managing expectations largely *is* writing updates.
3. **Day planning with batching** — group work by epic so you switch context once, not five times.
4. **Neglect alerts** — "SDS hasn't moved in 3 weeks; your team will ask."
5. **Backlog pull + cull** — surface the few worth doing now (especially ones matching this week's context), and the many worth killing.
6. **Splitting** — a 13 becomes three 3s.
7. **Duplicate/overlap detection** — only possible with whole-board vision.
8. **Bulk classification** — the unfiled backlog of epic-less cards, reviewed in one preview pass.

---

## Phasing

| Phase | Contents |
|---|---|
| **1 — Foundation** ✅ shipped v2.46.0 | Board snapshot in the prompt; drop the forced `propose_tasks`; persist conversations; graceful-degradation plumbing; token/cost readout. *The AI can finally see the board.* |
| **2 — Capture** ✅ shipped v2.47.0 | Global quick capture with background classification. Highest single pain. |
| **3 — Model** | Story points + epic contexts (data, config UI, card display). Fully useful with AI off. |
| **4 — Proposals** | `ai-proposals.json`, the review list, apply/reject through validated API paths. |
| **5 — Preview** | Board preview mode with per-card accept/reject. |
| **6 — Dock** | Move the chat into the right-hand dock; board-computed empty state; per-card entry points. |
| **7 — Memory** | `ai-memory.json`, config-page editor, AI-proposed entries. |
| **8 — Polish** | Streaming responses. Moves up if the chosen provider is slow — ten seconds of silence in a persistent dock reads as broken. |

---

## Deliberately not building

- **Auto-apply for destructive verbs.** A board that reorganises itself while you aren't looking destroys trust, and there is no undo. Per-verb trust levels are a possible later refinement — *after* observing which proposals get rubber-stamped, not guessed up front.
- **Velocity, burndown, sprint reporting.** Team ceremony; wrong tool.
- **Agentic multi-step loops / multiple cooperating agents.** Wrong complexity for a local single-user tool.
- **Vector database / embeddings retrieval.** Would break both the zero-dependency rule and the readable-memory principle. Revisit only if a board grows past what a compact snapshot can carry.

---

## Known issue found while scoping

`data/work/tasks.json` holds 186 tasks, of which **152 carry `status: "archived"`** — a status with no matching column. They are invisible on the board but loaded on every fetch, and would bloat the AI snapshot for no benefit. Almost certainly a migration leftover from before `archived-tasks.json` existed. Worth resolving on its own, independently of this feature.
