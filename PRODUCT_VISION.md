# Product Vision

**Status:** Draft — under active discussion
**Last Updated:** 2026-03-02

---

## What This Product Is

A clean, self-hosted, open-source personal task management tool. No account, no cloud, no noise. Runs locally in the browser as your homepage. The board is where you start every day.

**Core principles:**
- The board is always the center. Everything else orbits it.
- Promote, don't push. Tasks move forward intentionally.
- No friction for the common case. Settings exist but stay out of the way.
- Local and private by default. Your data, your machine.

---

## Target Audience

**Who this is for:**
- Developers, designers, video editors, freelancers, and indie makers
- Professionals technically confident enough to run a terminal command — but who don't want their productivity tool to feel like a developer tool
- Privacy-first people: self-hosters, GDPR-aware users, people who run their own Bitwarden, Nextcloud, or Plex and distrust big tech with their data
- People frustrated by Jira's complexity and Trello's shallowness — they want something in between
- People who use their browser new tab as a daily workspace (existing market — Momentum, Tabliss — but none with a proper kanban)
- Solo workers, not teams — this is a personal tool, not a collaboration platform

**What they have in common:**
- They have taste. They use Linear, VS Code, Obsidian, Raycast, Things 3. They notice when a tool feels cheap or inconsistent.
- They are busy. They want the common case to require zero clicks.
- They want to own their data. "No account required" is a feature, not a limitation.

**The browser homepage angle is the strongest differentiator.** This is a tool you look at 8 hours a day. It has to earn that screen time.

---

## Visual Design Philosophy

**Style: Functional Calm**

Restraint over decoration. Every visual element earns its place. The interface should feel like a clean physical workspace — not a packed dashboard, not a toy, not a corporate product.

**Dark mode is primary.** Not optional, not an afterthought. The target audience defaults to dark. Light mode is a first-class alternative, not an afterthought.

**Colour is semantic, not decorative.**
- Colour = epic (the 20-colour palette already in the system)
- A single marker (dot or star) = priority
- Column position = status
- Nothing else gets colour. No gradient backgrounds, no coloured section headers, no decorative splashes.

**Typography:** One typeface, two weights. A humanist sans-serif (Inter, Geist, or similar). Legible at small sizes, personality-neutral. Not monospace — that signals code editor, not personal workspace.

**Backgrounds:** Warm or cool dark neutrals, not pure black. `#111`–`#131318` range feels intentional and comfortable for long sessions. Pure `#000` is harsh. Pure `#fff` in light mode is equally harsh.

**Cards:** Defined by a `1px` border on a slightly lighter surface — not heavy drop shadows. Subtle elevation, not visual noise.

**Spacing:** Consistent 8px grid throughout. Generous whitespace. The board should breathe.

**What to avoid:**
- Glassmorphism — trendy, ages quickly, has performance cost
- Neumorphism — accessibility problems, already dated
- Heavy rounded corners everywhere — reads as consumer/playful, wrong audience
- Coloured sidebars or section headers — reads as enterprise, wrong audience
- Gradient backgrounds — decorative, not functional

**Calibration reference:** Linear.app — not to copy it, but as a benchmark for the level of craft and restraint the target audience expects.

---

## The Task Lifecycle

Three tiers, one direction:

```
AI Staging  →  Backlog  →  Board
(proposed)     (planned)   (active)
```

- **AI Staging**: Tasks generated from unstructured text (meeting minutes, notes). You didn't create these manually — review, edit, discard, or promote them.
- **Backlog**: Tasks you've decided to build, but not now. Out of sight, out of mind, but not forgotten.
- **Board**: Tasks you're actively working on. The only view that demands your attention daily.

**"Promote"** is the consistent verb for moving a task forward:
- Promote from AI Staging → Backlog
- Promote from Backlog → Board (always lands in first column, automatically)

---

## Navigation

### Sidebar (left side, slide-over overlay)

Closed by default. Opens on button click. Closes on backdrop click or Escape. **No "always open" mode** — the board gets full screen width at all times. The sidebar is present on every page.

Six destinations:

| # | Page       | URL                  | Description                             |
|---|------------|----------------------|-----------------------------------------|
| 1 | Board      | `/:alias`            | Default. Main kanban view.              |
| 2 | Dashboard  | `/:alias/dashboard`  | Epic overview + task stats.             |
| 3 | Backlog    | `/:alias/backlog`    | Future tasks, not yet active on board.  |
| 4 | Archive    | `/:alias/archive`    | All completed/archived tasks.           |
| 5 | Reports    | `/:alias/reports`    | Full reports view.                      |
| 6 | AI         | `/:alias/ai`         | Meeting minutes → tasks. (last to build)|

### Config button (bottom of sidebar)

Replaces the current hamburger menu. Pinned to the bottom of the sidebar on every page. Opens a settings panel or submenu — these are configuration operations, not destinations. They stay as modals.

Contents:
- Board Configuration (column CRUD + reorder)
- Manage Epics
- Manage Categories
- Manage Profiles
- Edit Daily Checklist
- General Configuration
- Generate Report (action)

