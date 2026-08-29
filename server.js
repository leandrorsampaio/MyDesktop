const express = require('./mini-server');
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
const AI_CONFIG_FILE = path.join(DATA_DIR, 'ai-config.json');

/**
 * AI provider registry.
 * format: 'anthropic' | 'openai-compatible'
 * Built-in providers have fixed baseUrl. Custom provider is user-defined.
 */
const AI_PROVIDERS = {
    anthropic: {
        label: 'Anthropic (Claude)',
        format: 'anthropic',
        baseUrl: 'https://api.anthropic.com',
        defaultModel: 'claude-haiku-4-5-20251001',
        requiresKey: true
    },
    openai: {
        label: 'OpenAI',
        format: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1',
        defaultModel: 'gpt-4o-mini',
        requiresKey: true
    },
    groq: {
        label: 'Groq',
        format: 'openai-compatible',
        baseUrl: 'https://api.groq.com/openai/v1',
        defaultModel: 'llama-3.3-70b-versatile',
        requiresKey: true
    },
    google: {
        label: 'Google AI Studio (Gemini)',
        format: 'openai-compatible',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
        defaultModel: 'gemini-2.0-flash',
        requiresKey: true
    },
    custom: {
        label: 'Custom / Local',
        format: 'openai-compatible',
        baseUrl: null,
        defaultModel: '',
        requiresKey: false
    }
};

/**
 * Maximum number of profiles allowed.
 * Source of truth: /public/js/constants.js
 */
const MAX_PROFILES = 20;

/** Regex for valid profile letters (1-3 uppercase) */
const PROFILE_LETTERS_REGEX = /^[A-Z]{1,3}$/;

// Middleware
app.use(express.json());
// Skip the static handler for API routes — no file under public/ can ever
// match /api/*, so the fs.stat lookup would be a guaranteed miss per request
const staticHandler = express.static(path.join(__dirname, 'public'));
app.use((req, res, next) => {
    if (req.pathname && req.pathname.startsWith('/api/')) return next();
    return staticHandler(req, res, next);
});

// ===========================================
// Rate Limiting (DIY - no external packages)
// ===========================================

/**
 * Rate limit configuration.
 * Generous limits since this is a local-only app.
 *
 * For tests: start the server with `RATE_LIMIT_DISABLED=1 node server.js`
 * to bypass the limiter entirely (headers are still emitted so header-presence
 * assertions keep working). The integration test suite trips the default
 * 30-writes/min budget otherwise.
 */
