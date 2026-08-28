/**
 * API Integration tests for the AI proposed-changes review buffer
 * (Phase 4 of docs/design/AI_ASSISTANT.md).
 *
 * The contract under test: nothing the AI proposes reaches the board without
 * an explicit apply, applying re-validates against current state, and stale
 * proposals are discarded rather than silently applied to the wrong thing.
 *
 * IMPORTANT: requires the server running in test mode:
 *   Terminal 1: RATE_LIMIT_DISABLED=1 node server.js
 *   Terminal 2: node --test tests/api/proposals.test.js
 */

const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs').promises;
const path = require('node:path');
const http = require('node:http');

const BASE_URL = 'http://localhost:3001';
const TEST_PROFILE = 'tests';
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const PROFILE_DIR = path.join(DATA_DIR, TEST_PROFILE);
const TASKS_FILE = path.join(PROFILE_DIR, 'tasks.json');
const PROPOSALS_FILE = path.join(PROFILE_DIR, 'ai-proposals.json');

function makeRequest(method, urlPath, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlPath, BASE_URL);
        const req = http.request({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method,
            headers: { 'Content-Type': 'application/json' }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsedBody = null;
                try { parsedBody = data ? JSON.parse(data) : null; } catch { parsedBody = data; }
                resolve({ status: res.statusCode, body: parsedBody });
            });
        });
        req.on('error', (error) => {
            if (error.code === 'ECONNREFUSED') {
                reject(new Error('Connection refused. Start the server with: RATE_LIMIT_DISABLED=1 node server.js'));
            } else {
                reject(error);
            }
        });
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

const get = (p) => makeRequest('GET', p);
const post = (p, body) => makeRequest('POST', p, body);
const del = (p) => makeRequest('DELETE', p);

/** Writes proposals straight to disk — the buffer is normally filled by the AI. */
async function seedProposals(list) {
    await fs.writeFile(PROPOSALS_FILE, JSON.stringify(list, null, 2));
}

function proposal(overrides) {
    return {
        id: `p-${Math.random().toString(36).slice(2, 8)}`,
        kind: 'update',
        taskId: 'replace-me',
        reason: 'because',
        payload: {},
        createdAt: new Date().toISOString(),
        ...overrides
    };
}

