# Task Tracker - Project Specification Document

**Version:** 1.4.0
**Last Updated:** 2026-01-25

---

## Changelog

| Version | Date       | Changes                                                      |
|---------|------------|--------------------------------------------------------------|
| 1.4.0   | 2026-01-25 | Added editable daily checklist with external links, favicon |
| 1.3.0   | 2026-01-25 | Responsive design for MacBook Pro 14" (1512px) and external monitor (2304px), sidebar width increased to 560px, textarea min-width 500px |
| 1.2.0   | 2026-01-25 | Added welcome header with date/week info, hamburger menu, notes save timestamp, archived tasks modal |
| 1.1.0   | 2026-01-25 | Notes changed from checkbox list to free-form textarea with debounced auto-save |
| 1.0.0   | 2026-01-25 | Initial implementation complete                              |

---

## Project Overview
A local web-based task management tool that serves as a browser homepage. It features a kanban-style board with drag-and-drop functionality to track tasks across different stages of completion, along with note-taking and daily recurring task checklist.

## Technical Stack
- **Frontend:** HTML5, Vanilla CSS, Vanilla JavaScript
- **Backend:** Node.js + Express
- **Server Port:** 3001
- **Data Storage:** JSON files on local filesystem
  - `tasks.json` - Active tasks
  - `archived-tasks.json` - Archived tasks
  - `reports.json` - Generated reports with metadata
  - `notes.json` - User notes (free-form text)
- **Favicon:** `public/favicon.png` (star icon)
- **No external CSS libraries** - all styling must be custom vanilla CSS

## Server Configuration

### Port Assignment
- **Task Tracker:** `http://localhost:3001`
- Note: Port 3000 is already in use by another application

### Backend Structure
- Express.js server
- REST API endpoints for task operations
- Static file serving for HTML/CSS/JS
- JSON file read/write operations

### API Endpoints
```
GET    /api/tasks              - Retrieve all active tasks
POST   /api/tasks              - Create new task
PUT    /api/tasks/:id          - Update existing task
DELETE /api/tasks/:id          - Delete a task
POST   /api/tasks/:id/move     - Move task between columns or reorder within column
POST   /api/archive            - Archive completed tasks and generate report
GET    /api/archived           - Get all archived/completed tasks
GET    /api/reports            - Get list of all reports
GET    /api/reports/:id        - Get specific report
PUT    /api/reports/:id        - Update report title
GET    /api/notes              - Get notes
POST   /api/notes              - Save notes
```

## Design Inspiration

### Visual Style: Clear App-Inspired
The interface should follow the design philosophy of the Clear todo list app:

**Color System:**
- Each task card position has a distinct gradient background color
- Colors should progress through a spectrum within each column (gradient from dark to light)
- **Maximum 20 color gradients per column** (system should adapt if fewer tasks)
- Color is tied to POSITION, not to the task itself
- When tasks are reordered, colors update based on new positions

**Column Color Themes:**
- **To Do:** Warm colors gradient (dark red → light red/orange)
- **Wait:** Cool/muted colors gradient (dark gray/blue → light gray/blue)
- **In Progress:** Energetic colors gradient (dark green/teal → light green/teal)
- **Done:** Calming colors gradient (dark purple/blue → light purple/blue)

**Visual Characteristics:**
- Gradient backgrounds on task cards (not flat colors)
- Smooth color transitions when tasks are reordered
- Clean typography with good contrast against colored backgrounds
- Minimal borders/shadows - let the colors define the spaces
- White/light text on darker gradients, darker text on lighter gradients
- Smooth animations for all interactions

## Layout Structure

