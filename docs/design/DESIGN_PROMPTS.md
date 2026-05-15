# Design AI Prompts

Prompts for working with the design AI specialist. Use in sequence.

---

## PROMPT 1 — Initial Briefing + Discovery

Copy and paste the contents of `DESIGN_BRIEF.md` and `COMPONENT_CATALOG.md` along with this prompt:

---

I'm hiring you as a UI/UX design specialist for a complete visual redesign of a self-hosted personal kanban task tracker. The app currently works but the visual design is inconsistent, has layout bugs, and doesn't match the quality our target audience expects.

I've attached two documents:
- **DESIGN_BRIEF.md** — project context, design philosophy, audience, constraints, and a full deliverables checklist
- **COMPONENT_CATALOG.md** — every component, page layout, interaction pattern, and visual state in the application

Please read both documents thoroughly before responding.

**Your role:** Design a complete design system (dark + light mode) and new layouts for all pages and components. The output must be implementation-ready CSS custom properties and component styles that my engineering team can copy directly into the codebase. You should also propose UX improvements where you see opportunities — we'll evaluate complexity separately, so don't hold back on suggestions.

**Technical constraint reminder:** The app uses Web Components with Shadow DOM. Global CSS custom properties (`:root` vars) inherit through shadow boundaries, but class selectors and element selectors do not. The design system MUST be expressed as CSS custom properties. No Sass, no Tailwind, no build tools. Pure CSS only.

Before we start producing deliverables, I need your input on several design decisions. Please answer the following questions with your recommendation and rationale:

### Typography
1. Can you achieve the level of craft we're targeting (Linear.app benchmark) using only web-safe system fonts (`-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, etc.`)? Or would a hosted font like Inter or Geist make a meaningful difference for this type of product? Consider that our audience values quality but we also want to minimise external dependencies.
2. What type scale do you recommend? We need sizes for: page titles, section headers, card titles, card descriptions, body text, labels/captions, badge text, button text. Propose a scale with specific px/rem values.

### Colour
3. For the dark mode base background: warm neutral (brownish dark, e.g. `#1a1917`) vs cool neutral (bluish dark, e.g. `#131318`) vs true neutral (pure grey, e.g. `#161616`). Which direction best fits "Functional Calm" for a tool used 8+ hours/day?
4. For the light mode base: pure warm off-white (e.g. `#faf9f7`) vs cool off-white (e.g. `#f8f9fb`) vs the current `#f8f9fa`? Same rationale question.
5. The accent colour is currently Google Blue (`#1a73e8`). Should we keep a blue accent, or would a different hue better serve this product's identity? The accent is used for: primary buttons, links, active filter states, focus rings, selected items.
6. The 20 epic colours are fixed hex values (listed in the brief). The epic pill badge renders as `rgba(epicColor, 0.12)` background + solid text. Will this approach work well on both dark and light backgrounds, or do you recommend a different rendering strategy for dark mode?

### Layout
7. The board page currently has a fixed 560px left sidebar (checklist + notes) alongside the kanban columns. On a 1440px laptop, this leaves little room for 4 columns. Do you see a better layout approach? Options might include: collapsible sidebar, bottom panel, overlay panel, or integrating checklist/notes differently.
8. The kanban columns are currently equal-width in a CSS Grid. With 4-5 columns on screen, cards can feel cramped. Would you recommend a minimum column width with horizontal scroll, or a different approach?
9. The navigation sidebar is a slide-over overlay (220px, left). It closes when you navigate. Is this the right pattern for a 6-page app, or would you suggest a different navigation approach (e.g., top tabs, persistent mini sidebar, command palette)?

### Components
10. Task cards currently show: drag handle, title, priority star, description (2-line clamp), category badge, epic pill, deadline chip. That's a lot of information density. Would you recommend a different information hierarchy or progressive disclosure approach?
11. The app has 15+ modals for various CRUD operations. Some (like the task modal with 8+ fields) are getting complex. Would you recommend converting any modals to slide-over panels, inline editing, or dedicated views instead?
12. For the AI Assistant page (vertical split: chat top, staged tasks bottom), is this the best layout? Would side-by-side work better on wide screens?

### UX
13. The app currently has no keyboard shortcuts. What shortcuts would you recommend for the most common actions (add task, open sidebar, navigate pages, move between columns)?
14. Empty states — currently just text messages. Would you recommend illustrated empty states, or is that too decorative for the "Functional Calm" philosophy?
15. The filter system (toolbar buttons) has no visual feedback for "how many tasks match" or "filters are active." Would you recommend a filter indicator pattern?

Please answer each question with your recommendation, brief rationale, and any visual references if helpful. After your answers, we'll align on decisions and then proceed to the first deliverables.

---

## PROMPT 2 — Decision Alignment + First Deliverable

