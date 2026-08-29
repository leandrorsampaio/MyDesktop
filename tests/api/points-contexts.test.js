/**
 * API Integration tests for story points and epic contexts
 * (Phase 3 of docs/design/AI_ASSISTANT.md).
 *
 * Both are plain data with manual UI — they must work fully with the AI
 * switched off, which is why these tests never touch a provider.
 *
 * IMPORTANT: requires the server running in test mode:
 *   Terminal 1: RATE_LIMIT_DISABLED=1 node server.js
 *   Terminal 2: node --test tests/api/points-contexts.test.js
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
const EPICS_FILE = path.join(PROFILE_DIR, 'epics.json');

/** Mirrors server.js STORY_POINTS. */
const STORY_POINTS = [1, 2, 3, 5, 8, 13, 21, 34, 100];

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
const put = (p, body) => makeRequest('PUT', p, body);

describe('Story points & epic contexts', () => {
    let originalTasks;
    let originalEpics;

    before(async () => {
        await post('/api/profiles', { name: 'Tests', color: '#636E72', letters: 'TST' });
        await fs.mkdir(PROFILE_DIR, { recursive: true });
        try { originalTasks = await fs.readFile(TASKS_FILE, 'utf8'); } catch { originalTasks = '[]'; }
        try { originalEpics = await fs.readFile(EPICS_FILE, 'utf8'); } catch { originalEpics = '[]'; }
    });

    beforeEach(async () => {
        await fs.writeFile(TASKS_FILE, '[]');
        await fs.writeFile(EPICS_FILE, '[]');
    });

    // Alphabetically-later suites inherit this profile's state, so restore it.
    after(async () => {
        await fs.writeFile(TASKS_FILE, originalTasks);
        await fs.writeFile(EPICS_FILE, originalEpics);
    });

    // -------------------------------------------
    // Story points
    // -------------------------------------------
    describe('Story points', () => {

        it('defaults to null (unestimated)', async () => {
            const res = await post(`/api/${TEST_PROFILE}/tasks`, { title: 'Unsized' });
            assert.strictEqual(res.body.points, null);
        });

        it('accepts every value on the scale', async () => {
            for (const points of STORY_POINTS) {
                const res = await post(`/api/${TEST_PROFILE}/tasks`, { title: `Task ${points}`, points });
                assert.strictEqual(res.status, 201, `points ${points} rejected`);
                assert.strictEqual(res.body.points, points);
            }
        });

        it('rejects a value off the scale', async () => {
            for (const bad of [4, 7, 55, 99, 0, -1, 1.5]) {
                const res = await post(`/api/${TEST_PROFILE}/tasks`, { title: 'Bad', points: bad });
                assert.strictEqual(res.status, 400, `points ${bad} was accepted`);
            }
        });

        it('tops out at 100, the "too big to size" value', async () => {
            // 100 stands for infinity: a prompt to split, not an estimate.
            // Nothing above it exists, so nothing above it is accepted.
            const ok = await post(`/api/${TEST_PROFILE}/tasks`, { title: 'Unsizable', points: 100 });
            assert.strictEqual(ok.status, 201);

            const res = await post(`/api/${TEST_PROFILE}/tasks`, { title: 'Beyond', points: 200 });
            assert.strictEqual(res.status, 400);
            assert.match(res.body.error, /1, 2, 3, 5, 8, 13, 21, 34, 100/);
        });

        it('updates and clears via PUT', async () => {
            const created = await post(`/api/${TEST_PROFILE}/tasks`, { title: 'Sized', points: 3 });

            const updated = await put(`/api/${TEST_PROFILE}/tasks/${created.body.id}`, { points: 13 });
            assert.strictEqual(updated.body.points, 13);

            const cleared = await put(`/api/${TEST_PROFILE}/tasks/${created.body.id}`, { points: null });
            assert.strictEqual(cleared.body.points, null);
        });

        it('leaves points alone when the field is absent from an update', async () => {
            const created = await post(`/api/${TEST_PROFILE}/tasks`, { title: 'Sized', points: 8 });
            const updated = await put(`/api/${TEST_PROFILE}/tasks/${created.body.id}`, { title: 'Renamed' });
            assert.strictEqual(updated.body.points, 8);
        });

        it('appears in the AI board snapshot', async () => {
            await post(`/api/${TEST_PROFILE}/tasks`, { title: 'Sized for the model', points: 5 });
            const res = await get(`/api/${TEST_PROFILE}/ai/_test/prompt`);
            assert.match(res.body.prompt, /Sized for the model — 5pt/);
        });
    });

    // -------------------------------------------
    // Epic contexts
    // -------------------------------------------
    describe('Epic contexts', () => {

        it('creates an epic with empty context fields', async () => {
            const res = await post(`/api/${TEST_PROFILE}/epics`, { name: 'Plain', color: '#E74C3C' });
            assert.strictEqual(res.body.stakeholder, '');
            assert.strictEqual(res.body.cadence, '');
            assert.strictEqual(res.body.expectations, '');
        });

        it('accepts context fields on create', async () => {
            const res = await post(`/api/${TEST_PROFILE}/epics`, {
                name: 'CICD', color: '#E74C3C',
                stakeholder: 'my boss', cadence: 'he asks Mondays'
            });
            assert.strictEqual(res.body.stakeholder, 'my boss');
            assert.strictEqual(res.body.cadence, 'he asks Mondays');
        });

        it('updates one field without disturbing the others', async () => {
            const created = await post(`/api/${TEST_PROFILE}/epics`, {
                name: 'CICD', color: '#E74C3C', stakeholder: 'my boss', cadence: 'Mondays'
            });
            const updated = await put(`/api/${TEST_PROFILE}/epics/${created.body.id}`, {
                expectations: 'CI green before every release'
            });

            assert.strictEqual(updated.body.expectations, 'CI green before every release');
            assert.strictEqual(updated.body.stakeholder, 'my boss');
            assert.strictEqual(updated.body.cadence, 'Mondays');
            assert.strictEqual(updated.body.name, 'CICD');
        });

        it('clears a field with an empty string', async () => {
            const created = await post(`/api/${TEST_PROFILE}/epics`, {
                name: 'CICD', color: '#E74C3C', stakeholder: 'my boss'
            });
            const updated = await put(`/api/${TEST_PROFILE}/epics/${created.body.id}`, { stakeholder: '' });
            assert.strictEqual(updated.body.stakeholder, '');
        });

        it('rejects an over-long context field', async () => {
            const created = await post(`/api/${TEST_PROFILE}/epics`, { name: 'CICD', color: '#E74C3C' });
            const res = await put(`/api/${TEST_PROFILE}/epics/${created.body.id}`, { cadence: 'x'.repeat(600) });
            assert.strictEqual(res.status, 400);
            assert.match(res.body.error, /500 characters or less/);
        });

        it('rejects a non-string context field', async () => {
            const res = await post(`/api/${TEST_PROFILE}/epics`, {
                name: 'CICD', color: '#E74C3C', stakeholder: 42
            });
            assert.strictEqual(res.status, 400);
        });

        it('reaches the AI prompt, so the model can reason about stakeholders', async () => {
            await post(`/api/${TEST_PROFILE}/epics`, {
                name: 'CICD', color: '#E74C3C',
                stakeholder: 'my boss', cadence: 'he asks Mondays',
                expectations: 'CI green before every release'
            });
            const res = await get(`/api/${TEST_PROFILE}/ai/_test/prompt`);

            assert.match(res.body.prompt, /stakeholder: my boss/);
            assert.match(res.body.prompt, /cadence: he asks Mondays/);
            assert.match(res.body.prompt, /expects: CI green before every release/);
        });

        it('omits context from the prompt entirely when unset', async () => {
            // Older profiles have no context fields; the prompt must not carry
            // a row of empty labels for them.
            await post(`/api/${TEST_PROFILE}/epics`, { name: 'Plain', color: '#2E86DE' });
            const res = await get(`/api/${TEST_PROFILE}/ai/_test/prompt`);

            assert.match(res.body.prompt, /"Plain"/);
            assert.ok(!/stakeholder: \s*\|/.test(res.body.prompt), 'empty context leaked into the prompt');
        });
    });
});
