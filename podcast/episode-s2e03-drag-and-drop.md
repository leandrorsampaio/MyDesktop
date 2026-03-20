# S2 Episode 3: Drag and Drop — kanban-column.js

**Duration:** ~9 minutes
**Files to open:** `public/components/kanban-column/kanban-column.js`, `public/app.js` (lines 345-419, 515-575)
**Style:** Code walkthrough

---

Welcome back. Today we're exploring one of the most satisfying features in your app — dragging a task card from one column to another. It looks smooth and simple, but there's a lot going on under the hood. Two files cooperate to make it work: `kanban-column.js` handles the visual feedback (drop zones, indicators), and `app.js` handles the data (state update, API call, rollback).

## The HTML5 Drag and Drop API

Before we look at the code, let me explain how browser drag and drop works.

The browser has a built-in Drag and Drop API. You mark an element as `draggable="true"`, and the browser lets the user click and drag it. During the drag, the browser fires a series of events:

- **`dragstart`** — on the dragged element, when the drag begins
- **`dragover`** — on elements the mouse passes over (fires repeatedly)
- **`dragenter`** — when the dragged thing enters a new element
- **`dragleave`** — when it leaves an element
- **`drop`** — when the user releases the mouse button over a valid drop target
- **`dragend`** — on the original dragged element, when the drag is complete

The key thing: you must call `event.preventDefault()` in `dragover` to allow dropping. By default, the browser doesn't allow drops. It's an opt-in system.

## How Cards Become Draggable

Open `app.js` and go to `createTaskCard()` around line 515.

Look at lines 555-570 (approximately). After creating the `<task-card>` element, the code sets `card.setAttribute('draggable', 'true')` and adds two event listeners:

**`dragstart`** — when you start dragging a card:
```javascript
card.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', task.id);
    card.classList.add('--dragging');
});
```

It stores the task ID in the `dataTransfer` object (the browser's drag payload carrier) and adds a visual class.

**`dragend`** — when the drag finishes (drop or cancel):
```javascript
card.addEventListener('dragend', () => {
    card.classList.remove('--dragging');
    // Remove drop indicators from all columns
});
```

It cleans up the visual state. Notice: `dragend` fires on the ORIGINAL element, not on the drop target. This is where you clean up the source.

## Inside kanban-column.js: The Drop Target

Now open `kanban-column.js`. This component is the drop target — where cards land.

**Lines 5-11: Constructor**

```javascript
constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._ready = new Promise(resolve => {
        this._resolveReady = resolve;
    });
}
```

There's something interesting here: `_ready` is a Promise that resolves later. This is a pattern for coordinating async initialization. The `renderTasks()` method (called by `app.js`) awaits `this._ready` to make sure the Shadow DOM is fully set up before trying to insert cards. Without this, cards could be inserted before the template is loaded, and they'd go nowhere.

**Lines 13-38: `connectedCallback()`**

Template loading follows the same pattern as task-card: check cache, fetch, inject into shadow root.

Then, around line 36, the drag event listeners are set up on the container inside the shadow root — the element that holds the task cards.

**The Drag Event Listeners**

The container listens for `dragover`, `dragenter`, `dragleave`, and `drop`.

**`dragover`** handler (fires constantly while something is dragged over):

```javascript
container.addEventListener('dragover', (e) => {
    e.preventDefault();  // REQUIRED — allows dropping
    this._showDropIndicator(e.clientY);
});
```

The `preventDefault()` is critical. Without it, the browser won't fire the `drop` event. This is one of the most common gotchas in drag and drop. Many developers spend hours debugging "drop doesn't fire" — it's almost always because they forgot `preventDefault()` in `dragover`.

`_showDropIndicator()` shows a visual line where the card will be inserted. We'll look at it next.

**`drop`** handler:

```javascript
container.addEventListener('drop', (e) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('text/plain');
    const newPosition = this._getDropPosition(e.clientY);
    const newStatus = this.getAttribute('data-status');

    this.dispatchEvent(new CustomEvent('task-dropped', {
        bubbles: true,
        composed: true,
        detail: { taskId, newStatus, newPosition }
    }));

    this.removeDropIndicator();
});
```

It reads the task ID from the drag payload, calculates WHERE in the column the card was dropped (position), gets the column ID from its own `data-status` attribute, and dispatches a `task-dropped` event.

The component doesn't move the card itself. It just says "hey, task X was dropped in column Y at position Z." The parent (`app.js`) handles the actual move. This is good separation — the column component handles visual feedback, the parent handles data logic.

## _getDropPosition(): Where Exactly Did They Drop?

This is a clever function. Go to `_getDropPosition()` around line 67.

```javascript
_getDropPosition(mouseY) {
    const cards = Array.from(
        this.shadowRoot.querySelectorAll('task-card')
    );

    for (let i = 0; i < cards.length; i++) {
        const rect = cards[i].getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;

        if (mouseY < midpoint) return i;
    }

    return cards.length; // Dropped after the last card
}
```

It loops through all task cards in the column, gets each card's position on screen using `getBoundingClientRect()` (a DOM API that returns the element's coordinates), and finds the card whose midpoint is below the mouse position. The drop position is the index of that card.

