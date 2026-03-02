# Design Prompt — Layout Demo

---

## The Project

I am building a **personal kanban task management tool** designed to run locally in the browser as the user's daily homepage. It is self-hosted, open source, and requires no account, no cloud, and no external services. Everything runs on the user's own machine.

It is not a team tool. It is a solo, personal workspace — the place you open when you start work every day.

**Current features (already built):**
- Kanban board with drag-and-drop columns and task cards
- Task epics (colour-coded groupings that span multiple tasks)
- Task categories (e.g. Development, Planning, Communication)
- Task priority flag
- Deadlines with urgency levels (urgent / warning)
- Snooze tasks until a future date
- Multiple profiles (e.g. Work, Personal) with separate data
- Daily checklist widget
- Notes widget
- Privacy mode (blurs the board in public)
- Crisis mode (highlights only priority tasks)
- Reports (weekly snapshots of the board)
- Archive (completed tasks storage)

**New features being designed now:**
The app is growing beyond a single page. A sidebar navigation is being introduced, replacing the existing hamburger menu. New pages are being added alongside the main board:

1. **Board** — the main kanban view, the default/home page
2. **Dashboard** — epic overview with stats and progress (number of tasks per epic, completed vs total)
3. **Backlog** — a list of future tasks not yet active on the board. Tasks here are "parked" and promoted to the board when the user is ready to work on them
4. **Archive** — full list of all completed/archived tasks, with search and filters, and the ability to restore a task back to the board
5. **Reports** — a proper page view of all weekly reports (replaces a small modal)
6. **AI Assistant** — paste meeting minutes or notes, AI proposes tasks automatically (last to build)

**Task lifecycle (key concept):**
Tasks move in one direction only, using the verb "Promote":
```
AI Staging  →  Backlog  →  Board
(proposed)     (planned)   (active)
```

**Navigation concept:**
- A sidebar on the left side of the screen, containing all page links
- The sidebar is closed by default on the board (to keep the board as clean as possible), but for this demo show it open
- At the bottom of the sidebar: a single "Settings" or "Config" button that opens configuration options (not a separate page)
- The top bar is minimal — page title, a few contextual controls, and a profile chip

---

## Target Audience

- Developers, designers, video editors, freelancers, and indie makers
- People technically confident enough to run a terminal command, but who want their productivity tool to feel personal and calm — not like a developer tool
- Privacy-first users: self-hosters, people who distrust big tech with their personal data, Europeans with strong GDPR awareness
- People frustrated by Jira's complexity and Trello's lack of depth — they want something in between
- People who use their browser's new tab page as a daily workspace
- Solo workers, not teams

They are busy, have taste, and notice when a tool feels inconsistent or cheap. They use tools like Linear, VS Code, Obsidian, Raycast, and Things 3. The interface should earn 8 hours of daily screen time.

---

## The Task

Build a **single HTML file** (HTML + CSS only, no JavaScript, no external libraries or fonts) that demonstrates the full layout of this application.

The goal is to test visual design and layout — not functionality. Nothing needs to work. It is a static mockup.

**What to show:**
- The sidebar open on the left, with all 6 page links and a Settings button at the bottom
- The top bar (minimal)
- The main board view with 4 columns and realistic mock task cards
- A variety of card states: cards with epics, cards without epics, cards with priority, cards with deadlines (urgent and warning), cards in the "done" state

**Rules:**
- Single file, no external dependencies
- No JavaScript
- No external fonts or CDN links — use system fonts only
- Show the sidebar in its open state so the design is visible
- Make it feel like a real product, not a wireframe

---

## Mock Data

Use this data to populate the demo. Do not invent different epics, column names, or categories — use exactly these.

### Columns (in order)
1. To Do
2. In Progress
3. Waiting
4. Done

### Epics
| Name | Colour |
|---|---|
| Website Redesign | #2E86DE |
| Mobile App | #8E44AD |
| Q1 Launch | #2ECC71 |

### Categories
- Development
- Planning
- Communication
- Generic Task

### Tasks

**To Do (4 tasks)**

1. Title: "Define new navigation structure and sidebar layout"
   Epic: Website Redesign | Category: Planning | Priority: yes

2. Title: "Review contract with new supplier before end of quarter"
   Epic: none | Category: Generic Task | Deadline: urgent (Mar 5)

3. Title: "Write API documentation for the authentication endpoints"
   Epic: Mobile App | Category: Development | Deadline: warning (Mar 12)

4. Title: "Set up weekly sync with the design team"
   Epic: none | Category: Communication

**In Progress (3 tasks)**

1. Title: "Redesign task card component with updated visual hierarchy"
   Epic: Website Redesign | Category: Development | Priority: yes

2. Title: "Prepare launch checklist and assign owners to each item"
   Epic: Q1 Launch | Category: Planning | Deadline: urgent (Mar 8)

3. Title: "Migrate schema to support the new column data structure"
   Epic: none | Category: Development

**Waiting (2 tasks)**

1. Title: "Legal review of the updated terms of service document"
   Epic: Q1 Launch | Category: Communication

2. Title: "Client feedback on homepage prototype — awaiting response"
   Epic: none | Category: Communication | Deadline: warning (Mar 15)

**Done (3 tasks)**

1. Title: "Set up CI/CD pipeline for the staging environment"
   Epic: Mobile App | Category: Development

2. Title: "Update project specification with all new planned features"
   Epic: none | Category: Planning

3. Title: "Audit current design system and identify inconsistencies"
   Epic: Website Redesign | Category: Planning

---

## Profile (for the top bar / sidebar)

- Profile name: Work
- Initials: WK
- Profile colour: use any colour you think fits
