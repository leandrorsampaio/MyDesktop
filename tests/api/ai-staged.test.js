/**
 * API Integration tests for AI Staged Tasks endpoints.
 * Requires server running with: RATE_LIMIT_DISABLED=1 node server.js
 *
 * Covers only the CRUD + promote endpoints, NOT the /chat endpoint (which
 * requires a live AI provider). Chat is exercised manually via the UI.
 */

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs').promises;
const path = require('node:path');
const http = require('node:http');

const BASE_URL = 'http://localhost:3001';
const TEST_PROFILE = 'tests';
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const PROFILES_FILE = path.join(DATA_DIR, 'profiles.json');
const PROFILE_DIR = path.join(DATA_DIR, TEST_PROFILE);
const STAGED_FILE = path.join(PROFILE_DIR, 'ai-staged-tasks.json');
const TASKS_FILE = path.join(PROFILE_DIR, 'tasks.json');

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
const put = (p, b) => makeRequest('PUT', p, b);
const del = (p) => makeRequest('DELETE', p);

describe('AI Staged Tasks API', () => {
    before(async () => {
        await post('/api/profiles', { name: 'Tests', color: '#636E72', letters: 'TST' });
        await fs.mkdir(PROFILE_DIR, { recursive: true });
    });

    beforeEach(async () => {
        await resetTestProfileColumns();
        await fs.writeFile(STAGED_FILE, '[]');
        await fs.writeFile(TASKS_FILE, '[]');
    });

    // ---------------------------------------------
    // GET / POST / PUT / DELETE
    // ---------------------------------------------
    it('GET returns empty array when nothing staged', async () => {
        const res = await get(`/api/${TEST_PROFILE}/ai/staged`);
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(res.body, []);
    });

    it('POST creates a staged task with defaults', async () => {
        const res = await post(`/api/${TEST_PROFILE}/ai/staged`, { title: 'a thing' });
        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.title, 'a thing');
        assert.strictEqual(res.body.priority, false);
        assert.strictEqual(res.body.category, 1);
        assert.strictEqual(res.body.epicId, null);
        assert.strictEqual(res.body.description, '');
        assert.ok(res.body.id);
        assert.ok(res.body.createdDate);
    });

    it('POST 400 on missing title', async () => {
        const res = await post(`/api/${TEST_PROFILE}/ai/staged`, { description: 'no title' });
        assert.strictEqual(res.status, 400);
    });

    it('PUT updates fields', async () => {
        const created = await post(`/api/${TEST_PROFILE}/ai/staged`, { title: 'original' });
        const upd = await put(`/api/${TEST_PROFILE}/ai/staged/${created.body.id}`, {
            title: 'edited', priority: true
        });
        assert.strictEqual(upd.status, 200);
        assert.strictEqual(upd.body.title, 'edited');
        assert.strictEqual(upd.body.priority, true);
    });

    it('PUT 404 on non-existent staged task', async () => {
        const res = await put(`/api/${TEST_PROFILE}/ai/staged/nonexistent`, { title: 'x' });
        assert.strictEqual(res.status, 404);
    });

    it('DELETE removes the staged task', async () => {
        const created = await post(`/api/${TEST_PROFILE}/ai/staged`, { title: 'goner' });
        const res = await del(`/api/${TEST_PROFILE}/ai/staged/${created.body.id}`);
        assert.strictEqual(res.status, 200);
        const list = await get(`/api/${TEST_PROFILE}/ai/staged`);
        assert.strictEqual(list.body.length, 0);
    });

    it('DELETE 404 on non-existent', async () => {
        const res = await del(`/api/${TEST_PROFILE}/ai/staged/nonexistent`);
        assert.strictEqual(res.status, 404);
    });

    // ---------------------------------------------
    // Promote to backlog
    // ---------------------------------------------
    it('promote-backlog creates a real task in the backlog column', async () => {
        const created = await post(`/api/${TEST_PROFILE}/ai/staged`, {
            title: 'promote-me', description: 'desc', priority: true
        });
        const promote = await post(`/api/${TEST_PROFILE}/ai/staged/${created.body.id}/promote/backlog`);
        assert.strictEqual(promote.status, 200);
        assert.ok(promote.body.task);
        assert.strictEqual(promote.body.task.status, 'backlog', 'lands in backlog');
        assert.strictEqual(promote.body.task.position, 0, 'at position 0');
        assert.strictEqual(promote.body.task.title, 'promote-me');
        assert.strictEqual(promote.body.task.priority, true);
    });

    it('promote-backlog adds the "Added from AI Staging" log entry', async () => {
        const created = await post(`/api/${TEST_PROFILE}/ai/staged`, { title: 'log-test' });
        const promote = await post(`/api/${TEST_PROFILE}/ai/staged/${created.body.id}/promote/backlog`);
        const log = promote.body.task.log;
        assert.ok(Array.isArray(log) && log.length === 1);
        assert.match(log[0].action, /Added from AI Staging/);
    });

    it('promote-backlog removes the staged entry', async () => {
        const created = await post(`/api/${TEST_PROFILE}/ai/staged`, { title: 'remove-on-promote' });
        await post(`/api/${TEST_PROFILE}/ai/staged/${created.body.id}/promote/backlog`);
        const staged = await get(`/api/${TEST_PROFILE}/ai/staged`);
        assert.ok(!staged.body.find(t => t.id === created.body.id), 'staged entry removed');
    });

    it('promote-backlog shifts existing backlog tasks down by 1', async () => {
        // Pre-create a real task in backlog at position 0
        await post(`/api/${TEST_PROFILE}/tasks`, { title: 'existing-backlog', status: 'backlog' });

        const staged = await post(`/api/${TEST_PROFILE}/ai/staged`, { title: 'incoming' });
        await post(`/api/${TEST_PROFILE}/ai/staged/${staged.body.id}/promote/backlog`);

        const tasks = await get(`/api/${TEST_PROFILE}/tasks`);
        const backlog = tasks.body
            .filter(t => t.status === 'backlog')
            .sort((a, b) => a.position - b.position);
        assert.strictEqual(backlog.length, 2);
        assert.strictEqual(backlog[0].title, 'incoming', 'newcomer is first');
        assert.strictEqual(backlog[0].position, 0);
        assert.strictEqual(backlog[1].title, 'existing-backlog');
        assert.strictEqual(backlog[1].position, 1, 'pre-existing shifted to 1');
    });

    it('promote-backlog 404 on non-existent staged task', async () => {
        const res = await post(`/api/${TEST_PROFILE}/ai/staged/nonexistent/promote/backlog`);
        assert.strictEqual(res.status, 404);
    });

    // ---------------------------------------------
    // Promote to board
    // ---------------------------------------------
    it('promote-board creates a real task in the first non-backlog column', async () => {
        const created = await post(`/api/${TEST_PROFILE}/ai/staged`, { title: 'to-board' });
        const promote = await post(`/api/${TEST_PROFILE}/ai/staged/${created.body.id}/promote/board`);
        assert.strictEqual(promote.status, 200);
        assert.strictEqual(promote.body.task.status, 'todo', 'first non-backlog is "todo"');
        assert.strictEqual(promote.body.task.position, 0);
    });

    it('promote-board removes the staged entry', async () => {
        const created = await post(`/api/${TEST_PROFILE}/ai/staged`, { title: 'remove-on-board' });
        await post(`/api/${TEST_PROFILE}/ai/staged/${created.body.id}/promote/board`);
        const staged = await get(`/api/${TEST_PROFILE}/ai/staged`);
        assert.ok(!staged.body.find(t => t.id === created.body.id));
    });

    it('promote-board 404 on non-existent staged task', async () => {
        const res = await post(`/api/${TEST_PROFILE}/ai/staged/nonexistent/promote/board`);
        assert.strictEqual(res.status, 404);
    });
});
