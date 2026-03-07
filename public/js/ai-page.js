/**
 * AI Assistant page module — renders and manages the /:alias/ai page.
 *
 * Layout: two-section split
 *   Top  (55%) — chat area: scrollable message list + pinned input
 *   Bottom (45%) — staged task list (mirrors backlog-row pattern)
 *
 * Conversation history is in-memory (cleared on page reload).
 * Staged tasks are persisted in ai-staged-tasks.json via the server.
 */

import {
    setTasks, setColumns, setEpics, setCategories,
    epics, categories, columns
} from './state.js';
import {
    fetchTasksApi, fetchColumnsApi, fetchEpicsApi, fetchCategoriesApi,
    createTaskApi,
    fetchStagedTasksApi,
    updateStagedTaskApi,
    deleteStagedTaskApi,
    promoteToBacklogApi,
    promoteToBoardApi,
    fetchAiConfigApi,
    sendAiChatApi
} from './api.js';
import { openEditStagedTaskModal, openCloneStagedTaskModal } from './modals.js';

// ==========================================
// Module-level state (in-memory, per session)
// ==========================================

/**
 * @type {Array<{ role: 'user'|'assistant'|'__thinking__', content: string, tasksAdded?: number }>}
 */
let conversationHistory = [];

/** @type {Array<Object>} In-memory mirror of ai-staged-tasks.json */
let stagedTasks = [];

// ==========================================
// Public entry point
// ==========================================

/**
 * Initialises the AI page inside the given container element.
 * @param {HTMLElement} pageViewEl
 * @param {{ elements: Object }} opts
 */