const RATE_LIMIT = {
    WINDOW_MS: 60 * 1000,    // 1 minute window
    MAX_REQUESTS: 100,        // Max requests per window (read operations)
    MAX_WRITES: 30            // Max write operations per window (POST/PUT/DELETE)
};
const RATE_LIMIT_DISABLED = process.env.RATE_LIMIT_DISABLED === '1';

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

        // Check limits (unless explicitly disabled for tests)
        const currentCount = isWriteOperation ? entry.writeCount : entry.count;
        if (!RATE_LIMIT_DISABLED && currentCount > maxRequests) {
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
// Stricter rate limiter for AI chat calls (external API, expensive)
const aiLimiter = createRateLimiter({ maxRequests: 10, isWriteOperation: true });

// Apply rate limiting to all API routes
app.use('/api/', readLimiter);

// Test-only: clear the rate limit counter store. Only registered when
// RATE_LIMIT_DISABLED=1 so it can't be reached in production.
if (RATE_LIMIT_DISABLED) {
    app.post('/api/_test/reset-rate-limit', (req, res) => {
        rateLimitStore.clear();
        res.json({ success: true });
    });
}

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

    // Story points validation — null clears the estimate
    if (data.points !== undefined && data.points !== null) {
        const points = Number(data.points);
        if (!STORY_POINTS.includes(points)) {
            errors.push(`Points must be null or one of ${STORY_POINTS.join(', ')}`);
        }
    }

    // Deadline validation
    if (data.deadline !== undefined) {
        if (data.deadline !== null) {
            if (typeof data.deadline !== 'string' || isNaN(Date.parse(data.deadline))) {
                errors.push('deadline must be a valid ISO datetime string or null');
            }
        }
    }

    // snoozeUntil validation
    if (data.snoozeUntil !== undefined) {
        if (data.snoozeUntil !== null) {
            if (typeof data.snoozeUntil !== 'string' || isNaN(Date.parse(data.snoozeUntil))) {
                errors.push('snoozeUntil must be a valid ISO datetime string or null');
            }
        }
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

/**
 * Atomic JSON write: write to a temp file, then rename into place. POSIX
 * rename is atomic for files on the same filesystem, so the target file
 * is either the old contents or the new contents — never partial or empty.
 * Survives process kill, OS crash, or write failure mid-stream. Cross-file
 * atomicity is still not guaranteed (no transactions on plain JSON), but
 * each individual file stays internally valid.
 *
 * @param {string} filePath - Absolute path to the file.
 * @param {*} data - JSON-serializable payload.
 * @param {Object} [opts]
 * @param {number} [opts.mode] - Optional file mode (e.g., 0o600 for owner-only).
 *                               Applied to the temp file before rename so the
 *                               restrictive mode is in place atomically.
 */
async function writeJsonFile(filePath, data, opts = {}) {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    try {
        await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), 'utf8');
        if (opts.mode) await fs.chmod(tmpPath, opts.mode);
        await fs.rename(tmpPath, filePath);
    } catch (err) {
        // Best-effort cleanup if rename never ran
        try { await fs.unlink(tmpPath); } catch {}
        throw err;
    }
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
 * Valid story-point values.
 *
 * A deliberately short modified-Fibonacci scale: 1 means "do it now", 13 means
 * "one to two days" and is the ceiling. Anything bigger is not a number, it's
 * a split — which is the primary job points do in a single-user tool. There is
 * no velocity, burndown or sprint reporting built on these, and there
 * shouldn't be: that is team ceremony.
 *
 * Source of truth: /public/js/constants.js
 */
const STORY_POINTS = [1, 2, 3, 5, 8, 13];

/** Longest free-text value on an epic's context fields. */
const EPIC_CONTEXT_MAX_LENGTH = 500;

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
 * ===========================================
 * Task attachments
 * ===========================================
 *
 * Files live on disk under `data/{alias}/attachments/{taskId}/{attachmentId}{ext}`
 * — outside `public/`, so the static handler can never reach them; the only way
 * out is the download route below. Metadata rides along on the task object
 * itself (like `log` does), which means archiving, restoring and exporting a
 * task carry its attachment list for free with no join and no second request.
 *
 * The user's filename is NEVER used as a path component. It is stored in the
 * JSON for display only; on disk a file is named by its generated id plus an
 * extension derived from the MIME allowlist.
 *
 * Tune the three limits below to taste — they are the only knobs.
 */

/** Largest single file accepted, in bytes. */
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;          // 5 MB

/** Most attachments one task may carry. */
const MAX_ATTACHMENTS_PER_TASK = 20;

/** Total attachment bytes one profile may store on disk. */
const MAX_PROFILE_ATTACHMENT_BYTES = 200 * 1024 * 1024;  // 200 MB

/** Longest original filename kept for display. */
const ATTACHMENT_NAME_MAX_LENGTH = 200;

/**
 * MIME types stored as declared. `inline` marks the ones safe to render in the
 * browser rather than force-download.
 *
 * `image/svg+xml` is deliberately absent: an SVG served from this origin can
 * execute script against the app, and every download here is same-origin.
 * Anything not listed still uploads fine — it is just stored as
 * application/octet-stream and can only ever be downloaded, never rendered.
 */
const ATTACHMENT_TYPES = {
    'image/png':       { ext: '.png',  inline: true  },
    'image/jpeg':      { ext: '.jpg',  inline: true  },
    'image/gif':       { ext: '.gif',  inline: true  },
    'image/webp':      { ext: '.webp', inline: true  },
    'image/avif':      { ext: '.avif', inline: true  },
    'application/pdf': { ext: '.pdf',  inline: true  },
    'text/plain':      { ext: '.txt',  inline: true  },
    'text/csv':        { ext: '.csv',  inline: false },
    'application/json':{ ext: '.json', inline: false },
    'application/zip': { ext: '.zip',  inline: false }
};

/** Fallback for any MIME type outside the allowlist. */
const ATTACHMENT_FALLBACK = { mime: 'application/octet-stream', ext: '.bin', inline: false };

/** Stored ids are base36 from generateId(); anything else never touches a path. */
const ATTACHMENT_ID_REGEX = /^[a-z0-9]{1,32}$/;
const ATTACHMENT_EXT_REGEX = /^\.[a-z0-9]{1,8}$/;

/**
 * Human-readable byte count for error messages.
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}

/**
 * Cleans an uploaded filename for display. Path separators, control characters
 * and leading dots are stripped — not because this value reaches the
 * filesystem (it never does), but so a hostile name can't misrepresent itself
 * in the UI or in a Content-Disposition header.
 * @param {string|undefined} rawHeader - Percent-encoded X-Attachment-Name value.
 * @returns {string}
 */
function sanitizeAttachmentName(rawHeader) {
    let name = '';
    try {
        name = decodeURIComponent(rawHeader || '');
    } catch {
        name = String(rawHeader || '');
    }
    name = name
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .replace(/[\\/]/g, '_')
        .replace(/^\.+/, '')
        .trim()
        .slice(0, ATTACHMENT_NAME_MAX_LENGTH);
    return name || 'attachment';
}

/**
 * Builds a Content-Disposition header for a download. RFC 6266: the plain
 * `filename` carries an ASCII-safe fallback for old clients, `filename*`
 * carries the real UTF-8 name. Quotes and backslashes are stripped from the
 * fallback so a crafted name can't inject extra header parameters.
 * @param {boolean} inline - Render in the browser instead of downloading.
 * @param {string} name - Original filename.
 * @returns {string}
 */
function buildContentDisposition(inline, name) {
    const safeName = String(name || 'attachment')
        .replace(/[^\x20-\x7e]/g, '_')
        .replace(/["\\]/g, '_');
    const disposition = inline ? 'inline' : 'attachment';
    return `${disposition}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(name || 'attachment')}`;
}

/** Directory holding one task's attachment files. */
function attachmentsDir(alias, taskId) {
    return path.join(DATA_DIR, alias, 'attachments', taskId);
}

/**
 * Absolute path of one stored attachment, or null when the metadata record is
 * malformed. Both components are re-validated here so a hand-edited JSON file
 * can't build a path outside the attachments directory.
 * @param {string} alias
 * @param {string} taskId
 * @param {{id: string, ext: string}} attachment
 * @returns {string|null}
 */
function attachmentFilePath(alias, taskId, attachment) {
    const id = attachment && attachment.id;
    const ext = (attachment && attachment.ext) || ATTACHMENT_FALLBACK.ext;
    if (!ATTACHMENT_ID_REGEX.test(id || '') || !ATTACHMENT_EXT_REGEX.test(ext)) return null;
    return path.join(attachmentsDir(alias, taskId), id + ext);
}

/**
 * Finds a task by id across every store it can live in: the board and backlog
 * (tasks.json), the archive (archived-tasks.json) and AI staging
 * (ai-staged-tasks.json). Attachments are keyed by task id alone, so a task
 * keeps its files as it moves between stores.
 * @param {Object} profileFiles - req.profileFiles
 * @param {string} taskId
 * @returns {Promise<{list: Array, index: number, filePath: string}|null>}
 */
async function findTaskInAnyStore(profileFiles, taskId) {
    for (const filePath of [profileFiles.tasks, profileFiles.archived, profileFiles.aiStaged]) {
        const list = await readJsonFile(filePath, []);
        const index = list.findIndex(t => t.id === taskId);
        if (index !== -1) return { list, index, filePath };
    }
    return null;
}

/**
 * Total bytes currently stored under a profile's attachments directory.
 * Measured from disk rather than summed from metadata so orphaned files still
 * count against the budget — this guards disk usage, not bookkeeping.
 * @param {string} alias
 * @returns {Promise<number>}
 */
async function profileAttachmentBytes(alias) {
    const root = path.join(DATA_DIR, alias, 'attachments');
    let taskDirs;
    try {
        taskDirs = await fs.readdir(root, { withFileTypes: true });
    } catch {
        return 0;   // no attachments directory yet
    }

    let total = 0;
    for (const dirent of taskDirs) {
        if (!dirent.isDirectory()) continue;
        const dir = path.join(root, dirent.name);
        let files;
        try {
            files = await fs.readdir(dir, { withFileTypes: true });
        } catch {
            continue;
        }
        for (const file of files) {
            if (!file.isFile()) continue;
            try {
                total += (await fs.stat(path.join(dir, file.name))).size;
            } catch { /* vanished mid-walk — not our problem */ }
        }
    }
    return total;
}

/**
 * Removes a task's whole attachment directory. Best effort: a failure here
 * leaves disk clutter but never breaks the delete that triggered it.
 * @param {string} alias
 * @param {string} taskId
 */
async function removeTaskAttachments(alias, taskId) {
    try {
        await fs.rm(attachmentsDir(alias, taskId), { recursive: true, force: true });
    } catch (err) {
        console.warn(`Attachment cleanup failed for task ${taskId}:`, err.message);
    }
}

/**
 * Re-keys a task's attachment directory when the task itself gets a new id
 * (promoting a staged task creates a new board/backlog task). Returns the
 * attachment metadata to copy onto the new task, or an empty array.
 * @param {string} alias
 * @param {string} fromTaskId
 * @param {string} toTaskId
 * @param {Array|undefined} attachments
 * @returns {Promise<Array>}
 */
async function moveTaskAttachments(alias, fromTaskId, toTaskId, attachments) {
    const list = Array.isArray(attachments) ? attachments : [];
    if (list.length === 0) return [];
    try {
        await fs.rename(attachmentsDir(alias, fromTaskId), attachmentsDir(alias, toTaskId));
        return list;
    } catch (err) {
        // The files stayed put but the task they belonged to is gone — drop the
        // metadata rather than hand the new task a list of dead links.
        console.warn(`Attachment move failed ${fromTaskId} -> ${toTaskId}:`, err.message);
        return [];
    }
}

/**
 * Default columns for every new profile.
 * IDs match legacy task status values so existing tasks need no migration.
 * Source of truth: /public/js/constants.js
 */
const DEFAULT_COLUMNS = [
    { id: 'todo',       name: 'To Do',       order: 0, hasArchive: false, isBacklog: false, celebrate: false },
    { id: 'wait',       name: 'Wait',        order: 1, hasArchive: false, isBacklog: false, celebrate: false },
    { id: 'inprogress', name: 'In Progress', order: 2, hasArchive: false, isBacklog: false, celebrate: false },
    { id: 'done',       name: 'Done',        order: 3, hasArchive: true,  isBacklog: false, celebrate: true  },
    { id: 'backlog',    name: 'Backlog',     order: 4, hasArchive: false, isBacklog: true,  celebrate: false }
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
    await writeJsonFile(path.join(profileDir, 'ai-staged-tasks.json'), []);
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

        // Auto-migrate: add default columns if the profile has none;
        // also backfill isBacklog field on existing columns and ensure a backlog column exists
        let profileModified = false;
        if (!profile.columns || profile.columns.length === 0) {
            profile.columns = DEFAULT_COLUMNS;
            profileModified = true;
        } else {
            for (const col of profile.columns) {
                if (col.isBacklog === undefined) {
                    col.isBacklog = false;
                    profileModified = true;
                }
            }
            // Backfill `celebrate` once: the last board column (highest order,
            // excluding the backlog) opts in, everything else opts out. This is
            // a one-time default, NOT a rule — once the field exists it is the
            // user's choice, so adding or reordering columns later must never
            // move the flag.
            if (profile.columns.some(col => col.celebrate === undefined)) {
                const lastBoardCol = profile.columns
                    .filter(col => !col.isBacklog)
                    .sort((a, b) => a.order - b.order)
                    .pop();
                for (const col of profile.columns) {
                    if (col.celebrate === undefined) {
                        col.celebrate = lastBoardCol ? col.id === lastBoardCol.id : false;
                    }
                }
                profileModified = true;
            }
            // Ensure a backlog column exists for existing profiles
            if (!profile.columns.some(c => c.isBacklog)) {
                profile.columns.push({
                    id: 'backlog',
                    name: 'Backlog',
                    order: profile.columns.length,
                    hasArchive: false,
                    isBacklog: true
                });
                profileModified = true;
            }
        }
        if (profileModified) {
            await writeJsonFile(PROFILES_FILE, profiles);
        }

        const profileDir = path.join(DATA_DIR, alias);
        req.profileFiles = {
            tasks: path.join(profileDir, 'tasks.json'),
            archived: path.join(profileDir, 'archived-tasks.json'),
            reports: path.join(profileDir, 'reports.json'),
            notes: path.join(profileDir, 'notes.json'),
            epics: path.join(profileDir, 'epics.json'),
            categories: path.join(profileDir, 'categories.json'),
            aiStaged: path.join(profileDir, 'ai-staged-tasks.json'),
            aiConversation: path.join(profileDir, 'ai-conversation.json'),
            aiProposals: path.join(profileDir, 'ai-proposals.json'),
            aiMemory: path.join(profileDir, 'ai-memory.json')
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

        // Remove profile data directory — best effort. If this fails the
        // profile is still gone from app state; the orphaned directory is
        // just disk clutter and doesn't break anything.
        const profileDir = path.join(DATA_DIR, alias);
        try {
            await fs.rm(profileDir, { recursive: true, force: true });
        } catch (rmErr) {
            console.warn(`Profile ${alias} removed; data directory cleanup failed:`, rmErr.message);
        }

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

        // Use status from body if it's a valid column ID, otherwise default to first column
        const validColumnIds = new Set(req.columns.map(c => c.id));
        const requestedStatus = req.body.status;
        const columnId = (requestedStatus && validColumnIds.has(requestedStatus))
            ? requestedStatus
            : req.columns[0].id;

        // Get max position in target column
        const defaultColTasks = tasks.filter(t => t.status === columnId);
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
            status: columnId,
            position: maxPosition,
            log: [],
            createdDate: new Date().toISOString(),
            deadline:    req.body.deadline    || null,
            snoozeUntil: req.body.snoozeUntil || null,
            points:      req.body.points != null ? Number(req.body.points) : null
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

        const { deadline, snoozeUntil, points } = req.body;
        if (deadline    !== undefined) tasks[taskIndex].deadline    = deadline    || null;
        if (snoozeUntil !== undefined) tasks[taskIndex].snoozeUntil = snoozeUntil || null;
        if (points      !== undefined) tasks[taskIndex].points      = points != null ? Number(points) : null;

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
        await removeTaskAttachments(req.params.profile, req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete task' });
    }
});

// ===========================================
// Task Attachments
// ===========================================

// Upload bodies arrive as raw bytes, not multipart/form-data: the client
// hands `fetch` the File object directly and puts the metadata in headers.
// No boundary parsing, no encoding overhead, no dependency.
app.raw('/api/:profile/tasks/:id/attachments');

// POST upload an attachment (raw body; name in X-Attachment-Name, type in Content-Type)
app.post('/api/:profile/tasks/:id/attachments', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const bytes = req.rawBody;
        if (!bytes || bytes.length === 0) {
            return res.status(400).json({ error: 'Empty upload' });
        }
        if (bytes.length > MAX_ATTACHMENT_SIZE) {
            return res.status(413).json({
                error: `File is larger than the ${formatBytes(MAX_ATTACHMENT_SIZE)} limit`
            });
        }

        const alias = req.params.profile;
        const taskId = req.params.id;

        const found = await findTaskInAnyStore(req.profileFiles, taskId);
        if (!found) return res.status(404).json({ error: 'Task not found' });

        const task = found.list[found.index];
        const existing = Array.isArray(task.attachments) ? task.attachments : [];
        if (existing.length >= MAX_ATTACHMENTS_PER_TASK) {
            return res.status(400).json({
                error: `Maximum of ${MAX_ATTACHMENTS_PER_TASK} attachments per task`
            });
        }

        const usedBytes = await profileAttachmentBytes(alias);
        if (usedBytes + bytes.length > MAX_PROFILE_ATTACHMENT_BYTES) {
            return res.status(400).json({
                error: `Attachment storage for this profile is full (${formatBytes(MAX_PROFILE_ATTACHMENT_BYTES)}). Delete some files first.`
            });
        }

        const declared = (req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        const known = ATTACHMENT_TYPES[declared];
        const attachment = {
            id: generateId(),
            name: sanitizeAttachmentName(req.headers['x-attachment-name']),
            mime: known ? declared : ATTACHMENT_FALLBACK.mime,
            ext: known ? known.ext : ATTACHMENT_FALLBACK.ext,
            size: bytes.length,
            uploadedAt: new Date().toISOString()
        };

        const destPath = attachmentFilePath(alias, taskId, attachment);
        await fs.mkdir(attachmentsDir(alias, taskId), { recursive: true });

        // Same write-then-rename dance as writeJsonFile: a killed process
        // leaves a .tmp behind, never a half-written attachment the metadata
        // already claims is complete. 0600 matches the app's other private data.
        const tmpPath = `${destPath}.${process.pid}.${Date.now()}.tmp`;
        await fs.writeFile(tmpPath, bytes, { mode: 0o600 });
        try {
            await fs.rename(tmpPath, destPath);
        } catch (err) {
            try { await fs.unlink(tmpPath); } catch {}
            throw err;
        }

        task.attachments = [...existing, attachment];
        try {
            await writeJsonFile(found.filePath, found.list);
        } catch (err) {
            // Metadata never landed, so nothing references this file — remove
            // it rather than leave a byte charge against the profile budget.
            try { await fs.unlink(destPath); } catch {}
            throw err;
        }

        res.status(201).json(attachment);
    } catch (error) {
        console.error('Error uploading attachment:', error);
        res.status(500).json({ error: 'Failed to upload attachment' });
    }
});

// GET download or preview an attachment. `?download=1` forces a save dialog
// even for types that would otherwise render in the browser.
app.get('/api/:profile/tasks/:id/attachments/:attachmentId', resolveProfile, async (req, res) => {
    try {
        const alias = req.params.profile;
        const taskId = req.params.id;

        const found = await findTaskInAnyStore(req.profileFiles, taskId);
        if (!found) return res.status(404).json({ error: 'Task not found' });

        const attachments = found.list[found.index].attachments || [];
        const attachment = attachments.find(a => a.id === req.params.attachmentId);
        if (!attachment) return res.status(404).json({ error: 'Attachment not found' });

        const filePath = attachmentFilePath(alias, taskId, attachment);
        if (!filePath || !(await fileExists(filePath))) {
            return res.status(404).json({ error: 'Attachment file is missing' });
        }

        const type = ATTACHMENT_TYPES[attachment.mime];
        const inline = Boolean(type && type.inline) && req.query.download !== '1';

        // nosniff keeps the browser from second-guessing the stored type and
        // rendering, say, a .bin as HTML in this app's own origin.
        res.set('Content-Type', attachment.mime || ATTACHMENT_FALLBACK.mime);
        res.set('X-Content-Type-Options', 'nosniff');
        res.set('Content-Disposition', buildContentDisposition(inline, attachment.name));
        // Content at a given attachment id never changes — only new ids appear.
        res.set('Cache-Control', 'private, max-age=31536000, immutable');
        res.sendFile(filePath);
    } catch (error) {
        console.error('Error reading attachment:', error);
        res.status(500).json({ error: 'Failed to read attachment' });
    }
});

// DELETE an attachment
app.delete('/api/:profile/tasks/:id/attachments/:attachmentId', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const alias = req.params.profile;
        const taskId = req.params.id;

        const found = await findTaskInAnyStore(req.profileFiles, taskId);
        if (!found) return res.status(404).json({ error: 'Task not found' });

        const task = found.list[found.index];
        const attachments = Array.isArray(task.attachments) ? task.attachments : [];
        const index = attachments.findIndex(a => a.id === req.params.attachmentId);
        if (index === -1) return res.status(404).json({ error: 'Attachment not found' });

        const [removed] = attachments.splice(index, 1);
        task.attachments = attachments;
        await writeJsonFile(found.filePath, found.list);

        // Metadata is the source of truth; the file is now unreferenced either
        // way, so unlink failures are logged rather than surfaced as an error.
        const filePath = attachmentFilePath(alias, taskId, removed);
        if (filePath) {
            try { await fs.unlink(filePath); } catch { /* already gone */ }
        }
        if (attachments.length === 0) {
            try { await fs.rmdir(attachmentsDir(alias, taskId)); } catch { /* not empty or absent */ }
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error deleting attachment:', error);
        res.status(500).json({ error: 'Failed to delete attachment' });
    }
});

// ===========================================
// Quick Capture
// ===========================================

/**
 * Longest captured note accepted. Anything past the title cap spills into the
 * description rather than being truncated away.
 */
const CAPTURE_MAX_LENGTH = 2000;

/**
 * POST capture a note as a task — the hallway-conversation path.
 *
 * Deliberately does NOT call the AI. Capture must be instant and must never
 * fail: this endpoint only writes a task and returns it. Classification is a
 * separate, optional, slower request the client fires afterwards.
 *
 * `needsFiling: true` marks it as unreviewed so the card shows a marker and a
 * later review pass can find it.
 */
app.post('/api/:profile/capture', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const raw = typeof req.body.text === 'string' ? req.body.text.trim() : '';
        if (!raw) {
            return res.status(400).json({ error: 'Capture text is required' });
        }
        if (raw.length > CAPTURE_MAX_LENGTH) {
            return res.status(400).json({ error: `Capture must be ${CAPTURE_MAX_LENGTH} characters or less` });
        }

        const tasks = await readJsonFile(req.profileFiles.tasks, []);

        // Land in the first non-backlog column. Classification may move it.
        const targetColumn = req.columns.find(c => !c.isBacklog) || req.columns[0];

        // Everything past the title cap is preserved in the description —
        // a captured note is the user's own words and must never be lost.
        const overflows = raw.length > VALIDATION.TITLE_MAX_LENGTH;

        for (const t of tasks) {
            if (t.status === targetColumn.id) t.position += 1;
        }

        const newTask = {
            id: generateId(),
            title: overflows ? raw.slice(0, VALIDATION.TITLE_MAX_LENGTH) : raw,
            description: overflows ? raw : '',
            priority: false,
            category: DEFAULT_CATEGORY_ID,
            epicId: null,
            status: targetColumn.id,
            position: 0,
            log: [{ date: new Date().toISOString().split('T')[0], action: 'Captured' }],
            createdDate: new Date().toISOString(),
            deadline: null,
            snoozeUntil: null,
            points: null,
            needsFiling: true
        };

        tasks.push(newTask);
        await writeJsonFile(req.profileFiles.tasks, tasks);
        res.status(201).json(newTask);
    } catch (error) {
        console.error('Capture failed:', error);
        res.status(500).json({ error: 'Failed to capture note' });
    }
});

/**
 * POST classify a captured task — the slow, optional half of capture.
 *
 * Every failure path leaves the task exactly as captured with `needsFiling`
 * still true. The caller treats this as best-effort: the note is already safe
 * on the board before this runs.
 */
