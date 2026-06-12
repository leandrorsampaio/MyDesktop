/**
 * Unit tests for mini-server.js — the zero-dep Express-compatible shim.
 *
 * Each describe() block spins up its own server on an OS-assigned port
 * (port 0), so these tests are self-contained — no main server required.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');

const createApp = require('../../mini-server');

// -----------------------------------------------------------------------
// Tiny HTTP client
// -----------------------------------------------------------------------
function request(port, method, urlPath, opts = {}) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: '127.0.0.1', port, path: urlPath, method,
            headers: opts.headers || {}
        }, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString('utf8');
                let body = raw;
                try { body = raw ? JSON.parse(raw) : null; } catch { /* keep raw */ }
                resolve({ status: res.statusCode, headers: res.headers, body, raw });
            });
        });
        req.on('error', reject);
        if (opts.body !== undefined) req.write(opts.body);
        req.end();
    });
}

// Start an app on a random port; return { port, close }.
function startApp(setup) {
    return new Promise((resolve) => {
        const app = createApp();
        setup(app);
        const server = app.listen(0, () => {
            const port = server.address().port;
            resolve({ port, close: () => new Promise(r => server.close(r)) });
        });
    });
}

// =======================================================================
// Routing & params
// =======================================================================
describe('mini-server: routing', () => {
    let inst;
    before(async () => {
        inst = await startApp(app => {
            app.get('/hello', (req, res) => res.json({ ok: true }));
            app.get('/users/:id', (req, res) => res.json({ id: req.params.id }));
            app.get('/api/:profile/tasks/:taskId',
                (req, res) => res.json({ profile: req.params.profile, taskId: req.params.taskId }));
            app.post('/echo', (req, res) => res.json(req.body));
            app.put('/users/:id', (req, res) => res.json({ updated: req.params.id }));
            app.delete('/users/:id', (req, res) => res.json({ deleted: req.params.id }));
        });
    });
    after(() => inst.close());

    it('GET route matches and responds', async () => {
        const r = await request(inst.port, 'GET', '/hello');
        assert.strictEqual(r.status, 200);
        assert.deepStrictEqual(r.body, { ok: true });
    });

    it('extracts a single :param', async () => {
        const r = await request(inst.port, 'GET', '/users/42');
        assert.deepStrictEqual(r.body, { id: '42' });
    });

    it('extracts multiple :params', async () => {
        const r = await request(inst.port, 'GET', '/api/work/tasks/abc123');
        assert.deepStrictEqual(r.body, { profile: 'work', taskId: 'abc123' });
    });

    it('decodes URI-encoded param values', async () => {
        const r = await request(inst.port, 'GET', '/users/hello%20world');
        assert.deepStrictEqual(r.body, { id: 'hello world' });
    });

    it('returns 404 for unmatched route', async () => {
        const r = await request(inst.port, 'GET', '/nothing-here');
        assert.strictEqual(r.status, 404);
    });

    it('GET, POST, PUT, DELETE all dispatch to their own handlers', async () => {
        const p = await request(inst.port, 'PUT', '/users/9');
        assert.deepStrictEqual(p.body, { updated: '9' });
        const d = await request(inst.port, 'DELETE', '/users/9');
        assert.deepStrictEqual(d.body, { deleted: '9' });
    });

    it('method mismatch (POST on GET route) returns 404', async () => {
        const r = await request(inst.port, 'POST', '/hello');
        assert.strictEqual(r.status, 404);
    });

    // Regression: decodeURIComponent('%') used to throw a URIError that
    // surfaced as a 500 — malformed encoding in a param is a 404, not a crash
    it('malformed percent-encoding in a param returns 404, not 500', async () => {
        const r = await request(inst.port, 'GET', '/users/%');
        assert.strictEqual(r.status, 404);
    });
});

