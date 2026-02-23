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
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');

/**
 * Maximum number of profiles allowed.
 * Source of truth: /public/js/constants.js
 */
const MAX_PROFILES = 20;

/** Regex for valid profile letters (1-3 uppercase) */
const PROFILE_LETTERS_REGEX = /^[A-Z]{1,3}$/;

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
    REPORT_TITLE_MAX_LENGTH: 200
};

/**
 * Validates task input data
 * @param {Object} data - The input data to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.requireTitle - Whether title is required (true for create, false for update)
 * @returns {{valid: boolean, errors: string[]}} Validation result
 */
function validateTaskInput(data, { requireTitle = false, validCategoryIds = null } = {}) {
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
        if (isNaN(category) || !Number.isInteger(category) || category < 1) {
            errors.push('Category must be a positive integer');
        } else if (validCategoryIds && !validCategoryIds.has(category)) {
            errors.push('Invalid category ID');
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
 * @param {Set<string>} validColumnIds - Set of valid column IDs for the profile
 * @returns {{valid: boolean, errors: string[]}} Validation result
 */
function validateMoveInput(data, validColumnIds) {
    const errors = [];

    // Status validation — any valid column ID for this profile
    if (data.newStatus !== undefined) {
        if (typeof data.newStatus !== 'string' || !validColumnIds.has(data.newStatus)) {
            errors.push('Status must be a valid column ID for this board');
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

async function fileExists(filePath) {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
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
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substring(2, 11);
}

/**
 * Default categories created when a profile is first loaded.
 * Categories are stored in categories.json per profile and managed dynamically.
 */
const DEFAULT_CATEGORIES = [
    { id: 1, name: 'Non categorized', icon: 'close' },
    { id: 2, name: 'Development', icon: 'edit' },
    { id: 3, name: 'Communication', icon: 'newTab' },
    { id: 4, name: 'To Remember', icon: 'star' },
    { id: 5, name: 'Planning', icon: 'plus' },
    { id: 6, name: 'Generic Task', icon: 'close' }
];

/** Maximum number of categories allowed per profile */
const MAX_CATEGORIES = 20;

/** Category ID that cannot be deleted (Non categorized) */
const DEFAULT_CATEGORY_ID = 1;

/**
 * Maximum number of epics allowed.
 * Source of truth: /public/js/constants.js
 */
const MAX_EPICS = 20;

/**
 * Maximum number of columns allowed per profile.
 * Source of truth: /public/js/constants.js
 */
const MAX_COLUMNS = 15;

/**
 * Default columns for every new profile.
 * IDs match legacy task status values so existing tasks need no migration.
 * Source of truth: /public/js/constants.js
 */
const DEFAULT_COLUMNS = [
    { id: 'todo',       name: 'To Do',       order: 0, hasArchive: false },
    { id: 'wait',       name: 'Wait',        order: 1, hasArchive: false },
    { id: 'inprogress', name: 'In Progress', order: 2, hasArchive: false },
    { id: 'done',       name: 'Done',        order: 3, hasArchive: true  }
];

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

// ===========================================
// Profile Management
// ===========================================

/**
 * Creates empty data files in a profile directory.
 * @param {string} profileDir - The profile directory path
 */
async function createEmptyProfileData(profileDir) {
    await fs.mkdir(profileDir, { recursive: true });
    await writeJsonFile(path.join(profileDir, 'tasks.json'), []);
    await writeJsonFile(path.join(profileDir, 'archived-tasks.json'), []);
    await writeJsonFile(path.join(profileDir, 'reports.json'), []);
    await writeJsonFile(path.join(profileDir, 'notes.json'), { content: '' });
    await writeJsonFile(path.join(profileDir, 'epics.json'), []);
    await writeJsonFile(path.join(profileDir, 'categories.json'), DEFAULT_CATEGORIES);
}

/**
 * Ensures a default profile exists. Called before app.listen().
 * - If profiles.json doesn't exist AND legacy files exist in data/ → migrate to data/work/
 * - If profiles.json doesn't exist AND no legacy data → create data/user1/
 */
async function ensureDefaultProfile() {
    await ensureDataDir();

    if (await fileExists(PROFILES_FILE)) return;

    const legacyTasksFile = path.join(DATA_DIR, 'tasks.json');
    const hasLegacyData = await fileExists(legacyTasksFile);

    if (hasLegacyData) {
        // Migrate existing data to data/work/
        const workDir = path.join(DATA_DIR, 'work');
        await fs.mkdir(workDir, { recursive: true });

        const filesToMove = ['tasks.json', 'archived-tasks.json', 'reports.json', 'notes.json', 'epics.json'];
        for (const file of filesToMove) {
            const src = path.join(DATA_DIR, file);
            const dest = path.join(workDir, file);
            if (await fileExists(src)) {
                await fs.rename(src, dest);
            } else {
                // Create empty file if it didn't exist
                const defaultVal = file === 'notes.json' ? { content: '' } : [];
                await writeJsonFile(dest, defaultVal);
            }
        }

        const profiles = [{
            id: generateId(),
            name: 'Work',
            color: '#54A0FF',
            letters: 'WK',
            alias: 'work',
            isDefault: true,
            columns: DEFAULT_COLUMNS
        }];
        await writeJsonFile(PROFILES_FILE, profiles);
        console.log('Migrated existing data to "Work" profile (data/work/)');
    } else {
        // Fresh install — create default profile
        const user1Dir = path.join(DATA_DIR, 'user1');
        await createEmptyProfileData(user1Dir);

        const profiles = [{
            id: generateId(),
            name: 'User1',
            color: '#54A0FF',
            letters: 'U1',
            alias: 'user1',
            isDefault: true,
            columns: DEFAULT_COLUMNS
        }];
        await writeJsonFile(PROFILES_FILE, profiles);
        console.log('Created default "User1" profile (data/user1/)');
    }
}

/**
 * Validates profile input data.
 * @param {Object} data - The input data to validate
 * @param {Object} options - Validation options
 * @param {boolean} options.requireAll - Whether all fields are required (true for create)
 * @returns {{valid: boolean, errors: string[]}} Validation result
 */
function validateProfileInput(data, { requireAll = false } = {}) {
    const errors = [];

    if (requireAll) {
        if (!data.name || (typeof data.name === 'string' && data.name.trim() === '')) {
            errors.push('Profile name is required');
        }
        if (!data.color) errors.push('Profile color is required');
        if (!data.letters) errors.push('Profile letters are required');
    }

    if (data.name !== undefined) {
        if (typeof data.name !== 'string') {
            errors.push('Name must be a string');
        } else if (data.name.trim().length > VALIDATION.TITLE_MAX_LENGTH) {
            errors.push(`Name must be ${VALIDATION.TITLE_MAX_LENGTH} characters or less`);
        }
    }

    if (data.color !== undefined) {
        if (typeof data.color !== 'string') {
            errors.push('Color must be a string');
        } else {
            const validColor = EPIC_COLORS_SERVER.find(c => c.hex === data.color);
            if (!validColor) errors.push('Invalid color selection');
        }
    }

    if (data.letters !== undefined) {
        if (typeof data.letters !== 'string') {
            errors.push('Letters must be a string');
        } else if (!PROFILE_LETTERS_REGEX.test(data.letters)) {
            errors.push('Letters must be 1-3 uppercase characters');
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Middleware that resolves a profile alias from :profile param.
 * Attaches req.profileFiles, req.profile, and req.columns (sorted by order).
 * Auto-migrates: adds default columns if the profile has none.
 */
async function resolveProfile(req, res, next) {
    const alias = req.params.profile;

    if (!alias || typeof alias !== 'string' || !/^[a-zA-Z0-9]+$/.test(alias)) {
        return res.status(400).json({ error: 'Invalid profile alias' });
    }

    try {
        const profiles = await readJsonFile(PROFILES_FILE, []);
        const profileIndex = profiles.findIndex(p => p.alias === alias);

        if (profileIndex === -1) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        const profile = profiles[profileIndex];

        // Auto-migrate: add default columns if the profile has none
        if (!profile.columns || profile.columns.length === 0) {
            profile.columns = DEFAULT_COLUMNS;
            await writeJsonFile(PROFILES_FILE, profiles);
        }

        const profileDir = path.join(DATA_DIR, alias);
        req.profileFiles = {
            tasks: path.join(profileDir, 'tasks.json'),
            archived: path.join(profileDir, 'archived-tasks.json'),
            reports: path.join(profileDir, 'reports.json'),
            notes: path.join(profileDir, 'notes.json'),
            epics: path.join(profileDir, 'epics.json'),
            categories: path.join(profileDir, 'categories.json')
        };
        req.profile = profile;
        // Columns sorted by order for consistent use across handlers
        req.columns = [...profile.columns].sort((a, b) => a.order - b.order);

        // Auto-create categories.json with defaults if missing (migration for existing profiles)
        if (!(await fileExists(req.profileFiles.categories))) {
            await writeJsonFile(req.profileFiles.categories, DEFAULT_CATEGORIES);
        }

        next();
    } catch (error) {
        res.status(500).json({ error: 'Failed to resolve profile' });
    }
}

// ===========================================
// Profile CRUD API Routes
// ===========================================

/**
 * Ensures profiles have a valid isDefault field.
 * If no profile has isDefault: true, the first profile becomes default.
 * @param {Array<Object>} profiles - Array of profile objects
 * @returns {boolean} Whether profiles were modified
 */
function normalizeProfileDefaults(profiles) {
    if (profiles.length === 0) return false;
    const hasDefault = profiles.some(p => p.isDefault === true);
    if (!hasDefault) {
        profiles[0].isDefault = true;
        return true;
    }
    return false;
}

// GET all profiles
app.get('/api/profiles', async (req, res) => {
    try {
        const profiles = await readJsonFile(PROFILES_FILE, []);
        if (normalizeProfileDefaults(profiles)) {
            await writeJsonFile(PROFILES_FILE, profiles);
        }
        res.json(profiles);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read profiles' });
    }
});

// GET default profile
app.get('/api/profiles/default', async (req, res) => {
    try {
        const profiles = await readJsonFile(PROFILES_FILE, []);
        normalizeProfileDefaults(profiles);
        const defaultProfile = profiles.find(p => p.isDefault === true) || profiles[0];
        if (!defaultProfile) {
            return res.status(404).json({ error: 'No profiles found' });
        }
        res.json(defaultProfile);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read default profile' });
    }
});

// POST create new profile
app.post('/api/profiles', writeLimiter, async (req, res) => {
    try {
        const profiles = await readJsonFile(PROFILES_FILE, []);

        if (profiles.length >= MAX_PROFILES) {
            return res.status(400).json({ error: `Maximum of ${MAX_PROFILES} profiles allowed` });
        }

        const validation = validateProfileInput(req.body, { requireAll: true });
        if (!validation.valid) {
            return res.status(400).json({ error: validation.errors.join('; ') });
        }

        const { name, color, letters } = req.body;
        const alias = toCamelCase(name.trim());

        if (!alias) {
            return res.status(400).json({ error: 'Profile name must contain at least one alphanumeric character' });
        }

        // Check uniqueness
        if (profiles.find(p => p.alias === alias)) {
            return res.status(400).json({ error: `A profile with alias "${alias}" already exists` });
        }
        if (profiles.find(p => p.color === color)) {
            const colorName = EPIC_COLORS_SERVER.find(c => c.hex === color)?.name || color;
            return res.status(400).json({ error: `Color "${colorName}" is already used by another profile` });
        }
        if (profiles.find(p => p.letters === letters.toUpperCase())) {
            return res.status(400).json({ error: `Letters "${letters.toUpperCase()}" are already used by another profile` });
        }

        const newProfile = {
            id: generateId(),
            name: name.trim(),
            color,
            letters: letters.toUpperCase(),
            alias,
            isDefault: false,
            columns: DEFAULT_COLUMNS
        };

        // Create profile data directory with empty files
        await createEmptyProfileData(path.join(DATA_DIR, alias));

        profiles.push(newProfile);
        await writeJsonFile(PROFILES_FILE, profiles);
        res.status(201).json(newProfile);
    } catch (error) {
        console.error('Error creating profile:', error);
        res.status(500).json({ error: 'Failed to create profile' });
    }
});

// PUT update profile
app.put('/api/profiles/:id', writeLimiter, async (req, res) => {
    try {
        const profiles = await readJsonFile(PROFILES_FILE, []);
        const profileIndex = profiles.findIndex(p => p.id === req.params.id);

        if (profileIndex === -1) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        const validation = validateProfileInput(req.body);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.errors.join('; ') });
        }

        const { name, color, letters, isDefault } = req.body;
        const oldAlias = profiles[profileIndex].alias;

        // Handle isDefault toggle — only one profile can be default
        if (isDefault === true) {
            profiles.forEach(p => { p.isDefault = false; });
            profiles[profileIndex].isDefault = true;
        }

        if (name !== undefined) {
            const newAlias = toCamelCase(name.trim());
            if (!newAlias) {
                return res.status(400).json({ error: 'Profile name must contain at least one alphanumeric character' });
            }
            // Check alias uniqueness (excluding self)
            if (newAlias !== oldAlias && profiles.find(p => p.alias === newAlias)) {
                return res.status(400).json({ error: `A profile with alias "${newAlias}" already exists` });
            }
            profiles[profileIndex].name = name.trim();
            profiles[profileIndex].alias = newAlias;

            // Rename directory if alias changed
            if (newAlias !== oldAlias) {
                const oldDir = path.join(DATA_DIR, oldAlias);
                const newDir = path.join(DATA_DIR, newAlias);
                await fs.rename(oldDir, newDir);
            }
        }

        if (color !== undefined) {
            const colorTaken = profiles.find(p => p.color === color && p.id !== req.params.id);
            if (colorTaken) {
                const colorName = EPIC_COLORS_SERVER.find(c => c.hex === color)?.name || color;
                return res.status(400).json({ error: `Color "${colorName}" is already used by profile "${colorTaken.name}"` });
            }
            profiles[profileIndex].color = color;
        }

        if (letters !== undefined) {
            const lettersTaken = profiles.find(p => p.letters === letters.toUpperCase() && p.id !== req.params.id);
            if (lettersTaken) {
                return res.status(400).json({ error: `Letters "${letters.toUpperCase()}" are already used by profile "${lettersTaken.name}"` });
            }
            profiles[profileIndex].letters = letters.toUpperCase();
        }

        await writeJsonFile(PROFILES_FILE, profiles);
        res.json(profiles[profileIndex]);
    } catch (error) {
        console.error('Error updating profile:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

// DELETE profile
app.delete('/api/profiles/:id', writeLimiter, async (req, res) => {
    try {
        const profiles = await readJsonFile(PROFILES_FILE, []);
        const profileIndex = profiles.findIndex(p => p.id === req.params.id);

        if (profileIndex === -1) {
            return res.status(404).json({ error: 'Profile not found' });
        }

        if (profiles.length <= 1) {
            return res.status(400).json({ error: 'Cannot delete the last profile' });
        }

        const wasDefault = profiles[profileIndex].isDefault;
        const alias = profiles[profileIndex].alias;
        profiles.splice(profileIndex, 1);

        // If we deleted the default profile, make the first remaining one default
        if (wasDefault && profiles.length > 0) {
            profiles[0].isDefault = true;
        }

        await writeJsonFile(PROFILES_FILE, profiles);

        // Remove profile data directory
        const profileDir = path.join(DATA_DIR, alias);
        await fs.rm(profileDir, { recursive: true, force: true });

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting profile:', error);
        res.status(500).json({ error: 'Failed to delete profile' });
    }
});

// ===========================================
// Profile-Scoped API Routes
// ===========================================

// GET all active tasks
app.get('/api/:profile/tasks', resolveProfile, async (req, res) => {
    try {
        const tasks = await readJsonFile(req.profileFiles.tasks, []);
        res.json(tasks);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read tasks' });
    }
});

// POST create new task
app.post('/api/:profile/tasks', resolveProfile, writeLimiter, async (req, res) => {
    try {
        // Load categories for validation
        const categories = await readJsonFile(req.profileFiles.categories, DEFAULT_CATEGORIES);
        const validCategoryIds = new Set(categories.map(c => c.id));

        // Validate input
        const validation = validateTaskInput(req.body, { requireTitle: true, validCategoryIds });
        if (!validation.valid) {
            return res.status(400).json({ error: validation.errors.join('; ') });
        }

        const tasks = await readJsonFile(req.profileFiles.tasks, []);
        const { title, description = '', priority = false } = req.body;

        // Default status is the first column (order 0)
        const defaultColumnId = req.columns[0].id;

        // Get max position in default column
        const defaultColTasks = tasks.filter(t => t.status === defaultColumnId);
        const maxPosition = defaultColTasks.length > 0
            ? Math.max(...defaultColTasks.map(t => t.position)) + 1
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
            status: defaultColumnId,
            position: maxPosition,
            log: [],
            createdDate: new Date().toISOString()
        };

        tasks.push(newTask);
        await writeJsonFile(req.profileFiles.tasks, tasks);
        res.status(201).json(newTask);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create task' });
    }
});

// PUT update task
app.put('/api/:profile/tasks/:id', resolveProfile, writeLimiter, async (req, res) => {
    try {
        // Load categories for validation and logging
        const categories = await readJsonFile(req.profileFiles.categories, DEFAULT_CATEGORIES);
        const validCategoryIds = new Set(categories.map(c => c.id));
        const categoryLookup = new Map(categories.map(c => [c.id, c.name]));

        // Validate input (title not required for updates)
        const validation = validateTaskInput(req.body, { requireTitle: false, validCategoryIds });
        if (!validation.valid) {
            return res.status(400).json({ error: validation.errors.join('; ') });
        }

        const tasks = await readJsonFile(req.profileFiles.tasks, []);
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
                const oldLabel = categoryLookup.get(oldCategory) || 'Non categorized';
                const newLabel = categoryLookup.get(newCategory) || 'Non categorized';
                if (!tasks[taskIndex].log) tasks[taskIndex].log = [];
                tasks[taskIndex].log.push({
                    date: today,
                    action: `Category changed from ${oldLabel} to ${newLabel}`
                });
            }
            tasks[taskIndex].category = newCategory;
        }

        await writeJsonFile(req.profileFiles.tasks, tasks);
        res.json(tasks[taskIndex]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update task' });
    }
});

// DELETE task
app.delete('/api/:profile/tasks/:id', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const tasks = await readJsonFile(req.profileFiles.tasks, []);
        const taskIndex = tasks.findIndex(t => t.id === req.params.id);

        if (taskIndex === -1) {
            return res.status(404).json({ error: 'Task not found' });
        }

        tasks.splice(taskIndex, 1);
        await writeJsonFile(req.profileFiles.tasks, tasks);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete task' });
    }
});

// POST move task between columns or reorder
app.post('/api/:profile/tasks/:id/move', resolveProfile, writeLimiter, async (req, res) => {
    try {
        // Validate input using dynamic column IDs from the profile
        const validColumnIds = new Set(req.columns.map(c => c.id));
        const validation = validateMoveInput(req.body, validColumnIds);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.errors.join('; ') });
        }

        const tasks = await readJsonFile(req.profileFiles.tasks, []);
        const taskIndex = tasks.findIndex(t => t.id === req.params.id);

        if (taskIndex === -1) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const { newStatus, newPosition } = req.body;
        const task = tasks[taskIndex];
        const oldStatus = task.status;

        // Use column display names from the profile for the log entry
        const columnNameMap = new Map(req.columns.map(c => [c.id, c.name]));

        // If moving to different column, add log entry
        if (newStatus && newStatus !== oldStatus) {
            const today = new Date().toISOString().split('T')[0];
            const oldName = columnNameMap.get(oldStatus) || oldStatus;
            const newName = columnNameMap.get(newStatus) || newStatus;
            task.log.push({
                date: today,
                action: `Moved from ${oldName} to ${newName}`
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

        await writeJsonFile(req.profileFiles.tasks, tasks);
        res.json(task);
    } catch (error) {
        res.status(500).json({ error: 'Failed to move task' });
    }
});

// POST generate report (snapshot only, no archiving)
app.post('/api/:profile/reports/generate', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const tasks = await readJsonFile(req.profileFiles.tasks, []);
        const reports = await readJsonFile(req.profileFiles.reports, []);
        const notes = await readJsonFile(req.profileFiles.notes, { content: '' });
        const categories = await readJsonFile(req.profileFiles.categories, DEFAULT_CATEGORIES);
        const categoryLookup = new Map(categories.map(c => [c.id, c.name]));

        const now = new Date();
        const weekNumber = getWeekNumber(now);
        const dateRange = formatDateRange(now);

        const mapTask = t => ({
            id: t.id,
            title: t.title,
            description: t.description,
            category: t.category || 1,
            categoryName: categoryLookup.get(t.category || 1) || 'Non categorized',
            epicId: t.epicId || null
        });

        // Snapshot all columns in board order, capturing current column names
        const columnsSnapshot = req.columns.map(col => ({
            columnId: col.id,
            columnName: col.name,
            tasks: tasks.filter(t => t.status === col.id).map(mapTask)
        }));

        const report = {
            id: generateId(),
            title: `Week ${weekNumber} (${dateRange})`,
            generatedDate: now.toISOString(),
            weekNumber,
            dateRange,
            content: {
                columns: columnsSnapshot
            },
            notes: notes.content || ''
        };

        reports.push(report);
        await writeJsonFile(req.profileFiles.reports, reports);

        res.json(report);
    } catch (error) {
        console.error('Report generation error:', error);
        res.status(500).json({ error: 'Failed to generate report' });
    }
});

// POST archive tasks from a specific column (no report generation)
app.post('/api/:profile/tasks/archive', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const tasks = await readJsonFile(req.profileFiles.tasks, []);
        const archivedTasks = await readJsonFile(req.profileFiles.archived, []);
        const categories = await readJsonFile(req.profileFiles.categories, DEFAULT_CATEGORIES);
        const categoryLookup = new Map(categories.map(c => [c.id, c.name]));

        // Resolve which column to archive from
        let targetColumnId;
        if (req.body.columnId) {
            const col = req.columns.find(c => c.id === req.body.columnId);
            if (!col) return res.status(400).json({ error: 'Invalid column ID' });
            targetColumnId = col.id;
        } else {
            // Fallback: first column with hasArchive: true
            const archiveCol = req.columns.find(c => c.hasArchive);
            targetColumnId = archiveCol ? archiveCol.id : req.columns[req.columns.length - 1].id;
        }

        const doneTasks = tasks.filter(t => t.status === targetColumnId);

        if (doneTasks.length === 0) {
            return res.status(400).json({ error: 'No tasks to archive in this column' });
        }

        for (const task of doneTasks) {
            task.status = 'archived';
            // Store category name so it persists even if category is later deleted
            task.categoryName = categoryLookup.get(task.category || 1) || 'Non categorized';
            archivedTasks.push(task);
        }

        const activeTasks = tasks.filter(t => t.status !== 'done');

        await writeJsonFile(req.profileFiles.tasks, activeTasks);
        await writeJsonFile(req.profileFiles.archived, archivedTasks);

        res.json({ success: true, archivedCount: doneTasks.length });
    } catch (error) {
        console.error('Archive error:', error);
        res.status(500).json({ error: 'Failed to archive tasks' });
    }
});

// GET all archived tasks
app.get('/api/:profile/archived', resolveProfile, async (req, res) => {
    try {
        const archivedTasks = await readJsonFile(req.profileFiles.archived, []);
        res.json(archivedTasks);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read archived tasks' });
    }
});

// GET all reports
app.get('/api/:profile/reports', resolveProfile, async (req, res) => {
    try {
        const reports = await readJsonFile(req.profileFiles.reports, []);
        res.json(reports);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read reports' });
    }
});

// GET specific report
app.get('/api/:profile/reports/:id', resolveProfile, async (req, res) => {
    try {
        const reports = await readJsonFile(req.profileFiles.reports, []);
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
app.put('/api/:profile/reports/:id', resolveProfile, writeLimiter, async (req, res) => {
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

        const reports = await readJsonFile(req.profileFiles.reports, []);
        const reportIndex = reports.findIndex(r => r.id === req.params.id);

        if (reportIndex === -1) {
            return res.status(404).json({ error: 'Report not found' });
        }

        if (title) {
            reports[reportIndex].title = title.trim();
        }

        await writeJsonFile(req.profileFiles.reports, reports);
        res.json(reports[reportIndex]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update report' });
    }
});

// DELETE report
app.delete('/api/:profile/reports/:id', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const reports = await readJsonFile(req.profileFiles.reports, []);
        const reportIndex = reports.findIndex(r => r.id === req.params.id);

        if (reportIndex === -1) {
            return res.status(404).json({ error: 'Report not found' });
        }

        reports.splice(reportIndex, 1);
        await writeJsonFile(req.profileFiles.reports, reports);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete report' });
    }
});

// GET notes
app.get('/api/:profile/notes', resolveProfile, async (req, res) => {
    try {
        const notes = await readJsonFile(req.profileFiles.notes, { content: '' });
        res.json(notes);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read notes' });
    }
});

// POST save notes
app.post('/api/:profile/notes', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const { content } = req.body;

        // Validate content length
        if (content !== undefined && typeof content === 'string' && content.length > VALIDATION.NOTES_MAX_LENGTH) {
            return res.status(400).json({ error: `Notes must be ${VALIDATION.NOTES_MAX_LENGTH} characters or less` });
        }

        const notes = { content: typeof content === 'string' ? content : '' };
        await writeJsonFile(req.profileFiles.notes, notes);
        res.json(notes);
    } catch (error) {
        res.status(500).json({ error: 'Failed to save notes' });
    }
});

