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

// Attachments: the bytes, and every path built to reach them. Nothing a user
// typed ever reaches the filesystem — see the module docblock.
const {
    ATTACHMENT_FALLBACK,
    MAX_ATTACHMENT_SIZE,
    MAX_ATTACHMENTS_PER_TASK,
    MAX_PROFILE_ATTACHMENT_BYTES,
    ATTACHMENT_TYPES,
    buildContentDisposition,
    attachmentsDir,
    attachmentFilePath,
    profileAttachmentBytes,
    removeTaskAttachments,
    moveTaskAttachments
} = require('./lib/attachments')({ DATA_DIR, generateId });

const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');
const AI_CONFIG_FILE = path.join(DATA_DIR, 'ai-config.json');

/**
 * AI provider registry.
 * format: 'anthropic' | 'openai-compatible'
 * Built-in providers have fixed baseUrl. Custom provider is user-defined.
 */
/**
 * How long to wait on a provider before giving up.
 *
 * Generous: a large board plus a slow local model can legitimately take a
 * while. The point is that a wedged provider — LM Studio holding the socket
 * open with no model loaded, say — fails visibly instead of leaving the dock
 * on "Thinking…" until the page is reloaded.
 */
const AI_REQUEST_TIMEOUT_MS = 120000;

/**
 * A fetch that gives up rather than hanging forever.
 *
 * The timer is cleared as soon as the response *headers* arrive, not when the
 * body finishes — so this bounds "the provider never answered" without
 * aborting a stream that is legitimately still writing. That is the failure
 * actually seen: a local server accepting the connection and going quiet.
 *
 * @param {string} url
 * @param {Object} options
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
        if (err.name === 'AbortError') {
            throw new Error(`The provider did not respond within ${AI_REQUEST_TIMEOUT_MS / 1000}s`);
        }
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

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
    kimi: {
        label: 'Kimi (Moonshot)',
        format: 'openai-compatible',
        // Moonshot runs two regional hosts — this is the international one.
        // `allowsBaseUrl` lets the China endpoint (api.moonshot.cn/v1) be set
        // without dropping to the Custom provider and losing the defaults.
        baseUrl: 'https://api.moonshot.ai/v1',
        defaultModel: 'kimi-k3',
        requiresKey: true,
        allowsBaseUrl: true
    },
    custom: {
        label: 'Custom / Local',
        format: 'openai-compatible',
        baseUrl: null,
        defaultModel: '',
        requiresKey: false,
        allowsBaseUrl: true
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
/**
 * ===========================================
 * Per-file write serialisation
 * ===========================================
 *
 * Every store here is a whole-file JSON document, so almost every mutation is
 * a read-modify-write. `writeJsonFile` is atomic *per write* — the tmp-then-
 * rename means no reader ever sees half a file — but two overlapping
 * read-modify-write cycles still lose one of them: both read the same array,
 * both write their own version, last writer wins.
 *
 * `withFileLock` serialises whole cycles per file path. It is a promise chain,
 * not a real lock: correct because this is a single-process server, and enough
 * because the races are between concurrent *requests*, not processes.
 *
 * This does NOT fix a cycle that holds its read across a slow await — a
 * provider call, say. Nothing outside the lock can, and the two places that
 * did that (classify, summarise) re-read after the call instead.
 */
const fileLocks = new Map();

/**
 * Runs `fn` with exclusive access to `filePath`, relative to other callers of
 * this function.
 *
 * @param {string} filePath - The store being mutated; the lock's identity.
 * @param {() => Promise<T>} fn - The read-modify-write cycle.
 * @returns {Promise<T>}
 * @template T
 */
function withFileLock(filePath, fn) {
    // Chain onto whatever is already queued for this path. Passing `fn` as both
    // handlers means one failed cycle does not cancel the ones behind it.
    const previous = fileLocks.get(filePath) || Promise.resolve();
    const run = previous.then(fn, fn);

    // The queue tail settles either way; the caller still gets the real result,
    // rejections included.
    const tail = run.then(() => {}, () => {});
    fileLocks.set(filePath, tail);

    // Drop the entry once the queue drains, so the map does not grow without
    // bound. Only when this is still the tail — otherwise someone queued behind
    // us and the lock is still needed.
    tail.then(() => {
        if (fileLocks.get(filePath) === tail) fileLocks.delete(filePath);
    });

    return run;
}

/**
 * Wraps a route handler so its whole read-modify-write cycle holds the lock
 * for one of the profile's stores.
 *
 * Applied at the route rather than inside each handler: the body stays exactly
 * as it was, which is what makes retrofitting this to existing routes safe.
 *
 * @param {(files: Object) => string} pick - Chooses the store from req.profileFiles.
 * @returns {(handler: Function) => Function}
 */
const locked = (pick) => (handler) => async (req, res) =>
    withFileLock(pick(req.profileFiles), () => handler(req, res));

/** Serialises a route against every other writer of tasks.json. */
const lockTasks = locked(f => f.tasks);

/** Serialises a route against every other writer of ai-proposals.json. */
const lockProposals = locked(f => f.aiProposals);

/** Serialises a route against every other writer of ai-conversation.json. */
const lockConversation = locked(f => f.aiConversation);

/** Serialises a route against every other writer of ai-memory.json. */
const lockMemory = locked(f => f.aiMemory);

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
 * A modified-Fibonacci scale. 1 means "do it now"; 13 is one to two days.
 * 21 and 34 exist for work that genuinely is bigger, and **100 stands for
 * infinity** — too big to size, and a signal to split rather than an estimate.
 * (100 rather than an ∞ glyph so it needs no new icon and still sorts.)
 *
 * There is no velocity, burndown or sprint reporting built on these, and there
 * shouldn't be: that is team ceremony.
 *
 * Source of truth: /public/js/constants.js
 */
const STORY_POINTS = [1, 2, 3, 5, 8, 13, 21, 34, 100];

// Memory categories. Up here with the other domain constants: the prompt
// builders group by them, and prompts are wired before the memory routes.
/**
 * What a memory is *about*.
 *
 * The flat list worked while memory only held working conventions, but "Mikael
 * is my boss" and "a 13 is two days" are different kinds of fact and read badly
 * interleaved. Categories are what turn the list into a profile you can skim.
 */
const MEMORY_CATEGORIES = ['person', 'term', 'project', 'preference', 'other'];

/** @param {string} value @returns {string} A valid category, defaulting to 'other'. */
function normaliseMemoryCategory(value) {
    return MEMORY_CATEGORIES.includes(value) ? value : 'other';
}

