/**
 * API Integration tests for the profile export endpoint
 * Requires server running with: RATE_LIMIT_DISABLED=1 node server.js
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

const BASE_URL = 'http://localhost:3001';
const TEST_PROFILE = 'tests';

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
                resolve({ status: res.statusCode, headers: res.headers, body: parsedBody });
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

describe('Export API', () => {
    before(async () => {
        // Idempotent: creates the tests profile if another file hasn't already
        await post('/api/profiles', { name: 'Tests', color: '#636E72', letters: 'TST' });
    });

    it('GET /export returns the full bundle with every data section', async () => {
        const res = await get(`/api/${TEST_PROFILE}/export`);
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.formatVersion, 1);
        assert.ok(res.body.exportedAt, 'has exportedAt timestamp');
        for (const key of ['tasks', 'archivedTasks', 'epics', 'categories', 'reports', 'stagedTasks']) {
            assert.ok(Array.isArray(res.body[key]), `${key} is an array`);
        }
        assert.strictEqual(typeof res.body.notes.content, 'string', 'notes has content');
    });

    it('bundle profile matches the alias and includes columns', async () => {
        const res = await get(`/api/${TEST_PROFILE}/export`);
        assert.strictEqual(res.body.profile.alias, TEST_PROFILE);
        assert.ok(Array.isArray(res.body.profile.columns), 'profile includes columns');
        assert.ok(res.body.profile.columns.some(c => c.isBacklog), 'columns include the backlog');
    });

    it('exported tasks reflect current data', async () => {
        const created = await post(`/api/${TEST_PROFILE}/tasks`, { title: 'export-me' });
        const res = await get(`/api/${TEST_PROFILE}/export`);
        assert.ok(res.body.tasks.some(t => t.id === created.body.id), 'created task appears in export');
    });

    it('sets a download Content-Disposition header with profile + date', async () => {
        const res = await get(`/api/${TEST_PROFILE}/export`);
        const cd = res.headers['content-disposition'];
        assert.ok(cd, 'header present');
        assert.match(cd, new RegExp(`attachment; filename="mydesktop-${TEST_PROFILE}-\\d{4}-\\d{2}-\\d{2}\\.json"`));
    });

    it('404 on unknown profile', async () => {
        const res = await get('/api/noSuchProfileZz/export');
        assert.strictEqual(res.status, 404);
    });
});
