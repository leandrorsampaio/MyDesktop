# S2 Episode 12: The AI Integration — ai-page.js and Server-Side AI

**Duration:** ~10 minutes
**Files to open:** `public/js/ai-page.js`, `server.js` (search for "ai/chat"), `public/js/modals.js` (AI config section)
**Style:** Code walkthrough

---

Welcome back to the final episode of Season 2. We saved the most complex feature for last: the AI assistant. This is where your backend really earns its keep — calling external AI APIs, handling different provider formats, tool use, and structured output. Let's dive in.

## The Architecture

The AI feature has several layers:

1. **ai-page.js** — the frontend chat UI and staged tasks list
2. **ai-staged-row.js** — row component for each staged task
3. **server.js AI routes** — chat endpoint, config management, staged task CRUD
4. **AI provider abstraction** — supporting Anthropic, OpenAI, Groq, Google, and custom providers
5. **modals.js AI config** — the configuration modal for setting up providers

The flow: user types a message → frontend sends conversation history to server → server calls the AI provider → AI responds with narrative text AND proposed tasks (via tool use) → server saves staged tasks → frontend displays both.

## ai-page.js: The Frontend

Open `public/js/ai-page.js`.

**Module-level state (around line 34):**

```javascript
let conversationHistory = [];
let stagedTasks = [];
```

Conversation history is purely in-memory. Refresh the page, it's gone. This is a deliberate design choice — the AI chat is ephemeral. The staged tasks, however, are persisted to `ai-staged-tasks.json` on the server.

**`initAiPage()` (around line 51):**

The layout is a split view — chat on top (55%), staged tasks on bottom (45%):

```javascript
pageViewEl.innerHTML = `
    <div class="aiPage">
        <div class="aiPage__chat">
            <div class="aiPage__messages js-aiMessages"></div>
            <form class="aiPage__input js-aiForm">
                <textarea class="js-aiInput" placeholder="Ask the AI to help plan tasks..."></textarea>
                <custom-button type="submit">Send</custom-button>
            </form>
        </div>
        <div class="aiPage__staged">
            <list-header class="js-listHeader"></list-header>
            <div class="aiPage__stagedList js-stagedList"></div>
        </div>
    </div>
`;
```

**The chat submit handler:**

```javascript
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const message = input.value.trim();
    if (!message) return;

    // Add user message to history
    conversationHistory.push({ role: 'user', content: message });

    // Show user message in UI
    appendMessage('user', message);
    input.value = '';

    // Show loading indicator
    appendMessage('assistant', '...');

    try {
        const result = await sendAiChatApi(conversationHistory);

        // Remove loading indicator
        removeLastMessage();

        // Show AI narrative
        if (result.narrative) {
            conversationHistory.push({ role: 'assistant', content: result.narrative });
            appendMessage('assistant', result.narrative);
        }

        // Add new staged tasks
        if (result.tasks && result.tasks.length > 0) {
            stagedTasks = [...stagedTasks, ...result.tasks];
            renderStagedRows();
        }
    } catch (error) {
        removeLastMessage();
        appendMessage('error', error.message);
    }
});
```

Notice the full conversation history is sent with every request: `sendAiChatApi(conversationHistory)`. The server is stateless — it doesn't remember previous messages. The client maintains context.

This is identical to how the ChatGPT API works. Every request includes the full message array. The model processes the entire conversation each time.

**The five action handlers:**

Each `<ai-staged-row>` can dispatch five events. The page module handles all of them:

```javascript
// Edit — reuses the task modal with custom save handler
pageViewEl.addEventListener('ai-edit', (e) => {
    const task = stagedTasks.find(t => t.id === e.detail.taskId);
    openEditStagedTaskModal(task, elements, {
        onSave: async (updated) => {
            await updateStagedTaskApi(task.id, updated);
            // ... re-render
        }
    });
});

// Clone — opens task modal, saves as a REAL task (not staged)
pageViewEl.addEventListener('ai-clone', (e) => {
    const task = stagedTasks.find(t => t.id === e.detail.taskId);
    openCloneStagedTaskModal(task, elements, {
        onSave: () => { /* real task created */ }
    });
});

// Promote to backlog
pageViewEl.addEventListener('ai-promote-backlog', async (e) => {
    await promoteToBacklogApi(e.detail.taskId);
    stagedTasks = stagedTasks.filter(t => t.id !== e.detail.taskId);
    renderStagedRows();
    elements.toaster.success('Task promoted to backlog');
});

// Promote to board
pageViewEl.addEventListener('ai-promote-board', async (e) => {
    await promoteToBoardApi(e.detail.taskId);
    stagedTasks = stagedTasks.filter(t => t.id !== e.detail.taskId);
    renderStagedRows();
    elements.toaster.success('Task promoted to board');
});

// Delete
pageViewEl.addEventListener('ai-delete', async (e) => {
    await deleteStagedTaskApi(e.detail.taskId);
    stagedTasks = stagedTasks.filter(t => t.id !== e.detail.taskId);
    renderStagedRows();
});
```

The promote endpoints are interesting — they create a real task from the staged data, delete the staged entry, and add a log entry "Added from AI Staging." The server handles the transformation.

## Server-Side AI: The Chat Endpoint

Open `server.js` and search for the AI chat route (`/ai/chat`).

**The system prompt builder (`buildAiSystemPrompt()`):**

This function creates a dynamic system prompt that includes the profile's current epics and categories:

```javascript
function buildAiSystemPrompt(epics, categories) {
    return `You are a task planning assistant. The user will describe work they need to do.
Your job is to propose tasks.

Available epics: ${epics.map(e => `${e.name} (id: ${e.id})`).join(', ')}
Available categories: ${categories.map(c => `${c.name} (id: ${c.id})`).join(', ')}

Always use the propose_tasks tool to return structured tasks.
Only propose tasks. Never delete, move, or modify existing tasks.`;
}
```

By injecting the real epic and category IDs into the prompt, the AI can return valid IDs that the server can validate. Without this, the AI would guess IDs or make them up.

**Tool use / Function calling:**

The chat endpoint uses AI **tool use** — a mechanism where you tell the AI model "you have this tool available, use it to structure your response."

For Anthropic format:
```javascript
const tools = [{
    name: 'propose_tasks',
    description: 'Propose tasks for the user to review',
    input_schema: {
        type: 'object',
        properties: {
            narrative: { type: 'string', description: 'Your response to the user' },
            tasks: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        title: { type: 'string' },
                        description: { type: 'string' },
                        priority: { type: 'boolean' },
                        category: { type: 'integer' },
                        epicId: { type: 'string' }
                    }
                }
            }
        }
    }
}];
```

The AI model receives this tool definition and, instead of just returning text, it calls the tool with structured data. The server extracts the narrative and tasks from the tool call response.

**Provider abstraction:**

The server supports two API formats:

1. **Anthropic format** — direct call to `api.anthropic.com`. Tool use is native.
2. **OpenAI-compatible format** — covers OpenAI, Groq, Google AI Studio, LM Studio, Ollama, and any other provider with an OpenAI-compatible API.

For OpenAI-compatible providers, the tool definition is transformed:

```javascript
// Anthropic format → OpenAI function-calling format
const functions = tools.map(t => ({
    type: 'function',
    function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema
    }
}));
```

The concept is the same — structured output via tools/functions — but the JSON format differs between providers. The server handles the translation.

**Fallback for models that ignore tools:**

Some models (especially local ones via LM Studio or Ollama) might not support tool use properly. They return plain text instead of a tool call. The server has a fallback:

```javascript
function extractTasksFromText(text) {
    // Try to find JSON in the response text
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
        try {
            return JSON.parse(jsonMatch[0]);
        } catch { }
    }
    return [];
}
```

It scans the response text for a JSON array and tries to parse it. Rough but effective. This allows the AI feature to work even with basic local models.

**Task normalization (`normaliseStagedTask()`):**