app.post('/api/:profile/tasks/:id/classify', resolveProfile, aiLimiter, async (req, res) => {
    try {
        const tasks = await readJsonFile(req.profileFiles.tasks, []);
        const taskIndex = tasks.findIndex(t => t.id === req.params.id);
        if (taskIndex === -1) return res.status(404).json({ error: 'Task not found' });

        const resolved = await resolveActiveAiConfig();
        if (!resolved.ok) {
            // Not an error the user needs to act on mid-capture — the task
            // stands, it just keeps its "needs filing" marker.
            return res.status(200).json({ classified: false, reason: resolved.error, task: tasks[taskIndex] });
        }

        const [epics, categories] = await Promise.all([
            readJsonFile(req.profileFiles.epics, []),
            readJsonFile(req.profileFiles.categories, DEFAULT_CATEGORIES)
        ]);

        const task = tasks[taskIndex];
        const noteText = task.description || task.title;
        const systemPrompt = buildClassifyPrompt({
            epics, categories, columns: req.columns,
            today: new Date().toISOString().split('T')[0]
        });

        let toolInput;
        try {
            const call = resolved.providerMeta.format === 'anthropic'
                ? await callAnthropicAi(resolved.apiKey, resolved.model, systemPrompt,
                    [{ role: 'user', content: noteText }], [CLASSIFY_TASK_TOOL])
                : await callOpenAiCompatibleAi(resolved.baseUrl, resolved.apiKey, resolved.model, systemPrompt,
                    [{ role: 'user', content: noteText }], [CLASSIFY_TASK_TOOL]);
            toolInput = call.toolCalls.find(c => c.name === CLASSIFY_TASK_TOOL.name)?.input;
        } catch (aiErr) {
            return res.status(200).json({ classified: false, reason: aiErr.message, task });
        }

        if (!toolInput || typeof toolInput !== 'object') {
            return res.status(200).json({ classified: false, reason: 'Model returned no classification', task });
        }

        // Everything below is advisory input from a model — validate each field
        // against what this profile actually has before writing any of it.
        const validEpicIds = new Set(epics.map(e => e.id));
        const validCategoryIds = new Set(categories.map(c => c.id));
        const validColumnIds = new Set(req.columns.filter(c => !c.hasArchive).map(c => c.id));

        if (typeof toolInput.title === 'string') {
            const cleaned = toolInput.title.trim().slice(0, VALIDATION.TITLE_MAX_LENGTH);
            // Keep the original wording in the description when the title is
            // rewritten — the user's own phrasing is the record of what was said.
            if (cleaned && cleaned !== task.title) {
                if (!task.description) task.description = task.title;
                task.title = cleaned;
            }
        }
        if (typeof toolInput.epicId === 'string' && validEpicIds.has(toolInput.epicId)) {
            task.epicId = toolInput.epicId;
        }
        if (validCategoryIds.has(Number(toolInput.category))) {
            task.category = Number(toolInput.category);
        }
        if (typeof toolInput.priority === 'boolean') {
            task.priority = toolInput.priority;
        }
        if (STORY_POINTS.includes(Number(toolInput.points))) {
            task.points = Number(toolInput.points);
        }
        if (typeof toolInput.columnId === 'string' && validColumnIds.has(toolInput.columnId)
            && toolInput.columnId !== task.status) {
            const from = req.columns.find(c => c.id === task.status);
            const to   = req.columns.find(c => c.id === toolInput.columnId);
            for (const t of tasks) {
                if (t.id !== task.id && t.status === toolInput.columnId) t.position += 1;
            }
            task.status = toolInput.columnId;
            task.position = 0;
            task.log.push({
                date: new Date().toISOString().split('T')[0],
                action: `Filed into '${to.name}'${from ? ` from '${from.name}'` : ''}`
            });
        }
        if (typeof toolInput.deadline === 'string' && !isNaN(Date.parse(toolInput.deadline))) {
            task.deadline = new Date(toolInput.deadline).toISOString();
        }

        task.needsFiling = false;
        await writeJsonFile(req.profileFiles.tasks, tasks);
        res.json({ classified: true, task });
    } catch (error) {
        console.error('Classification failed:', error);
        res.status(500).json({ error: 'Failed to classify task' });
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
            if (!task.log) task.log = []; // legacy/imported tasks may lack the field
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

        // Capture IDs BEFORE mutating, since doneTasks holds references into tasks.
        // Filtering by `t.status !== 'done'` after the loop would keep them (status
        // is now 'archived'), and hardcoding 'done' breaks archive from other columns.
        const archivedIds = new Set(doneTasks.map(t => t.id));
        for (const task of doneTasks) {
            task.status = 'archived';
            // Store category name so it persists even if category is later deleted
            task.categoryName = categoryLookup.get(task.category || 1) || 'Non categorized';
            archivedTasks.push(task);
        }

        const activeTasks = tasks.filter(t => !archivedIds.has(t.id));

        // Write archived first: per-file writes are atomic but the pair is
        // not, so a crash between the two must fail toward a harmless
        // duplicate (task in both files) — never toward loss (task in neither)
        await writeJsonFile(req.profileFiles.archived, archivedTasks);
        await writeJsonFile(req.profileFiles.tasks, activeTasks);

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

// GET full profile data export — one JSON bundle of everything the profile
// owns. Backs the "your data, your machine" promise with a one-click export;
// restoring is manual for now (copy data/{alias}/ back, or import is a
// possible future feature).
app.get('/api/:profile/export', resolveProfile, async (req, res) => {
    try {
        const [tasks, archivedTasks, epics, categories, notes, reports, stagedTasks] = await Promise.all([
            readJsonFile(req.profileFiles.tasks, []),
            readJsonFile(req.profileFiles.archived, []),
            readJsonFile(req.profileFiles.epics, []),
            readJsonFile(req.profileFiles.categories, DEFAULT_CATEGORIES),
            readJsonFile(req.profileFiles.notes, { content: '' }),
            readJsonFile(req.profileFiles.reports, []),
            readJsonFile(req.profileFiles.aiStaged, [])
        ]);

        const date = new Date().toISOString().split('T')[0];
        // Content-Disposition lets the endpoint double as a direct download link
        res.set('Content-Disposition', `attachment; filename="mydesktop-${req.params.profile}-${date}.json"`);
        res.json({
            formatVersion: 1,
            exportedAt: new Date().toISOString(),
            profile: req.profile, // includes columns
            tasks,
            archivedTasks,
            epics,
            categories,
            notes,
            reports,
            stagedTasks
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to export profile data' });
    }
});

// POST restore archived task to the first column
app.post('/api/:profile/archived/:id/restore', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const taskId = req.params.id;

        const archivedTasks = await readJsonFile(req.profileFiles.archived, []);
        const taskIndex = archivedTasks.findIndex(t => t.id === taskId);

        if (taskIndex === -1) {
            return res.status(404).json({ error: 'Archived task not found' });
        }

        const task = archivedTasks[taskIndex];

        // First column (columns are already sorted by order via resolveProfile)
        const firstColumn = req.columns[0];
        if (!firstColumn) {
            return res.status(500).json({ error: 'No columns found for this profile' });
        }

        const tasks = await readJsonFile(req.profileFiles.tasks, []);

        // Re-index existing tasks in the first column to make room at position 0
        tasks.forEach(t => {
            if (t.status === firstColumn.id) {
                t.position = (t.position || 0) + 1;
            }
        });

        // Restore task: set status to first column, position 0
        task.status = firstColumn.id;
        task.position = 0;

        // Add restore log entry
        const today = new Date().toISOString().split('T')[0];
        if (!task.log) task.log = [];
        task.log.push({ date: today, action: 'Restored to board' });

        tasks.unshift(task);

        // Remove from archived
        archivedTasks.splice(taskIndex, 1);

        await writeJsonFile(req.profileFiles.tasks, tasks);
        await writeJsonFile(req.profileFiles.archived, archivedTasks);

        res.json({ task });
    } catch (error) {
        console.error('Restore error:', error);
        res.status(500).json({ error: 'Failed to restore task' });
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

/**
 * Validates an epic's context fields — the stakeholder, cadence and
 * expectations that turn an epic from a topic into a silo you manage.
 * All optional; empty string clears.
 * @param {Object} data - Request body
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateEpicContext(data) {
    const errors = [];
    for (const field of ['stakeholder', 'cadence', 'expectations']) {
        if (data[field] === undefined) continue;
        if (typeof data[field] !== 'string') {
            errors.push(`${field} must be a string`);
        } else if (data[field].length > EPIC_CONTEXT_MAX_LENGTH) {
            errors.push(`${field} must be ${EPIC_CONTEXT_MAX_LENGTH} characters or less`);
        }
    }
    return { valid: errors.length === 0, errors };
}

/**
 * Applies epic context fields from a request body onto an epic in place.
 * Shared by create and update so the two can't drift.
 * @param {Object} epic
 * @param {Object} data - Request body
 */
function applyEpicContext(epic, data) {
    for (const field of ['stakeholder', 'cadence', 'expectations']) {
        if (data[field] !== undefined) epic[field] = data[field].trim();
    }
}

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

        const contextValidation = validateEpicContext(req.body);
        if (!contextValidation.valid) {
            return res.status(400).json({ error: contextValidation.errors.join('; ') });
        }

        const alias = toCamelCase(name.trim());

        const newEpic = {
            id: generateId(),
            name: name.trim(),
            color,
            alias,
            // An epic is a silo you manage, not just a label: who asks about
            // it, how often, and what they expect. All optional.
            stakeholder: '',
            cadence: '',
            expectations: ''
        };
        applyEpicContext(newEpic, req.body);

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

        const contextValidation = validateEpicContext(req.body);
        if (!contextValidation.valid) {
            return res.status(400).json({ error: contextValidation.errors.join('; ') });
        }
        applyEpicContext(epics[epicIndex], req.body);

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

        const { name, isBacklog } = req.body;
        if (!name || typeof name !== 'string' || name.trim() === '') {
            return res.status(400).json({ error: 'Column name is required' });
        }
        if (name.trim().length > VALIDATION.TITLE_MAX_LENGTH) {
            return res.status(400).json({ error: `Column name must be ${VALIDATION.TITLE_MAX_LENGTH} characters or less` });
        }
        // Exactly one backlog column per profile — a second one breaks
        // task-status lookups and the backlog page's single-column assumption
        if (isBacklog && columns.some(c => c.isBacklog)) {
            return res.status(400).json({ error: 'Profile already has a backlog column' });
        }

        const newColumn = {
            id: generateId(),
            name: name.trim(),
            order: columns.length,
            hasArchive: false,
            isBacklog: isBacklog ? true : false,
            // Off by default: `celebrate` is a deliberate per-column choice, and
            // a column added after setup shouldn't silently steal the flag.
            celebrate: false
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

// PUT update a single column (rename / toggle hasArchive / toggle celebrate)
app.put('/api/:profile/columns/:id', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const columns = req.profile.columns;
        const colIndex = columns.findIndex(c => c.id === req.params.id);

        if (colIndex === -1) {
            return res.status(404).json({ error: 'Column not found' });
        }

        const { name, hasArchive, isBacklog, celebrate } = req.body;

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

        if (celebrate !== undefined) {
            columns[colIndex].celebrate = Boolean(celebrate);
        }

        // isBacklog is immutable after creation: unsetting it on the real
        // backlog column makes resolveProfile push a second column with
        // id "backlog" on the next request (duplicate ids), and setting it
        // on another column breaks the single-backlog invariant
        if (isBacklog !== undefined && Boolean(isBacklog) !== Boolean(columns[colIndex].isBacklog)) {
            return res.status(400).json({ error: 'isBacklog cannot be changed after creation' });
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

        // The incoming array must contain every existing column exactly once —
        // a subset (or a duplicate id padding the count) would silently drop
        // the omitted columns, orphaning their tasks and potentially deleting
        // the permanent backlog column
        const incomingIds = new Set(incomingColumns.map(c => c.id));
        if (incomingIds.size !== incomingColumns.length) {
            return res.status(400).json({ error: 'Duplicate column ids in reorder' });
        }
        for (const col of req.profile.columns) {
            if (!incomingIds.has(col.id)) {
                return res.status(400).json({ error: `Reorder is missing column: ${col.id}` });
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
        if (colIndex !== -1 && columns[colIndex].isBacklog) {
            return res.status(400).json({ error: 'Cannot delete the backlog column' });
        }
        if (colIndex === -1) {
            return res.status(404).json({ error: 'Column not found' });
        }

        // Guard: don't allow deleting the last NON-backlog column. The board
        // page filters out backlog columns, so leaving only backlog would
        // render an empty board with no way to add tasks via the UI.
        const nonBacklogCount = columns.filter(c => c.id !== req.params.id && !c.isBacklog).length;
        if (nonBacklogCount === 0) {
            return res.status(400).json({ error: 'Cannot delete the last board column' });
        }

        const deletedColumn = columns[colIndex];
        const sorted = [...columns].sort((a, b) => a.order - b.order);
        // Default column is first non-deleted, non-backlog column (board page
        // can't show backlog, so moving tasks there would hide them).
        const defaultColumn = sorted.find(c => c.id !== deletedColumn.id && !c.isBacklog);

        // Move all tasks in the deleted column to the default column
        const tasks = await readJsonFile(req.profileFiles.tasks, []);
        const today = new Date().toISOString().split('T')[0];
        let movedCount = 0;

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
                movedCount++;
            }
        }

        if (movedCount > 0) {
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
            movedCount,
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
// AI Helper Functions
// ===========================================

/**
 * Tool definition for structured task extraction.
 * Anthropic format — transformed for OpenAI-compatible providers in callOpenAiCompatibleAi().
 */
const PROPOSE_TASKS_TOOL = {
    name: 'propose_tasks',
    description: 'Propose structured task objects extracted from the conversation. Call this ONLY when the user is asking for tasks to be created. Do not call it when answering a question about the existing board — a question deserves an answer, not tickets.',
    input_schema: {
        type: 'object',
        properties: {
            tasks: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        title:       { type: 'string',  description: 'Task title, concise and actionable, max 200 chars' },
                        description: { type: 'string',  description: 'Optional details that do not fit in the title' },
                        priority:    { type: 'boolean', description: 'true only for explicitly urgent or blocking tasks' },
                        epicId:      { type: 'string',  description: 'Epic ID from the provided list if the task clearly belongs to it, otherwise omit' },
                        category:    { type: 'integer', description: 'Category ID from the provided list, default 1 (Non categorized)' },
                        deadline:    { type: 'string',  description: 'ISO 8601 datetime only if a specific date or time is explicitly mentioned, otherwise omit' }
                    },
                    required: ['title']
                }
            }
        },
        required: ['tasks']
    }
};

/**
 * Tool for classifying a single captured line into board fields.
 *
 * Deliberately separate from PROPOSE_TASKS_TOOL: quick capture runs on every
 * hallway note, so its prompt stays small (epics + categories + columns, no
 * board snapshot) and it answers about exactly one task.
 */
const CLASSIFY_TASK_TOOL = {
    name: 'classify_task',
    description: 'Classify one captured note into board fields. Always call this exactly once.',
    input_schema: {
        type: 'object',
        properties: {
            title:    { type: 'string',  description: 'A clean, actionable rewrite of the note (verb + object), max 200 chars. Omit if the original is already a good title.' },
            epicId:   { type: 'string',  description: 'Epic ID from the provided list, only when the note clearly belongs to it. Omit otherwise.' },
            category: { type: 'integer', description: 'Category ID from the provided list.' },
            priority: { type: 'boolean', description: 'true only when the note says it is urgent or blocking.' },
            points:   { type: 'integer', description: 'Rough size: 1 = minutes, 2 = under an hour, 3 = half a day, 5 = a day, 8 = nearly too big, 13 = one to two days (the ceiling). Omit when the note gives no idea of size.' },
            columnId: { type: 'string',  description: 'Destination column ID from the provided list.' },
            deadline: { type: 'string',  description: 'ISO 8601 datetime, only when a specific date or time is stated. Omit otherwise.' }
        },
        required: []
    }
};

/**
 * ===========================================
 * Long-term memory
 * ===========================================
 *
 * A short, curated list of durable facts about how this person works —
 * their sizing conventions, what an epic really means, which prefixes map to
 * which work. Injected on every call, which is what lets story points and epic
 * conventions compound instead of resetting each session.
 *
 * Deliberately a plain, hand-editable JSON list rather than an embedding
 * store: "your data, your machine" has to mean a file you can read, edit and
 * version — and a vector database would break the zero-dependency rule for a
 * board this size.
 *
 * The AI may *propose* entries but never adds one. Unapproved entries are
 * stored and shown for review; only approved entries reach the prompt.
 */
const MAX_MEMORIES = 40;

/** Longest single memory entry. Long enough for a sentence, not a paragraph. */
const MEMORY_TEXT_MAX_LENGTH = 300;

/**
 * Total approved-memory characters allowed into the prompt. Memory is sent on
 * every message alongside the board snapshot, so it needs its own ceiling.
 */
const MEMORY_PROMPT_BUDGET = 4000;

/**
 * Tool the AI uses to propose something worth remembering.
 *
 * Nothing it proposes is used until the user approves it on the config page —
 * the same propose-first rule the board changes follow.
 */
const PROPOSE_MEMORY_TOOL = {
    name: 'propose_memory',
    description: 'Propose a durable fact about how this person works, worth remembering across conversations — a naming convention, what an epic means, how they size things. Only for things that will still be true next month; never for one-off details about a single task. Proposals are reviewed by the user before they are used.',
    input_schema: {
        type: 'object',
        properties: {
            facts: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        text: { type: 'string', description: 'One sentence, stated as a fact. E.g. "ESB- prefixed tickets always belong to the ECOM epic."' }
                    },
                    required: ['text']
                }
            }
        },
        required: ['facts']
    }
};

/**
 * Normalises one raw memory entry from the model, or returns null.
 * @param {Object} raw
 * @returns {Object|null}
 */
function normaliseMemory(raw) {
    const text = raw && typeof raw.text === 'string' ? raw.text.trim() : '';
    if (!text) return null;
    return {
        id: generateId(),
        text: text.slice(0, MEMORY_TEXT_MAX_LENGTH),
        source: 'ai',
        approved: false,
        createdAt: new Date().toISOString()
    };
}

/**
 * Renders approved memories for the system prompt, within the budget.
 * @param {Array<Object>} memories
 * @returns {string} Empty string when there is nothing approved.
 */
function renderMemoryForPrompt(memories) {
    const lines = [];
    let budget = MEMORY_PROMPT_BUDGET;
    for (const memory of memories) {
        if (!memory.approved) continue;
        const line = `- ${memory.text}`;
        if (line.length > budget) break;
        budget -= line.length;
        lines.push(line);
    }
    return lines.join('\n');
}

/**
 * Proposal kinds the AI may put in the review buffer.
 *
 * Deliberately no 'create'. New tasks already have a reviewable flow — AI
 * staging — where they can be edited, cloned and promoted before anything
 * touches the board. A second creation path would be a worse experience, not
 * a richer one. Proposals are for changes to tasks that already exist.
 */
const PROPOSAL_KINDS = ['update', 'move', 'delete'];

/** Maximum proposals held in the review buffer at once. */
const MAX_PROPOSALS = 50;

/** Longest reason string stored with a proposal. */
const PROPOSAL_REASON_MAX_LENGTH = 300;

/**
 * The assistant's second verb: propose changes to tasks that already exist.
 *
 * Nothing here reaches the board. Each entry lands in the review buffer and
 * needs a human click to apply — see docs/design/AI_ASSISTANT.md § Principles.
 */
const PROPOSE_CHANGES_TOOL = {
    name: 'propose_changes',
    description: 'Propose changes to tasks that already exist on the board. Every proposal is reviewed by the user before it applies, so be specific and give a short reason. Use this when asked to reorganise, reschedule, re-file, tidy up or remove existing work. Do NOT use it to create new tasks.',
    input_schema: {
        type: 'object',
        properties: {
            changes: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        kind:   { type: 'string', enum: PROPOSAL_KINDS, description: 'update = change fields; move = change column; delete = remove the task' },
                        taskId: { type: 'string', description: 'ID of the existing task, exactly as shown in the board listing' },
                        reason: { type: 'string', description: 'One short line on why. Shown to the user next to the change.' },
                        title:       { type: 'string',  description: 'update only — new title' },
                        description: { type: 'string',  description: 'update only — new description' },
                        priority:    { type: 'boolean', description: 'update only — new priority flag' },
                        category:    { type: 'integer', description: 'update only — new category ID' },
                        epicId:      { type: 'string',  description: 'update only — new epic ID, or empty string to clear' },
                        points:      { type: 'integer', description: 'update only — new size (1, 2, 3, 5, 8, 13)' },
                        deadline:    { type: 'string',  description: 'update only — ISO 8601 datetime, or empty string to clear' },
                        newStatus:   { type: 'string',  description: 'move only — destination column ID' }
                    },
                    required: ['kind', 'taskId', 'reason']
                }
            }
        },
        required: ['changes']
    }
};

/**
 * Builds the quick-capture classification prompt. Board-free by design — this
 * runs on every captured note and must stay cheap.
 * @param {Object} ctx
 * @param {Array<Object>} ctx.epics
 * @param {Array<Object>} ctx.categories
 * @param {Array<Object>} ctx.columns
 * @param {string} ctx.today - ISO date, so relative dates resolve correctly
 * @returns {string}
 */
function buildClassifyPrompt({ epics, categories, columns, today }) {
    const epicsStr = epics.length
        ? epics.map(e => {
            const bits = [e.stakeholder && `stakeholder: ${e.stakeholder}`].filter(Boolean);
            return `  - "${e.name}" (id: "${e.id}")${bits.length ? ` — ${bits.join(', ')}` : ''}`;
        }).join('\n')
        : '  (none defined yet)';

    // Done/in-progress columns are never a sensible destination for something
    // that was captured seconds ago and not started.
    const destinations = columns.filter(c => !c.hasArchive);
    const colsStr = destinations
        .map(c => `  - "${c.name}" (id: "${c.id}")${c.isBacklog ? ' — use for someday/maybe items' : ''}`)
        .join('\n');

    return `You classify a single note that someone jotted down in a hurry — typically something a colleague asked them to do in passing.

Today is ${today}.

Call classify_task exactly once. Be decisive: a slightly wrong guess is fine, because the user reviews these later. Leaving everything blank is worse than guessing.

# Epics
${epicsStr}

# Categories
${categories.map(c => `  - "${c.name}" (id: ${c.id})`).join('\n')}

# Destination columns
${colsStr}

Rules:
- title: rewrite into a short actionable phrase (verb + object). Omit if the note already reads as one.
- epicId: only when the note clearly belongs to that epic. Omit when unsure.
- category: pick the closest; default ${DEFAULT_CATEGORY_ID} when nothing matches.
- priority: true only when urgency is explicit.
- points: one of ${STORY_POINTS.join(', ')}. 13 is the ceiling — anything that sounds bigger should be captured as-is and split later, not given a bigger number. Omit when the note gives no sense of size.
- columnId: the default working column unless the note clearly says it is for later (then the backlog) or for today.
- deadline: only when a specific date or time is stated.`;
}

/**
 * Renders the board as a compact text table for the system prompt.
 *
 * Deliberately NOT raw JSON: field names repeated on every card cost several
 * times what a positional table does, and the snapshot is re-sent on every
 * message — it is the single largest cost driver in the feature.
 *
 * Scope is the live board plus backlog titles. Descriptions, activity logs,
 * attachments and the archive are excluded; they are loaded on demand rather
 * than carried in every request.
 *
 * @param {Array<Object>} columns - Profile columns, sorted by order
 * @param {Array<Object>} tasks - Active tasks
 * @param {Map<string, Object>} epicById
 * @param {Map<number, Object>} categoryById
 * @returns {string}
 */
function buildBoardSnapshot(columns, tasks, epicById, categoryById) {
    const now = Date.now();
    const dayseSince = (iso) => {
        const t = Date.parse(iso || '');
        return isNaN(t) ? '?' : Math.round((now - t) / 86400000);
    };

    // Only columns that actually exist can hold board cards. Tasks whose status
    // matches no column are legacy rows (see AI_ASSISTANT.md § Known issue) —
    // excluding them keeps the snapshot honest and small.
    const columnById = new Map(columns.map(c => [c.id, c]));
    const lines = [];

    for (const col of columns) {
        const colTasks = tasks
            .filter(t => t.status === col.id)
            .sort((a, b) => a.position - b.position);

        lines.push(`## ${col.name}${col.isBacklog ? ' (backlog)' : ''} — ${colTasks.length}`);
        if (colTasks.length === 0) {
            lines.push('  (empty)');
            continue;
        }
        for (const t of colTasks) {
            const bits = [];
            if (t.epicId && epicById.has(t.epicId)) bits.push(epicById.get(t.epicId).name);
            const cat = categoryById.get(t.category);
            if (cat && t.category !== DEFAULT_CATEGORY_ID) bits.push(cat.name);
            if (t.points) bits.push(`${t.points}pt`);
            if (t.priority) bits.push('priority');
            if (t.deadline) bits.push(`due ${String(t.deadline).split('T')[0]}`);
            bits.push(`${dayseSince(t.createdDate)}d old`);
            if (Array.isArray(t.attachments) && t.attachments.length) {
                bits.push(`${t.attachments.length} file${t.attachments.length === 1 ? '' : 's'}`);
            }
            lines.push(`  [${t.id}] ${t.title} — ${bits.join(', ')}`);
        }
    }

    const orphaned = tasks.filter(t => !columnById.has(t.status)).length;
    if (orphaned > 0) {
        lines.push(`\n(${orphaned} legacy tasks with no matching column are excluded from this view.)`);
    }

    return lines.join('\n');
}

/**
 * Builds the AI system prompt, injecting the current board plus the profile's
 * epics and categories.
 * @param {Object} ctx
 * @param {Array<Object>} ctx.epics
 * @param {Array<Object>} ctx.categories
 * @param {Array<Object>} ctx.columns
 * @param {Array<Object>} ctx.tasks
 * @returns {string}
 */
function buildAiSystemPromptWithBoard({ epics, categories, columns, tasks, memories = [] }) {
    const epicById = new Map(epics.map(e => [e.id, e]));
    const categoryById = new Map(categories.map(c => [c.id, c]));

    const epicsStr = epics.length
        ? epics.map(e => {
            // Context fields are optional and absent on older profiles, so
            // they are only rendered when actually set. They are what let the
            // model reason about stakeholders rather than just topics.
            const ctxBits = [
                e.stakeholder && `stakeholder: ${e.stakeholder}`,
                e.cadence && `cadence: ${e.cadence}`,
                e.expectations && `expects: ${e.expectations}`
            ].filter(Boolean);
            const suffix = ctxBits.length ? `\n      ${ctxBits.join(' | ')}` : '';
            return `  - "${e.name}" (id: "${e.id}")${suffix}`;
        }).join('\n')
        : '  (none defined yet)';

    const catsStr = categories.map(c => `  - "${c.name}" (id: ${c.id})`).join('\n');
    const columnsStr = columns.map(c => `  - "${c.name}" (id: "${c.id}")${c.isBacklog ? ' [backlog]' : ''}`).join('\n');

    const memoryStr = renderMemoryForPrompt(memories);

    return `You are a task management assistant built into a personal kanban tool. You are talking to the single person who owns this board.

You can see their whole board below. Use it. When they ask a question about their work, answer it from the board — do not invent tasks, and do not turn every conversation into ticket creation.

You have two tools:
- propose_tasks() — for NEW work the user wants captured (e.g. they paste meeting notes, or ask you to add something).
- propose_changes() — for changes to tasks that ALREADY exist: re-filing, rescheduling, resizing, moving between columns, or removing duplicates. Reference tasks by the id shown in square brackets in the board listing below.

Call neither when the user is simply asking a question — a question deserves a direct answer, not tickets.

Nothing you propose is applied automatically. Every proposal is reviewed by the user first, so be specific and give a short reason for each change.

If you notice something durable about how this person works — a naming convention, what an epic really covers, how they size things — call propose_memory() so it is remembered next time. Only for things that will still be true next month, and never for details about one task.

Be concise. This is a personal tool, not a report generator.

${memoryStr ? `# What you already know about how they work
${memoryStr}
` : ''}
# Columns
${columnsStr}

# Epics
${epicsStr}

# Categories
${catsStr}

# Current board
${buildBoardSnapshot(columns, tasks, epicById, categoryById)}

# Task creation rules (when proposing tasks)
- Set priority: true only for explicitly urgent or blocking tasks
- Set epicId to the matching epic's id only if the content clearly relates to it
- Set deadline only if a specific date or time is explicitly stated (ISO 8601)
- Keep titles concise and actionable (verb + object, e.g. "Update API documentation")
- Use description for details that do not fit in the title
- Default category is ${DEFAULT_CATEGORY_ID} (Non categorized) when nothing matches`;
}

/**
 * Legacy prompt builder — board-free. Kept for the quick-capture classification
 * path, which only needs epics and categories and should stay cheap.
 * @param {Array<Object>} epics
 * @param {Array<Object>} categories
 * @returns {string}
 */
function buildAiSystemPrompt(epics, categories) {
    const epicsStr = epics.length
        ? epics.map(e => `  - "${e.name}" (id: "${e.id}")`).join('\n')
        : '  (none defined yet)';

    const catsStr = categories
        .map(c => `  - "${c.name}" (id: ${c.id})`)
        .join('\n');

    return `You are a task management assistant for a personal kanban tool.
Your job is to help the user extract actionable tasks from unstructured text (meeting notes, emails, brain dumps) and have natural conversations about their work.

Call propose_tasks() with the tasks you extract. If the text contains nothing actionable, pass an empty array.

Available epics for this profile:
${epicsStr}

Available categories:
${catsStr}

Task creation rules:
- Set priority: true only for explicitly urgent or blocking tasks
- Set epicId to the matching epic's id only if the content clearly relates to it
- Set deadline only if a specific date or time is explicitly stated in the text (ISO 8601)
- Keep titles concise and actionable (verb + object, e.g. "Update API documentation")
- Use description for details that do not fit in the title
- Default category is 1 (Non categorized) when nothing matches`;
}

/**
 * Validates and normalises one raw proposal from the model into a stored
 * proposal, or null when it is unusable.
 *
 * Everything here is untrusted model output. A proposal that references a
 * task, column, epic or category this profile doesn't have is dropped rather
 * than stored — a review buffer full of un-appliable rows is worse than a
 * shorter honest one.
 *
 * @param {Object} raw - One entry from the propose_changes tool call
 * @param {Object} ctx
 * @param {Set<string>} ctx.validTaskIds
 * @param {Set<string>} ctx.validColumnIds
 * @param {Set<string>} ctx.validEpicIds
 * @param {Set<number>} ctx.validCategoryIds
 * @returns {Object|null}
 */
function normaliseProposal(raw, { validTaskIds, validColumnIds, validEpicIds, validCategoryIds }) {
    if (!raw || typeof raw !== 'object') return null;
    if (!PROPOSAL_KINDS.includes(raw.kind)) return null;
    if (typeof raw.taskId !== 'string' || !validTaskIds.has(raw.taskId)) return null;

    const reason = typeof raw.reason === 'string'
        ? raw.reason.trim().slice(0, PROPOSAL_REASON_MAX_LENGTH)
        : '';

    const proposal = {
        id: generateId(),
        kind: raw.kind,
        taskId: raw.taskId,
        reason,
        payload: {},
        createdAt: new Date().toISOString()
    };

    if (raw.kind === 'move') {
        if (typeof raw.newStatus !== 'string' || !validColumnIds.has(raw.newStatus)) return null;
        proposal.payload.newStatus = raw.newStatus;
        return proposal;
    }

    if (raw.kind === 'delete') {
        return proposal;   // no payload
    }

    // update — keep only the fields that are present AND valid
    const p = proposal.payload;
    if (typeof raw.title === 'string' && raw.title.trim()) {
        p.title = raw.title.trim().slice(0, VALIDATION.TITLE_MAX_LENGTH);
    }
    if (typeof raw.description === 'string') {
        p.description = raw.description.slice(0, VALIDATION.DESCRIPTION_MAX_LENGTH);
    }
    if (typeof raw.priority === 'boolean') p.priority = raw.priority;
    if (validCategoryIds.has(Number(raw.category))) p.category = Number(raw.category);
    if (typeof raw.epicId === 'string') {
        // Empty string is a deliberate "clear the epic", not a bad value.
        if (raw.epicId === '') p.epicId = null;
        else if (validEpicIds.has(raw.epicId)) p.epicId = raw.epicId;
    }
    if (STORY_POINTS.includes(Number(raw.points))) p.points = Number(raw.points);
    if (typeof raw.deadline === 'string') {
        if (raw.deadline === '') p.deadline = null;
        else if (!isNaN(Date.parse(raw.deadline))) p.deadline = new Date(raw.deadline).toISOString();
    }

    // An update that changes nothing is noise in the review list.
    if (Object.keys(p).length === 0) return null;
    return proposal;
}

/**
 * Applies one proposal to the task list, in place.
 *
 * Runs the same validators the equivalent hand-driven routes run
 * (`validateTaskInput`, `validateMoveInput`) rather than trusting what was
 * stored: the board's state may have moved on since the proposal was made, so
 * a stored proposal is re-checked at apply time, not just at write time.
 *
 * @param {Array<Object>} tasks - Mutated in place
 * @param {Object} proposal
 * @param {Object} ctx
 * @param {Array<Object>} ctx.columns
 * @param {Set<number>} ctx.validCategoryIds
 * @param {Map<number, string>} ctx.categoryNames
 * @returns {{ok: true, task: Object|null} | {ok: false, error: string}}
 */
function applyProposal(tasks, proposal, { columns, validCategoryIds, categoryNames }) {
    const index = tasks.findIndex(t => t.id === proposal.taskId);
    if (index === -1) {
        return { ok: false, error: 'That task no longer exists' };
    }
    const task = tasks[index];
    const today = new Date().toISOString().split('T')[0];

    if (proposal.kind === 'delete') {
        tasks.splice(index, 1);
        return { ok: true, task: null };
    }

    if (proposal.kind === 'move') {
        const validColumnIds = new Set(columns.map(c => c.id));
        const validation = validateMoveInput({ newStatus: proposal.payload.newStatus }, validColumnIds);
        if (!validation.valid) return { ok: false, error: validation.errors.join('; ') };

        const from = columns.find(c => c.id === task.status);
        const to   = columns.find(c => c.id === proposal.payload.newStatus);
        if (task.status === to.id) return { ok: false, error: 'Task is already in that column' };

        for (const t of tasks) {
            if (t.id !== task.id && t.status === to.id) t.position += 1;
        }
        task.status = to.id;
        task.position = 0;
        if (!task.log) task.log = [];
        task.log.push({ date: today, action: `Moved from '${from ? from.name : '?'}' to '${to.name}'` });
        return { ok: true, task };
    }

    // update
    const validation = validateTaskInput(proposal.payload, { requireTitle: false, validCategoryIds });
    if (!validation.valid) return { ok: false, error: validation.errors.join('; ') };

    const p = proposal.payload;
    if (p.title       !== undefined) task.title = p.title.trim();
    if (p.description !== undefined) task.description = p.description.trim();
    if (p.priority    !== undefined) task.priority = Boolean(p.priority);
    if (p.epicId      !== undefined) task.epicId = p.epicId || null;
    if (p.points      !== undefined) task.points = p.points;
    if (p.deadline    !== undefined) task.deadline = p.deadline || null;
    if (p.category    !== undefined) {
        const newCategory = Number(p.category);
        const oldCategory = task.category || DEFAULT_CATEGORY_ID;
        // Same logging rule the hand-driven PUT route follows
        if (newCategory !== oldCategory) {
            if (!task.log) task.log = [];
            task.log.push({
                date: today,
                action: `Category changed from ${categoryNames.get(oldCategory) || 'Non categorized'} to ${categoryNames.get(newCategory) || 'Non categorized'}`
            });
        }
        task.category = newCategory;
    }

    return { ok: true, task };
}

/**
 * Resolves the active AI configuration into everything a provider call needs.
 * @returns {Promise<{ok: true, cfg: Object, providerMeta: Object, model: string,
 *                     apiKey: string, baseUrl: string}
 *                  | {ok: false, status: number, error: string}>}
 */
async function resolveActiveAiConfig() {
    const aiConfig = migrateAiConfig(await readJsonFile(AI_CONFIG_FILE, {}));
    const cfg = (aiConfig.configs || []).find(c => c.id === aiConfig.activeConfigId);
    if (!cfg) {
        return { ok: false, status: 400, error: 'No active AI configuration. Add one via Config → AI Configuration.' };
    }
    const providerMeta = AI_PROVIDERS[cfg.provider];
    if (!providerMeta) {
        return { ok: false, status: 400, error: 'Unknown AI provider in config.' };
    }
    if (providerMeta.requiresKey && !cfg.apiKey) {
        return { ok: false, status: 400, error: 'API key not set for this provider. Configure it via Config → AI Configuration.' };
    }
    return {
        ok: true,
        cfg,
        providerMeta,
        model: cfg.model,
        apiKey: cfg.apiKey || '',
        baseUrl: cfg.provider === 'custom' ? cfg.baseUrl : providerMeta.baseUrl
    };
}

/**
 * Attempts to extract tasks JSON from a plain-text response (fallback when tool use fails).
 * Looks for a JSON block containing a "tasks" array.
 * @param {string} text
 * @returns {Array<Object>} extracted tasks or []
 */
function extractTasksFromText(text) {
    try {
        // Try ```json ... ``` block first
        const fenced = text.match(/```json\s*([\s\S]*?)\s*```/);
        if (fenced) {
            const parsed = JSON.parse(fenced[1]);
            if (Array.isArray(parsed.tasks)) return parsed.tasks;
            if (Array.isArray(parsed)) return parsed;
        }
        // Try bare { "tasks": [...] } anywhere in the text
        const bare = text.match(/\{[\s\S]*"tasks"\s*:\s*\[[\s\S]*?\]\s*\}/);
        if (bare) {
            const parsed = JSON.parse(bare[0]);
            if (Array.isArray(parsed.tasks)) return parsed.tasks;
        }
    } catch {
        // Parsing failed — return empty
    }
    return [];
}

/**
 * Incrementally splits a byte stream into complete SSE events.
 *
 * Server-sent events are newline-delimited and a network chunk can end
 * anywhere — mid-line, mid-event, mid-UTF-8-character. This keeps the tail of
 * an incomplete line in `buffer` until the rest arrives, which is the whole
 * reason it exists as its own function: getting it wrong silently truncates
 * the model's output.
 *
 * Source of truth: /public/js/utils.js — duplicated here because server.js
 * runs in Node.js and cannot import ES modules from /public. Change both.
 *
 * @param {string} buffer - Leftover text from the previous chunk
 * @param {string} chunk - Newly decoded text
 * @returns {{events: Array<{event: string|null, data: string}>, buffer: string}}
 */
function parseSseChunk(buffer, chunk) {
    const text = buffer + chunk;
    // Events are separated by a blank line. Tolerate CRLF as well as LF.
    const parts = text.split(/\r?\n\r?\n/);
    const remainder = parts.pop();   // possibly incomplete — keep for next time

    const events = [];
    for (const part of parts) {
        if (!part.trim()) continue;
        let eventName = null;
        const dataLines = [];
        for (const line of part.split(/\r?\n/)) {
            if (line.startsWith('event:')) eventName = line.slice(6).trim();
            else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
            // Comment lines (":" prefixed) and unknown fields are ignored.
        }
        if (dataLines.length > 0) {
            events.push({ event: eventName, data: dataLines.join('\n') });
        }
    }
    return { events, buffer: remainder };
}

/**
 * Accumulates streamed tool-call fragments into finished tool calls.
 *
 * Both providers stream a tool's JSON arguments as a series of string
 * fragments, so nothing can be parsed until the stream ends. This collects
 * them by index and parses once at the end — a fragment that never completes
 * is dropped rather than throwing, so a truncated tool call can't take the
 * whole reply with it.
 */
class ToolCallAccumulator {
    constructor() {
        /** @type {Map<number|string, {name: string, json: string}>} */
        this._calls = new Map();
    }

    /**
     * @param {number|string} index - Provider's block/tool index
     * @param {string|null} name - Set on the first fragment
     * @param {string} jsonFragment
     */
    push(index, name, jsonFragment = '') {
        if (!this._calls.has(index)) this._calls.set(index, { name: name || '', json: '' });
        const call = this._calls.get(index);
        if (name) call.name = name;
        call.json += jsonFragment;
    }

    /** @returns {Array<{name: string, input: Object}>} */
    finish() {
        const out = [];
        for (const call of this._calls.values()) {
            if (!call.name) continue;
            try {
                out.push({ name: call.name, input: call.json ? JSON.parse(call.json) : {} });
            } catch {
                // Incomplete or malformed arguments — skip this call, keep the rest.
            }
        }
        return out;
    }
}

/**
 * Calls the Anthropic Messages API.
 * @returns {Promise<{ narrative: string, rawTasks: Array<Object> }>}
 */
async function callAnthropicAi(apiKey, model, systemPrompt, messages, tools = [PROPOSE_TASKS_TOOL]) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            model,
            max_tokens: 4096,
            system: systemPrompt,
            messages,
            tools
        })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `Anthropic API error ${response.status}`);
    }

    const data = await response.json();
    let narrative = '';
    let rawTasks = [];
    // Every tool call the model made, in order: { name, input }. A single
    // turn may legitimately both propose tasks and propose changes.
    const toolCalls = [];
    // Surfaced to the client so the cost of the board snapshot stays visible.
    const usage = {
        inputTokens:  data.usage?.input_tokens  ?? null,
        outputTokens: data.usage?.output_tokens ?? null
    };

    for (const block of (data.content || [])) {
        if (block.type === 'text') {
            narrative += (narrative ? '\n' : '') + block.text;
        } else if (block.type === 'tool_use') {
            toolCalls.push({ name: block.name, input: block.input || {} });
            if (block.name === PROPOSE_TASKS_TOOL.name) rawTasks = block.input?.tasks || [];
        }
    }

    if (!rawTasks.length && narrative) {
        rawTasks = extractTasksFromText(narrative);
    }

    return { narrative: narrative.trim(), rawTasks, toolCalls, usage };
}