// ===========================================
// Epic API Routes
// ===========================================

// GET all epics
app.get('/api/:profile/epics', resolveProfile, async (req, res) => {
    try {
        const epics = await readJsonFile(req.profileFiles.epics, []);
        res.json(epics);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read epics' });
    }
});

// POST create new epic
app.post('/api/:profile/epics', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const epics = await readJsonFile(req.profileFiles.epics, []);

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
        await writeJsonFile(req.profileFiles.epics, epics);
        res.status(201).json(newEpic);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create epic' });
    }
});

// PUT update epic
app.put('/api/:profile/epics/:id', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const epics = await readJsonFile(req.profileFiles.epics, []);
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

        await writeJsonFile(req.profileFiles.epics, epics);
        res.json(epics[epicIndex]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update epic' });
    }
});

// DELETE epic (removes epicId from all tasks that have it)
app.delete('/api/:profile/epics/:id', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const epics = await readJsonFile(req.profileFiles.epics, []);
        const epicIndex = epics.findIndex(e => e.id === req.params.id);

        if (epicIndex === -1) {
            return res.status(404).json({ error: 'Epic not found' });
        }

        const epicId = req.params.id;
        epics.splice(epicIndex, 1);
        await writeJsonFile(req.profileFiles.epics, epics);

        // Remove epicId from all tasks that reference this epic
        const tasks = await readJsonFile(req.profileFiles.tasks, []);
        let tasksUpdated = false;
        for (const task of tasks) {
            if (task.epicId === epicId) {
                task.epicId = null;
                tasksUpdated = true;
            }
        }
        if (tasksUpdated) {
            await writeJsonFile(req.profileFiles.tasks, tasks);
        }

        // Also clean archived tasks
        const archivedTasks = await readJsonFile(req.profileFiles.archived, []);
        let archivedUpdated = false;
        for (const task of archivedTasks) {
            if (task.epicId === epicId) {
                task.epicId = null;
                archivedUpdated = true;
            }
        }
        if (archivedUpdated) {
            await writeJsonFile(req.profileFiles.archived, archivedTasks);
        }

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete epic' });
    }
});