### Main Screen Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Welcome, Leandro                                          [≡]  │
│ January 25, 2026 • Saturday • Week 4                            │
├─────────────────────────────────────────────────────────────────┤
│  Left Sidebar          │        Main Kanban Board               │
│  ┌──────────────────┐ │  ┌──────┬──────┬──────┬──────┐        │
│  │ Recurrent Tasks  │ │  │ TODO │ WAIT │ PROG │ DONE │        │
│  │ (Daily Checklist)│ │  │ [+]  │      │      │[Arc] │        │
│  │                  │ │  │      │      │      │      │        │
│  │ ☐ Check email    │ │  │ Card │ Card │ Card │ Card │        │
│  │ ☐ Water plants   │ │  │ Card │ Card │ Card │ Card │        │
│  └──────────────────┘ │  │ Card │      │      │      │        │
│                        │  └──────┴──────┴──────┴──────┘        │
│  ┌──────────────────┐ │                                        │
│  │ Notes    [Saved] │ │  Hamburger Menu [≡]:                   │
│  │          at 2:30 │ │   - View Reports                       │
│  │ ┌──────────────┐ │ │   - All Completed Tasks                │
│  │ │ Free-form    │ │ │                                        │
│  │ │ textarea...  │ │ │                                        │
│  │ └──────────────┘ │ │                                        │
│  └──────────────────┘ │                                        │
└─────────────────────────────────────────────────────────────────┘
```

### Header Bar

**Welcome Section:**
- Displays "Welcome, Leandro" as the main greeting
- Shows current date in format: "January 25, 2026"
- Shows weekday: "Saturday"
- Shows week number: "Week 4"

**Hamburger Menu (≡):**
- Located in top-right corner of header
- Dropdown menu with options:
  - **View Reports:** Opens reports modal
  - **All Completed Tasks:** Opens archived tasks modal
  - **Edit Daily Checklist:** Opens checklist configuration modal
- Menu closes when clicking outside or pressing ESC

### Left Sidebar Components

**1. Recurrent Tasks (Daily Checklist)**
- User-configurable list of daily tasks (editable via hamburger menu)
- Each item can have:
  - Task text (required)
  - External URL (optional) - shown as ↗ icon that opens in new tab
- Simple checkbox interface
- Visual feedback: strike-through text when checked
- **Auto-reset at 6:00 AM daily**
- Checklist configuration stored in localStorage (`checklistConfig`)
- Checked state stored separately and resets daily (`recurrentTasksChecked`)
- Default items:
  - Check email
  - Review calendar
  - Water plants
  - Take vitamins
  - Exercise
  - Read for 30 minutes

**2. Notes Section**
- Free-form textarea for quick notes
- Plain text only (no formatting)
- **Debounced auto-save:** saves 500ms after user stops typing
- Visual save status indicator with timestamp ("Saved at 2:30 PM")
- Save status displayed next to "Notes" title in header
- Persistent storage in `notes.json`
- No date association needed
- Notes are included in reports but NOT cleared after report generation

### Main Kanban Board

**Four Columns:**
1. **To Do** - Tasks that need to be started
   - **[+ Add Task] button** at top of column
2. **Wait** - Tasks that are blocked or waiting on dependencies
3. **In Progress** - Tasks currently being worked on
4. **Done** - Completed tasks
   - **[Archive & Generate Report] button** at top of column

### Task Card Design

```
┌─────────────────────────────────┐
│ ⋮⋮  ★ Task Title          [Edit]│  ← Gradient background
│     Short description...        │     based on position
│                                 │
└─────────────────────────────────┘
```

**Task Card Components:**
- **Drag handle (⋮⋮):** Left side icon for reordering within column
- **Star icon (★):** Displays only if priority is enabled (toggle on/off)
- **Title:** Bold, prominent text
- **Description:** Smaller text below title (first line or truncated)
- **Edit button:** Top-right corner to open edit modal
- **Gradient background:** Color based on position in column

## Data Model

### Task Object Structure
```javascript
{
  id: string,                  // Unique identifier (UUID or timestamp-based)
  title: string,               // Task title (required)
  description: string,         // Detailed description (optional, default: "")
  priority: boolean,           // Priority toggle (true = show star, false = no star)
  status: string,              // "todo" | "wait" | "inprogress" | "done" | "archived"
  position: number,            // Position within the column (0-based index)
  log: array,                  // Activity log entries
  createdDate: string,         // ISO date when task was created
}
```

### Log Entry Structure
```javascript
{
  date: string,               // Date only (YYYY-MM-DD format)
  action: string             // e.g., "Moved from To Do to In Progress"
}
```

**Log Rules:**
- Logs are added ONLY when tasks are moved between columns
- Format: "Moved from [Old Column] to [New Column] on [Date]"
- Date format: "2025-01-25" (no time)
- Manual edits (title, description, priority) are NOT logged

### Notes Data Structure
```javascript
{
  content: string              // Free-form text content
}
```

### Report Data Structure
```javascript
{
  id: string,                    // Unique identifier
  title: string,                 // Default: "Week [N] (Jan 20-25)" - editable
  generatedDate: string,         // ISO datetime
  weekNumber: number,            // Week of the year (e.g., 3)
  dateRange: string,             // "Jan 20-25"
  content: {
    archived: [],                // Tasks that were archived (from Done column)
    inProgress: [],              // Snapshot of In Progress tasks
    waiting: [],                 // Snapshot of Wait tasks
    todo: []                     // Snapshot of To Do tasks
  },
  notes: string                  // Copy of notes content at time of report generation
}
```

**Report Content - Each Task Shows:**
- ID
- Title
- Description

## Core Functionality Requirements

### 1. Add New Task
- **Trigger:** Click [+ Add Task] button above To Do column
- **Action:** Open modal with form
- **Form Fields:**
  - Title (required, text input)
  - Description (optional, textarea)
  - Priority (checkbox/toggle - default: false)
- **Save:** Creates new task with `status: "todo"` and `position` set to end of To Do column
- **Cancel:** Close modal without saving (click outside, close button, or ESC key)

### 2. Edit Task
- **Trigger:** Click [Edit] button on task card
- **Action:** Open modal with pre-filled form
- **Form Fields:**
  - Title (editable)
  - Description (editable)
  - Priority (toggle)
  - **Task Log:** Read-only list showing movement history
  - **Delete Button:** Remove task (with confirmation)
- **Save:** Updates task data
- **Cancel:** Close modal without saving (click outside, close button, or ESC key)

### 3. Move Tasks Between Columns
- **Method:** Drag and drop task card to different column
- **Action:**
  - Update task `status` to new column
  - Update task `position` to end of destination column (or dropped position)
  - Add log entry: "Moved from [Old Column] to [New Column] on [Date]"
  - Recalculate colors for both source and destination columns

### 4. Reorder Tasks Within Column
- **Method:** Drag the **⋮⋮ handle** on left side of task card
- **Action:**
  - Update `position` values for affected tasks
  - Recalculate colors based on new positions
  - **No log entry** for reordering within same column

### 5. Priority Toggle
- **Visual:** Star icon (★) appears on task card when priority is `true`
- **Behavior:** Toggle on/off in task creation/edit modal
- **Purpose:** Visual indicator only - does not affect sorting or color

### 6. Archive & Generate Report
- **Trigger:** Click [Archive & Generate Report] button above Done column
- **Action:**
  1. Collect all tasks with `status: "done"`
  2. Collect current snapshots of all other columns (To Do, Wait, In Progress)
  3. Collect current notes content
  4. Generate report with:
     - Week number (e.g., "Week 3")
     - Date range (e.g., "Jan 20-25")
     - Default title: "Week [N] (Jan 20-25)"
  5. Move all Done tasks to archived status (`status: "archived"`)
  6. Save archived tasks to `archived-tasks.json`
  7. Remove archived tasks from Done column
  8. Save report to `reports.json`
  9. Display success message or show generated report

**Notes Behavior:**
- Notes are included in report as plain text
- Notes are **NOT** cleared after report generation
- Notes persist for next report

### 7. View Reports
- **Trigger:** Click [View Reports] button in left sidebar
- **Action:** Open modal/page showing list of all reports
- **Display:** List of reports with titles and dates
- **Actions:**
  - Click report to view full content
  - Edit report title (inline or in view mode)
- **Report Display Format:**
  ```
  Week 3 (Jan 20-25)

  === Completed Tasks (Archived) ===
  [ID-001] Task Title
  Description: Task description here

  [ID-002] Another Task
  Description: Description here

  === In Progress ===
  [ID-010] Current Task
  Description: Working on this

  === Waiting/Blocked ===
  [ID-020] Blocked Task
  Description: Waiting for X

  === To Do ===
  [ID-030] Upcoming Task
  Description: Need to start

  === Notes ===
  [Plain text notes content displayed here]
  ```

### 8. Notes Management
- **Input:** Free-form textarea
- **Auto-save:** Debounced save (500ms after last keystroke)
- **Visual Feedback:** "Saving..." then "Saved at [time]" status with timestamp
- **Persistence:** Stored in `notes.json` as plain text

### 9. All Completed Tasks (via Hamburger Menu)
- **Trigger:** Click hamburger menu → "All Completed Tasks"
- **Display:** Modal showing all archived tasks
- **Sorting:** Newest completed first (by last log entry date)
- **Task Info Shown:**
  - Priority star (if applicable)
  - Task title
  - Description (truncated to 1 line)
  - Completion date
- **Count:** Total number of completed tasks shown at top
- **Purpose:** Quick reference for all historical completed work

### 10. Daily Recurrent Tasks
- **Hardcoded List:** Defined in code (can be modified by editing source)
- **Reset Time:** 6:00 AM daily
- **Visual Feedback:** Strike-through text when checked
- **No Persistence:** State resets every day
- **Implementation:** Check local time on app load/refresh, reset if past 6 AM and new day

### 11. Color Management
- **Color Assignment:** Based on position index (0-19)
- **Per Column:** Each column has own color gradient scheme (20 shades)
- **Dynamic Update:** When tasks are moved or reordered, recalculate position-based colors
- **Adaptation:** If column has fewer than 20 tasks, distribute colors evenly

## UI/UX Considerations

### Modals
- **Add Task Modal:** Clean form with title, description, priority toggle
- **Edit Task Modal:** Same form + task log display + delete button
- **Reports List Modal:** Scrollable list of reports with edit title functionality
- **Report View:** Full report display (could be same modal or separate view)
- **All Completed Tasks Modal:** Scrollable list of archived tasks (newest first), compact display with small fonts

### Drag and Drop
- **Visual Feedback:**
  - Highlight drop zones when dragging
  - Show placeholder where task will land
  - Smooth animations during drag
- **Drag Handles:**
  - ⋮⋮ icon on left side for reordering within column
  - Entire card draggable for moving between columns

### Buttons & Actions
- **[+ Add Task]:** Prominent button above To Do column
- **[Archive & Generate Report]:** Clear button above Done column
- **[Edit]:** Small button on each task card (top-right)
- **[View Reports]:** Button in left sidebar
- **Delete Task:** Inside edit modal with confirmation dialog

### Animations
- Smooth color transitions when positions change
- Fade in/out for modals
- Slide/fade animations for task movements
- Strike-through animation for checked items

### Responsive Behavior
- **Primary Use Case:** Desktop only (single user)
- **Target Viewports:**
  - MacBook Pro 14": 1512 × 982 px
  - External Monitor: 2304 × 1296 px
- **Sidebar:** Fixed width of 560px to accommodate 500px minimum textarea width
- **Kanban Board:** 4 columns at both viewports
  - External monitor (≥2000px): Full spacing with 20px gaps
  - MacBook Pro 14" (1400-1999px): Compact layout with 12px gaps and smaller fonts
- **Fallback:** For screens below 1400px, sidebar stacks above kanban board

## CSS Requirements

### Color Gradients
- Define 20 gradient steps per column (80 total gradients)
- CSS custom properties for easy management
- Example structure:
  ```css
  --todo-gradient-0: linear-gradient(135deg, #8B0000, #A52A2A);
  --todo-gradient-1: linear-gradient(135deg, #A52A2A, #CD5C5C);
  ...
  --todo-gradient-19: linear-gradient(135deg, #FFA07A, #FFB6C1);
  ```

### Typography
- High contrast text on gradient backgrounds
- Title: Bold, 16-18px
- Description: Regular, 13-14px
- Logs: Smaller, muted text

### Layout
- CSS Grid for main layout (sidebar + kanban board)
- **Sidebar width:** 560px (fixed) to accommodate 500px min-width textarea
- **Kanban board:** Remaining viewport width with 4 equal columns
- Flexbox for columns and task cards
- Consistent spacing and padding

## Technical Implementation Notes

### Position Management
- Each column maintains array of task IDs in order
- When task is moved/reordered, update position values
- Use `position` field to sort tasks within columns

### Color Calculation
- Function to map position (0-19) to gradient CSS variable
- Example: `getTaskColor(columnName, position)`
- Returns: `var(--todo-gradient-5)`

### Daily Reset Logic (Recurrent Tasks)
```javascript
// Pseudocode
const lastResetTime = localStorage.getItem('lastReset');
const now = new Date();
const todayAt6AM = new Date(now.setHours(6, 0, 0, 0));

if (!lastResetTime || new Date(lastResetTime) < todayAt6AM) {
  // Reset all recurrent task checkboxes
  localStorage.setItem('lastReset', todayAt6AM.toISOString());
}
```

### Debounced Auto-Save (Notes)
```javascript
let saveTimeout = null;

function debouncedSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveNotes();  // API call to POST /api/notes
  }, 500);  // Wait 500ms after last keystroke
}

textarea.addEventListener('input', debouncedSave);
```

### Report Generation
- Calculate week number from date
- Format date range (start of week to end of week)
- Deep copy task snapshots (don't reference active tasks)
- Generate HTML or plain text report for display/export

## Data Persistence Strategy

### Files
1. **tasks.json:** Active tasks only
2. **archived-tasks.json:** All archived tasks (append-only)
3. **reports.json:** Array of report objects
4. **notes.json:** Current notes content (plain text)

### Auto-Save
- Save tasks.json on any task modification
- Save notes.json with debounce (500ms after last keystroke)
- Save reports.json when new report is generated
- Append to archived-tasks.json when archiving

## Future Considerations (Out of Scope for Initial Version)
- Export reports to PDF or formatted HTML file
- Search/filter tasks
- Due dates
- Tags/labels
- Custom color themes
- Dark mode
- Keyboard shortcuts for power users
- Undo/redo functionality
- Multiple boards/projects

---

**Server Start Command:** `node server.js` (runs on port 3001)

**Browser Homepage:** Set to `http://localhost:3001`
