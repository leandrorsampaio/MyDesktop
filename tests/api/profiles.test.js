/**
 * API Integration tests for Profiles endpoints
 *
 * IMPORTANT: These tests require the server to be running.
 * Run with: RATE_LIMIT_DISABLED=1 node server.js (separate terminal)
 *
 * These tests create and delete profiles. They clean up after themselves
 * via `afterEach` — every profile created in a test is deleted at the end
 * of that test, regardless of pass/fail. Other profiles (work, tests) are
 * not touched.
 */

const { describe, it, afterEach, before } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs').promises;
const path = require('node:path');
const http = require('node:http');

const BASE_URL = 'http://localhost:3001';
const DATA_DIR = path.join(__dirname, '..', '..', 'data');

function makeRequest(method, urlPath, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlPath, BASE_URL);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method,
            headers: { 'Content-Type': 'application/json' }
        };
        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsedBody = null;
                try { parsedBody = data ? JSON.parse(data) : null; } catch { parsedBody = data; }
                resolve({ status: res.statusCode, body: parsedBody, headers: res.headers });
            });
        });
        req.on('error', (error) => {
            if (error.code === 'ECONNREFUSED') {
                reject(new Error('Connection refused. Start the server first.'));
            } else {
                reject(error);
            }
        });
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

const get = (p) => makeRequest('GET', p);
const post = (p, b) => makeRequest('POST', p, b);
const put = (p, b) => makeRequest('PUT', p, b);
const del = (p) => makeRequest('DELETE', p);

// All 20 palette colors (matches EPIC_COLORS_SERVER in server.js)
const PALETTE = [
    '#E74C3C', '#FF6F61', '#E67E22', '#F5A623', '#F1C40F', '#A8D84E',
    '#2ECC71', '#00B894', '#1ABC9C', '#00CEC9', '#54A0FF', '#2E86DE',
    '#3742FA', '#5758BB', '#8E44AD', '#B24BDB', '#E84393', '#FD79A8',
    '#636E72', '#2D3436'
];

