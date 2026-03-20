# Episode 4: State: The Brain of Your App

**Duration:** ~9 minutes
**Topics:** What state is, centralized state, optimistic UI, reactive updates, framework comparisons

---

Hey, welcome back. So we've talked about the big picture, the server, and components. Today we're getting into something that trips up a lot of developers, even experienced ones: **state**.

If components are the body of your app, state is the brain. It's the data that determines what the user sees and what they can do at any given moment. And managing it well is probably the hardest part of building any interactive application.

## What Is State?

State is just... data. But specifically, it's the data that can change over time and that your UI depends on.

Think about your task tracker. At any moment, there's a bunch of information floating around: the list of tasks, which column each task is in, the user's profile, which filters are active, whether a modal is open, whether crisis mode is on. All of that is state.

Some state comes from the server — your tasks, epics, categories. That data lives in JSON files and gets loaded when the page starts. Some state is purely client-side — which modal is open, which filters are active, whether the sidebar is showing. That data only exists in the browser's memory and disappears when you refresh.

Here's the key insight: **when state changes, the UI needs to update**. If a task moves from "To Do" to "In Progress," the screen needs to reflect that. If a filter is activated, cards need to hide or show. The challenge is making sure the UI always matches the current state. When they get out of sync, you have bugs.

## Your Approach: Centralized State

Your project has a file called `state.js`. This is the single source of truth for your application's data. All the tasks, columns, epics, categories — they live in one place.

The idea is simple: instead of each component keeping its own copy of the data, everyone reads from one shared store. When something changes, you update the store, then re-render.

Your state module provides functions like `setTasks()`, `getTasks()`, `setColumns()`, `getColumns()`. Any part of the app that needs to know the current tasks just calls `getTasks()`. Any part that changes the tasks calls `setTasks()` with the new data.

This centralized approach avoids a classic problem: data getting out of sync. If the kanban board had its own copy of tasks, and the sidebar had its own copy, and the archive page had its own copy, you'd have to update all three every time something changed. Forget one? Bug. With one centralized store, there's only one place to update.

## Optimistic UI: Lie First, Fix Later

Now here's one of the coolest patterns in your project: **optimistic UI**. The name might sound fancy, but the idea is beautifully simple.

When you drag a task to a new column, what should happen? The straightforward approach would be:

1. Send the change to the server.
2. Wait for the server to respond.
3. If successful, update the screen.

But that feels slow. You drag a card and it just... sits there for a second while the server processes. Not good.

The optimistic approach flips it:

1. Update the screen immediately — the card moves right away.
2. Send the change to the server in the background.
3. If the server says "actually, that failed," undo the visual change.

You're **optimistic** that the server will succeed, so you show the result before you know for sure. And honestly? The server succeeds 99% of the time. That 1% failure case, you handle with a rollback.

Your `state.js` has helpers for this: `createTasksSnapshot()` saves a copy of the current state before you change anything. If the API call fails, `restoreTasksFromSnapshot()` puts everything back. Then you re-render, and it's like nothing happened — except the user sees a toast notification saying something went wrong.

This pattern is everywhere in modern apps. Every time you "like" a post on social media and the heart fills in instantly? Optimistic UI. They didn't actually wait for the server. They assumed it would work.

**In React**, this pattern is common, and there are libraries like TanStack Query (formerly React Query) that have optimistic updates built in. React's newest features even have something called `useOptimistic` specifically for this.

**In LWC/Salesforce**, the concept exists but it's less common because Salesforce has its own caching layer (the Lightning Data Service) that manages server synchronization for you. But if you're making custom API calls, you'd implement the same pattern.

## Reactive State: The Framework Magic

OK, here's where frameworks really shine and where your vanilla approach has a limitation. Let's be honest about it.

In your project, when state changes, you have to manually call `renderAllColumns()` or whatever render function is appropriate. You change the data, then you explicitly tell the UI to update. If you forget to call the render function, the screen shows stale data.

Frameworks automate this. They make state **reactive** — when the data changes, the UI updates automatically.

**React** has `useState`. You call it like this: `const [count, setCount] = useState(0)`. The `setCount` function does two things: it updates the value AND tells React "hey, something changed, re-render this component." You never have to manually trigger a render. Just change the data, and React handles the rest.

