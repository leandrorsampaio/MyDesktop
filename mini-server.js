/**
 * mini-server.js — tiny Express-compatible HTTP server built on Node's
 * built-in `http` module. Zero npm dependencies.
 *
 * Implements the slice of Express this project actually uses:
 *   - app.get/post/put/delete/use(path?, ...handlers)
 *   - Path params (`:foo` → req.params.foo)
 *   - JSON body parsing (when Content-Type is application/json)
 *   - Static file serving from a directory (with MIME types)
 *   - Middleware chain via next()
 *   - res.json / res.status / res.set / res.send / res.sendFile / res.redirect
 *   - req.params / req.body / req.ip
 *   - Automatic 500 on uncaught errors in async handlers
 *
 * Intentionally NOT implemented (because the project doesn't use them):
 *   - Error-first middleware (4-arg handlers)
 *   - next('route') / next(err) flow control
 *   - req.query, req.cookies, req.path
 *   - Sub-routers, view engines, content negotiation
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js':   'application/javascript; charset=utf-8',
    '.mjs':  'application/javascript; charset=utf-8',
    '.css':  'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg':  'image/svg+xml',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif':  'image/gif',
    '.ico':  'image/x-icon',
    '.webp': 'image/webp',
    '.txt':  'text/plain; charset=utf-8',
    '.map':  'application/json; charset=utf-8'
};

function mimeFor(filePath) {
    return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/**
 * Compile a route pattern like "/api/:profile/tasks/:id" into a matcher.
 * Returns { regex, paramNames } so we can pull values out at match time.
 */
function compilePattern(pattern) {
    const paramNames = [];
    const regexStr = pattern
        .replace(/\/+$/, '')
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => {
            paramNames.push(name);
            return '([^/]+)';
        });
    return { regex: new RegExp('^' + regexStr + '/?$'), paramNames };
}

function matchPattern(compiled, pathname) {
    const m = compiled.regex.exec(pathname);
    if (!m) return null;
    const params = {};
    try {
        compiled.paramNames.forEach((name, i) => {
            params[name] = decodeURIComponent(m[i + 1]);
        });
    } catch {
        // Malformed percent-encoding in a param segment (e.g. /api/%/tasks)
        // is a non-matching URL, not a server error — fall through to 404
        return null;
    }
    return params;
}

/**
 * Static file middleware. Tries to serve a file from `rootDir` matching the
 * URL path. If the file doesn't exist or escapes the root, calls next().
 */
function staticMiddleware(rootDir) {
    // Resolve symlinks in the root once, so the per-request realpath check
    // below compares against the true on-disk location (on macOS even
    // ordinary paths can pass through symlinks like /var → /private/var)
    let realRoot;
    try { realRoot = fs.realpathSync(rootDir); } catch { realRoot = rootDir; }

    return (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') return next();

        const urlPath = req.pathname === '/' ? '/index.html' : req.pathname;
        const safePath = path.normalize(path.join(rootDir, urlPath));

        if (!safePath.startsWith(rootDir + path.sep) && safePath !== rootDir) {
            return next();
        }

        fs.stat(safePath, (err, stat) => {
            if (err || !stat.isFile()) return next();

            // The startsWith check above validates the *requested* path, but
            // streams follow symlinks — re-check the real target so a symlink
            // planted inside the root can't serve files from outside it
            fs.realpath(safePath, (rpErr, realPath) => {
                if (rpErr) return next();
                if (!realPath.startsWith(realRoot + path.sep) && realPath !== realRoot) {
                    return next();
                }

                // Conditional GET: no-cache forces revalidation (never
                // staleness); matching If-Modified-Since gets a bodyless 304
                // so a "browser homepage" reload doesn't re-download every
                // script and template. HTTP dates have 1s resolution, so
                // truncate mtime before comparing.
                const lastModified = stat.mtime.toUTCString();
                res.setHeader('Last-Modified', lastModified);
                res.setHeader('Cache-Control', 'no-cache');
                const ims = Date.parse(req.headers['if-modified-since'] || '');
                if (!isNaN(ims) && Math.floor(stat.mtime.getTime() / 1000) * 1000 <= ims) {
                    res.statusCode = 304;
                    return res.end();
                }

                res.setHeader('Content-Type', mimeFor(safePath));
                res.setHeader('Content-Length', stat.size);
                if (req.method === 'HEAD') return res.end();
                fs.createReadStream(realPath).on('error', () => res.end()).pipe(res);
            });
        });
    };
}

