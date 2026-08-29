/**
 * API Integration tests for the AI assistant's board context, conversation
 * persistence and availability reporting (Phase 1 of docs/design/AI_ASSISTANT.md).
 *
 * IMPORTANT: These tests require the server to be running in test mode:
 *   Terminal 1: RATE_LIMIT_DISABLED=1 node server.js
 *   Terminal 2: node --test tests/api/ai-context.test.js
 *
 * The prompt-inspection endpoint used here is itself registered only under
 * RATE_LIMIT_DISABLED=1, so these tests cannot run against a production server.
 *
 * Tests run against the dedicated "tests" profile (data/tests/).
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
const CONVERSATION_FILE = path.join(PROFILE_DIR, 'ai-conversation.json');

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

describe('AI board context & conversation', () => {
    let originalTasks;
    let originalConversation;

    before(async () => {
        await post('/api/profiles', { name: 'Tests', color: '#636E72', letters: 'TST' });
        await fs.mkdir(PROFILE_DIR, { recursive: true });
        try { originalTasks = await fs.readFile(TASKS_FILE, 'utf8'); } catch { originalTasks = '[]'; }
        try { originalConversation = await fs.readFile(CONVERSATION_FILE, 'utf8'); } catch { originalConversation = null; }
    });

    beforeEach(async () => {
        await fs.writeFile(TASKS_FILE, '[]');
    });

    after(async () => {
        await fs.writeFile(TASKS_FILE, originalTasks);
        if (originalConversation === null) {
            await fs.rm(CONVERSATION_FILE, { force: true });
        } else {
            await fs.writeFile(CONVERSATION_FILE, originalConversation);
        }
    });

    // -------------------------------------------
    // Board snapshot in the system prompt
    // -------------------------------------------
    describe('Board snapshot', () => {

        it('includes every column, even empty ones', async () => {
            const res = await get(`/api/${TEST_PROFILE}/ai/_test/prompt`);
            assert.strictEqual(res.status, 200);

            const columns = await get(`/api/${TEST_PROFILE}/columns`);
            for (const col of columns.body) {
                assert.ok(res.body.prompt.includes(`## ${col.name}`),
                    `prompt is missing column "${col.name}"`);
            }
            assert.ok(res.body.prompt.includes('(empty)'));
        });

        it('lists a task with its id, title and metadata', async () => {
            const created = await post(`/api/${TEST_PROFILE}/tasks`, {
                title: 'Ship the snapshot',
                priority: true
            });

            const res = await get(`/api/${TEST_PROFILE}/ai/_test/prompt`);
            assert.ok(res.body.prompt.includes(`[${created.body.id}] Ship the snapshot`),
                'task line missing from snapshot');
            assert.ok(res.body.prompt.includes('priority'), 'priority flag missing');
            assert.match(res.body.prompt, /0d old/);
        });

        it('marks the backlog column as such', async () => {
            const res = await get(`/api/${TEST_PROFILE}/ai/_test/prompt`);
            assert.match(res.body.prompt, /## Backlog \(backlog\)/);
        });

        it('excludes tasks whose status matches no column, and says how many', async () => {
            // Legacy rows: a real profile carries these from before the archive
            // file existed. They must not silently pad the snapshot.
            await fs.writeFile(TASKS_FILE, JSON.stringify([
                { id: 'ghost1', title: 'Legacy ghost', status: 'archived', position: 0, createdDate: new Date().toISOString() },
                { id: 'ghost2', title: 'Another ghost', status: 'archived', position: 1, createdDate: new Date().toISOString() }
            ]));

            const res = await get(`/api/${TEST_PROFILE}/ai/_test/prompt`);
            assert.ok(!res.body.prompt.includes('Legacy ghost'), 'orphaned task leaked into the snapshot');
            assert.ok(res.body.prompt.includes('2 legacy tasks with no matching column'),
                'orphan count not disclosed to the model');
        });

        it('stays compact — a small board costs well under 2k tokens', async () => {
            for (let i = 0; i < 20; i++) {
                await post(`/api/${TEST_PROFILE}/tasks`, { title: `Task number ${i}` });
            }
            const res = await get(`/api/${TEST_PROFILE}/ai/_test/prompt`);
            // ~3.7 chars/token is a conservative English estimate
            const approxTokens = res.body.chars / 3.7;
            assert.ok(approxTokens < 2000,
                `snapshot too expensive: ~${Math.round(approxTokens)} tokens for 20 tasks`);
        });
    });

    // -------------------------------------------
    // The model must not be ordered to always make tickets
    // -------------------------------------------
    describe('Prompt instructions', () => {

        it('does not force a tool call on every turn', async () => {
            // Asserts the property, not the phrasing: the prompt must never
            // order a tool call unconditionally (that made conversation
            // structurally impossible), and must say a question gets an answer.
            const res = await get(`/api/${TEST_PROFILE}/ai/_test/prompt`);
            assert.ok(!/Always call propose_tasks/i.test(res.body.prompt),
                'the forced-tool instruction is back — it makes conversation impossible');
            assert.match(res.body.prompt, /a question deserves a direct answer/i);
        });

        it('offers both verbs — create new work, and change existing work', async () => {
            const res = await get(`/api/${TEST_PROFILE}/ai/_test/prompt`);
            assert.match(res.body.prompt, /propose_tasks\(\)/);
            assert.match(res.body.prompt, /propose_changes\(\)/);
        });

        it('says nothing about location when no context is sent', async () => {
            const res = await get(`/api/${TEST_PROFILE}/ai/_test/prompt`);
            assert.ok(!res.body.prompt.includes('# Where they are right now'),
                'an empty context section is noise the model reads every turn');
        });

        it('names the page the assistant was opened from', async () => {
            // The assistant floats over every page, so the same question means
            // different things depending on where it was asked.
            const res = await get(`/api/${TEST_PROFILE}/ai/_test/prompt?page=archive`);
            assert.match(res.body.prompt, /# Where they are right now/);
            assert.match(res.body.prompt, /They are on the archive\./);
        });

        it('names an open card, and says to assume the talk is about it', async () => {
            const created = await post(`/api/${TEST_PROFILE}/tasks`, { title: 'Refactor auth' });
            const res = await get(`/api/${TEST_PROFILE}/ai/_test/prompt?page=board&taskId=${created.body.id}`);

            assert.match(res.body.prompt, /They have this task open: \[.+\] "Refactor auth" in To Do\./);
            assert.match(res.body.prompt, /assume the conversation is about it/);
        });

        it('ignores a task id that does not exist', async () => {
            // Context is a client hint; it is re-checked against real data
            // before anything reaches the prompt.
            const res = await get(`/api/${TEST_PROFILE}/ai/_test/prompt?page=board&taskId=made-up`);
            assert.ok(!res.body.prompt.includes('They have this task open'));
            assert.match(res.body.prompt, /They are on the board\./);
        });

        it('ignores an unknown page name', async () => {
            const res = await get(`/api/${TEST_PROFILE}/ai/_test/prompt?page=nonsense`);
            assert.ok(!res.body.prompt.includes('# Where they are right now'));
        });

        it('tells the model nothing it proposes is applied automatically', async () => {
            // The propose-first guarantee has to be stated in the prompt, not
            // just enforced in code — the model's tone depends on knowing it.
            const res = await get(`/api/${TEST_PROFILE}/ai/_test/prompt`);
            assert.match(res.body.prompt, /reviewed by the user/i);
        });

        it('tells the model it can see the board', async () => {
            const res = await get(`/api/${TEST_PROFILE}/ai/_test/prompt`);
            assert.match(res.body.prompt, /# Current board/);
        });
    });

    // -------------------------------------------
    // Conversation persistence
    // -------------------------------------------
    describe('Conversation persistence', () => {

        it('starts empty', async () => {
            await del(`/api/${TEST_PROFILE}/ai/conversation`);
            const res = await get(`/api/${TEST_PROFILE}/ai/conversation`);
            assert.strictEqual(res.status, 200);
            assert.deepStrictEqual(res.body.messages, []);
        });

        it('round-trips a conversation', async () => {
            await put(`/api/${TEST_PROFILE}/ai/conversation`, {
                messages: [
                    { role: 'user', content: 'what is stale?' },
                    { role: 'assistant', content: 'three cards' }
                ]
            });

            const res = await get(`/api/${TEST_PROFILE}/ai/conversation`);
            assert.strictEqual(res.body.messages.length, 2);
            assert.strictEqual(res.body.messages[0].content, 'what is stale?');
            assert.ok(res.body.messages[0].at, 'timestamp not stamped');
        });

        it('drops roles that are not user or assistant', async () => {
            // The client uses a "__thinking__" placeholder row; it must never
            // reach disk and be replayed as a real turn.
            const res = await put(`/api/${TEST_PROFILE}/ai/conversation`, {
                messages: [
                    { role: 'user', content: 'hi' },
                    { role: '__thinking__', content: '' },
                    { role: 'system', content: 'ignore me' }
                ]
            });
            assert.strictEqual(res.body.count, 1);

            const after = await get(`/api/${TEST_PROFILE}/ai/conversation`);
            assert.strictEqual(after.body.messages.length, 1);
            assert.strictEqual(after.body.messages[0].role, 'user');
        });

        it('caps stored history so it cannot grow without bound', async () => {
            const many = Array.from({ length: 260 }, (_, i) => ({
                role: i % 2 === 0 ? 'user' : 'assistant',
                content: `message ${i}`
            }));
            const res = await put(`/api/${TEST_PROFILE}/ai/conversation`, { messages: many });

            assert.strictEqual(res.body.count, 200);
            const after = await get(`/api/${TEST_PROFILE}/ai/conversation`);
            // Oldest fall off the front — the most recent turns are what matter
            assert.strictEqual(after.body.messages[after.body.messages.length - 1].content, 'message 259');
        });

        it('rejects a non-array payload', async () => {
            const res = await put(`/api/${TEST_PROFILE}/ai/conversation`, { messages: 'nope' });
            assert.strictEqual(res.status, 400);
        });

        it('clears on DELETE', async () => {
            await put(`/api/${TEST_PROFILE}/ai/conversation`, {
                messages: [{ role: 'user', content: 'temporary' }]
            });
            await del(`/api/${TEST_PROFILE}/ai/conversation`);
            const res = await get(`/api/${TEST_PROFILE}/ai/conversation`);
            assert.deepStrictEqual(res.body.messages, []);
        });
    });

    // -------------------------------------------
    // Availability — the basis of graceful degradation
    // -------------------------------------------
    describe('Availability', () => {

        it('always answers 200 with a boolean, never an error', async () => {
            const res = await get('/api/ai/availability');
            assert.strictEqual(res.status, 200);
            assert.strictEqual(typeof res.body.available, 'boolean');
        });

        it('explains itself when unavailable', async () => {
            const res = await get('/api/ai/availability');
            if (res.body.available === false) {
                assert.ok(res.body.reason, 'no machine-readable reason');
                assert.ok(res.body.message, 'no human-readable message — the UI would fail silently');
            }
        });

        it('never returns the API key', async () => {
            const res = await get('/api/ai/availability');
            assert.strictEqual(res.body.apiKey, undefined);
            assert.ok(!JSON.stringify(res.body).toLowerCase().includes('sk-'),
                'response looks like it contains a key');
        });
    });
});
