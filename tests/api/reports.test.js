/**
 * API Integration tests for Reports endpoints
 *
 * IMPORTANT: These tests require the server to be running!
 *
 * To run:
 *   Terminal 1: node server.js
 *   Terminal 2: node --test tests/api/reports.test.js
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
const REPORTS_FILE = path.join(DATA_DIR, 'reports.json');
const TASKS_FILE = path.join(DATA_DIR, 'tasks.json');
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
const put = (path, body) => makeRequest('PUT', path, body);
const del = (path) => makeRequest('DELETE', path);

// ===========================================
// Test Suite
// ===========================================
describe('Reports API', () => {
    let originalReports;
    let originalTasks;
    let originalNotes;

    before(async () => {
        try {
            originalReports = await fs.readFile(REPORTS_FILE, 'utf8');
        } catch {
            originalReports = '[]';
        }
        try {
            originalTasks = await fs.readFile(TASKS_FILE, 'utf8');
        } catch {
            originalTasks = '[]';
        }
        try {
            originalNotes = await fs.readFile(NOTES_FILE, 'utf8');
        } catch {
            originalNotes = '{"content":""}';
        }
    });

    beforeEach(async () => {
        await fs.writeFile(REPORTS_FILE, '[]');
        await fs.writeFile(TASKS_FILE, '[]');
        await fs.writeFile(NOTES_FILE, '{"content":""}');
    });

    after(async () => {
        await fs.writeFile(REPORTS_FILE, originalReports);
        await fs.writeFile(TASKS_FILE, originalTasks);
        await fs.writeFile(NOTES_FILE, originalNotes);
    });

    // -------------------------------------------
    // GET /api/reports
    // -------------------------------------------
    describe('GET /api/reports', () => {

        it('returns 200 status', async () => {
            const response = await get('/api/reports');
            assert.strictEqual(response.status, 200);
        });

        it('returns empty array when no reports exist', async () => {
            const response = await get('/api/reports');
            assert.deepStrictEqual(response.body, []);
        });

        it('returns all reports', async () => {
            // Generate two reports
            await post('/api/reports/generate');
            await post('/api/reports/generate');

            const response = await get('/api/reports');
            assert.strictEqual(response.body.length, 2);
        });
    });

    // -------------------------------------------
    // POST /api/reports/generate
    // -------------------------------------------
    describe('POST /api/reports/generate', () => {

        it('generates a report', async () => {
            const response = await post('/api/reports/generate');

            assert.strictEqual(response.status, 200);
            assert.ok(response.body.id, 'Report should have an ID');
        });

        it('includes week number in title', async () => {
            const response = await post('/api/reports/generate');

            assert.ok(
                response.body.title.includes('Week'),
                `Title "${response.body.title}" should include "Week"`
            );
        });

        it('includes date range in title', async () => {
            const response = await post('/api/reports/generate');

            // Should have format like "Week 6 (Feb 2-8)"
            assert.ok(
                /Week \d+ \(.+\)/.test(response.body.title),
                `Title "${response.body.title}" should match week format`
            );
        });

        it('sets generatedDate', async () => {
            const before = new Date().toISOString();
            const response = await post('/api/reports/generate');
            const after = new Date().toISOString();

            assert.ok(response.body.generatedDate, 'Should have generatedDate');
            assert.ok(
                response.body.generatedDate >= before && response.body.generatedDate <= after,
                'generatedDate should be recent'
            );
        });

        it('includes content sections', async () => {
            const response = await post('/api/reports/generate');

            assert.ok('content' in response.body, 'Should have content');
            assert.ok('archived' in response.body.content, 'Should have archived section');
            assert.ok('inProgress' in response.body.content, 'Should have inProgress section');
            assert.ok('waiting' in response.body.content, 'Should have waiting section');
            assert.ok('todo' in response.body.content, 'Should have todo section');
        });

        it('captures tasks in report', async () => {
            // Create tasks in different columns
            await post('/api/tasks', { title: 'Todo Task' });

            const createDone = await post('/api/tasks', { title: 'Done Task' });
            await post(`/api/tasks/${createDone.body.id}/move`, {
                newStatus: 'done',
                newPosition: 0
            });

            const response = await post('/api/reports/generate');

            assert.strictEqual(response.body.content.todo.length, 1);
            assert.strictEqual(response.body.content.archived.length, 1);
        });

        it('captures notes in report', async () => {
            await post('/api/notes', { content: 'My test notes' });

            const response = await post('/api/reports/generate');

            assert.strictEqual(response.body.notes, 'My test notes');
        });

        it('does not archive tasks (snapshot only)', async () => {
            const createTask = await post('/api/tasks', { title: 'Test' });
            await post(`/api/tasks/${createTask.body.id}/move`, {
                newStatus: 'done',
                newPosition: 0
            });

            await post('/api/reports/generate');

            // Task should still be in tasks list
            const tasksResponse = await get('/api/tasks');
            assert.strictEqual(tasksResponse.body.length, 1);
            assert.strictEqual(tasksResponse.body[0].status, 'done');
        });
    });

    // -------------------------------------------
    // GET /api/reports/:id
    // -------------------------------------------
    describe('GET /api/reports/:id', () => {

        it('returns specific report', async () => {
            const generated = await post('/api/reports/generate');
            const reportId = generated.body.id;

            const response = await get(`/api/reports/${reportId}`);

            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.body.id, reportId);
        });

        it('returns 404 for non-existent report', async () => {
            const response = await get('/api/reports/nonexistent123');

            assert.strictEqual(response.status, 404);
        });
    });

    // -------------------------------------------
    // PUT /api/reports/:id
    // -------------------------------------------
    describe('PUT /api/reports/:id', () => {

        it('updates report title', async () => {
            const generated = await post('/api/reports/generate');
            const reportId = generated.body.id;

            const response = await put(`/api/reports/${reportId}`, {
                title: 'Custom Report Title'
            });

            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.body.title, 'Custom Report Title');
        });

        it('trims title whitespace', async () => {
            const generated = await post('/api/reports/generate');
            const reportId = generated.body.id;

            const response = await put(`/api/reports/${reportId}`, {
                title: '  Trimmed Title  '
            });

            assert.strictEqual(response.body.title, 'Trimmed Title');
        });

        it('returns 404 for non-existent report', async () => {
            const response = await put('/api/reports/nonexistent123', {
                title: 'New Title'
            });

            assert.strictEqual(response.status, 404);
        });
    });

    // -------------------------------------------
    // DELETE /api/reports/:id
    // -------------------------------------------
    describe('DELETE /api/reports/:id', () => {

        it('deletes a report', async () => {
            const generated = await post('/api/reports/generate');
            const reportId = generated.body.id;

            const deleteResponse = await del(`/api/reports/${reportId}`);
            assert.strictEqual(deleteResponse.status, 200);

            // Verify it's gone
            const getResponse = await get('/api/reports');
            assert.strictEqual(getResponse.body.length, 0);
        });

        it('returns success: true', async () => {
            const generated = await post('/api/reports/generate');

            const response = await del(`/api/reports/${generated.body.id}`);

            assert.strictEqual(response.body.success, true);
        });

        it('returns 404 for non-existent report', async () => {
            const response = await del('/api/reports/nonexistent123');

            assert.strictEqual(response.status, 404);
        });
    });

    // -------------------------------------------
    // POST /api/tasks/archive
    // -------------------------------------------
    describe('POST /api/tasks/archive', () => {

        it('archives done tasks', async () => {
            const task = await post('/api/tasks', { title: 'Test' });
            await post(`/api/tasks/${task.body.id}/move`, {
                newStatus: 'done',
                newPosition: 0
            });

            const response = await post('/api/tasks/archive');

            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.body.archivedCount, 1);
        });

        it('removes archived tasks from active tasks', async () => {
            const task = await post('/api/tasks', { title: 'Test' });
            await post(`/api/tasks/${task.body.id}/move`, {
                newStatus: 'done',
                newPosition: 0
            });

            await post('/api/tasks/archive');

            const tasksResponse = await get('/api/tasks');
            assert.strictEqual(tasksResponse.body.length, 0);
        });

        it('moves tasks to archived file', async () => {
            const task = await post('/api/tasks', { title: 'Test' });
            await post(`/api/tasks/${task.body.id}/move`, {
                newStatus: 'done',
                newPosition: 0
            });

            await post('/api/tasks/archive');

            const archivedResponse = await get('/api/archived');
            assert.strictEqual(archivedResponse.body.length, 1);
            assert.strictEqual(archivedResponse.body[0].status, 'archived');
        });

        it('returns 400 when no done tasks', async () => {
            // Create a task but don't move it to done
            await post('/api/tasks', { title: 'Still todo' });

            const response = await post('/api/tasks/archive');

            assert.strictEqual(response.status, 400);
            assert.ok(response.body.error, 'Should have error message');
        });

        it('does not archive non-done tasks', async () => {
            await post('/api/tasks', { title: 'Todo task' });

            const inProgress = await post('/api/tasks', { title: 'In progress' });
            await post(`/api/tasks/${inProgress.body.id}/move`, {
                newStatus: 'inprogress',
                newPosition: 0
            });

            const done = await post('/api/tasks', { title: 'Done task' });
            await post(`/api/tasks/${done.body.id}/move`, {
                newStatus: 'done',
                newPosition: 0
            });

            await post('/api/tasks/archive');

            // Only done task should be archived
            const archivedResponse = await get('/api/archived');
            assert.strictEqual(archivedResponse.body.length, 1);

            // Other tasks should remain
            const tasksResponse = await get('/api/tasks');
            assert.strictEqual(tasksResponse.body.length, 2);
        });
    });
});
