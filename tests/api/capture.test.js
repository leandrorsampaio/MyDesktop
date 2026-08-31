/**
 * API Integration tests for quick capture (Phase 2 of docs/design/AI_ASSISTANT.md).
 *
 * The contract under test: capture is instant, involves no AI, and must never
 * fail. Classification is a separate best-effort request that degrades to
 * `classified: false` with the task untouched.
 *
 * IMPORTANT: requires the server running in test mode:
 *   Terminal 1: RATE_LIMIT_DISABLED=1 node server.js
 *   Terminal 2: node --test tests/api/capture.test.js
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

describe('Quick capture API', () => {
    let originalTasks;

    before(async () => {
        await post('/api/profiles', { name: 'Tests', color: '#636E72', letters: 'TST' });
        await fs.mkdir(PROFILE_DIR, { recursive: true });
        try { originalTasks = await fs.readFile(TASKS_FILE, 'utf8'); } catch { originalTasks = '[]'; }
    });

    beforeEach(async () => {
        await fs.writeFile(TASKS_FILE, '[]');
    });

    after(async () => {
        await fs.writeFile(TASKS_FILE, originalTasks);
    });

    describe('POST /api/tests/capture', () => {

        it('creates a task from a raw line', async () => {
            const res = await post(`/api/${TEST_PROFILE}/capture`, {
                text: 'Deelip asked me to add pagination to the orders table'
            });

            assert.strictEqual(res.status, 201);
            assert.strictEqual(res.body.title, 'Deelip asked me to add pagination to the orders table');
            assert.ok(res.body.id);
        });

        it('marks the task as needing filing', async () => {
            const res = await post(`/api/${TEST_PROFILE}/capture`, { text: 'Something to do' });
            assert.strictEqual(res.body.needsFiling, true);
        });

        it('logs the capture', async () => {
            const res = await post(`/api/${TEST_PROFILE}/capture`, { text: 'Something to do' });
            assert.strictEqual(res.body.log[0].action, 'Captured');
        });

        it('lands at the top of the first non-backlog column', async () => {
            const columns = await get(`/api/${TEST_PROFILE}/columns`);
            const firstBoardCol = columns.body.find(c => !c.isBacklog);

            const res = await post(`/api/${TEST_PROFILE}/capture`, { text: 'First note' });
            assert.strictEqual(res.body.status, firstBoardCol.id);
            assert.strictEqual(res.body.position, 0);
        });

        it('pushes existing cards in that column down', async () => {
            await post(`/api/${TEST_PROFILE}/capture`, { text: 'Older note' });
            await post(`/api/${TEST_PROFILE}/capture`, { text: 'Newer note' });

            const tasks = await get(`/api/${TEST_PROFILE}/tasks`);
            const older = tasks.body.find(t => t.title === 'Older note');
            const newer = tasks.body.find(t => t.title === 'Newer note');
            assert.strictEqual(newer.position, 0);
            assert.strictEqual(older.position, 1);
        });

        it('preserves an over-long note in the description rather than losing it', async () => {
            // A captured note is the user's own words; truncation must not
            // silently discard any of it.
            const long = 'x'.repeat(260);
            const res = await post(`/api/${TEST_PROFILE}/capture`, { text: long });

            assert.strictEqual(res.body.title.length, 200);
            assert.strictEqual(res.body.description, long);
        });

        it('rejects an empty note', async () => {
            const res = await post(`/api/${TEST_PROFILE}/capture`, { text: '   ' });
            assert.strictEqual(res.status, 400);
        });

        it('rejects a note past the capture limit', async () => {
            const res = await post(`/api/${TEST_PROFILE}/capture`, { text: 'x'.repeat(2100) });
            assert.strictEqual(res.status, 400);
            assert.match(res.body.error, /2000 characters or less/);
        });

        it('does not depend on the AI — capture works regardless of provider state', async () => {
            // The endpoint makes no provider call at all, so this passes with
            // the AI configured, misconfigured, or entirely absent. That is the
            // property being asserted: capture must never fail.
            const res = await post(`/api/${TEST_PROFILE}/capture`, { text: 'Works offline' });
            assert.strictEqual(res.status, 201);
        });
    });

    describe('POST /api/tests/tasks/:id/classify', () => {

        it('404s for an unknown task', async () => {
            const res = await post(`/api/${TEST_PROFILE}/tasks/nope/classify`, {});
            assert.strictEqual(res.status, 404);
        });

        it('degrades to classified:false instead of erroring when the AI cannot answer', async () => {
            // Whatever the provider state, this endpoint answers 200 and hands
            // back a usable task — callers must never have to treat a missing
            // classification as a failure.
            const captured = await post(`/api/${TEST_PROFILE}/capture`, { text: 'Classify me' });
            const res = await post(`/api/${TEST_PROFILE}/tasks/${captured.body.id}/classify`, {});

            assert.strictEqual(res.status, 200);
            assert.strictEqual(typeof res.body.classified, 'boolean');
            assert.ok(res.body.task, 'no task returned');
            assert.strictEqual(res.body.task.id, captured.body.id);

            if (res.body.classified === false) {
                assert.ok(res.body.reason, 'no reason given for the non-classification');
                // Untouched: still flagged, still where capture put it
                assert.strictEqual(res.body.task.needsFiling, true);
                assert.strictEqual(res.body.task.title, 'Classify me');
            }
        });

        it('leaves the stored task intact when classification does not happen', async () => {
            const captured = await post(`/api/${TEST_PROFILE}/capture`, { text: 'Stay as I am' });
            const res = await post(`/api/${TEST_PROFILE}/tasks/${captured.body.id}/classify`, {});

            if (res.body.classified === false) {
                const tasks = await get(`/api/${TEST_PROFILE}/tasks`);
                const stored = tasks.body.find(t => t.id === captured.body.id);
                assert.strictEqual(stored.title, 'Stay as I am');
                assert.strictEqual(stored.needsFiling, true);
                assert.strictEqual(stored.epicId, null);
            }
        });
    });
});