Use after reviewing Prompt 1 answers. Adjust based on the AI's recommendations.

---

Thank you for the analysis. Here are my decisions on each point:

[Fill in your decisions for each of the 15 questions, e.g.:]
- Typography: [your choice]
- Dark mode base: [your choice]
- Light mode base: [your choice]
- Accent colour: [your choice]
- Epic pill rendering: [your choice]
- Board sidebar: [your choice]
- Column width: [your choice]
- Navigation: [your choice]
- Card density: [your choice]
- Modal approach: [your choice]
- AI page layout: [your choice]
- Keyboard shortcuts: [your choice]
- Empty states: [your choice]
- Filter indicators: [your choice]

With these decisions locked, please produce the first deliverable:

**Deliverable A: Design Tokens (CSS Custom Properties)**

Output a complete `:root` CSS block with all tokens for BOTH dark and light themes. Structure:

```css
/* Light theme (default) */
:root { ... }

/* Dark theme */
:root[data-theme="dark"] { ... }

/* Auto-detect OS preference */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { ... }
}
```

Include all token categories from the brief:
- Colours (all semantic roles)
- Typography (family, scale, weights, line-heights, letter-spacing)
- Spacing (8px grid values)
- Radius
- Shadows (different treatment for dark vs light)
- Z-index layers
- Transition durations and easing

Also include legacy aliases that map old variable names to new tokens (see the current `:root` block in DESIGN_BRIEF.md), so existing code continues working during migration.

---

## PROMPT 3 — Component Styles (Core)

---

Now produce CSS for the core components. For each component, output the complete CSS that would go inside its Shadow DOM stylesheet. Use the design tokens defined in Deliverable A via `var(--token-name)`.

**Batch 1 — highest priority:**

1. **Task Card** (`task-card.css`) — all states: default, hover, dragging, priority, epic bar, deadline chips (3 levels), category badge, snoozed (hidden + transparent), filter-hidden. This is the most visible element in the app.

2. **Kanban Column** (`kanban-column.css`) — default, empty, drop-target. Include `::slotted()` rules for the Add and Archive buttons.

3. **Modal Dialog** (`modal-dialog.css`) — 3 sizes, backdrop, open/close animation, header, close button, body.

4. **Button** (`button.css`) — all modifier variants (save, clone, backlog, delete, default), hover, active, focus, disabled.

5. **Toast Notification** (`toast-notification.css`) — 4 variants, stack behaviour, entrance/exit animation.

For each component, add a brief comment block at the top explaining the design decisions (e.g., "Cards use 1px border instead of shadow for hierarchy" or "Toast enters from right to avoid covering sidebar").

---

## PROMPT 4 — Component Styles (Secondary)

---

Continue with the next batch of component CSS:

**Batch 2:**

6. **Navigation Sidebar** (`nav-sidebar.css`) — panel, nav items (all states), config submenu, backdrop, open/close animation.

7. **Profile Selector** (`profile-selector.css`) — avatar button, dropdown, items (all states).

8. **Daily Checklist** (`daily-checklist.css`) — section header, items (checked/unchecked), link icon.

9. **Notes Widget** (`notes-widget.css`) — header, status indicator, textarea (all states).

10. **App Welcome** (`app-welcome.css`) — title, date info subtitle.

11. **Custom Picker** (`custom-picker.css`) — all 3 modes: colour grid (5 cols, selected, disabled), icon grid (7 cols, selected), list dropdown (open, item states, compact variant).

12. **List Header** (`list-header.css`) — column headers, sort indicators (asc/desc), hover.

13. **Archive Row** (`archive-row.css`) — collapsed header, expanded detail panel, hover, restore button, chevron rotation.

14. **Backlog Row** (`backlog-row.css`) — flat row, edit/promote buttons.

15. **AI Staged Row** (`ai-staged-row.css`) — flat row, 5 action buttons with different hover states.

---

## PROMPT 5 — Page Layouts + Global Styles

---

Now produce the global stylesheet (`styles.css`) covering:

1. **CSS Reset / Base styles** — box-sizing, margin reset, base typography
2. **App Header** — layout, sidebar button, toolbar area
3. **Board Toolbar** — filter buttons, toggle states, epic picker area
4. **Board Page layout** — `.appContainer` grid (sidebar + kanban), responsive breakpoints
5. **Kanban grid** — column layout, gaps, responsive behaviour
6. **Left sidebar** — checklist + notes panel, spacing
7. **Page view container** — `.pageView` and `.pageView.--fullPage` variants
8. **Dashboard page** — stat cards, epic progress bars, deadline groups, collapsible sections, column load bars
9. **Backlog page** — list layout, FAB positioning
10. **Archive page** — list layout
11. **AI Assistant page** — split layout (chat + staged), message bubbles (user/AI/thinking), input area, model selector
12. **Reports page** — split panel (list + detail)
13. **Crisis mode** — `.--crisisMode` overrides (what hides, visual indicators)
14. **Privacy mode** — `.--privacyMode` blur treatment
15. **Form elements** — inputs, textareas, checkboxes, category pill selector, datetime inputs, quick buttons, schedule sections, log display
16. **Confirmation dialogs** — message + button layout inside small modals
17. **Management modals** — CRUD list pattern (add form + item list with inline editing)
18. **Empty states** — consistent pattern for all empty contexts
19. **Responsive breakpoints** — all breakpoint rules

