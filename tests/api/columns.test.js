/**
 * API Integration tests for Columns endpoints
 * Requires server running with: RATE_LIMIT_DISABLED=1 node server.js
 *
 * These tests mutate the tests profile's columns array. `beforeEach`
 * resets the columns to DEFAULT_COLUMNS by editing profiles.json directly
 * (no "reset profile" API endpoint exists).
 */

const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs').promises;
const path = require('node:path');
const http = require('node:http');

const BASE_URL = 'http://localhost:3001';
const TEST_PROFILE = 'tests';
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');
const PROFILE_DIR = path.join(DATA_DIR, TEST_PROFILE);
const TASKS_FILE = path.join(PROFILE_DIR, 'tasks.json');

const DEFAULT_COLUMNS = [
    { id: 'todo',       name: 'To Do',       order: 0, hasArchive: false, isBacklog: false },
    { id: 'wait',       name: 'Wait',        order: 1, hasArchive: false, isBacklog: false },
    { id: 'inprogress', name: 'In Progress', order: 2, hasArchive: false, isBacklog: false },
    { id: 'done',       name: 'Done',        order: 3, hasArchive: true,  isBacklog: false },
    { id: 'backlog',    name: 'Backlog',     order: 4, hasArchive: false, isBacklog: true  }
];

function makeRequest(method, urlPath, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlPath, BASE_URL);
        const options = {
            hostname: url.hostname, port: url.port, path: url.pathname,
            method, headers: { 'Content-Type': 'application/json' }
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                let parsedBody = null;
                try { parsedBody = data ? JSON.parse(data) : null; } catch { parsedBody = data; }
                resolve({ status: res.statusCode, body: parsedBody });
            });
        });
        req.on('error', e => e.code === 'ECONNREFUSED'
            ? reject(new Error('Server not running'))
            : reject(e));
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}
const get = (p) => makeRequest('GET', p);
const post = (p, b) => makeRequest('POST', p, b);
const put = (p, b) => makeRequest('PUT', p, b);
const del = (p) => makeRequest('DELETE', p);

async function resetTestProfileColumns() {
    const raw = await fs.readFile(PROFILES_FILE, 'utf8');
    const profiles = JSON.parse(raw);
    const tp = profiles.find(p => p.alias === TEST_PROFILE);
    if (!tp) throw new Error('tests profile missing — run another test file first to create it');
    tp.columns = JSON.parse(JSON.stringify(DEFAULT_COLUMNS));   // deep copy
    await fs.writeFile(PROFILES_FILE, JSON.stringify(profiles, null, 2));
}

