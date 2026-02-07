const express = require('express');
const fs = require('fs').promises;
const path = require('path');

const app = express();

/**
 * Server port configuration.
 * Uses PORT environment variable if set, otherwise defaults to 3001.
 * Note: Default value (3001) is also defined in /public/js/constants.js as DEFAULT_PORT.
 */
const PORT = process.env.PORT || 3001;

// Data file paths
const DATA_DIR = path.join(__dirname, 'data');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
const ARCHIVED_FILE = path.join(DATA_DIR, 'archived-tasks.json');
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');
const NOTES_FILE = path.join(DATA_DIR, 'notes.json');

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper functions
async function ensureDataDir() {
    try {
        await fs.access(DATA_DIR);
    } catch {
        await fs.mkdir(DATA_DIR, { recursive: true });
    }
}

async function readJsonFile(filePath, defaultValue = []) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        if (error.code === 'ENOENT') {
            return defaultValue;
        }
        throw error;
    }
}

async function writeJsonFile(filePath, data) {
    await ensureDataDir();
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 11);
}

/**
 * Category labels mapping (numeric ID → display label)
 *
 * NOTE: This is a copy of CATEGORIES from /public/js/constants.js.
 * The source of truth is /public/js/constants.js. If you modify
 * categories, update both files to keep them in sync.
 *
 * This duplication exists because Node.js cannot directly import
 * ES modules from the /public directory without additional setup.
 */
const CATEGORY_LABELS = {
    1: 'Non categorized',
    2: 'Development',
    3: 'Communication',
    4: 'To Remember',
    5: 'Planning',
    6: 'Generic Task'
};

/**
 * Calculates the ISO week number for a given date.
 *
 * NOTE: This is a copy of getWeekNumber from /public/js/utils.js.
 * The source of truth is /public/js/utils.js. If you modify this
 * function, update both files to keep them in sync.
 */
function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function formatDateRange(date) {
    const startOfWeek = new Date(date);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    if (startOfWeek.getMonth() === endOfWeek.getMonth()) {
        return `${months[startOfWeek.getMonth()]} ${startOfWeek.getDate()}-${endOfWeek.getDate()}`;
    } else {
        return `${months[startOfWeek.getMonth()]} ${startOfWeek.getDate()} - ${months[endOfWeek.getMonth()]} ${endOfWeek.getDate()}`;
    }
}

// API Routes

// GET all active tasks
app.get('/api/tasks', async (req, res) => {
    try {
        const tasks = await readJsonFile(TASKS_FILE, []);
        res.json(tasks);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read tasks' });
    }
});

// POST create new task
app.post('/api/tasks', async (req, res) => {
    try {
        const tasks = await readJsonFile(TASKS_FILE, []);
        const { title, description = '', priority = false } = req.body;

        if (!title || title.trim() === '') {
            return res.status(400).json({ error: 'Title is required' });
        }

        // Get max position in todo column
        const todoTasks = tasks.filter(t => t.status === 'todo');
        const maxPosition = todoTasks.length > 0
            ? Math.max(...todoTasks.map(t => t.position)) + 1
            : 0;

        const category = req.body.category !== undefined ? Number(req.body.category) : 1;

        const newTask = {
            id: generateId(),
            title: title.trim(),
            description: description.trim(),
            priority,
            category,
            status: 'todo',
            position: maxPosition,
            log: [],
            createdDate: new Date().toISOString()
        };

        tasks.push(newTask);
        await writeJsonFile(TASKS_FILE, tasks);
        res.status(201).json(newTask);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create task' });
    }
});

