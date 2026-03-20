# Episode 10: Data Structures and Patterns

**Duration:** ~9 minutes
**Topics:** Maps vs arrays, module architecture, race condition locks, debouncing, snapshot/rollback, Big O notation

---

Hey, welcome back. We've covered a lot of high-level concepts. Today we're getting into the programming fundamentals that make your code actually work well — data structures and patterns. These are the tools in your mental toolbox, and they matter regardless of what framework you use.

## Maps: Your Secret Weapon

Let's start with something that comes up a lot in your project: the **Map**.

You know arrays. An array is a list: task 1, task 2, task 3. If you want to find task with id "abc123," you have to check each item one by one. "Is this the one? No. This one? No. This one? Yes!" That's called a **linear search**, and in Big O notation (don't worry, I'll explain), it's O(n) — the time it takes grows proportionally with the number of items.

A Map is like a dictionary or a phone book. You look up a name, you go directly to the right page. No scanning. You give it a key, it returns the value. That's O(1) — it takes the same amount of time no matter how many items there are.

Let me give you a concrete example from your project. When rendering the board, each task has an `epicId`. You need to look up the epic's name and color. If you have 50 tasks and 10 epics, doing `epics.find(e => e.id === task.epicId)` for each task means scanning the epics array up to 50 times. That's 50 times 10 comparisons = 500 operations in the worst case.

Instead, your project builds a Map first: `new Map(epics.map(e => [e.id, e]))`. This takes 10 steps. Then for each task, `epicMap.get(task.epicId)` is instant. 10 + 50 = 60 operations. That's 8 times faster, and the difference grows with more data.

Your project spec actually has this as a rule: "Use Map lookups for repeated `.find()` in loops." It seems like a small thing, but these optimizations are what separates professional code from beginner code.

## Big O: How to Think About Performance

I just threw "O(n)" and "O(1)" at you. Let me explain.

Big O notation is how programmers describe how fast (or slow) an algorithm is as the input grows. It's not about exact milliseconds — it's about the **pattern**.

**O(1)** — constant time. No matter how much data you have, it takes the same time. Map lookups, array access by index.

**O(n)** — linear time. Time grows proportionally with the data. Scanning through an array to find something. If you double the data, you double the time.

**O(n²)** — quadratic time. Time grows with the square of the data. This happens when you have a loop inside a loop — like scanning an array for each item in another array. If you have 100 items, that's 10,000 operations. 1000 items? A million.

Your `find()` in a loop is technically O(n × m) where n is tasks and m is epics. The Map optimization reduces it to O(n + m). For small numbers it doesn't matter. For larger datasets, it's the difference between smooth and sluggish.

You don't need to memorize this. Just remember the principle: if you're looking something up repeatedly inside a loop, build a Map first.

## Module Architecture: Everything in Its Place

Your project has a really clean module structure. Each file has one job:

- `constants.js` — shared values that don't change
- `state.js` — the data store and its helpers
- `api.js` — HTTP calls, nothing else
- `utils.js` — pure utility functions
- `filters.js` — filter logic
- `modals.js` — modal dialog logic
- `router.js` — URL parsing
- `app.js` — wires everything together

This is the **Single Responsibility Principle** — each module has one reason to change. If the API format changes, you only change `api.js`. If you add a new filter, you only change `filters.js`.

When people talk about "clean architecture," this is a lot of what they mean. Not clever code, but well-organized code. Code where you can predict which file a feature belongs in. Code where a new developer can navigate the project without a guided tour.

In frameworks, this same principle applies. In React, you'd separate your components, hooks, services, and utilities into different folders. In Angular, it's even more structured — modules, services, components, guards, pipes, each in their designated place. LWC projects organize by component, with shared logic in utility modules.

## The Lock Pattern: Preventing Race Conditions

Here's a pattern you might not have seen before 2010 because it wasn't common in the old web. Your project has a variable called `isMoving` that acts as a **lock**.

A race condition happens when two asynchronous operations interfere with each other. Imagine this: you drag a task from column A to column B. The code starts moving it — updating state, sending the API call. But before the API responds, you drag the same task again. Now you have two move operations happening simultaneously, and they might conflict.

The lock prevents this. Before starting a move, the code checks: "Is `isMoving` true? If yes, do nothing — another move is in progress." If no, it sets `isMoving = true`, does the work, and sets it back to `false` when done.

The critical detail: the lock is released in a `finally` block. In JavaScript, `try/catch/finally` guarantees that the `finally` block runs no matter what — whether the operation succeeds or fails. This prevents the lock from getting stuck if something throws an error.

