# S2 Episode 4: state.js — 200 Lines That Run Everything

**Duration:** ~8 minutes
**Files to open:** `public/js/state.js`
**Style:** Code walkthrough

---

Welcome back. Open `state.js`. It's only about 200 lines, making it one of the smallest files in the project. But every other file depends on it. This is the centralized state store — the single source of truth for your application's data.

## The Architecture Decision

Before we look at the code, let's understand WHY this file exists.

Without a centralized store, each part of the app would need to fetch its own data. The kanban board fetches tasks. The filter module fetches tasks. The modal module fetches tasks. Three copies. Change one, the others are stale.

With `state.js`, there's one copy of tasks. Everyone reads from the same place. Change it once, render from it everywhere.

This is the same problem Redux solves for React, Vuex solves for Vue, and NgRx solves for Angular. Your file is much simpler than those libraries, but the core idea is identical.

## The State Variables

Look at the top of the file. Each piece of state is a module-level variable:

```javascript
let tasks = [];               // Line ~8
let editingTaskId = null;      // Line ~11
let activeCategoryFilters = new Set();  // Line ~14
let priorityFilterActive = false;       // Line ~17
let crisisModeActive = false;           // Line ~20
let categories = [];           // Line ~23
let epics = [];                // Line ~26
let activeEpicFilter = null;   // Line ~29
let profiles = [];             // Line ~32
let activeProfile = null;      // Line ~35
let columns = [];              // Line ~38
let originalTitle = '';        // Line ~41
```

Notice these are `let`, not `const`. They need to be reassignable because the setters replace the whole value.

Also notice they're NOT exported directly. You can't do `import { tasks } from './state.js'` and get a live reference. JavaScript modules export bindings, but for primitive-like reassignment (like `tasks = newArray`), the imported value wouldn't update in the importing module.

Wait — actually, ES module exports ARE live bindings. If state.js exports `tasks` and another module imports it, when `state.js` reassigns `tasks`, the imported binding DOES update. This is a unique feature of ES modules that CommonJS (`require`) doesn't have.

Let me clarify: your code exports both the variables AND setter functions. The variables give read access; the setters give write access. Let's look at the pattern.

## Getters and Setters

The exports follow a consistent pattern — for each piece of state, there's the variable (for reading) and a setter function (for writing):

```javascript
// Tasks
export { tasks };                          // Read access
export function setTasks(newTasks) {       // Write access
    tasks = newTasks;
}
```

The setter is a plain function that reassigns the module variable. Any module that imported `tasks` now sees the new value (because ES module exports are live bindings).

This is elegant in its simplicity. In Redux, you'd need actions, reducers, a store, and dispatch calls. In your code, it's just a function that reassigns a variable.

Look at the more specialized task mutators:

**`addTask(task)`** (around line 55):
```javascript
export function addTask(task) {
    tasks = [...tasks, task];
}
```

Creates a new array with the task appended. Notice it doesn't use `tasks.push(task)` — it creates a NEW array. This matters for one reason: if any code is holding a reference to the old array, it still has the old data. The new array is a fresh object. This is the **immutability pattern** — instead of mutating data, create new data.

In React, this is essential: `useState` only triggers re-renders when it receives a new reference. `push()` mutates the same array, so React wouldn't detect the change. Your code doesn't have automatic reactivity, but the pattern is still good practice.

In LWC, the same rule applies: reactive properties only update when reassigned. `this.tasks = [...this.tasks, task]` triggers a re-render. `this.tasks.push(task)` does not.

**`updateTaskInState(id, updates)`** (around line 64):
```javascript
export function updateTaskInState(id, updates) {
    tasks = tasks.map(t =>
        t.id === id ? { ...t, ...updates } : t
    );
}
```

This uses `map()` to create a new array where one task is replaced with an updated copy. `{ ...t, ...updates }` uses the spread operator to merge the existing task with the new fields. Any field in `updates` overrides the corresponding field in `t`.

This is a classic immutable update pattern. The original task object is untouched. A new object is created with the changes. If `updates` has `{ priority: true }`, only the priority changes; title, description, everything else comes from the original `...t`.

**`removeTask(id)`** (around line 75):
```javascript
export function removeTask(id) {
    tasks = tasks.filter(t => t.id !== id);
}
```