```javascript
function normaliseStagedTask(raw, validCategoryIds, validEpicIds) {
    return {
        id: generateId(),
        title: (raw.title || 'Untitled').slice(0, 200),
        description: (raw.description || '').slice(0, 2000),
        priority: Boolean(raw.priority),
        category: validCategoryIds.includes(raw.category) ? raw.category : 1,
        epicId: validEpicIds.includes(raw.epicId) ? raw.epicId : null,
        deadline: raw.deadline || null
    };
}
```

Never trust AI output. This function validates every field: title is truncated to 200 chars, invalid category IDs fall back to 1 (Non categorized), invalid epic IDs become null. The AI might hallucinate category IDs that don't exist — the server catches this.

This is defense in depth: the system prompt tells the AI which IDs are valid, AND the server validates the output. Belt and suspenders.

## The AI Config Modal

Open `modals.js` and search for `openAiConfigModal` (around line 1630).

This modal lets users configure which AI provider to use:

```javascript
export function openAiConfigModal(elements) {
    // Fetch current config
    // Render two-panel layout: list of configs on left, form on right
    // Handle provider selection, model input, API key input, custom URL
    // Save config to server
}
```

The API key handling is careful — the server never returns the actual key via the GET endpoint. It returns `hasKey: true/false`. When saving, if the API key field is empty, the server keeps the existing key. This prevents accidentally clearing the key.

The `ai-config.json` file is gitignored — it should never appear in version control because it contains secrets.

## The Data Flow

Let me trace a complete AI interaction:

1. User types "I need to set up CI/CD for the project"
2. Frontend adds message to `conversationHistory`
3. `sendAiChatApi(conversationHistory)` sends POST to `/api/work/ai/chat`
4. Server loads AI config (provider, model, API key)
5. Server builds system prompt with current epics and categories
6. Server calls the AI provider's API with messages + tool definition
7. AI responds with a tool call: narrative + 3 proposed tasks
8. Server normalizes the tasks (validates IDs, truncates strings)
9. Server saves tasks to `ai-staged-tasks.json`
10. Server returns `{ narrative, tasks }` to frontend
11. Frontend shows narrative in chat
12. Frontend adds tasks to `stagedTasks` array, renders `<ai-staged-row>` components
13. User reviews tasks, can edit/clone/promote/delete each one
14. Promoting creates a real task in the backlog or board

The staged tasks are a **review buffer**. The AI proposes, the human decides. No tasks go directly to the board without explicit user action.

## Key Takeaway

The AI integration demonstrates several advanced patterns: provider abstraction (supporting multiple AI APIs behind one interface), tool use for structured output, server-side validation of AI responses, and a staged/review workflow. The architecture keeps the AI stateless on the server (conversation history in the client) and treats AI output as untrusted input that must be validated.

This is genuinely production-quality architecture. The same patterns — provider abstraction, tool use, output validation — are used by companies building AI features at scale.

## Wrapping Up Season 2

That's a wrap on Season 2. We've gone file by file through your entire codebase:

- **S2E01**: Entry point (`index.html` + `app.js init()`)
- **S2E02**: Web Component anatomy (`task-card.js`)
- **S2E03**: Drag and drop (`kanban-column.js`)
- **S2E04**: State management (`state.js`)
- **S2E05**: HTTP layer (`api.js`)
- **S2E06**: Server backend (`server.js`)
- **S2E07**: Modal system (`modal-dialog.js` + `modals.js`)
- **S2E08**: Navigation (`nav-sidebar.js` + `router.js`)
- **S2E09**: Filters and CSS state (`filters.js` + `crisis-mode.js`)
- **S2E10**: Page modules (`archive-page.js` + `backlog-page.js`)
- **S2E11**: Inline components (`custom-picker.js` + `svg-icon.js`)
- **S2E12**: AI integration (`ai-page.js` + server AI)

Every file. Every pattern. Every architectural decision. You now have a complete understanding of your own codebase — and the vocabulary to explain it in any technical conversation.

Check `future-episode-ideas.md` for topics that could become Season 3 — deep dives into LWC migration, databases, deployment, and more.

---

*End of Season 2. You built this. Now you understand every line of it.*
