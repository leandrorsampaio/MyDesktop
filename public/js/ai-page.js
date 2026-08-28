/**
 * AI Assistant page module — renders and manages the /:alias/ai page.
 *
 * Layout: two-section split
 *   Top  (55%) — chat area: scrollable message list + pinned input
 *   Bottom (45%) — staged task list (mirrors backlog-row pattern)
 *
 * Conversation history is persisted in ai-conversation.json via the server, so
 * it survives a page reload or a server restart.
 * Staged tasks are persisted in ai-staged-tasks.json via the server.
 *
 * Graceful degradation: the page always renders. If the AI is unconfigured or
 * unreachable, the transcript and staged tasks stay fully usable and only the
 * composer is disabled, with the reason stated inline. No AI call is awaited
 * before the page paints.
 */

import {
    setTasks, setColumns, setEpics, setCategories,
    tasks, epics, categories, columns
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
    setActiveAiConfigApi,
    fetchProposalsApi,
    applyProposalApi,
    applyAllProposalsApi,
    rejectProposalApi,
    rejectAllProposalsApi
} from './api.js';
import { openEditStagedTaskModal, openCloneStagedTaskModal } from './modals.js';
import * as assistantChat from './assistant-chat.js';

// ==========================================
// Module-level state (in-memory, per session)
// ==========================================

/** @type {Array<Object>} In-memory mirror of ai-staged-tasks.json */
let stagedTasks = [];

/**
 * In-memory mirror of ai-proposals.json — changes the AI wants to make to
 * tasks that already exist. Nothing here has touched the board.
 * @type {Array<Object>}
 */
