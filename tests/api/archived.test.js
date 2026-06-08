/**
 * API Integration tests for the Archived restore endpoint.
 * Requires server running with: RATE_LIMIT_DISABLED=1 node server.js
 */

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs').promises;
const path = require('node:path');
const http = require('node:http');

const BASE_URL = 'http://localhost:3001';
const TEST_PROFILE = 'tests';
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const PROFILE_DIR = path.join(DATA_DIR, TEST_PROFILE);
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');
const TASKS_FILE = path.join(PROFILE_DIR, 'tasks.json');
const ARCHIVED_FILE = path.join(PROFILE_DIR, 'archived-tasks.json');

const DEFAULT_COLUMNS = [
    { id: 'todo',       name: 'To Do',       order: 0, hasArchive: false, isBacklog: false },
    { id: 'wait',       name: 'Wait',        order: 1, hasArchive: false, isBacklog: false },
    { id: 'inprogress', name: 'In Progress', order: 2, hasArchive: false, isBacklog: false },
    { id: 'done',       name: 'Done',        order: 3, hasArchive: true,  isBacklog: false },
    { id: 'backlog',    name: 'Backlog',     order: 4, hasArchive: false, isBacklog: true  }
];

async function resetTestProfileColumns() {
    const raw = await fs.readFile(PROFILES_FILE, 'utf8');
    const profiles = JSON.parse(raw);
    const tp = profiles.find(p => p.alias === TEST_PROFILE);
    if (!tp) return;
    tp.columns = JSON.parse(JSON.stringify(DEFAULT_COLUMNS));
    await fs.writeFile(PROFILES_FILE, JSON.stringify(profiles, null, 2));
}

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

describe('Archived API', () => {
    before(async () => {
        await post('/api/profiles', { name: 'Tests', color: '#636E72', letters: 'TST' });
        await fs.mkdir(PROFILE_DIR, { recursive: true });
    });

    beforeEach(async () => {
        // Defensive: restore default columns in case a previous test file
        // (e.g. columns.test.js) left the profile with non-default columns.
        await resetTestProfileColumns();
        await fs.writeFile(TASKS_FILE, '[]');
        await fs.writeFile(ARCHIVED_FILE, '[]');
    });

    // --------------------------------------------------
    // GET — list
    // --------------------------------------------------
    it('GET returns empty array when nothing archived', async () => {
        const res = await get(`/api/${TEST_PROFILE}/archived`);
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(res.body, []);
    });

    it('GET returns archived tasks after archive operation', async () => {
        const t = await post(`/api/${TEST_PROFILE}/tasks`, { title: 'will-archive' });
        await post(`/api/${TEST_PROFILE}/tasks/${t.body.id}/move`, {
            newStatus: 'done', newPosition: 0
        });
        await post(`/api/${TEST_PROFILE}/tasks/archive`);

        const res = await get(`/api/${TEST_PROFILE}/archived`);
        assert.strictEqual(res.body.length, 1);
        assert.strictEqual(res.body[0].status, 'archived');
    });

    // --------------------------------------------------
    // POST restore
    // --------------------------------------------------
    it('POST restore moves task back to first column at position 0', async () => {
        // Set up an archived task
        const t = await post(`/api/${TEST_PROFILE}/tasks`, { title: 'restore-me' });
        await post(`/api/${TEST_PROFILE}/tasks/${t.body.id}/move`, {
            newStatus: 'done', newPosition: 0
        });
        await post(`/api/${TEST_PROFILE}/tasks/archive`);

        const restoreRes = await post(`/api/${TEST_PROFILE}/archived/${t.body.id}/restore`);
        assert.strictEqual(restoreRes.status, 200);

        // Task is now in active tasks, status=todo (first column), position=0
        const active = await get(`/api/${TEST_PROFILE}/tasks`);
        const restored = active.body.find(x => x.id === t.body.id);
        assert.ok(restored, 'task is back in active list');
        assert.strictEqual(restored.status, 'todo', 'in first column');
        assert.strictEqual(restored.position, 0, 'at position 0');
    });

    it('POST restore appends "Restored to board" log entry', async () => {
        const t = await post(`/api/${TEST_PROFILE}/tasks`, { title: 'log-me' });
        await post(`/api/${TEST_PROFILE}/tasks/${t.body.id}/move`, {
            newStatus: 'done', newPosition: 0
        });
        await post(`/api/${TEST_PROFILE}/tasks/archive`);

        await post(`/api/${TEST_PROFILE}/archived/${t.body.id}/restore`);

        const active = await get(`/api/${TEST_PROFILE}/tasks`);
        const restored = active.body.find(x => x.id === t.body.id);
        const lastLog = restored.log[restored.log.length - 1];
        assert.match(lastLog.action, /Restored to board/);
    });

    it('POST restore removes task from archived list', async () => {
        const t = await post(`/api/${TEST_PROFILE}/tasks`, { title: 'remove-me' });
        await post(`/api/${TEST_PROFILE}/tasks/${t.body.id}/move`, {
            newStatus: 'done', newPosition: 0
        });
        await post(`/api/${TEST_PROFILE}/tasks/archive`);

        await post(`/api/${TEST_PROFILE}/archived/${t.body.id}/restore`);

        const archived = await get(`/api/${TEST_PROFILE}/archived`);
        assert.ok(!archived.body.find(x => x.id === t.body.id), 'gone from archived');
    });

    it('POST restore shifts existing first-column tasks down to make room', async () => {
        // Create existing tasks in 'todo' (positions 0,1,2), then restore one
        await post(`/api/${TEST_PROFILE}/tasks`, { title: 'pre1' });
        await post(`/api/${TEST_PROFILE}/tasks`, { title: 'pre2' });
        await post(`/api/${TEST_PROFILE}/tasks`, { title: 'pre3' });
        const positionsBefore = (await get(`/api/${TEST_PROFILE}/tasks`)).body
            .filter(t => t.status === 'todo')
            .sort((a, b) => a.position - b.position)
            .map(t => t.position);
        assert.deepStrictEqual(positionsBefore, [0, 1, 2]);

        // Archive a separate task and restore it
        const t = await post(`/api/${TEST_PROFILE}/tasks`, { title: 'will-restore' });
        await post(`/api/${TEST_PROFILE}/tasks/${t.body.id}/move`, {
            newStatus: 'done', newPosition: 0
        });
        await post(`/api/${TEST_PROFILE}/tasks/archive`);
        await post(`/api/${TEST_PROFILE}/archived/${t.body.id}/restore`);

        // Restored task is position 0, pre-existing ones are shifted to 1,2,3
        const todoNow = (await get(`/api/${TEST_PROFILE}/tasks`)).body
            .filter(x => x.status === 'todo')
            .sort((a, b) => a.position - b.position);
        assert.strictEqual(todoNow[0].id, t.body.id, 'restored is first');
        assert.strictEqual(todoNow[0].position, 0);
        // After shift, the others should have positions 1,2,3 (in some order)
        const otherPositions = todoNow.slice(1).map(x => x.position).sort();
        assert.deepStrictEqual(otherPositions, [1, 2, 3]);
    });

    it('POST restore 404 for non-existent archived task', async () => {
        const res = await post(`/api/${TEST_PROFILE}/archived/nonexistent123/restore`);
        assert.strictEqual(res.status, 404);
    });
});
