/**
 * Board preview — renders pending AI proposals *on the board*, where they
 * would land, instead of as a list you have to simulate in your head.
 *
 * This module is the pure half: it turns tasks + proposals into a per-column
 * render plan. No DOM, no fetch, no state — so the interesting logic is unit
 * testable without a browser. `app.js` owns the DOM half.
 *
 * ## Why it annotates rather than simulates
 *
 * The obvious design is "apply every proposal to a copy of the board and
 * render the result". That would mean a second implementation of the server's
 * `applyProposal()` living in the client — the exact duplication SPEC Code
 * Rule 3 exists to prevent, and a place where the preview could quietly start
 * lying about what apply would do.
 *
 * So instead: cards stay where they are and are *annotated* with what would
 * happen, with one exception — a **move** also renders a ghost copy in the
 * destination column. That is the case where position carries the meaning
 * ("where would this end up?"), so it earns the spatial treatment. Updates and
 * deletes read fine in place.
 *
 * The other payoff: rejecting one proposal just drops its annotation. Nothing
 * has to be re-simulated.
 */

/** Which proposal wins when one task has several. Delete is the most consequential. */
const KIND_RANK = { delete: 3, move: 2, update: 1 };

/** Human-readable names for the payload fields an update can carry. */
const FIELD_LABELS = {
    title: 'title',
    description: 'description',
    priority: 'priority',
    category: 'category',
    epicId: 'epic',
    points: 'size',
    deadline: 'deadline'
};

/**
 * Describes one proposal in a few words, for the card's preview caption.
 *
 * @param {Object} proposal
 * @param {Object} lookups
 * @param {Map<string, Object>} lookups.columnById
 * @param {Map<string, Object>} lookups.epicById
 * @param {Map<number, Object>} lookups.categoryById
 * @returns {string}
 */
export function describeProposal(proposal, { columnById, epicById, categoryById }) {
    if (proposal.kind === 'delete') return 'would be removed';
    if (proposal.kind === 'move') {
        const to = columnById.get(proposal.payload?.newStatus);
        return `would move to ${to ? to.name : proposal.payload?.newStatus}`;
    }

    const payload = proposal.payload || {};
    const parts = Object.keys(payload).map((field) => {
        const value = payload[field];
        const label = FIELD_LABELS[field] || field;
        if (field === 'epicId') return `epic → ${epicById.get(value)?.name || 'none'}`;
        if (field === 'category') return `category → ${categoryById.get(value)?.name || value}`;
        if (field === 'priority') return value ? 'mark priority' : 'clear priority';
        if (field === 'deadline') return value ? `deadline → ${String(value).split('T')[0]}` : 'clear deadline';
        if (field === 'description') return 'rewrite description';
        if (field === 'title') return `rename to "${value}"`;
        return `${label} → ${value}`;
    });
    return parts.join(', ');
}

/**
 * Picks the one proposal a card shows when a task has several.
 *
 * A card carries a single accept/reject decision, so it must point at exactly
 * one proposal. The rest are noted as a count and surface on the next render
 * once this one is resolved.
 *
 * @param {Array<Object>} proposals - All proposals for one task
 * @returns {{chosen: Object, others: number}}
 */
export function pickPrimaryProposal(proposals) {
    const sorted = [...proposals].sort(
        (a, b) => (KIND_RANK[b.kind] || 0) - (KIND_RANK[a.kind] || 0)
    );
    return { chosen: sorted[0], others: sorted.length - 1 };
}

/**
 * Builds the per-column render plan for preview mode.
 *
 * Every entry is `{ task, preview }`, where `preview` is null for untouched
 * cards. Tasks are returned as shallow copies so the caller can render them
 * without the annotation leaking back into application state.
 *
 * @param {Array<Object>} tasks - Live tasks
 * @param {Array<Object>} proposals - Pending proposals
 * @param {Array<Object>} columns - Profile columns, sorted by order
 * @param {Object} lookups - { columnById, epicById, categoryById }
 * @returns {Map<string, Array<{task: Object, preview: Object|null}>>} keyed by column id
 */
export function buildPreviewPlan(tasks, proposals, columns, lookups) {
    const plan = new Map(columns.map(c => [c.id, []]));

    // One bucket per task rather than a .find() per proposal — SPEC Code Rule 4.
    const proposalsByTask = new Map();
    for (const proposal of proposals) {
        if (!proposalsByTask.has(proposal.taskId)) proposalsByTask.set(proposal.taskId, []);
        proposalsByTask.get(proposal.taskId).push(proposal);
    }

    /** Ghosts to place at the top of a destination column, keyed by column id. */
    const incoming = new Map();

    for (const task of tasks) {
        if (!plan.has(task.status)) continue;   // legacy row with no column

        const forTask = proposalsByTask.get(task.id);
        if (!forTask || forTask.length === 0) {
            plan.get(task.status).push({ task: { ...task }, preview: null });
            continue;
        }

        const { chosen, others } = pickPrimaryProposal(forTask);
        const note = describeProposal(chosen, lookups);
        const suffix = others > 0 ? ` · +${others} more` : '';

        if (chosen.kind === 'move' && plan.has(chosen.payload?.newStatus)) {
            // The card stays put but dims, and a ghost shows the destination.
            // Seeing both ends of the move is what makes it reviewable.
            plan.get(task.status).push({
                task: { ...task },
                preview: { proposalId: chosen.id, kind: 'outgoing', note: note + suffix }
            });

            const from = lookups.columnById.get(task.status);
            if (!incoming.has(chosen.payload.newStatus)) incoming.set(chosen.payload.newStatus, []);
            incoming.get(chosen.payload.newStatus).push({
                task: { ...task },
                preview: {
                    proposalId: chosen.id,
                    kind: 'incoming',
                    note: `from ${from ? from.name : task.status}${suffix}`
                }
            });
            continue;
        }

        plan.get(task.status).push({
            task: { ...task },
            preview: {
                proposalId: chosen.id,
                // A move whose destination no longer exists degrades to a plain
                // annotation rather than vanishing from the preview.
                kind: chosen.kind === 'delete' ? 'delete' : 'update',
                note: note + suffix
            }
        });
    }

    // Ghosts go to the top of their destination — that is where an applied
    // move actually puts them (position 0).
    for (const [columnId, ghosts] of incoming) {
        plan.set(columnId, [...ghosts, ...plan.get(columnId)]);
    }

    return plan;
}

/**
 * Counts the tasks a preview plan touches, for the preview bar's headline.
 * @param {Map<string, Array<{preview: Object|null}>>} plan
 * @returns {number}
 */
export function countPreviewedChanges(plan) {
    const seen = new Set();
    for (const entries of plan.values()) {
        for (const entry of entries) {
            if (entry.preview) seen.add(entry.preview.proposalId);
        }
    }
    return seen.size;
}
