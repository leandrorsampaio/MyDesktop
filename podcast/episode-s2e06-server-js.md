# S2 Episode 6: server.js — The Other Side of the API

**Duration:** ~12 minutes
**Files to open:** `server.js`
**Style:** Code walkthrough

---

Welcome back. We've seen the frontend make requests. Now let's see what happens on the other side. Open `server.js`. This is the biggest file in the project and the only backend file. Everything the server does lives here.

This is a long episode because the server has a lot going on. Take it section by section.

## The Requires (Line 1-3)

```javascript
const express = require('express');
const fs = require('fs').promises;
const path = require('path');
```

Three imports. That's it. Your entire backend uses three packages — and two of them (`fs`, `path`) are built into Node.js.

`express` is the web framework. `fs.promises` is the file system module (the promise-based version, so you can use `await`). `path` is for constructing file paths safely across operating systems.

Notice the `require()` syntax instead of `import`. That's because `server.js` uses CommonJS modules (the Node.js traditional system), not ES modules. Your frontend uses ES modules (`import/export`). Why the difference? Historically, Node.js only supported CommonJS. ES module support came later and is still not universal in the Node ecosystem. Using `require()` is the safe choice for Node.js servers.

## Express Setup (Lines 5-73)

```javascript
const app = express();
```

Creates an Express application. This object is the server. You'll attach routes, middleware, and settings to it.

```javascript
const PORT = process.env.PORT || 3001;
```

Port configuration. `process.env.PORT` checks for an environment variable (useful for deployment). Defaults to 3001.

Lines 14-17: Data paths:
```javascript
const DATA_DIR = path.join(__dirname, 'data');
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');
```

`__dirname` is a Node.js variable that gives the directory of the current file. `path.join()` combines path segments safely — it handles `/` vs `\` differences between Mac/Linux and Windows.

Lines 24-60: The AI_PROVIDERS registry:
```javascript
const AI_PROVIDERS = {
    anthropic: { label: 'Anthropic (Claude)', format: 'anthropic', baseUrl: '...', ... },
    openai: { label: 'OpenAI', format: 'openai-compatible', ... },
    groq: { ... },
    google: { ... },
    custom: { ... }
};
```

This is a configuration object — a lookup table of supported AI providers. Each entry has a label, API format, base URL, and default model. The `custom` provider has no fixed base URL — the user provides it. This pattern of having a registry object is very common in backend code.

## Middleware (Lines 71-73)

```javascript
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
```

Two lines that do a lot.

`express.json()` — parses JSON request bodies. When the frontend sends `{ title: "Buy milk" }`, this middleware converts the raw text into a JavaScript object available at `req.body`. Without it, `req.body` would be `undefined`.

`express.static('public')` — serves static files directly. When the browser requests `/app.js`, Express looks in the `public` folder, finds `app.js`, and sends it. No route needed. This is how all your frontend files (HTML, CSS, JS, component templates) reach the browser.

The order matters. Middleware runs top to bottom. `express.json()` first (parse bodies), then static files (serve frontend), then your custom routes below.

## Rate Limiting (Lines 75-156)

This is a hand-built rate limiter. No npm package — just a Map and some arithmetic.

```javascript
const rateLimitStore = new Map();
```

The store maps IP addresses to request counts. Each entry tracks: how many requests this IP made, how many were writes, and when the current window started.

Look at the middleware function around line 110:

```javascript
function rateLimiter(req, res, next) {
    const ip = req.ip;
    const now = Date.now();
    // ...
    if (now - data.windowStart > RATE_LIMIT.WINDOW_MS) {
        // Window expired, reset
        data.count = 0;
        data.writeCount = 0;
        data.windowStart = now;
    }
    data.count++;
    if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
        data.writeCount++;
        if (data.writeCount > RATE_LIMIT.MAX_WRITES) {
            return res.status(429).json({ error: 'Too many write requests' });
        }
    }
    // ...
    next();
}
```

The algorithm: for each request, check if the time window has expired. If yes, reset counters. Increment the count. If it exceeds the limit, return HTTP 429 (Too Many Requests). Otherwise, call `next()` to continue to the actual route handler.

`next()` is an Express concept — it means "I'm done, pass the request to the next middleware or route." If you don't call `next()` and don't send a response, the request hangs forever.

Lines 98-100: A cleanup interval runs every 5 minutes to delete old entries from the Map. Without this, the Map would grow indefinitely as new IPs make requests. This is a simple form of garbage collection.

There's also an `aiLimiter` — a stricter limiter (10 requests/minute) specifically for the AI chat endpoint, because those calls cost real money.

## File I/O Helpers (Lines 271-305)

```javascript
async function readJsonFile(filePath, defaultValue = []) {
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch {
        return defaultValue;
    }
}

