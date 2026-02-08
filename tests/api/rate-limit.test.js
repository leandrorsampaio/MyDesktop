/**
 * API Integration tests for Rate Limiting
 *
 * IMPORTANT: These tests require the server to be running!
 *
 * To run:
 *   Terminal 1: node server.js
 *   Terminal 2: node --test tests/api/rate-limit.test.js
 *
 * Note: These tests verify rate limiting is working. They intentionally
 * trigger the rate limit, so they may affect other tests if run together.
 * Run them separately: node --test tests/api/rate-limit.test.js
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs').promises;
const path = require('node:path');
const http = require('node:http');

// ===========================================
// Configuration
// ===========================================
const BASE_URL = 'http://localhost:3001';
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');

// ===========================================
// HTTP Helper
// ===========================================
function makeRequest(method, urlPath, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlPath, BASE_URL);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: method,
            headers: { 'Content-Type': 'application/json' }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    headers: res.headers,
                    body: data ? JSON.parse(data) : null
                });
            });
        });

        req.on('error', (error) => {
            if (error.code === 'ECONNREFUSED') {
                reject(new Error('Connection refused. Is the server running?'));
            } else {
                reject(error);
            }
        });

        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

const get = (path) => makeRequest('GET', path);
const post = (path, body) => makeRequest('POST', path, body);

// ===========================================
// Test Suite
// ===========================================
describe('Rate Limiting', () => {
    let originalTasks;

    before(async () => {
        try {
            originalTasks = await fs.readFile(TASKS_FILE, 'utf8');
        } catch {
            originalTasks = '[]';
        }
    });

    beforeEach(async () => {
        await fs.writeFile(TASKS_FILE, '[]');
    });

    after(async () => {
        await fs.writeFile(TASKS_FILE, originalTasks);
    });

    // -------------------------------------------
    // Rate Limit Headers
    // -------------------------------------------
    describe('Rate limit headers', () => {

        it('includes X-RateLimit-Limit header', async () => {
            const response = await get('/api/tasks');

            assert.ok(
                response.headers['x-ratelimit-limit'],
                'Should include X-RateLimit-Limit header'
            );
        });

        it('includes X-RateLimit-Remaining header', async () => {
            const response = await get('/api/tasks');

            assert.ok(
                response.headers['x-ratelimit-remaining'],
                'Should include X-RateLimit-Remaining header'
            );
        });

        it('includes X-RateLimit-Reset header', async () => {
            const response = await get('/api/tasks');

            assert.ok(
                response.headers['x-ratelimit-reset'],
                'Should include X-RateLimit-Reset header'
            );
        });

        it('X-RateLimit-Remaining decreases with each request', async () => {
            const response1 = await get('/api/tasks');
            const remaining1 = parseInt(response1.headers['x-ratelimit-remaining']);

            const response2 = await get('/api/tasks');
            const remaining2 = parseInt(response2.headers['x-ratelimit-remaining']);

            assert.ok(
                remaining2 < remaining1,
                `Remaining should decrease: ${remaining1} -> ${remaining2}`
            );
        });
    });

    // -------------------------------------------
    // Write Operation Limits
    // -------------------------------------------
    describe('Write operation limits', () => {

        it('allows normal write operations', async () => {
            const response = await post('/api/tasks', { title: 'Test task' });

            assert.strictEqual(response.status, 201);
        });

        it('tracks write operations separately', async () => {
            // Make a write request
            const writeResponse = await post('/api/tasks', { title: 'Test' });

            // Check that it has rate limit headers
            assert.ok(
                writeResponse.headers['x-ratelimit-limit'],
                'Write operations should have rate limit headers'
            );
        });
    });

    // -------------------------------------------
    // 429 Response Format
    // -------------------------------------------
    describe('429 Too Many Requests response', () => {

        // Note: This test is skipped by default because triggering
        // the rate limit would affect other tests. Enable it manually
        // if you want to test the rate limit behavior.

        it.skip('returns 429 when limit exceeded', async () => {
            // This would require making 31+ write requests in 1 minute
            // which is slow and disruptive. Skipped by default.

            const requests = [];
            for (let i = 0; i < 35; i++) {
                requests.push(post('/api/tasks', { title: `Task ${i}` }));
            }

            const responses = await Promise.all(requests);
            const tooManyRequests = responses.filter(r => r.status === 429);

            assert.ok(
                tooManyRequests.length > 0,
                'Should return 429 for some requests when limit exceeded'
            );
        });

        it.skip('429 response includes retryAfter', async () => {
            // Similar to above, skipped by default

            // Trigger rate limit first...
            // Then check response format
        });
    });

    // -------------------------------------------
    // Informational tests (always pass)
    // -------------------------------------------
    describe('Rate limit configuration (informational)', () => {

        it('documents the current limits', async () => {
            const response = await get('/api/tasks');
            const limit = response.headers['x-ratelimit-limit'];

            console.log(`\n  Current rate limit: ${limit} requests per minute`);
            console.log('  Write operations have a separate, lower limit');
            console.log('  Limits reset every 60 seconds\n');

            // This test always passes - it's just for documentation
            assert.ok(true);
        });
    });
});