// ===========================================
// Column API Routes
// ===========================================

// GET all columns for a profile (sorted by order)
app.get('/api/:profile/columns', resolveProfile, async (req, res) => {
    res.json(req.columns);
});

// POST create new column
app.post('/api/:profile/columns', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const columns = req.profile.columns;

        if (columns.length >= MAX_COLUMNS) {
            return res.status(400).json({ error: `Maximum of ${MAX_COLUMNS} columns allowed` });
        }

        const { name } = req.body;
        if (!name || typeof name !== 'string' || name.trim() === '') {
            return res.status(400).json({ error: 'Column name is required' });
        }
        if (name.trim().length > VALIDATION.TITLE_MAX_LENGTH) {
            return res.status(400).json({ error: `Column name must be ${VALIDATION.TITLE_MAX_LENGTH} characters or less` });
        }

        const newColumn = {
            id: generateId(),
            name: name.trim(),
            order: columns.length,
            hasArchive: false
        };

        columns.push(newColumn);
        const profiles = await readJsonFile(PROFILES_FILE, []);
        const idx = profiles.findIndex(p => p.alias === req.params.profile);
        if (idx !== -1) {
            profiles[idx].columns = columns;
            await writeJsonFile(PROFILES_FILE, profiles);
        }

        res.status(201).json(newColumn);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create column' });
    }
});