async function writeJsonFile(filePath, data) {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
}
```

Two functions that handle all file persistence. `readJsonFile` reads a file, parses JSON, returns the data. If the file doesn't exist (first run), it returns the default value (empty array). The `catch` silently handles the missing file.

`writeJsonFile` serializes data to JSON (with 2-space indentation for readability) and writes it. The `null, 2` in `JSON.stringify` is for pretty-printing.

This is your "database." In a real production app, you'd use SQLite, PostgreSQL, or MongoDB here. But for a local single-user app, file I/O is perfectly fine.

**Important limitation**: file operations are not atomic. If the server crashes while writing, the file could be corrupted (partially written). Production databases handle this with write-ahead logs and transactions. Your app doesn't need that level of safety, but it's good to know.

## The resolveProfile Middleware (Line 565)

This is one of the most important functions in the server. It's middleware that runs before every profile-scoped route.

```javascript
async function resolveProfile(req, res, next) {
    const alias = req.params.profile;
    const profiles = await readJsonFile(PROFILES_FILE, []);
    const profile = profiles.find(p => p.alias === alias);

    if (!profile) {
        return res.status(404).json({ error: 'Profile not found' });
    }
    // ...
    req.profile = profile;
    req.columns = profile.columns.sort((a, b) => a.order - b.order);
    req.profileFiles = {
        tasks: path.join(DATA_DIR, alias, 'tasks.json'),
        archived: path.join(DATA_DIR, alias, 'archived-tasks.json'),
        // ... other file paths
    };
    next();
}
```

It does three things:
1. Validates the profile exists (returns 404 if not)
2. Attaches useful data to the `req` object (profile, sorted columns, file paths)
3. Auto-migrates old profiles (adds default columns if missing, adds backlog column if absent)

After this middleware runs, every route handler can access `req.profile`, `req.columns`, and `req.profileFiles` without repeating the lookup logic. This is middleware at its best — centralizing repeated logic.

The auto-migration is particularly clever: old profiles that predate the columns feature get `DEFAULT_COLUMNS` added automatically. Old profiles without a backlog column get one added. This means you never need a separate migration script — the middleware handles it lazily, on first request.

## A Route Handler: Task CRUD

Let's trace a complete route. Look at the POST handler for creating tasks (search for `app.post` with `/tasks`):

```javascript
app.post('/api/:profile/tasks', resolveProfile, writeLimiter, async (req, res) => {
```

The route path is `/api/:profile/tasks`. The `:profile` is a URL parameter — Express extracts it and puts it in `req.params.profile`.

Notice the middleware chain: `resolveProfile` runs first (validates profile, attaches data), then `writeLimiter` (checks rate limit), then the route handler. If `resolveProfile` sends a 404, the route handler never executes. If `writeLimiter` sends a 429, same thing. This is the pipeline pattern.

Inside the handler:

```javascript
    const { title, description, priority, category, epicId, deadline, snoozeUntil } = req.body;
```

Destructure the request body — these are the fields sent from the frontend.

```javascript
    const validation = validateTaskInput(req.body, {
        requireTitle: true,
        validCategoryIds: categories.map(c => c.id),
        validEpicIds: epics.map(e => e.id)
    });
    if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
    }
```

Input validation. `validateTaskInput()` checks that title exists and isn't too long, category ID is valid, epic ID exists or is null, etc. If anything is wrong, return 400 (Bad Request) with an error message.

**This server-side validation is essential.** Even though the frontend validates too, never trust the client. Anyone could send a crafted HTTP request directly (using curl, Postman, or browser dev tools) and bypass frontend validation. The server must validate independently.

Then the handler reads the tasks file, creates the new task object with a generated ID and default values, adds it to the array, writes the file, and returns the new task:

```javascript
    const tasks = await readJsonFile(req.profileFiles.tasks);
    const newTask = {
        id: generateId(),
        title: title.trim(),
        description: (description || '').trim(),
        // ... all fields with defaults
        log: [{ date: new Date().toISOString(), action: 'Task created' }]
    };
    tasks.push(newTask);
    await writeJsonFile(req.profileFiles.tasks, tasks);
    res.status(201).json(newTask);
```

`res.status(201)` — 201 means "Created." It's the proper HTTP status for resource creation. `res.json(newTask)` sends the task as JSON response. The frontend receives this and uses it to replace the temporary task.

## The Move Endpoint: Server-Side Position Management

Search for the move endpoint (`/tasks/:id/move`). This one is interesting because the server does real work, not just CRUD.

When a card is moved, the server needs to:

1. Find the task
2. Remove it from its current column's position sequence
3. Insert it into the new column at the requested position
4. Renumber all positions in BOTH affected columns

The position renumbering ensures positions are always sequential (0, 1, 2, 3...) with no gaps. The frontend relies on positions for display order, so gaps would cause issues.

The server also adds a log entry: `"Moved from 'To Do' to 'In Progress'"`. Column names are resolved from `req.columns`. This is data enrichment that only the server can do reliably.

## SPA Routing (Near the Bottom)

Search for the catch-all route:

```javascript
app.get('/:alias/:page', async (req, res) => {
    // ... validate profile exists
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/:alias', async (req, res) => {
    // ... validate profile exists
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
```

These routes serve `index.html` for any URL that matches a profile alias (with or without a sub-page). This is the server side of SPA routing — it always sends the same file, and JavaScript decides what to render.

The routes check that the profile exists. If someone visits `/nonexistent`, the server redirects to the default profile instead of showing an error.

**Order matters**: these routes are defined AFTER all `/api/*` routes. Express matches routes top-to-bottom. If the catch-all was first, it would intercept API calls.

## Server Start (Last Lines)

```javascript
app.listen(PORT, () => {
    console.log(`Task Tracker running at http://localhost:${PORT}`);
});
```

Starts the server. `app.listen()` tells Node.js to start accepting connections on the specified port. The callback runs once the server is ready.

## Key Takeaway

Your server is a straightforward Express application: middleware for parsing and validation, route handlers for CRUD, file I/O for persistence, and catch-all routes for SPA routing. The `resolveProfile` middleware is the centerpiece — it handles authentication (profile validation), data access setup, and backward-compatible migrations in one place.

The patterns here — middleware chains, input validation, error responses, file-based storage — are the same patterns used in production Express apps, just at a smaller scale.

Next episode, we're going back to the frontend for `modal-dialog.js` and `modals.js` — how your modal system works from component to orchestration.

---

*Next: S2E07 — "Modals: From Component to Orchestration"*
