/**
 * Assistant conversation controller.
 *
 * One conversation, two surfaces: the dock (available on every page) and the
 * `/:alias/ai` page (for long paste-a-transcript sessions). Both drive this
 * module rather than keeping their own history, so switching between them
 * shows the same thread — and there is only one implementation of send,
 * persist and usage-tracking to keep correct.
 *
 * Views subscribe with `onChange()` and re-render from `getState()`. The
 * module owns no DOM.
 *
 * Replies stream by default, falling back to the buffered endpoint when the
 * stream produces nothing — see `send()`.
 */

import {
    sendAiChatApi,
    sendAiChatStreamApi,
    fetchAiConversationApi,
    saveAiConversationApi,
    clearAiConversationApi,
    fetchAiConversationsApi,
    createAiConversationApi,
    activateAiConversationApi,
    renameAiConversationApi,
    deleteAiConversationApi,
    fetchAiSkillsApi,
    fetchAiAvailabilityApi
} from './api.js';

/**
 * @type {Array<{role: 'user'|'assistant'|'pending', content: string,
 *               tasksAdded?: number, proposalsAdded?: number,
 *               memoriesAdded?: number}>}
 */
let history = [];

/** Cumulative token usage for this session. */
let usage = { input: 0, output: 0, lastInput: 0 };

/** Latest availability answer; `{ available: false }` until checked. */
let availability = { available: false };

/** True while a request is in flight — views disable their composer. */
let busy = false;

/**
 * The thread being written into, and the list of saved ones.
 *
 * Conversations used to be a single transcript with a Clear button, so the
 * only way to start a new topic destroyed the previous one. The list is
 * summaries only — transcripts are fetched when a thread is opened.
 */
let activeConversation = { id: null, title: 'New conversation', skillIds: [], mode: 'chat' };
let conversations = [];

/** Every defined skill, always-on or not. */
let skills = [];

/**
 * Skills the server could not fit into the last prompt.
 *
 * The dock shows a skill as active the moment it is toggled, so without this
 * the UI would keep claiming a skill is shaping replies that never reached the
 * model at all.
 * @type {Array<string>}
 */
let skippedSkillIds = [];

/**
 * Streaming re-renders the transcript on every token, which for a whole
 * conversation is far too much work per frame. Emits are coalesced onto an
 * animation frame instead: the text still appears as it is written, but the
 * DOM is touched at most once per paint.
 */
let emitScheduled = false;

function emitThrottled() {
    if (emitScheduled) return;
    emitScheduled = true;
    requestAnimationFrame(() => {
        emitScheduled = false;
        emit();
    });
}

/**
 * Returns what the user is currently looking at, e.g. `{ page, taskId }`.
 *
 * The assistant floats over every page, so the same question means different
 * things depending on where it was asked. `app.js` installs this because only
 * it knows about routing and the open modal; the controller just calls it at
 * send time so the context is always current, never stale.
 * @type {Function|null}
 */
let contextProvider = null;

/** @param {Function} fn */
export function setContextProvider(fn) {
    contextProvider = fn;
}

/** @type {Set<Function>} Subscribers re-rendered on every state change. */
const listeners = new Set();

/**
 * Subscribes to state changes.
 * @param {Function} listener
 * @returns {Function} Unsubscribe — call it from disconnectedCallback.
 */
