/**
 * API Integration tests for Notes endpoints
 *
 * IMPORTANT: These tests require the server to be running!
 *
 * To run:
 *   Terminal 1: node server.js
 *   Terminal 2: node --test tests/api/notes.test.js
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
const NOTES_FILE = path.join(DATA_DIR, 'notes.json');

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
describe('Notes API', () => {
    let originalNotes;

    before(async () => {
        try {
            originalNotes = await fs.readFile(NOTES_FILE, 'utf8');
        } catch {
            originalNotes = '{"content":""}';
        }
    });

    beforeEach(async () => {
        await fs.writeFile(NOTES_FILE, '{"content":""}');
    });

    after(async () => {
        await fs.writeFile(NOTES_FILE, originalNotes);
    });

    // -------------------------------------------
    // GET /api/notes
    // -------------------------------------------
    describe('GET /api/notes', () => {

        it('returns 200 status', async () => {
            const response = await get('/api/notes');
            assert.strictEqual(response.status, 200);
        });

        it('returns object with content property', async () => {
            const response = await get('/api/notes');
            assert.ok('content' in response.body, 'Should have content property');
        });

        it('returns empty content when no notes exist', async () => {
            const response = await get('/api/notes');
            assert.strictEqual(response.body.content, '');
        });

        it('returns saved notes content', async () => {
            await post('/api/notes', { content: 'My notes' });

            const response = await get('/api/notes');
            assert.strictEqual(response.body.content, 'My notes');
        });
    });

    // -------------------------------------------
    // POST /api/notes
    // -------------------------------------------
    describe('POST /api/notes', () => {

        it('saves notes content', async () => {
            const response = await post('/api/notes', {
                content: 'Test notes content'
            });

            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.body.content, 'Test notes content');
        });

        it('overwrites existing notes', async () => {
            await post('/api/notes', { content: 'First' });
            await post('/api/notes', { content: 'Second' });

            const response = await get('/api/notes');
            assert.strictEqual(response.body.content, 'Second');
        });

        it('handles empty content', async () => {
            await post('/api/notes', { content: 'Something' });
            const response = await post('/api/notes', { content: '' });

            assert.strictEqual(response.body.content, '');
        });

        it('handles multiline content', async () => {
            const multiline = 'Line 1\nLine 2\nLine 3';
            const response = await post('/api/notes', { content: multiline });

            assert.strictEqual(response.body.content, multiline);
        });

        it('handles special characters', async () => {
            const special = 'Notes with "quotes" and \'apostrophes\' and <brackets>';
            const response = await post('/api/notes', { content: special });

            assert.strictEqual(response.body.content, special);
        });

        it('handles unicode characters', async () => {
            const unicode = 'Notes with emoji  and symbols';
            const response = await post('/api/notes', { content: unicode });

            assert.strictEqual(response.body.content, unicode);
        });

        it('handles missing content property', async () => {
            const response = await post('/api/notes', {});

            // Should default to empty string
            assert.strictEqual(response.body.content, '');
        });
    });
});
