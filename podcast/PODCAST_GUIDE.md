# Podcast Production Guide

**Purpose:** This document provides all the context, rules, and parameters for any AI assistant to produce new podcast episodes for this series. Read this file completely before writing any episode.

---

## About the Listener

- **Name:** Leandro
- **Background:** Former CSS specialist (pre-2010), returned to web development in 2025-2026
- **Strengths:** Deep CSS knowledge, learning quickly, built this entire project from scratch
- **Weaknesses:** Backend is new territory, modern JavaScript concepts (hooks, async, modules) are recent learning, no framework experience yet
- **Native language:** Brazilian Portuguese (English at C2 level — fluent but prefers simple, clear vocabulary)
- **Learning goals (priority order):** Salesforce LWC, React, Svelte, Angular
- **Learning style:** Informal, conversational, enjoys Nerdcast (Brazilian podcast) and Office Ladies vibes

---

## The Project Being Discussed

A vanilla JavaScript kanban task tracker — no frameworks, no build tools, ES modules, Web Components with Shadow DOM, Node.js/Express backend, JSON file persistence. Full spec in `projectSpecification.md` at the project root.

### Key Files Reference

| File | Purpose |
|------|---------|
| `server.js` | Express backend — routes, middleware, file I/O, AI provider abstraction |
| `public/index.html` | SPA shell — all modal skeletons, component script imports |
| `public/app.js` | Main entry — DOM refs, init(), event listeners, rendering |
| `public/js/state.js` | Centralized state store — getters, setters, snapshot/rollback |
| `public/js/api.js` | Pure HTTP client — all fetch calls, no side effects |
| `public/js/constants.js` | Shared constants and defaults |
| `public/js/utils.js` | Shared utility functions |
| `public/js/router.js` | Client-side URL parser (31 lines) |
| `public/js/filters.js` | Category/priority/epic filtering |
| `public/js/modals.js` | All modal orchestration logic (~1936 lines) |
| `public/js/crisis-mode.js` | Crisis mode toggle |
| `public/js/board-config.js` | Board configuration modal |
| `public/js/archive-page.js` | Archive page module |
| `public/js/backlog-page.js` | Backlog page module |
| `public/js/dashboard-page.js` | Dashboard page module |
| `public/js/ai-page.js` | AI assistant page module |
| `public/components/*/` | Web Components (task-card, kanban-column, modal-dialog, nav-sidebar, toast-notification, daily-checklist, notes-widget, custom-picker, svg-icon, list-header, archive-row, backlog-row, ai-staged-row) |

### Architecture Patterns to Reference

- **Optimistic UI + rollback** via snapshot/restore in state.js
- **Template caching** with Promise (not resolved value) to prevent duplicate fetches
- **Event delegation** with `js-` prefixed hooks
- **CSS custom property inheritance** through Shadow DOM boundaries
- **Map lookups** (O(1)) instead of `.find()` in loops
- **Lock pattern** (`isMoving`) for race conditions
- **Module architecture** — each file has one responsibility
- **Profile-scoped data** in `data/{alias}/` directories

---

## Seasons Overview

### Season 1: Conceptual Foundation (12 episodes — COMPLETE)
- **Audience context:** Listener is WALKING, NOT at a computer
- **Style:** Solo host, informal, like chatting with a knowledgeable friend
- **Content:** Concepts explained with analogies and mental models, NO code shown
- **Framework comparisons:** Always compare vanilla approach with React, Svelte, Angular, and especially LWC
- **Files:** `episode-s1e01-*` through `episode-s1e12-*`

### Season 2: Code Walkthrough (12 episodes — COMPLETE)
- **Audience context:** Listener is AT THE COMPUTER with files open
- **Style:** Same informal tone, but now says "open this file", "look at line X", "scroll to function Y"
- **Content:** Line-by-line code explanations referencing actual files and line numbers
- **Framework comparisons:** Show equivalent patterns in React/LWC where relevant
- **Files:** `episode-s2e01-*` through `episode-s2e12-*`

