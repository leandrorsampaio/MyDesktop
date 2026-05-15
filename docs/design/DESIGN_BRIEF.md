# Design System Brief

## Project Summary

Self-hosted personal kanban task tracker. Runs locally as a browser homepage (new tab page). No account, no cloud, no external dependencies. Single user, local only. Target: replace Trello/Jira for solo professionals.

Stack: Vanilla JS + Web Components (Shadow DOM) + Node.js/Express. No framework, no build tools. All styling is vanilla CSS with BEM naming. Components use Shadow DOM so global CSS does not pierce into them — each component has its own `.css` file injected into its shadow root.

**Current state:** functional but visually inconsistent, layout bugs, does not match the intended design vision. Needs a complete visual redesign.

---

## Target Audience

- Developers, designers, video editors, freelancers, indie makers
- Technically confident (can run a terminal command) but don't want the tool to feel like a developer tool
- Privacy-first self-hosters (run their own Bitwarden, Nextcloud, Plex)
- Solo workers, not teams — personal tool, not collaboration platform
- Use their browser new tab as a daily workspace (like Momentum/Tabliss but with a real kanban)

**Taste calibration:** These users use Linear, VS Code, Obsidian, Raycast, Things 3. They notice when a tool feels cheap or inconsistent. Linear.app is the craft/restraint benchmark — not to copy, but as a reference for the level of quality expected.

**Key insight:** This tool is visible 8+ hours/day as a browser homepage. It must earn that screen time through visual quality and calm.

---

## Design Philosophy: "Functional Calm"

Restraint over decoration. Every visual element earns its place. Clean physical workspace feel — not a packed dashboard, not a toy, not a corporate product.

### Rules

