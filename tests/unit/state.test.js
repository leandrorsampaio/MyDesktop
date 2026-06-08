/**
 * Unit tests for /public/js/state.js — pure state helpers used by
 * optimistic UI and snapshot/rollback flows.
 *
 * Uses dynamic import() because state.js is an ES module; the test
 * harness uses CommonJS require().
 */

const { describe, it, before, beforeEach } = require('node:test');
const assert = require('node:assert');

let state;
before(async () => {
    state = await import('../../public/js/state.js');
});

beforeEach(() => {
    state.setTasks([]);
    state.setEditingTaskId(null);
    state.setCategories([]);
    state.setEpics([]);
    state.setProfiles([]);
    state.setActiveProfile(null);
    state.setColumns([]);
    state.setActiveEpicFilter(null);
    state.setPriorityFilterActive(false);
    state.activeCategoryFilters.clear();
});

describe('setTasks / addTask / removeTask', () => {
    it('setTasks replaces the entire tasks array', () => {
        state.setTasks([{ id: 'a' }, { id: 'b' }]);
        assert.strictEqual(state.tasks.length, 2);
    });

    it('addTask appends to the existing array', () => {
        state.setTasks([{ id: 'a' }]);
        state.addTask({ id: 'b' });
        assert.strictEqual(state.tasks.length, 2);
        assert.strictEqual(state.tasks[1].id, 'b');
    });

    it('removeTask filters by id', () => {
        state.setTasks([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
        state.removeTask('b');
        assert.deepStrictEqual(state.tasks.map(t => t.id), ['a', 'c']);
    });

    it('removeTask is a no-op for unknown id', () => {
        state.setTasks([{ id: 'a' }]);
        state.removeTask('unknown');
        assert.strictEqual(state.tasks.length, 1);
    });
});

describe('updateTaskInState', () => {
    it('merges updates onto the existing task', () => {
        state.setTasks([{ id: 'a', title: 'Old', priority: false }]);
        state.updateTaskInState('a', { title: 'New', priority: true });
        const t = state.tasks[0];
        assert.strictEqual(t.title, 'New');
        assert.strictEqual(t.priority, true);
        assert.strictEqual(t.id, 'a', 'id preserved');
    });

    it('is a no-op for unknown id', () => {
        state.setTasks([{ id: 'a', title: 'Old' }]);
        state.updateTaskInState('unknown', { title: 'X' });
        assert.strictEqual(state.tasks[0].title, 'Old');
    });
});

describe('findTask', () => {
    it('returns the matching task', () => {
        state.setTasks([{ id: 'a', title: 'Find me' }]);
        const found = state.findTask('a');
        assert.strictEqual(found.title, 'Find me');
    });

    it('returns undefined for unknown id', () => {
        state.setTasks([{ id: 'a' }]);
        assert.strictEqual(state.findTask('missing'), undefined);
    });
});

describe('createTasksSnapshot / restoreTasksFromSnapshot', () => {
    it('snapshot is a deep copy (independent of source)', () => {
        state.setTasks([{ id: 'a', title: 'Original', nested: { x: 1 } }]);
        const snap = state.createTasksSnapshot();

        // Mutate source — snapshot must NOT change
        state.tasks[0].title = 'Mutated';
        state.tasks[0].nested.x = 99;

        assert.strictEqual(snap[0].title, 'Original');
        assert.strictEqual(snap[0].nested.x, 1);
    });

    it('restore brings the array back', () => {
        state.setTasks([{ id: 'a', title: 'Original' }]);
        const snap = state.createTasksSnapshot();

        // Mutate
        state.setTasks([{ id: 'b', title: 'Different' }]);
        assert.strictEqual(state.tasks[0].title, 'Different');

        // Restore
        state.restoreTasksFromSnapshot(snap);
        assert.strictEqual(state.tasks.length, 1);
        assert.strictEqual(state.tasks[0].title, 'Original');
    });

    it('snapshot of empty array works', () => {
        const snap = state.createTasksSnapshot();
        assert.deepStrictEqual(snap, []);
    });
});

describe('replaceTask', () => {
    it('replaces the matching task with a new object', () => {
        state.setTasks([{ id: 'temp-1', title: 'Temp' }, { id: 'other' }]);
        state.replaceTask('temp-1', { id: 'real-1', title: 'Real' });
        assert.deepStrictEqual(state.tasks.map(t => t.id), ['real-1', 'other']);
        assert.strictEqual(state.tasks[0].title, 'Real');
    });

    it('is a no-op for unknown id', () => {
        state.setTasks([{ id: 'a' }]);
        state.replaceTask('missing', { id: 'never' });
        assert.deepStrictEqual(state.tasks.map(t => t.id), ['a']);
    });
});

describe('generateTempId', () => {
    it('starts with "temp-"', () => {
        const id = state.generateTempId();
        assert.match(id, /^temp-/);
    });

    it('returns a different id each call', () => {
        const ids = new Set();
        for (let i = 0; i < 100; i++) ids.add(state.generateTempId());
        assert.strictEqual(ids.size, 100, 'all 100 ids should be unique');
    });
});

describe('setColumns', () => {
    it('sorts by order', () => {
        state.setColumns([
            { id: 'c', order: 2 },
            { id: 'a', order: 0 },
            { id: 'b', order: 1 }
        ]);
        assert.deepStrictEqual(state.columns.map(c => c.id), ['a', 'b', 'c']);
    });

    it('does not mutate the input array', () => {
        const input = [{ id: 'b', order: 1 }, { id: 'a', order: 0 }];
        state.setColumns(input);
        assert.deepStrictEqual(input.map(c => c.id), ['b', 'a'], 'input untouched');
    });
});