// PUT update a single column (rename / toggle hasArchive)
app.put('/api/:profile/columns/:id', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const columns = req.profile.columns;
        const colIndex = columns.findIndex(c => c.id === req.params.id);

        if (colIndex === -1) {
            return res.status(404).json({ error: 'Column not found' });
        }

        const { name, hasArchive } = req.body;

        if (name !== undefined) {
            if (typeof name !== 'string' || name.trim() === '') {
                return res.status(400).json({ error: 'Column name cannot be empty' });
            }
            if (name.trim().length > VALIDATION.TITLE_MAX_LENGTH) {
                return res.status(400).json({ error: `Column name must be ${VALIDATION.TITLE_MAX_LENGTH} characters or less` });
            }
            columns[colIndex].name = name.trim();
        }

        if (hasArchive !== undefined) {
            columns[colIndex].hasArchive = Boolean(hasArchive);
        }

        const profiles = await readJsonFile(PROFILES_FILE, []);
        const idx = profiles.findIndex(p => p.alias === req.params.profile);
        if (idx !== -1) {
            profiles[idx].columns = columns;
            await writeJsonFile(PROFILES_FILE, profiles);
        }

        res.json(columns[colIndex]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update column' });
    }
});

// PUT reorder all columns (send full array with updated order values)
app.put('/api/:profile/columns', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const { columns: incomingColumns } = req.body;

        if (!Array.isArray(incomingColumns)) {
            return res.status(400).json({ error: 'columns must be an array' });
        }

        const existingIds = new Set(req.profile.columns.map(c => c.id));
        for (const col of incomingColumns) {
            if (!existingIds.has(col.id)) {
                return res.status(400).json({ error: `Unknown column id: ${col.id}` });
            }
        }

        // Rebuild columns from incoming order, preserving all fields
        const colMap = new Map(req.profile.columns.map(c => [c.id, c]));
        const reordered = incomingColumns.map((col, idx) => ({
            ...colMap.get(col.id),
            order: idx
        }));

        const profiles = await readJsonFile(PROFILES_FILE, []);
        const pIdx = profiles.findIndex(p => p.alias === req.params.profile);
        if (pIdx !== -1) {
            profiles[pIdx].columns = reordered;
            await writeJsonFile(PROFILES_FILE, profiles);
        }

        res.json(reordered.sort((a, b) => a.order - b.order));
    } catch (error) {
        res.status(500).json({ error: 'Failed to reorder columns' });
    }
});