The top bar is freed from navigation controls entirely. Existing board-level toggles (privacy, crisis mode, snooze) remain in the top bar as they are contextual to the board view, not global settings.

### Routing

Each page has a dedicated URL (`/:alias/dashboard`, `/:alias/backlog`, etc.). The server serves the same app shell for all `/:alias/*` routes. Client-side JS reads `window.location.pathname` and renders the correct view. This enables multi-tab browser usage — users can right-click any sidebar link and open it in a new tab.

---

## Pages

### Board — `/:alias` (default)

Unchanged from current state. Kanban columns, drag-and-drop, task cards, filters.

- The board **never shows backlog tasks**
- First column is always the default for new tasks and for promotions from backlog
- Daily checklist and notes widget remain here
- Crisis mode and privacy toggle remain here

---

### Dashboard — `/:alias/dashboard`

**Purpose:** Visibility over epic progress and overall task health. The missing layer between individual cards and the full board.

**Content:**
- **Stats row** (top): Total active tasks / Completed this week / In progress / Overdue deadlines
- **Epic cards**: One card per epic showing — name, color band, task count, progress bar (done vs total), expandable task list under that epic
- **No epic section**: Tasks with no epic assigned (separate group at the bottom)

**Not the default landing page.** The user navigates here deliberately when they need a high-level view.

---

### Backlog — `/:alias/backlog`

**Purpose:** Parking lot for future work. Keeps the board free of noise.

**Content:**
- List view (not kanban — order matters less here)
- Each row shows: title, epic, category, priority badge, deadline if set
- Filters: by epic, by category, by priority
- "Add to Backlog" form (same fields as Add Task)
- Each task has: **Promote to Board** button (→ moves to first column) / Edit / Delete

**Implementation concept:** A column with an `isBacklog: true` flag. The board ignores columns with this flag. The backlog page shows only these columns. No new data model — reuses the existing column + task system.

---

### Archive — `/:alias/archive`

**Purpose:** Full view of all completed/archived tasks. Replaces the current cramped modal.

**Content:**
- List view, reverse chronological
- Search by title
- Filter by category, epic, date range
- Read-only (archived tasks are not editable)
- **Restore to Board**: a task can be unarchived and sent back to the first column

---

### Reports — `/:alias/reports`

**Purpose:** Full reports view. Replaces the current modal.

**Content:**
- Left panel: list of all reports (title, week, date generated)
- Right panel: full report content (same rendering as today, just more space)
- Edit report title inline
- Delete report with confirmation
- Report URL could deep-link: `/:alias/reports/:reportId`

---

### AI Assistant — `/:alias/ai` *(last to build)*

**Purpose:** Convert unstructured text into structured tasks automatically.

**Concept:**
1. User pastes raw text (meeting minutes, notes, emails) into an input area
2. AI reads the text and proposes tasks — with title, description, epic (matched from existing epics in the profile), category, deadline, priority
3. User sees proposed tasks in a review list: edit each field, delete, or approve
4. Approved tasks go to **AI Staging** — a held area separate from both backlog and board
5. From AI Staging: **Promote to Backlog** or **Promote to Board** (first column)

**Constraints:**
- User provides their own API key (stored locally, server-side only — never exposed to browser)
- Implementation details deferred until all other features are shipped
- Concept is flexible — open to revision when we get there

---

## What Stays the Same

- Vanilla JS, no framework, no build step
- Local, self-hosted, no external dependencies
- All settings operations remain as modals — they are not pages
- Board is always the default/home view
- Profile system unchanged — all pages are profile-scoped
- Existing features (daily checklist, notes widget, crisis mode, privacy toggle, snooze) remain on the Board page
- Data models for tasks, epics, categories, columns, profiles, reports remain intact

---

## Name Candidates

No final decision. Under active consideration:

| Name       | Notes                                                                 |
|------------|-----------------------------------------------------------------------|
| Helm       | Control center metaphor. Short, memorable. Dashboard aligns well.    |
| Folio      | Personal work portfolio. Quiet, professional.                         |
| Meridian   | Distinctive. Unlikely to conflict with existing products.             |
| Chalk      | Clean slate, board metaphor. Minimal.                                 |
| Chalk Lite | Variation on Chalk. Explicitly signals lightweight nature.            |
| Quadro     | Four-sided (kanban). Clean, professional. Mild Italian/design feel.  |
| Groundwork | Backlog/planning metaphor. "Laying the groundwork."                   |
| Perch      | Where you observe everything from. Calm, personal.                    |
| Locus      | Latin: "the place." The center of your work. Short.                   |

---

## Suggested Build Order

*(To be confirmed before implementation starts)*

1. **Sidebar + routing infrastructure** — prerequisite for everything. Navigation shell, URL routing, gear icon replaces hamburger.
2. **Archive page** — extract existing modal into a page. Low risk, high gain.
3. **Reports page** — same. Existing data, existing rendering, just more space.
4. **Dashboard** — new feature, but uses only existing API data. No data model changes.
5. **Backlog** — introduces the `isBacklog` column flag. Small model change, new page.
6. **AI Assistant** — new integration, most complex. Details TBD after all above are shipped.
