# Vision

**Last updated:** 2026-06-12

This is the strategic doc — what the product is trying to be, for whom, and why. Implementation details live in [SPEC.md](SPEC.md). Version history lives in [CHANGELOG.md](CHANGELOG.md).

**Altitude rule:** this document states intent and principles, never implementation specifics (component behavior, modal lists, pixel values). Those live in SPEC.md, which is updated with every code change. This split exists because implementation details written here go stale silently — the navigation section below described a component that had been redesigned months before anyone noticed.

---

## What this product is

A clean, self-hosted, open-source personal task management tool. No account, no cloud, no noise. Runs locally in the browser as your homepage. The board is where you start every day.

**Core principles:**
- The board is always the center. Everything else orbits it.
- Promote, don't push. Tasks move forward intentionally.
- No friction for the common case. Settings exist but stay out of the way.
- Local and private by default. Your data, your machine.

---

## Target audience

**Who this is for:**
- Developers, designers, video editors, freelancers, indie makers.
- Professionals technically confident enough to run a terminal command — but who don't want their productivity tool to feel like a developer tool.
- Privacy-first people: self-hosters, GDPR-aware users, people who run their own Bitwarden, Nextcloud, or Plex and distrust big tech with their data.
- People frustrated by Jira's complexity and Trello's shallowness — they want something in between.
- People who use their browser new tab as a daily workspace (existing market — Momentum, Tabliss — but none with a proper kanban).
- Solo workers, not teams. This is a personal tool, not a collaboration platform.

**What they have in common:**
- They have taste. They use Linear, VS Code, Obsidian, Raycast, Things 3. They notice when a tool feels cheap or inconsistent.
- They are busy. They want the common case to require zero clicks.
- They want to own their data. "No account required" is a feature, not a limitation.

**The browser-homepage angle is the strongest differentiator.** This is a tool you look at 8 hours a day. It has to earn that screen time.

---

## Task lifecycle

Three tiers, forward by default:

```
AI Staging  →  Backlog  →  Board
(proposed)     (planned)   (active)
```

- **AI Staging** — tasks generated from unstructured text (meeting minutes, notes). You didn't create these manually; review, edit, discard, or promote them.
- **Backlog** — tasks you've decided to build, but not now. Out of sight, out of mind, but not forgotten.
- **Board** — tasks you're actively working on. The only view that demands your attention daily.

**"Promote"** is the concept for moving a task forward — tasks advance intentionally, they are never pushed:
- Promote from AI Staging → Backlog or Board
- Promote from Backlog → Board (always lands in first column)

**One deliberate exception:** a board task can be sent back to the Backlog (the edit modal's "Backlog" action). Plans change; a task that turned out to be "not now" shouldn't have to be deleted and recreated. Demotion is an escape hatch, not a workflow — there is no demotion *into* AI Staging, ever.

---

## Design philosophy: Functional Calm

Restraint over decoration. Every visual element earns its place. The interface should feel like a clean physical workspace — not a packed dashboard, not a toy, not a corporate product.

**Currently shipping:** light mode only. Token system uses `--color-*`, `--radius-*`, `--shadow-*` on `:root` with legacy aliases for migration. System font stack, no Google Fonts, 1px borders, 6px radius, `#f8f9fa` page bg, white cards.

**Next major design milestone — dark mode as primary.** The "Functional Calm" target is a dark-first product, not a light product with a dark toggle. The target audience defaults to dark. Light mode will be a first-class alternative, not an afterthought. The design hire engagement in [docs/design/](docs/design/) is scoped to deliver this.

**Colour is semantic, not decorative.**
- Colour = epic (the 20-colour palette already in the system).
- A single marker (dot or star) = priority.
- Column position = status.
- Nothing else gets colour. No gradient backgrounds, no coloured section headers, no decorative splashes.

**Typography:** one typeface, two weights. Humanist sans-serif (Inter, Geist, or system stack). Legible at small sizes, personality-neutral. Not monospace — that signals code editor, not personal workspace.

**Backgrounds:** warm or cool dark neutrals, not pure black. `#111–#131318` range feels intentional for long sessions. Pure `#000` is harsh. Pure `#fff` in light mode is equally harsh.

**Cards:** defined by a `1px` border on a slightly lighter surface — not heavy drop shadows. Subtle elevation, not visual noise.

**Spacing:** consistent 8px grid throughout. Generous whitespace. The board should breathe.

**What to avoid:**
- Glassmorphism — trendy, ages quickly, has performance cost.
- Neumorphism — accessibility problems, already dated.
- Heavy rounded corners everywhere — reads as consumer/playful, wrong audience.
- Coloured sidebars or section headers — reads as enterprise, wrong audience.
- Gradient backgrounds — decorative, not functional.

**Calibration reference:** Linear.app — not to copy it, but as a benchmark for the level of craft and restraint the target audience expects.

---

## Navigation model

**Principle: navigation stays out of the board's way.** The board is the center; getting anywhere else must cost one click and near-zero screen space. Navigation is present on every page and never competes with content for attention.

Six destinations: Board (home), Dashboard, Backlog, Archive, Reports, AI — plus Configuration via the gear icon. (Exact component behavior and routes live in [SPEC.md § Navigation & Routing](SPEC.md).)

### Configuration
A dedicated full page (not modals), reached from the navigation. Settings used to be a submenu of modals; that pattern was replaced in v2.37.0 because too much per-feature state was hidden three clicks deep. The board's top bar carries only contextual toggles (privacy, snooze) plus the profile selector — all global settings live in the config page.

---

## What stays the same

- Vanilla JS, no framework, no build step.
- Local, self-hosted, **zero dependencies beyond Node itself** (Express was replaced by a hand-written shim in v2.38.0 — clone and run, no `npm install`).
- Board is always the default/home view.
- Profile system unchanged — all pages are profile-scoped.
- Existing features (daily checklist, notes widget, privacy toggle, snooze) remain on the Board page.
- Data models for tasks, epics, categories, columns, profiles, reports stay intact.

---

## Name candidates

No final decision. Under active consideration:

| Name       | Notes                                                               |
|------------|---------------------------------------------------------------------|
| Helm       | Control center metaphor. Short, memorable. Dashboard aligns well.   |
| Folio      | Personal work portfolio. Quiet, professional.                       |
| Meridian   | Distinctive. Unlikely to conflict with existing products.           |
| Chalk      | Clean slate, board metaphor. Minimal.                               |
| Chalk Lite | Variation on Chalk. Explicitly signals lightweight nature.          |
| Quadro     | Four-sided (kanban). Clean, professional. Mild Italian/design feel. |
| Groundwork | Backlog/planning metaphor. "Laying the groundwork."                 |
| Perch      | Where you observe everything from. Calm, personal.                  |
| Locus      | Latin: "the place." The center of your work. Short.                 |