/**
 * Streaming Anthropic call. Narrative text is handed to `onText` as it
 * arrives; tool calls are accumulated and returned once the stream ends,
 * because their arguments are only valid JSON when complete.
 *
 * @param {Function} onText - Called with each text delta
 * @returns {Promise<{narrative: string, rawTasks: Array, toolCalls: Array, usage: Object}>}
 */
async function streamAnthropicAi(apiKey, model, systemPrompt, messages, tools, onText) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json'
        },
        body: JSON.stringify({ model, max_tokens: 4096, system: systemPrompt, messages, tools, stream: true })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `Anthropic API error ${response.status}`);
    }

    const accumulator = new ToolCallAccumulator();
    const usage = { inputTokens: null, outputTokens: null };
    let narrative = '';

    await readSseStream(response, (event) => {
        let payload;
        try { payload = JSON.parse(event.data); } catch { return; }

        switch (payload.type) {
            case 'message_start':
                usage.inputTokens = payload.message?.usage?.input_tokens ?? null;
                break;
            case 'content_block_start':
                if (payload.content_block?.type === 'tool_use') {
                    accumulator.push(payload.index, payload.content_block.name);
                }
                break;
            case 'content_block_delta':
                if (payload.delta?.type === 'text_delta') {
                    narrative += payload.delta.text;
                    onText(payload.delta.text);
                } else if (payload.delta?.type === 'input_json_delta') {
                    accumulator.push(payload.index, null, payload.delta.partial_json || '');
                }
                break;
            case 'message_delta':
                if (payload.usage?.output_tokens != null) usage.outputTokens = payload.usage.output_tokens;
                break;
        }
    });

    const toolCalls = accumulator.finish();
    const proposeTasks = toolCalls.find(c => c.name === PROPOSE_TASKS_TOOL.name);
    let rawTasks = proposeTasks?.input?.tasks || [];
    if (!rawTasks.length && narrative) rawTasks = extractTasksFromText(narrative);

    return { narrative: narrative.trim(), rawTasks, toolCalls, usage };
}