// PUT update task
app.put('/api/tasks/:id', async (req, res) => {
    try {
        const tasks = await readJsonFile(TASKS_FILE, []);
        const taskIndex = tasks.findIndex(t => t.id === req.params.id);

        if (taskIndex === -1) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const { title, description, priority, category } = req.body;

        if (title !== undefined) tasks[taskIndex].title = title.trim();
        if (description !== undefined) tasks[taskIndex].description = description.trim();
        if (priority !== undefined) tasks[taskIndex].priority = priority;

        // Handle category change with logging
        if (category !== undefined) {
            const newCategory = Number(category);
            const oldCategory = tasks[taskIndex].category || 1;
            if (newCategory !== oldCategory) {
                const today = new Date().toISOString().split('T')[0];
                const oldLabel = CATEGORY_LABELS[oldCategory] || 'Non categorized';
                const newLabel = CATEGORY_LABELS[newCategory] || 'Non categorized';
                if (!tasks[taskIndex].log) tasks[taskIndex].log = [];
                tasks[taskIndex].log.push({
                    date: today,
                    action: `Category changed from ${oldLabel} to ${newLabel}`
                });
            }
            tasks[taskIndex].category = newCategory;
        }

        await writeJsonFile(TASKS_FILE, tasks);
        res.json(tasks[taskIndex]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update task' });
    }
});

// DELETE task
app.delete('/api/tasks/:id', async (req, res) => {
    try {
        const tasks = await readJsonFile(TASKS_FILE, []);
        const taskIndex = tasks.findIndex(t => t.id === req.params.id);

        if (taskIndex === -1) {
            return res.status(404).json({ error: 'Task not found' });
        }

        tasks.splice(taskIndex, 1);
        await writeJsonFile(TASKS_FILE, tasks);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete task' });
    }
});

// POST move task between columns or reorder
app.post('/api/tasks/:id/move', async (req, res) => {
    try {
        const tasks = await readJsonFile(TASKS_FILE, []);
        const taskIndex = tasks.findIndex(t => t.id === req.params.id);

        if (taskIndex === -1) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const { newStatus, newPosition } = req.body;
        const task = tasks[taskIndex];
        const oldStatus = task.status;

        // Map status to display name for logging
        const statusNames = {
            'todo': 'To Do',
            'wait': 'Wait',
            'inprogress': 'In Progress',
            'done': 'Done'
        };

        // If moving to different column, add log entry
        if (newStatus && newStatus !== oldStatus) {
            const today = new Date().toISOString().split('T')[0];
            task.log.push({
                date: today,
                action: `Moved from ${statusNames[oldStatus]} to ${statusNames[newStatus]}`
            });
            task.status = newStatus;
        }

        // Update position
        if (newPosition !== undefined) {
            // Get all tasks in the target column
            const targetColumn = newStatus || task.status;
            const columnTasks = tasks.filter(t => t.status === targetColumn && t.id !== task.id);

            // Insert task at new position
            task.position = newPosition;

            // Reorder other tasks in the column
            columnTasks.sort((a, b) => a.position - b.position);
            let pos = 0;
            for (const t of columnTasks) {
                if (pos === newPosition) pos++;
                t.position = pos;
                pos++;
            }
        }

        await writeJsonFile(TASKS_FILE, tasks);
        res.json(task);
    } catch (error) {
        res.status(500).json({ error: 'Failed to move task' });
    }
});

// POST generate report (snapshot only, no archiving)
app.post('/api/reports/generate', async (req, res) => {
    try {
        const tasks = await readJsonFile(TASKS_FILE, []);
        const reports = await readJsonFile(REPORTS_FILE, []);
        const notes = await readJsonFile(NOTES_FILE, { content: '' });

        const doneTasks = tasks.filter(t => t.status === 'done');
        const inProgressTasks = tasks.filter(t => t.status === 'inprogress');
        const waitTasks = tasks.filter(t => t.status === 'wait');
        const todoTasks = tasks.filter(t => t.status === 'todo');

        const now = new Date();
        const weekNumber = getWeekNumber(now);
        const dateRange = formatDateRange(now);

        const mapTask = t => ({ id: t.id, title: t.title, description: t.description, category: t.category || 1 });

        const report = {
            id: generateId(),
            title: `Week ${weekNumber} (${dateRange})`,
            generatedDate: now.toISOString(),
            weekNumber,
            dateRange,
            content: {
                archived: doneTasks.map(mapTask),
                inProgress: inProgressTasks.map(mapTask),
                waiting: waitTasks.map(mapTask),
                todo: todoTasks.map(mapTask)
            },
            notes: notes.content || ''
        };

        reports.push(report);
        await writeJsonFile(REPORTS_FILE, reports);

        res.json(report);
    } catch (error) {
        console.error('Report generation error:', error);
        res.status(500).json({ error: 'Failed to generate report' });
    }
});

// POST archive completed tasks (no report generation)
app.post('/api/tasks/archive', async (req, res) => {
    try {
        const tasks = await readJsonFile(TASKS_FILE, []);
        const archivedTasks = await readJsonFile(ARCHIVED_FILE, []);

        const doneTasks = tasks.filter(t => t.status === 'done');

        if (doneTasks.length === 0) {
            return res.status(400).json({ error: 'No completed tasks to archive' });
        }

        for (const task of doneTasks) {
            task.status = 'archived';
            archivedTasks.push(task);
        }

        const activeTasks = tasks.filter(t => t.status !== 'done');

        await writeJsonFile(TASKS_FILE, activeTasks);
        await writeJsonFile(ARCHIVED_FILE, archivedTasks);

        res.json({ success: true, archivedCount: doneTasks.length });
    } catch (error) {
        console.error('Archive error:', error);
        res.status(500).json({ error: 'Failed to archive tasks' });
    }
});

// GET all archived tasks
app.get('/api/archived', async (req, res) => {
    try {
        const archivedTasks = await readJsonFile(ARCHIVED_FILE, []);
        res.json(archivedTasks);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read archived tasks' });
    }
});

// GET all reports
app.get('/api/reports', async (req, res) => {
    try {
        const reports = await readJsonFile(REPORTS_FILE, []);
        res.json(reports);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read reports' });
    }
});

// GET specific report
app.get('/api/reports/:id', async (req, res) => {
    try {
        const reports = await readJsonFile(REPORTS_FILE, []);
        const report = reports.find(r => r.id === req.params.id);

        if (!report) {
            return res.status(404).json({ error: 'Report not found' });
        }

        res.json(report);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read report' });
    }
});

// PUT update report title
app.put('/api/reports/:id', async (req, res) => {
    try {
        const reports = await readJsonFile(REPORTS_FILE, []);
        const reportIndex = reports.findIndex(r => r.id === req.params.id);

        if (reportIndex === -1) {
            return res.status(404).json({ error: 'Report not found' });
        }

        const { title } = req.body;
        if (title) {
            reports[reportIndex].title = title.trim();
        }

        await writeJsonFile(REPORTS_FILE, reports);
        res.json(reports[reportIndex]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update report' });
    }
});

// DELETE report
app.delete('/api/reports/:id', async (req, res) => {
    try {
        const reports = await readJsonFile(REPORTS_FILE, []);
        const reportIndex = reports.findIndex(r => r.id === req.params.id);

        if (reportIndex === -1) {
            return res.status(404).json({ error: 'Report not found' });
        }

        reports.splice(reportIndex, 1);
        await writeJsonFile(REPORTS_FILE, reports);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete report' });
    }
});

// GET notes
app.get('/api/notes', async (req, res) => {
    try {
        const notes = await readJsonFile(NOTES_FILE, { content: '' });
        res.json(notes);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read notes' });
    }
});

// POST save notes
app.post('/api/notes', async (req, res) => {
    try {
        const { content } = req.body;
        const notes = { content: content || '' };
        await writeJsonFile(NOTES_FILE, notes);
        res.json(notes);
    } catch (error) {
        res.status(500).json({ error: 'Failed to save notes' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Task Tracker server running at http://localhost:${PORT}`);
});
