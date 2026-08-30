/**
 * API Integration tests for the interview and the memory profile.
 *
 * The thing under test: the assistant knows the board but not the world around
 * it — who Mikael is, what an abbreviation means. None of that is derivable
 * from the data, so the only way to get it is to ask, and the questions have
 * to be grounded in what is actually there rather than generic.
 *
 * IMPORTANT: requires the server running in test mode:
 *   Terminal 1: RATE_LIMIT_DISABLED=1 node server.js
 *   Terminal 2: node --test tests/api/interview.test.js
 */

const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs').promises;
const path = require('node:path');
const http = require('node:http');

const BASE_URL = 'http://localhost:3001';
const TEST_PROFILE = 'tests';
const PROFILE_DIR = path.join(__dirname, '..', '..', 'data', TEST_PROFILE);
const TASKS_FILE = path.join(PROFILE_DIR, 'tasks.json');
const ARCHIVED_FILE = path.join(PROFILE_DIR, 'archived-tasks.json');
const MEMORY_FILE = path.join(PROFILE_DIR, 'ai-memory.json');
const EPICS_FILE = path.join(PROFILE_DIR, 'epics.json');

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
const api = (p) => `/api/${TEST_PROFILE}${p}`;

const task = (title, extra = {}) => ({
    id: `t${Math.random().toString(36).slice(2, 9)}`,
    title, description: '', status: 'todo', position: 0, category: 1,
    epicId: null, createdDate: new Date().toISOString(), log: [], ...extra
});

/** Repeats a title enough times to clear DIGEST_MIN_OCCURRENCES. */
const repeat = (title, n) => Array.from({ length: n }, () => task(title));