`filter()` creates a new array excluding the task with the matching ID. Again, immutable — the original array is untouched.

## Snapshot and Rollback

This is the optimistic UI machinery. Look at lines 83-93:

```javascript
export function createTasksSnapshot() {
    return JSON.parse(JSON.stringify(tasks));
}

export function restoreTasksFromSnapshot(snapshot) {
    tasks = snapshot;
}
```

`createTasksSnapshot()` does a **deep clone** using the JSON roundtrip trick: serialize to JSON string, then parse back. This creates a completely independent copy. Modifying the original `tasks` array doesn't affect the snapshot, and vice versa.

Why not just `const snapshot = [...tasks]`? Because that's a **shallow copy**. The array is new, but the task objects inside are the same references. If you modify a task object, both the original array and the "copy" would see the change.

The JSON roundtrip creates new objects at every level. It's the quick-and-dirty deep clone. The modern alternative is `structuredClone(tasks)` — faster and handles more edge cases (like Date objects and circular references). But JSON roundtrip is battle-tested and works for plain data objects.

In React, this pattern exists in libraries like Immer (which makes immutable updates easier) or TanStack Query (which caches previous states for rollback).

**`replaceTask(oldId, newTask)`** (around line 110):
```javascript
export function replaceTask(oldId, newTask) {
    tasks = tasks.map(t => t.id === oldId ? newTask : t);
}
```

This is used after an optimistic create. When you create a task, you generate a temporary ID (like `_temp_abc123`) and add the task to state immediately. When the server responds with the real task (which has a server-generated ID), you swap the temp task for the real one. The user never sees the swap.

**`generateTempId()`** (around line 122):
```javascript
export function generateTempId() {
    return '_temp_' + Date.now().toString(36) + Math.random().toString(36).slice(2);
}
```

The `_temp_` prefix makes it obvious this is a temporary ID. `Date.now().toString(36)` converts the timestamp to a base-36 string (shorter). The random suffix prevents collisions if two tasks are created in the same millisecond.

## The Filter State

Look at `activeCategoryFilters` — it's a `Set`, not an array.

```javascript
let activeCategoryFilters = new Set();
```

A Set is like an array but guarantees uniqueness and has O(1) lookup. When checking "is category 3 filtered?", `set.has(3)` is instant. With an array, you'd need `array.includes(3)` which scans the whole array.

Your filter logic adds and removes from this Set: `activeCategoryFilters.add(id)`, `activeCategoryFilters.delete(id)`. Clean and efficient.

## What State.js Does NOT Do

Equally important is what this file avoids:

- **No rendering** — state.js never touches the DOM. It doesn't know about HTML.
- **No API calls** — it doesn't fetch data. Other modules fetch and then call setters.
- **No business logic** — it doesn't validate, calculate, or decide. It stores.
- **No event dispatching** — it doesn't notify anyone when state changes.

That last point is the key difference from framework state management. In React's `useState`, setting state triggers a re-render. In Redux, dispatching an action triggers subscriber callbacks. In your `state.js`, calling `setTasks()` does nothing except change the variable. The calling code is responsible for rendering afterward.

This is simpler but puts more responsibility on the developer. Forget to call `renderAllColumns()` after changing tasks? The UI is stale. Frameworks automate this; your code trusts the developer.

## The Mental Model

Think of `state.js` as a whiteboard in a shared office.

- Anyone can read the whiteboard (import the variables)
- Anyone can update the whiteboard (call the setter functions)
- The whiteboard doesn't call anyone when it's updated — people need to check it
- You can take a photo of the whiteboard (snapshot) and restore it later (rollback)

It's simple, transparent, and predictable. No magic. No subscriptions. No middleware. Just data in, data out.

## Key Takeaway

`state.js` is your centralized store in 200 lines. It provides: read access via exported variables, write access via setter functions, immutable updates via array methods + spread operator, and snapshot/rollback via JSON deep clone. Every framework has a more sophisticated version of this, but the core idea — one place for truth, explicit updates, immutable data — is universal.

Next episode, we're going into `api.js` — how every HTTP call to the server is structured.

---

*Next: S2E05 — "api.js: The HTTP Layer"*