### Season 3+: Not yet produced
- See `future-episode-ideas.md` for topic backlog

---

## Episode Production Rules

### Format

```markdown
# [Season] Episode [N]: [Title]

**Duration:** ~[8-10] minutes
**Files to open:** [list if code walkthrough season] OR **Topics:** [list if conceptual season]
**Style:** [Code walkthrough | Conceptual — no computer needed]

---

[Episode body]

---

*Next: [next episode reference]*
```

### Writing Rules

1. **Tone:** Informal, warm, like an old friend who knows a lot about tech. Use "you" directly. Use transitions like "So picture this...", "Here's the thing...", "OK so...", "Let me trace what happens..."

2. **Vocabulary:** Simple, clear, neutral English. Avoid:
   - Archaic or literary words (e.g., "hitherto", "whereupon")
   - Heavy slang or idioms that don't translate well
   - Overly academic language
   - Jargon without immediate explanation

3. **Length:** 1000-1800 words per episode (~8-10 minutes of reading/speaking)

4. **Framework comparisons:** Every episode should include at least one comparison showing how React, Angular, Svelte, or LWC handles the same concept. LWC gets priority because it's Leandro's main target. When LWC uses the same Web Components APIs as the project, highlight that — it's the strongest selling point of his learning path.

5. **No emojis** in the text unless quoting actual code that contains them (like the crisis mode button text).

6. **Code in Season 2+ episodes:** Reference actual file paths and approximate line numbers. Use short inline code snippets (3-10 lines) to illustrate points. Never dump 50 lines of code — explain the important parts and tell the listener where to find the rest.

7. **Season 1 episodes (conceptual):** NO code at all. Use analogies (restaurant, LEGO, whiteboard, assembly line, etc.). The listener is walking and can't see a screen.

8. **Each episode is self-contained.** A listener can start at any episode. Brief callbacks to previous episodes are fine ("remember in Episode 3 we talked about...") but don't assume prior knowledge.

9. **End each episode** with a one-sentence preview of the next topic and a casual sign-off ("Catch you in the next one", "See you there", "See you next time").

10. **Start each episode** with "Hey, welcome back" (or similar casual greeting) and a brief statement of what the episode covers.

### Naming Convention

- Pattern: `episode-s{season}e{episode}-short-title.md`
- Season 1: `episode-s1e01-short-title.md` through `episode-s1e12-short-title.md`
- Season 2: `episode-s2e01-short-title.md` through `episode-s2e12-short-title.md`
- Season 3: `episode-s3e01-short-title.md` etc.
- Keep filenames lowercase, hyphenated, descriptive

### Topics to Always Cover When Relevant

- How the vanilla approach works in THIS project (with specific file/function references)
- What problem the pattern solves
- How React handles it differently
- How LWC handles it (highlight when it's the same as vanilla Web Components)
- Common mistakes or gotchas
- Why the project made this specific design choice

### Topics to Avoid

- Opinions on which framework is "best" — present trade-offs neutrally
- Exact time estimates ("this will take you 2 weeks to learn")
- Deprecated or very old patterns (jQuery, var, callbacks-only)
- Overly deep computer science theory (keep Big O simple, skip proofs)

---

## Updating This Guide

When new seasons are produced:
1. Add the season to the "Seasons Overview" section
2. Update `future-episode-ideas.md` to mark covered topics
3. If the project codebase changes significantly (new files, major refactors), update the "Key Files Reference" table

When the listener's profile changes:
1. Update the "About the Listener" section (e.g., if they learn React, note that)

---

## Quality Checklist (Before Delivering an Episode)

- [ ] Tone is informal and friendly, not academic
- [ ] Vocabulary is accessible to a C2 English speaker
- [ ] At least one framework comparison (preferably LWC)
- [ ] Episode is self-contained — makes sense without prior episodes
- [ ] Correct file paths and approximate line numbers (Season 2+)
- [ ] Length is 1000-1800 words
- [ ] Ends with next-episode preview
- [ ] No emojis (unless quoting code)
- [ ] Filename follows naming convention
