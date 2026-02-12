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
const EPICS_FILE = path.join(DATA_DIR, 'epics.json');

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ===========================================
// Rate Limiting (DIY - no external packages)
// ===========================================

/**
 * Rate limit configuration
 * Generous limits since this is a local-only app
 */
const RATE_LIMIT = {
    WINDOW_MS: 60 * 1000,    // 1 minute window
    MAX_REQUESTS: 100,        // Max requests per window (read operations)
    MAX_WRITES: 30            // Max write operations per window (POST/PUT/DELETE)
};

/**
 * In-memory store for rate limiting
 * Key: IP address, Value: { count, writeCount, windowStart }
 */
const rateLimitStore = new Map();

/**
 * Clean up old entries every 5 minutes to prevent memory growth
 */
setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of rateLimitStore.entries()) {
        if (now - data.windowStart > RATE_LIMIT.WINDOW_MS * 2) {
            rateLimitStore.delete(ip);
        }
    }
}, 5 * 60 * 1000);

/**
 * Rate limiter middleware factory
 * @param {Object} options - Configuration options
 * @param {number} options.maxRequests - Maximum requests per window
 * @param {boolean} options.isWriteOperation - Whether this is a write operation
 * @returns {Function} Express middleware
 */
function createRateLimiter({ maxRequests, isWriteOperation = false }) {
    return (req, res, next) => {
        const ip = req.ip || req.connection.remoteAddress || 'unknown';
        const now = Date.now();

        // Get or create entry for this IP
        let entry = rateLimitStore.get(ip);
        if (!entry || now - entry.windowStart > RATE_LIMIT.WINDOW_MS) {
            entry = { count: 0, writeCount: 0, windowStart: now };
            rateLimitStore.set(ip, entry);
        }

        // Increment appropriate counter
        entry.count++;
        if (isWriteOperation) {
            entry.writeCount++;
        }

        // Check limits
        const currentCount = isWriteOperation ? entry.writeCount : entry.count;
        if (currentCount > maxRequests) {
            const retryAfter = Math.ceil((entry.windowStart + RATE_LIMIT.WINDOW_MS - now) / 1000);
            res.set('Retry-After', retryAfter);
            return res.status(429).json({
                error: 'Too many requests. Please slow down.',
                retryAfter: retryAfter
            });
        }

        // Add rate limit headers (informational)
        res.set('X-RateLimit-Limit', maxRequests);
        res.set('X-RateLimit-Remaining', Math.max(0, maxRequests - currentCount));
        res.set('X-RateLimit-Reset', Math.ceil((entry.windowStart + RATE_LIMIT.WINDOW_MS) / 1000));

        next();
    };
}

// Create rate limiters for different operation types
const readLimiter = createRateLimiter({ maxRequests: RATE_LIMIT.MAX_REQUESTS });
const writeLimiter = createRateLimiter({ maxRequests: RATE_LIMIT.MAX_WRITES, isWriteOperation: true });

// Apply rate limiting to all API routes
app.use('/api/', readLimiter);

// ===========================================
// Input Validation
// ===========================================

/**
 * Validation constraints for user input
 */
const VALIDATION = {
    TITLE_MAX_LENGTH: 200,
    DESCRIPTION_MAX_LENGTH: 2000,
    NOTES_MAX_LENGTH: 10000,
    REPORT_TITLE_MAX_LENGTH: 200,
    VALID_CATEGORIES: [1, 2, 3, 4, 5, 6],
    VALID_STATUSES: ['todo', 'wait', 'inprogress', 'done']
};

/**
 * Validates task input data
 * @param {Object} data - The input data to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.requireTitle - Whether title is required (true for create, false for update)
 * @returns {{valid: boolean, errors: string[]}} Validation result
 */
