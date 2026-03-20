# S2 Episode 5: api.js — The HTTP Layer

**Duration:** ~9 minutes
**Files to open:** `public/js/api.js`
**Style:** Code walkthrough

---

Welcome back. Today we're going through `api.js` — your HTTP client layer. This file is about 711 lines, but it's actually very repetitive in a good way. Once you understand one function, you understand them all. That's the sign of a well-structured API layer.

## The Golden Rule: Pure Functions

Before we look at code, understand the rule that governs this file: **API functions do one thing — make HTTP calls and return the result. No side effects.**

They don't update state. They don't show toasts. They don't render anything. They don't close modals. They just talk to the server and report back.

Why? Because the same API function might be called from different contexts. `fetchTasksApi()` is called during board initialization, after creating a task, after archiving, after restoring from archive. Each context needs to handle the result differently. If the API function also updated state, it would be doing the right thing for one context but the wrong thing for another.

In React, this same principle is followed by data fetching libraries like TanStack Query — the query function is pure, the library handles caching and state separately.

In LWC, Apex methods are pure server calls too — the `@wire` decorator or imperative call handles what happens with the result.

## The Profile-Scoped Base URL

Look at the top of the file, around line 14:

```javascript
let apiBase = '';

export function setApiBase(alias) {
    apiBase = `/api/${alias}`;
}
```

This is called once during init, when the active profile is determined. After `setApiBase('work')`, all task/category/epic API calls automatically go to `/api/work/tasks`, `/api/work/epics`, etc.

This is a simple form of **configuration injection**. Instead of passing the profile alias to every single API function, you set it once and it's used everywhere. Clean.

Note: profile management APIs (create/delete profile) don't use `apiBase` because they're global — not scoped to a specific profile. They hit `/api/profiles` directly.

## The Fetch Pattern

Let's look at a typical API function. Open `fetchTasksApi()` around line 22:

```javascript
export async function fetchTasksApi() {
    const response = await fetch(`${apiBase}/tasks`);
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch tasks');
    }
    return response.json();
}
```

Let's dissect each line:

1. `async function` — it returns a Promise. The caller can `await` it.
2. `fetch(url)` — the browser's built-in HTTP function. Returns a Promise that resolves to a Response object.
3. `response.ok` — a boolean. `true` if the HTTP status code is 200-299 (success). `false` for 4xx (client error) or 5xx (server error).
4. Error handling: if not ok, parse the error body and throw. The caller's `catch` block will handle it.
5. `return response.json()` — parse the response body as JSON. Returns a Promise (which is why the function is async).

This is the standard `fetch` pattern. You'll see it everywhere in modern JavaScript.

**Important subtlety**: `response.json()` itself returns a Promise. But since the function is `async`, returning a Promise from an async function is fine — the `await` in the calling code handles it.

## POST, PUT, DELETE Patterns

Now look at `createTaskApi()` around line 36:

