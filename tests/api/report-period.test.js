/**
 * API Integration tests for period-aware reports and their AI summary.
 *
 * The thing under test: a report used to be a board snapshot, which answers
 * "what is on my board" rather than "what did I do". These assert the period
 * behaviour that makes it the second thing — including the two traps that
 * silently lose work.
 *
 * IMPORTANT: requires the server running in test mode:
 *   Terminal 1: RATE_LIMIT_DISABLED=1 node server.js
 *   Terminal 2: node --test tests/api/report-period.test.js
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
const ARCHIVED_FILE = path.join(PROFILE_DIR, 'archived-tasks.json');
const REPORTS_FILE = path.join(PROFILE_DIR, 'reports.json');
const EPICS_FILE = path.join(PROFILE_DIR, 'epics.json');

const DAY = 86400000;

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

/** ISO date-only, matching how the app writes log entries. */
const logDate = (daysAgo) => new Date(Date.now() - daysAgo * DAY).toISOString().split('T')[0];

async function seedTasks(list) {
    await fs.writeFile(TASKS_FILE, JSON.stringify(list, null, 2));
}
async function seedArchived(list) {
    await fs.writeFile(ARCHIVED_FILE, JSON.stringify(list, null, 2));
}

function task(overrides = {}) {
    return {
        id: `t${Math.random().toString(36).slice(2, 8)}`,
        title: 'A task',
        description: '',
        status: 'todo',
        position: 0,
        category: 1,
        epicId: null,
        createdDate: new Date(Date.now() - 3 * DAY).toISOString(),
        log: [],
        ...overrides
    };
}

const generate = () => post(`/api/${TEST_PROFILE}/reports/generate`);