/**
 * Streaming OpenAI-compatible call. Same contract as the Anthropic version.
 */
async function streamOpenAiCompatibleAi(baseUrl, apiKey, model, systemPrompt, messages, tools, onText) {
    const openAiTools = tools.map(t => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.input_schema }
    }));

    const response = await fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
            'authorization': `Bearer ${apiKey || 'none'}`,
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            model,
            messages: [{ role: 'system', content: systemPrompt }, ...messages],
            tools: openAiTools,
            tool_choice: 'auto',
            stream: true,
            // Not every OpenAI-compatible server honours this; usage stays
            // null when it doesn't, which the client renders as no counter.
            stream_options: { include_usage: true }
        })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `AI provider error ${response.status}`);
    }

    const accumulator = new ToolCallAccumulator();
    const usage = { inputTokens: null, outputTokens: null };
    let narrative = '';

    await readSseStream(response, (event) => {
        if (event.data === '[DONE]') return;
        let payload;
        try { payload = JSON.parse(event.data); } catch { return; }

        if (payload.usage) {
            usage.inputTokens  = payload.usage.prompt_tokens     ?? usage.inputTokens;
            usage.outputTokens = payload.usage.completion_tokens ?? usage.outputTokens;
        }

        const delta = payload.choices?.[0]?.delta;
        if (!delta) return;

        if (typeof delta.content === 'string' && delta.content) {
            narrative += delta.content;
            onText(delta.content);
        }
        for (const call of (delta.tool_calls || [])) {
            accumulator.push(
                call.index ?? 0,
                call.function?.name || null,
                call.function?.arguments || ''
            );
        }
    });

    const toolCalls = accumulator.finish();
    const proposeTasks = toolCalls.find(c => c.name === PROPOSE_TASKS_TOOL.name);
    let rawTasks = proposeTasks?.input?.tasks || [];
    if (!rawTasks.length && narrative) rawTasks = extractTasksFromText(narrative);

    return { narrative: narrative.trim(), rawTasks, toolCalls, usage };
}