// Proposal shape. Up here with the other domain constants because the tool
// schemas quote PROPOSAL_KINDS, and schemas are built before the validators.
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




/** Longest original filename kept for display. */
const ATTACHMENT_NAME_MAX_LENGTH = 200;




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
            aiMemory: path.join(profileDir, 'ai-memory.json'),
            aiSkills: path.join(profileDir, 'ai-skills.json')
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
app.post('/api/:profile/tasks', resolveProfile, writeLimiter, lockTasks(async (req, res) => {
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
}));

// PUT update task
app.put('/api/:profile/tasks/:id', resolveProfile, writeLimiter, lockTasks(async (req, res) => {
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
}));

// DELETE task
app.delete('/api/:profile/tasks/:id', resolveProfile, writeLimiter, lockTasks(async (req, res) => {
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
}));

// ===========================================
// Task Attachments
// ===========================================

// Upload bodies arrive as raw bytes, not multipart/form-data: the client
// hands `fetch` the File object directly and puts the metadata in headers.
// No boundary parsing, no encoding overhead, no dependency.
app.raw('/api/:profile/tasks/:id/attachments');

// POST upload an attachment (raw body; name in X-Attachment-Name, type in Content-Type)
app.post('/api/:profile/tasks/:id/attachments', resolveProfile, writeLimiter, lockTasks(async (req, res) => {
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
}));

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
app.delete('/api/:profile/tasks/:id/attachments/:attachmentId', resolveProfile, writeLimiter, lockTasks(async (req, res) => {
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
}));

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
app.post('/api/:profile/capture', resolveProfile, writeLimiter, lockTasks(async (req, res) => {
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
}));

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

        // This is the one route where the AI writes without review, and the
        // exception is scoped to a note the user just captured. Enforce that
        // here rather than trusting the client to only call it after capture:
        // otherwise the AI can rewrite the title of any task on the board.
        if (!tasks[taskIndex].needsFiling) {
            return res.status(400).json({ error: 'Only unfiled captures can be classified' });
        }

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

        let task = tasks[taskIndex];
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

        // Re-read after the provider call, which takes seconds. The array read
        // before it is now stale: anything the user did meanwhile — capturing
        // another note, or hitting Undo on this one — is already on disk, and
        // writing the old array back would silently revert it.
        const freshTasks = await readJsonFile(req.profileFiles.tasks, []);
        const freshIndex = freshTasks.findIndex(t => t.id === req.params.id);
        if (freshIndex === -1) {
            // Undone or deleted while the model was thinking. Filing it again
            // would resurrect a task the user deliberately removed.
            return res.status(200).json({ classified: false, reason: 'Task no longer exists', task: null });
        }
        tasks.length = 0;
        tasks.push(...freshTasks);
        task = tasks[freshIndex];

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
app.post('/api/:profile/tasks/:id/move', resolveProfile, writeLimiter, lockTasks(async (req, res) => {
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
}));

// POST generate report (snapshot only, no archiving)
/**
 * When a task was finished, as an epoch ms, or null if it never was.
 *
 * `archivedDate` is authoritative when present (recorded at archive time).
 * Older archived tasks predate that field, and tasks sitting in a done column
 * have not been archived at all, so both fall back to the newest log entry —
 * which for those is the move into the done column.
 *
 * @param {Object} task
 * @param {Set<string>} doneColumnIds - Columns that count as finished
 * @returns {number|null}
 */
function taskCompletedAt(task, doneColumnIds) {
    if (task.archivedDate) {
        const stamp = Date.parse(task.archivedDate);
        if (!isNaN(stamp)) return { at: stamp, precision: 'exact' };
    }
    const isDone = task.status === 'archived' || doneColumnIds.has(task.status);
    if (!isDone) return null;

    const stamps = (task.log || [])
        .map(entry => Date.parse(entry.date))
        .filter(n => !isNaN(n));
    // Log entries are `YYYY-MM-DD` across the whole app, so this can only ever
    // be resolved to a day — see the comparison in `inPeriod`.
    return stamps.length ? { at: Math.max(...stamps), precision: 'day' } : null;
}

/**
 * Start of the UTC day containing `stamp`.
 *
 * UTC, not local: log entries are written as `new Date().toISOString()` split
 * at the T, so they are **UTC** dates, and `Date.parse` reads them back as UTC
 * midnight. Flooring in local time mixes the two — east of Greenwich, local
 * midnight is *later* than the UTC midnight it is compared against, so work
 * logged that day is ruled out. This bites hardest in the small hours, when
 * the local and UTC dates differ.
 */
function startOfDayUtc(stamp) {
    const d = new Date(stamp);
    d.setUTCHours(0, 0, 0, 0);
    return d.getTime();
}

/** Newest activity on a task, for "did this move at all?" questions. */
function taskLastActivityAt(task) {
    const stamps = [task.createdDate, ...(task.log || []).map(e => e.date)]
        .map(v => Date.parse(v))
        .filter(n => !isNaN(n));
    return stamps.length ? Math.max(...stamps) : 0;
}

