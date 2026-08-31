/**
 * Board-derived opening suggestions for the assistant.
 *
 * A chat box with no prompt is a blank page, and a blank page is why the AI
 * feature went unused. So the empty state is not "ask me anything" — it is a
 * short list of **facts about this board**, each with a verb attached.
 *
 * Everything here is computed locally from tasks the app already has. No AI
 * call, no network: the suggestions render with the assistant switched off,
 * unreachable, or unconfigured. That is deliberate — see the degradation
 * contract in docs/design/AI_ASSISTANT.md.
 *
 * Pure module: no DOM, no fetch, no state.
 */

/** A card untouched for this long is stale enough to mention. */
export const STALE_DAYS = 14;

/** Deadlines closer than this are "coming up". */
export const DEADLINE_SOON_DAYS = 7;

/** How many suggestions the empty state shows. More reads as a to-do list. */
export const MAX_SUGGESTIONS = 3;

/**
 * Days since a task last showed any sign of life — its newest log entry, or
 * its creation date when it has never been touched.
 *
 * @param {Object} task
 * @param {number} now - Epoch ms
 * @returns {number}
 */
export function daysSinceActivity(task, now) {
    const stamps = [task.createdDate, ...(task.log || []).map(entry => entry.date)]
        .map(value => Date.parse(value))
        .filter(value => !isNaN(value));
    if (stamps.length === 0) return 0;
    return Math.floor((now - Math.max(...stamps)) / 86400000);
}

/**
 * Builds the ranked suggestion list.
 *
 * Each rule returns `{ id, fact, action, prompt }` — `fact` is what is true,
 * `action` is the verb, `prompt` is what gets sent if clicked. Rules that find
 * nothing return null and are dropped, so an empty, tidy board shows nothing
 * rather than inventing busywork.
 *
 * @param {Array<Object>} tasks - Live tasks
 * @param {Array<Object>} columns - Profile columns, sorted by order
 * @param {{now?: number}} [opts]
 * @returns {Array<{id: string, fact: string, action: string, prompt: string}>}
 */
export function buildSuggestions(tasks, columns, { now = Date.now() } = {}) {
    const columnById = new Map(columns.map(c => [c.id, c]));
    const boardColumns = columns.filter(c => !c.isBacklog && !c.hasArchive);
    const boardColumnIds = new Set(boardColumns.map(c => c.id));

    // Only cards actually on the board count. Backlog, done and legacy rows
    // are a different conversation.
    const live = tasks.filter(t => boardColumnIds.has(t.status));
    const backlogIds = new Set(columns.filter(c => c.isBacklog).map(c => c.id));
    const backlog = tasks.filter(t => backlogIds.has(t.status));

    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

    /** Rules in priority order — the first MAX_SUGGESTIONS that fire are shown. */
    const rules = [
        () => {
            const overdue = live.filter(t => t.deadline && Date.parse(t.deadline) < now);
            if (overdue.length === 0) return null;
            return {
                id: 'overdue',
                fact: `${plural(overdue.length, 'card')} past ${overdue.length === 1 ? 'its' : 'their'} deadline`,
                action: 'Triage them',
                prompt: 'Some cards on my board are past their deadline. Which ones, and what should I do about each?'
            };
        },
        () => {
            const soon = live.filter(t => {
                if (!t.deadline) return false;
                const due = Date.parse(t.deadline);
                return due >= now && due < now + DEADLINE_SOON_DAYS * 86400000;
            });
            if (soon.length === 0) return null;
            return {
                id: 'deadlines',
                fact: `${plural(soon.length, 'deadline')} in the next week`,
                action: 'Plan the week',
                prompt: 'What is due in the next week, and what order should I do it in?'
            };
        },
        () => {
            const stale = live.filter(t => daysSinceActivity(t, now) >= STALE_DAYS);
            if (stale.length === 0) return null;
            return {
                id: 'stale',
                fact: `${plural(stale.length, 'card')} untouched for ${STALE_DAYS}+ days`,
                action: 'Review them',
                prompt: `Some cards haven't moved in over ${STALE_DAYS} days. Which should I drop, and which need a next step?`
            };
        },
        () => {
            const unfiled = live.filter(t => t.needsFiling);
            if (unfiled.length === 0) return null;
            return {
                id: 'unfiled',
                fact: `${plural(unfiled.length, 'captured note')} not filed yet`,
                action: 'File them',
                prompt: 'Some captured notes were never filed. Suggest an epic, category and size for each.'
            };
        },
        () => {
            // Only worth raising once there is enough work for the split to
            // mean something.
            const noEpic = live.filter(t => !t.epicId);
            if (noEpic.length < 3) return null;
            return {
                id: 'no-epic',
                fact: `${plural(noEpic.length, 'card')} with no epic`,
                action: 'Sort them',
                prompt: 'Several cards have no epic. Propose one for each based on what they are about.'
            };
        },
        () => {
            if (backlog.length === 0) return null;
            const oldest = Math.max(...backlog.map(t => daysSinceActivity(t, now)));
            if (oldest < 30) return null;
            return {
                id: 'backlog',
                fact: `Backlog untouched for ${oldest} days`,
                action: 'Pull or cull',
                prompt: 'My backlog has gone stale. Which items are worth pulling into this week, and which should I delete?'
            };
        },
        () => {
            // A named "doing" column sitting empty is a real signal — but only
            // when there is work to pull into it. On an empty board this would
            // be "pick today's work" with nothing to pick.
            if (live.length === 0) return null;
            const doing = boardColumns.find(c => /progress|doing|today/i.test(c.name));
            if (!doing || live.some(t => t.status === doing.id)) return null;
            return {
                id: 'empty-doing',
                fact: `Nothing in ${columnById.get(doing.id).name}`,
                action: 'Pick today’s work',
                prompt: 'Nothing is in progress. Given my deadlines and priorities, what are the three things I should do today?'
            };
        }
    ];

    const found = [];
    for (const rule of rules) {
        const suggestion = rule();
        if (suggestion) found.push(suggestion);
        if (found.length === MAX_SUGGESTIONS) break;
    }
    return found;
}
