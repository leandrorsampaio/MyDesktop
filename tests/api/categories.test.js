/**
 * API Integration tests for Categories endpoints
 * Requires server running with: RATE_LIMIT_DISABLED=1 node server.js
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
const CATEGORIES_FILE = path.join(PROFILE_DIR, 'categories.json');
const TASKS_FILE = path.join(PROFILE_DIR, 'tasks.json');
const ARCHIVED_FILE = path.join(PROFILE_DIR, 'archived-tasks.json');

const DEFAULT_CATEGORIES = [
    { id: 1, name: 'Non categorized', icon: 'close' },
    { id: 2, name: 'Development',     icon: 'edit' },
    { id: 3, name: 'Communication',   icon: 'newTab' },
    { id: 4, name: 'To Remember',     icon: 'star' },
    { id: 5, name: 'Planning',        icon: 'plus' },
    { id: 6, name: 'Generic Task',    icon: 'close' }
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

describe('Categories API', () => {
    before(async () => {
        await post('/api/profiles', { name: 'Tests', color: '#636E72', letters: 'TST' });
        await fs.mkdir(PROFILE_DIR, { recursive: true });
    });

    beforeEach(async () => {
        // Reset to the canonical 6 defaults so each test starts fresh
        await fs.writeFile(CATEGORIES_FILE, JSON.stringify(DEFAULT_CATEGORIES, null, 2));
        await fs.writeFile(TASKS_FILE, '[]');
        await fs.writeFile(ARCHIVED_FILE, '[]');
    });

    // Restore defaults after the whole suite so a later test file (e.g.
    // tasks.test.js) doesn't inherit a half-deleted category set.
    after(async () => {
        await fs.writeFile(CATEGORIES_FILE, JSON.stringify(DEFAULT_CATEGORIES, null, 2));
    });

    it('GET returns the 6 default categories', async () => {
        const res = await get(`/api/${TEST_PROFILE}/categories`);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.length, 6);
        assert.strictEqual(res.body[0].name, 'Non categorized');
    });

    it('POST creates a new category with auto-incremented id', async () => {
        const res = await post(`/api/${TEST_PROFILE}/categories`, {
            name: 'Bug Fix', icon: 'edit'
        });
        assert.strictEqual(res.status, 201);
        assert.strictEqual(res.body.name, 'Bug Fix');
        assert.strictEqual(res.body.icon, 'edit');
        assert.ok(res.body.id > 6, 'id should be > existing max');
    });

    it('POST rejects empty name', async () => {
        const res = await post(`/api/${TEST_PROFILE}/categories`, {
            name: '   ', icon: 'edit'
        });
        assert.strictEqual(res.status, 400);
    });

    it('PUT updates name on existing category', async () => {
        const res = await put(`/api/${TEST_PROFILE}/categories/2`, {
            name: 'Engineering'
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.name, 'Engineering');
    });

    it('PUT 404 on non-existent category', async () => {
        const res = await put(`/api/${TEST_PROFILE}/categories/9999`, { name: 'X' });
        assert.strictEqual(res.status, 404);
    });

    it('PUT can rename category 1 (the default)', async () => {
        // Category 1 is undeletable but renameable per SPEC
        const res = await put(`/api/${TEST_PROFILE}/categories/1`, {
            name: 'Renamed Default'
        });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.name, 'Renamed Default');
    });

    it('DELETE rejects category 1 (the default)', async () => {
        const res = await del(`/api/${TEST_PROFILE}/categories/1`);
        assert.strictEqual(res.status, 400);
    });

    it('DELETE removes category 2 successfully', async () => {
        const res = await del(`/api/${TEST_PROFILE}/categories/2`);
        assert.strictEqual(res.status, 200);
        const list = await get(`/api/${TEST_PROFILE}/categories`);
        assert.ok(!list.body.find(c => c.id === 2), 'category 2 is gone');
    });

    it('DELETE reassigns active tasks of that category to category 1', async () => {
        const t1 = await post(`/api/${TEST_PROFILE}/tasks`, { title: 't1', category: 2 });
        const t2 = await post(`/api/${TEST_PROFILE}/tasks`, { title: 't2', category: 2 });
        const t3 = await post(`/api/${TEST_PROFILE}/tasks`, { title: 't3', category: 3 });

        await del(`/api/${TEST_PROFILE}/categories/2`);

        const tasks = await get(`/api/${TEST_PROFILE}/tasks`);
        const t1After = tasks.body.find(t => t.id === t1.body.id);
        const t2After = tasks.body.find(t => t.id === t2.body.id);
        const t3After = tasks.body.find(t => t.id === t3.body.id);
        assert.strictEqual(t1After.category, 1, 't1 reassigned to category 1');
        assert.strictEqual(t2After.category, 1, 't2 reassigned to category 1');
        assert.strictEqual(t3After.category, 3, 't3 (unrelated) untouched');
    });

    it('DELETE does NOT touch archived tasks (SPEC: archived preserve old category number)', async () => {
        const t = await post(`/api/${TEST_PROFILE}/tasks`, { title: 'will-archive', category: 2 });
        await post(`/api/${TEST_PROFILE}/tasks/${t.body.id}/move`, {
            newStatus: 'done', newPosition: 0
        });
        await post(`/api/${TEST_PROFILE}/tasks/archive`);

        await del(`/api/${TEST_PROFILE}/categories/2`);

        const archived = await get(`/api/${TEST_PROFILE}/archived`);
        const arch = archived.body.find(t2 => t2.id === t.body.id);
        assert.strictEqual(arch.category, 2, 'archived task keeps original category number');
        // categoryName should also be snapshot
        assert.strictEqual(arch.categoryName, 'Development', 'archived snapshot has categoryName');
    });
});