describe('Columns API', () => {
    before(async () => {
        await post('/api/profiles', { name: 'Tests', color: '#636E72', letters: 'TST' });
        await fs.mkdir(PROFILE_DIR, { recursive: true });
    });

    beforeEach(async () => {
        await resetTestProfileColumns();
        await fs.writeFile(TASKS_FILE, '[]');
    });

    // Final reset so columns are back to default for any test file that
    // runs after this one. (npm test runs files alphabetically, so other
    // files in the suite are safe; but direct re-runs can leak state.)
    after(async () => {
        await resetTestProfileColumns();
    });

    // -------------------------------------------
    // GET
    // -------------------------------------------
    it('GET returns columns sorted by order', async () => {
        const res = await get(`/api/${TEST_PROFILE}/columns`);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.length, 5);
        assert.strictEqual(res.body[0].id, 'todo');
        assert.strictEqual(res.body[4].id, 'backlog');
    });

    it('GET includes the permanent backlog column', async () => {
        const res = await get(`/api/${TEST_PROFILE}/columns`);
        const backlog = res.body.find(c => c.isBacklog === true);
        assert.ok(backlog, 'backlog column exists');
    });

    // -------------------------------------------
    // POST — create
    // -------------------------------------------
    it('POST creates a non-backlog column by default', async () => {
        const res = await post(`/api/${TEST_PROFILE}/columns`, { name: 'Blocked' });
        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.name, 'Blocked');
        assert.strictEqual(res.body.isBacklog, false);
        assert.strictEqual(res.body.hasArchive, false);
        assert.ok(res.body.id, 'has id');
    });

    it('POST rejects empty name', async () => {
        const res = await post(`/api/${TEST_PROFILE}/columns`, { name: '   ' });
        assert.strictEqual(res.status, 400);
    });

    // -------------------------------------------
    // PUT — single column rename + flags
    // -------------------------------------------
    it('PUT updates name', async () => {
        const res = await put(`/api/${TEST_PROFILE}/columns/todo`, { name: 'To Tackle' });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.name, 'To Tackle');
    });

    it('PUT updates hasArchive flag', async () => {
        const res = await put(`/api/${TEST_PROFILE}/columns/wait`, { hasArchive: true });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.hasArchive, true);
    });

    it('PUT 404 on non-existent column id', async () => {
        const res = await put(`/api/${TEST_PROFILE}/columns/nonexistent`, { name: 'X' });
        assert.strictEqual(res.status, 404);
    });

    // -------------------------------------------
    // PUT (collection) — reorder
    // -------------------------------------------
    it('PUT (no id) reorders columns', async () => {
        const reordered = [
            { ...DEFAULT_COLUMNS[3], order: 0 },   // done first
            { ...DEFAULT_COLUMNS[0], order: 1 },
            { ...DEFAULT_COLUMNS[1], order: 2 },
            { ...DEFAULT_COLUMNS[2], order: 3 },
            { ...DEFAULT_COLUMNS[4], order: 4 }    // backlog last
        ];
        const res = await put(`/api/${TEST_PROFILE}/columns`, { columns: reordered });
        assert.strictEqual(res.status, 200);
        const list = await get(`/api/${TEST_PROFILE}/columns`);
        assert.strictEqual(list.body[0].id, 'done');
    });

    it('PUT (collection) rejects unknown column id', async () => {
        const res = await put(`/api/${TEST_PROFILE}/columns`, {
            columns: [{ id: 'doesnotexist', name: 'X', order: 0 }]
        });
        assert.strictEqual(res.status, 400);
    });

    // ----- Regression: reorder with a subset silently dropped columns -----
    it('PUT (collection) rejects a reorder missing existing columns', async () => {
        // Send only 2 of the 5 columns — accepting this would permanently
        // delete the other 3 (including the permanent backlog column)
        const res = await put(`/api/${TEST_PROFILE}/columns`, {
            columns: [
                { ...DEFAULT_COLUMNS[0], order: 0 },
                { ...DEFAULT_COLUMNS[1], order: 1 }
            ]
        });
        assert.strictEqual(res.status, 400);
        // Verify nothing was dropped
        const list = await get(`/api/${TEST_PROFILE}/columns`);
        assert.strictEqual(list.body.length, 5, 'all 5 columns still present');
    });

    it('PUT (collection) rejects duplicate column ids', async () => {
        // Duplicates could pad the count to pass a naive length check while
        // still dropping a column
        const res = await put(`/api/${TEST_PROFILE}/columns`, {
            columns: [
                { ...DEFAULT_COLUMNS[0], order: 0 },
                { ...DEFAULT_COLUMNS[0], order: 1 },
                { ...DEFAULT_COLUMNS[1], order: 2 },
                { ...DEFAULT_COLUMNS[2], order: 3 },
                { ...DEFAULT_COLUMNS[3], order: 4 }
            ]
        });
        assert.strictEqual(res.status, 400);
    });

    // ----- Regression: isBacklog was freely toggleable, breaking the
    // single-backlog invariant (resolveProfile would then push a second
    // column with id "backlog") -----
    it('PUT rejects unsetting isBacklog on the backlog column', async () => {
        const res = await put(`/api/${TEST_PROFILE}/columns/backlog`, { isBacklog: false });
        assert.strictEqual(res.status, 400);
    });

    it('PUT rejects setting isBacklog on a board column', async () => {
        const res = await put(`/api/${TEST_PROFILE}/columns/todo`, { isBacklog: true });
        assert.strictEqual(res.status, 400);
    });

    it('PUT accepts an unchanged isBacklog value alongside other fields', async () => {
        const res = await put(`/api/${TEST_PROFILE}/columns/todo`, { name: 'Renamed', isBacklog: false });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.name, 'Renamed');
    });

    it('POST rejects a second backlog column', async () => {
        const res = await post(`/api/${TEST_PROFILE}/columns`, { name: 'Backlog 2', isBacklog: true });
        assert.strictEqual(res.status, 400);
    });

    // -------------------------------------------
    // DELETE
    // -------------------------------------------
    it('DELETE removes a column', async () => {
        const res = await del(`/api/${TEST_PROFILE}/columns/wait`);
        assert.strictEqual(res.status, 200);
        const list = await get(`/api/${TEST_PROFILE}/columns`);
        assert.ok(!list.body.find(c => c.id === 'wait'), 'wait column gone');
    });

    it('DELETE rejects backlog column (SPEC: permanent)', async () => {
        const res = await del(`/api/${TEST_PROFILE}/columns/backlog`);
        assert.strictEqual(res.status, 400);
    });

    it('DELETE 404 on non-existent column', async () => {
        const res = await del(`/api/${TEST_PROFILE}/columns/nonexistent`);
        assert.strictEqual(res.status, 404);
    });

    it('DELETE moves tasks to first non-backlog column with log entry', async () => {
        // Create a task in "wait" column, then delete that column
        const t = await post(`/api/${TEST_PROFILE}/tasks`, { title: 'in-wait' });
        await post(`/api/${TEST_PROFILE}/tasks/${t.body.id}/move`, {
            newStatus: 'wait', newPosition: 0
        });

        await del(`/api/${TEST_PROFILE}/columns/wait`);

        const tasks = await get(`/api/${TEST_PROFILE}/tasks`);
        const moved = tasks.body.find(x => x.id === t.body.id);
        assert.strictEqual(moved.status, 'todo', 'moved to first (todo)');
        const lastLog = moved.log[moved.log.length - 1];
        assert.match(lastLog.action, /Column 'Wait' deleted/);
    });

    // ----- Regression: Phase A bug #5 (movedCount overcounts) -----
    it('DELETE response movedCount counts ONLY moved tasks, not pre-existing ones', async () => {
        // Pre-populate todo with 2 tasks, then create 3 in wait and delete wait
        const pre1 = await post(`/api/${TEST_PROFILE}/tasks`, { title: 'pre1' }); // status=todo
        const pre2 = await post(`/api/${TEST_PROFILE}/tasks`, { title: 'pre2' }); // status=todo

        const t1 = await post(`/api/${TEST_PROFILE}/tasks`, { title: 't1' });
        const t2 = await post(`/api/${TEST_PROFILE}/tasks`, { title: 't2' });
        const t3 = await post(`/api/${TEST_PROFILE}/tasks`, { title: 't3' });
        for (const t of [t1, t2, t3]) {
            await post(`/api/${TEST_PROFILE}/tasks/${t.body.id}/move`, {
                newStatus: 'wait', newPosition: 0
            });
        }

        const res = await del(`/api/${TEST_PROFILE}/columns/wait`);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.movedCount, 3, 'movedCount is the 3 from wait, not 5');
    });

    // ----- Regression: Phase A bug #9 (last-non-backlog guard) -----
    it('DELETE rejects deleting the last non-backlog column', async () => {
        // Default columns: todo, wait, inprogress, done, backlog
        // Delete down to just one non-backlog + backlog, then the next delete should fail.
        await del(`/api/${TEST_PROFILE}/columns/wait`);
        await del(`/api/${TEST_PROFILE}/columns/inprogress`);
        await del(`/api/${TEST_PROFILE}/columns/done`);
        // Now only todo + backlog remain.
        const res = await del(`/api/${TEST_PROFILE}/columns/todo`);
        assert.strictEqual(res.status, 400, 'deleting last non-backlog column should 400');
    });
});
