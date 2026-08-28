/**
 * API Integration tests for task attachment endpoints.
 *
 * IMPORTANT: These tests require the server to be running!
 *
 * To run:
 *   Terminal 1: RATE_LIMIT_DISABLED=1 node server.js
 *   Terminal 2: node --test tests/api/attachments.test.js
 *
 * Tests run against the dedicated "tests" profile (data/tests/). The profile
 * is created on first run (idempotent) and never deleted. Real user data in
 * other profiles is never touched.
 */

const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs').promises;
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');

// ===========================================
// Configuration
// ===========================================
const BASE_URL = 'http://localhost:3001';
const TEST_PROFILE = 'tests';
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const PROFILE_DIR = path.join(DATA_DIR, TEST_PROFILE);
const TASKS_FILE = path.join(PROFILE_DIR, 'tasks.json');
const ARCHIVED_FILE = path.join(PROFILE_DIR, 'archived-tasks.json');
const STAGED_FILE = path.join(PROFILE_DIR, 'ai-staged-tasks.json');
const ATTACHMENTS_DIR = path.join(PROFILE_DIR, 'attachments');

/** Mirrors server.js MAX_ATTACHMENT_SIZE. */
const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;

// ===========================================
// HTTP helpers
// ===========================================

/** JSON request, matching the shape used by the other API test files. */
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
                resolve({ status: res.statusCode, body: parsedBody, headers: res.headers });
            });
        });
        req.on('error', (error) => {
            if (error.code === 'ECONNREFUSED') {
                reject(new Error('Connection refused. Is the server running?\nStart it with: RATE_LIMIT_DISABLED=1 node server.js'));
            } else {
                reject(error);
            }
        });
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

/**
 * Raw binary upload — the transport the attachment feature actually uses.
 * @param {string} urlPath
 * @param {Buffer} buffer
 * @param {string} contentType
 * @param {string} filename - Sent percent-encoded, as the client does.
 */
function upload(urlPath, buffer, contentType, filename) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlPath, BASE_URL);
        const req = http.request({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': contentType,
                'X-Attachment-Name': encodeURIComponent(filename),
                'Content-Length': buffer.length
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                let parsedBody = null;
                try { parsedBody = data ? JSON.parse(data) : null; } catch { parsedBody = data; }
                resolve({ status: res.statusCode, body: parsedBody, headers: res.headers });
            });
        });
        req.on('error', reject);
        req.write(buffer);
        req.end();
    });
}

/** Download, keeping the body as a Buffer so binary can be byte-compared. */
function download(urlPath) {
    return new Promise((resolve, reject) => {
        const url = new URL(urlPath, BASE_URL);
        http.get({
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search
        }, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve({
                status: res.statusCode,
                body: Buffer.concat(chunks),
                headers: res.headers
            }));
        }).on('error', reject);
    });
}

const get = (p) => makeRequest('GET', p);
const post = (p, body) => makeRequest('POST', p, body);
const del = (p) => makeRequest('DELETE', p);

/**
 * Builds a small but structurally real PNG. Its bytes include sequences that
 * are invalid UTF-8, which is the whole point: a body parser that decodes to a
 * string corrupts them, and the round-trip assertion catches that.
 * @returns {Buffer}
 */
function makePng() {
    const chunk = (type, data) => {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(data.length);
        return Buffer.concat([len, Buffer.from(type), data, Buffer.alloc(4)]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(2, 0);
    ihdr.writeUInt32BE(2, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    const pixels = Buffer.from([0, 255, 0, 0, 0, 0, 255, 0, 0, 255, 0, 0, 0, 0, 255]);
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(pixels)),
        chunk('IEND', Buffer.alloc(0))
    ]);
}