let proposals = [];

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
                <div class="aiPage__modelBar js-aiModelBar">
                    <label class="aiPage__modelLabel">Model</label>
                    <select class="aiPage__modelSelect js-aiModelSelect"></select>
                </div>
                <div class="aiPage__inputArea">
                    <textarea
                        class="aiPage__input js-aiInput"
                        placeholder="Paste meeting notes, describe your work, or ask a question…"
                        rows="2"
                        aria-label="Message input"
                    ></textarea>
                    <div class="aiPage__inputActions">
                        <span class="aiPage__usage js-aiUsage" title="Tokens used this session"></span>
                        <button type="button" class="btn --secondary --sm js-aiClearBtn">Clear conversation</button>
                        <button type="button" class="btn --primary --sm js-aiSendBtn">Send</button>
                    </div>
                    <div class="aiPage__notice js-aiNotice" hidden></div>
                </div>
            </div>
            <div class="aiPage__proposals js-proposalsSection" hidden>
                <div class="aiPage__tasksHeader">
                    <h3 class="aiPage__tasksTitle">Proposed Changes</h3>
                    <div class="aiPage__proposalActions">
                        <span class="aiPage__count js-proposalCount">0</span>
                        <button type="button" class="btn --secondary --sm js-rejectAllBtn">Reject all</button>
                        <button type="button" class="btn --primary --sm js-applyAllBtn">Apply all</button>
                    </div>
                </div>
                <div class="aiPage__proposalRows js-proposalRows"></div>
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
    const inputEl      = pageViewEl.querySelector('.js-aiInput');
    const sendBtn      = pageViewEl.querySelector('.js-aiSendBtn');
    const clearBtn     = pageViewEl.querySelector('.js-aiClearBtn');
    const messagesEl   = pageViewEl.querySelector('.js-aiMessages');
    const rowsEl       = pageViewEl.querySelector('.js-stagedRows');
    const emptyEl      = pageViewEl.querySelector('.js-emptyState');
    const countEl      = pageViewEl.querySelector('.js-stagedCount');
    const headerEl     = pageViewEl.querySelector('.js-listHeader');
    const modelSelectEl = pageViewEl.querySelector('.js-aiModelSelect');
    const usageEl      = pageViewEl.querySelector('.js-aiUsage');
    const proposalsSectionEl = pageViewEl.querySelector('.js-proposalsSection');
    const proposalRowsEl     = pageViewEl.querySelector('.js-proposalRows');
    const proposalCountEl    = pageViewEl.querySelector('.js-proposalCount');

    // ---- Fetch initial data (page components load alongside — lazy: they're
    // not in index.html so the board cold-start doesn't pay for them) ----
    let fetchedTasks, fetchedColumns, fetchedEpics, fetchedCategories, fetchedStaged, fetchedAiConfig, fetchedProposals;
    try {
        [fetchedTasks, fetchedColumns, fetchedEpics, fetchedCategories, fetchedStaged, fetchedAiConfig, fetchedProposals] = await Promise.all([
            fetchTasksApi(),
            fetchColumnsApi(),
            fetchEpicsApi(),
            fetchCategoriesApi(),
            fetchStagedTasksApi(),
            fetchAiConfigApi(),
            fetchProposalsApi().catch(() => []),
            import('/components/list-header/list-header.js'),
            import('/components/ai-staged-row/ai-staged-row.js'),
            import('/components/proposal-row/proposal-row.js')
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
    proposals = fetchedProposals || [];

    // ---- Setup list-header ----
    headerEl.setColumns([
        { id: 'title',    label: 'Task',     sortable: false },
        { id: 'epic',     label: 'Epic',     sortable: false },
        { id: 'category', label: 'Category', sortable: false },
        { id: 'actions',  label: '',         sortable: false }
    ]);

    // ---- Populate model selector ----
    function _populateModelSelect(config) {
        modelSelectEl.innerHTML = '';
        if (!config.configs || !config.configs.length) {
            const opt = document.createElement('option');
            opt.textContent = 'No configuration — set one in Config → AI Configuration';
            opt.disabled = true;
            modelSelectEl.appendChild(opt);
            return;
        }
        for (const cfg of config.configs) {
            const opt = document.createElement('option');
            opt.value = cfg.id;
            opt.textContent = cfg.name;
            modelSelectEl.appendChild(opt);
        }
        if (config.activeConfigId) modelSelectEl.value = config.activeConfigId;
    }
    _populateModelSelect(fetchedAiConfig);

    modelSelectEl.addEventListener('change', async () => {
        const result = await setActiveAiConfigApi(modelSelectEl.value);
        if (!result.ok && toaster) toaster.error('Failed to switch model');
        // The new config may have a key where the old one didn't, so the
        // composer's enabled state has to be re-derived.
        await assistantChat.refreshAvailability();
    });

    // ---- Initial renders ----
    _renderMessages(messagesEl);
    _renderStagedList(rowsEl, emptyEl, countEl);
    _renderProposals(proposalsSectionEl, proposalRowsEl, proposalCountEl);
    _renderUsage(usageEl);

    // ---- Proposal review: the only path from the buffer to the board ----
    proposalRowsEl.addEventListener('apply-proposal', async (e) => {
        const result = await applyProposalApi(e.detail.proposalId);
        // A stale proposal has already been discarded server-side, so it comes
        // off the list either way — only the message differs.
        proposals = proposals.filter(p => p.id !== e.detail.proposalId);
        _renderProposals(proposalsSectionEl, proposalRowsEl, proposalCountEl);

        if (result.ok) {
            setTasks(await fetchTasksApi());
            if (toaster) toaster.success('Change applied');
        } else if (toaster) {
            toaster[result.stale ? 'warning' : 'error'](result.error);
        }
    });

    proposalRowsEl.addEventListener('reject-proposal', async (e) => {
        proposals = proposals.filter(p => p.id !== e.detail.proposalId);
        _renderProposals(proposalsSectionEl, proposalRowsEl, proposalCountEl);
        try {
            await rejectProposalApi(e.detail.proposalId);
        } catch {
            if (toaster) toaster.warning('Rejected locally, but not on the server');
        }
    });

    pageViewEl.querySelector('.js-applyAllBtn').addEventListener('click', async () => {
        if (proposals.length === 0) return;
        try {
            const result = await applyAllProposalsApi();
            proposals = [];
            _renderProposals(proposalsSectionEl, proposalRowsEl, proposalCountEl);
            setTasks(await fetchTasksApi());
            if (result.failed?.length && toaster) {
                toaster.warning(`${result.applied} applied, ${result.failed.length} were out of date`);
            } else if (toaster) {
                toaster.success(`${result.applied} change${result.applied === 1 ? '' : 's'} applied`);
            }
        } catch (error) {
            if (toaster) toaster.error('Failed to apply changes');
        }
    });

    pageViewEl.querySelector('.js-rejectAllBtn').addEventListener('click', async () => {
        if (proposals.length === 0) return;
        proposals = [];
        _renderProposals(proposalsSectionEl, proposalRowsEl, proposalCountEl);
        try {
            await rejectAllProposalsApi();
        } catch {
            if (toaster) toaster.warning('Rejected locally, but not on the server');
        }
    });

    // ---- The controller drives both this page and the dock, so re-render
    // from it on every change — including ones the dock caused. Availability
    // is checked AFTER the page has painted, never awaited before it. ----
    const noticeEl = pageViewEl.querySelector('.js-aiNotice');
    assistantChat.onChange((state) => {
        _renderMessages(messagesEl);
        _renderUsage(usageEl);
        _applyAvailability(state.availability, noticeEl, inputEl, sendBtn, state.busy);
    });
    assistantChat.init();

    // ---- Wire input events ----
    sendBtn.addEventListener('click', () => _sendMessage(inputEl, sendBtn, messagesEl, rowsEl, emptyEl, countEl, toaster, elements, usageEl));

    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            _sendMessage(inputEl, sendBtn, messagesEl, rowsEl, emptyEl, countEl, toaster, elements, usageEl);
        }
    });

    inputEl.addEventListener('input', () => _autoGrow(inputEl));

    clearBtn.addEventListener('click', async () => {
        const result = await assistantChat.clear();
        if (!result.ok && toaster) toaster.warning(result.error);
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

async function _sendMessage(inputEl, sendBtn, messagesEl, rowsEl, emptyEl, countEl, toaster, elements, usageEl) {
    const text = inputEl.value.trim();
    if (!text) return;

    inputEl.value = '';
    inputEl.style.height = 'auto';

    // The controller owns the transcript, the pending placeholder, token
    // accounting and persistence — and notifies the dock too, so both surfaces
    // stay on the same conversation.
    const result = await assistantChat.send(text);

    if (!result.ok) {
        if (toaster) toaster.error(result.error);
        return;
    }

    const { tasks: newTasks, proposals: newProposals } = result;

    if (newTasks.length > 0) {
        stagedTasks = [...stagedTasks, ...newTasks];
        _renderStagedList(rowsEl, emptyEl, countEl);
        if (toaster) toaster.success(`${newTasks.length} task${newTasks.length !== 1 ? 's' : ''} staged`);
    }

    if (newProposals?.length > 0) {
        proposals = [...newProposals, ...proposals];
        _renderProposals(
            document.querySelector('.js-proposalsSection'),
            document.querySelector('.js-proposalRows'),
            document.querySelector('.js-proposalCount')
        );
        if (toaster) {
            toaster.info(`${newProposals.length} change${newProposals.length === 1 ? '' : 's'} proposed — review below`);
        }
    }
}

/**
 * Applies AI availability to the composer. The transcript and staged tasks are
 * never touched — they work with the AI off.
 * @param {{available: boolean, message?: string, name?: string}} status
 * @param {HTMLElement} noticeEl
 * @param {HTMLTextAreaElement} inputEl
 * @param {HTMLButtonElement} sendBtn
 */
function _applyAvailability(status, noticeEl, inputEl, sendBtn, busy = false) {
    const ok = Boolean(status.available);

    inputEl.disabled = !ok;
    sendBtn.disabled = !ok || busy;
    noticeEl.hidden = ok;

    if (ok) {
        inputEl.placeholder = 'Paste meeting notes, describe your work, or ask a question…';
        noticeEl.textContent = '';
        return;
    }

    // Silent disabling is the failure mode to avoid — always say why, and say
    // what to do about it.
    inputEl.placeholder = 'AI unavailable';
    noticeEl.textContent = status.reason === 'offline'
        ? `${status.message} Your conversation and staged tasks are still available.`
        : `${status.message} Set one up in Config → AI Configuration.`;
}

/**
 * Renders the proposed-changes list. The whole section hides when empty —
 * an empty review buffer is not information worth taking up space.
 *
 * @param {HTMLElement} sectionEl
 * @param {HTMLElement} rowsEl
 * @param {HTMLElement} countEl
 */
function _renderProposals(sectionEl, rowsEl, countEl) {
    if (!sectionEl) return;

    sectionEl.hidden = proposals.length === 0;
    countEl.textContent = `${proposals.length} change${proposals.length === 1 ? '' : 's'}`;
    rowsEl.innerHTML = '';
    if (proposals.length === 0) return;

    // Map lookups rather than .find() per row — see SPEC Code Rule 4.
    const taskById = new Map(tasks.map(t => [t.id, t]));
    const columnById = new Map(columns.map(c => [c.id, c]));
    const epicById = new Map(epics.map(e => [e.id, e]));
    const categoryById = new Map(categories.map(c => [c.id, c]));

    for (const proposal of proposals) {
        const row = document.createElement('proposal-row');
        const task = taskById.get(proposal.taskId);
        row.setProposal(proposal, {
            taskTitle:    task?.title,
            columnName:   columnById.get(proposal.payload?.newStatus)?.name,
            epicName:     epicById.get(proposal.payload?.epicId)?.name,
            categoryName: categoryById.get(proposal.payload?.category)?.name
        });
        rowsEl.appendChild(row);
    }
}

/**
 * Renders the session token counter. The board snapshot is re-sent on every
 * message, so this is the number that tells you what the feature costs.
 * @param {HTMLElement} usageEl
 */
function _renderUsage(usageEl) {
    if (usageEl) usageEl.textContent = assistantChat.formatUsage();
}

// ==========================================
// Private: render helpers
// ==========================================

/**
 * Re-renders the chat message list from the shared conversation controller.
 * @param {HTMLElement} messagesEl
 */
function _renderMessages(messagesEl) {
    messagesEl.innerHTML = '';

    for (const msg of assistantChat.getState().history) {
        const div = document.createElement('div');

        if (msg.role === 'pending') {
            div.className = 'aiPage__message aiPage__message--thinking';
            div.innerHTML = '<span></span><span></span><span></span>';
        } else if (msg.role === 'user') {
            div.className = 'aiPage__message aiPage__message--user';
            div.textContent = msg.content;
        } else {
            div.className = 'aiPage__message aiPage__message--ai';
            div.textContent = msg.content;
            const outcomes = [];
            if (msg.tasksAdded > 0) outcomes.push(`↓ ${msg.tasksAdded} task${msg.tasksAdded !== 1 ? 's' : ''} staged`);
            if (msg.proposalsAdded > 0) outcomes.push(`${msg.proposalsAdded} change${msg.proposalsAdded !== 1 ? 's' : ''} proposed`);
            if (outcomes.length) {
                const chip = document.createElement('span');
                chip.className = 'aiPage__taskChip';
                chip.textContent = outcomes.join(' · ');
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