export async function initAiPage(pageViewEl, { elements }) {
    const toaster = elements.toaster;

    pageViewEl.classList.add('--fullPage');
    pageViewEl.innerHTML = `
        <div class="aiPage">
            <div class="aiPage__chat">
                <div class="aiPage__messages js-aiMessages"></div>
                <div class="aiPage__inputArea">
                    <textarea
                        class="aiPage__input js-aiInput"
                        placeholder="Paste meeting notes, describe your work, or ask a question…"
                        rows="2"
                        aria-label="Message input"
                    ></textarea>
                    <div class="aiPage__inputActions">
                        <button type="button" class="aiPage__clearBtn js-aiClearBtn">Clear conversation</button>
                        <button type="button" class="aiPage__sendBtn js-aiSendBtn">Send</button>
                    </div>
                </div>
            </div>
            <div class="aiPage__tasks">
                <div class="aiPage__tasksHeader">
                    <h3 class="aiPage__tasksTitle">Staged Tasks</h3>
                    <span class="aiPage__count js-stagedCount">0 tasks</span>
                </div>
                <div class="aiPage__tableWrap js-aiTableWrap">
                    <list-header class="js-listHeader"></list-header>
                    <div class="aiPage__emptyState js-emptyState">
                        No tasks yet — paste some notes or describe your work above to get started
                    </div>
                    <div class="aiPage__rows js-stagedRows"></div>
                </div>
            </div>
        </div>
    `;

    // Local DOM refs
    const inputEl    = pageViewEl.querySelector('.js-aiInput');
    const sendBtn    = pageViewEl.querySelector('.js-aiSendBtn');
    const clearBtn   = pageViewEl.querySelector('.js-aiClearBtn');
    const messagesEl = pageViewEl.querySelector('.js-aiMessages');
    const rowsEl     = pageViewEl.querySelector('.js-stagedRows');
    const emptyEl    = pageViewEl.querySelector('.js-emptyState');
    const countEl    = pageViewEl.querySelector('.js-stagedCount');
    const headerEl   = pageViewEl.querySelector('.js-listHeader');

    // ---- Fetch initial data ----
    let fetchedTasks, fetchedColumns, fetchedEpics, fetchedCategories, fetchedStaged;
    try {
        [fetchedTasks, fetchedColumns, fetchedEpics, fetchedCategories, fetchedStaged] = await Promise.all([
            fetchTasksApi(),
            fetchColumnsApi(),
            fetchEpicsApi(),
            fetchCategoriesApi(),
            fetchStagedTasksApi()
        ]);
    } catch (err) {
        if (toaster) toaster.error('Failed to load AI page data');
        pageViewEl.querySelector('.js-stagedCount').textContent = 'Error loading data';
        return;
    }

    // Populate state so task edit/clone modals work
    setTasks(fetchedTasks);
    setColumns(fetchedColumns);
    setEpics(fetchedEpics);
    setCategories(fetchedCategories);

    stagedTasks = fetchedStaged;

    // ---- Setup list-header ----
    headerEl.setColumns([
        { id: 'title',    label: 'Task',     sortable: false },
        { id: 'epic',     label: 'Epic',     sortable: false },
        { id: 'category', label: 'Category', sortable: false },
        { id: 'actions',  label: '',         sortable: false }
    ]);

    // ---- Initial renders ----
    _renderMessages(messagesEl);
    _renderStagedList(rowsEl, emptyEl, countEl);

    // ---- Wire input events ----
    sendBtn.addEventListener('click', () => _sendMessage(inputEl, sendBtn, messagesEl, rowsEl, emptyEl, countEl, toaster, elements));

    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            _sendMessage(inputEl, sendBtn, messagesEl, rowsEl, emptyEl, countEl, toaster, elements);
        }
    });

    inputEl.addEventListener('input', () => _autoGrow(inputEl));

    clearBtn.addEventListener('click', () => {
        conversationHistory = [];
        _renderMessages(messagesEl);
    });

    // ---- Wire staged row events (event delegation) ----
    rowsEl.addEventListener('ai-edit', async (e) => {
        const task = stagedTasks.find(t => t.id === e.detail.taskId);
        if (!task) return;
        openEditStagedTaskModal(task, elements, {
            onSave: async (data) => {
                const result = await updateStagedTaskApi(task.id, data);
                if (!result.ok) {
                    if (toaster) toaster.error(result.error || 'Failed to update task');
                    return;
                }
                const idx = stagedTasks.findIndex(t => t.id === task.id);
                if (idx !== -1) stagedTasks[idx] = result.data;
                _renderStagedList(rowsEl, emptyEl, countEl);
                if (toaster) toaster.success('Staged task updated');
            }
        });
    });

    rowsEl.addEventListener('ai-clone', async (e) => {
        const task = stagedTasks.find(t => t.id === e.detail.taskId);
        if (!task) return;
        openCloneStagedTaskModal(task, elements, {
            onSave: async (data) => {
                // Clone goes to board first non-backlog column at position 0
                const firstCol = columns.find(c => !c.isBacklog);
                if (!firstCol) {
                    if (toaster) toaster.error('No board column found');
                    return;
                }
                const result = await createTaskApi({ ...data, status: firstCol.id, position: 0 });
                if (result.error) {
                    if (toaster) toaster.error(result.error || 'Failed to add task to board');
                    return;
                }
                if (toaster) toaster.success('Task added to board');
            }
        });
    });

    rowsEl.addEventListener('ai-delete', async (e) => {
        const taskId = e.detail.taskId;
        // Optimistic: remove immediately
        stagedTasks = stagedTasks.filter(t => t.id !== taskId);
        _renderStagedList(rowsEl, emptyEl, countEl);
        if (toaster) toaster.info('Staged task deleted');

        const result = await deleteStagedTaskApi(taskId);
        if (!result.ok) {
            // Reload to restore accurate state
            try {
                stagedTasks = await fetchStagedTasksApi();
            } catch { /* ignore */ }
            _renderStagedList(rowsEl, emptyEl, countEl);
            if (toaster) toaster.error('Failed to delete staged task');
        }
    });

    rowsEl.addEventListener('ai-promote-backlog', async (e) => {
        const taskId = e.detail.taskId;
        stagedTasks = stagedTasks.filter(t => t.id !== taskId);
        _renderStagedList(rowsEl, emptyEl, countEl);

        const result = await promoteToBacklogApi(taskId);
        if (!result.ok) {
            try { stagedTasks = await fetchStagedTasksApi(); } catch { /* ignore */ }
            _renderStagedList(rowsEl, emptyEl, countEl);
            if (toaster) toaster.error(result.error || 'Failed to promote to backlog');
        } else {
            if (toaster) toaster.success('Task promoted to Backlog');
        }
    });

    rowsEl.addEventListener('ai-promote-board', async (e) => {
        const taskId = e.detail.taskId;
        stagedTasks = stagedTasks.filter(t => t.id !== taskId);
        _renderStagedList(rowsEl, emptyEl, countEl);

        const result = await promoteToBoardApi(taskId);
        if (!result.ok) {
            try { stagedTasks = await fetchStagedTasksApi(); } catch { /* ignore */ }
            _renderStagedList(rowsEl, emptyEl, countEl);
            if (toaster) toaster.error(result.error || 'Failed to promote to board');
        } else {
            if (toaster) toaster.success('Task promoted to Board');
        }
    });
}