describe('AI proposals API', () => {
    let originalTasks;
    let originalProposals;
    let taskId;

    before(async () => {
        await post('/api/profiles', { name: 'Tests', color: '#636E72', letters: 'TST' });
        await fs.mkdir(PROFILE_DIR, { recursive: true });
        try { originalTasks = await fs.readFile(TASKS_FILE, 'utf8'); } catch { originalTasks = '[]'; }
        try { originalProposals = await fs.readFile(PROPOSALS_FILE, 'utf8'); } catch { originalProposals = null; }
    });

    beforeEach(async () => {
        await fs.writeFile(TASKS_FILE, '[]');
        await seedProposals([]);
        const created = await post(`/api/${TEST_PROFILE}/tasks`, { title: 'Refactor auth', points: 3 });
        taskId = created.body.id;
    });

    after(async () => {
        await fs.writeFile(TASKS_FILE, originalTasks);
        if (originalProposals === null) await fs.rm(PROPOSALS_FILE, { force: true });
        else await fs.writeFile(PROPOSALS_FILE, originalProposals);
    });

    describe('GET /api/tests/ai/proposals', () => {

        it('starts empty', async () => {
            const res = await get(`/api/${TEST_PROFILE}/ai/proposals`);
            assert.strictEqual(res.status, 200);
            assert.deepStrictEqual(res.body, []);
        });

        it('returns what is pending', async () => {
            await seedProposals([proposal({ id: 'p1', taskId, payload: { points: 8 } })]);
            const res = await get(`/api/${TEST_PROFILE}/ai/proposals`);
            assert.strictEqual(res.body.length, 1);
            assert.strictEqual(res.body[0].id, 'p1');
        });
    });

    describe('Applying', () => {

        it('applies an update and consumes the proposal', async () => {
            await seedProposals([proposal({ id: 'p1', taskId, payload: { points: 8, priority: true } })]);

            const res = await post(`/api/${TEST_PROFILE}/ai/proposals/p1/apply`);
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.task.points, 8);
            assert.strictEqual(res.body.task.priority, true);

            const pending = await get(`/api/${TEST_PROFILE}/ai/proposals`);
            assert.strictEqual(pending.body.length, 0, 'proposal was not consumed');
        });

        it('applies a move and logs it the way a hand move does', async () => {
            await seedProposals([proposal({ id: 'p1', kind: 'move', taskId, payload: { newStatus: 'inprogress' } })]);

            const res = await post(`/api/${TEST_PROFILE}/ai/proposals/p1/apply`);
            assert.strictEqual(res.body.task.status, 'inprogress');
            assert.strictEqual(res.body.task.position, 0);
            assert.match(res.body.task.log.at(-1).action, /Moved from 'To Do' to 'In Progress'/);
        });

        it('applies a delete', async () => {
            await seedProposals([proposal({ id: 'p1', kind: 'delete', taskId })]);

            const res = await post(`/api/${TEST_PROFILE}/ai/proposals/p1/apply`);
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.task, null);

            const tasks = await get(`/api/${TEST_PROFILE}/tasks`);
            assert.strictEqual(tasks.body.length, 0);
        });

        it('logs a category change, matching the hand-driven PUT route', async () => {
            await seedProposals([proposal({ id: 'p1', taskId, payload: { category: 2 } })]);
            const res = await post(`/api/${TEST_PROFILE}/ai/proposals/p1/apply`);
            assert.match(res.body.task.log.at(-1).action, /Category changed from/);
        });

        it('404s for an unknown proposal', async () => {
            const res = await post(`/api/${TEST_PROFILE}/ai/proposals/nope/apply`);
            assert.strictEqual(res.status, 404);
        });

        it('discards a proposal whose task has since been deleted', async () => {
            // The buffer can outlive the board state it was written against.
            // A stale proposal must not silently apply to the wrong thing.
            await seedProposals([proposal({ id: 'p1', taskId: 'long-gone', payload: { points: 8 } })]);

            const res = await post(`/api/${TEST_PROFILE}/ai/proposals/p1/apply`);
            assert.strictEqual(res.status, 409);
            assert.strictEqual(res.body.discarded, true);

            const pending = await get(`/api/${TEST_PROFILE}/ai/proposals`);
            assert.strictEqual(pending.body.length, 0, 'stale proposal left in the buffer');
        });

        it('re-validates at apply time, not just when stored', async () => {
            // A hand-edited or outdated payload must be caught by the same
            // validators the ordinary routes use.
            await seedProposals([proposal({ id: 'p1', taskId, payload: { points: 21 } })]);
            const res = await post(`/api/${TEST_PROFILE}/ai/proposals/p1/apply`);

            assert.strictEqual(res.status, 409);
            const tasks = await get(`/api/${TEST_PROFILE}/tasks`);
            assert.strictEqual(tasks.body[0].points, 3, 'invalid value was written to the task');
        });

        it('refuses a move to a column that does not exist', async () => {
            await seedProposals([proposal({ id: 'p1', kind: 'move', taskId, payload: { newStatus: 'nowhere' } })]);
            const res = await post(`/api/${TEST_PROFILE}/ai/proposals/p1/apply`);
            assert.strictEqual(res.status, 409);
        });
    });

    describe('Apply all', () => {

        it('applies every proposal and empties the buffer', async () => {
            await seedProposals([
                proposal({ id: 'p1', taskId, payload: { points: 8 } }),
                proposal({ id: 'p2', kind: 'move', taskId, payload: { newStatus: 'inprogress' } })
            ]);

            const res = await post(`/api/${TEST_PROFILE}/ai/proposals/apply-all`);
            assert.strictEqual(res.body.applied, 2);
            assert.deepStrictEqual(res.body.failed, []);

            const tasks = await get(`/api/${TEST_PROFILE}/tasks`);
            assert.strictEqual(tasks.body[0].points, 8);
            assert.strictEqual(tasks.body[0].status, 'inprogress');

            const pending = await get(`/api/${TEST_PROFILE}/ai/proposals`);
            assert.strictEqual(pending.body.length, 0);
        });

        it('reports failures without aborting the rest of the batch', async () => {
            await seedProposals([
                proposal({ id: 'bad',  taskId: 'long-gone', payload: { points: 8 } }),
                proposal({ id: 'good', taskId, payload: { priority: true } })
            ]);

            const res = await post(`/api/${TEST_PROFILE}/ai/proposals/apply-all`);
            assert.strictEqual(res.body.applied, 1);
            assert.strictEqual(res.body.failed.length, 1);
            assert.strictEqual(res.body.failed[0].id, 'bad');

            const tasks = await get(`/api/${TEST_PROFILE}/tasks`);
            assert.strictEqual(tasks.body[0].priority, true, 'the good proposal did not apply');
        });

        it('is a no-op on an empty buffer', async () => {
            const res = await post(`/api/${TEST_PROFILE}/ai/proposals/apply-all`);
            assert.strictEqual(res.body.applied, 0);
        });
    });

    describe('Rejecting', () => {

        it('removes one proposal without touching the board', async () => {
            await seedProposals([proposal({ id: 'p1', kind: 'delete', taskId })]);

            const res = await del(`/api/${TEST_PROFILE}/ai/proposals/p1`);
            assert.strictEqual(res.status, 200);

            const tasks = await get(`/api/${TEST_PROFILE}/tasks`);
            assert.strictEqual(tasks.body.length, 1, 'rejecting a delete removed the task anyway');

            const pending = await get(`/api/${TEST_PROFILE}/ai/proposals`);
            assert.strictEqual(pending.body.length, 0);
        });

        it('404s for an unknown proposal', async () => {
            const res = await del(`/api/${TEST_PROFILE}/ai/proposals/nope`);
            assert.strictEqual(res.status, 404);
        });

        it('clears the whole buffer, leaving the board alone', async () => {
            await seedProposals([
                proposal({ id: 'p1', kind: 'delete', taskId }),
                proposal({ id: 'p2', taskId, payload: { points: 13 } })
            ]);

            await del(`/api/${TEST_PROFILE}/ai/proposals`);

            const pending = await get(`/api/${TEST_PROFILE}/ai/proposals`);
            assert.strictEqual(pending.body.length, 0);

            const tasks = await get(`/api/${TEST_PROFILE}/tasks`);
            assert.strictEqual(tasks.body.length, 1);
            assert.strictEqual(tasks.body[0].points, 3, 'a rejected proposal was applied');
        });
    });

    describe('The propose-first guarantee', () => {

        it('a proposal sitting in the buffer changes nothing on its own', async () => {
            // The core promise of the whole feature: the AI writes here, and
            // only a human click moves anything to the board.
            await seedProposals([
                proposal({ id: 'p1', kind: 'delete', taskId }),
                proposal({ id: 'p2', kind: 'move', taskId, payload: { newStatus: 'done' } }),
                proposal({ id: 'p3', taskId, payload: { title: 'Renamed by the AI', points: 13 } })
            ]);

            const tasks = await get(`/api/${TEST_PROFILE}/tasks`);
            assert.strictEqual(tasks.body.length, 1);
            assert.strictEqual(tasks.body[0].title, 'Refactor auth');
            assert.strictEqual(tasks.body[0].points, 3);
            assert.strictEqual(tasks.body[0].status, 'todo');
        });
    });
});