Include all responsive breakpoints. Desktop-first, but mobile must be functional.

---

## PROMPT 6 — UX Improvement Proposals

---

Based on everything you've seen in the component catalog and design brief, please propose UX improvements. For each proposal:

- **What:** clear description of the change
- **Why:** what problem it solves or what it improves
- **Complexity:** Low (CSS only) / Medium (minor JS changes) / High (significant restructuring)
- **Priority:** Must-have / Nice-to-have / Future consideration
- **Visual sketch:** describe the before/after visually, or provide CSS if it's a CSS-only change

Areas to cover:
1. Navigation and wayfinding
2. Task creation and editing flow
3. Board layout and card density
4. Information hierarchy on cards
5. Filter discoverability and feedback
6. Modal fatigue (too many modals?)
7. Keyboard-driven workflows
8. First-run experience (new user, empty board)
9. Mobile-specific adaptations
10. Micro-interactions and transitions that add polish
11. Any anti-patterns you noticed in the current design

---

## PROMPT 7 — Documentation + Implementation Guide

---

Please produce the final documentation deliverables:

### 1. Implementation Guide
How the engineering team should apply this design system to the codebase:
- File structure (which tokens go where)
- How to add the dark/light theme switcher (JS + CSS)
- How Shadow DOM components consume design tokens
- Migration path from current styles to new system (what to change, what order)
- BEM naming conventions to follow

### 2. Dark/Light Mode Technical Spec
- Token structure for theme switching
- `data-theme` attribute approach vs `prefers-color-scheme` media query
- How to persist user preference in localStorage
- Edge cases: epic colours on both backgrounds, toast contrast, modal backdrop

### 3. Future Features Guide
Pattern library for adding new features consistently:
- How to style a new page
- How to style a new modal
- How to style a new list row component
- How to style a new card variant
- How to add a new colour role
- How to add a new button variant

### 4. Animation & Motion Guide
- Which elements animate (modals, toasts, sidebar, card hover, drag)
- Duration standards (fast: 100ms, base: 200ms, slow: 300ms)
- Easing functions
- `prefers-reduced-motion` support

### 5. Accessibility Checklist
- Contrast ratios for all text/bg combinations (WCAG AA)
- Focus ring styling (visible, consistent)
- Keyboard navigation paths
- `prefers-reduced-motion` and `prefers-contrast` support
- Screen reader considerations for drag-and-drop, custom pickers, toasts

---

## PROMPT 8 — Review & Polish (Final)

---

We're in the final review phase. Please review all CSS you've produced and check for:

1. **Consistency:** Are all components using the same tokens? Any hardcoded colours or sizes that should be tokens?
2. **Dark mode:** Does every component work correctly in dark mode? Pay special attention to: epic pill badges, toast notifications, modal backdrops, form inputs, deadline chips.
3. **Responsive:** Does every page layout work at all breakpoints (>2000px, 1400-1999px, <1400px, <768px)?
4. **Accessibility:** All interactive elements have visible focus states? Contrast ratios pass WCAG AA?
5. **Animation:** All animations respect `prefers-reduced-motion`?
6. **Legacy aliases:** Are all old variable names mapped to new tokens?
7. **Shadow DOM:** Will all styles work correctly inside Shadow DOM? No selectors that depend on parent context outside the shadow root?

Output a final consolidated list of any corrections needed, then provide the corrected CSS blocks.

---

## Tips for Working with the Design AI

- **Always reference the component catalog** when asking for specific component CSS. The AI needs the anatomy and state list to produce accurate output.
- **Ask for one batch at a time.** Don't request all CSS in a single prompt — the output will be too large and quality will drop.
- **Review each batch before moving to the next.** Catch token inconsistencies early.
- **If the AI produces hardcoded values** instead of `var(--token)`, point it out immediately. Everything must use tokens.
- **For complex components** (task card, task modal), consider splitting into sub-prompts: "Now just the deadline chip states" or "Now just the drag-and-drop states."
- **Save each output to a separate file** as you go. Easier to review and merge than one massive file.
- **If you disagree with a design decision**, ask the AI to show 2-3 alternatives with trade-offs before committing.