If the mouse is above the midpoint of card 3, the drop position is 3 (insert before card 3). If the mouse is below all cards, the position is `cards.length` (insert at the end).

This is a linear scan — O(n) where n is the number of cards in the column. For a column with maybe 10-20 cards, this is instant. For a list with thousands of items, you'd want a binary search.

## _showDropIndicator(): Visual Feedback

Go to `_showDropIndicator()` around line 87.

This function creates a thin horizontal line that shows where the card will land. It uses the same position calculation as `_getDropPosition()` but instead of returning the index, it positions a visual indicator element.

Look at the efficiency consideration: the function checks if the indicator is already in the right position before moving it. Since `dragover` fires many times per second (every 50ms or so), without this check, you'd be doing unnecessary DOM manipulation on every event.

This is a pattern called **memoization** (or caching the last result). "Is the indicator already where it should be? Yes? Do nothing." It's a small optimization that prevents visual flickering and unnecessary reflows.

## Back in app.js: moveTask()

Now switch to `app.js`, line 345. This is where the `task-dropped` event is handled.

The kanban container listens for this event:

```javascript
elements.kanban.addEventListener('task-dropped', (e) => {
    const { taskId, newStatus, newPosition } = e.detail;
    moveTask(taskId, newStatus, newPosition);
});
```

Event delegation again — one listener on the parent catches events from all columns.

The `moveTask()` function (lines 345-419) follows the optimistic pattern:

1. **Lock check**: `if (isMoving) return;` — prevents overlapping moves
2. **Lock acquire**: `isMoving = true;`
3. **Snapshot**: `createTasksSnapshot()` — save current state
4. **Optimistic update**: update task status and position in state, re-render
5. **API call**: `moveTaskApi(id, newStatus, newPosition)`
6. **On success**: update with server response (server may adjust positions)
7. **On failure**: `restoreTasksFromSnapshot(snapshot)`, re-render, toast error
8. **Lock release**: `isMoving = false` in `finally` block

The server side (in `server.js`) does more than just save. It **recalculates positions** for all tasks in both the source and destination columns. If you move a card from position 2 in column A to position 0 in column B, the server renumbers positions in both columns to keep them sequential (0, 1, 2, 3...).

## The Full Drag Flow

Let me trace the complete journey of a drag operation:

1. User mousedowns on a task card → `dragstart` fires → task ID stored in dataTransfer
2. User moves mouse over a column → `dragover` fires repeatedly → drop indicator shows
3. User releases mouse → `drop` fires → column dispatches `task-dropped` event
4. Event bubbles up through Shadow DOM (because `composed: true`)
5. `app.js` catches the event on `.kanban`
6. `moveTask()` is called
7. State is snapshot'd, then updated optimistically
8. Board re-renders (card appears in new column instantly)
9. API call sent to server
10. Server updates JSON file, recalculates positions
11. `dragend` fires → visual cleanup (remove dragging class)
12. If API failed: state rolls back, board re-renders (card goes back)

All of this happens in under 100 milliseconds for the visual part (steps 1-8). The API call (step 9-10) might take 50ms more, but the user doesn't notice because the move already happened visually.

## Comparing to Frameworks

In React, you'd typically use a library like `@hello-pangea/dnd` (formerly react-beautiful-dnd) or `dnd-kit`. These libraries handle the visual feedback, position calculation, and accessibility automatically. You just define what happens when an item is dropped.

In LWC, drag and drop isn't built into the framework. You'd use the same HTML5 API you're using, or a third-party library. The Salesforce ecosystem has the `lightning-datatable` component with built-in reordering, but for a kanban board, you'd build it yourself — very similar to what you've done.

Your implementation is actually a great foundation for understanding how drag-and-drop libraries work internally. They all do some version of: listen for drag events, calculate position from mouse coordinates, show drop indicators, fire a custom event with the result.

## Key Takeaway

Drag and drop is a dance between two players: the draggable item (task-card) and the drop target (kanban-column). The browser provides the choreography (drag events), the column provides the stage (drop indicators, position calculation), and app.js provides the orchestra (state management, API calls, rollback). Each piece has a clear role, and they communicate through events.

Next episode, we're going into `state.js` — the smallest but arguably most important file in the project.

---

*Next: S2E04 — "state.js: 200 Lines That Run Everything"*