// DELETE a column — tasks in it are moved to the first (default) column
app.delete('/api/:profile/columns/:id', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const columns = req.profile.columns;

        if (columns.length <= 1) {
            return res.status(400).json({ error: 'Cannot delete the last column' });
        }

        const colIndex = columns.findIndex(c => c.id === req.params.id);
        if (colIndex === -1) {
            return res.status(404).json({ error: 'Column not found' });
        }

        const deletedColumn = columns[colIndex];
        const sorted = [...columns].sort((a, b) => a.order - b.order);
        // Default column is first (order 0), skip the one being deleted
        const defaultColumn = sorted.find(c => c.id !== deletedColumn.id);

        // Move all tasks in the deleted column to the default column
        const tasks = await readJsonFile(req.profileFiles.tasks, []);
        const today = new Date().toISOString().split('T')[0];
        let tasksUpdated = false;

        // Get max position in default column for appending
        const defaultColTasks = tasks.filter(t => t.status === defaultColumn.id);
        let nextPosition = defaultColTasks.length > 0
            ? Math.max(...defaultColTasks.map(t => t.position)) + 1
            : 0;

        for (const task of tasks) {
            if (task.status === deletedColumn.id) {
                task.status = defaultColumn.id;
                task.position = nextPosition++;
                if (!task.log) task.log = [];
                task.log.push({
                    date: today,
                    action: `Column '${deletedColumn.name}' deleted – moved to '${defaultColumn.name}'`
                });
                tasksUpdated = true;
            }
        }

        if (tasksUpdated) {
            await writeJsonFile(req.profileFiles.tasks, tasks);
        }

        // Remove column and re-normalise order values
        columns.splice(colIndex, 1);
        columns.sort((a, b) => a.order - b.order).forEach((c, i) => { c.order = i; });

        const profiles = await readJsonFile(PROFILES_FILE, []);
        const pIdx = profiles.findIndex(p => p.alias === req.params.profile);
        if (pIdx !== -1) {
            profiles[pIdx].columns = columns;
            await writeJsonFile(PROFILES_FILE, profiles);
        }

        res.json({
            success: true,
            movedCount: tasksUpdated ? tasks.filter(t => t.status === defaultColumn.id).length : 0,
            defaultColumnName: defaultColumn.name
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete column' });
    }
});