/**
 * Reads a fetch Response body as SSE, invoking `onEvent` per complete event.
 * @param {Response} response
 * @param {Function} onEvent
 */
async function readSseStream(response, onEvent) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        // stream: true keeps multi-byte characters intact across chunks
        const parsed = parseSseChunk(buffer, decoder.decode(value, { stream: true }));
        buffer = parsed.buffer;
        for (const event of parsed.events) onEvent(event);
    }
}

/**
 * Calls any OpenAI-compatible API (OpenAI, Groq, LM Studio, Ollama /v1, etc.).
 * @returns {Promise<{ narrative: string, rawTasks: Array<Object> }>}
 */
async function callOpenAiCompatibleAi(baseUrl, apiKey, model, systemPrompt, messages, tools = [PROPOSE_TASKS_TOOL]) {
    // Transform tools to OpenAI function-calling format
    const openAiTools = tools.map(t => ({
        type: 'function',
        function: {
            name: t.name,
            description: t.description,
            parameters: t.input_schema
        }
    }));

    const finalUrl = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
    const response = await fetch(finalUrl, {
        method: 'POST',
        headers: {
            'authorization': `Bearer ${apiKey || 'none'}`,
            'content-type': 'application/json'
        },
        body: JSON.stringify({
            model,
            messages: [{ role: 'system', content: systemPrompt }, ...messages],
            tools: openAiTools,
            tool_choice: 'auto'
        })
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `AI provider error ${response.status}`);
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message;
    let narrative = (message?.content || '').trim();
    let rawTasks = [];
    const toolCalls = [];
    const usage = {
        inputTokens:  data.usage?.prompt_tokens     ?? null,
        outputTokens: data.usage?.completion_tokens ?? null
    };

    for (const call of (message?.tool_calls || [])) {
        try {
            const args = JSON.parse(call.function.arguments);
            toolCalls.push({ name: call.function.name, input: args });
            if (call.function.name === PROPOSE_TASKS_TOOL.name) rawTasks = args.tasks || [];
        } catch {
            // A malformed tool call is skipped, not fatal — the narrative and
            // any well-formed calls in the same turn are still usable.
        }
    }

    if (!rawTasks.length && narrative) {
        rawTasks = extractTasksFromText(narrative);
    }

    return { narrative, rawTasks, toolCalls, usage };
}

/**
 * Normalises a raw task from the AI into a valid StagedTask object.
 * Validates fields against loaded epics and categories; applies safe defaults.
 * @param {Object} raw
 * @param {string} id
 * @param {Set<string>} validEpicIds
 * @param {Set<number>} validCategoryIds
 * @returns {Object} StagedTask
 */
function normaliseStagedTask(raw, id, validEpicIds, validCategoryIds) {
    const title = typeof raw.title === 'string' ? raw.title.trim().substring(0, 200) : '';
    if (!title) return null;

    const description = typeof raw.description === 'string' ? raw.description.substring(0, 2000) : '';
    const priority    = raw.priority === true;
    const epicId      = (typeof raw.epicId === 'string' && validEpicIds.has(raw.epicId)) ? raw.epicId : null;
    const catNum      = Number(raw.category);
    const category    = (!isNaN(catNum) && validCategoryIds.has(catNum)) ? catNum : 1;
    const deadline    = (raw.deadline && typeof raw.deadline === 'string' && !isNaN(Date.parse(raw.deadline)))
        ? raw.deadline
        : null;

    return {
        id,
        title,
        description,
        priority,
        epicId,
        category,
        deadline,
        createdDate: new Date().toISOString()
    };
}

// ===========================================
// AI Configuration Routes (global, not profile-scoped)
// ===========================================

/**
 * Migrates old ai-config.json format (activeProvider + providers map) to new multi-config format.
 * Returns the new format object (does NOT write to disk — caller writes if needed).
 */
function migrateAiConfig(config) {
    if (config.configs) return config; // already new format
    const provider = config.activeProvider;
    if (!provider) return { configs: [], activeConfigId: null };
    const providerData = config.providers?.[provider] || {};
    const id = Date.now().toString(36);
    return {
        activeConfigId: id,
        configs: [{
            id,
            name: AI_PROVIDERS[provider]?.label || provider,
            provider,
            model: config.activeModel || '',
            apiKey: providerData.apiKey || '',
            baseUrl: providerData.baseUrl || ''
        }]
    };
}

/** Strips apiKey from a config entry and adds hasKey boolean for safe client response. */
function safeConfigEntry(entry) {
    const { apiKey, ...rest } = entry;
    return { ...rest, hasKey: !!(apiKey) };
}

// GET AI config — never returns API keys
app.get('/api/ai/config', async (req, res) => {
    try {
        const raw = await readJsonFile(AI_CONFIG_FILE, {});
        const config = migrateAiConfig(raw);
        res.json({
            activeConfigId: config.activeConfigId || null,
            configs: (config.configs || []).map(safeConfigEntry)
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to read AI config' });
    }
});

// POST /api/ai/config/entries — create a new config entry
app.post('/api/ai/config/entries', writeLimiter, async (req, res) => {
    try {
        const { name, provider, model, apiKey, baseUrl } = req.body;

        if (!name || typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
            return res.status(400).json({ error: 'Name is required (max 100 chars)' });
        }
        if (!provider || !AI_PROVIDERS[provider]) {
            return res.status(400).json({ error: 'Invalid provider. Must be one of: ' + Object.keys(AI_PROVIDERS).join(', ') });
        }
        if (!model || typeof model !== 'string' || !model.trim()) {
            return res.status(400).json({ error: 'Model name is required' });
        }
        if (provider === 'custom' && (!baseUrl || typeof baseUrl !== 'string' || !baseUrl.trim())) {
            return res.status(400).json({ error: 'Base URL is required for custom provider' });
        }
        // Only http(s) targets — the server fetches this URL itself, so other
        // schemes (file:, etc.) would let a LAN client turn it into a proxy
        if (provider === 'custom' && !/^https?:\/\//i.test(baseUrl.trim())) {
            return res.status(400).json({ error: 'Base URL must start with http:// or https://' });
        }

        const raw = await readJsonFile(AI_CONFIG_FILE, {});
        const config = migrateAiConfig(raw);
        if (!config.configs) config.configs = [];

        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const entry = {
            id,
            name: name.trim(),
            provider,
            model: model.trim(),
            apiKey: (typeof apiKey === 'string' && apiKey.trim()) ? apiKey.trim() : '',
            baseUrl: provider === 'custom' ? baseUrl.trim().replace(/\/+$/, '') : ''
        };
        config.configs.push(entry);
        if (!config.activeConfigId) config.activeConfigId = id;

        await writeJsonFile(AI_CONFIG_FILE, config, { mode: 0o600 });
        res.json({ activeConfigId: config.activeConfigId, entry: safeConfigEntry(entry) });
    } catch (error) {
        res.status(500).json({ error: 'Failed to create AI config entry' });
    }
});

// PUT /api/ai/config/entries/:id — update an existing config entry
app.put('/api/ai/config/entries/:id', writeLimiter, async (req, res) => {
    try {
        const { id } = req.params;
        const { name, provider, model, apiKey, baseUrl } = req.body;

        if (!name || typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
            return res.status(400).json({ error: 'Name is required (max 100 chars)' });
        }
        if (!provider || !AI_PROVIDERS[provider]) {
            return res.status(400).json({ error: 'Invalid provider. Must be one of: ' + Object.keys(AI_PROVIDERS).join(', ') });
        }
        if (!model || typeof model !== 'string' || !model.trim()) {
            return res.status(400).json({ error: 'Model name is required' });
        }
        if (provider === 'custom' && (!baseUrl || typeof baseUrl !== 'string' || !baseUrl.trim())) {
            return res.status(400).json({ error: 'Base URL is required for custom provider' });
        }
        // Only http(s) targets — the server fetches this URL itself, so other
        // schemes (file:, etc.) would let a LAN client turn it into a proxy
        if (provider === 'custom' && !/^https?:\/\//i.test(baseUrl.trim())) {
            return res.status(400).json({ error: 'Base URL must start with http:// or https://' });
        }

        const raw = await readJsonFile(AI_CONFIG_FILE, {});
        const config = migrateAiConfig(raw);
        const idx = (config.configs || []).findIndex(c => c.id === id);
        if (idx === -1) return res.status(404).json({ error: 'Config entry not found' });

        const existing = config.configs[idx];
        config.configs[idx] = {
            id,
            name: name.trim(),
            provider,
            model: model.trim(),
            // Keep existing key if empty string passed (means "don't change")
            apiKey: (typeof apiKey === 'string' && apiKey.trim()) ? apiKey.trim() : (existing.apiKey || ''),
            baseUrl: provider === 'custom' ? baseUrl.trim().replace(/\/+$/, '') : ''
        };

        await writeJsonFile(AI_CONFIG_FILE, config, { mode: 0o600 });
        res.json({ entry: safeConfigEntry(config.configs[idx]) });
    } catch (error) {
        res.status(500).json({ error: 'Failed to update AI config entry' });
    }
});

// DELETE /api/ai/config/entries/:id — delete a config entry
app.delete('/api/ai/config/entries/:id', writeLimiter, async (req, res) => {
    try {
        const { id } = req.params;
        const raw = await readJsonFile(AI_CONFIG_FILE, {});
        const config = migrateAiConfig(raw);

        if ((config.configs || []).length <= 1) {
            return res.status(400).json({ error: 'Cannot delete the last configuration' });
        }

        const idx = (config.configs || []).findIndex(c => c.id === id);
        if (idx === -1) return res.status(404).json({ error: 'Config entry not found' });

        config.configs.splice(idx, 1);
        if (config.activeConfigId === id) {
            config.activeConfigId = config.configs[0]?.id || null;
        }

        await writeJsonFile(AI_CONFIG_FILE, config, { mode: 0o600 });
        res.json({ activeConfigId: config.activeConfigId });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete AI config entry' });
    }
});

// PUT /api/ai/config/active — set the active config entry
app.put('/api/ai/config/active', writeLimiter, async (req, res) => {
    try {
        const { configId } = req.body;
        if (!configId || typeof configId !== 'string') {
            return res.status(400).json({ error: 'configId is required' });
        }

        const raw = await readJsonFile(AI_CONFIG_FILE, {});
        const config = migrateAiConfig(raw);
        const found = (config.configs || []).find(c => c.id === configId);
        if (!found) return res.status(404).json({ error: 'Config entry not found' });

        config.activeConfigId = configId;
        await writeJsonFile(AI_CONFIG_FILE, config, { mode: 0o600 });
        res.json({ activeConfigId: configId });
    } catch (error) {
        res.status(500).json({ error: 'Failed to set active AI config' });
    }
});

// ===========================================
// AI Staged Tasks Routes (profile-scoped)
// ===========================================

// GET all staged tasks
/**
 * Maximum conversation turns kept on disk. Old turns fall off the front — the
 * history is a convenience across restarts, not an archive.
 */
const MAX_CONVERSATION_MESSAGES = 200;

// GET whether the AI is usable right now. The client calls this before
// enabling chat so an unconfigured or key-less setup degrades to an
// explanation instead of a failed request. Never returns the key itself.
app.get('/api/ai/availability', async (req, res) => {
    try {
        const aiConfig = migrateAiConfig(await readJsonFile(AI_CONFIG_FILE, {}));
        const cfg = (aiConfig.configs || []).find(c => c.id === aiConfig.activeConfigId);

        if (!cfg) {
            return res.json({ available: false, reason: 'no-config', message: 'No AI configuration yet.' });
        }
        const providerMeta = AI_PROVIDERS[cfg.provider];
        if (!providerMeta) {
            return res.json({ available: false, reason: 'unknown-provider', message: 'This configuration names an unknown provider.' });
        }
        if (providerMeta.requiresKey && !cfg.apiKey) {
            return res.json({ available: false, reason: 'no-key', message: `No API key set for ${providerMeta.label}.` });
        }
        res.json({ available: true, provider: cfg.provider, model: cfg.model, name: cfg.name });
    } catch (error) {
        // Availability itself must never throw the UI into an error state
        res.json({ available: false, reason: 'error', message: 'Could not read AI configuration.' });
    }
});

// Test-only: return the system prompt that would be sent for this profile, so
// the board snapshot can be asserted without a live AI provider. Registered
// only when RATE_LIMIT_DISABLED=1, matching /api/_test/reset-rate-limit.
if (RATE_LIMIT_DISABLED) {
    app.get('/api/:profile/ai/_test/prompt', resolveProfile, async (req, res) => {
        try {
            // Must load exactly what the chat handler loads, or this endpoint
            // reports a prompt the model never actually sees.
            const [epics, categories, tasks, memories] = await Promise.all([
                readJsonFile(req.profileFiles.epics, []),
                readJsonFile(req.profileFiles.categories, DEFAULT_CATEGORIES),
                readJsonFile(req.profileFiles.tasks, []),
                readJsonFile(req.profileFiles.aiMemory, [])
            ]);
            const prompt = buildAiSystemPromptWithBoard({
                epics, categories, columns: req.columns, tasks, memories
            });
            res.json({ prompt, chars: prompt.length });
        } catch (error) {
            res.status(500).json({ error: 'Failed to build prompt' });
        }
    });
}

/**
 * Validates a chat request and assembles everything a provider call needs.
 *
 * Shared by the buffered and streaming chat routes so the two can't drift on
 * validation, prompt construction or which tools are offered.
 *
 * @param {Object} req
 * @returns {Promise<{ok: true, resolved: Object, systemPrompt: string, tools: Array,
 *                     epics: Array, categories: Array, messages: Array}
 *                  | {ok: false, status: number, error: string}>}
 */
async function prepareAiChat(req) {
    const { messages } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
        return { ok: false, status: 400, error: 'messages must be a non-empty array' };
    }
    for (const m of messages) {
        if (!m || typeof m.role !== 'string' || typeof m.content !== 'string') {
            return { ok: false, status: 400, error: 'Each message must have role and content strings' };
        }
        if (m.role !== 'user' && m.role !== 'assistant') {
            return { ok: false, status: 400, error: 'Message role must be "user" or "assistant"' };
        }
    }

    const resolved = await resolveActiveAiConfig();
    if (!resolved.ok) return resolved;

    const [epics, categories, tasks, memories] = await Promise.all([
        readJsonFile(req.profileFiles.epics, []),
        readJsonFile(req.profileFiles.categories, DEFAULT_CATEGORIES),
        readJsonFile(req.profileFiles.tasks, []),
        readJsonFile(req.profileFiles.aiMemory, [])
    ]);

    return {
        ok: true,
        resolved,
        messages,
        epics,
        categories,
        systemPrompt: buildAiSystemPromptWithBoard({
            epics, categories, columns: req.columns, tasks, memories
        }),
        // Three verbs: create new work, change existing work, remember a fact.
        tools: [PROPOSE_TASKS_TOOL, PROPOSE_CHANGES_TOOL, PROPOSE_MEMORY_TOOL]
    };
}

/**
 * Turns a model's tool output into stored staged tasks, proposals and memory
 * suggestions. Nothing here touches the board — every output is a reviewable
 * buffer entry.
 *
 * Shared by both chat routes.
 *
 * @param {Object} req
 * @param {{rawTasks: Array, toolCalls: Array, epics: Array, categories: Array}} input
 * @returns {Promise<{tasks: Array, proposals: Array, memories: Array}>}
 */
async function persistAiToolOutput(req, { rawTasks, toolCalls, epics, categories }) {
    const validEpicIds     = new Set(epics.map(e => e.id));
    const validCategoryIds = new Set(categories.map(c => c.id));

    // --- New tasks → AI staging ---
    const newStagedTasks = [];
    for (const raw of (rawTasks || [])) {
        const task = normaliseStagedTask(raw, generateId(), validEpicIds, validCategoryIds);
        if (task) newStagedTasks.push(task);
    }
    if (newStagedTasks.length > 0) {
        const existing = await readJsonFile(req.profileFiles.aiStaged, []);
        await writeJsonFile(req.profileFiles.aiStaged, [...existing, ...newStagedTasks]);
    }

    // --- Changes to existing tasks → the review buffer ---
    const rawChanges = (toolCalls || [])
        .filter(c => c.name === PROPOSE_CHANGES_TOOL.name)
        .flatMap(c => Array.isArray(c.input?.changes) ? c.input.changes : []);

    let newProposals = [];
    if (rawChanges.length > 0) {
        const boardTasks = await readJsonFile(req.profileFiles.tasks, []);
        newProposals = rawChanges
            .map(raw => normaliseProposal(raw, {
                validTaskIds: new Set(boardTasks.map(t => t.id)),
                validColumnIds: new Set(req.columns.map(c => c.id)),
                validEpicIds,
                validCategoryIds
            }))
            .filter(Boolean);

        if (newProposals.length > 0) {
            const existing = await readJsonFile(req.profileFiles.aiProposals, []);
            // Newest first, capped — an unbounded review list stops being
            // reviewable, which defeats the point of the buffer.
            await writeJsonFile(
                req.profileFiles.aiProposals,
                [...newProposals, ...existing].slice(0, MAX_PROPOSALS)
            );
        }
    }

    // --- Durable facts → memory, unapproved ---
    const rawFacts = (toolCalls || [])
        .filter(c => c.name === PROPOSE_MEMORY_TOOL.name)
        .flatMap(c => Array.isArray(c.input?.facts) ? c.input.facts : []);

    let newMemories = [];
    if (rawFacts.length > 0) {
        const existing = await readJsonFile(req.profileFiles.aiMemory, []);
        const seen = new Set(existing.map(m => m.text.toLowerCase()));
        newMemories = rawFacts
            .map(normaliseMemory)
            .filter(m => m && !seen.has(m.text.toLowerCase()));

        if (newMemories.length > 0 && existing.length < MAX_MEMORIES) {
            newMemories = newMemories.slice(0, MAX_MEMORIES - existing.length);
            await writeJsonFile(req.profileFiles.aiMemory, [...existing, ...newMemories]);
        } else {
            newMemories = [];
        }
    }

    return { tasks: newStagedTasks, proposals: newProposals, memories: newMemories };
}

// ===========================================
// AI Memory
// ===========================================

/**
 * Validates memory text from a request body.
 * @param {*} text
 * @returns {{valid: boolean, error?: string, text?: string}}
 */
function validateMemoryText(text) {
    if (typeof text !== 'string' || text.trim() === '') {
        return { valid: false, error: 'Memory text is required' };
    }
    if (text.trim().length > MEMORY_TEXT_MAX_LENGTH) {
        return { valid: false, error: `Memory must be ${MEMORY_TEXT_MAX_LENGTH} characters or less` };
    }
    return { valid: true, text: text.trim() };
}

// GET all memories (approved and awaiting review)
app.get('/api/:profile/ai/memory', resolveProfile, async (req, res) => {
    try {
        res.json(await readJsonFile(req.profileFiles.aiMemory, []));
    } catch (error) {
        res.status(500).json({ error: 'Failed to read memory' });
    }
});

// POST add a memory by hand — approved immediately, since the user wrote it
app.post('/api/:profile/ai/memory', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const validation = validateMemoryText(req.body.text);
        if (!validation.valid) return res.status(400).json({ error: validation.error });

        const memories = await readJsonFile(req.profileFiles.aiMemory, []);
        if (memories.length >= MAX_MEMORIES) {
            return res.status(400).json({ error: `Maximum of ${MAX_MEMORIES} memories` });
        }

        const memory = {
            id: generateId(),
            text: validation.text,
            source: 'user',
            approved: true,
            createdAt: new Date().toISOString()
        };
        memories.push(memory);
        await writeJsonFile(req.profileFiles.aiMemory, memories);
        res.status(201).json(memory);
    } catch (error) {
        res.status(500).json({ error: 'Failed to save memory' });
    }
});

