/**
 * Unit tests for the board preview plan builder
 * (Phase 5 of docs/design/AI_ASSISTANT.md).
 *
 * These cover the pure half of preview mode — turning tasks + proposals into a
 * per-column render plan — with no DOM and no server.
 *
 * Run with: node --test tests/unit/board-preview.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const MODULE_URL = pathToFileURL(
    path.join(__dirname, '..', '..', 'public', 'js', 'board-preview.js')
).href;

const COLUMNS = [
    { id: 'todo',       name: 'To Do',       order: 0 },
    { id: 'inprogress', name: 'In Progress', order: 1 },
    { id: 'done',       name: 'Done',        order: 2 }
];

const LOOKUPS = {
    columnById:   new Map(COLUMNS.map(c => [c.id, c])),
    epicById:     new Map([['e1', { id: 'e1', name: 'ECOM' }]]),
    categoryById: new Map([[2, { id: 2, name: 'Development' }]])
};

function task(id, status, extra = {}) {
    return { id, title: `Task ${id}`, status, position: 0, ...extra };
}

function proposal(id, kind, taskId, payload = {}) {
    return { id, kind, taskId, payload, reason: 'because', createdAt: '2026-08-29T00:00:00.000Z' };
}

/** Flattens a plan to [columnId, taskId, previewKind] triples for easy asserts. */
function flatten(plan) {
    const out = [];
    for (const [columnId, entries] of plan) {
        for (const entry of entries) {
            out.push([columnId, entry.task.id, entry.preview?.kind ?? null]);
        }
    }
    return out;
}