// ===========================================
// Category API Routes
// ===========================================

// GET all categories
app.get('/api/:profile/categories', resolveProfile, async (req, res) => {
    try {
        const categories = await readJsonFile(req.profileFiles.categories, DEFAULT_CATEGORIES);
        res.json(categories);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read categories' });
    }
});

// POST create new category
app.post('/api/:profile/categories', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const categories = await readJsonFile(req.profileFiles.categories, DEFAULT_CATEGORIES);

        if (categories.length >= MAX_CATEGORIES) {
            return res.status(400).json({ error: `Maximum of ${MAX_CATEGORIES} categories allowed` });
        }

        const { name, icon } = req.body;

        if (!name || typeof name !== 'string' || name.trim() === '') {
            return res.status(400).json({ error: 'Category name is required' });
        }

        if (name.trim().length > VALIDATION.TITLE_MAX_LENGTH) {
            return res.status(400).json({ error: `Category name must be ${VALIDATION.TITLE_MAX_LENGTH} characters or less` });
        }

        if (!icon || typeof icon !== 'string') {
            return res.status(400).json({ error: 'Category icon is required' });
        }

        // Auto-increment ID
        const maxId = categories.reduce((max, c) => Math.max(max, c.id), 0);
        const newCategory = {
            id: maxId + 1,
            name: name.trim(),
            icon
        };

        categories.push(newCategory);
        await writeJsonFile(req.profileFiles.categories, categories);
        res.status(201).json(newCategory);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create category' });
    }
});