// PUT edit text and/or approve. Approving an AI proposal is what lets it
// reach a prompt — until then it is stored but unused.
app.put('/api/:profile/ai/memory/:id', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const memories = await readJsonFile(req.profileFiles.aiMemory, []);
        const memory = memories.find(m => m.id === req.params.id);
        if (!memory) return res.status(404).json({ error: 'Memory not found' });

        if (req.body.text !== undefined) {
            const validation = validateMemoryText(req.body.text);
            if (!validation.valid) return res.status(400).json({ error: validation.error });
            memory.text = validation.text;
        }
        if (req.body.approved !== undefined) {
            if (typeof req.body.approved !== 'boolean') {
                return res.status(400).json({ error: 'approved must be a boolean' });
            }
            memory.approved = req.body.approved;
        }

        await writeJsonFile(req.profileFiles.aiMemory, memories);
        res.json(memory);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update memory' });
    }
});

// DELETE one memory
app.delete('/api/:profile/ai/memory/:id', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const memories = await readJsonFile(req.profileFiles.aiMemory, []);
        const index = memories.findIndex(m => m.id === req.params.id);
        if (index === -1) return res.status(404).json({ error: 'Memory not found' });

        memories.splice(index, 1);
        await writeJsonFile(req.profileFiles.aiMemory, memories);
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete memory' });
    }
});

// ===========================================
// AI Proposed Changes (review buffer)
// ===========================================

/**
 * Loads everything applyProposal needs to re-validate against the profile's
 * current state. Shared by the single-apply and apply-all routes.
 * @param {Object} req
 * @returns {Promise<Object>} ctx for applyProposal
 */
async function loadProposalContext(req) {
    const categories = await readJsonFile(req.profileFiles.categories, DEFAULT_CATEGORIES);
    return {
        columns: req.columns,
        validCategoryIds: new Set(categories.map(c => c.id)),
        categoryNames: new Map(categories.map(c => [c.id, c.name]))
    };
}

// GET all pending proposals
app.get('/api/:profile/ai/proposals', resolveProfile, async (req, res) => {
    try {
        const proposals = await readJsonFile(req.profileFiles.aiProposals, []);
        res.json(proposals);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read proposals' });
    }
});

// POST apply one proposal — the only path from the buffer to the board
app.post('/api/:profile/ai/proposals/:id/apply', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const proposals = await readJsonFile(req.profileFiles.aiProposals, []);
        const index = proposals.findIndex(p => p.id === req.params.id);
        if (index === -1) return res.status(404).json({ error: 'Proposal not found' });

        const tasks = await readJsonFile(req.profileFiles.tasks, []);
        const ctx = await loadProposalContext(req);
        const result = applyProposal(tasks, proposals[index], ctx);

        if (!result.ok) {
            // The board moved on since the proposal was made. Drop the stale
            // row rather than leaving something un-appliable in the list.
            proposals.splice(index, 1);
            await writeJsonFile(req.profileFiles.aiProposals, proposals);
            return res.status(409).json({ error: result.error, discarded: true });
        }

        await writeJsonFile(req.profileFiles.tasks, tasks);
        proposals.splice(index, 1);
        await writeJsonFile(req.profileFiles.aiProposals, proposals);

        res.json({ ok: true, task: result.task });
    } catch (error) {
        console.error('Failed to apply proposal:', error);
        res.status(500).json({ error: 'Failed to apply proposal' });
    }
});

