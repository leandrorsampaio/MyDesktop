/**
 * API Integration tests for assistant long-term memory
 * (Phase 7 of docs/design/AI_ASSISTANT.md).
 *
 * The contract under test: memory is a plain readable list, the AI can propose
 * entries but never adds one, and only approved entries reach the prompt.
 *
 * IMPORTANT: requires the server running in test mode:
 *   Terminal 1: RATE_LIMIT_DISABLED=1 node server.js
 *   Terminal 2: node --test tests/api/memory.test.js
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
const MEMORY_FILE = path.join(PROFILE_DIR, 'ai-memory.json');

/** Mirrors server.js MEMORY_TEXT_MAX_LENGTH. */
const TEXT_MAX = 300;

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
const del = (p) => makeRequest('DELETE', p);

const prompt = async () => (await get(`/api/${TEST_PROFILE}/ai/_test/prompt`)).body.prompt;

describe('AI memory API', () => {
    let originalMemory;

    before(async () => {
        await post('/api/profiles', { name: 'Tests', color: '#636E72', letters: 'TST' });
        await fs.mkdir(PROFILE_DIR, { recursive: true });
        try { originalMemory = await fs.readFile(MEMORY_FILE, 'utf8'); } catch { originalMemory = null; }
    });

    beforeEach(async () => {
        await fs.writeFile(MEMORY_FILE, '[]');
    });

    after(async () => {
        if (originalMemory === null) await fs.rm(MEMORY_FILE, { force: true });
        else await fs.writeFile(MEMORY_FILE, originalMemory);
    });

    describe('Hand-written memories', () => {

        it('starts empty', async () => {
            const res = await get(`/api/${TEST_PROFILE}/ai/memory`);
            assert.deepStrictEqual(res.body, []);
        });

        it('is approved immediately — the user wrote it', async () => {
            const res = await post(`/api/${TEST_PROFILE}/ai/memory`, { text: 'A 5 is one focused day.' });
            assert.strictEqual(res.status, 201);
            assert.strictEqual(res.body.approved, true);
            assert.strictEqual(res.body.source, 'user');
        });

        it('reaches the prompt', async () => {
            await post(`/api/${TEST_PROFILE}/ai/memory`, { text: 'ESB- tickets belong to ECOM.' });
            assert.match(await prompt(), /ESB- tickets belong to ECOM\./);
        });

        it('rejects empty text', async () => {
            const res = await post(`/api/${TEST_PROFILE}/ai/memory`, { text: '   ' });
            assert.strictEqual(res.status, 400);
        });

        it('rejects text past the length cap', async () => {
            const res = await post(`/api/${TEST_PROFILE}/ai/memory`, { text: 'x'.repeat(TEXT_MAX + 1) });
            assert.strictEqual(res.status, 400);
        });

        it('is editable', async () => {
            const created = await post(`/api/${TEST_PROFILE}/ai/memory`, { text: 'Original' });
            const updated = await put(`/api/${TEST_PROFILE}/ai/memory/${created.body.id}`, { text: 'Corrected' });

            assert.strictEqual(updated.body.text, 'Corrected');
            assert.match(await prompt(), /Corrected/);
        });

        it('is deletable, and leaves the prompt when it goes', async () => {
            const created = await post(`/api/${TEST_PROFILE}/ai/memory`, { text: 'Forget me' });
            assert.match(await prompt(), /Forget me/);

            await del(`/api/${TEST_PROFILE}/ai/memory/${created.body.id}`);
            assert.ok(!(await prompt()).includes('Forget me'));
        });

        it('404s for an unknown id', async () => {
            assert.strictEqual((await put(`/api/${TEST_PROFILE}/ai/memory/nope`, { text: 'x' })).status, 404);
            assert.strictEqual((await del(`/api/${TEST_PROFILE}/ai/memory/nope`)).status, 404);
        });
    });

    describe('The approval gate', () => {

        /** Writes an unapproved entry the way a propose_memory call would. */
        async function seedProposed(text) {
            const list = JSON.parse(await fs.readFile(MEMORY_FILE, 'utf8'));
            const entry = {
                id: `m${list.length}`, text, source: 'ai',
                approved: false, createdAt: new Date().toISOString()
            };
            list.push(entry);
            await fs.writeFile(MEMORY_FILE, JSON.stringify(list, null, 2));
            return entry;
        }

        it('keeps an unapproved suggestion out of the prompt', async () => {
            // The core promise: the AI can propose, but nothing it proposes is
            // used until a human says so.
            await seedProposed('Never actually true.');
            assert.ok(!(await prompt()).includes('Never actually true'));
        });

        it('still returns unapproved entries, so they can be reviewed', async () => {
            await seedProposed('Pending suggestion.');
            const res = await get(`/api/${TEST_PROFILE}/ai/memory`);
            assert.strictEqual(res.body.length, 1);
            assert.strictEqual(res.body[0].approved, false);
        });

        it('lets approval move an entry into the prompt', async () => {
            const seeded = await seedProposed('Solenis is compliance work.');
            assert.ok(!(await prompt()).includes('Solenis is compliance work'));

            await put(`/api/${TEST_PROFILE}/ai/memory/${seeded.id}`, { approved: true });
            assert.match(await prompt(), /Solenis is compliance work\./);
        });

        it('lets approval be revoked', async () => {
            const created = await post(`/api/${TEST_PROFILE}/ai/memory`, { text: 'Temporarily true.' });
            await put(`/api/${TEST_PROFILE}/ai/memory/${created.body.id}`, { approved: false });
            assert.ok(!(await prompt()).includes('Temporarily true'));
        });

        it('rejects a non-boolean approved flag', async () => {
            const created = await post(`/api/${TEST_PROFILE}/ai/memory`, { text: 'Something' });
            const res = await put(`/api/${TEST_PROFILE}/ai/memory/${created.body.id}`, { approved: 'yes' });
            assert.strictEqual(res.status, 400);
        });
    });

    describe('The prompt section', () => {

        it('is omitted entirely when nothing is approved', async () => {
            // An empty heading is noise the model has to read on every message.
            assert.ok(!(await prompt()).includes('What you already know'));
        });

        it('appears once something is approved', async () => {
            await post(`/api/${TEST_PROFILE}/ai/memory`, { text: 'I batch header work.' });
            assert.match(await prompt(), /What you already know about how they work/);
        });

        it('stays within its character budget', async () => {
            // Memory rides along with the board snapshot on every message, so
            // it needs a ceiling of its own.
            for (let i = 0; i < 30; i++) {
                await post(`/api/${TEST_PROFILE}/ai/memory`, { text: `Fact number ${i}: ${'y'.repeat(250)}` });
            }
            const section = (await prompt())
                .split('# What you already know about how they work')[1]
                .split('# Columns')[0];
            assert.ok(section.length <= 4200, `memory section too large: ${section.length} chars`);
        });
    });
});