| Rule | Detail |
|------|--------|
| Dark mode is primary | Light mode is first-class alternative. Default = light, auto-switches to dark if user OS preference is dark (`prefers-color-scheme: dark`) |
| Colour is semantic only | Epic colours (20-palette) + priority indicator. Nothing else gets colour. No gradient backgrounds, no coloured section headers |
| Typography | One typeface, two weights. Humanist sans-serif. Web-safe fonts preferred to avoid external dependencies, but open to discussion if a hosted font (Inter, Geist) significantly improves quality |
| Backgrounds | Dark mode: warm/cool dark neutrals (#111–#131318 range). Light mode: not pure #fff — slightly warm/cool off-white. Pure black and pure white are harsh for long sessions |
| Cards | 1px border on slightly lighter surface. Subtle elevation, not heavy drop shadows |
| Spacing | 8px grid. Generous whitespace. The board should breathe |

### Avoid

- Glassmorphism (ages fast, performance cost)
- Neumorphism (accessibility problems, dated)
- Heavy rounded corners everywhere (reads consumer/playful — wrong audience)
- Coloured sidebars or section headers (reads enterprise — wrong audience)
- Gradient backgrounds (decorative, not functional)
- Heavy drop shadows (visual noise)
- Google Fonts if avoidable (dependency concern)

---

## Application Structure

### Navigation Model

Sidebar navigation (left, slide-over overlay). Closed by default. Opens on button click. Closes on backdrop click or Escape. No "always open" mode — board gets full screen width.

6 destinations + a dedicated config page:

| # | Page | URL Pattern | Status |
|---|------|-------------|--------|
| 1 | Board | `/:alias` | Built (default/home) |
| 2 | Dashboard | `/:alias/dashboard` | Built |
| 3 | Backlog | `/:alias/backlog` | Built |
| 4 | Archive | `/:alias/archive` | Built |
| 5 | Reports | `/:alias/reports` | Built |
| 6 | AI Assistant | `/:alias/ai` | Built |
| — | Configuration | `/:alias/config` | Built (full page; replaced sidebar config submenu in v2.37.0) |

Configuration page sections (left tabs, right content panel):
- Columns (CRUD + drag-reorder)
- Epics (CRUD with color picker)
- Categories (CRUD with icon picker)
- General Settings (visibility toggles, snooze mode, deadline thresholds)
- Daily Checklist (item editor)
- AI Configuration (provider, model, API key)
- Profiles (CRUD with color/letters picker, default toggle)

Generate Report is now a FAB on the Reports page, not a config action. The sidebar gear icon is a nav link to the config page, no popover submenu.

### Global Header

Fixed top bar across all pages:
- Left: sidebar trigger button + welcome message (greeting + date/weekday/week number)
- Right: board toolbar (filters, toggles — board page only) + profile selector (avatar + dropdown)

### Page Layout Patterns

**Board page:** header + 2-column grid (left sidebar with checklist/notes, right kanban columns)
**List pages** (archive, backlog, AI): header + full-width list (sortable header + rows)
**Dashboard:** header + full-width grid of stat cards, progress sections, deadline groups
**Reports (planned):** header + split panel (list left, detail right)

---

## Task Lifecycle

Three tiers, one direction:

```
AI Staging → Backlog → Board
(proposed)   (planned)  (active)
```

- AI Staging: AI-proposed tasks from unstructured text. Review, edit, discard, or promote.
- Backlog: planned but not active. Out of sight, out of mind.
- Board: active work. Kanban columns with drag-and-drop.

"Promote" = move forward. Promote from AI Staging → Backlog. Promote from Backlog → Board (first column).

---

## Profile System

Multiple profiles (max 20). Each profile has: name, colour (from 20-palette), 1-3 letter avatar, alias (URL segment). All data is profile-scoped. Profiles are switched via a dropdown in the header. The profile avatar is a coloured circle with the profile letters.

---

## Data Entities

### Task
Fields: title, description (optional), priority (boolean), category (ID), epic (ID or null), status (column ID), position (sort order), deadline (datetime or null), snoozeUntil (datetime or null), log (activity array), createdDate.

### Epic
Fields: name, colour (hex from 20-colour fixed palette). Visual: inline pill badge with tinted background (rgba of epic colour at 12% opacity) + solid epic colour text.

20 epic colours: Ruby Red (#E74C3C), Coral (#FF6F61), Tangerine (#E67E22), Amber (#F5A623), Sunflower (#F1C40F), Lime (#A8D84E), Emerald (#2ECC71), Jade (#00B894), Teal (#1ABC9C), Cyan (#00CEC9), Sky Blue (#54A0FF), Ocean (#2E86DE), Royal Blue (#3742FA), Indigo (#5758BB), Purple (#8E44AD), Orchid (#B24BDB), Magenta (#E84393), Rose (#FD79A8), Slate (#636E72), Charcoal (#2D3436).

### Category
Fields: name, icon (SVG icon name). Max 20 per profile. Category 1 ("Non categorized") cannot be deleted. Badge hidden when category = 1.

### Column
Fields: name, order (0-based), hasArchive (boolean), isBacklog (boolean). Max 15 per profile. First column (order 0) is default for new tasks. Backlog column is permanent/hidden from board.

Default columns: To Do, Waiting, In Progress, Done + Backlog (hidden).

---

## Current Design Tokens

These are the CURRENT values — the designer should replace them entirely.

```css
/* Colours (light mode only — no dark mode exists yet) */
--color-bg-primary: #ffffff      /* cards, modals */
--color-bg-secondary: #f8f9fa    /* page background */
--color-bg-tertiary: #f3f4f6     /* hover, secondary surfaces */
--color-border: #e5e7eb          /* all borders */
--color-text-primary: #111827
--color-text-secondary: #4b5563
--color-text-tertiary: #9ca3af
--color-accent-primary: #1a73e8  /* buttons, links */
--color-accent-primary-hover: #1557b0
--color-accent-success: #10b981
--color-accent-error: #ef4444
--color-accent-warning: #f59e0b

/* Radius */
--radius-sm: 4px
--radius-md: 6px
--radius-lg: 8px

/* Shadows */
--shadow-sm: 0 1px 3px rgba(0,0,0,0.08)
--shadow-md: 0 4px 12px rgba(0,0,0,0.1)

/* Typography — family */
--font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif

/* Typography — size scale (derived from values in actual use) */
--text-xs:   10px  /* badges, micro-labels */
--text-sm:   11px  /* small labels (toolbar, column titles) */
--text-base: 12px  /* secondary body */
--text-md:   13px  /* body default — most-used */
--text-lg:   14px  /* slightly larger body */
--text-xl:   16px  /* section headers */
--text-2xl:  18px
--text-3xl:  22px
--text-4xl:  24px  /* page titles */

/* Typography — weight */
--font-weight-regular:  400
--font-weight-medium:   500
--font-weight-semibold: 600
--font-weight-bold:     700

/* Spacing — loose 8px grid */
--space-2:   2px
--space-4:   4px
--space-6:   6px
--space-8:   8px
--space-10: 10px
--space-12: 12px
--space-16: 16px
--space-20: 20px
--space-24: 24px
--space-32: 32px
--space-40: 40px
--space-48: 48px
--space-64: 64px
```

**Note**: 14 raw-px declarations remain across the 14 component CSS files where the value is off the scale (e.g., `padding: 7px 12px`, `padding: 10px 18px`, `padding: 12px 14px 14px 14px`). These are intentional one-offs. The designer can either fold those values into the scale or rewrite the affected components.

### Current Responsive Breakpoints

| Viewport | Behaviour |
|----------|-----------|
| >= 2000px | Full layout, 560px sidebar, 28px column gaps |
| 1400-1999px | Compact, 560px sidebar, 16px gaps, smaller fonts |
| < 1400px | Sidebar stacks above kanban, 2-column grid |
| < 768px | Single column kanban |

---

## Technical Constraints for the Designer

1. **Shadow DOM isolation**: each Web Component has its own CSS scope. Global CSS custom properties (`:root` vars) inherit through Shadow DOM boundaries. Classes, element selectors, and IDs do NOT cross Shadow DOM.
2. **CSS custom properties are the bridge**: the design system must be expressed as CSS custom properties on `:root`. Components read these vars inside their shadow roots.
3. **Dark/light mode switching**: must be achievable by swapping CSS custom property values. Recommended: `[data-theme="dark"]` on `<html>` or `:root` with media query fallback for `prefers-color-scheme`.
4. **No build tools**: no Sass, no PostCSS, no Tailwind. Pure CSS only. CSS nesting is acceptable (modern browser support).
5. **BEM naming convention**: `.blockName__elementName`, `.--modifierName`, `.js-hookName`. CamelCase, not kebab-case.
6. **No external CSS libraries**: everything is hand-written.
7. **Desktop-first, mobile supported**: this is a browser homepage tool. Desktop is primary. Mobile must be functional and well-designed but desktop is the priority.

---

## Scope of Designer Engagement

The designer is expected to:

1. **Replace the visual design entirely** — new colour palette, typography, spacing, elevation, radius system for both dark and light modes
2. **Propose UX improvements** — navigation patterns, interaction flows, layout changes, modal vs inline editing, any improvements to how the user interacts with the tool
3. **Deliver a complete design system** — tokens, component specs, page layouts, state documentation, guidelines for future features
4. **Deliver implementation-ready CSS** — the engineering team will copy the CSS output directly into the codebase

UX proposals that require significant code restructuring will be evaluated separately — the designer should still propose them with a note on complexity.

---

## Deliverables Checklist

### A. Design Tokens (CSS Custom Properties File)

| Token Category | Tokens Needed |
|----------------|---------------|
| Colours | bg-primary, bg-secondary, bg-tertiary, bg-elevated, border, border-subtle, text-primary, text-secondary, text-tertiary, text-inverse, accent-primary, accent-primary-hover, accent-secondary, success, error, warning, info — for BOTH dark and light |
| Typography | font-family, font-size (scale: xs/sm/base/md/lg/xl/2xl), font-weight (regular/medium/semibold/bold), line-height (tight/base/relaxed), letter-spacing (tight/normal/wide) |
| Spacing | Based on 8px grid: 2/4/6/8/12/16/20/24/32/40/48/64px |
| Radius | sm/md/lg/xl/full |
| Shadows | sm/md/lg/xl — for both dark and light (dark mode shadows need different treatment) |
| Z-index | base/dropdown/sticky/overlay/modal/toast |
| Transitions | duration (fast/base/slow), easing (default/in/out/in-out) |

### B. Colour Palette

- Semantic colour mapping document (what colour = what meaning)
- Dark mode palette
- Light mode palette
- Epic colour palette compatibility (20 fixed colours must remain readable on both dark and light backgrounds — the designer may propose adjustments to the epic pill badge rendering but the 20 hex values are fixed)
- Colour contrast verification (WCAG AA minimum)

### C. Typography System

- Font family selection (with rationale)
- Type scale with all sizes, weights, line-heights
- Specific roles: page title, section header, card title, card description, body text, label/caption, badge text, button text, input text, monospace (for code/IDs if needed)

### D. Component Specifications

One spec per component with: anatomy diagram, all visual states, spacing/sizing values, colour token usage.

| # | Component | States to Document |
|---|-----------|-------------------|
| 1 | Task Card | default, hover, dragging, priority (star), with epic pill, with deadline chip (3 urgency levels), with category badge, snoozed (hidden + transparent modes), selected/focus |
| 2 | Kanban Column | default, empty, drop-target (drag-over), with add button, with archive button |
| 3 | Modal Dialog | 3 sizes (small/default/large), open animation, backdrop, close button, action buttons bar |
| 4 | Button | primary, secondary, danger, clone (indigo), backlog (slate), ghost, disabled, hover, active, focus |
| 5 | Form Input | text input, textarea (auto-grow), datetime input — default, focus, error, disabled |
| 6 | Checkbox | checked, unchecked, indeterminate, disabled |
| 7 | Category Pill Selector | grid of pill radio buttons — default, selected, hover |
| 8 | Custom Picker: Colour Grid | 5-column grid of colour swatches — default, selected, disabled (used), hover |
| 9 | Custom Picker: Icon Grid | 7-column grid of icon options — default, selected, hover |
| 10 | Custom Picker: List Dropdown | dropdown list — default, open, item hover, item selected |
| 11 | Toast Notification | 4 variants (success/error/warning/info), stack behaviour, entrance/exit animation, close button |
| 12 | Navigation Sidebar | panel, nav item (default/hover/active), config submenu popover, backdrop, open/close animation |
| 13 | Profile Selector | avatar button, dropdown panel, profile item (default/hover/active), profile avatar (coloured circle + letters) |
| 14 | List Header | sortable column header — default, hover, active sort (asc/desc indicator) |
| 15 | Archive Row | collapsed (header only), expanded (detail panel with description + activity log), hover, restore button |
| 16 | Backlog Row | flat row — default, hover, edit button, promote button |
| 17 | AI Staged Row | flat row — default, hover, 5 action buttons (edit/clone/promote-backlog/promote-board/delete) |
| 18 | Daily Checklist | section header, item (checked/unchecked with strikethrough), optional link icon |
| 19 | Notes Widget | section header, textarea, save status indicator (saving/saved) |
| 20 | Epic Pill Badge | tinted background (rgba of epic colour) + solid text. Must work on both dark and light backgrounds |
| 21 | Priority Indicator | star or dot — visual treatment for priority flag |
| 22 | Deadline Chip | 3 levels: normal (no urgency), warning (approaching), urgent (imminent/overdue) |
| 23 | FAB (Floating Action Button) | default, hover — fixed position bottom-left, for adding tasks on list pages |
| 24 | App Header | layout, sidebar trigger button, welcome text, toolbar area, profile selector area |
| 25 | Board Toolbar | category filter buttons (active/inactive), priority toggle, epic picker, snooze toggle, crisis mode button, privacy toggle |
| 26 | Drag Handle | visual affordance for draggable items (task cards, column reorder items) |

### E. Page Layouts

| # | Page | Layout Description |
|---|------|--------------------|
| 1 | Board | 2-column: left sidebar (checklist + notes, ~300-560px) + right kanban (N columns, scroll horizontal if needed). Toolbar in header area. Columns are equal-width grid. |
| 2 | Dashboard | Full-width. Stats row (4 metric cards). Epic progress section (cards with progress bars). Deadline groups (overdue/soon/this-week). Column load chart. Stale tasks collapsible. No-epic tasks collapsible. |
| 3 | Backlog | Full-width list. Sortable header + flat rows. FAB bottom-left for adding. |
| 4 | Archive | Full-width list. Sortable header + expandable rows. |
| 5 | Reports | Split panel: left list (report titles + dates) + right detail (full report content). Deep-linkable. |
| 6 | AI Assistant | Vertical split: top 55% chat area (messages + input) + bottom 45% staged tasks list (header + rows). |

### F. Interaction & State Specifications

| # | Interaction/State | What to Document |
|---|-------------------|------------------|
| 1 | Drag-and-Drop (cards) | Card lift state, placeholder/ghost, column drop-target highlight, cross-column move animation |
| 2 | Drag-and-Drop (column reorder) | Item lift state, reorder preview, drop indicator |
| 3 | Crisis Mode | What hides (toolbar, done column, non-priority tasks, checklist, notes). What changes visually (border colour, favicon — conceptual only). |
| 4 | Privacy Mode | Blur/mask treatment for text content. What gets masked vs what stays visible. |
| 5 | Snooze States | Hidden mode (card invisible), transparent mode (card at reduced opacity), snooze toggle button state |
| 6 | Filter Active States | Category buttons (multi-select), priority toggle (on/off), epic picker (selected/all) |
| 7 | Empty States | No tasks in column, no tasks on page, no epics, no reports, no staged tasks, no checklist items |
| 8 | Loading States | Skeleton or spinner pattern for async operations |
| 9 | Modal Open/Close | Entrance animation (fade + slide), exit animation, backdrop |
| 10 | Sidebar Open/Close | Slide-in from left, backdrop fade, transition timing |
| 11 | Toast Entrance/Exit | Slide-in from right, stack upward, auto-dismiss, manual close |
| 12 | Inline Editing | Blur-to-save pattern for names/titles in management modals |
| 13 | Form Validation | Error state styling, error message placement |

### G. Documentation & Guidelines

| # | Document | Purpose |
|---|----------|---------|
| 1 | Implementation Guide | How to apply the design tokens to the codebase. CSS architecture notes. How Shadow DOM components consume tokens. BEM naming reference. |
| 2 | Dark/Light Mode Switching | Technical approach for theme switching. Token structure. Media query vs manual toggle. |
| 3 | Future Features Guide | How to style new components, new pages, new modals following the system. Pattern library for common UI patterns. |
| 4 | Animation & Motion Guide | Transition durations, easing curves, what animates and what doesn't. |
| 5 | Accessibility Notes | Contrast ratios (WCAG AA), focus ring styling, keyboard navigation considerations, reduced-motion support. |
| 6 | Responsive Rules | Breakpoints, what collapses/stacks at each breakpoint, minimum supported width. |

### H. Optional / Nice-to-Have

| # | Item | Notes |
|---|------|-------|
| 1 | Favicon Design | Current: plain PNG. Could be improved. Product name not finalised. |
| 2 | Onboarding / First-Run | Empty state for brand-new installation (no profiles, no tasks). |
| 3 | Print Stylesheet | For reports page (low priority). |