describe('board-preview', () => {

    describe('buildPreviewPlan', () => {

        it('leaves untouched tasks unannotated, in their own column', async () => {
            const { buildPreviewPlan } = await import(MODULE_URL);
            const plan = buildPreviewPlan([task('a', 'todo')], [], COLUMNS, LOOKUPS);

            assert.deepStrictEqual(flatten(plan), [['todo', 'a', null]]);
        });

        it('creates a bucket for every column, even empty ones', async () => {
            const { buildPreviewPlan } = await import(MODULE_URL);
            const plan = buildPreviewPlan([], [], COLUMNS, LOOKUPS);

            assert.deepStrictEqual([...plan.keys()], ['todo', 'inprogress', 'done']);
        });

        it('annotates an update in place', async () => {
            const { buildPreviewPlan } = await import(MODULE_URL);
            const plan = buildPreviewPlan(
                [task('a', 'todo')],
                [proposal('p1', 'update', 'a', { points: 8, priority: true })],
                COLUMNS, LOOKUPS
            );

            const entry = plan.get('todo')[0];
            assert.strictEqual(entry.preview.kind, 'update');
            assert.strictEqual(entry.preview.proposalId, 'p1');
            assert.match(entry.preview.note, /size → 8/);
            assert.match(entry.preview.note, /mark priority/);
        });

        it('shows a move at both ends — dimmed origin, ghost in the destination', async () => {
            // Seeing where it leaves *and* where it lands is what makes a move
            // reviewable; a single annotation would not.
            const { buildPreviewPlan } = await import(MODULE_URL);
            const plan = buildPreviewPlan(
                [task('a', 'todo')],
                [proposal('p1', 'move', 'a', { newStatus: 'inprogress' })],
                COLUMNS, LOOKUPS
            );

            assert.deepStrictEqual(flatten(plan), [
                ['todo', 'a', 'outgoing'],
                ['inprogress', 'a', 'incoming']
            ]);
            assert.match(plan.get('todo')[0].preview.note, /would move to In Progress/);
            assert.match(plan.get('inprogress')[0].preview.note, /from To Do/);
        });

        it('places the ghost at the top of the destination, where an applied move puts it', async () => {
            const { buildPreviewPlan } = await import(MODULE_URL);
            const plan = buildPreviewPlan(
                [task('a', 'todo'), task('b', 'inprogress')],
                [proposal('p1', 'move', 'a', { newStatus: 'inprogress' })],
                COLUMNS, LOOKUPS
            );

            assert.deepStrictEqual(plan.get('inprogress').map(e => e.task.id), ['a', 'b']);
        });

        it('annotates a delete in place', async () => {
            const { buildPreviewPlan } = await import(MODULE_URL);
            const plan = buildPreviewPlan(
                [task('a', 'todo')],
                [proposal('p1', 'delete', 'a')],
                COLUMNS, LOOKUPS
            );

            assert.strictEqual(plan.get('todo')[0].preview.kind, 'delete');
            assert.match(plan.get('todo')[0].preview.note, /would be removed/);
        });

        it('never mutates the tasks it is given', async () => {
            // The annotation must not leak back into application state — the
            // real board is rendered from these same objects.
            const { buildPreviewPlan } = await import(MODULE_URL);
            const original = task('a', 'todo');
            const plan = buildPreviewPlan(
                [original],
                [proposal('p1', 'update', 'a', { points: 8 })],
                COLUMNS, LOOKUPS
            );

            assert.strictEqual(original._preview, undefined);
            assert.notStrictEqual(plan.get('todo')[0].task, original, 'task was passed by reference');
        });

        it('skips tasks whose column no longer exists', async () => {
            const { buildPreviewPlan } = await import(MODULE_URL);
            const plan = buildPreviewPlan(
                [task('ghost', 'archived'), task('a', 'todo')],
                [], COLUMNS, LOOKUPS
            );

            assert.deepStrictEqual(flatten(plan), [['todo', 'a', null]]);
        });

        it('degrades a move to a missing column into a plain annotation', async () => {
            // Better a slightly odd caption than a card that silently vanishes
            // from the preview.
            const { buildPreviewPlan } = await import(MODULE_URL);
            const plan = buildPreviewPlan(
                [task('a', 'todo')],
                [proposal('p1', 'move', 'a', { newStatus: 'nowhere' })],
                COLUMNS, LOOKUPS
            );

            assert.deepStrictEqual(flatten(plan), [['todo', 'a', 'update']]);
        });

        it('shows one proposal per card and counts the rest', async () => {
            // A card carries a single accept/reject decision, so it must point
            // at exactly one proposal.
            const { buildPreviewPlan } = await import(MODULE_URL);
            const plan = buildPreviewPlan(
                [task('a', 'todo')],
                [
                    proposal('p1', 'update', 'a', { points: 8 }),
                    proposal('p2', 'delete', 'a')
                ],
                COLUMNS, LOOKUPS
            );

            const entry = plan.get('todo')[0];
            assert.strictEqual(entry.preview.kind, 'delete', 'delete should win — it is the most consequential');
            assert.strictEqual(entry.preview.proposalId, 'p2');
            assert.match(entry.preview.note, /\+1 more/);
        });
    });

    describe('describeProposal', () => {

        it('names the destination column for a move', async () => {
            const { describeProposal } = await import(MODULE_URL);
            const text = describeProposal(proposal('p', 'move', 'a', { newStatus: 'done' }), LOOKUPS);
            assert.strictEqual(text, 'would move to Done');
        });

        it('resolves epic and category ids to names', async () => {
            const { describeProposal } = await import(MODULE_URL);
            const text = describeProposal(
                proposal('p', 'update', 'a', { epicId: 'e1', category: 2 }), LOOKUPS
            );
            assert.match(text, /epic → ECOM/);
            assert.match(text, /category → Development/);
        });

        it('reads clearing a field as clearing, not as "→ null"', async () => {
            const { describeProposal } = await import(MODULE_URL);
            const text = describeProposal(
                proposal('p', 'update', 'a', { deadline: null, priority: false }), LOOKUPS
            );
            assert.match(text, /clear deadline/);
            assert.match(text, /clear priority/);
        });
    });

    describe('countPreviewedChanges', () => {

        it('counts each proposal once, even when it appears at both ends of a move', async () => {
            const { buildPreviewPlan, countPreviewedChanges } = await import(MODULE_URL);
            const plan = buildPreviewPlan(
                [task('a', 'todo'), task('b', 'todo')],
                [
                    proposal('p1', 'move', 'a', { newStatus: 'done' }),
                    proposal('p2', 'update', 'b', { points: 3 })
                ],
                COLUMNS, LOOKUPS
            );

            assert.strictEqual(countPreviewedChanges(plan), 2);
        });

        it('is zero for an untouched board', async () => {
            const { buildPreviewPlan, countPreviewedChanges } = await import(MODULE_URL);
            const plan = buildPreviewPlan([task('a', 'todo')], [], COLUMNS, LOOKUPS);
            assert.strictEqual(countPreviewedChanges(plan), 0);
        });
    });
});
