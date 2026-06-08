/**
 * Unit tests for /public/js/filters.js — specifically the pure
 * shouldHideCard() helper that encodes the AND-logic across the three
 * filter dimensions (category, priority, epic).
 */

const { describe, it, before } = require('node:test');
const assert = require('node:assert');

let shouldHideCard;
before(async () => {
    ({ shouldHideCard } = await import('../../public/js/filters.js'));
});

// Convenience: build a "no filters active" filter state
function noFilters() {
    return {
        activeCategoryFilters: new Set(),
        priorityFilterActive: false,
        activeEpicFilter: null
    };
}

describe('shouldHideCard — no filters active', () => {
    it('never hides anything when no filter is set', () => {
        const card = { category: 2, priority: false, epicId: null };
        assert.strictEqual(shouldHideCard(card, noFilters()), false);
    });
});

describe('shouldHideCard — category filter', () => {
    it('hides cards not in the active category set', () => {
        const filters = { ...noFilters(), activeCategoryFilters: new Set([1, 3]) };
        assert.strictEqual(shouldHideCard({ category: 2, priority: false, epicId: null }, filters), true);
    });

    it('shows cards whose category IS in the active set', () => {
        const filters = { ...noFilters(), activeCategoryFilters: new Set([1, 3]) };
        assert.strictEqual(shouldHideCard({ category: 1, priority: false, epicId: null }, filters), false);
        assert.strictEqual(shouldHideCard({ category: 3, priority: false, epicId: null }, filters), false);
    });

    it('empty category set means "no category filter active" — show all', () => {
        const filters = { ...noFilters(), activeCategoryFilters: new Set() };
        assert.strictEqual(shouldHideCard({ category: 999, priority: false, epicId: null }, filters), false);
    });
});

describe('shouldHideCard — priority filter', () => {
    it('hides non-priority cards when priority filter is active', () => {
        const filters = { ...noFilters(), priorityFilterActive: true };
        assert.strictEqual(shouldHideCard({ category: 1, priority: false, epicId: null }, filters), true);
    });

    it('shows priority cards when priority filter is active', () => {
        const filters = { ...noFilters(), priorityFilterActive: true };
        assert.strictEqual(shouldHideCard({ category: 1, priority: true, epicId: null }, filters), false);
    });

    it('shows non-priority cards when priority filter is OFF', () => {
        const filters = { ...noFilters(), priorityFilterActive: false };
        assert.strictEqual(shouldHideCard({ category: 1, priority: false, epicId: null }, filters), false);
    });
});

describe('shouldHideCard — epic filter', () => {
    it('hides cards whose epicId is different', () => {
        const filters = { ...noFilters(), activeEpicFilter: 'epic-A' };
        assert.strictEqual(shouldHideCard({ category: 1, priority: false, epicId: 'epic-B' }, filters), true);
    });

    it('hides cards with null epicId when an epic filter is active', () => {
        const filters = { ...noFilters(), activeEpicFilter: 'epic-A' };
        assert.strictEqual(shouldHideCard({ category: 1, priority: false, epicId: null }, filters), true);
    });

    it('shows cards whose epicId matches the active filter', () => {
        const filters = { ...noFilters(), activeEpicFilter: 'epic-A' };
        assert.strictEqual(shouldHideCard({ category: 1, priority: false, epicId: 'epic-A' }, filters), false);
    });

    it('null activeEpicFilter means "no epic filter" — show all', () => {
        const filters = { ...noFilters(), activeEpicFilter: null };
        assert.strictEqual(shouldHideCard({ category: 1, priority: false, epicId: 'anything' }, filters), false);
    });
});

describe('shouldHideCard — AND logic across all three dimensions', () => {
    it('all three filters active, card matches all → show', () => {
        const filters = {
            activeCategoryFilters: new Set([2]),
            priorityFilterActive: true,
            activeEpicFilter: 'epic-X'
        };
        const card = { category: 2, priority: true, epicId: 'epic-X' };
        assert.strictEqual(shouldHideCard(card, filters), false);
    });

    it('all three filters active, card fails ONE → hide', () => {
        const filters = {
            activeCategoryFilters: new Set([2]),
            priorityFilterActive: true,
            activeEpicFilter: 'epic-X'
        };
        // wrong epic
        assert.strictEqual(shouldHideCard(
            { category: 2, priority: true, epicId: 'epic-Y' }, filters), true);
        // wrong priority
        assert.strictEqual(shouldHideCard(
            { category: 2, priority: false, epicId: 'epic-X' }, filters), true);
        // wrong category
        assert.strictEqual(shouldHideCard(
            { category: 99, priority: true, epicId: 'epic-X' }, filters), true);
    });
});