describe('Report periods', () => {
    let originals = {};

    before(async () => {
        await post('/api/profiles', { name: 'Tests', color: '#636E72', letters: 'TST' });
        await fs.mkdir(PROFILE_DIR, { recursive: true });
        for (const [key, file] of Object.entries({
            tasks: TASKS_FILE, archived: ARCHIVED_FILE, reports: REPORTS_FILE, epics: EPICS_FILE
        })) {
            try { originals[key] = await fs.readFile(file, 'utf8'); } catch { originals[key] = '[]'; }
        }
    });

    beforeEach(async () => {
        await seedTasks([]);
        await seedArchived([]);
        await fs.writeFile(REPORTS_FILE, '[]');
        await fs.writeFile(EPICS_FILE, '[]');
    });

    after(async () => {
        await fs.writeFile(TASKS_FILE, originals.tasks);
        await fs.writeFile(ARCHIVED_FILE, originals.archived);
        await fs.writeFile(REPORTS_FILE, originals.reports);
        await fs.writeFile(EPICS_FILE, originals.epics);
    });

    describe('The period itself', () => {

        it('defaults to a week when there is no previous report', async () => {
            const res = await generate();
            assert.strictEqual(res.body.period.since, 'default-window');

            const span = Date.parse(res.body.period.end) - Date.parse(res.body.period.start);
            assert.ok(Math.abs(span - 7 * DAY) < 60000, `expected ~7 days, got ${span / DAY}`);
        });

        it('runs from the previous report — "since we last spoke"', async () => {
            const first = await generate();
            const second = await generate();

            assert.strictEqual(second.body.period.since, 'previous-report');
            assert.strictEqual(second.body.period.start, first.body.generatedDate);
        });
    });

    describe('What counts as completed', () => {

        it('includes work archived during the period', async () => {
            // The old board-snapshot report missed these entirely: anything
            // archived during the week simply vanished from the report.
            await seedArchived([task({
                title: 'Archived this week',
                status: 'archived',
                archivedDate: new Date(Date.now() - 2 * DAY).toISOString()
            })]);

            const res = await generate();
            assert.deepStrictEqual(res.body.activity.completed.map(t => t.title), ['Archived this week']);
        });

        it('excludes work archived before the period', async () => {
            await seedArchived([task({
                title: 'Ancient history',
                status: 'archived',
                archivedDate: new Date(Date.now() - 60 * DAY).toISOString()
            })]);

            const res = await generate();
            assert.deepStrictEqual(res.body.activity.completed, []);
        });

        it('includes tasks sitting in a done column, dated from their log', async () => {
            await seedTasks([task({
                title: 'Finished but not archived',
                status: 'done',
                log: [{ date: logDate(1), action: "Moved from 'To Do' to 'Done'" }]
            })]);

            const res = await generate();
            assert.deepStrictEqual(res.body.activity.completed.map(t => t.title), ['Finished but not archived']);
        });

        it('counts work finished today, even against a period that started today', async () => {
            // The trap: log entries are date-only, so they parse to midnight.
            // Compared against an exact period start of, say, 15:20 today,
            // everything finished today would be ruled out — silently dropping
            // a day of work from a report shown to a manager.
            await generate();   // period now starts a moment ago, today

            await seedTasks([task({
                title: 'Finished today',
                status: 'done',
                log: [{ date: logDate(0), action: "Moved from 'To Do' to 'Done'" }]
            })]);

            const res = await generate();
            assert.deepStrictEqual(res.body.activity.completed.map(t => t.title), ['Finished today']);
        });

        it('floors the period in UTC, matching how log dates are written', async () => {
            // Log entries are `new Date().toISOString().split('T')[0]` — UTC
            // dates. Flooring the period in *local* time mixes the two: east of
            // Greenwich, local midnight is later than the UTC midnight it is
            // compared against, so work logged that day is ruled out. It bites
            // hardest in the small hours, when the local and UTC dates differ.
            await generate();

            // Deliberately the UTC date, exactly as the app records it.
            const utcToday = new Date().toISOString().split('T')[0];
            await seedTasks([task({
                title: 'Logged with a UTC date',
                status: 'done',
                log: [{ date: utcToday, action: "Moved from 'To Do' to 'Done'" }]
            })]);

            const res = await generate();
            assert.deepStrictEqual(res.body.activity.completed.map(t => t.title),
                ['Logged with a UTC date']);
        });

        it('does not count open work as completed', async () => {
            await seedTasks([
                task({ title: 'Still going', status: 'inprogress', log: [{ date: logDate(1), action: 'Moved' }] })
            ]);
            const res = await generate();
            assert.deepStrictEqual(res.body.activity.completed, []);
            assert.deepStrictEqual(res.body.activity.advanced.map(t => t.title), ['Still going']);
        });
    });

    describe('The rest of the activity', () => {

        it('separates what moved from what was created', async () => {
            await seedTasks([
                task({ title: 'Moved this week', status: 'inprogress',
                       createdDate: new Date(Date.now() - 30 * DAY).toISOString(),
                       log: [{ date: logDate(1), action: 'Moved' }] }),
                task({ title: 'Brand new', status: 'todo',
                       createdDate: new Date(Date.now() - 1 * DAY).toISOString() })
            ]);

            const res = await generate();
            assert.deepStrictEqual(res.body.activity.advanced.map(t => t.title), ['Moved this week']);
            assert.deepStrictEqual(res.body.activity.created.map(t => t.title), ['Brand new']);
        });

        it('flags overdue and long-untouched work for attention', async () => {
            await seedTasks([
                task({ title: 'Overdue', status: 'todo',
                       deadline: new Date(Date.now() - 2 * DAY).toISOString() }),
                task({ title: 'Forgotten', status: 'wait',
                       createdDate: new Date(Date.now() - 90 * DAY).toISOString() }),
                task({ title: 'Fine', status: 'todo',
                       createdDate: new Date(Date.now() - 1 * DAY).toISOString() })
            ]);

            const res = await generate();
            const titles = res.body.activity.attention.map(t => t.title).sort();
            assert.deepStrictEqual(titles, ['Forgotten', 'Overdue']);
        });

        it('carries epic names so a summary can group by silo', async () => {
            const epic = await post(`/api/${TEST_PROFILE}/epics`, {
                name: 'ECOM', color: '#2E86DE', stakeholder: 'the PM'
            });
            await seedTasks([task({
                title: 'Shipped something', status: 'done', epicId: epic.body.id,
                log: [{ date: logDate(1), action: 'Moved' }]
            })]);

            const res = await generate();
            assert.strictEqual(res.body.activity.completed[0].epicName, 'ECOM');
        });
    });

    describe('Archiving records when it happened', () => {

        it('stamps archivedDate, so completion is not guesswork', async () => {
            const created = await post(`/api/${TEST_PROFILE}/tasks`, { title: 'To be archived' });
            await post(`/api/${TEST_PROFILE}/tasks/${created.body.id}/move`, { newStatus: 'done', newPosition: 0 });
            await post(`/api/${TEST_PROFILE}/tasks/archive`, { columnId: 'done' });

            const archived = await get(`/api/${TEST_PROFILE}/archived`);
            const task = archived.body.find(t => t.title === 'To be archived');
            assert.ok(task.archivedDate, 'no archivedDate recorded');
            assert.ok(!isNaN(Date.parse(task.archivedDate)));
        });
    });

    describe('Summarising', () => {

        it('always answers 200, with the report untouched when it cannot', async () => {
            const report = await generate();
            const res = await post(`/api/${TEST_PROFILE}/reports/${report.body.id}/summarise`);

            assert.strictEqual(res.status, 200);
            assert.strictEqual(typeof res.body.summarised, 'boolean');
            assert.ok(res.body.report, 'no report returned');
            if (!res.body.summarised) assert.ok(res.body.reason, 'no reason given');
        });

        it('refuses to summarise a report that predates period tracking', async () => {
            // A pre-v2.56 report is a board snapshot with no period, so there
            // is nothing honest to summarise from it.
            await fs.writeFile(REPORTS_FILE, JSON.stringify([{
                id: 'legacy', title: 'Old one', generatedDate: new Date().toISOString(),
                content: { columns: [] }, notes: ''
            }], null, 2));

            const res = await post(`/api/${TEST_PROFILE}/reports/legacy/summarise`);
            assert.strictEqual(res.status, 200);
            assert.strictEqual(res.body.summarised, false);
            assert.match(res.body.reason, /predates period tracking/);
        });

        it('404s for an unknown report', async () => {
            const res = await post(`/api/${TEST_PROFILE}/reports/nope/summarise`);
            assert.strictEqual(res.status, 404);
        });
    });
});
