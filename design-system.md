# Design System

Reference for colors, typography, spacing, and responsive breakpoints. Only relevant when writing CSS.

---

## Colors (CSS Custom Properties)

| Variable           | Value       | Usage                      |
|--------------------|-------------|----------------------------|
| `--bg-color`       | `#F5F1EB`   | Page background            |
| `--text-primary`   | `#2D2D2D`   | Main text                  |
| `--text-secondary` | `#5A5A5A`   | Secondary text             |
| `--text-muted`     | `#8A8A8A`   | Labels, hints              |
| `--text-light`     | `#FFFFFF`   | Text on dark backgrounds   |
| `--text-dark`      | `#2D2D2D`   | Text on light backgrounds  |
| `--accent-color`   | `#C4A484`   | Buttons, highlights        |
| `--accent-hover`   | `#B8956F`   | Button hover states        |
| `--danger-color`   | `#C97065`   | Delete buttons             |
| `--success-color`  | `#7BA37B`   | Save confirmations         |

---

## Typography

- **Font:** Montserrat via Google Fonts CDN (weights: 300, 400, 500, 600, 700)
- **Welcome title:** 28px, weight 300
- **Section headers:** 12px uppercase, letter-spacing 2px, weight 600
- **Task title:** 14px (13px compact), weight 600
- **Task description:** 12px (11px compact), weight 400
- **Body text:** 14–15px, weight 400

---

## Spacing & Borders

- **Border radius:** 10–24px throughout (no sharp corners)
- **No hard borders** — depth conveyed through soft shadows
- **Shadows:** `--shadow-soft` (2px 12px), `--shadow-medium` (4px 20px), `--shadow-card` (2px 8px)
- **Animations:** 0.3s ease for all transitions

---

## Card Color System

Position-based gradients — color is tied to card position within the column, not the task itself.

Each column has 20 gradient levels as CSS custom properties:
- `--todo-gradient-0` … `--todo-gradient-19` — warm red spectrum
- `--wait-gradient-0` … `--wait-gradient-19` — cool blue-gray spectrum
- `--inprogress-gradient-0` … `--inprogress-gradient-19` — teal/green spectrum
- `--done-gradient-0` … `--done-gradient-19` — purple spectrum

**Text color:** Gradients 0–11 (darker) → `.--lightText`. Gradients 12–19 (lighter) → `.--darkText`.
**Assignment:** If column ≤ 20 cards, gradient index = position. If > 20, distributes evenly across the 20 levels.

---

## Responsive Breakpoints

| Viewport                | Behavior                                              |
|-------------------------|-------------------------------------------------------|
| ≥ 2000px (external)     | Full layout, 560px sidebar, 28px column gaps          |
| 1400–1999px (MacBook)   | Compact layout, 560px sidebar, 16px gaps, smaller fonts |
| < 1400px                | Sidebar stacks above kanban, 2-column grid            |
| < 768px                 | Single column kanban                                  |
