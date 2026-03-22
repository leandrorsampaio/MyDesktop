# Episode 5: Events: How Things Talk to Each Other

**Duration:** ~9 minutes
**Topics:** DOM events, CustomEvents, event delegation, bubbling, composed, js- hooks, framework comparisons

---

Hey, welcome back. So we've got components — our LEGO blocks. We've got state — the brain. But there's a problem. How do these pieces actually talk to each other?

When you click a "Restore" button inside an `<archive-row>` component, the archive page needs to know about it. When you select a sort option in `<list-header>`, the page needs to re-sort the data. When you click a config item in `<nav-sidebar>`, the main app needs to open the right modal.

This communication happens through **events**. And understanding events is absolutely essential for modern web development.

## Events: The Basics

An event is just a signal that says "something happened." Click a button? That's a `click` event. Type in an input? That's an `input` event. Press a key? `keydown` event. The browser creates events for dozens of things.

When an event happens, it doesn't just sit there. It **travels** through the page. And the way it travels is important.

Imagine your HTML as a tree. The `<html>` element is the trunk. `<body>` is a branch. Inside body, `<div>` is a smaller branch. Inside that div, a `<button>` is a leaf. When you click that button, the event does something interesting: it **bubbles up**. It starts at the button, then goes to the div, then to the body, then to html, then to the document. Like a bubble rising through water.

Any element along that path can "hear" the event by having an event listener attached. So you could put a click listener on the div, and it would fire every time any button (or anything else) inside that div is clicked.

This is called **event bubbling**, and your project uses it everywhere.

## Event Delegation: The Smart Listener

Here's a pattern that's central to your project: **event delegation**.

Instead of adding a click listener to every single button individually, you add ONE listener to a parent container, and let events bubble up to it. When the event arrives, you check "what was actually clicked?" and respond accordingly.

Your project uses this with `js-` prefixed class names. You'll see classes like `js-actionBtn`, `js-sidebarBtn`, `js-crisisModeBtn`. These aren't for styling — the `js-` prefix signals "this class is a JavaScript hook." In `app.js`, you have event listeners on parent containers that check for these hooks.

Why not just add listeners directly to each button? Two reasons. First, performance — if you have 50 task cards, that's 50 listeners. With delegation, it's just one. Second, dynamic content — when you re-render the board, all those old buttons are destroyed and new ones are created. With direct listeners, you'd need to re-attach them every time. With delegation on a parent that never gets destroyed, it just works.

This is actually one of the things that made jQuery so popular back in the day. jQuery's `.on()` method with event delegation was a game-changer. The concept is the same, you're just doing it with vanilla JavaScript.

## CustomEvents: Your Components' Voice

Here's where it gets really interesting for your project. Built-in events like `click` and `input` cover user interactions, but what about app-specific things? What about "a task was restored" or "the sort order changed" or "promote this task to the backlog"?

For these, you create **CustomEvents**. These are events you invent. You give them a name and attach any data you want.

In your project, `<archive-row>` dispatches a `restore-task` event with the task ID. `<list-header>` dispatches `sort-change` with the field name and direction. `<nav-sidebar>` dispatches `config-action` with the action name. `<ai-staged-row>` dispatches five different events: `ai-edit`, `ai-clone`, `ai-promote-backlog`, `ai-promote-board`, `ai-delete`.

The component doesn't know WHO is listening. It just says "hey, this thing happened" and throws the event into the air. Whoever cares can catch it. This is called **loose coupling** — the components don't depend on each other directly. They communicate through events, like strangers leaving notes on a bulletin board.

Now there's an important detail here. Remember Shadow DOM? That force field we talked about? Events have a property called `composed`. If `composed` is `true`, the event can escape the Shadow DOM boundary and bubble up to the parent. If it's `false`, the event stays trapped inside the shadow.

Your project always sets both `bubbles: true` and `composed: true` on CustomEvents. This is essential because your components use Shadow DOM. Without `composed: true`, a `restore-task` event from inside `<archive-row>`'s shadow DOM would never reach the page-level listener.

## How Frameworks Handle Communication