export function onChange(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function emit() {
    for (const listener of listeners) listener(getState());
}

/**
 * @returns {{history: Array, usage: Object, availability: Object, busy: boolean}}
 */
export function getState() {
    return {
        history: [...history],
        usage: { ...usage },
        availability,
        busy,
        activeConversation: { ...activeConversation },
        conversations: [...conversations],
        skills: [...skills],
        skippedSkillIds: [...skippedSkillIds],
        // Always-on skills apply whether or not this thread selected them,
        // so views can show what is actually in force without re-deriving it.
        activeSkills: skills.filter(sk => sk.alwaysOn || (activeConversation.skillIds || []).includes(sk.id))
    };
}

/**
 * Loads the persisted transcript and checks availability.
 *
 * Both failures are swallowed: an unreadable transcript is an empty
 * conversation, and an unreachable availability check is just another flavour
 * of "no AI". Neither should stop a view from rendering.
 */
export async function init() {
    const [conversation, status, list, skillList] = await Promise.all([
        fetchAiConversationApi().catch(() => ({ messages: [] })),
        fetchAiAvailabilityApi(),
        fetchAiConversationsApi().catch(() => ({ conversations: [] })),
        fetchAiSkillsApi().catch(() => [])
    ]);
    history = (conversation.messages || []).map(m => ({ role: m.role, content: m.content }));
    activeConversation = {
        id: conversation.id || null,
        title: conversation.title || 'New conversation',
        skillIds: conversation.skillIds || [],
        mode: conversation.mode || 'chat'
    };
    conversations = list.conversations || [];
    skills = Array.isArray(skillList) ? skillList : [];
    availability = status;
    emit();
}

/** Re-reads the skill list, e.g. after editing skills on the config page. */
export async function refreshSkills() {
    try {
        skills = await fetchAiSkillsApi();
    } catch {
        // A failed refresh leaves the previous list — better than none.
    }
    emit();
}

/** Re-reads the saved-conversation list without changing the open thread. */
async function refreshConversations() {
    try {
        const list = await fetchAiConversationsApi();
        conversations = list.conversations || [];
    } catch {
        // Leave the previous list rather than emptying the history menu.
    }
}

/**
 * Starts a new thread, leaving the current one saved and reachable.
 *
 * This is what the old Clear button should have been: the previous
 * conversation stays in the history rather than being destroyed.
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function startNewConversation(mode) {
    if (busy) return { ok: false, error: 'Wait for the current reply' };
    try {
        const convo = await createAiConversationApi(activeConversation.skillIds, mode);
        history = [];
        usage = { input: 0, output: 0, lastInput: 0 };
        activeConversation = {
            id: convo.id,
            title: convo.title,
            skillIds: convo.skillIds || [],
            mode: convo.mode || 'chat'
        };
        await refreshConversations();
        emit();
        return { ok: true };
    } catch {
        return { ok: false, error: 'Could not start a new conversation' };
    }
}

/**
 * Starts an interview: a fresh thread whose prompt is about learning who you
 * are rather than helping with tasks.
 *
 * Always its own thread, so it can be re-run whenever — after switching model,
 * or when the board has moved on — without disturbing anything else.
 *
 * @param {string} [opener] - First message; the model is prompted to open by
 *        saying what it scanned, so this only has to start it.
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function startInterview(opener = 'Interview me.') {
    if (!availability.available) {
        return { ok: false, error: availability.message || 'AI is not configured' };
    }
    const started = await startNewConversation('interview');
    if (!started.ok) return started;
    return send(opener);
}

/**
 * Opens a saved thread, replacing what is on screen.
 * @param {string} id
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function openConversation(id) {
    if (busy) return { ok: false, error: 'Wait for the current reply' };
    if (id === activeConversation.id) return { ok: true };
    try {
        const convo = await activateAiConversationApi(id);
        history = (convo.messages || []).map(m => ({ role: m.role, content: m.content }));
        // Usage counts what this session has spent, and reopening a thread
        // spends nothing — resetting it keeps the number honest.
        usage = { input: 0, output: 0, lastInput: 0 };
        activeConversation = {
            id: convo.id,
            title: convo.title,
            skillIds: convo.skillIds || [],
            mode: convo.mode || 'chat'
        };
        await refreshConversations();
        emit();
        return { ok: true };
    } catch {
        return { ok: false, error: 'Could not open that conversation' };
    }
}

/**
 * @param {string} id
 * @param {string} title
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function renameConversation(id, title) {
    try {
        await renameAiConversationApi(id, title);
        if (id === activeConversation.id) activeConversation.title = title;
        await refreshConversations();
        emit();
        return { ok: true };
    } catch {
        return { ok: false, error: 'Could not rename that conversation' };
    }
}

/**
 * Deletes a saved thread. Deleting the open one falls back to whatever the
 * server made active, so the assistant always has somewhere to write.
 * @param {string} id
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function deleteConversation(id) {
    try {
        const result = await deleteAiConversationApi(id);
        if (id === activeConversation.id) {
            const convo = await fetchAiConversationApi();
            history = (convo.messages || []).map(m => ({ role: m.role, content: m.content }));
            usage = { input: 0, output: 0, lastInput: 0 };
            activeConversation = {
                id: convo.id || result.activeId,
                title: convo.title || 'New conversation',
                skillIds: convo.skillIds || [],
                mode: convo.mode || 'chat'
            };
        }
        await refreshConversations();
        emit();
        return { ok: true };
    } catch {
        return { ok: false, error: 'Could not delete that conversation' };
    }
}

/**
 * Turns a skill on or off for the open thread. Always-on skills are not
 * toggleable here — that is a property of the skill, changed in Config.
 * @param {string} skillId
 * @returns {Promise<{ok: boolean, error?: string}>}
 */
export async function toggleSkill(skillId) {
    const current = activeConversation.skillIds || [];
    activeConversation.skillIds = current.includes(skillId)
        ? current.filter(id => id !== skillId)
        : [...current, skillId];
    emit();
    try {
        await saveAiConversationApi(
            history.filter(m => m.role === 'user' || m.role === 'assistant')
                   .map(m => ({ role: m.role, content: m.content })),
            activeConversation.skillIds
        );
        return { ok: true };
    } catch {
        return { ok: false, error: 'Skill applied, but not saved' };
    }
}

/** Re-checks availability, e.g. after the active model is switched. */
export async function refreshAvailability() {
    availability = await fetchAiAvailabilityApi();
    emit();
    return availability;
}

/**
 * Sends a message and appends the reply.
 *
 * @param {string} text
 * @returns {Promise<{ok: boolean, error?: string, tasks?: Array, proposals?: Array}>}
 *          Callers use the returned tasks/proposals to update their own lists;
 *          the transcript itself is already updated when this resolves.
 */
export async function send(text) {
    const trimmed = text.trim();
    if (!trimmed || busy) return { ok: false, error: 'Nothing to send' };
    if (!availability.available) {
        return { ok: false, error: availability.message || 'AI is not configured' };
    }

    history.push({ role: 'user', content: trimmed });
    // A placeholder row rather than a spinner elsewhere: the wait belongs in
    // the transcript, where the user is already looking.
    history.push({ role: 'pending', content: '' });
    busy = true;
    emit();

    const apiMessages = history
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content }));

    // The pending row becomes the assistant's reply and fills in as text
    // arrives, so the wait happens where the user is already looking.
    const streaming = history[history.length - 1];
    let streamed = '';

    // Resolved now, not when the dock opened — the user may have navigated or
    // opened a card since.
    let context = null;
    try { context = contextProvider ? contextProvider() : null; } catch { context = null; }

    let result = await sendAiChatStreamApi(apiMessages, (delta) => {
        streamed += delta;
        streaming.role = 'assistant';
        streaming.content = streamed;
        emitThrottled();
    }, context, activeConversation.skillIds || [], activeConversation.mode);

    // Fall back to the buffered endpoint if the stream never got going. Not
    // every OpenAI-compatible server streams correctly, and that should cost a
    // retry rather than the message. Once text has arrived the stream was
    // working, so a later failure is a real error, not a reason to re-ask.
    if (!result.ok && streamed === '') {
        try {
            result = await sendAiChatApi(apiMessages, context, activeConversation.skillIds || [], activeConversation.mode);
        } catch {
            result = { ok: false, error: 'AI request failed — check your connection and provider settings' };
        }
    }

    history = history.filter(m => m.role !== 'pending' && m !== streaming);
    busy = false;

    if (!result.ok) {
        // Keep what did arrive. Watching a paragraph appear and then vanish is
        // more alarming than the error itself, and the text was really written.
        if (streamed.trim()) {
            history.push({ role: 'assistant', content: `${streamed}\n\n[interrupted]` });
        }
        emit();
        return { ok: false, error: result.error || 'AI request failed' };
    }

    const { narrative, synthetic, tasks = [], proposals = [], memories = [], usage: turnUsage } = result.data;
    skippedSkillIds = result.data.skippedSkillIds || [];
    history.push({
        role: 'assistant',
        content: narrative || streamed || '(No response)',
        // A synthetic narrative is already a receipt ("Staged 3 tasks."), so
        // the view's own outcome line would repeat it word for word.
        tasksAdded: synthetic ? 0 : tasks.length,
        proposalsAdded: synthetic ? 0 : proposals.length,
        memoriesAdded: synthetic ? 0 : memories.length
    });

    if (turnUsage) {
        usage.lastInput = turnUsage.inputTokens || 0;
        usage.input  += turnUsage.inputTokens  || 0;
        usage.output += turnUsage.outputTokens || 0;
    }

    emit();
    persist();   // fire and forget — see below
    return { ok: true, tasks, proposals, memories };
}