// POST apply every pending proposal, in order
app.post('/api/:profile/ai/proposals/apply-all', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const proposals = await readJsonFile(req.profileFiles.aiProposals, []);
        if (proposals.length === 0) return res.json({ ok: true, applied: 0, failed: [] });

        const tasks = await readJsonFile(req.profileFiles.tasks, []);
        const ctx = await loadProposalContext(req);

        // One proposal failing must not abort the rest — they are independent
        // decisions the user already made. Failures are reported, not thrown.
        let applied = 0;
        const failed = [];
        for (const proposal of proposals) {
            const result = applyProposal(tasks, proposal, ctx);
            if (result.ok) applied += 1;
            else failed.push({ id: proposal.id, reason: result.error });
        }

        await writeJsonFile(req.profileFiles.tasks, tasks);
        // The whole batch is consumed either way: a proposal that couldn't
        // apply is stale, and re-offering it would just fail again.
        await writeJsonFile(req.profileFiles.aiProposals, []);

        res.json({ ok: true, applied, failed });
    } catch (error) {
        console.error('Failed to apply proposals:', error);
        res.status(500).json({ error: 'Failed to apply proposals' });
    }
});

// DELETE reject one proposal
app.delete('/api/:profile/ai/proposals/:id', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const proposals = await readJsonFile(req.profileFiles.aiProposals, []);
        const index = proposals.findIndex(p => p.id === req.params.id);
        if (index === -1) return res.status(404).json({ error: 'Proposal not found' });

        proposals.splice(index, 1);
        await writeJsonFile(req.profileFiles.aiProposals, proposals);
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to reject proposal' });
    }
});

// DELETE reject all pending proposals
app.delete('/api/:profile/ai/proposals', resolveProfile, writeLimiter, async (req, res) => {
    try {
        await writeJsonFile(req.profileFiles.aiProposals, []);
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to clear proposals' });
    }
});

// GET the persisted conversation
app.get('/api/:profile/ai/conversation', resolveProfile, async (req, res) => {
    try {
        const stored = await readJsonFile(req.profileFiles.aiConversation, { messages: [] });
        res.json({ messages: Array.isArray(stored.messages) ? stored.messages : [] });
    } catch (error) {
        res.status(500).json({ error: 'Failed to read conversation' });
    }
});

// PUT replace the persisted conversation. The client owns the transcript and
// writes it back after each exchange; the server only bounds its length.
app.put('/api/:profile/ai/conversation', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const { messages } = req.body;
        if (!Array.isArray(messages)) {
            return res.status(400).json({ error: 'messages must be an array' });
        }
        const clean = messages
            .filter(m => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
            .slice(-MAX_CONVERSATION_MESSAGES)
            .map(m => ({ role: m.role, content: m.content, at: m.at || new Date().toISOString() }));

        await writeJsonFile(req.profileFiles.aiConversation, { messages: clean });
        res.json({ ok: true, count: clean.length });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save conversation' });
    }
});

// DELETE clear the conversation
app.delete('/api/:profile/ai/conversation', resolveProfile, writeLimiter, async (req, res) => {
    try {
        await writeJsonFile(req.profileFiles.aiConversation, { messages: [] });
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to clear conversation' });
    }
});

app.get('/api/:profile/ai/staged', resolveProfile, async (req, res) => {
    try {
        const staged = await readJsonFile(req.profileFiles.aiStaged, []);
        res.json(staged);
    } catch (error) {
        res.status(500).json({ error: 'Failed to read staged tasks' });
    }
});

// POST create a staged task manually
app.post('/api/:profile/ai/staged', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const categories = await readJsonFile(req.profileFiles.categories, DEFAULT_CATEGORIES);
        const validCategoryIds = new Set(categories.map(c => c.id));

        const validation = validateTaskInput(req.body, { requireTitle: true, validCategoryIds });
        if (!validation.valid) {
            return res.status(400).json({ error: validation.errors.join('; ') });
        }

        const staged = await readJsonFile(req.profileFiles.aiStaged, []);
        const newTask = {
            id:          generateId(),
            title:       req.body.title.trim(),
            description: req.body.description || '',
            priority:    req.body.priority === true,
            epicId:      req.body.epicId || null,
            category:    req.body.category ? Number(req.body.category) : 1,
            deadline:    req.body.deadline || null,
            createdDate: new Date().toISOString()
        };

        staged.push(newTask);
        await writeJsonFile(req.profileFiles.aiStaged, staged);
        res.status(201).json(newTask);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create staged task' });
    }
});

// PUT update a staged task
app.put('/api/:profile/ai/staged/:id', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const categories = await readJsonFile(req.profileFiles.categories, DEFAULT_CATEGORIES);
        const validCategoryIds = new Set(categories.map(c => c.id));

        const validation = validateTaskInput(req.body, { requireTitle: false, validCategoryIds });
        if (!validation.valid) {
            return res.status(400).json({ error: validation.errors.join('; ') });
        }

        const staged = await readJsonFile(req.profileFiles.aiStaged, []);
        const idx = staged.findIndex(t => t.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Staged task not found' });

        const task = staged[idx];
        if (req.body.title       !== undefined) task.title       = req.body.title.trim();
        if (req.body.description !== undefined) task.description = req.body.description;
        if (req.body.priority    !== undefined) task.priority    = req.body.priority === true;
        if (req.body.epicId      !== undefined) task.epicId      = req.body.epicId || null;
        if (req.body.category    !== undefined) task.category    = Number(req.body.category);
        if (req.body.deadline    !== undefined) task.deadline    = req.body.deadline || null;

        await writeJsonFile(req.profileFiles.aiStaged, staged);
        res.json(task);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update staged task' });
    }
});

// DELETE a staged task
app.delete('/api/:profile/ai/staged/:id', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const staged = await readJsonFile(req.profileFiles.aiStaged, []);
        const idx = staged.findIndex(t => t.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Staged task not found' });

        staged.splice(idx, 1);
        await writeJsonFile(req.profileFiles.aiStaged, staged);
        await removeTaskAttachments(req.params.profile, req.params.id);
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete staged task' });
    }
});

// POST promote staged task to backlog
app.post('/api/:profile/ai/staged/:id/promote/backlog', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const staged = await readJsonFile(req.profileFiles.aiStaged, []);
        const stagedTask = staged.find(t => t.id === req.params.id);
        if (!stagedTask) return res.status(404).json({ error: 'Staged task not found' });

        // Backlog column is always present (ensured by resolveProfile middleware)
        const backlogCol = req.profile.columns.find(c => c.isBacklog === true);
        if (!backlogCol) {
            return res.status(500).json({ error: 'Backlog column not found' });
        }

        // Shift existing tasks in backlog column down
        const tasks = await readJsonFile(req.profileFiles.tasks, []);
        for (const t of tasks) {
            if (t.status === backlogCol.id) t.position += 1;
        }

        const today = new Date().toISOString().split('T')[0];
        const newTask = {
            id:          generateId(),
            title:       stagedTask.title,
            description: stagedTask.description || '',
            priority:    stagedTask.priority || false,
            epicId:      stagedTask.epicId || null,
            category:    stagedTask.category || 1,
            deadline:    stagedTask.deadline || null,
            snoozeUntil: null,
            status:      backlogCol.id,
            position:    0,
            log:         [{ date: today, action: 'Added from AI Staging' }],
            createdDate: new Date().toISOString()
        };
        // Promotion mints a new task id, so the attachment directory is
        // re-keyed to match — otherwise the files would be orphaned the
        // moment the staged task is removed below.
        newTask.attachments = await moveTaskAttachments(
            req.params.profile, stagedTask.id, newTask.id, stagedTask.attachments
        );
        tasks.push(newTask);
        await writeJsonFile(req.profileFiles.tasks, tasks);

        // Remove from staged
        const updatedStaged = staged.filter(t => t.id !== req.params.id);
        await writeJsonFile(req.profileFiles.aiStaged, updatedStaged);

        res.json({ ok: true, task: newTask });
    } catch (error) {
        res.status(500).json({ error: 'Failed to promote to backlog' });
    }
});

// POST promote staged task to board (first non-backlog column)
app.post('/api/:profile/ai/staged/:id/promote/board', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const staged = await readJsonFile(req.profileFiles.aiStaged, []);
        const stagedTask = staged.find(t => t.id === req.params.id);
        if (!stagedTask) return res.status(404).json({ error: 'Staged task not found' });

        const firstCol = req.columns.find(c => !c.isBacklog);
        if (!firstCol) return res.status(400).json({ error: 'No board column found' });

        // Shift existing tasks in first column down
        const tasks = await readJsonFile(req.profileFiles.tasks, []);
        for (const t of tasks) {
            if (t.status === firstCol.id) t.position += 1;
        }

        const today = new Date().toISOString().split('T')[0];
        const newTask = {
            id:          generateId(),
            title:       stagedTask.title,
            description: stagedTask.description || '',
            priority:    stagedTask.priority || false,
            epicId:      stagedTask.epicId || null,
            category:    stagedTask.category || 1,
            deadline:    stagedTask.deadline || null,
            snoozeUntil: null,
            status:      firstCol.id,
            position:    0,
            log:         [{ date: today, action: 'Added from AI Staging' }],
            createdDate: new Date().toISOString()
        };
        // See the backlog promote route: the new id takes the files with it.
        newTask.attachments = await moveTaskAttachments(
            req.params.profile, stagedTask.id, newTask.id, stagedTask.attachments
        );
        tasks.push(newTask);
        await writeJsonFile(req.profileFiles.tasks, tasks);

        // Remove from staged
        const updatedStaged = staged.filter(t => t.id !== req.params.id);
        await writeJsonFile(req.profileFiles.aiStaged, updatedStaged);

        res.json({ ok: true, task: newTask });
    } catch (error) {
        res.status(500).json({ error: 'Failed to promote to board' });
    }
});

// ===========================================
// AI Chat Route (profile-scoped)
// ===========================================

// POST send a message to the AI; returns { narrative, tasks }
app.post('/api/:profile/ai/chat', resolveProfile, aiLimiter, async (req, res) => {
    try {
        const prep = await prepareAiChat(req);
        if (!prep.ok) return res.status(prep.status).json({ error: prep.error });

        const { resolved, systemPrompt, tools, messages, epics, categories } = prep;

        let narrative, rawTasks, toolCalls, usage;
        try {
            const call = resolved.providerMeta.format === 'anthropic'
                ? await callAnthropicAi(resolved.apiKey, resolved.model, systemPrompt, messages, tools)
                : await callOpenAiCompatibleAi(resolved.baseUrl, resolved.apiKey, resolved.model, systemPrompt, messages, tools);
            ({ narrative, rawTasks, toolCalls, usage } = call);
        } catch (aiErr) {
            return res.status(502).json({ error: 'AI provider error: ' + aiErr.message });
        }

        const stored = await persistAiToolOutput(req, { rawTasks, toolCalls, epics, categories });

        res.json({
            narrative,
            tasks: stored.tasks,
            proposals: stored.proposals,
            memories: stored.memories,
            usage: usage || null
        });
    } catch (error) {
        res.status(500).json({ error: 'AI chat failed' });
    }
});

/**
 * Streaming chat. Same inputs and same stored outputs as the buffered route
 * above — the only difference is that narrative text arrives as it is written.
 *
 * Kept as a SEPARATE endpoint rather than a flag on the existing one, so the
 * buffered path stays intact as a fallback: not every OpenAI-compatible server
 * streams correctly, and a client that fails to stream can simply retry
 * against /ai/chat.
 *
 * Wire format (server-sent events):
 *   event: text   data: {"delta":"..."}   — narrative, token by token
 *   event: done   data: {tasks, proposals, memories, usage}
 *   event: error  data: {"error":"..."}
 *
 * Tool calls are NOT streamed: their arguments are only valid JSON once
 * complete, so they are accumulated and processed before `done` is sent.
 */
app.post('/api/:profile/ai/chat/stream', resolveProfile, aiLimiter, async (req, res) => {
    const prep = await prepareAiChat(req);
    if (!prep.ok) return res.status(prep.status).json({ error: prep.error });

    const { resolved, systemPrompt, tools, messages, epics, categories } = prep;

    res.set('Content-Type', 'text/event-stream; charset=utf-8');
    // no-cache and no-transform keep proxies from buffering the stream, which
    // would defeat the point entirely.
    res.set('Cache-Control', 'no-cache, no-transform');
    res.set('Connection', 'keep-alive');
    res.set('X-Accel-Buffering', 'no');

    const send = (event, payload) => {
        if (res.writableEnded) return;
        res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    };

    try {
        const call = resolved.providerMeta.format === 'anthropic'
            ? await streamAnthropicAi(resolved.apiKey, resolved.model, systemPrompt, messages, tools,
                (delta) => send('text', { delta }))
            : await streamOpenAiCompatibleAi(resolved.baseUrl, resolved.apiKey, resolved.model, systemPrompt, messages, tools,
                (delta) => send('text', { delta }));

        const stored = await persistAiToolOutput(req, {
            rawTasks: call.rawTasks, toolCalls: call.toolCalls, epics, categories
        });

        send('done', {
            narrative: call.narrative,
            tasks: stored.tasks,
            proposals: stored.proposals,
            memories: stored.memories,
            usage: call.usage || null
        });
        res.end();
    } catch (error) {
        // Headers are already sent, so a status code is no longer available —
        // the failure has to travel as an event the client can act on.
        send('error', { error: error.message || 'AI provider error' });
        res.end();
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

// Sub-page URLs: /:alias/dashboard, /:alias/backlog, /:alias/archive, /:alias/reports, /:alias/ai
// Serves the same app shell as /:alias — client-side JS reads pathname to render the correct view.
app.get('/:alias/:page', async (req, res) => {
    const { alias } = req.params;

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
    // Bind to localhost-only by default — anyone on the same LAN would
    // otherwise see and mutate the kanban. Set HOST=0.0.0.0 (or a specific
    // interface) if you intentionally want LAN access (e.g., to view from
    // your phone on the same wifi).
    const HOST = process.env.HOST || '127.0.0.1';
    app.listen(PORT, HOST, () => {
        const url = HOST === '127.0.0.1'
            ? `http://localhost:${PORT}`
            : `http://${HOST}:${PORT} (also reachable at http://localhost:${PORT})`;
        console.log(`Task Tracker server running at ${url}`);
    });
}

startServer();