function validateTaskInput(data, { requireTitle = false } = {}) {
    const errors = [];

    // Title validation
    if (requireTitle) {
        if (!data.title || (typeof data.title === 'string' && data.title.trim() === '')) {
            errors.push('Title is required');
        }
    }
    if (data.title !== undefined) {
        if (typeof data.title !== 'string') {
            errors.push('Title must be a string');
        } else if (data.title.trim().length > VALIDATION.TITLE_MAX_LENGTH) {
            errors.push(`Title must be ${VALIDATION.TITLE_MAX_LENGTH} characters or less`);
        }
    }

    // Description validation
    if (data.description !== undefined) {
        if (typeof data.description !== 'string') {
            errors.push('Description must be a string');
        } else if (data.description.length > VALIDATION.DESCRIPTION_MAX_LENGTH) {
            errors.push(`Description must be ${VALIDATION.DESCRIPTION_MAX_LENGTH} characters or less`);
        }
    }

    // Category validation
    if (data.category !== undefined) {
        const category = Number(data.category);
        if (isNaN(category) || !VALIDATION.VALID_CATEGORIES.includes(category)) {
            errors.push(`Category must be one of: ${VALIDATION.VALID_CATEGORIES.join(', ')}`);
        }
    }

    // Priority validation
    if (data.priority !== undefined && typeof data.priority !== 'boolean') {
        errors.push('Priority must be a boolean');
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Validates move task input data
 * @param {Object} data - The input data to validate
 * @returns {{valid: boolean, errors: string[]}} Validation result
 */
function validateMoveInput(data) {
    const errors = [];

    // Status validation
    if (data.newStatus !== undefined) {
        if (typeof data.newStatus !== 'string' || !VALIDATION.VALID_STATUSES.includes(data.newStatus)) {
            errors.push(`Status must be one of: ${VALIDATION.VALID_STATUSES.join(', ')}`);
        }
    }

    // Position validation
    if (data.newPosition !== undefined) {
        const position = Number(data.newPosition);
        if (isNaN(position) || !Number.isInteger(position) || position < 0) {
            errors.push('Position must be a non-negative integer');
        }
    }

    return { valid: errors.length === 0, errors };
}

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
 * Maximum number of epics allowed.
 * Source of truth: /public/js/constants.js
 */
const MAX_EPICS = 20;

/**
 * Pre-defined epic colors (20 rainbow-inspired colors).
 * Source of truth: /public/js/constants.js
 */
const EPIC_COLORS_SERVER = [
    { name: 'Ruby Red', hex: '#E74C3C' },
    { name: 'Coral', hex: '#FF6F61' },
    { name: 'Tangerine', hex: '#E67E22' },
    { name: 'Amber', hex: '#F5A623' },
    { name: 'Sunflower', hex: '#F1C40F' },
    { name: 'Lime', hex: '#A8D84E' },
    { name: 'Emerald', hex: '#2ECC71' },
    { name: 'Jade', hex: '#00B894' },
    { name: 'Teal', hex: '#1ABC9C' },
    { name: 'Cyan', hex: '#00CEC9' },
    { name: 'Sky Blue', hex: '#54A0FF' },
    { name: 'Ocean', hex: '#2E86DE' },
    { name: 'Royal Blue', hex: '#3742FA' },
    { name: 'Indigo', hex: '#5758BB' },
    { name: 'Purple', hex: '#8E44AD' },
    { name: 'Orchid', hex: '#B24BDB' },
    { name: 'Magenta', hex: '#E84393' },
    { name: 'Rose', hex: '#FD79A8' },
    { name: 'Slate', hex: '#636E72' },
    { name: 'Charcoal', hex: '#2D3436' }
];

/**
 * Converts a string to camelCase for epic alias.
 * Source of truth: /public/js/utils.js — duplicated here because
 * server.js runs in Node.js and cannot import ES modules from /public.
 * @param {string} str - The string to convert
 * @returns {string} camelCase version
 */
function toCamelCase(str) {
    return str
        .replace(/[^a-zA-Z0-9\s]/g, '')
        .split(/\s+/)
        .filter(w => w.length > 0)
        .map((word, i) => i === 0
            ? word.toLowerCase()
            : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        )
        .join('');
}

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
app.post('/api/tasks', writeLimiter, async (req, res) => {
    try {
        // Validate input
        const validation = validateTaskInput(req.body, { requireTitle: true });
        if (!validation.valid) {
            return res.status(400).json({ error: validation.errors.join('; ') });
        }

        const tasks = await readJsonFile(TASKS_FILE, []);
        const { title, description = '', priority = false } = req.body;

        // Get max position in todo column
        const todoTasks = tasks.filter(t => t.status === 'todo');
        const maxPosition = todoTasks.length > 0
            ? Math.max(...todoTasks.map(t => t.position)) + 1
            : 0;

        const category = req.body.category !== undefined ? Number(req.body.category) : 1;
        const epicId = req.body.epicId || null;

        const newTask = {
            id: generateId(),
            title: title.trim(),
            description: typeof description === 'string' ? description.trim() : '',
            priority: Boolean(priority),
            category,
            epicId,
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
app.put('/api/tasks/:id', writeLimiter, async (req, res) => {
    try {
        // Validate input (title not required for updates)
        const validation = validateTaskInput(req.body, { requireTitle: false });
        if (!validation.valid) {
            return res.status(400).json({ error: validation.errors.join('; ') });
        }

        const tasks = await readJsonFile(TASKS_FILE, []);
        const taskIndex = tasks.findIndex(t => t.id === req.params.id);

        if (taskIndex === -1) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const { title, description, priority, category, epicId } = req.body;

        if (title !== undefined) tasks[taskIndex].title = title.trim();
        if (description !== undefined) tasks[taskIndex].description = description.trim();
        if (priority !== undefined) tasks[taskIndex].priority = Boolean(priority);

        // Handle epicId change (no logging per spec)
        if (epicId !== undefined) {
            tasks[taskIndex].epicId = epicId || null;
        }

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
app.delete('/api/tasks/:id', writeLimiter, async (req, res) => {
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
app.post('/api/tasks/:id/move', writeLimiter, async (req, res) => {
    try {
        // Validate input
        const validation = validateMoveInput(req.body);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.errors.join('; ') });
        }

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
app.post('/api/reports/generate', writeLimiter, async (req, res) => {
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

        const mapTask = t => ({ id: t.id, title: t.title, description: t.description, category: t.category || 1, epicId: t.epicId || null });

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
app.post('/api/tasks/archive', writeLimiter, async (req, res) => {
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
app.put('/api/reports/:id', writeLimiter, async (req, res) => {
    try {
        const { title } = req.body;

        // Validate title
        if (title !== undefined) {
            if (typeof title !== 'string') {
                return res.status(400).json({ error: 'Title must be a string' });
            }
            if (title.trim().length > VALIDATION.REPORT_TITLE_MAX_LENGTH) {
                return res.status(400).json({ error: `Title must be ${VALIDATION.REPORT_TITLE_MAX_LENGTH} characters or less` });
            }
        }

        const reports = await readJsonFile(REPORTS_FILE, []);
        const reportIndex = reports.findIndex(r => r.id === req.params.id);

        if (reportIndex === -1) {
            return res.status(404).json({ error: 'Report not found' });
        }

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
app.delete('/api/reports/:id', writeLimiter, async (req, res) => {
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
app.post('/api/notes', writeLimiter, async (req, res) => {
    try {
        const { content } = req.body;

        // Validate content length
        if (content !== undefined && typeof content === 'string' && content.length > VALIDATION.NOTES_MAX_LENGTH) {
            return res.status(400).json({ error: `Notes must be ${VALIDATION.NOTES_MAX_LENGTH} characters or less` });
        }

        const notes = { content: typeof content === 'string' ? content : '' };
        await writeJsonFile(NOTES_FILE, notes);
        res.json(notes);
    } catch (error) {
        res.status(500).json({ error: 'Failed to save notes' });
    }
});

// ===========================================
// Epic API Routes
// ===========================================

// GET all epics
app.get('/api/epics', async (req, res) => {
    try {
        const epics = await readJsonFile(EPICS_FILE, []);
        res.json(epics);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read epics' });
    }
});

// POST create new epic
app.post('/api/epics', writeLimiter, async (req, res) => {
    try {
        const epics = await readJsonFile(EPICS_FILE, []);

        if (epics.length >= MAX_EPICS) {
            return res.status(400).json({ error: `Maximum of ${MAX_EPICS} epics allowed` });
        }

        const { name, color } = req.body;

        if (!name || typeof name !== 'string' || name.trim() === '') {
            return res.status(400).json({ error: 'Epic name is required' });
        }

        if (name.trim().length > VALIDATION.TITLE_MAX_LENGTH) {
            return res.status(400).json({ error: `Epic name must be ${VALIDATION.TITLE_MAX_LENGTH} characters or less` });
        }

        if (!color || typeof color !== 'string') {
            return res.status(400).json({ error: 'Epic color is required' });
        }

        // Validate color is one of the predefined colors
        const validColor = EPIC_COLORS_SERVER.find(c => c.hex === color);
        if (!validColor) {
            return res.status(400).json({ error: 'Invalid color selection' });
        }

        // Check color uniqueness
        const colorTaken = epics.find(e => e.color === color);
        if (colorTaken) {
            return res.status(400).json({ error: `Color "${validColor.name}" is already used by epic "${colorTaken.name}"` });
        }

        const alias = toCamelCase(name.trim());

        const newEpic = {
            id: generateId(),
            name: name.trim(),
            color,
            alias
        };

        epics.push(newEpic);
        await writeJsonFile(EPICS_FILE, epics);
        res.status(201).json(newEpic);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create epic' });
    }
});

// PUT update epic
app.put('/api/epics/:id', writeLimiter, async (req, res) => {
    try {
        const epics = await readJsonFile(EPICS_FILE, []);
        const epicIndex = epics.findIndex(e => e.id === req.params.id);

        if (epicIndex === -1) {
            return res.status(404).json({ error: 'Epic not found' });
        }

        const { name, color } = req.body;

        if (name !== undefined) {
            if (typeof name !== 'string' || name.trim() === '') {
                return res.status(400).json({ error: 'Epic name is required' });
            }
            if (name.trim().length > VALIDATION.TITLE_MAX_LENGTH) {
                return res.status(400).json({ error: `Epic name must be ${VALIDATION.TITLE_MAX_LENGTH} characters or less` });
            }
            epics[epicIndex].name = name.trim();
            epics[epicIndex].alias = toCamelCase(name.trim());
        }

        if (color !== undefined) {
            if (typeof color !== 'string') {
                return res.status(400).json({ error: 'Epic color must be a string' });
            }
            const validColor = EPIC_COLORS_SERVER.find(c => c.hex === color);
            if (!validColor) {
                return res.status(400).json({ error: 'Invalid color selection' });
            }
            // Check color uniqueness (excluding current epic)
            const colorTaken = epics.find(e => e.color === color && e.id !== req.params.id);
            if (colorTaken) {
                return res.status(400).json({ error: `Color "${validColor.name}" is already used by epic "${colorTaken.name}"` });
            }
            epics[epicIndex].color = color;
        }

        await writeJsonFile(EPICS_FILE, epics);
        res.json(epics[epicIndex]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update epic' });
    }
});

// DELETE epic (removes epicId from all tasks that have it)
app.delete('/api/epics/:id', writeLimiter, async (req, res) => {
    try {
        const epics = await readJsonFile(EPICS_FILE, []);
        const epicIndex = epics.findIndex(e => e.id === req.params.id);

        if (epicIndex === -1) {
            return res.status(404).json({ error: 'Epic not found' });
        }

        const epicId = req.params.id;
        epics.splice(epicIndex, 1);
        await writeJsonFile(EPICS_FILE, epics);

        // Remove epicId from all tasks that reference this epic
        const tasks = await readJsonFile(TASKS_FILE, []);
        let tasksUpdated = false;
        for (const task of tasks) {
            if (task.epicId === epicId) {
                task.epicId = null;
                tasksUpdated = true;
            }
        }
        if (tasksUpdated) {
            await writeJsonFile(TASKS_FILE, tasks);
        }

        // Also clean archived tasks
        const archivedTasks = await readJsonFile(ARCHIVED_FILE, []);
        let archivedUpdated = false;
        for (const task of archivedTasks) {
            if (task.epicId === epicId) {
                task.epicId = null;
                archivedUpdated = true;
            }
        }
        if (archivedUpdated) {
            await writeJsonFile(ARCHIVED_FILE, archivedTasks);
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete epic' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Task Tracker server running at http://localhost:${PORT}`);
});