Every framework has to solve this same problem: how do parent and child components talk to each other? The approaches are surprisingly different.

**React** uses **props and callbacks**. A parent passes data DOWN to a child through props (like HTML attributes but more powerful). If the child needs to send something UP to the parent, the parent passes a function as a prop, and the child calls it.

Imagine a parent component that renders a button component. The parent says: "Here's your label ('Save'), and here's a function to call when you're clicked." The button doesn't dispatch an event. It calls the function directly. It's like the difference between shouting into a room (events) and calling someone on the phone (callbacks). Both work, but they feel different.

For communication between components that aren't parent-child, React uses Context (a way to share data across the tree) or external state management libraries.

**Angular** uses a mix. Data goes DOWN via `@Input` properties. Data goes UP via `@Output` EventEmitters — which are essentially the same concept as your CustomEvents. Angular is actually the closest to your approach in this regard.

**Svelte** is similar to React: props go down, events or callbacks go up. Svelte has a nice `dispatch` function that works almost exactly like your CustomEvents.

**LWC** — and this is great news for you — uses **exactly the same event system** as your project. LWC components dispatch CustomEvents with `bubbles` and `composed`. Parent LWC components listen using `addEventListener` or declaratively with `on` prefixed attributes in the template. The concepts are identical.

In LWC, you'd write `this.dispatchEvent(new CustomEvent('restore', { detail: { taskId } }))` — which is character-for-character the same code as your vanilla components. The parent would listen with `<c-archive-row onrestore={handleRestore}>`. Same mechanism, slightly different syntax.

This is one of the biggest advantages of learning vanilla Web Components first. LWC's event system isn't an abstraction — it IS the web platform's event system. You're already fluent in it.

## The `js-` Convention

Let me come back to your `js-` prefix convention because it's a smart practice worth understanding.

In your project, you have two types of class names on elements:

1. **Styling classes** — follow BEM naming: `.taskCard__title`, `.toolbar__btn`, `.appHeader__sidebarBtn`
2. **JavaScript hooks** — prefixed with `js-`: `.js-toaster`, `.js-taskModal`, `.js-sidebarBtn`

Some elements have both. The header button might be `.appHeader__sidebarBtn.js-sidebarBtn`. The styling class handles how it looks. The hook class handles how JavaScript finds it.

Why separate them? Because CSS and JavaScript have different concerns. If a designer renames a CSS class during a redesign, they shouldn't accidentally break JavaScript behavior. And if a developer changes which element JavaScript targets, they shouldn't accidentally break the styling.

This convention isn't universal — React and other frameworks don't need it because they have other ways to reference elements (refs, component instances). But in vanilla JavaScript, especially with event delegation, it's a clean pattern.

## Events and Async: A Word of Caution

One thing to be aware of: events are **synchronous**. When you dispatch an event, all the listeners run right then and there, before the next line of code. This is usually fine, but it can surprise you.

Your `<nav-sidebar>` is careful about this. It calls `this.close()` BEFORE dispatching the `config-action` event. Why? Because closing the sidebar triggers an animation and state change. If it dispatched the event first, the listener might open a modal while the sidebar is still visible, creating a visual glitch. Order matters.

In frameworks, this is less of a concern because the framework's rendering cycle handles the timing for you. React batches state updates, so multiple changes are applied together. But in vanilla code, you're in charge of the ordering.

## Wrapping Up

Events are the nervous system of your application. They let components communicate without being tightly coupled. Your project uses three layers:

1. **Built-in events** (click, input, keydown) — for user interactions
2. **CustomEvents** (restore-task, sort-change, config-action) — for app-specific communication
3. **Event delegation** — for efficient handling with `js-` hooks

The pattern of "component dispatches event, parent catches it" is universal across all frameworks. In React it's callbacks passed as props. In Angular, LWC, and your vanilla code, it's actual events. Same concept, different syntax.

Next time, we're covering routing — how your app shows different pages without actually loading different pages. That `router.js` file and the magic of SPAs.

Catch you there.

---

*Next episode: "Routing: One Page, Many Views" — SPA routing, your router.js, the base tag trick, and framework comparisons.*