// ==========================================
// Private: send message
// ==========================================

async function _sendMessage(inputEl, sendBtn, messagesEl, rowsEl, emptyEl, countEl, toaster, elements) {
    const text = inputEl.value.trim();
    if (!text) return;

    // Check AI config before doing anything
    let aiConfig;
    try {
        aiConfig = await fetchAiConfigApi();
    } catch {
        if (toaster) toaster.error('Failed to check AI configuration');
        return;
    }

    if (!aiConfig.activeProvider) {
        if (toaster) toaster.warning('Configure your AI provider first via Config → AI Configuration');
        return;
    }

    // Append user message and clear input
    conversationHistory.push({ role: 'user', content: text });
    inputEl.value = '';
    inputEl.style.height = 'auto';
    sendBtn.disabled = true;
    _renderMessages(messagesEl);

    // Show thinking indicator
    conversationHistory.push({ role: '__thinking__', content: '' });
    _renderMessages(messagesEl);

    // Build messages array for the API (exclude the thinking placeholder)
    const apiMessages = conversationHistory
        .filter(m => m.role !== '__thinking__')
        .map(m => ({ role: m.role, content: m.content }));

    // Call AI
    const result = await sendAiChatApi(apiMessages);

    // Remove thinking indicator
    conversationHistory = conversationHistory.filter(m => m.role !== '__thinking__');

    if (!result.ok) {
        if (toaster) toaster.error(result.error || 'AI request failed');
        sendBtn.disabled = false;
        _renderMessages(messagesEl);
        return;
    }

    const { narrative, tasks: newTasks } = result.data;

    conversationHistory.push({
        role: 'assistant',
        content: narrative || '(No response)',
        tasksAdded: newTasks.length
    });

    if (newTasks.length > 0) {
        stagedTasks = [...stagedTasks, ...newTasks];
        _renderStagedList(rowsEl, emptyEl, countEl);
        if (toaster) toaster.success(`${newTasks.length} task${newTasks.length !== 1 ? 's' : ''} staged`);
    }

    sendBtn.disabled = false;
    _renderMessages(messagesEl);
}

// ==========================================
// Private: render helpers
// ==========================================

/**
 * Re-renders the chat message list from conversationHistory.
 * @param {HTMLElement} messagesEl
 */
function _renderMessages(messagesEl) {
    messagesEl.innerHTML = '';

    for (const msg of conversationHistory) {
        const div = document.createElement('div');

        if (msg.role === '__thinking__') {
            div.className = 'aiPage__message aiPage__message--thinking';
            div.innerHTML = '<span></span><span></span><span></span>';
        } else if (msg.role === 'user') {
            div.className = 'aiPage__message aiPage__message--user';
            div.textContent = msg.content;
        } else {
            div.className = 'aiPage__message aiPage__message--ai';
            div.textContent = msg.content;
            if (msg.tasksAdded > 0) {
                const chip = document.createElement('span');
                chip.className = 'aiPage__taskChip';
                chip.textContent = `↓ ${msg.tasksAdded} task${msg.tasksAdded !== 1 ? 's' : ''} staged`;
                div.appendChild(chip);
            }
        }

        messagesEl.appendChild(div);
    }

    // Scroll to bottom
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

/**
 * Re-renders the staged task list.
 * @param {HTMLElement} rowsEl
 * @param {HTMLElement} emptyEl
 * @param {HTMLElement} countEl
 */
function _renderStagedList(rowsEl, emptyEl, countEl) {
    const count = stagedTasks.length;
    countEl.textContent = `${count} task${count !== 1 ? 's' : ''}`;
    emptyEl.style.display = count === 0 ? '' : 'none';
    rowsEl.innerHTML = '';

    if (count === 0) return;

    // Build lookup Maps — O(1) per task
    const epicMap = new Map(epics.map(e => [e.id, e]));
    const catMap  = new Map(categories.map(c => [c.id, c]));

    for (const task of stagedTasks) {
        const epic     = task.epicId ? epicMap.get(task.epicId) : null;
        const category = catMap.get(task.category);

        const row = document.createElement('ai-staged-row');
        row.setTask(task, {
            epicName:     epic?.name     || '',
            epicColor:    epic?.color    || '',
            categoryName: category?.name || '',
            categoryIcon: category?.icon || ''
        });
        rowsEl.appendChild(row);
    }
}

/**
 * Auto-grows the textarea up to a max height of 120px.
 * @param {HTMLTextAreaElement} el
 */
function _autoGrow(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}
