/**
 * Unit tests for client-side router logic.
 * Tests the parsePath and buildPath functions from /public/js/router.js.
 *
 * The functions are copied here because the test runner is CommonJS and
 * cannot import ES modules from /public.
 *
 * Run with: node --test tests/unit/router.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');

// ===========================================
// Copies of router.js functions
// Source of truth: /public/js/router.js — duplicated here because
// the test runner uses CommonJS and cannot import ES modules from /public.
// ===========================================

const SUB_PAGES = ['dashboard', 'backlog', 'archive', 'reports', 'ai'];

function parsePath(pathname = '/') {
    const segments = pathname.split('/').filter(Boolean);
    const alias = segments[0] || '';
    const page = SUB_PAGES.includes(segments[1]) ? segments[1] : 'board';
    return { alias, page };
}

function buildPath(alias, page) {
    return page === 'board' ? `/${alias}` : `/${alias}/${page}`;
}

// ===========================================
// Tests
// ===========================================

describe('parsePath', () => {
    it('returns empty alias and board for root /', () => {
        const result = parsePath('/');
        assert.strictEqual(result.alias, '');
        assert.strictEqual(result.page, 'board');
    });

    it('returns alias and board for /:alias', () => {
        const result = parsePath('/work');
        assert.strictEqual(result.alias, 'work');
        assert.strictEqual(result.page, 'board');
    });

    it('returns alias and dashboard for /:alias/dashboard', () => {
        const result = parsePath('/work/dashboard');
        assert.strictEqual(result.alias, 'work');
        assert.strictEqual(result.page, 'dashboard');
    });

    it('returns alias and backlog for /:alias/backlog', () => {
        const result = parsePath('/work/backlog');
        assert.strictEqual(result.alias, 'work');
        assert.strictEqual(result.page, 'backlog');
    });

    it('returns alias and archive for /:alias/archive', () => {
        const result = parsePath('/work/archive');
        assert.strictEqual(result.alias, 'work');
        assert.strictEqual(result.page, 'archive');
    });

    it('returns alias and reports for /:alias/reports', () => {
        const result = parsePath('/work/reports');
        assert.strictEqual(result.alias, 'work');
        assert.strictEqual(result.page, 'reports');
    });

    it('returns alias and ai for /:alias/ai', () => {
        const result = parsePath('/work/ai');
        assert.strictEqual(result.alias, 'work');
        assert.strictEqual(result.page, 'ai');
    });

    it('defaults to board for unknown sub-page', () => {
        const result = parsePath('/work/unknownpage');
        assert.strictEqual(result.alias, 'work');
        assert.strictEqual(result.page, 'board');
    });

    it('handles camelCase alias', () => {
        const result = parsePath('/myProfile/reports');
        assert.strictEqual(result.alias, 'myProfile');
        assert.strictEqual(result.page, 'reports');
    });
});

describe('buildPath', () => {
    it('returns /:alias for board page', () => {
        assert.strictEqual(buildPath('work', 'board'), '/work');
    });

    it('returns /:alias/dashboard for dashboard page', () => {
        assert.strictEqual(buildPath('work', 'dashboard'), '/work/dashboard');
    });

    it('returns /:alias/backlog for backlog page', () => {
        assert.strictEqual(buildPath('work', 'backlog'), '/work/backlog');
    });

    it('returns /:alias/archive for archive page', () => {
        assert.strictEqual(buildPath('work', 'archive'), '/work/archive');
    });

    it('returns /:alias/reports for reports page', () => {
        assert.strictEqual(buildPath('work', 'reports'), '/work/reports');
    });

    it('returns /:alias/ai for ai page', () => {
        assert.strictEqual(buildPath('work', 'ai'), '/work/ai');
    });
});
