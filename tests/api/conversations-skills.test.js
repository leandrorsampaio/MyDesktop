/**
 * API Integration tests for saved conversations and skills.
 *
 * The two things under test:
 *   1. Starting a new conversation no longer destroys the previous one — the
 *      old single-transcript store had nowhere to put a second thread, so
 *      "clear" was the only way to change topic.
 *   2. Skills reach the system prompt: always-on ones always, selected ones
 *      only when the conversation asks for them.
 *
 * IMPORTANT: requires the server running in test mode:
 *   Terminal 1: RATE_LIMIT_DISABLED=1 node server.js
 *   Terminal 2: node --test tests/api/conversations-skills.test.js
 */

const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs').promises;
const path = require('node:path');
const http = require('node:http');

const BASE_URL = 'http://localhost:3001';
const TEST_PROFILE = 'tests';
const PROFILE_DIR = path.join(__dirname, '..', '..', 'data', TEST_PROFILE);
const CONVERSATION_FILE = path.join(PROFILE_DIR, 'ai-conversation.json');
const SKILLS_FILE = path.join(PROFILE_DIR, 'ai-skills.json');

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

const api = (p) => `/api/${TEST_PROFILE}${p}`;
const saveTranscript = (messages, skillIds) => put(api('/ai/conversation'), skillIds ? { messages, skillIds } : { messages });
const msg = (content, role = 'user') => ({ role, content });