describe('Profiles API', () => {
    const createdProfileIds = [];

    // Cache the colors and letters already in use so we can pick fresh ones
    let usedColors = new Set();
    let usedLetters = new Set();

    before(async () => {
        const res = await get('/api/profiles');
        for (const p of res.body || []) {
            usedColors.add(p.color);
            usedLetters.add(p.letters);
        }
    });

    afterEach(async () => {
        for (const id of createdProfileIds.splice(0)) {
            await del(`/api/profiles/${id}`);
        }
    });

    // Try every color/letter combo until one isn't already taken. Caches
    // newly-used values so concurrent tests in the same file don't collide.
    async function createTestProfile(overrides = {}) {
        const uniq = Math.random().toString(36).substring(2, 8);
        for (const color of PALETTE) {
            if (usedColors.has(color) && !overrides.color) continue;
            for (let i = 0; i < 26; i++) {
                for (let j = 0; j < 26; j++) {
                    const letters = `${String.fromCharCode(65 + i)}${String.fromCharCode(65 + j)}T`;
                    if (usedLetters.has(letters) && !overrides.letters) continue;
                    const body = {
                        name: `Test_${uniq}_${i}_${j}`,
                        color: overrides.color || color,
                        letters: overrides.letters || letters,
                        ...overrides
                    };
                    const res = await post('/api/profiles', body);
                    if (res.status === 201) {
                        createdProfileIds.push(res.body.id);
                        usedColors.add(res.body.color);
                        usedLetters.add(res.body.letters);
                        return res.body;
                    }
                    if (res.status === 400 && /already used/.test(res.body.error || '')) {
                        // collision with another profile, retry next combo
                        continue;
                    }
                    throw new Error(`Unexpected create status ${res.status}: ${JSON.stringify(res.body)}`);
                }
            }
        }
        throw new Error('Ran out of color/letter combos');
    }

    // -----------------------------------------------------------------
    // GET endpoints
    // -----------------------------------------------------------------
    describe('GET /api/profiles', () => {
        it('returns 200 and an array', async () => {
            const res = await get('/api/profiles');
            assert.strictEqual(res.status, 200);
            assert.ok(Array.isArray(res.body));
        });

        it('every profile has required fields', async () => {
            const res = await get('/api/profiles');
            for (const p of res.body) {
                assert.ok(p.id, 'has id');
                assert.ok(p.name, 'has name');
                assert.ok(p.alias, 'has alias');
                assert.ok(p.color, 'has color');
                assert.ok(p.letters, 'has letters');
                assert.strictEqual(typeof p.isDefault, 'boolean', 'isDefault is boolean');
                assert.ok(Array.isArray(p.columns), 'has columns array');
            }
        });

        it('exactly one profile has isDefault=true', async () => {
            const res = await get('/api/profiles');
            const defaults = res.body.filter(p => p.isDefault === true);
            assert.strictEqual(defaults.length, 1, `expected 1 default, got ${defaults.length}`);
        });
    });

    describe('GET /api/profiles/default', () => {
        it('returns the default profile', async () => {
            const res = await get('/api/profiles/default');
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.isDefault, true);
        });
    });

    // -----------------------------------------------------------------
    // POST — create
    // -----------------------------------------------------------------
    describe('POST /api/profiles', () => {
        it('creates a new profile with valid data', async () => {
            const p = await createTestProfile();
            assert.ok(p.id);
            assert.ok(p.alias);
            assert.strictEqual(p.isDefault, false, 'new profile is not default');
            assert.ok(Array.isArray(p.columns) && p.columns.length > 0, 'has default columns');
        });

        it('derives camelCase alias from name', async () => {
            const p = await createTestProfile({ name: 'My Project 123' });
            assert.strictEqual(p.alias, 'myProject123');
        });

        it('includes a permanent backlog column in default columns', async () => {
            const p = await createTestProfile();
            const backlog = p.columns.find(c => c.isBacklog === true);
            assert.ok(backlog, 'default columns include a backlog column');
        });

        it('rejects duplicate alias', async () => {
            const first = await createTestProfile({ name: 'CollideName' });
            const res = await post('/api/profiles', {
                name: 'CollideName',
                color: PALETTE[0],
                letters: 'XYZ'
            });
            assert.strictEqual(res.status, 400);
        });

        it('rejects duplicate color', async () => {
            const first = await createTestProfile();
            const res = await post('/api/profiles', {
                name: 'OtherName_' + Date.now(),
                color: first.color,        // intentional collision
                letters: 'ZZZ'
            });
            assert.strictEqual(res.status, 400);
            assert.match(res.body.error, /color/i);
        });

        it('rejects duplicate letters', async () => {
            const first = await createTestProfile();
            const res = await post('/api/profiles', {
                name: 'OtherName_' + Date.now() + '_b',
                color: PALETTE[PALETTE.length - 1],
                letters: first.letters     // intentional collision
            });
            assert.strictEqual(res.status, 400);
            assert.match(res.body.error, /letters/i);
        });

        it('rejects missing name', async () => {
            const res = await post('/api/profiles', { color: PALETTE[0], letters: 'ABC' });
            assert.strictEqual(res.status, 400);
        });

        it('rejects name with no alphanumeric characters', async () => {
            const res = await post('/api/profiles', {
                name: '!!!',
                color: PALETTE[0],
                letters: 'ABC'
            });
            assert.strictEqual(res.status, 400);
        });
    });

    // -----------------------------------------------------------------
    // PUT — update
    // -----------------------------------------------------------------
    describe('PUT /api/profiles/:id', () => {
        it('returns 404 for non-existent profile', async () => {
            const res = await put('/api/profiles/nonexistent123', { name: 'X' });
            assert.strictEqual(res.status, 404);
        });

        it('updates name and re-derives alias', async () => {
            const p = await createTestProfile({ name: 'OldName' });
            const res = await put(`/api/profiles/${p.id}`, { name: 'New Name' });
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.name, 'New Name');
            assert.strictEqual(res.body.alias, 'newName');
        });

        it('setting isDefault=true clears it on all other profiles', async () => {
            const p = await createTestProfile();
            await put(`/api/profiles/${p.id}`, { isDefault: true });
            const all = await get('/api/profiles');
            const defaults = all.body.filter(x => x.isDefault === true);
            assert.strictEqual(defaults.length, 1, 'exactly one default after toggle');
            assert.strictEqual(defaults[0].id, p.id);
        });
    });

    // -----------------------------------------------------------------
    // DELETE
    // -----------------------------------------------------------------
    describe('DELETE /api/profiles/:id', () => {
        it('removes the profile from the list', async () => {
            const p = await createTestProfile();
            createdProfileIds.pop();  // don't double-delete in afterEach
            const res = await del(`/api/profiles/${p.id}`);
            assert.strictEqual(res.status, 200);
            const all = await get('/api/profiles');
            assert.ok(!all.body.find(x => x.id === p.id), 'profile is gone');
        });

        it('removes the profile data directory', async () => {
            const p = await createTestProfile();
            createdProfileIds.pop();
            const profileDir = path.join(DATA_DIR, p.alias);
            // confirm dir exists pre-delete
            await assert.doesNotReject(fs.access(profileDir));
            await del(`/api/profiles/${p.id}`);
            await assert.rejects(fs.access(profileDir), { code: 'ENOENT' });
        });

        it('returns 404 for non-existent profile', async () => {
            const res = await del('/api/profiles/nonexistent123');
            assert.strictEqual(res.status, 404);
        });

        it('reassigns isDefault to first remaining when default is deleted', async () => {
            // Create two test profiles, make the first default, delete it.
            const a = await createTestProfile();
            const b = await createTestProfile();
            await put(`/api/profiles/${a.id}`, { isDefault: true });
            createdProfileIds.shift();  // a is being deleted
            await del(`/api/profiles/${a.id}`);
            const all = await get('/api/profiles');
            const defaults = all.body.filter(x => x.isDefault === true);
            assert.strictEqual(defaults.length, 1, 'exactly one default after deleting old default');
        });
    });
});