describe('The interview', () => {
    let originals = {};

    before(async () => {
        await post('/api/profiles', { name: 'Tests', color: '#636E72', letters: 'TST' });
        await fs.mkdir(PROFILE_DIR, { recursive: true });
        for (const [key, file] of [['tasks', TASKS_FILE], ['archived', ARCHIVED_FILE],
                                   ['memory', MEMORY_FILE], ['epics', EPICS_FILE]]) {
            try { originals[key] = await fs.readFile(file, 'utf8'); } catch { originals[key] = '[]'; }
        }
    });

    beforeEach(async () => {
        await fs.writeFile(TASKS_FILE, '[]');
        await fs.writeFile(ARCHIVED_FILE, '[]');
        await fs.writeFile(MEMORY_FILE, '[]');
        await fs.writeFile(EPICS_FILE, '[]');
    });

    after(async () => {
        await fs.writeFile(TASKS_FILE, originals.tasks);
        await fs.writeFile(ARCHIVED_FILE, originals.archived);
        await fs.writeFile(MEMORY_FILE, originals.memory);
        await fs.writeFile(EPICS_FILE, originals.epics);
    });

    describe('The digest', () => {

        it('finds recurring names in task titles', async () => {
            await fs.writeFile(TASKS_FILE, JSON.stringify(repeat('Meeting with Mikael', 4)));
            const res = await get(api('/ai/interview/digest'));

            assert.deepStrictEqual(res.body.names.map(n => n.token), ['Mikael']);
            assert.strictEqual(res.body.names[0].count, 4);
        });

        it('reads the archive, where most of the history lives', async () => {
            // The ordinary board snapshot ignores archived tasks entirely, so a
            // name that only appears in finished work would be invisible.
            await fs.writeFile(ARCHIVED_FILE, JSON.stringify(repeat('Call with Quinton', 5)));
            const res = await get(api('/ai/interview/digest'));

            assert.deepStrictEqual(res.body.names.map(n => n.token), ['Quinton']);
            assert.strictEqual(res.body.totals.archived, 5);
        });

        it('finds recurring ticket prefixes', async () => {
            await fs.writeFile(TASKS_FILE, JSON.stringify([
                task('EIPP-1 something'), task('EIPP-2 another'), task('EIPP-3 third')
            ]));
            const res = await get(api('/ai/interview/digest'));
            assert.ok(res.body.prefixes.some(p => p.token === 'EIPP'));
        });

        it('ignores one-offs', async () => {
            // Asking about something seen twice is noise, not curiosity.
            await fs.writeFile(TASKS_FILE, JSON.stringify(repeat('Ping Gustav', 2)));
            const res = await get(api('/ai/interview/digest'));
            assert.deepStrictEqual(res.body.names, []);
        });

        it('ignores common words that happen to be capitalised', async () => {
            await fs.writeFile(TASKS_FILE, JSON.stringify(repeat('Fix the Search Page Bug', 6)));
            const res = await get(api('/ai/interview/digest'));
            assert.deepStrictEqual(res.body.names.map(n => n.token), []);
        });

        it('drops anything an approved memory already explains', async () => {
            // The whole point: it must not ask the same question twice.
            await fs.writeFile(TASKS_FILE, JSON.stringify(repeat('Sync with Mikael', 4)));

            const before = await get(api('/ai/interview/digest'));
            assert.ok(before.body.names.some(n => n.token === 'Mikael'));

            await post(api('/ai/memory'), { text: 'Mikael is my boss.', category: 'person' });

            const after = await get(api('/ai/interview/digest'));
            assert.ok(!after.body.names.some(n => n.token === 'Mikael'), 'asked about a known name');
        });

        it('still asks when the memory is unapproved', async () => {
            await fs.writeFile(TASKS_FILE, JSON.stringify(repeat('Sync with Mikael', 4)));
            await fs.writeFile(MEMORY_FILE, JSON.stringify([
                { id: 'm1', text: 'Mikael is my boss.', category: 'person', source: 'ai', approved: false, createdAt: new Date().toISOString() }
            ]));

            const res = await get(api('/ai/interview/digest'));
            assert.ok(res.body.names.some(n => n.token === 'Mikael'), 'unapproved memory silenced the question');
        });

        it('flags epics with no stakeholder recorded', async () => {
            await post(api('/epics'), { name: 'ECOM', color: '#2E86DE' });
            await post(api('/epics'), { name: 'CICD', color: '#E74C3C', stakeholder: 'my boss' });

            const res = await get(api('/ai/interview/digest'));
            assert.deepStrictEqual(res.body.epicsMissingContext, ['ECOM']);
        });

        it('reports no gaps on an empty board', async () => {
            const res = await get(api('/ai/interview/digest'));
            assert.strictEqual(res.body.hasGaps, false);
        });
    });

    describe('The interview prompt', () => {

        it('asks about what the digest found, not generalities', async () => {
            await fs.writeFile(ARCHIVED_FILE, JSON.stringify(repeat('Review with Balzac', 5)));
            const res = await get(api('/ai/_test/prompt?mode=interview'));

            assert.match(res.body.prompt, /Balzac \(5×\)/);
            assert.match(res.body.prompt, /5 of their tasks/);
        });

        it('tells the model to ask rather than help', async () => {
            const res = await get(api('/ai/_test/prompt?mode=interview'));
            assert.match(res.body.prompt, /ASK, not to help/);
            assert.match(res.body.prompt, /at most THREE questions/i);
        });

        it('carries what is already known, so it does not re-ask', async () => {
            await post(api('/ai/memory'), { text: 'Mikael is my boss.', category: 'person' });
            const res = await get(api('/ai/_test/prompt?mode=interview'));

            assert.match(res.body.prompt, /do not ask about any of this again/i);
            assert.match(res.body.prompt, /Mikael is my boss\./);
        });

        it('carries no board snapshot — an interview is not about tasks', async () => {
            await fs.writeFile(TASKS_FILE, JSON.stringify([task('A very specific ticket title')]));
            const res = await get(api('/ai/_test/prompt?mode=interview'));
            assert.ok(!/A very specific ticket title/.test(res.body.prompt));
        });

        it('stays small even against a large archive', async () => {
            // Sending the archive itself would cost thousands of tokens to say
            // what a few hundred characters can.
            await fs.writeFile(ARCHIVED_FILE, JSON.stringify(repeat('Handover to Rob', 300)));
            const res = await get(api('/ai/_test/prompt?mode=interview'));
            assert.ok(res.body.chars < 4000, `interview prompt was ${res.body.chars} chars`);
        });
    });

    describe('Memory categories', () => {

        it('defaults to other and accepts a category', async () => {
            const plain = await post(api('/ai/memory'), { text: 'Something.' });
            assert.strictEqual(plain.body.category, 'other');

            const person = await post(api('/ai/memory'), { text: 'Alex runs QA.', category: 'person' });
            assert.strictEqual(person.body.category, 'person');
        });

        it('falls back to other for an unknown category', async () => {
            const res = await post(api('/ai/memory'), { text: 'Something.', category: 'nonsense' });
            assert.strictEqual(res.body.category, 'other');
        });

        it('recategorises via PUT', async () => {
            const created = await post(api('/ai/memory'), { text: 'PLP is the product listing page.' });
            const updated = await put(api(`/ai/memory/${created.body.id}`), { category: 'term' });
            assert.strictEqual(updated.body.category, 'term');
            assert.strictEqual(updated.body.text, 'PLP is the product listing page.');
        });

        it('groups the prompt by category', async () => {
            await post(api('/ai/memory'), { text: 'Mikael is my boss.', category: 'person' });
            await post(api('/ai/memory'), { text: 'A 13 is two days.', category: 'preference' });

            const res = await get(api('/ai/_test/prompt'));
            assert.match(res.body.prompt, /People:/);
            assert.match(res.body.prompt, /How they like to work:/);
        });

        it('renders as Markdown for reading', async () => {
            await post(api('/ai/memory'), { text: 'EUVIC are external developers.', category: 'person' });
            const res = await get(api('/ai/memory/markdown'));

            assert.strictEqual(res.status, 200);
            assert.match(res.body, /^# What the assistant knows about me/);
            assert.match(res.body, /## People/);
            assert.match(res.body, /- EUVIC are external developers\./);
        });

        it('separates unapproved suggestions in the Markdown view', async () => {
            await fs.writeFile(MEMORY_FILE, JSON.stringify([
                { id: 'm1', text: 'A guess.', category: 'other', source: 'ai', approved: false, createdAt: new Date().toISOString() }
            ]));
            const res = await get(api('/ai/memory/markdown'));
            assert.match(res.body, /## Awaiting your approval/);
        });
    });

    describe('When the model says nothing', () => {
        // Models routinely answer a tool-use turn with the tool call alone.
        // Passing that straight through renders an empty message bubble: the
        // work happened and the transcript shows a blank. Seen live on Kimi K3.

        const outcome = async (q) => (await get(api(`/ai/_test/outcome?${q}`))).body.narrative;

        it('describes what the reply actually did', async () => {
            assert.strictEqual(await outcome('memories=1'), 'Noted 1 thing to remember.');
            assert.strictEqual(await outcome('memories=3'), 'Noted 3 things to remember.');
            assert.strictEqual(await outcome('tasks=2'), 'Staged 2 tasks.');
            assert.strictEqual(await outcome('proposals=1'), 'Proposed 1 change.');
        });

        it('combines them', async () => {
            assert.strictEqual(
                await outcome('tasks=1&proposals=2&memories=1'),
                'Staged 1 task, proposed 2 changes, noted 1 thing to remember.'
            );
        });

        it('stays empty when nothing happened, so a silent reply still reads as one', async () => {
            assert.strictEqual(await outcome('tasks=0&proposals=0&memories=0'), '');
        });
    });

    describe('Interview conversations', () => {

        it('starts its own thread, so it can be re-run any time', async () => {
            const first = await post(api('/ai/conversations'), { mode: 'interview' });
            assert.strictEqual(first.body.mode, 'interview');
            assert.match(first.body.title, /^Interview —/);

            // An interview never reuses an empty ordinary thread, and vice
            // versa: mixing the two prompts in one transcript is incoherent.
            const chat = await post(api('/ai/conversations'), { mode: 'chat' });
            assert.strictEqual(chat.body.mode, 'chat');
            assert.notStrictEqual(chat.body.id, first.body.id);
        });

        it('takes no skills — its prompt is its own', async () => {
            const skill = await post(api('/ai/skills'), { name: 'Terse', instructions: 'Be short.', alwaysOn: false });
            await put(api('/ai/conversation'), { messages: [{ role: 'user', content: 'hi' }], skillIds: [skill.body.id] });

            const interview = await post(api('/ai/conversations'), { mode: 'interview' });
            assert.deepStrictEqual(interview.body.skillIds, []);

            await makeRequest('DELETE', api(`/ai/skills/${skill.body.id}`));
        });
    });
});