describe('Conversations & skills', () => {
    let originals = {};

    before(async () => {
        await post('/api/profiles', { name: 'Tests', color: '#636E72', letters: 'TST' });
        await fs.mkdir(PROFILE_DIR, { recursive: true });
        for (const [key, file] of [['convo', CONVERSATION_FILE], ['skills', SKILLS_FILE]]) {
            try { originals[key] = await fs.readFile(file, 'utf8'); } catch { originals[key] = null; }
        }
    });

    beforeEach(async () => {
        await fs.writeFile(CONVERSATION_FILE, JSON.stringify({ activeId: null, conversations: [] }));
        await fs.writeFile(SKILLS_FILE, '[]');
    });

    after(async () => {
        for (const [key, file] of [['convo', CONVERSATION_FILE], ['skills', SKILLS_FILE]]) {
            if (originals[key] === null) await fs.rm(file, { force: true });
            else await fs.writeFile(file, originals[key]);
        }
    });

    // -------------------------------------------
    // Saved conversations
    // -------------------------------------------
    describe('Saved conversations', () => {

        it('migrates a pre-v2.58 transcript instead of discarding it', async () => {
            // The old shape held one conversation and nothing else. Upgrading
            // must not be the thing that loses it.
            await fs.writeFile(CONVERSATION_FILE, JSON.stringify({
                messages: [
                    { role: 'user', content: 'What should I work on?', at: '2026-08-01T09:00:00.000Z' },
                    { role: 'assistant', content: 'The ECOM deploy.', at: '2026-08-01T09:00:05.000Z' }
                ]
            }));

            const res = await get(api('/ai/conversations'));
            assert.strictEqual(res.body.conversations.length, 1);
            assert.strictEqual(res.body.conversations[0].messageCount, 2);
            assert.strictEqual(res.body.conversations[0].title, 'What should I work on?');
        });

        it('keeps the previous thread when a new one starts', async () => {
            // The whole complaint: the only way to change topic destroyed the
            // conversation you were having.
            await saveTranscript([msg('First topic'), msg('Answer', 'assistant')]);
            await post(api('/ai/conversations'), {});
            await saveTranscript([msg('Second topic')]);

            const res = await get(api('/ai/conversations'));
            const titles = res.body.conversations.map(c => c.title);
            assert.deepStrictEqual(titles, ['Second topic', 'First topic'], 'newest first, both kept');
        });

        it('reopens a thread with its transcript intact', async () => {
            await saveTranscript([msg('Original thread'), msg('Reply', 'assistant')]);
            const list = await get(api('/ai/conversations'));
            const firstId = list.body.conversations[0].id;

            await post(api('/ai/conversations'), {});
            await saveTranscript([msg('A different thread')]);

            const reopened = await put(api(`/ai/conversations/${firstId}/activate`), {});
            assert.strictEqual(reopened.status, 200);
            assert.deepStrictEqual(reopened.body.messages.map(m => m.content), ['Original thread', 'Reply']);

            // And it is genuinely the active one now, not just returned.
            const active = await get(api('/ai/conversation'));
            assert.strictEqual(active.body.id, firstId);
        });

        it('titles a thread from its first message', async () => {
            await saveTranscript([msg('Plan the migration for next quarter')]);
            const res = await get(api('/ai/conversation'));
            assert.strictEqual(res.body.title, 'Plan the migration for next quarter');
        });

        it('never overwrites a title the user chose', async () => {
            await saveTranscript([msg('Original opener')]);
            const list = await get(api('/ai/conversations'));
            const id = list.body.conversations[0].id;

            await put(api(`/ai/conversations/${id}`), { title: 'My own name' });
            await saveTranscript([msg('Original opener'), msg('More'), msg('Even more')]);

            const res = await get(api('/ai/conversation'));
            assert.strictEqual(res.body.title, 'My own name');
        });

        it('reuses an untouched thread rather than stacking empty ones', async () => {
            await post(api('/ai/conversations'), {});
            await post(api('/ai/conversations'), {});
            await post(api('/ai/conversations'), {});

            const res = await get(api('/ai/conversations'));
            assert.strictEqual(res.body.conversations.length, 1);
        });

        it('always leaves a thread to write into after deleting the last one', async () => {
            await saveTranscript([msg('The only thread')]);
            const list = await get(api('/ai/conversations'));

            const res = await del(api(`/ai/conversations/${list.body.conversations[0].id}`));
            assert.strictEqual(res.status, 200);
            assert.ok(res.body.activeId, 'no active conversation left');

            const active = await get(api('/ai/conversation'));
            assert.deepStrictEqual(active.body.messages, []);
        });

        it('falls back to another thread when the open one is deleted', async () => {
            await saveTranscript([msg('Keep me')]);
            await post(api('/ai/conversations'), {});
            await saveTranscript([msg('Delete me')]);

            const before = await get(api('/ai/conversation'));
            await del(api(`/ai/conversations/${before.body.id}`));

            const after = await get(api('/ai/conversation'));
            assert.notStrictEqual(after.body.id, before.body.id);
            assert.deepStrictEqual(after.body.messages.map(m => m.content), ['Keep me']);
        });

        it('clears the open thread without removing it from history', async () => {
            await saveTranscript([msg('Something to forget')]);
            await del(api('/ai/conversation'));

            const active = await get(api('/ai/conversation'));
            assert.deepStrictEqual(active.body.messages, []);

            const list = await get(api('/ai/conversations'));
            assert.strictEqual(list.body.conversations.length, 1, 'the thread itself was removed');
        });

        it('404s for an unknown conversation', async () => {
            assert.strictEqual((await put(api('/ai/conversations/nope/activate'), {})).status, 404);
            assert.strictEqual((await del(api('/ai/conversations/nope'))).status, 404);
        });
    });

    // -------------------------------------------
    // Skills
    // -------------------------------------------
    describe('Skills', () => {

        const brief = { name: 'Be brief', instructions: 'At most 3 sentences.', alwaysOn: true };
        const ticket = { name: 'Ticket writer', instructions: 'Imperative titles.', alwaysOn: false };

        it('creates a skill', async () => {
            const res = await post(api('/ai/skills'), brief);
            assert.strictEqual(res.status, 201);
            assert.strictEqual(res.body.name, 'Be brief');
            assert.strictEqual(res.body.alwaysOn, true);
        });

        it('requires a name and instructions', async () => {
            assert.strictEqual((await post(api('/ai/skills'), { instructions: 'x' })).status, 400);
            assert.strictEqual((await post(api('/ai/skills'), { name: 'x' })).status, 400);
        });

        it('rejects over-long instructions', async () => {
            const res = await post(api('/ai/skills'), { name: 'Long', instructions: 'x'.repeat(1200) });
            assert.strictEqual(res.status, 400);
            assert.match(res.body.error, /1000 characters or less/);
        });

        it('updates one field without disturbing the others', async () => {
            const created = await post(api('/ai/skills'), brief);
            const updated = await put(api(`/ai/skills/${created.body.id}`), { alwaysOn: false });

            assert.strictEqual(updated.body.alwaysOn, false);
            assert.strictEqual(updated.body.name, 'Be brief');
            assert.strictEqual(updated.body.instructions, 'At most 3 sentences.');
        });

        it('sends an always-on skill with every message', async () => {
            await post(api('/ai/skills'), brief);
            const res = await get(api('/ai/_test/prompt'));
            assert.match(res.body.prompt, /Be brief/);
            assert.match(res.body.prompt, /At most 3 sentences\./);
        });

        it('sends an opt-in skill only when the conversation selected it', async () => {
            const created = await post(api('/ai/skills'), ticket);

            const without = await get(api('/ai/_test/prompt'));
            assert.ok(!/Ticket writer/.test(without.body.prompt), 'unselected skill leaked into the prompt');

            const with_ = await get(api(`/ai/_test/prompt?skillIds=${created.body.id}`));
            assert.match(with_.body.prompt, /Ticket writer/);
        });

        it('tells the model that user skills override the built-in guidance', async () => {
            // The prompt already said "Be concise" and the model ignored it,
            // so a skill that sits merely alongside it changes nothing.
            await post(api('/ai/skills'), brief);
            const res = await get(api('/ai/_test/prompt'));
            assert.match(res.body.prompt, /override the general/i);
        });

        it('omits the section entirely when nothing applies', async () => {
            const res = await get(api('/ai/_test/prompt'));
            assert.ok(!/How the user wants you to respond/.test(res.body.prompt));
        });

        it('stops applying a deleted skill to the conversations that chose it', async () => {
            // A dangling id would otherwise be sent on every message forever.
            const created = await post(api('/ai/skills'), ticket);
            await saveTranscript([msg('hello')], [created.body.id]);

            await del(api(`/ai/skills/${created.body.id}`));

            const active = await get(api('/ai/conversation'));
            assert.deepStrictEqual(active.body.skillIds, []);
        });

        it('carries a thread its own skills when reopened', async () => {
            const created = await post(api('/ai/skills'), ticket);
            await saveTranscript([msg('Writing tickets')], [created.body.id]);
            const list = await get(api('/ai/conversations'));
            const ticketThread = list.body.conversations[0].id;

            await post(api('/ai/conversations'), { skillIds: [] });
            await saveTranscript([msg('Just chatting')], []);

            const reopened = await put(api(`/ai/conversations/${ticketThread}/activate`), {});
            assert.deepStrictEqual(reopened.body.skillIds, [created.body.id]);
        });

        it('404s for an unknown skill', async () => {
            assert.strictEqual((await put(api('/ai/skills/nope'), { name: 'x' })).status, 404);
            assert.strictEqual((await del(api('/ai/skills/nope'))).status, 404);
        });
    });
});