/**
 * Maximum request body size, in bytes. Requests exceeding this are rejected
 * with 413 Payload Too Large. Protects against trivial DoS (filling memory
 * with a multi-GB POST). 1 MiB is well above any legitimate JSON payload in
 * this app — task descriptions cap at 2k chars, notes at 10k.
 */
const MAX_BODY_SIZE = 1024 * 1024;

/**
 * Read the request body and parse JSON if the Content-Type says so.
 * Sets req.body. Empty bodies → `{}` (matches Express's body-parser default,
 * so handlers can safely do `req.body.foo` without a null guard).
 */
function parseBody(req) {
    return new Promise((resolve, reject) => {
        const contentType = (req.headers['content-type'] || '').toLowerCase();
        const chunks = [];
        let totalBytes = 0;
        let oversize = false;
        req.on('data', chunk => {
            if (oversize) return;          // drop further data after limit hit
            totalBytes += chunk.length;
            if (totalBytes > MAX_BODY_SIZE) {
                oversize = true;
                chunks.length = 0;          // free memory
                return reject(new HttpError(413, 'Request body too large'));
            }
            chunks.push(chunk);
        });
        req.on('end', () => {
            if (oversize) return;          // already rejected
            const raw = Buffer.concat(chunks).toString('utf8');
            if (!raw) { req.body = {}; return resolve(); }
            if (contentType.includes('application/json')) {
                try { req.body = JSON.parse(raw); }
                catch { return reject(new HttpError(400, 'Invalid JSON body')); }
            } else {
                req.body = raw;
            }
            resolve();
        });
        req.on('error', reject);
    });
}

class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}

/**
 * Wrap the raw Node response with Express-style helpers.
 */
function wrapResponse(res) {
    res.status = (code) => { res.statusCode = code; return res; };
    res.set = (name, value) => { res.setHeader(name, value); return res; };
    res.json = (obj) => {
        if (!res.getHeader('Content-Type')) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
        }
        res.end(JSON.stringify(obj));
        return res;
    };
    res.send = (body) => {
        if (typeof body === 'object' && body !== null && !Buffer.isBuffer(body)) {
            return res.json(body);
        }
        if (!res.getHeader('Content-Type')) {
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
        }
        res.end(body == null ? '' : String(body));
        return res;
    };
    res.sendFile = (absPath) => {
        fs.stat(absPath, (err, stat) => {
            if (err || !stat.isFile()) {
                res.statusCode = 404;
                return res.end('Not found');
            }
            res.setHeader('Content-Type', mimeFor(absPath));
            res.setHeader('Content-Length', stat.size);
            fs.createReadStream(absPath).on('error', () => res.end()).pipe(res);
        });
        return res;
    };
    res.redirect = (urlOrStatus, maybeUrl) => {
        let status = 302, target;
        if (typeof urlOrStatus === 'number') { status = urlOrStatus; target = maybeUrl; }
        else { target = urlOrStatus; }
        res.statusCode = status;
        res.setHeader('Location', target);
        res.end();
        return res;
    };
    return res;
}

/**
 * Build the IP address from the socket, mimicking Express's `req.ip`.
 */
function inferIp(req) {
    return (req.socket && req.socket.remoteAddress) || 'unknown';
}

/**
 * Run a chain of middleware/handlers in order. Each handler is `(req, res, next)`.
 * A handler may be async; thrown errors are caught and surfaced as HttpError(500).
 * `next(err)` short-circuits the chain.
 */