// ===========================================
// Test Suite
// ===========================================
describe('Attachments API', () => {
    let originalTasks;
    let originalArchived;
    let originalStaged;
    let taskId;

    before(async () => {
        await post('/api/profiles', { name: 'Tests', color: '#636E72', letters: 'TST' });
        await fs.mkdir(PROFILE_DIR, { recursive: true });
        const read = async (file) => {
            try { return await fs.readFile(file, 'utf8'); } catch { return '[]'; }
        };
        originalTasks = await read(TASKS_FILE);
        originalArchived = await read(ARCHIVED_FILE);
        originalStaged = await read(STAGED_FILE);
    });

    beforeEach(async () => {
        await fs.writeFile(TASKS_FILE, '[]');
        await fs.writeFile(ARCHIVED_FILE, '[]');
        await fs.writeFile(STAGED_FILE, '[]');
        await fs.rm(ATTACHMENTS_DIR, { recursive: true, force: true });
        const res = await post(`/api/${TEST_PROFILE}/tasks`, { title: 'Attachment host' });
        taskId = res.body.id;
    });

    // Restore whatever the profile held before the suite ran.
    after(async () => {
        await fs.writeFile(TASKS_FILE, originalTasks);
        await fs.writeFile(ARCHIVED_FILE, originalArchived);
        await fs.writeFile(STAGED_FILE, originalStaged);
        await fs.rm(ATTACHMENTS_DIR, { recursive: true, force: true });
    });

    // -------------------------------------------
    // Upload
    // -------------------------------------------
    describe('POST /api/tests/tasks/:id/attachments', () => {

        it('returns 201 with the attachment record', async () => {
            const res = await upload(`/api/${TEST_PROFILE}/tasks/${taskId}/attachments`,
                makePng(), 'image/png', 'shot.png');

            assert.strictEqual(res.status, 201);
            assert.strictEqual(res.body.name, 'shot.png');
            assert.strictEqual(res.body.mime, 'image/png');
            assert.strictEqual(res.body.ext, '.png');
            assert.ok(res.body.id);
            assert.ok(res.body.uploadedAt);
        });

        it('records the metadata on the task itself', async () => {
            await upload(`/api/${TEST_PROFILE}/tasks/${taskId}/attachments`,
                makePng(), 'image/png', 'shot.png');

            const tasks = await get(`/api/${TEST_PROFILE}/tasks`);
            const task = tasks.body.find(t => t.id === taskId);
            assert.strictEqual(task.attachments.length, 1);
            assert.strictEqual(task.attachments[0].name, 'shot.png');
        });

        it('stores the file under attachments/{taskId} named by id, not by filename', async () => {
            const res = await upload(`/api/${TEST_PROFILE}/tasks/${taskId}/attachments`,
                makePng(), 'image/png', 'shot.png');

            const files = await fs.readdir(path.join(ATTACHMENTS_DIR, taskId));
            assert.deepStrictEqual(files, [`${res.body.id}.png`]);
        });

        it('rejects a file over the size limit with 413', async () => {
            const tooBig = Buffer.alloc(MAX_ATTACHMENT_SIZE + 1024, 7);
            const res = await upload(`/api/${TEST_PROFILE}/tasks/${taskId}/attachments`,
                tooBig, 'image/png', 'huge.png');

            assert.strictEqual(res.status, 413);
        });

        it('rejects an empty body with 400', async () => {
            const res = await upload(`/api/${TEST_PROFILE}/tasks/${taskId}/attachments`,
                Buffer.alloc(0), 'image/png', 'empty.png');

            assert.strictEqual(res.status, 400);
        });

        it('returns 404 for an unknown task', async () => {
            const res = await upload(`/api/${TEST_PROFILE}/tasks/does-not-exist/attachments`,
                makePng(), 'image/png', 'shot.png');

            assert.strictEqual(res.status, 404);
        });

        it('stores a MIME type outside the allowlist as octet-stream', async () => {
            const res = await upload(`/api/${TEST_PROFILE}/tasks/${taskId}/attachments`,
                Buffer.from('<svg><script>alert(1)</script></svg>'), 'image/svg+xml', 'x.svg');

            assert.strictEqual(res.status, 201);
            assert.strictEqual(res.body.mime, 'application/octet-stream');
            assert.strictEqual(res.body.ext, '.bin');
        });

        it('neutralises a traversal filename', async () => {
            const res = await upload(`/api/${TEST_PROFILE}/tasks/${taskId}/attachments`,
                Buffer.from('hi'), 'text/plain', '../../../etc/passwd');

            assert.strictEqual(res.status, 201);
            // Separators are stripped from the display name. Literal ".." may
            // survive there and is harmless — what matters is the second
            // assertion: the name is never used as a path component, so the
            // file lands inside the task's own directory named by its id.
            assert.ok(!res.body.name.includes('/'), `name still has a separator: ${res.body.name}`);

            const files = await fs.readdir(path.join(ATTACHMENTS_DIR, taskId));
            assert.deepStrictEqual(files, [`${res.body.id}.txt`]);
        });
    });

    // -------------------------------------------
    // Download
    // -------------------------------------------
    describe('GET /api/tests/tasks/:id/attachments/:attachmentId', () => {

        it('returns the bytes unchanged', async () => {
            const png = makePng();
            const up = await upload(`/api/${TEST_PROFILE}/tasks/${taskId}/attachments`,
                png, 'image/png', 'shot.png');

            const res = await download(`/api/${TEST_PROFILE}/tasks/${taskId}/attachments/${up.body.id}`);
            assert.strictEqual(res.status, 200);
            assert.ok(png.equals(res.body), 'downloaded bytes differ from what was uploaded');
        });

        it('serves an allowlisted type inline, with nosniff', async () => {
            const up = await upload(`/api/${TEST_PROFILE}/tasks/${taskId}/attachments`,
                makePng(), 'image/png', 'shot.png');

            const res = await download(`/api/${TEST_PROFILE}/tasks/${taskId}/attachments/${up.body.id}`);
            assert.strictEqual(res.headers['content-type'], 'image/png');
            assert.strictEqual(res.headers['x-content-type-options'], 'nosniff');
            assert.match(res.headers['content-disposition'], /^inline;/);
        });

        it('forces a download for a type outside the allowlist', async () => {
            const up = await upload(`/api/${TEST_PROFILE}/tasks/${taskId}/attachments`,
                Buffer.from('<svg/>'), 'image/svg+xml', 'x.svg');

            const res = await download(`/api/${TEST_PROFILE}/tasks/${taskId}/attachments/${up.body.id}`);
            assert.strictEqual(res.headers['content-type'], 'application/octet-stream');
            assert.match(res.headers['content-disposition'], /^attachment;/);
        });

        it('honours ?download=1 for an otherwise inline type', async () => {
            const up = await upload(`/api/${TEST_PROFILE}/tasks/${taskId}/attachments`,
                makePng(), 'image/png', 'shot.png');

            const res = await download(`/api/${TEST_PROFILE}/tasks/${taskId}/attachments/${up.body.id}?download=1`);
            assert.match(res.headers['content-disposition'], /^attachment;/);
        });

        it('escapes quotes in the Content-Disposition filename', async () => {
            const up = await upload(`/api/${TEST_PROFILE}/tasks/${taskId}/attachments`,
                makePng(), 'image/png', 'we"ird.png');

            const res = await download(`/api/${TEST_PROFILE}/tasks/${taskId}/attachments/${up.body.id}`);
            const quoted = res.headers['content-disposition'].match(/filename="([^"]*)"/)[1];
            assert.ok(!quoted.includes('"'), 'a raw quote survived into the header');
        });

        it('returns 404 for an unknown attachment id', async () => {
            const res = await download(`/api/${TEST_PROFILE}/tasks/${taskId}/attachments/nope`);
            assert.strictEqual(res.status, 404);
        });
    });

    // -------------------------------------------
    // Delete
    // -------------------------------------------
    describe('DELETE /api/tests/tasks/:id/attachments/:attachmentId', () => {

        it('removes both the metadata and the file', async () => {
            const up = await upload(`/api/${TEST_PROFILE}/tasks/${taskId}/attachments`,
                makePng(), 'image/png', 'shot.png');

            const res = await del(`/api/${TEST_PROFILE}/tasks/${taskId}/attachments/${up.body.id}`);
            assert.strictEqual(res.status, 200);

            const tasks = await get(`/api/${TEST_PROFILE}/tasks`);
            assert.strictEqual(tasks.body.find(t => t.id === taskId).attachments.length, 0);

            const files = await fs.readdir(ATTACHMENTS_DIR).catch(() => []);
            const taskFiles = files.includes(taskId)
                ? await fs.readdir(path.join(ATTACHMENTS_DIR, taskId)).catch(() => [])
                : [];
            assert.deepStrictEqual(taskFiles, []);
        });

        it('returns 404 for an unknown attachment id', async () => {
            const res = await del(`/api/${TEST_PROFILE}/tasks/${taskId}/attachments/nope`);
            assert.strictEqual(res.status, 404);
        });
    });

    // -------------------------------------------
    // Lifecycle
    // -------------------------------------------
    describe('Attachment lifecycle', () => {

        it('follows a task into the archive and back', async () => {
            const up = await upload(`/api/${TEST_PROFILE}/tasks/${taskId}/attachments`,
                makePng(), 'image/png', 'shot.png');

            const columns = await get(`/api/${TEST_PROFILE}/columns`);
            const doneCol = columns.body.find(c => c.hasArchive);
            await post(`/api/${TEST_PROFILE}/tasks/${taskId}/move`, { newStatus: doneCol.id, newPosition: 0 });
            await post(`/api/${TEST_PROFILE}/tasks/archive`, { columnId: doneCol.id });

            const archived = await get(`/api/${TEST_PROFILE}/archived`);
            const archivedTask = archived.body.find(t => t.id === taskId);
            assert.strictEqual(archivedTask.attachments.length, 1);

            // Downloadable while archived — the route searches every store
            let res = await download(`/api/${TEST_PROFILE}/tasks/${taskId}/attachments/${up.body.id}`);
            assert.strictEqual(res.status, 200);

            await post(`/api/${TEST_PROFILE}/archived/${taskId}/restore`);
            res = await download(`/api/${TEST_PROFILE}/tasks/${taskId}/attachments/${up.body.id}`);
            assert.strictEqual(res.status, 200);
        });

        it('deletes every attachment when the task is deleted', async () => {
            for (const name of ['one.png', 'two.png', 'three.png']) {
                await upload(`/api/${TEST_PROFILE}/tasks/${taskId}/attachments`,
                    makePng(), 'image/png', name);
            }
            const before = await fs.readdir(path.join(ATTACHMENTS_DIR, taskId));
            assert.strictEqual(before.length, 3);

            await del(`/api/${TEST_PROFILE}/tasks/${taskId}`);

            const exists = await fs.access(path.join(ATTACHMENTS_DIR, taskId)).then(() => true, () => false);
            assert.strictEqual(exists, false, 'attachment directory outlived its task');
        });

        it('deletes the attachment directory when a staged task is deleted', async () => {
            const staged = await post(`/api/${TEST_PROFILE}/ai/staged`, { title: 'Throwaway proposal' });
            await upload(`/api/${TEST_PROFILE}/tasks/${staged.body.id}/attachments`,
                makePng(), 'image/png', 'shot.png');

            await del(`/api/${TEST_PROFILE}/ai/staged/${staged.body.id}`);

            const exists = await fs.access(path.join(ATTACHMENTS_DIR, staged.body.id)).then(() => true, () => false);
            assert.strictEqual(exists, false, 'staged task directory outlived its task');
        });

        it('re-keys the attachment directory when a staged task is promoted', async () => {
            const staged = await post(`/api/${TEST_PROFILE}/ai/staged`, { title: 'Proposed work' });
            const stagedId = staged.body.id;

            const up = await upload(`/api/${TEST_PROFILE}/tasks/${stagedId}/attachments`,
                makePng(), 'image/png', 'shot.png');
            assert.strictEqual(up.status, 201);

            const promoted = await post(`/api/${TEST_PROFILE}/ai/staged/${stagedId}/promote/board`);
            const newId = promoted.body.task.id;

            assert.strictEqual(promoted.body.task.attachments.length, 1);
            assert.notStrictEqual(newId, stagedId);

            const res = await download(`/api/${TEST_PROFILE}/tasks/${newId}/attachments/${up.body.id}`);
            assert.strictEqual(res.status, 200);

            const oldDirExists = await fs.access(path.join(ATTACHMENTS_DIR, stagedId)).then(() => true, () => false);
            assert.strictEqual(oldDirExists, false, 'staged task directory was left behind');
        });
    });
});