// =======================================================================
// Body parsing
// =======================================================================
describe('mini-server: body parser', () => {
    let inst;
    before(async () => {
        inst = await startApp(app => {
            app.post('/echo', (req, res) => res.json({ body: req.body, type: typeof req.body }));
        });
    });
    after(() => inst.close());

    it('parses valid JSON', async () => {
        const r = await request(inst.port, 'POST', '/echo', {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ a: 1 })
        });
        assert.deepStrictEqual(r.body.body, { a: 1 });
    });

    it('empty body defaults to {} (matches Express body-parser)', async () => {
        const r = await request(inst.port, 'POST', '/echo');
        assert.deepStrictEqual(r.body.body, {});
    });

    it('returns 400 on malformed JSON', async () => {
        const r = await request(inst.port, 'POST', '/echo', {
            headers: { 'Content-Type': 'application/json' },
            body: '{ this is not valid'
        });
        assert.strictEqual(r.status, 400);
    });

    it('non-JSON content-type leaves body as raw string', async () => {
        const r = await request(inst.port, 'POST', '/echo', {
            headers: { 'Content-Type': 'text/plain' },
            body: 'hello'
        });
        assert.strictEqual(r.body.body, 'hello');
    });

    it('rejects body larger than MAX_BODY_SIZE with 413', async () => {
        // 2 MB exceeds the 1 MB cap
        const huge = 'x'.repeat(2 * 1024 * 1024);
        const r = await request(inst.port, 'POST', '/echo', {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: huge })
        });
        assert.strictEqual(r.status, 413, 'oversized payload should 413');
    });
});

// =======================================================================
// Middleware chain
// =======================================================================
describe('mini-server: middleware', () => {
    let inst;
    before(async () => {
        inst = await startApp(app => {
            // Global prefix middleware
            app.use('/api/', (req, res, next) => {
                res.set('X-Mw-Global', 'yes');
                next();
            });
            // Route-specific middleware chain
            app.get('/api/chained',
                (req, res, next) => { res.set('X-Mw-1', '1'); next(); },
                (req, res, next) => { res.set('X-Mw-2', '2'); next(); },
                (req, res)       => res.json({ ok: true })
            );
            app.get('/api/early-end', (req, res, next) => {
                res.status(401).json({ error: 'nope' });
                // Don't call next() — chain stops
            }, (req, res) => res.json({ shouldNotReach: true }));
            // Outside the /api prefix
            app.get('/public', (req, res) => res.json({ public: true }));
        });
    });
    after(() => inst.close());

    it('runs prefix-matched use() middleware before the route', async () => {
        const r = await request(inst.port, 'GET', '/api/chained');
        assert.strictEqual(r.headers['x-mw-global'], 'yes');
        assert.strictEqual(r.headers['x-mw-1'], '1');
        assert.strictEqual(r.headers['x-mw-2'], '2');
        assert.deepStrictEqual(r.body, { ok: true });
    });

    it('does NOT run prefix-matched middleware outside the prefix', async () => {
        const r = await request(inst.port, 'GET', '/public');
        assert.strictEqual(r.headers['x-mw-global'], undefined);
    });

    it('handler that ends response without calling next() stops the chain', async () => {
        const r = await request(inst.port, 'GET', '/api/early-end');
        assert.strictEqual(r.status, 401);
        assert.deepStrictEqual(r.body, { error: 'nope' });
        assert.notDeepStrictEqual(r.body, { shouldNotReach: true });
    });
});