/** Default reporting window when there is no previous report to measure from. */
const DEFAULT_REPORT_PERIOD_DAYS = 7;

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

        // Epic names are carried into the report so a summary can group by
        // silo later, even if the epic is renamed or deleted afterwards.
        const epics = await readJsonFile(req.profileFiles.epics, []);
        const epicLookup = new Map(epics.map(e => [e.id, e]));

        const mapTask = t => ({
            id: t.id,
            title: t.title,
            description: t.description,
            category: t.category || 1,
            categoryName: categoryLookup.get(t.category || 1) || 'Non categorized',
            epicId: t.epicId || null,
            epicName: t.epicId ? (epicLookup.get(t.epicId)?.name || null) : null,
            points: t.points ?? null
        });

        // Snapshot all columns in board order, capturing current column names
        const columnsSnapshot = req.columns.map(col => ({
            columnId: col.id,
            columnName: col.name,
            tasks: tasks.filter(t => t.status === col.id).map(mapTask)
        }));

        // ---- The reporting period ----
        //
        // A report used to be a board snapshot: it answered "what is on my
        // board", not "what did I do". For a weekly catch-up the second
        // question is the one that matters, so the report now covers the span
        // since the previous one — which is exactly "since we last spoke".
        const previous = reports.length
            ? reports.reduce((a, b) => (Date.parse(a.generatedDate) > Date.parse(b.generatedDate) ? a : b))
            : null;
        const previousAt = previous ? Date.parse(previous.generatedDate) : NaN;
        const usePrevious = !isNaN(previousAt);
        const periodStart = usePrevious
            ? previousAt
            : now.getTime() - DEFAULT_REPORT_PERIOD_DAYS * 86400000;

        const doneColumnIds = new Set(req.columns.filter(c => c.hasArchive).map(c => c.id));
        const inPeriod = (stamp) => stamp !== null && !isNaN(stamp) && stamp >= periodStart && stamp <= now.getTime();

        // A completion inferred from a log entry only has day resolution, so
        // comparing it against an exact instant loses work: a report generated
        // at 15:20 would rule out everything finished earlier the same day,
        // because the log says only "2026-08-29" (i.e. midnight). Day-precision
        // stamps are therefore measured against the start of the period's day.
        // Erring toward one duplicated item at a boundary is far better than
        // silently dropping a day of work from a report shown to a manager.
        const periodStartDay = startOfDayUtc(periodStart);
        const completedInPeriod = (task) => {
            const done = taskCompletedAt(task, doneColumnIds);
            if (!done) return false;
            const floor = done.precision === 'day' ? periodStartDay : periodStart;
            return done.at >= floor && done.at <= now.getTime();
        };

        // Finished work lives in two places: a done column (not archived yet)
        // and the archive. Both count, or everything archived during the week
        // silently vanishes from the report — which is what used to happen.
        const archivedTasks = await readJsonFile(req.profileFiles.archived, []);
        const completed = [...tasks, ...archivedTasks]
            .filter(completedInPeriod)
            .map(mapTask);

        const completedIds = new Set(completed.map(t => t.id));
        const openTasks = tasks.filter(t =>
            !completedIds.has(t.id) &&
            req.columns.some(c => c.id === t.status) &&
            !doneColumnIds.has(t.status)
        );

        const activity = {
            completed,
            // Moved during the period but not finished — the "in flight" story.
            advanced: openTasks
                .filter(t => (t.log || []).some(e => {
                    const at = Date.parse(e.date);   // day precision, as above
                    return !isNaN(at) && at >= periodStartDay && at <= now.getTime();
                }))
                .map(mapTask),
            created: openTasks
                .filter(t => inPeriod(Date.parse(t.createdDate)))
                .map(mapTask),
            // Things worth raising rather than reporting: overdue, or open and
            // untouched for the whole period.
            attention: openTasks
                .filter(t =>
                    (t.deadline && Date.parse(t.deadline) < now.getTime()) ||
                    taskLastActivityAt(t) < periodStartDay
                )
                .map(mapTask)
        };

        const report = {
            id: generateId(),
            title: `Week ${weekNumber} (${dateRange})`,
            generatedDate: now.toISOString(),
            weekNumber,
            dateRange,
            period: {
                start: new Date(periodStart).toISOString(),
                end: now.toISOString(),
                since: usePrevious ? 'previous-report' : 'default-window'
            },
            activity,
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
app.post('/api/:profile/tasks/archive', resolveProfile, writeLimiter, lockTasks(async (req, res) => {
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
        const archivedAt = new Date().toISOString();
        for (const task of doneTasks) {
            task.status = 'archived';
            // Store category name so it persists even if category is later deleted
            task.categoryName = categoryLookup.get(task.category || 1) || 'Non categorized';
            // When it left the board. Reports need a completion timestamp, and
            // inferring one from the last log entry is guesswork — that entry
            // records the last *move*, which is usually but not always the
            // moment the work finished.
            task.archivedDate = archivedAt;
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
}));

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

/**
 * POST write (or rewrite) a report's AI summary.
 *
 * Separate from generation on purpose: a report must appear instantly and
 * must never fail because a model was slow or absent. The client fires this
 * afterwards, and the same endpoint backs the Regenerate button — the first
 * phrasing is not always the one you want to put in front of your manager.
 *
 * Always answers 200: `{ summarised: false, reason }` when the AI cannot
 * help, with the report untouched.
 */
app.post('/api/:profile/reports/:id/summarise', resolveProfile, aiLimiter, async (req, res) => {
    try {
        const reports = await readJsonFile(req.profileFiles.reports, []);
        const report = reports.find(r => r.id === req.params.id);
        if (!report) return res.status(404).json({ error: 'Report not found' });

        if (!report.activity) {
            // Reports generated before v2.56.0 are board snapshots with no
            // period, so there is nothing honest to summarise.
            return res.status(200).json({
                summarised: false,
                reason: 'This report predates period tracking. Generate a new one to summarise it.',
                report
            });
        }

        const resolved = await resolveActiveAiConfig();
        if (!resolved.ok) {
            return res.status(200).json({ summarised: false, reason: resolved.error, report });
        }

        const [epics, memories] = await Promise.all([
            readJsonFile(req.profileFiles.epics, []),
            readJsonFile(req.profileFiles.aiMemory, [])
        ]);

        const systemPrompt = buildReportSummaryPrompt(report, epics, memories);
        const messages = [{ role: 'user', content: 'Summarise this period for my one-to-one.' }];

        let call;
        try {
            call = resolved.providerMeta.format === 'anthropic'
                ? await callAnthropicAi(resolved.apiKey, resolved.model, systemPrompt, messages, [WRITE_REPORT_SUMMARY_TOOL])
                : await callOpenAiCompatibleAi(resolved.baseUrl, resolved.apiKey, resolved.model, systemPrompt, messages, [WRITE_REPORT_SUMMARY_TOOL]);
        } catch (aiErr) {
            return res.status(200).json({ summarised: false, reason: aiErr.message, report });
        }

        const input = call.toolCalls.find(c => c.name === WRITE_REPORT_SUMMARY_TOOL.name)?.input;
        if (!input || typeof input.tldr !== 'string') {
            return res.status(200).json({ summarised: false, reason: 'The model returned no summary', report });
        }

        // Model output is advisory: epic names are matched against the ones
        // actually in the report, so a hallucinated silo cannot appear in a
        // document being taken into a meeting.
        const knownEpics = new Set(
            [...(report.activity.completed || []), ...(report.activity.advanced || []),
             ...(report.activity.created || []), ...(report.activity.attention || [])]
                .map(t => t.epicName || 'Unfiled')
        );
        const epicByName = new Map(epics.map(e => [e.name, e]));

        report.summary = {
            tldr: input.tldr.trim().slice(0, 600),
            silos: (Array.isArray(input.silos) ? input.silos : [])
                .filter(silo => silo && typeof silo.epic === 'string' && knownEpics.has(silo.epic))
                .map(silo => ({
                    epic: silo.epic,
                    stakeholder: epicByName.get(silo.epic)?.stakeholder || '',
                    bullets: (Array.isArray(silo.bullets) ? silo.bullets : [])
                        .filter(b => typeof b === 'string' && b.trim())
                        .map(b => b.trim().slice(0, 300))
                        .slice(0, 6)
                }))
                .filter(silo => silo.bullets.length > 0),
            attention: (Array.isArray(input.attention) ? input.attention : [])
                .filter(a => typeof a === 'string' && a.trim())
                .map(a => a.trim().slice(0, 300))
                .slice(0, 6),
            generatedAt: new Date().toISOString(),
            model: resolved.model
        };

        // Same re-read as classify: the reports array was read before a
        // provider call that takes seconds, so writing it back wholesale would
        // revert any report generated or deleted meanwhile.
        const freshReports = await readJsonFile(req.profileFiles.reports, []);
        const freshIndex = freshReports.findIndex(r => r.id === req.params.id);
        if (freshIndex === -1) {
            return res.json({ summarised: false, reason: 'Report was deleted while summarising' });
        }
        freshReports[freshIndex].summary = report.summary;

        await writeJsonFile(req.profileFiles.reports, freshReports);
        res.json({ summarised: true, report: freshReports[freshIndex] });
    } catch (error) {
        console.error('Report summary failed:', error);
        res.status(500).json({ error: 'Failed to summarise report' });
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
 * ===========================================
 * The interview
 * ===========================================
 *
 * The assistant knows the board but not the world around it — who Mikael is,
 * what EUVIC do, what an abbreviation stands for. None of that is derivable
 * from the data, so the only way to get it is to ask.
 *
 * The questions are grounded in a digest computed here, in code, across every
 * task including the archive: recurring title prefixes, capitalised names that
 * appear repeatedly, epics with no stakeholder recorded. Sending the archive
 * itself would cost thousands of tokens to say what a hundred characters can.
 *
 * Computing it in code has a second benefit: the digest renders with the AI
 * switched off, so the config page can always show what it would ask about.
 */

/** Ignored when scanning titles for names — common words that capitalise. */
// Tool schemas: the shapes the model is asked to emit. Their descriptions are
// the only place it learns when each verb applies, so they live together.
const {
    PROPOSE_TASKS_TOOL,
    CLASSIFY_TASK_TOOL,
    PROPOSE_MEMORY_TOOL,
    WRITE_REPORT_SUMMARY_TOOL,
    PROPOSE_CHANGES_TOOL
} = require('./lib/ai-schemas')({ STORY_POINTS, PROPOSAL_KINDS });

// Validators: everything the model says is untrusted input until it has been
// through here. This is the layer that makes propose-first mean something.
const {
    MAX_SKILLS,
    MAX_MEMORIES,
    normaliseSkillInput,
    validateMemoryText,
    normaliseMemory,
    normaliseProposal,
    applyProposal,
    normaliseStagedTask,
    extractTasksFromText
} = require('./lib/ai-validators')({
    VALIDATION,
    STORY_POINTS,
    DEFAULT_CATEGORY_ID,
    PROPOSAL_KINDS,
    PROPOSAL_REASON_MAX_LENGTH,
    generateId,
    normaliseMemoryCategory,
    validateTaskInput,
    validateMoveInput
});


// Prompt construction: pure functions, no I/O, so the exact text a request
// would send can be asserted without a provider.
const {
    buildInterviewDigest,
    buildInterviewPrompt,
    selectActiveSkills,
    renderSkillsForPrompt,
    renderChatContext,
    renderMemoryForPrompt,
    buildReportSummaryPrompt,
    buildClassifyPrompt,
    buildBoardSnapshot,
    buildAiSystemPromptWithBoard,
    buildAiSystemPrompt,
    getSkippedSkillIds
} = require('./lib/ai-prompts')({
    STORY_POINTS,
    DEFAULT_CATEGORY_ID,
    MEMORY_CATEGORIES,
    normaliseMemoryCategory
});































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
        // A stored baseUrl wins when the provider allows one (Custom, and Kimi
        // for its China host); otherwise the registry default stands.
        baseUrl: (providerMeta.allowsBaseUrl && cfg.baseUrl) ? cfg.baseUrl : providerMeta.baseUrl
    };
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

// The provider dialogue lives in its own module: it is the only code here that
// knows an HTTP wire format, and it needs nothing back from this file.
const {
    ToolCallAccumulator,
    callAnthropicAi,
    streamAnthropicAi,
    streamOpenAiCompatibleAi,
    readSseStream,
    callOpenAiCompatibleAi
} = require('./lib/ai-providers')({
    parseSseChunk,
    extractTasksFromText,
    fetchWithTimeout,
    defaultTools: PROPOSE_TASKS_TOOL
});


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

// GET /api/ai/config/entries/:id/models — list the models this provider offers.
//
// Model ids are provider trivia that change without notice, and a wrong one
// fails at the worst moment: mid-conversation, as an opaque provider error.
// This asks the provider directly, using the stored key. It is a read-only
// call that sends NO board data — only the key travels, and only to the host
// the entry already points at.
app.get('/api/ai/config/entries/:id/models', async (req, res) => {
    try {
        const config = migrateAiConfig(await readJsonFile(AI_CONFIG_FILE, {}));
        const cfg = (config.configs || []).find(c => c.id === req.params.id);
        if (!cfg) return res.status(404).json({ error: 'Config entry not found' });

        const providerMeta = AI_PROVIDERS[cfg.provider];
        if (!providerMeta) return res.status(400).json({ error: 'Unknown AI provider in config.' });
        if (providerMeta.requiresKey && !cfg.apiKey) {
            return res.status(400).json({ error: 'Save an API key first, then fetch the model list.' });
        }

        const baseUrl = (providerMeta.allowsBaseUrl && cfg.baseUrl) ? cfg.baseUrl : providerMeta.baseUrl;
        if (!baseUrl) return res.status(400).json({ error: 'Set a Base URL first.' });

        const isAnthropic = providerMeta.format === 'anthropic';
        const url = isAnthropic
            ? `${baseUrl.replace(/\/+$/, '')}/v1/models`
            : `${baseUrl.replace(/\/+$/, '')}/models`;
        const headers = isAnthropic
            ? { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' }
            : { 'Authorization': `Bearer ${cfg.apiKey}` };

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        let response;
        try {
            response = await fetch(url, { headers, signal: controller.signal });
        } finally {
            clearTimeout(timeout);
        }

        if (!response.ok) {
            const detail = (await response.text().catch(() => '')).slice(0, 300);
            return res.status(502).json({
                error: `Provider returned ${response.status}.`,
                detail
            });
        }

        // OpenAI-compatible and Anthropic both answer { data: [{ id, ... }] }.
        const body = await response.json();
        const models = (body.data || [])
            .map(m => m.id)
            .filter(Boolean)
            .sort();

        res.json({ models, endpoint: url });
    } catch (error) {
        // Never let a provider being unreachable read as a bug in the app.
        res.status(502).json({
            error: error.name === 'AbortError'
                ? 'The provider did not answer within 15 seconds.'
                : `Could not reach the provider: ${error.message}`
        });
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
    // Test-only: the receipt shown when a model answers with a tool call and no
    // text. Reachable without a provider, since provoking a silent reply from a
    // live model on demand is not something a test can rely on.
    app.get('/api/:profile/ai/_test/outcome', resolveProfile, (req, res) => {
        const count = (key) => Array.from({ length: Number(req.query[key]) || 0 }, () => ({}));
        res.json({
            narrative: describeToolOutcome({
                tasks: count('tasks'),
                proposals: count('proposals'),
                memories: count('memories')
            })
        });
    });

    app.get('/api/:profile/ai/_test/prompt', resolveProfile, async (req, res) => {
        // ?page= and ?taskId= mirror the `context` a real chat request sends,
        // so context rendering can be asserted without a live provider.
        try {
            // Must load exactly what the chat handler loads, or this endpoint
            // reports a prompt the model never actually sees.
            const [epics, categories, tasks, memories, skills, archived] = await Promise.all([
                readJsonFile(req.profileFiles.epics, []),
                readJsonFile(req.profileFiles.categories, DEFAULT_CATEGORIES),
                readJsonFile(req.profileFiles.tasks, []),
                readJsonFile(req.profileFiles.aiMemory, []),
                readJsonFile(req.profileFiles.aiSkills, []),
                readJsonFile(req.profileFiles.archived, [])
            ]);

            // ?mode=interview mirrors an interview chat request, so the very
            // different prompt it sends can be asserted without a provider.
            if (req.query.mode === 'interview') {
                const digest = buildInterviewDigest({ tasks, archived, epics, memories });
                const interviewPrompt = buildInterviewPrompt(digest, memories);
                return res.json({ prompt: interviewPrompt, chars: interviewPrompt.length });
            }
            // ?skillIds=a,b mirrors the per-conversation selection a real chat
            // request sends, on top of the always-on ones.
            const selectedSkillIds = (req.query.skillIds || '').split(',').filter(Boolean);
            const prompt = buildAiSystemPromptWithBoard({
                epics, categories, columns: req.columns, tasks, memories,
                skills: selectActiveSkills(skills, selectedSkillIds),
                context: (req.query.page || req.query.taskId)
                    ? { page: req.query.page, taskId: req.query.taskId }
                    : null
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

    const isInterview = req.body.mode === 'interview';

    const [epics, categories, tasks, memories, skills, archived] = await Promise.all([
        readJsonFile(req.profileFiles.epics, []),
        readJsonFile(req.profileFiles.categories, DEFAULT_CATEGORIES),
        readJsonFile(req.profileFiles.tasks, []),
        readJsonFile(req.profileFiles.aiMemory, []),
        readJsonFile(req.profileFiles.aiSkills, []),
        // Only the interview reads the archive: it is the richest source of
        // recurring names, and nothing else needs it on every message.
        isInterview ? readJsonFile(req.profileFiles.archived, []) : Promise.resolve([])
    ]);

    if (isInterview) {
        const digest = buildInterviewDigest({ tasks, archived, epics, memories });
        return {
            ok: true,
            resolved,
            messages,
            epics,
            categories,
            systemPrompt: buildInterviewPrompt(digest, memories),
            // One verb only. An interview that quietly filed tickets would be
            // a different feature than the one the user agreed to.
            tools: [PROPOSE_MEMORY_TOOL]
        };
    }

    return {
        ok: true,
        resolved,
        messages,
        epics,
        categories,
        systemPrompt: buildAiSystemPromptWithBoard({
            epics, categories, columns: req.columns, tasks, memories,
            // Always-on skills plus whatever this conversation selected.
            skills: selectActiveSkills(skills, req.body.skillIds),
            // Untrusted client hint about where the user is; every field is
            // re-checked against real data before it reaches the prompt.
            context: req.body.context || null
        }),
        // Read straight after the prompt build that set it.
        skippedSkillIds: getSkippedSkillIds(),
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
/**
 * A plain description of what a reply did, for when the model says nothing.
 *
 * Models routinely answer a tool-use turn with the tool call alone and no
 * accompanying text. Passing that through renders an empty message bubble: the
 * work happened, and the transcript shows a blank. Observed live on Kimi K3
 * answering an interview question.
 *
 * Deliberately flat and factual — it is a receipt, not the model pretending to
 * have spoken.
 *
 * @param {{tasks: Array, proposals: Array, memories: Array}} stored
 * @returns {string} Empty when nothing happened, so a genuinely empty reply
 *          still reads as one.
 */
function describeToolOutcome(stored) {
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    const parts = [];
    if (stored.tasks?.length) parts.push(`staged ${plural(stored.tasks.length, 'task')}`);
    if (stored.proposals?.length) parts.push(`proposed ${plural(stored.proposals.length, 'change')}`);
    if (stored.memories?.length) parts.push(`noted ${plural(stored.memories.length, 'thing')} to remember`);
    if (!parts.length) return '';

    const sentence = parts.join(', ');
    return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
}

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


// GET all memories (approved and awaiting review)
app.get('/api/:profile/ai/memory', resolveProfile, async (req, res) => {
    try {
        res.json(await readJsonFile(req.profileFiles.aiMemory, []));
    } catch (error) {
        res.status(500).json({ error: 'Failed to read memory' });
    }
});

// POST add a memory by hand — approved immediately, since the user wrote it
app.post('/api/:profile/ai/memory', resolveProfile, writeLimiter, lockMemory(async (req, res) => {
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
            category: normaliseMemoryCategory(req.body.category),
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
}));

// PUT edit text and/or approve. Approving an AI proposal is what lets it
// reach a prompt — until then it is stored but unused.
app.put('/api/:profile/ai/memory/:id', resolveProfile, writeLimiter, lockMemory(async (req, res) => {
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
        if (req.body.category !== undefined) {
            memory.category = normaliseMemoryCategory(req.body.category);
        }

        await writeJsonFile(req.profileFiles.aiMemory, memories);
        res.json(memory);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update memory' });
    }
}));

// DELETE one memory
app.delete('/api/:profile/ai/memory/:id', resolveProfile, writeLimiter, lockMemory(async (req, res) => {
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
}));

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
app.post('/api/:profile/ai/proposals/:id/apply', resolveProfile, writeLimiter, lockProposals(async (req, res) => {
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

        // Archive first, mirroring the hand-driven archive route: if the second
        // write fails the task exists twice, which the reader dedupes, rather
        // than nowhere at all.
        if (result.archivedTask) {
            const archived = await readJsonFile(req.profileFiles.archived, []);
            archived.push(result.archivedTask);
            await writeJsonFile(req.profileFiles.archived, archived);
        }

        await writeJsonFile(req.profileFiles.tasks, tasks);
        proposals.splice(index, 1);
        await writeJsonFile(req.profileFiles.aiProposals, proposals);

        // Attachments stay with the archived task — it can still be restored.
        res.json({ ok: true, task: result.task, archived: !!result.archivedTask });
    } catch (error) {
        console.error('Failed to apply proposal:', error);
        res.status(500).json({ error: 'Failed to apply proposal' });
    }
}));

// POST apply every pending proposal, in order
app.post('/api/:profile/ai/proposals/apply-all', resolveProfile, writeLimiter, lockProposals(async (req, res) => {
    try {
        const proposals = await readJsonFile(req.profileFiles.aiProposals, []);
        if (proposals.length === 0) return res.json({ ok: true, applied: 0, failed: [] });

        const tasks = await readJsonFile(req.profileFiles.tasks, []);
        const ctx = await loadProposalContext(req);

        // One proposal failing must not abort the rest — they are independent
        // decisions the user already made. Failures are reported, not thrown.
        let applied = 0;
        const failed = [];
        const archivedTasks = [];
        for (const proposal of proposals) {
            const result = applyProposal(tasks, proposal, ctx);
            if (result.ok) {
                applied += 1;
                if (result.archivedTask) archivedTasks.push(result.archivedTask);
            } else {
                failed.push({ id: proposal.id, reason: result.error });
            }
        }

        // "Apply all" is the batch that made one careless click dangerous, so
        // it archives too. Archive written first, for the same reason.
        if (archivedTasks.length) {
            const archived = await readJsonFile(req.profileFiles.archived, []);
            await writeJsonFile(req.profileFiles.archived, [...archived, ...archivedTasks]);
        }

        await writeJsonFile(req.profileFiles.tasks, tasks);
        // The whole batch is consumed either way: a proposal that couldn't
        // apply is stale, and re-offering it would just fail again.
        await writeJsonFile(req.profileFiles.aiProposals, []);

        res.json({ ok: true, applied, failed, archived: archivedTasks.length });
    } catch (error) {
        console.error('Failed to apply proposals:', error);
        res.status(500).json({ error: 'Failed to apply proposals' });
    }
}));

// DELETE reject one proposal
app.delete('/api/:profile/ai/proposals/:id', resolveProfile, writeLimiter, lockProposals(async (req, res) => {
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
}));

// DELETE reject all pending proposals
app.delete('/api/:profile/ai/proposals', resolveProfile, writeLimiter, lockProposals(async (req, res) => {
    try {
        await writeJsonFile(req.profileFiles.aiProposals, []);
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to clear proposals' });
    }
}));

// ===========================================
// Interview Routes (profile-scoped)
// ===========================================

// GET what the assistant does not know yet. Computed in code across every
// task including the archive, so it answers with the AI switched off — the
// config page uses it to show whether an interview is worth running.
app.get('/api/:profile/ai/interview/digest', resolveProfile, async (req, res) => {
    try {
        const [tasks, archived, epics, memories] = await Promise.all([
            readJsonFile(req.profileFiles.tasks, []),
            readJsonFile(req.profileFiles.archived, []),
            readJsonFile(req.profileFiles.epics, []),
            readJsonFile(req.profileFiles.aiMemory, [])
        ]);
        res.json(buildInterviewDigest({ tasks, archived, epics, memories }));
    } catch (error) {
        res.status(500).json({ error: 'Failed to build interview digest' });
    }
});

// GET everything the assistant knows, as Markdown.
//
// The JSON file is the source of truth, but a profile is something you read to
// check it is right, and a list of quoted strings is not that.
app.get('/api/:profile/ai/memory/markdown', resolveProfile, async (req, res) => {
    try {
        const memories = await readJsonFile(req.profileFiles.aiMemory, []);
        const LABELS = {
            person: 'People', term: 'Terms and abbreviations',
            project: 'Projects and epics', preference: 'How I like to work', other: 'Other'
        };
        const approved = memories.filter(m => m.approved);

        let md = `# What the assistant knows about me\n\n`;
        if (approved.length === 0) {
            md += '_Nothing yet. Run the interview to fill this in._\n';
        } else {
            for (const category of MEMORY_CATEGORIES) {
                const items = approved.filter(m => normaliseMemoryCategory(m.category) === category);
                if (!items.length) continue;
                md += `## ${LABELS[category]}\n\n${items.map(m => `- ${m.text}`).join('\n')}\n\n`;
            }
        }
        const pending = memories.filter(m => !m.approved);
        if (pending.length) {
            md += `## Awaiting your approval\n\n${pending.map(m => `- ${m.text}`).join('\n')}\n`;
        }
        // res.type() is Express-only; the shim exposes setHeader + send.
        res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
        res.send(md);
    } catch (error) {
        res.status(500).json({ error: 'Failed to render memory' });
    }
});

// ===========================================
// AI Skills Routes (profile-scoped)
// ===========================================

// GET all skills
app.get('/api/:profile/ai/skills', resolveProfile, async (req, res) => {
    try {
        res.json(await readJsonFile(req.profileFiles.aiSkills, []));
    } catch (error) {
        res.status(500).json({ error: 'Failed to read skills' });
    }
});

// POST a new skill
app.post('/api/:profile/ai/skills', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const skills = await readJsonFile(req.profileFiles.aiSkills, []);
        if (skills.length >= MAX_SKILLS) {
            return res.status(400).json({ error: `Maximum ${MAX_SKILLS} skills reached` });
        }
        const result = normaliseSkillInput(req.body);
        if (!result.ok) return res.status(400).json({ error: result.error });

        skills.push(result.skill);
        await writeJsonFile(req.profileFiles.aiSkills, skills);
        res.status(201).json(result.skill);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create skill' });
    }
});

// PUT update a skill
app.put('/api/:profile/ai/skills/:id', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const skills = await readJsonFile(req.profileFiles.aiSkills, []);
        const idx = skills.findIndex(sk => sk.id === req.params.id);
        if (idx === -1) return res.status(404).json({ error: 'Skill not found' });

        const result = normaliseSkillInput(req.body, skills[idx]);
        if (!result.ok) return res.status(400).json({ error: result.error });

        skills[idx] = result.skill;
        await writeJsonFile(req.profileFiles.aiSkills, skills);
        res.json(result.skill);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update skill' });
    }
});

// DELETE a skill
app.delete('/api/:profile/ai/skills/:id', resolveProfile, writeLimiter, async (req, res) => {
    try {
        const skills = await readJsonFile(req.profileFiles.aiSkills, []);
        const remaining = skills.filter(sk => sk.id !== req.params.id);
        if (remaining.length === skills.length) {
            return res.status(404).json({ error: 'Skill not found' });
        }
        await writeJsonFile(req.profileFiles.aiSkills, remaining);

        // A deleted skill must also stop applying to conversations that
        // selected it, or reopening an old thread would silently send an id
        // that no longer resolves.
        const store = await readConversationStore(req);
        let touched = false;
        for (const convo of store.conversations) {
            const kept = (convo.skillIds || []).filter(id => id !== req.params.id);
            if (kept.length !== (convo.skillIds || []).length) {
                convo.skillIds = kept;
                touched = true;
            }
        }
        if (touched) await writeConversationStore(req, store);

        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete skill' });
    }
});

/**
 * Maximum saved conversations per profile. Old threads fall off by least
 * recently touched — this is a history you can return to, not an archive.
 */
const MAX_CONVERSATIONS = 50;

/** Longest auto-derived conversation title. */
const CONVERSATION_TITLE_MAX_LENGTH = 60;

/**
 * Derives a thread's title from its first user message, so a saved
 * conversation is recognisable in a list without asking the model to name it
 * (which would cost a call, and fail when the AI is offline).
 * @param {Array<Object>} messages
 * @returns {string}
 */
function deriveConversationTitle(messages) {
    const first = messages.find(m => m.role === 'user');
    if (!first) return 'New conversation';
    const flat = first.content.replace(/\s+/g, ' ').trim();
    if (!flat) return 'New conversation';
    return flat.length > CONVERSATION_TITLE_MAX_LENGTH
        ? `${flat.slice(0, CONVERSATION_TITLE_MAX_LENGTH - 1)}\u2026`
        : flat;
}

/** @returns {Object} A fresh, empty conversation. */
function newConversation() {
    const now = new Date().toISOString();
    return { id: generateId(), title: 'New conversation', createdAt: now, updatedAt: now, skillIds: [], mode: 'chat', messages: [] };
}

/**
 * Reads the conversation store, migrating the pre-v2.58 single-transcript
 * shape (`{ messages: [] }`) into the multi-thread one.
 *
 * The old file held exactly one conversation with nowhere to put a second, so
 * "clear" was the only way to start a new topic and it destroyed the previous
 * one. Migration keeps that transcript as the first saved thread rather than
 * discarding history on upgrade.
 *
 * @param {Object} req
 * @returns {Promise<{activeId: string, conversations: Array<Object>}>}
 */
async function readConversationStore(req) {
    const raw = await readJsonFile(req.profileFiles.aiConversation, {});

    if (Array.isArray(raw.conversations)) {
        const conversations = raw.conversations.filter(c => c && typeof c.id === 'string');
        if (conversations.length === 0) {
            const fresh = newConversation();
            return { activeId: fresh.id, conversations: [fresh] };
        }
        const activeId = conversations.some(c => c.id === raw.activeId)
            ? raw.activeId
            : conversations[0].id;
        return { activeId, conversations };
    }

    // Legacy shape, or an absent/empty file.
    const legacy = Array.isArray(raw.messages) ? raw.messages : [];
    const convo = newConversation();
    if (legacy.length) {
        convo.messages = legacy;
        convo.title = deriveConversationTitle(legacy);
        convo.createdAt = legacy[0]?.at || convo.createdAt;
        convo.updatedAt = legacy[legacy.length - 1]?.at || convo.updatedAt;
    }
    return { activeId: convo.id, conversations: [convo] };
}

/** Sanitises a transcript from the client and bounds its length. */
function cleanMessages(messages) {
    return messages
        .filter(m => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
        .slice(-MAX_CONVERSATION_MESSAGES)
        .map(m => ({ role: m.role, content: m.content, at: m.at || new Date().toISOString() }));
}

/** Persists the store, dropping the least recently touched threads over the cap. */
async function writeConversationStore(req, store) {
    const ordered = [...store.conversations].sort(
        (a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0)
    );
    const kept = ordered.slice(0, MAX_CONVERSATIONS);
    const activeId = kept.some(c => c.id === store.activeId) ? store.activeId : kept[0]?.id || null;
    await writeJsonFile(req.profileFiles.aiConversation, { activeId, conversations: kept });
    return { activeId, conversations: kept };
}

/** Strips transcripts — the list view only needs enough to pick a thread. */
const toConversationSummary = (c) => ({
    id: c.id,
    title: c.title,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    skillIds: c.skillIds || [],
    mode: c.mode || 'chat',
    messageCount: (c.messages || []).length
});

// GET the active conversation, with its transcript
app.get('/api/:profile/ai/conversation', resolveProfile, async (req, res) => {
    try {
        const store = await readConversationStore(req);
        const active = store.conversations.find(c => c.id === store.activeId);
        res.json({
            id: active.id,
            title: active.title,
            skillIds: active.skillIds || [],
            mode: active.mode || 'chat',
            messages: active.messages || []
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to read conversation' });
    }
});

// PUT replace the active conversation's transcript. The client owns the
// transcript and writes it back after each exchange; the server bounds its
// length and keeps the title in step with the opening message.
app.put('/api/:profile/ai/conversation', resolveProfile, writeLimiter, lockConversation(async (req, res) => {
    try {
        const { messages, skillIds, conversationId } = req.body;
        if (!Array.isArray(messages)) {
            return res.status(400).json({ error: 'messages must be an array' });
        }
        const store = await readConversationStore(req);

        // Addressed by id when the client says which thread it means. "Active"
        // is server-side global state that any other tab can change, so writing
        // blind to it can drop tab B's transcript into tab A's thread — and a
        // browser homepage is open in several tabs by definition.
        const active = conversationId
            ? store.conversations.find(c => c.id === conversationId)
            : store.conversations.find(c => c.id === store.activeId);
        if (!active) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        active.messages = cleanMessages(messages);
        active.updatedAt = new Date().toISOString();
        if (Array.isArray(skillIds)) active.skillIds = skillIds.filter(id => typeof id === 'string');
        // Retitle only while the thread is still unnamed, so a user's own
        // rename is never overwritten by a later edit to the first message.
        if (active.title === 'New conversation') active.title = deriveConversationTitle(active.messages);

        await writeConversationStore(req, store);
        res.json({ ok: true, count: active.messages.length, title: active.title });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save conversation' });
    }
}));

// DELETE clear the active conversation's messages, keeping the thread itself
app.delete('/api/:profile/ai/conversation', resolveProfile, writeLimiter, lockConversation(async (req, res) => {
    try {
        const store = await readConversationStore(req);
        const active = store.conversations.find(c => c.id === store.activeId);
        active.messages = [];
        active.title = 'New conversation';
        active.updatedAt = new Date().toISOString();
        await writeConversationStore(req, store);
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to clear conversation' });
    }
}));

// GET the list of saved conversations, newest first, without transcripts
app.get('/api/:profile/ai/conversations', resolveProfile, async (req, res) => {
    try {
        const store = await readConversationStore(req);
        const conversations = [...store.conversations]
            .sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0))
            .map(toConversationSummary);
        res.json({ activeId: store.activeId, conversations });
    } catch (error) {
        res.status(500).json({ error: 'Failed to read conversations' });
    }
});

// POST start a new conversation and make it active
app.post('/api/:profile/ai/conversations', resolveProfile, writeLimiter, lockConversation(async (req, res) => {
    try {
        const store = await readConversationStore(req);
        const active = store.conversations.find(c => c.id === store.activeId);

        const mode = req.body?.mode === 'interview' ? 'interview' : 'chat';

        // Starting a new thread from an untouched one would leave a trail of
        // empty "New conversation" rows, so reuse it instead — unless the mode
        // differs, since a thread's mode is fixed once it has one.
        if (active && (active.messages || []).length === 0 && (active.mode || 'chat') === mode) {
            if (Array.isArray(req.body?.skillIds)) {
                active.skillIds = req.body.skillIds.filter(id => typeof id === 'string');
                await writeConversationStore(req, store);
            }
            return res.status(200).json(active);
        }

        const convo = newConversation();
        convo.mode = mode;
        convo.title = mode === 'interview'
            ? `Interview — ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
            : convo.title;
        // A new thread inherits the current one's skills: switching topic is
        // not usually a request to change voice. An interview takes none —
        // its prompt is its own, and a voice skill would fight it.
        convo.skillIds = mode === 'interview' ? [] : (Array.isArray(req.body?.skillIds)
            ? req.body.skillIds.filter(id => typeof id === 'string')
            : (active?.skillIds || []));
        store.conversations.push(convo);
        store.activeId = convo.id;
        await writeConversationStore(req, store);
        res.status(201).json(convo);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create conversation' });
    }
}));

// PUT switch to a saved conversation, returning its transcript
app.put('/api/:profile/ai/conversations/:id/activate', resolveProfile, writeLimiter, lockConversation(async (req, res) => {
    try {
        const store = await readConversationStore(req);
        const target = store.conversations.find(c => c.id === req.params.id);
        if (!target) return res.status(404).json({ error: 'Conversation not found' });

        store.activeId = target.id;
        await writeConversationStore(req, store);
        res.json(target);
    } catch (error) {
        res.status(500).json({ error: 'Failed to switch conversation' });
    }
}));

// PUT rename a conversation
app.put('/api/:profile/ai/conversations/:id', resolveProfile, writeLimiter, lockConversation(async (req, res) => {
    try {
        const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
        if (!title) return res.status(400).json({ error: 'Title is required' });
        if (title.length > CONVERSATION_TITLE_MAX_LENGTH) {
            return res.status(400).json({ error: `Title must be ${CONVERSATION_TITLE_MAX_LENGTH} characters or less` });
        }

        const store = await readConversationStore(req);
        const target = store.conversations.find(c => c.id === req.params.id);
        if (!target) return res.status(404).json({ error: 'Conversation not found' });

        target.title = title;
        await writeConversationStore(req, store);
        res.json(toConversationSummary(target));
    } catch (error) {
        res.status(500).json({ error: 'Failed to rename conversation' });
    }
}));

// DELETE one saved conversation
app.delete('/api/:profile/ai/conversations/:id', resolveProfile, writeLimiter, lockConversation(async (req, res) => {
    try {
        const store = await readConversationStore(req);
        const remaining = store.conversations.filter(c => c.id !== req.params.id);
        if (remaining.length === store.conversations.length) {
            return res.status(404).json({ error: 'Conversation not found' });
        }

        // Never leave the assistant with no thread to write into: deleting the
        // last one starts a fresh empty thread rather than an absent active id.
        store.conversations = remaining.length ? remaining : [newConversation()];
        if (!store.conversations.some(c => c.id === store.activeId)) {
            const newest = [...store.conversations].sort(
                (a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0)
            )[0];
            store.activeId = newest.id;
        }
        const saved = await writeConversationStore(req, store);
        res.json({ ok: true, activeId: saved.activeId });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete conversation' });
    }
}));

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

        const { resolved, systemPrompt, tools, messages, epics, categories, skippedSkillIds } = prep;

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
            // `synthetic` tells the client this narrative is a receipt the
            // server wrote, not the model speaking — so it can skip its own
            // outcome line instead of printing the same counts twice.
            narrative: narrative || describeToolOutcome(stored),
            synthetic: !narrative,
            tasks: stored.tasks,
            proposals: stored.proposals,
            memories: stored.memories,
            skippedSkillIds: skippedSkillIds || [],
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

    const { resolved, systemPrompt, tools, messages, epics, categories, skippedSkillIds } = prep;

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

        // Deliberate: this runs even if the client has already gone away —
        // closed the tab, lost the connection. The alternative is discarding
        // work the provider has already been paid for, which is worse. The
        // rows land where the user will find them (the staging list, the
        // pending badge) even though no transcript turn explains them.
        const stored = await persistAiToolOutput(req, {
            rawTasks: call.rawTasks, toolCalls: call.toolCalls, epics, categories
        });

        // Nothing was streamed and the model only called tools — the client has
        // an empty bubble on screen, so give it something true to show.
        const fallback = call.narrative ? '' : describeToolOutcome(stored);
        if (fallback) send('text', { delta: fallback });

        send('done', {
            narrative: call.narrative || fallback,
            synthetic: !call.narrative,
            skippedSkillIds: skippedSkillIds || [],
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
/**
 * The AI page was removed in v2.55.0 — chat moved to the floating assistant
 * and staging moved onto the backlog page. Old links and bookmarks would
 * otherwise land silently on the board (unknown pages fall back to it), so
 * they are pointed at where the feature actually went.
 */
app.get('/:alias/ai', (req, res) => {
    res.redirect(301, `/${req.params.alias}/backlog`);
});

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