This pattern appears everywhere in concurrent programming. Databases use locks. Operating systems use locks. Multithreaded applications use locks. Your use case is simpler — JavaScript is single-threaded, so you're really just preventing overlapping async operations — but the concept is the same.

In React, you'd solve this with a `useRef` to hold the lock state (not `useState`, because setting state triggers a re-render, which you don't want for a lock). In LWC, you'd use a regular class property.

## Debouncing: Don't React to Everything

Your notes widget auto-saves when you type. But you don't want to save on every single keystroke — that would be dozens of API calls per second. Instead, you use **debouncing**.

Debouncing means: "Wait until the user stops doing something, then act." Specifically, every time the user types, you start a timer (say, 500 milliseconds). If they type again before the timer expires, reset the timer. The save only happens when the user pauses for 500ms.

Picture it like an elevator. The doors start closing. Someone sticks their hand in. The doors reset and start closing again. They only actually close when nobody has interrupted for a while.

In your project, the notes auto-save uses a 500ms debounce. Type type type... pause... save. Efficient and reliable.

There's a related concept called **throttling**, which is different. Throttling means: "Do this at most once every X milliseconds." Where debouncing waits for a pause, throttling fires regularly during activity. Scroll events often use throttling — you want to react to scrolling, but not on every single pixel, maybe once every 100ms.

These patterns exist in every framework. React has `useDeferredValue` and libraries like `lodash.debounce`. LWC doesn't have it built in, but you'd implement it the same way — a `setTimeout` that gets cleared and reset.

## Snapshot and Rollback: Time Travel for Your Data

We touched on this in the state episode, but let's go deeper. Your `state.js` has `createTasksSnapshot()` and `restoreTasksFromSnapshot()`. This is the **memento pattern** — saving a copy of the state so you can restore it later.

Think of it like saving a game. Before a boss fight (the API call), you save. If you die (the call fails), you load the save. The world returns to exactly how it was.

The implementation is simple: `createTasksSnapshot()` makes a deep copy of the tasks array. Not a reference to the same array — a completely new copy. If you only copied the reference, modifying the "snapshot" would also modify the original, which defeats the purpose.

Deep copying is a concept worth understanding. In JavaScript, objects and arrays are passed by reference. If you say `const copy = originalArray`, both variables point to the same data. Changing `copy` changes `original` too. To create an independent copy, you need to explicitly clone it — using `JSON.parse(JSON.stringify(data))` (the classic approach) or `structuredClone(data)` (the modern approach).

This snapshot/rollback pattern is used in databases (transactions), text editors (undo), and many other contexts. It's a general-purpose solution for "I need to try something risky and be able to undo it."

## Pure Functions: Predictable Code

Your `utils.js` contains **pure functions** — functions that always give the same output for the same input and don't change anything outside themselves.

`escapeHtml(text)` takes a string, returns a safe string. Always the same result for the same input. It doesn't modify any external state. It doesn't make API calls. It's predictable, testable, and reliable.

Your `api.js` functions are also pure in the sense that they don't modify local state — they just communicate with the server. The state changes happen in the calling code, not in the API layer.

Pure functions are a concept from **functional programming**, and they're increasingly valued in all frameworks. React hooks encourage pure component renders. Svelte's compiled approach assumes components are pure. The idea is: side effects (things that change the world — API calls, DOM updates, state mutations) should be explicit and controlled, not scattered randomly through your code.

## The Module Pattern: Private by Default

One more pattern worth noting. In your project, each JavaScript file is an ES module. Variables declared in a module are private by default — they're only accessible inside that file unless you export them.

Your `isMoving` lock in `app.js` is a module-level variable. No other file can see it. No other file can accidentally set it. It's encapsulated by the module system itself.

Before ES modules, achieving privacy required tricks — Immediately Invoked Function Expressions (IIFEs), the revealing module pattern, or just hoping nobody touched your globals. Now the language handles it natively.

## The Takeaway

These patterns — Maps for lookups, locks for concurrency, debouncing for efficiency, snapshots for safety, pure functions for predictability — are language-agnostic. They work in JavaScript, Python, Java, everywhere. They work in React, Angular, Svelte, LWC.

Your project is a great playground for these patterns because nothing is hidden behind a framework's abstraction. You see the Map being built. You see the lock being set and released. You see the snapshot being created and restored. When you move to a framework, these same patterns appear, just sometimes wrapped in a prettier API.

Next episode, we're tackling the elephant we've been dancing around: the build step. What are bundlers, transpilers, and why did you successfully avoid them?

See you there.

---

*Next episode: "The Build Step You Skipped" — Bundlers, transpilers, TypeScript, npm, and why your project works without them.*
