/**
 * Unit tests for archive-page pure functions.
 * Tests getCompletedDate and sortTasks comparator logic.
 *
 * Functions are duplicated here because the test runner is CommonJS and
 * cannot import ES modules from /public.
 * Source of truth: /public/js/archive-page.js
 *
 * Run with: node --test tests/unit/archive-page.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');

// ===========================================
// Copies of archive-page.js pure functions
// Source of truth: /public/js/archive-page.js — duplicated here because
// the test runner uses CommonJS and cannot import ES modules from /public.
// ===========================================

function getCompletedDate(task) {
    if (task.log && task.log.length > 0) {
        return task.log[task.log.length - 1].date || '';
    }
    return task.createdDate ? task.createdDate.split('T')[0] : '';
}

function sortTasks(a, b, field, direction, epicMap, categoryMap) {
    let aVal, bVal;

    switch (field) {
        case 'title':
            aVal = (a.title || '').toLowerCase();
            bVal = (b.title || '').toLowerCase();
            break;
        case 'epicName': {
            const aEpic = a.epicId ? epicMap.get(a.epicId) : null;
            const bEpic = b.epicId ? epicMap.get(b.epicId) : null;
            aVal = aEpic ? aEpic.name.toLowerCase() : null;
            bVal = bEpic ? bEpic.name.toLowerCase() : null;
            break;
        }
        case 'categoryName': {
            const aCat = a.category ? categoryMap.get(Number(a.category)) : null;
            const bCat = b.category ? categoryMap.get(Number(b.category)) : null;
            aVal = aCat ? aCat.name.toLowerCase() : null;
            bVal = bCat ? bCat.name.toLowerCase() : null;
            break;
        }
        case 'completedDate':
            aVal = getCompletedDate(a);
            bVal = getCompletedDate(b);
            break;
        default:
            return 0;
    }

    if (aVal === null && bVal === null) return 0;
    if (aVal === null) return 1;
    if (bVal === null) return -1;

    let cmp;
    if (field === 'completedDate') {
        cmp = new Date(aVal) - new Date(bVal);
    } else {
        cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    }

    return direction === 'asc' ? cmp : -cmp;
}

// ===========================================
// Tests: getCompletedDate
// ===========================================

describe('getCompletedDate', () => {
    it('returns last log entry date when log exists', () => {
        const task = {
            createdDate: '2026-01-01T10:00:00Z',
            log: [
                { date: '2026-01-05', action: 'Created' },
                { date: '2026-02-10', action: 'Done' }
            ]
        };
        assert.strictEqual(getCompletedDate(task), '2026-02-10');
    });

    it('falls back to createdDate split when log is empty', () => {
        const task = {
            createdDate: '2026-01-15T08:30:00Z',
            log: []
        };
        assert.strictEqual(getCompletedDate(task), '2026-01-15');
    });

    it('falls back to createdDate split when log is undefined', () => {
        const task = {
            createdDate: '2026-03-04T00:00:00Z'
        };
        assert.strictEqual(getCompletedDate(task), '2026-03-04');
    });

    it('returns empty string when log is empty and no createdDate', () => {
        const task = { log: [] };
        assert.strictEqual(getCompletedDate(task), '');
    });

    it('returns empty string when no log and no createdDate', () => {
        assert.strictEqual(getCompletedDate({}), '');
    });

    it('handles log entry with missing date gracefully', () => {
        const task = {
            createdDate: '2026-01-01T00:00:00Z',
            log: [{ action: 'No date entry' }]
        };
        // Last log entry has no date, falls back to empty string from log
        assert.strictEqual(getCompletedDate(task), '');
    });
});

// ===========================================
// Tests: sortTasks — title field
// ===========================================

describe('sortTasks — title', () => {
    const epicMap = new Map();
    const categoryMap = new Map();

    const taskA = { id: '1', title: 'Apple' };
    const taskB = { id: '2', title: 'Banana' };
    const taskC = { id: '3', title: 'cherry' };

    it('sorts title ascending (A before B)', () => {
        const result = sortTasks(taskA, taskB, 'title', 'asc', epicMap, categoryMap);
        assert.ok(result < 0, `Expected negative, got ${result}`);
    });

    it('sorts title descending (B before A)', () => {
        const result = sortTasks(taskA, taskB, 'title', 'desc', epicMap, categoryMap);
        assert.ok(result > 0, `Expected positive, got ${result}`);
    });

    it('is case-insensitive (banana before Cherry)', () => {
        const result = sortTasks(taskB, taskC, 'title', 'asc', epicMap, categoryMap);
        assert.ok(result < 0, `Expected negative, got ${result}`);
    });

    it('returns 0 for equal titles', () => {
        const task1 = { title: 'Same' };
        const task2 = { title: 'Same' };
        assert.strictEqual(sortTasks(task1, task2, 'title', 'asc', epicMap, categoryMap), 0);
    });
});

// ===========================================
// Tests: sortTasks — epicName field
// ===========================================

describe('sortTasks — epicName', () => {
    const epicMap = new Map([
        ['epic1', { id: 'epic1', name: 'Alpha' }],
        ['epic2', { id: 'epic2', name: 'Zeta' }]
    ]);
    const categoryMap = new Map();

    it('sorts epicName ascending', () => {
        const taskA = { epicId: 'epic1' };
        const taskB = { epicId: 'epic2' };
        const result = sortTasks(taskA, taskB, 'epicName', 'asc', epicMap, categoryMap);
        assert.ok(result < 0, `Expected negative, got ${result}`);
    });

    it('sorts epicName descending', () => {
        const taskA = { epicId: 'epic1' };
        const taskB = { epicId: 'epic2' };
        const result = sortTasks(taskA, taskB, 'epicName', 'desc', epicMap, categoryMap);
        assert.ok(result > 0, `Expected positive, got ${result}`);
    });

    it('null epicName sorts to end regardless of direction', () => {
        const taskWithEpic = { epicId: 'epic1' };
        const taskNoEpic = { epicId: null };

        const ascResult = sortTasks(taskWithEpic, taskNoEpic, 'epicName', 'asc', epicMap, categoryMap);
        assert.ok(ascResult < 0, `asc: task with epic should come first, got ${ascResult}`);

        const descResult = sortTasks(taskWithEpic, taskNoEpic, 'epicName', 'desc', epicMap, categoryMap);
        assert.ok(descResult < 0, `desc: task with epic should still come first, got ${descResult}`);
    });

    it('two null epicNames return 0', () => {
        const taskA = { epicId: null };
        const taskB = {};
        assert.strictEqual(sortTasks(taskA, taskB, 'epicName', 'asc', epicMap, categoryMap), 0);
    });
});

// ===========================================
// Tests: sortTasks — completedDate field
// ===========================================

describe('sortTasks — completedDate', () => {
    const epicMap = new Map();
    const categoryMap = new Map();

    const older = {
        log: [{ date: '2026-01-01', action: 'Archived' }]
    };
    const newer = {
        log: [{ date: '2026-03-04', action: 'Archived' }]
    };

    it('sorts completedDate ascending (older first)', () => {
        const result = sortTasks(older, newer, 'completedDate', 'asc', epicMap, categoryMap);
        assert.ok(result < 0, `Expected negative, got ${result}`);
    });

    it('sorts completedDate descending (newer first)', () => {
        const result = sortTasks(older, newer, 'completedDate', 'desc', epicMap, categoryMap);
        assert.ok(result > 0, `Expected positive, got ${result}`);
    });

    it('equal dates return 0', () => {
        const t1 = { log: [{ date: '2026-02-01', action: 'X' }] };
        const t2 = { log: [{ date: '2026-02-01', action: 'Y' }] };
        assert.strictEqual(sortTasks(t1, t2, 'completedDate', 'asc', epicMap, categoryMap), 0);
    });
});
