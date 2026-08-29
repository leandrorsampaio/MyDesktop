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
    fetchAiAvailabilityApi
} from './api.js';

/**
 * @type {Array<{role: 'user'|'assistant'|'pending', content: string,
 *               tasksAdded?: number, proposalsAdded?: number}>}
 */
let history = [];

/** Cumulative token usage for this session. */
let usage = { input: 0, output: 0, lastInput: 0 };

/** Latest availability answer; `{ available: false }` until checked. */
let availability = { available: false };

/** True while a request is in flight — views disable their composer. */
let busy = false;

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
    return { history: [...history], usage: { ...usage }, availability, busy };
}

/**
 * Loads the persisted transcript and checks availability.
 *
 * Both failures are swallowed: an unreadable transcript is an empty
 * conversation, and an unreachable availability check is just another flavour
 * of "no AI". Neither should stop a view from rendering.
 */
export async function init() {
    const [conversation, status] = await Promise.all([
        fetchAiConversationApi().catch(() => ({ messages: [] })),
        fetchAiAvailabilityApi()
    ]);
    history = (conversation.messages || []).map(m => ({ role: m.role, content: m.content }));
    availability = status;
    emit();
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

    let result = await sendAiChatStreamApi(apiMessages, (delta) => {
        streamed += delta;
        streaming.role = 'assistant';
        streaming.content = streamed;
        emitThrottled();
    });

    // Fall back to the buffered endpoint if the stream never got going. Not
    // every OpenAI-compatible server streams correctly, and that should cost a
    // retry rather than the message. Once text has arrived the stream was
    // working, so a later failure is a real error, not a reason to re-ask.
    if (!result.ok && streamed === '') {
        try {
            result = await sendAiChatApi(apiMessages);
        } catch {
            result = { ok: false, error: 'AI request failed — check your connection and provider settings' };
        }
    }

    history = history.filter(m => m.role !== 'pending' && m !== streaming);
    busy = false;

    if (!result.ok) {
        emit();
        return { ok: false, error: result.error || 'AI request failed' };
    }

    const { narrative, tasks = [], proposals = [], usage: turnUsage } = result.data;
    history.push({
        role: 'assistant',
        content: narrative || streamed || '(No response)',
        tasksAdded: tasks.length,
        proposalsAdded: proposals.length
    });

    if (turnUsage) {
        usage.lastInput = turnUsage.inputTokens || 0;
        usage.input  += turnUsage.inputTokens  || 0;
        usage.output += turnUsage.outputTokens || 0;
    }

    emit();
    persist();   // fire and forget — see below
    return { ok: true, tasks, proposals };
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
        await saveAiConversationApi(
            history
                .filter(m => m.role === 'user' || m.role === 'assistant')
                .map(m => ({ role: m.role, content: m.content }))
        );
    } catch {
        // Intentionally silent — see the docblock.
    }
}

/** Clears the transcript locally and on the server. */
export async function clear() {
    history = [];
    usage = { input: 0, output: 0, lastInput: 0 };
    emit();
    try {
        await clearAiConversationApi();
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