React also has `useReducer` for more complex state, and `useContext` for sharing state across many components. And for large apps, people use external libraries like Redux or Zustand — which are basically centralized stores, similar to your `state.js`, but with the reactivity built in.

**Svelte** takes reactivity even further. In Svelte, you just write `let count = 0` and then `count = 5`. That's it. Svelte's compiler detects the assignment and automatically updates the UI. No special function needed. It feels like magic — you just change a variable, and the screen updates.

**Angular** has something called Signals now (as of Angular 16+). Before that, it used a system called Change Detection that would check everything periodically. Signals are more targeted — like React's useState, they explicitly track what changed.

**LWC** uses **reactive properties**. You mark a property with `@track` (or just use a public `@api` property), and when it changes, LWC automatically re-renders the component. It's similar to React's `useState` but uses decorators — those `@` symbols before property names. Here's the thing: LWC's reactivity only triggers on reassignment for objects and arrays. If you push an item to an array, LWC won't notice. You need to create a new array: `this.items = [...this.items, newItem]`. That's a common gotcha.

So in your project, the flow is: change state → manually call render. In frameworks, it's: change state → UI updates automatically. That automatic part is what makes frameworks feel magical. But understanding the manual version first means you'll never be confused about what's happening under the hood.

## The Render Cycle

Let's talk about how your UI actually updates. In your project, `renderAllColumns()` is the big one. When called, it:

1. Gets the current tasks from state.
2. Gets the current columns from state.
3. Builds a lookup Map for epics (remember episode... well, we'll cover that in the data structures episode).
4. For each column, it creates or updates `<kanban-column>` elements and passes them the relevant tasks.

This is a full re-render. Every time something changes — a task is created, moved, deleted, a filter is applied — the whole board gets rebuilt.

In frameworks, this would be considered wasteful. React, for example, uses a **virtual DOM** — an in-memory representation of the UI. When state changes, React builds a new virtual DOM, compares it with the old one (this is called "diffing"), and only updates the parts that actually changed. If one task moved, React would only touch that one card, not rebuild every column.

Svelte doesn't even use a virtual DOM. Because it knows at compile time which state each piece of UI depends on, it generates code that directly updates only the affected elements. Even more efficient.

For your project, the full re-render approach works fine. You have maybe 20-50 task cards. Rebuilding them all takes milliseconds. But for an app with thousands of items? That's where frameworks' smart updating really pays off.

## State That Doesn't Come From the Server

Not all state lives in `state.js`. Your project has several types of client-only state:

**Modal state** — whether a modal is open, which task is being edited. This lives in module-level variables in `modals.js`, like `let pendingDelete = null`.

**Filter state** — which category filter is active, whether priority filter is on, which epic is selected. This lives in `filters.js`.

**localStorage state** — checklist configuration, which widgets are visible, snooze preferences. This persists across page reloads but never goes to the server.

**CSS state** — crisis mode and snoozed task visibility are controlled by CSS classes on the `body` element. `body.--crisisMode`, `body.--snoozeTransparent`. The CSS rules handle the visual changes. No JavaScript needed to update individual components.

This last one is clever, by the way. Using CSS classes on a parent element to control child appearance is a pattern as old as CSS itself, but it's still effective. It avoids JavaScript having to loop through every task card to show or hide it.

## Key Takeaway

State is the data that drives your UI. Managing it well means having a clear source of truth, updating it predictably, and keeping the UI in sync. Your project does this with a centralized store and manual renders. Frameworks add reactivity — automatic UI updates when state changes. Both approaches solve the same problem; frameworks just automate the tedious part.

The optimistic UI pattern in your project is genuinely advanced. A lot of professional apps don't even bother with it. The fact that you have snapshot-and-rollback built in puts your app on the level of well-crafted production software.

Next episode, we're talking about how components communicate with each other. Events, callbacks, and the art of making LEGO blocks work together.

See you next time.

---

*Next episode: "Events: How Things Talk to Each Other" — DOM events, CustomEvents, event delegation, and the js- hooks pattern.*
