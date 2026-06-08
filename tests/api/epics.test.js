/**
 * API Integration tests for Epics endpoints
 * Requires server running with: RATE_LIMIT_DISABLED=1 node server.js
 * Uses the dedicated "tests" profile.
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
const EPICS_FILE = path.join(PROFILE_DIR, 'epics.json');
const TASKS_FILE = path.join(PROFILE_DIR, 'tasks.json');
const ARCHIVED_FILE = path.join(PROFILE_DIR, 'archived-tasks.json');

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

const PALETTE = [
    '#E74C3C', '#FF6F61', '#E67E22', '#F5A623', '#F1C40F', '#A8D84E',
    '#2ECC71', '#00B894', '#1ABC9C', '#00CEC9', '#54A0FF', '#2E86DE',
    '#3742FA', '#5758BB', '#8E44AD', '#B24BDB', '#E84393', '#FD79A8',
    '#636E72', '#2D3436'
];

describe('Epics API', () => {
    before(async () => {
        await post('/api/profiles', { name: 'Tests', color: '#636E72', letters: 'TST' });
        await fs.mkdir(PROFILE_DIR, { recursive: true });
    });

    beforeEach(async () => {
        await fs.writeFile(EPICS_FILE, '[]');
        await fs.writeFile(TASKS_FILE, '[]');
        await fs.writeFile(ARCHIVED_FILE, '[]');
    });

    // -------------------------------------------------
    // GET / POST / PUT / DELETE happy paths
    // -------------------------------------------------
    it('GET returns empty array when no epics', async () => {
        const res = await get(`/api/${TEST_PROFILE}/epics`);
        assert.strictEqual(res.status, 200);
        assert.deepStrictEqual(res.body, []);
    });

    it('POST creates an epic with derived alias', async () => {
        const res = await post(`/api/${TEST_PROFILE}/epics`, {
            name: 'Q3 Push',
            color: PALETTE[0]
        });
        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.name, 'Q3 Push');
        assert.strictEqual(res.body.alias, 'q3Push');
        assert.strictEqual(res.body.color, PALETTE[0]);
        assert.ok(res.body.id);
    });

    it('POST rejects duplicate color', async () => {
        await post(`/api/${TEST_PROFILE}/epics`, { name: 'A', color: PALETTE[0] });
        const dup = await post(`/api/${TEST_PROFILE}/epics`, { name: 'B', color: PALETTE[0] });
        assert.strictEqual(dup.status, 400);
        assert.match(dup.body.error, /color/i);
    });

    it('POST rejects color outside the 20-palette', async () => {
        const res = await post(`/api/${TEST_PROFILE}/epics`, {
            name: 'Bad', color: '#123456'
        });
        assert.strictEqual(res.status, 400);
    });

    it('POST rejects empty name', async () => {
        const res = await post(`/api/${TEST_PROFILE}/epics`, {
            name: '   ', color: PALETTE[0]
        });
        assert.strictEqual(res.status, 400);
    });

    it('PUT updates name and re-derives alias', async () => {
        const created = await post(`/api/${TEST_PROFILE}/epics`, {
            name: 'Old', color: PALETTE[0]
        });
        const updated = await put(`/api/${TEST_PROFILE}/epics/${created.body.id}`, {
            name: 'Bright Future'
        });
        assert.strictEqual(updated.status, 200);
        assert.strictEqual(updated.body.name, 'Bright Future');
        assert.strictEqual(updated.body.alias, 'brightFuture');
    });

    it('PUT 404 on non-existent epic', async () => {
        const res = await put(`/api/${TEST_PROFILE}/epics/nonexistent123`, { name: 'X' });
        assert.strictEqual(res.status, 404);
    });

    it('DELETE removes the epic', async () => {
        const created = await post(`/api/${TEST_PROFILE}/epics`, {
            name: 'Goner', color: PALETTE[0]
        });
        const dRes = await del(`/api/${TEST_PROFILE}/epics/${created.body.id}`);
        assert.strictEqual(dRes.status, 200);
        const list = await get(`/api/${TEST_PROFILE}/epics`);
        assert.strictEqual(list.body.length, 0);
    });

    it('DELETE 404 on non-existent epic', async () => {
        const res = await del(`/api/${TEST_PROFILE}/epics/nonexistent123`);
        assert.strictEqual(res.status, 404);
    });

    // -------------------------------------------------
    // Cascade: deleting an epic sets epicId=null on tasks
    // (the documented behavior per SPEC § Epics)
    // -------------------------------------------------
    it('DELETE clears epicId on all active tasks that reference it', async () => {
        const epic = await post(`/api/${TEST_PROFILE}/epics`, {
            name: 'Cascade', color: PALETTE[1]
        });
        const t1 = await post(`/api/${TEST_PROFILE}/tasks`, { title: 't1' });
        const t2 = await post(`/api/${TEST_PROFILE}/tasks`, { title: 't2' });
        const t3 = await post(`/api/${TEST_PROFILE}/tasks`, { title: 't3' });

        // Attach the epic to two of them
        await put(`/api/${TEST_PROFILE}/tasks/${t1.body.id}`, { epicId: epic.body.id });
        await put(`/api/${TEST_PROFILE}/tasks/${t2.body.id}`, { epicId: epic.body.id });

        await del(`/api/${TEST_PROFILE}/epics/${epic.body.id}`);

        const tasks = await get(`/api/${TEST_PROFILE}/tasks`);
        const tasksWithEpic = tasks.body.filter(t => t.epicId === epic.body.id);
        assert.strictEqual(tasksWithEpic.length, 0, 'no task should still reference the deleted epic');
        // t3 was never attached → still null
        const t3After = tasks.body.find(t => t.id === t3.body.id);
        assert.strictEqual(t3After.epicId, null);
    });

    it('DELETE also clears epicId on archived tasks', async () => {
        const epic = await post(`/api/${TEST_PROFILE}/epics`, {
            name: 'Archived Cascade', color: PALETTE[2]
        });
        const t = await post(`/api/${TEST_PROFILE}/tasks`, { title: 'will-archive' });
        await put(`/api/${TEST_PROFILE}/tasks/${t.body.id}`, { epicId: epic.body.id });
        await post(`/api/${TEST_PROFILE}/tasks/${t.body.id}/move`, {
            newStatus: 'done', newPosition: 0
        });
        await post(`/api/${TEST_PROFILE}/tasks/archive`);

        await del(`/api/${TEST_PROFILE}/epics/${epic.body.id}`);

        const archived = await get(`/api/${TEST_PROFILE}/archived`);
        const stillRef = archived.body.filter(t => t.epicId === epic.body.id);
        assert.strictEqual(stillRef.length, 0, 'archived tasks should also lose epicId');
    });
});
