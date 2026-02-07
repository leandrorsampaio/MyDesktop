# Task Tracker

A lightweight, self-hosted kanban board designed for personal productivity. Built with vanilla JavaScript, CSS, and HTML — no frameworks, no dependencies, no complexity.

**Your data stays on your machine. No accounts. No subscriptions. No tracking.**

---

## Why Task Tracker?

In an era of subscription fatigue and data privacy concerns, Task Tracker offers a refreshing alternative: a simple, powerful task management tool that you own completely.

- **Self-Hosted**: Runs locally on your machine. Your tasks never leave your computer.
- **Zero Dependencies**: Pure vanilla JavaScript, CSS, and HTML. No npm packages to update, no security vulnerabilities from third-party code.
- **No Vendor Lock-in**: Your data is stored in plain JSON files. Export, backup, or migrate anytime.
- **Privacy First**: No analytics, no telemetry, no tracking. What you do is your business.
- **Free Forever**: No premium tiers, no feature gates, no "upgrade to unlock" prompts.

---

## Features

### Core Functionality
- **Kanban Board**: Four-column workflow (To Do, Wait, In Progress, Done)
- **Drag and Drop**: Intuitive task movement between columns with visual feedback
- **Task Categories**: Organize tasks into 6 customizable categories
- **Priority Marking**: Flag important tasks with priority indicators
- **Activity Logging**: Automatic tracking of task movements and category changes

### Productivity Tools
- **Daily Checklist**: Configurable recurring tasks that reset each morning
- **Notes Widget**: Free-form note-taking with auto-save
- **Crisis Mode**: Focus mode that shows only priority tasks with distraction-free UI
- **Privacy Mode**: One-click blur overlay when someone walks by

### Reporting
- **Report Generation**: Snapshot reports of your current board state
- **Task Archiving**: Move completed tasks to archive while preserving history
- **Report History**: Browse and search past reports

### Design
- **Clean Interface**: Minimal, distraction-free design with a calm color palette
- **Position-Based Gradients**: Visual indication of task age within each column
- **Responsive Layout**: Works on various screen sizes
- **Browser Homepage Ready**: Designed to be your browser's start page

---

## Quick Start

### Prerequisites
- Node.js (v14 or higher)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/task-tracker.git
cd task-tracker

# Install dependencies (only Express.js for the server)
npm install

# Start the server
node server.js
```

Open your browser and navigate to `http://localhost:3001`

### Set as Browser Homepage

For the best experience, set `http://localhost:3001` as your browser's homepage. Task Tracker is designed to be the first thing you see when you open your browser.

---

## Configuration

### Server Port

The default port is 3001. To use a different port:

```bash
PORT=4000 node server.js
```

### Daily Checklist

Click the hamburger menu and select "Edit Daily Checklist" to customize your recurring tasks. Each item can include an optional URL link.

### Data Location

All data is stored in the `./data/` directory:
- `tasks.json` — Active tasks
- `archived-tasks.json` — Completed and archived tasks
- `reports.json` — Generated reports
- `notes.json` — Your notes

Back up this directory to preserve your data.

---

## Technology

Task Tracker is intentionally built with minimal technology:

| Layer | Technology |
|-------|------------|
| Frontend | Vanilla JavaScript (ES Modules), CSS3, HTML5 |
| Backend | Node.js with Express |
| Data Storage | JSON files |
| Components | Web Components with Shadow DOM |

### Why No Framework?

- **Simplicity**: The codebase is readable and maintainable without framework-specific knowledge
- **Performance**: No framework overhead, minimal bundle size
- **Longevity**: No framework deprecation cycles or breaking changes
- **Learning**: Great example of what modern vanilla JavaScript can accomplish

---

## Project Structure

```
task-tracker/
├── server.js                 # Express server
├── package.json
├── data/                     # Data storage (created automatically)
│   ├── tasks.json
│   ├── archived-tasks.json
│   ├── reports.json
│   └── notes.json
└── public/
    ├── index.html            # Single-page application
    ├── app.js                # Main application logic
    ├── styles.css            # Global styles
    ├── favicon.png
    ├── js/                   # Modular JavaScript
    │   ├── constants.js      # Shared constants
    │   ├── utils.js          # Utility functions
    │   ├── state.js          # State management
    │   ├── api.js            # API functions
    │   ├── filters.js        # Filtering logic
    │   ├── crisis-mode.js    # Crisis mode
    │   └── modals.js         # Modal handling
    └── components/           # Web Components
        ├── button/
        ├── task-card/
        ├── kanban-column/
        ├── modal-dialog/
        ├── toast-notification/
        ├── daily-checklist/
        └── notes-widget/
```

---

## API Reference

Task Tracker exposes a simple REST API:

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks` | Get all active tasks |
| POST | `/api/tasks` | Create a new task |
| PUT | `/api/tasks/:id` | Update a task |
| DELETE | `/api/tasks/:id` | Delete a task |
| POST | `/api/tasks/:id/move` | Move task between columns |
| POST | `/api/tasks/archive` | Archive completed tasks |
| GET | `/api/archived` | Get archived tasks |
| GET | `/api/reports` | Get all reports |
| POST | `/api/reports/generate` | Generate a new report |
| GET | `/api/notes` | Get notes |
| POST | `/api/notes` | Save notes |

---

## Contributing

Contributions are welcome. Please read the guidelines below before submitting.

### Development Setup

1. Fork the repository
2. Clone your fork
3. Make your changes
4. Test thoroughly
5. Submit a pull request

### Code Style

- Vanilla JavaScript only — no frameworks or libraries
- Follow existing code patterns and naming conventions
- Use JSDoc comments for functions
- Keep the codebase simple and readable

### What We Accept

- Bug fixes
- Performance improvements
- Accessibility improvements
- Documentation updates
- New features that align with the project philosophy

### What We Avoid

- Framework dependencies
- External CSS libraries
- Features that compromise privacy
- Complexity for complexity's sake

---

## Roadmap

Potential future enhancements (contributions welcome):

- [ ] Keyboard shortcuts for power users
- [ ] Dark mode
- [ ] Export to PDF/Markdown
- [ ] Task search
- [ ] Due dates
- [ ] Multiple boards
- [ ] Docker container

---

## Philosophy

Task Tracker exists because productivity tools have become overcomplicated. We believe:

1. **You own your data.** It should live on your machine, in formats you can read.
2. **Software should be simple.** If a feature adds complexity without clear value, we skip it.
3. **Privacy is not optional.** Your task list is personal. It should stay that way.
4. **Free means free.** No trials, no tiers, no upsells.

---

## Comparison

| Feature | Task Tracker | SaaS Alternatives |
|---------|--------------|-------------------|
| Price | Free | $5-25/month |
| Data Location | Your machine | Their servers |
| Privacy | Complete | Terms apply |
| Offline Access | Always | Sometimes |
| Dependencies | 1 (Express) | Unknown |
| Vendor Lock-in | None | High |

---

## License

MIT License. See [LICENSE](LICENSE) for details.

Use it, modify it, share it. No attribution required (but appreciated).

---

## Support

- **Issues**: Report bugs or suggest features via GitHub Issues
- **Discussions**: Ask questions or share ideas in GitHub Discussions

---

**Task Tracker** — Simple task management for people who value their privacy and their time.