// PUT update category
app.put('/api/:profile/categories/:id', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const categories = await readJsonFile(req.profileFiles.categories, DEFAULT_CATEGORIES);
        const categoryId = Number(req.params.id);
        const categoryIndex = categories.findIndex(c => c.id === categoryId);

        if (categoryIndex === -1) {
            return res.status(404).json({ error: 'Category not found' });
        }

        const { name, icon } = req.body;

        if (name !== undefined) {
            if (typeof name !== 'string' || name.trim() === '') {
                return res.status(400).json({ error: 'Category name is required' });
            }
            if (name.trim().length > VALIDATION.TITLE_MAX_LENGTH) {
                return res.status(400).json({ error: `Category name must be ${VALIDATION.TITLE_MAX_LENGTH} characters or less` });
            }
            categories[categoryIndex].name = name.trim();
        }

        if (icon !== undefined) {
            if (typeof icon !== 'string') {
                return res.status(400).json({ error: 'Icon must be a string' });
            }
            categories[categoryIndex].icon = icon;
        }

        await writeJsonFile(req.profileFiles.categories, categories);
        res.json(categories[categoryIndex]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update category' });
    }
});

// DELETE category (reassign active tasks to category 1, leave archived untouched)
app.delete('/api/:profile/categories/:id', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const categoryId = Number(req.params.id);

        if (categoryId === DEFAULT_CATEGORY_ID) {
            return res.status(400).json({ error: 'Cannot delete the default category' });
        }

        const categories = await readJsonFile(req.profileFiles.categories, DEFAULT_CATEGORIES);
        const categoryIndex = categories.findIndex(c => c.id === categoryId);

        if (categoryIndex === -1) {
            return res.status(404).json({ error: 'Category not found' });
        }

        categories.splice(categoryIndex, 1);
        await writeJsonFile(req.profileFiles.categories, categories);

        // Reassign active tasks with deleted category to default
        const tasks = await readJsonFile(req.profileFiles.tasks, []);
        let tasksUpdated = false;
        for (const task of tasks) {
            if (task.category === categoryId) {
                task.category = DEFAULT_CATEGORY_ID;
                tasksUpdated = true;
            }
        }
        if (tasksUpdated) {
            await writeJsonFile(req.profileFiles.tasks, tasks);
        }

        // Archived tasks are left untouched (keep old category number)

        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete category' });
    }
});