```javascript
export async function createTaskApi(taskData) {
    const response = await fetch(`${apiBase}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData)
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create task');
    }
    return response.json();
}
```

The differences from GET:

- `method: 'POST'` — specifies the HTTP method. GET is the default, so fetch calls don't need it. POST, PUT, DELETE must be explicit.
- `headers: { 'Content-Type': 'application/json' }` — tells the server "the body is JSON." Without this header, Express's `express.json()` middleware wouldn't parse the body.
- `body: JSON.stringify(taskData)` — the payload. `fetch` requires the body to be a string, so you serialize the JavaScript object to JSON.

`updateTaskApi()` looks almost identical but uses `method: 'PUT'` and includes the task ID in the URL: `` `${apiBase}/tasks/${id}` ``.

`deleteTaskApi()` uses `method: 'DELETE'` and typically doesn't send a body.

## The Move Endpoint: A Special Case

Look at `moveTaskApi()` around line 77:

```javascript
export async function moveTaskApi(id, newStatus, newPosition) {
    const response = await fetch(`${apiBase}/tasks/${id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newStatus, newPosition })
    });
    // ...
}
```

This uses POST to a `/move` sub-resource. Why not PUT? Because this isn't a general update — it's a specific action (move) that triggers side effects on the server (recalculating positions for all tasks in both columns, adding a log entry).

REST purists might debate this, but using POST for action-like endpoints is common and practical. The URL makes the intent clear: "move this task."

## Error Handling: Throw vs Return

Your API functions THROW on error. They don't return error objects. This is a design choice.

The alternative would be:
```javascript
// Return-based error handling
if (!response.ok) {
    return { ok: false, error: 'Failed' };
}
return { ok: true, data: await response.json() };
```

Some of your functions actually use this pattern (look at some of the profile or AI functions). The throw-based pattern works better with try/catch in the calling code (which is what your optimistic UI pattern uses). The return-based pattern is useful when the caller wants to check success without a try/catch.

Both are valid. The important thing is consistency within a project. Your project uses both, which is a small inconsistency — but it works.

In LWC, Apex calls throw on error by default. The calling code uses try/catch or the error callback in `@wire`. So the throw pattern is actually more aligned with LWC.

## Parallel Fetching

Let's look at how `init()` in `app.js` calls these functions. Around line 1005:

```javascript
const [tasksData, categoriesData, epicsData, columnsData] = await Promise.all([
    fetchTasksApi(),
    fetchCategoriesApi(),
    fetchEpicsApi(),
    fetchColumnsApi()
]);
```

Four API functions called simultaneously. `Promise.all()` starts all four fetch requests at once and waits for all of them to complete. The results come back as an array, destructured into four variables.

If any of these fails, `Promise.all()` rejects immediately — the first error wins. That's usually what you want for initialization: if you can't load categories, there's no point rendering the board.

There's also `Promise.allSettled()` — which waits for ALL promises to complete, regardless of whether some fail. Useful when you want partial results. For example, your dashboard page might want to show stats even if one data source fails.

## The AI API Functions

Scroll down to the AI section, around line 588. These functions are interesting because they show different API patterns.

**The chat endpoint:**
```javascript
export async function sendAiChatApi(messages) {
    const response = await fetch(`${apiBase}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages })
    });
    // ...
}
```

This sends the entire conversation history with every request. The server is stateless — it doesn't remember previous messages. The client maintains the conversation history in memory and sends the full array each time.

This is how most AI chat APIs work. The ChatGPT API works the same way. Every request includes the full message history so the model has context.

**The AI config endpoint (global, not profile-scoped):**

```javascript
export async function fetchAiConfigApi() {
    const response = await fetch('/api/ai/config');  // No apiBase!
    // ...
}
```

Notice it uses `/api/ai/config` directly, not `${apiBase}/ai/config`. AI configuration is global — it applies to all profiles. The API key, provider, and model are shared settings.

**Staged task promotion:**

```javascript
export async function promoteToBacklogApi(id) {
    const response = await fetch(`${apiBase}/ai/staged/${id}/promote/backlog`, {
        method: 'POST'
    });
    // ...
}
```

A POST with no body. The URL itself contains all the information: which staged task, what action (promote), where to (backlog). The server handles the rest — creating a real task from the staged data, deleting the staged entry, adding a log message.

## What Fetch Doesn't Give You (And Libraries Do)

Your `fetch`-based API layer is clean and simple. But there are things it doesn't do that popular libraries handle:

**Request cancellation** — if the user navigates away mid-request, `fetch` keeps running. The `AbortController` API can cancel fetches, but you'd need to wire it up manually. Libraries like Axios handle this.

**Automatic retries** — if a request fails due to a network glitch, you'd need to add retry logic yourself. Libraries like TanStack Query retry automatically.

**Response caching** — your app fetches tasks fresh every time. Libraries can cache responses and serve from cache, only refetching when data might be stale.

**Request deduplication** — if two parts of the app call `fetchTasksApi()` simultaneously, two requests go out. Libraries can detect this and share one request.

**Interceptors** — global request/response transformations. Want to add an auth token to every request? In Axios, you set up an interceptor. With raw `fetch`, you'd wrap it manually.

For your project, none of these are necessary. It's a local, single-user app. But if you built this for production with thousands of users, you'd probably reach for a library or build some of these features.

## Key Takeaway

`api.js` is a pure HTTP layer — clean, predictable, and stateless. Each function does one thing: send a request, return the result. The pattern is consistent: build URL, set method and headers, serialize body, check response, throw on error. Every framework needs this layer; your implementation is the simplest correct version.

Next episode, we're crossing to the other side — `server.js` — to see what happens when these API calls arrive.

---

*Next: S2E06 — "server.js: The Other Side of the API"*
