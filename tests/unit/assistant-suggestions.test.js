/**
 * Unit tests for the assistant's board-derived opening suggestions
 * (Phase 6 of docs/design/AI_ASSISTANT.md).
 *
 * These are the empty state that replaces "ask me anything". They are computed
 * from local data with no AI call, which is what lets them render with the
 * assistant switched off — so they are worth testing without a browser.
 *
 * Run with: node --test tests/unit/assistant-suggestions.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const MODULE_URL = pathToFileURL(
    path.join(__dirname, '..', '..', 'public', 'js', 'assistant-suggestions.js')
).href;

const NOW = Date.parse('2026-08-29T12:00:00.000Z');
const DAY = 86400000;

const COLUMNS = [
    { id: 'todo',       name: 'To Do',       order: 0, isBacklog: false, hasArchive: false },
    { id: 'inprogress', name: 'In Progress', order: 1, isBacklog: false, hasArchive: false },
    { id: 'done',       name: 'Done',        order: 2, isBacklog: false, hasArchive: true  },
    { id: 'backlog',    name: 'Backlog',     order: 3, isBacklog: true,  hasArchive: false }
];

function task(overrides = {}) {
    return {
        id: `t${Math.random().toString(36).slice(2, 7)}`,
        title: 'A task',
        status: 'todo',
        position: 0,
        createdDate: new Date(NOW - DAY).toISOString(),
        log: [],
        ...overrides
    };
}

const ids = (list) => list.map(s => s.id);

describe('assistant-suggestions', () => {

    describe('buildSuggestions', () => {

        it('says nothing alarming about a small, tidy board', async () => {
            // Two fresh cards and nothing in progress: the only thing worth
            // saying is "pick something to work on".
            const { buildSuggestions } = await import(MODULE_URL);
            const result = buildSuggestions([task(), task()], COLUMNS, { now: NOW });
            assert.deepStrictEqual(ids(result), ['empty-doing']);
        });

        it('returns nothing at all for an empty board', async () => {
            // "Pick today's work" with nothing to pick is worse than silence.
            const { buildSuggestions } = await import(MODULE_URL);
            assert.deepStrictEqual(buildSuggestions([], COLUMNS, { now: NOW }), []);
        });

        it('flags overdue cards first', async () => {
            const { buildSuggestions } = await import(MODULE_URL);
            const result = buildSuggestions(
                [task({ deadline: new Date(NOW - 2 * DAY).toISOString() })],
                COLUMNS, { now: NOW }
            );
            assert.strictEqual(result[0].id, 'overdue');
            assert.match(result[0].fact, /1 card past its deadline/);
            assert.ok(result[0].prompt.length > 0, 'no prompt to send');
        });

        it('gets the singular/plural right', async () => {
            const { buildSuggestions } = await import(MODULE_URL);
            const two = buildSuggestions([
                task({ deadline: new Date(NOW - DAY).toISOString() }),
                task({ deadline: new Date(NOW - 3 * DAY).toISOString() })
            ], COLUMNS, { now: NOW });
            assert.match(two[0].fact, /2 cards past their deadline/);
        });

        it('flags deadlines inside the next week, but not beyond it', async () => {
            const { buildSuggestions } = await import(MODULE_URL);
            const soon = buildSuggestions(
                [task({ deadline: new Date(NOW + 3 * DAY).toISOString() })],
                COLUMNS, { now: NOW }
            );
            assert.ok(ids(soon).includes('deadlines'));

            const far = buildSuggestions(
                [task({ deadline: new Date(NOW + 30 * DAY).toISOString() })],
                COLUMNS, { now: NOW }
            );
            assert.ok(!ids(far).includes('deadlines'));
        });

        it('flags stale cards using the newest sign of life, not just creation', async () => {
            const { buildSuggestions } = await import(MODULE_URL);

            const old = task({ createdDate: new Date(NOW - 40 * DAY).toISOString() });
            assert.ok(ids(buildSuggestions([old], COLUMNS, { now: NOW })).includes('stale'));

            // Same card, but moved yesterday — no longer stale.
            const touched = task({
                createdDate: new Date(NOW - 40 * DAY).toISOString(),
                log: [{ date: new Date(NOW - DAY).toISOString(), action: 'Moved' }]
            });
            assert.ok(!ids(buildSuggestions([touched], COLUMNS, { now: NOW })).includes('stale'));
        });

        it('flags unfiled captures', async () => {
            const { buildSuggestions } = await import(MODULE_URL);
            const result = buildSuggestions([task({ needsFiling: true })], COLUMNS, { now: NOW });
            assert.ok(ids(result).includes('unfiled'));
        });

        it('only mentions missing epics once there are enough to matter', async () => {
            const { buildSuggestions } = await import(MODULE_URL);
            const two = buildSuggestions([task(), task()], COLUMNS, { now: NOW });
            assert.ok(!ids(two).includes('no-epic'));

            const four = buildSuggestions([task(), task(), task(), task()], COLUMNS, { now: NOW });
            assert.ok(ids(four).includes('no-epic'));
        });

        it('ignores the backlog and archive columns when judging the board', async () => {
            // A stale backlog item is a different conversation from a stale
            // card sitting in the working columns.
            const { buildSuggestions } = await import(MODULE_URL);
            const result = buildSuggestions([
                task({ status: 'backlog', createdDate: new Date(NOW - 40 * DAY).toISOString() }),
                task({ status: 'done', createdDate: new Date(NOW - 40 * DAY).toISOString() })
            ], COLUMNS, { now: NOW });

            assert.ok(!ids(result).includes('stale'));
        });

        it('notices a long-untouched backlog separately', async () => {
            const { buildSuggestions } = await import(MODULE_URL);
            const result = buildSuggestions(
                [task({ status: 'backlog', createdDate: new Date(NOW - 200 * DAY).toISOString() })],
                COLUMNS, { now: NOW }
            );
            assert.ok(ids(result).includes('backlog'));
            assert.match(result.find(s => s.id === 'backlog').fact, /200 days/);
        });

        it('notices an empty in-progress column', async () => {
            const { buildSuggestions } = await import(MODULE_URL);
            const result = buildSuggestions([task({ status: 'todo' })], COLUMNS, { now: NOW });
            assert.ok(ids(result).includes('empty-doing'));
        });

        it('says nothing about in-progress when something is in it', async () => {
            const { buildSuggestions } = await import(MODULE_URL);
            const result = buildSuggestions([task({ status: 'inprogress' })], COLUMNS, { now: NOW });
            assert.ok(!ids(result).includes('empty-doing'));
        });

        it('caps the list, so the empty state never reads as a to-do list', async () => {
            const { buildSuggestions, MAX_SUGGESTIONS } = await import(MODULE_URL);
            const busy = [
                task({ deadline: new Date(NOW - DAY).toISOString() }),
                task({ deadline: new Date(NOW + DAY).toISOString() }),
                task({ createdDate: new Date(NOW - 40 * DAY).toISOString() }),
                task({ needsFiling: true }),
                task({ status: 'backlog', createdDate: new Date(NOW - 90 * DAY).toISOString() })
            ];
            assert.strictEqual(buildSuggestions(busy, COLUMNS, { now: NOW }).length, MAX_SUGGESTIONS);
        });

        it('gives every suggestion a fact, an action and a prompt', async () => {
            const { buildSuggestions } = await import(MODULE_URL);
            const result = buildSuggestions(
                [task({ deadline: new Date(NOW - DAY).toISOString(), needsFiling: true })],
                COLUMNS, { now: NOW }
            );
            for (const s of result) {
                assert.ok(s.id && s.fact && s.action && s.prompt, `incomplete suggestion: ${JSON.stringify(s)}`);
            }
        });
    });

    describe('daysSinceActivity', () => {

        it('measures from the newest log entry when there is one', async () => {
            const { daysSinceActivity } = await import(MODULE_URL);
            const t = task({
                createdDate: new Date(NOW - 40 * DAY).toISOString(),
                log: [
                    { date: new Date(NOW - 30 * DAY).toISOString(), action: 'a' },
                    { date: new Date(NOW - 5 * DAY).toISOString(), action: 'b' }
                ]
            });
            assert.strictEqual(daysSinceActivity(t, NOW), 5);
        });

        it('falls back to the creation date', async () => {
            const { daysSinceActivity } = await import(MODULE_URL);
            assert.strictEqual(
                daysSinceActivity(task({ createdDate: new Date(NOW - 9 * DAY).toISOString() }), NOW),
                9
            );
        });

        it('treats an undated task as fresh rather than infinitely stale', async () => {
            const { daysSinceActivity } = await import(MODULE_URL);
            assert.strictEqual(daysSinceActivity({ id: 'x' }, NOW), 0);
        });
    });
});