// ===========================================
// SPA URL Routing
// ===========================================

// Root redirect: go to default profile
app.get('/', async (req, res) => {
    try {
        const profiles = await readJsonFile(PROFILES_FILE, []);
        if (profiles.length > 0) {
            normalizeProfileDefaults(profiles);
            const defaultProfile = profiles.find(p => p.isDefault === true) || profiles[0];
            res.redirect('/' + defaultProfile.alias);
        } else {
            res.redirect('/user1');
        }
    } catch (error) {
        res.status(500).send('Server error');
    }
});

// Profile URL: serve index.html if profile exists, else redirect to first profile
app.get('/:alias', async (req, res) => {
    const alias = req.params.alias;

    // Skip non-profile routes (static files, etc.)
    if (alias.includes('.')) {
        return res.status(404).send('Not found');
    }

    try {
        const profiles = await readJsonFile(PROFILES_FILE, []);
        const profile = profiles.find(p => p.alias === alias);

        if (profile) {
            res.sendFile(path.join(__dirname, 'public', 'index.html'));
        } else if (profiles.length > 0) {
            res.redirect('/' + profiles[0].alias);
        } else {
            res.redirect('/');
        }
    } catch (error) {
        res.status(500).send('Server error');
    }
});

// Start server
async function startServer() {
    await ensureDefaultProfile();
    app.listen(PORT, () => {
        console.log(`Task Tracker server running at http://localhost:${PORT}`);
    });
}

startServer();
