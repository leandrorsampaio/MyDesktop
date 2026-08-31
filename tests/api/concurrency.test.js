/**
 * API Integration tests for concurrent writes.
 *
 * Every store here is a whole-file JSON document, so almost every mutation is a
 * read-modify-write. Atomic writes stop a reader seeing half a file; they do
 * not stop two overlapping cycles from losing one of them. These fire real
 * concurrent requests and check nothing is dropped.
 *
 * IMPORTANT: requires the server running in test mode:
 *   Terminal 1: RATE_LIMIT_DISABLED=1 node server.js
 *   Terminal 2: node --test tests/api/concurrency.test.js
 */

const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs').promises;
const path = require('node:path');
const http = require('node:http');

const BASE_URL = 'http://localhost:3001';
const TEST_PROFILE = 'tests';
const PROFILE_DIR = path.join(__dirname, '..', '..', 'data', TEST_PROFILE);
const TASKS_FILE = path.join(PROFILE_DIR, 'tasks.json');
const MEMORY_FILE = path.join(PROFILE_DIR, 'ai-memory.json');

function makeRequest(method, urlPath, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlPath, BASE_URL);
        const req = http.request({
            hostname: url.hostname, port: url.port,
            path: url.pathname + url.search, method,
            headers: { 'Content-Type': 'application/json' }
        }, (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => {
                let parsed = null;
                try { parsed = data ? JSON.parse(data) : null; } catch { parsed = data; }
                resolve({ status: res.statusCode, body: parsed });
            });
        });
        req.on('error', (error) => {
            if (error.code === 'ECONNREFUSED') {
                reject(new Error('Connection refused. Start the server with: RATE_LIMIT_DISABLED=1 node server.js'));
            } else { reject(error); }
        });
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

const get = (p) => makeRequest('GET', p);
const post = (p, b) => makeRequest('POST', p, b);
const api = (p) => `/api/${TEST_PROFILE}${p}`;

describe('Concurrent writes', () => {
    let originals = {};

    before(async () => {
        await post('/api/profiles', { name: 'Tests', color: '#636E72', letters: 'TST' });
        await fs.mkdir(PROFILE_DIR, { recursive: true });
        for (const [k, f] of [['tasks', TASKS_FILE], ['memory', MEMORY_FILE]]) {
            try { originals[k] = await fs.readFile(f, 'utf8'); } catch { originals[k] = '[]'; }
        }
    });

    beforeEach(async () => {
        await fs.writeFile(TASKS_FILE, '[]');
        await fs.writeFile(MEMORY_FILE, '[]');
    });

    after(async () => {
        await fs.writeFile(TASKS_FILE, originals.tasks);
        await fs.writeFile(MEMORY_FILE, originals.memory);
    });

    it('keeps every task when many are created at once', async () => {
        // Without serialisation these interleave: each request reads the same
        // array and writes its own copy back, so most of them vanish.
        const results = await Promise.all(
            Array.from({ length: 12 }, (_, i) => post(api('/tasks'), { title: `Parallel ${i}` }))
        );
        assert.ok(results.every(r => r.status === 201), 'a create failed outright');

        const tasks = await get(api('/tasks'));
        assert.strictEqual(tasks.body.length, 12, 'tasks were lost to interleaved writes');

        const titles = new Set(tasks.body.map(t => t.title));
        assert.strictEqual(titles.size, 12, 'a task was overwritten by another');
    });

    it('keeps positions unique when concurrent creates all insert at 0', async () => {
        // Each create shifts every other task down. Two cycles racing produce
        // duplicate positions, which the board renders as an arbitrary order.
        await Promise.all(
            Array.from({ length: 8 }, (_, i) => post(api('/tasks'), { title: `Pos ${i}` }))
        );
        const tasks = await get(api('/tasks'));
        const todo = tasks.body.filter(t => t.status === 'todo');
        const positions = todo.map(t => t.position).sort((a, b) => a - b);

        assert.deepStrictEqual(positions, [...Array(todo.length).keys()],
            `positions were not a clean sequence: ${positions.join(',')}`);
    });

    it('keeps every captured note when captured in quick succession', async () => {
        // The hallway case the feature exists for: several thoughts, fast.
        await Promise.all(
            Array.from({ length: 6 }, (_, i) => post(api('/capture'), { text: `Thought ${i}` }))
        );
        const tasks = await get(api('/tasks'));
        assert.strictEqual(tasks.body.length, 6, 'a captured note was lost');
    });

    it('keeps every memory added at once', async () => {
        await Promise.all(
            Array.from({ length: 10 }, (_, i) => post(api('/ai/memory'), { text: `Fact number ${i}.` }))
        );
        const memories = await get(api('/ai/memory'));
        assert.strictEqual(memories.body.length, 10, 'memories were lost to interleaved writes');
    });

    it('serialises mixed operations on the same store', async () => {
        const created = await post(api('/tasks'), { title: 'Target' });
        const id = created.body.id;

        // An update, a move and two creates, all at once.
        await Promise.all([
            makeRequest('PUT', api(`/tasks/${id}`), { title: 'Renamed' }),
            post(api('/tasks/' + id + '/move'), { newStatus: 'inprogress', newPosition: 0 }),
            post(api('/tasks'), { title: 'Other A' }),
            post(api('/tasks'), { title: 'Other B' })
        ]);

        const tasks = await get(api('/tasks'));
        assert.strictEqual(tasks.body.length, 3, 'a concurrent create was lost');
        const target = tasks.body.find(t => t.id === id);
        assert.ok(target, 'the updated task disappeared');
        // Both the rename and the move must have survived, in whichever order.
        assert.strictEqual(target.title, 'Renamed');
        assert.strictEqual(target.status, 'inprogress');
    });
});