async function runChain(handlers, req, res) {
    let idx = 0;
    return new Promise((resolve, reject) => {
        const next = (err) => {
            if (err) return reject(err);
            if (res.writableEnded) return resolve();
            const handler = handlers[idx++];
            if (!handler) return resolve();
            try {
                const result = handler(req, res, next);
                if (result && typeof result.then === 'function') {
                    result.then(() => {
                        // Async handler completed. If it didn't call next() and
                        // didn't end the response, we stop the chain (Express
                        // behavior — only explicit next() advances).
                    }, reject);
                }
            } catch (e) {
                reject(e);
            }
        };
        next();
    });
}

function createApp() {
    /**
     * Each entry: { kind: 'route'|'use', method, pattern, prefix, handlers }
     *  - 'route' entries match a specific method + full path pattern
     *  - 'use' entries match any method whose path starts with `prefix`
     */
    const stack = [];

    function addRoute(method, pattern, handlers) {
        stack.push({
            kind: 'route',
            method,
            compiled: compilePattern(pattern),
            handlers
        });
    }

    function addUse(prefix, handlers) {
        stack.push({
            kind: 'use',
            prefix: prefix.replace(/\/+$/, '') || '/',
            handlers
        });
    }

    const app = {
        get:    (p, ...h) => (addRoute('GET',    p, h), app),
        post:   (p, ...h) => (addRoute('POST',   p, h), app),
        put:    (p, ...h) => (addRoute('PUT',    p, h), app),
        delete: (p, ...h) => (addRoute('DELETE', p, h), app),

        use(...args) {
            if (typeof args[0] === 'string') {
                const [prefix, ...handlers] = args;
                addUse(prefix, handlers);
            } else {
                addUse('/', args);
            }
            return app;
        },

        listen(port, ...rest) {
            const server = http.createServer(async (req, res) => {
                wrapResponse(res);
                req.ip = inferIp(req);
                req.params = {};
                req.body = {};

                const fullUrl = new URL(req.url, 'http://localhost');
                req.pathname = fullUrl.pathname;
                req.query = Object.fromEntries(fullUrl.searchParams);

                try {
                    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
                        await parseBody(req);
                    }

                    let matched = false;
                    for (const entry of stack) {
                        if (res.writableEnded) return;

                        if (entry.kind === 'use') {
                            const inPrefix = entry.prefix === '/'
                                || req.pathname === entry.prefix
                                || req.pathname.startsWith(entry.prefix + '/');
                            if (!inPrefix) continue;
                            await runChain(entry.handlers, req, res);
                            continue;
                        }

                        if (entry.method !== req.method) continue;
                        const params = matchPattern(entry.compiled, req.pathname);
                        if (!params) continue;

                        req.params = params;
                        matched = true;
                        await runChain(entry.handlers, req, res);
                        break;
                    }

                    if (!res.writableEnded) {
                        if (!matched) {
                            res.statusCode = 404;
                            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
                            res.end('Not found');
                        } else {
                            res.end();
                        }
                    }
                } catch (err) {
                    if (res.writableEnded) return;
                    const status = err && err.status ? err.status : 500;
                    res.statusCode = status;
                    res.setHeader('Content-Type', 'application/json; charset=utf-8');
                    res.end(JSON.stringify({ error: err.message || 'Internal error' }));
                }
            });
            // Signature: listen(port, cb) OR listen(port, host, cb) — matches Express.
            server.listen(port, ...rest);
            return server;
        }
    };

    return app;
}

// Express-compatible top-level helpers, so `require('./mini-server')` can be
// used as a drop-in for `require('express')`.
createApp.json = function jsonMiddleware() {
    // No-op: body parsing happens unconditionally in the request handler.
    // Kept for API compatibility with `app.use(express.json())`.
    return (_req, _res, next) => next();
};

createApp.static = function staticHelper(rootDir) {
    return staticMiddleware(path.resolve(rootDir));
};

module.exports = createApp;