/**
 * Writes the transcript back to the server.
 *
 * Deliberately not awaited by `send()`: the exchange is already on screen, so
 * a failed save costs the user nothing right now — it only means this turn is
 * missing after a reload. Surfacing it as an error would overstate it.
 */
async function persist() {
    try {
        const saved = await saveAiConversationApi(
            history
                .filter(m => m.role === 'user' || m.role === 'assistant')
                .map(m => ({ role: m.role, content: m.content })),
            activeConversation.skillIds
        );
        // The server titles an unnamed thread from its first message, so the
        // history menu would show "New conversation" until a reload otherwise.
        if (saved?.title && saved.title !== activeConversation.title) {
            activeConversation.title = saved.title;
            await refreshConversations();
            emit();
        }
    } catch {
        // Intentionally silent — see the docblock.
    }
}

/**
 * Empties the open thread in place, keeping it and its skills.
 *
 * Distinct from `startNewConversation()`: this one really does discard, and
 * is only reachable from an explicit "Clear this conversation" action.
 */
export async function clear() {
    history = [];
    usage = { input: 0, output: 0, lastInput: 0 };
    activeConversation.title = 'New conversation';
    emit();
    try {
        await clearAiConversationApi();
        await refreshConversations();
        emit();
        return { ok: true };
    } catch {
        return { ok: false, error: 'Cleared locally, but not on the server' };
    }
}

/**
 * Formats the session token counter. The board snapshot is re-sent on every
 * message, so this is the number that shows what the assistant costs.
 * @returns {string} Empty string before the first reply.
 */
export function formatUsage() {
    const total = usage.input + usage.output;
    if (total === 0) return '';
    const fmt = (n) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
    return `last ${fmt(usage.lastInput)} in · session ${fmt(total)}`;
}