// =======================================================================
// Static file serving
// =======================================================================
describe('mini-server: static files', () => {
    let inst;
    const rootDir = path.join(__dirname, '..', '..', 'public');

    before(async () => {
        inst = await startApp(app => {
            app.use(createApp.static(rootDir));
        });
    });
    after(() => inst.close());

    it('serves an existing file with correct MIME type', async () => {
        // index.html exists in /public — that's the SPA shell.
        const r = await request(inst.port, 'GET', '/index.html');
        assert.strictEqual(r.status, 200);
        assert.match(r.headers['content-type'], /text\/html/);
    });

    it('serves / as /index.html', async () => {
        const r = await request(inst.port, 'GET', '/');
        assert.strictEqual(r.status, 200);
        assert.match(r.headers['content-type'], /text\/html/);
    });

    it('serves CSS with text/css MIME', async () => {
        // styles.css is present
        if (!fs.existsSync(path.join(rootDir, 'styles.css'))) return;
        const r = await request(inst.port, 'GET', '/styles.css');
        assert.strictEqual(r.status, 200);
        assert.match(r.headers['content-type'], /text\/css/);
    });

    it('returns 404 for non-existent files', async () => {
        const r = await request(inst.port, 'GET', '/does-not-exist-12345.html');
        assert.strictEqual(r.status, 404);
    });

    it('rejects path traversal attempts', async () => {
        // Try to escape rootDir with ../
        const r = await request(inst.port, 'GET', '/../server.js');
        // Node's http URL normalization handles this — the request comes
        // in as /server.js and looks inside /public for it (not found = 404).
        // The important assertion: never serves files outside rootDir.
        assert.notStrictEqual(r.status, 200, 'never 200 for escape attempt');
    });

    // ----- Conditional GET (Last-Modified / If-Modified-Since → 304) -----
    it('sends Last-Modified and Cache-Control on static files', async () => {
        const r = await request(inst.port, 'GET', '/index.html');
        assert.ok(r.headers['last-modified'], 'Last-Modified header present');
        assert.strictEqual(r.headers['cache-control'], 'no-cache');
    });

    it('returns 304 with no body when If-Modified-Since matches', async () => {
        const first = await request(inst.port, 'GET', '/index.html');
        const r = await request(inst.port, 'GET', '/index.html', {
            headers: { 'If-Modified-Since': first.headers['last-modified'] }
        });
        assert.strictEqual(r.status, 304);
        assert.strictEqual(r.raw, '', '304 has no body');
    });

    it('returns 200 with full body when If-Modified-Since is older than the file', async () => {
        const r = await request(inst.port, 'GET', '/index.html', {
            headers: { 'If-Modified-Since': new Date(0).toUTCString() }
        });
        assert.strictEqual(r.status, 200);
        assert.ok(r.raw.length > 0, 'body is served');
    });
});

// =======================================================================
// Response helpers
// =======================================================================
describe('mini-server: response helpers', () => {
    let inst;
    before(async () => {
        inst = await startApp(app => {
            app.get('/status', (req, res) => res.status(418).json({ teapot: true }));
            app.get('/set-header', (req, res) => {
                res.set('X-Custom', 'hi').json({ ok: true });
            });
            app.get('/send-string', (req, res) => res.send('plain text'));
            app.get('/send-object', (req, res) => res.send({ via: 'send' }));
            app.get('/redirect', (req, res) => res.redirect('/destination'));
            app.get('/redirect-301', (req, res) => res.redirect(301, '/permanent'));
        });
    });
    after(() => inst.close());

    it('res.status() sets the status code', async () => {
        const r = await request(inst.port, 'GET', '/status');
        assert.strictEqual(r.status, 418);
        assert.deepStrictEqual(r.body, { teapot: true });
    });

    it('res.set() sets a response header', async () => {
        const r = await request(inst.port, 'GET', '/set-header');
        assert.strictEqual(r.headers['x-custom'], 'hi');
    });

    it('res.send(string) sends text/html by default', async () => {
        const r = await request(inst.port, 'GET', '/send-string');
        assert.strictEqual(r.raw, 'plain text');
        assert.match(r.headers['content-type'], /text\/html/);
    });

    it('res.send(object) JSON-serialises it', async () => {
        const r = await request(inst.port, 'GET', '/send-object');
        assert.deepStrictEqual(r.body, { via: 'send' });
        assert.match(r.headers['content-type'], /application\/json/);
    });

    it('res.redirect(url) sends 302 with Location', async () => {
        const r = await request(inst.port, 'GET', '/redirect');
        assert.strictEqual(r.status, 302);
        assert.strictEqual(r.headers.location, '/destination');
    });

    it('res.redirect(code, url) sends the given status code', async () => {
        const r = await request(inst.port, 'GET', '/redirect-301');
        assert.strictEqual(r.status, 301);
        assert.strictEqual(r.headers.location, '/permanent');
    });
});

// =======================================================================
// Error handling
// =======================================================================
describe('mini-server: error handling', () => {
    let inst;
    before(async () => {
        inst = await startApp(app => {
            app.get('/throws', () => { throw new Error('boom'); });
            app.get('/throws-async', async () => { throw new Error('async boom'); });
        });
    });
    after(() => inst.close());

    it('synchronous handler throw → 500', async () => {
        const r = await request(inst.port, 'GET', '/throws');
        assert.strictEqual(r.status, 500);
        assert.ok(r.body.error, 'returns error in body');
    });

    it('async handler rejection → 500', async () => {
        const r = await request(inst.port, 'GET', '/throws-async');
        assert.strictEqual(r.status, 500);
        assert.ok(r.body.error);
    });
});
