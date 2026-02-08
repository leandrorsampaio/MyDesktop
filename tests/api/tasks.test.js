/**
 * API Integration tests for Tasks endpoints
 *
 * IMPORTANT: These tests require the server to be running!
 *
 * To run:
 *   Terminal 1: node server.js
 *   Terminal 2: node --test tests/api/tasks.test.js
 *
 * These tests will modify the tasks.json file. They save and restore
 * the original data, but it's recommended to run against a test instance.
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
// HTTP Helper (vanilla replacement for supertest)
// ===========================================
function makeRequest(method, urlPath, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlPath, BASE_URL);
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsedBody = null;
                try {
                    parsedBody = data ? JSON.parse(data) : null;
                } catch {
                    parsedBody = data;
                }
                resolve({
                    status: res.statusCode,
                    body: parsedBody
                });
            });
        });

        req.on('error', (error) => {
            if (error.code === 'ECONNREFUSED') {
                reject(new Error(
                    'Connection refused. Is the server running?\n' +
                    'Start the server with: node server.js'
                ));
            } else {
                reject(error);
            }
        });

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

// Helper shortcuts
const get = (path) => makeRequest('GET', path);
const post = (path, body) => makeRequest('POST', path, body);
const put = (path, body) => makeRequest('PUT', path, body);
const del = (path) => makeRequest('DELETE', path);

// ===========================================
// Test Suite
// ===========================================
describe('Tasks API', () => {
    let originalTasks;

    // Save original tasks before all tests
    before(async () => {
        try {
            originalTasks = await fs.readFile(TASKS_FILE, 'utf8');
        } catch {
            originalTasks = '[]';
        }
    });

    // Reset tasks file before each test
    beforeEach(async () => {
        await fs.writeFile(TASKS_FILE, '[]');
    });

    // Restore original tasks after all tests
    after(async () => {
        await fs.writeFile(TASKS_FILE, originalTasks);
    });

    // -------------------------------------------
    // GET /api/tasks
    // -------------------------------------------
    describe('GET /api/tasks', () => {

        it('returns 200 status', async () => {
            const response = await get('/api/tasks');
            assert.strictEqual(response.status, 200);
        });

        it('returns empty array when no tasks exist', async () => {
            const response = await get('/api/tasks');
            assert.deepStrictEqual(response.body, []);
        });

        it('returns all tasks', async () => {
            // Create two tasks
            await post('/api/tasks', { title: 'Task 1' });
            await post('/api/tasks', { title: 'Task 2' });

            const response = await get('/api/tasks');

            assert.strictEqual(response.status, 200);
            assert.strictEqual(response.body.length, 2);
        });

        it('returns tasks as array', async () => {
            const response = await get('/api/tasks');
            assert.ok(Array.isArray(response.body), 'Response should be an array');
        });
    });

    // -------------------------------------------
    // POST /api/tasks
    // -------------------------------------------
    describe('POST /api/tasks', () => {

        it('creates a new task with valid data', async () => {
            const newTask = {
                title: 'Test Task',
                description: 'Test Description',
                category: 2,
                priority: true
            };

            const response = await post('/api/tasks', newTask);

            assert.strictEqual(response.status, 201);
            assert.strictEqual(response.body.title, 'Test Task');
            assert.strictEqual(response.body.description, 'Test Description');
            assert.strictEqual(response.body.category, 2);
            assert.strictEqual(response.body.priority, true);
        });

        it('generates an ID for new task', async () => {
            const response = await post('/api/tasks', { title: 'Test' });

            assert.ok(response.body.id, 'Task should have an ID');
            assert.strictEqual(typeof response.body.id, 'string');
            assert.ok(response.body.id.length > 0, 'ID should not be empty');
        });

        it('sets default status to "todo"', async () => {
            const response = await post('/api/tasks', { title: 'Test' });

            assert.strictEqual(response.body.status, 'todo');
        });

        it('sets default position to 0 for first task', async () => {
            const response = await post('/api/tasks', { title: 'Test' });

            assert.strictEqual(response.body.position, 0);
        });

        it('increments position for subsequent tasks', async () => {
            await post('/api/tasks', { title: 'Task 1' });
            const response = await post('/api/tasks', { title: 'Task 2' });

            assert.strictEqual(response.body.position, 1);
        });

        it('sets default category to 1 if not provided', async () => {
            const response = await post('/api/tasks', { title: 'No category' });

            assert.strictEqual(response.body.category, 1);
        });

        it('sets default priority to false if not provided', async () => {
            const response = await post('/api/tasks', { title: 'No priority' });

            assert.strictEqual(response.body.priority, false);
        });

        it('sets default description to empty string if not provided', async () => {
            const response = await post('/api/tasks', { title: 'No description' });

            assert.strictEqual(response.body.description, '');
        });

        it('initializes empty log array', async () => {
            const response = await post('/api/tasks', { title: 'Test' });

            assert.ok(Array.isArray(response.body.log), 'Log should be an array');
            assert.strictEqual(response.body.log.length, 0, 'Log should be empty');
        });

        it('sets createdDate', async () => {
            const before = new Date().toISOString();
            const response = await post('/api/tasks', { title: 'Test' });
            const after = new Date().toISOString();

            assert.ok(response.body.createdDate, 'Should have createdDate');
            assert.ok(
                response.body.createdDate >= before && response.body.createdDate <= after,
                'createdDate should be recent'
            );
        });

        it('trims whitespace from title', async () => {
            const response = await post('/api/tasks', { title: '  Trimmed Title  ' });

            assert.strictEqual(response.body.title, 'Trimmed Title');
        });

        it('returns 400 when title is missing', async () => {
            const response = await post('/api/tasks', { description: 'No title' });

            assert.strictEqual(response.status, 400);
            assert.ok(response.body.error, 'Should return error message');
        });

        it('returns 400 when title is empty string', async () => {
            const response = await post('/api/tasks', { title: '' });

            assert.strictEqual(response.status, 400);
        });

        it('returns 400 when title is whitespace only', async () => {
            const response = await post('/api/tasks', { title: '   ' });

            assert.strictEqual(response.status, 400);
        });
    });

    // -------------------------------------------
    // PUT /api/tasks/:id
    // -------------------------------------------
    describe('PUT /api/tasks/:id', () => {

        it('updates task title', async () => {
            const createResponse = await post('/api/tasks', { title: 'Original' });
            const taskId = createResponse.body.id;

            const updateResponse = await put(`/api/tasks/${taskId}`, {
                title: 'Updated Title'
            });

            assert.strictEqual(updateResponse.status, 200);
            assert.strictEqual(updateResponse.body.title, 'Updated Title');
        });

        it('updates task description', async () => {
            const createResponse = await post('/api/tasks', { title: 'Test' });
            const taskId = createResponse.body.id;

            const updateResponse = await put(`/api/tasks/${taskId}`, {
                description: 'New Description'
            });

            assert.strictEqual(updateResponse.body.description, 'New Description');
        });

        it('updates task priority', async () => {
            const createResponse = await post('/api/tasks', { title: 'Test', priority: false });
            const taskId = createResponse.body.id;

            const updateResponse = await put(`/api/tasks/${taskId}`, {
                priority: true
            });

            assert.strictEqual(updateResponse.body.priority, true);
        });

        it('logs category change', async () => {
            const createResponse = await post('/api/tasks', { title: 'Test', category: 1 });
            const taskId = createResponse.body.id;

            const updateResponse = await put(`/api/tasks/${taskId}`, {
                category: 2
            });

            assert.strictEqual(updateResponse.body.category, 2);
            assert.ok(updateResponse.body.log.length > 0, 'Should have log entry');
            assert.ok(
                updateResponse.body.log[0].action.includes('Category changed'),
                'Log should mention category change'
            );
        });

        it('returns 404 for non-existent task', async () => {
            const response = await put('/api/tasks/nonexistent123', {
                title: 'Updated'
            });

            assert.strictEqual(response.status, 404);
        });

        it('preserves fields not included in update', async () => {
            const createResponse = await post('/api/tasks', {
                title: 'Test',
                description: 'Original Description',
                priority: true
            });
            const taskId = createResponse.body.id;

            const updateResponse = await put(`/api/tasks/${taskId}`, {
                title: 'New Title'
            });

            // Description and priority should be unchanged
            assert.strictEqual(updateResponse.body.description, 'Original Description');
            assert.strictEqual(updateResponse.body.priority, true);
        });
    });

    // -------------------------------------------
    // DELETE /api/tasks/:id
    // -------------------------------------------
    describe('DELETE /api/tasks/:id', () => {

        it('deletes an existing task', async () => {
            const createResponse = await post('/api/tasks', { title: 'To Delete' });
            const taskId = createResponse.body.id;

            const deleteResponse = await del(`/api/tasks/${taskId}`);
            assert.strictEqual(deleteResponse.status, 200);

            // Verify it's gone
            const getResponse = await get('/api/tasks');
            assert.strictEqual(getResponse.body.length, 0);
        });

        it('returns success: true on deletion', async () => {
            const createResponse = await post('/api/tasks', { title: 'To Delete' });
            const taskId = createResponse.body.id;

            const deleteResponse = await del(`/api/tasks/${taskId}`);

            assert.strictEqual(deleteResponse.body.success, true);
        });

        it('returns 404 for non-existent task', async () => {
            const response = await del('/api/tasks/nonexistent123');

            assert.strictEqual(response.status, 404);
        });

        it('only deletes the specified task', async () => {
            await post('/api/tasks', { title: 'Task 1' });
            const toDelete = await post('/api/tasks', { title: 'Task 2' });
            await post('/api/tasks', { title: 'Task 3' });

            await del(`/api/tasks/${toDelete.body.id}`);

            const remaining = await get('/api/tasks');
            assert.strictEqual(remaining.body.length, 2);
            assert.ok(
                remaining.body.every(t => t.id !== toDelete.body.id),
                'Deleted task should not be in list'
            );
        });
    });

    // -------------------------------------------
    // POST /api/tasks/:id/move
    // -------------------------------------------
    describe('POST /api/tasks/:id/move', () => {

        it('moves task to different status', async () => {
            const createResponse = await post('/api/tasks', { title: 'Test' });
            const taskId = createResponse.body.id;

            const moveResponse = await post(`/api/tasks/${taskId}/move`, {
                newStatus: 'inprogress',
                newPosition: 0
            });

            assert.strictEqual(moveResponse.status, 200);
            assert.strictEqual(moveResponse.body.status, 'inprogress');
        });

        it('logs status change', async () => {
            const createResponse = await post('/api/tasks', { title: 'Test' });
            const taskId = createResponse.body.id;

            const moveResponse = await post(`/api/tasks/${taskId}/move`, {
                newStatus: 'done',
                newPosition: 0
            });

            assert.ok(moveResponse.body.log.length > 0, 'Should have log entry');
            assert.ok(
                moveResponse.body.log[0].action.includes('Moved from'),
                'Log should describe the move'
            );
        });

        it('updates position', async () => {
            const createResponse = await post('/api/tasks', { title: 'Test' });
            const taskId = createResponse.body.id;

            const moveResponse = await post(`/api/tasks/${taskId}/move`, {
                newStatus: 'todo',
                newPosition: 5
            });

            assert.strictEqual(moveResponse.body.position, 5);
        });

        it('returns 404 for non-existent task', async () => {
            const response = await post('/api/tasks/nonexistent123/move', {
                newStatus: 'done'
            });

            assert.strictEqual(response.status, 404);
        });
    });
});
