/**
 * Unit tests for utility functions
 *
 * Run with: node --test tests/unit/utils.test.js
 * Or run all tests: npm test
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');

// ===========================================
// Copy of getWeekNumber from server.js
// (We test the server's copy since it's used for reports)
// ===========================================
function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// ===========================================
// Copy of formatDateRange from server.js
// ===========================================
function formatDateRange(date) {
    const startOfWeek = new Date(date);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);

    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    if (startOfWeek.getMonth() === endOfWeek.getMonth()) {
        return `${months[startOfWeek.getMonth()]} ${startOfWeek.getDate()}-${endOfWeek.getDate()}`;
    } else {
        return `${months[startOfWeek.getMonth()]} ${startOfWeek.getDate()} - ${months[endOfWeek.getMonth()]} ${endOfWeek.getDate()}`;
    }
}

// ===========================================
// Tests for getWeekNumber
// ===========================================
describe('getWeekNumber', () => {

    it('returns week 1 for first week of 2026', () => {
        // January 1, 2026 is a Thursday
        const result = getWeekNumber(new Date('2026-01-01'));
        assert.strictEqual(result, 1);
    });

    it('returns week 1 for January 4, 2026 (Sunday of week 1)', () => {
        const result = getWeekNumber(new Date('2026-01-04'));
        assert.strictEqual(result, 1);
    });

    it('returns week 2 for January 5, 2026 (Monday of week 2)', () => {
        const result = getWeekNumber(new Date('2026-01-05'));
        assert.strictEqual(result, 2);
    });

    it('returns correct week for mid-year date', () => {
        // July 15, 2026 is a Wednesday
        const result = getWeekNumber(new Date('2026-07-15'));
        assert.strictEqual(result, 29);
    });

    it('returns week 52 or 53 for end of year', () => {
        const result = getWeekNumber(new Date('2026-12-31'));
        assert.ok(result >= 52, `Week ${result} should be >= 52`);
        assert.ok(result <= 53, `Week ${result} should be <= 53`);
    });

    it('handles leap year correctly (2024)', () => {
        // February 29, 2024 exists and is in week 9
        const result = getWeekNumber(new Date('2024-02-29'));
        assert.strictEqual(result, 9);
    });

    it('returns a number between 1 and 53', () => {
        // Test random dates throughout the year
        const testDates = [
            '2026-01-15', '2026-03-22', '2026-06-01',
            '2026-09-15', '2026-11-30', '2026-12-25'
        ];

        for (const dateStr of testDates) {
            const result = getWeekNumber(new Date(dateStr));
            assert.ok(result >= 1, `Week for ${dateStr} should be >= 1, got ${result}`);
            assert.ok(result <= 53, `Week for ${dateStr} should be <= 53, got ${result}`);
        }
    });

    it('handles Date object input', () => {
        const date = new Date(2026, 5, 15); // June 15, 2026
        const result = getWeekNumber(date);
        assert.strictEqual(typeof result, 'number');
        assert.ok(result > 0);
    });
});

// ===========================================
// Tests for formatDateRange
// ===========================================
describe('formatDateRange', () => {

    it('formats date range within same month', () => {
        // A Wednesday in middle of month
        const result = formatDateRange(new Date('2026-01-14'));
        // Week of Jan 12-18
        assert.ok(result.includes('Jan'), `Result "${result}" should include "Jan"`);
        assert.ok(result.includes('-'), `Result "${result}" should include "-"`);
    });

    it('formats date range spanning two months', () => {
        // A date near end of month that spans into next
        const result = formatDateRange(new Date('2026-01-29'));
        // Week of Jan 26 - Feb 1
        assert.ok(
            result.includes('Jan') && result.includes('Feb'),
            `Result "${result}" should span Jan and Feb`
        );
    });

    it('returns a non-empty string', () => {
        const result = formatDateRange(new Date('2026-06-15'));
        assert.strictEqual(typeof result, 'string');
        assert.ok(result.length > 0);
    });

    it('includes day numbers', () => {
        const result = formatDateRange(new Date('2026-03-15'));
        // Should contain numbers for the days
        assert.ok(/\d+/.test(result), `Result "${result}" should contain day numbers`);
    });
});

// ===========================================
// Tests for generateId pattern
// ===========================================
describe('generateId pattern', () => {

    // Simulating the generateId function from server.js
    function generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2, 11);
    }

    it('generates a non-empty string', () => {
        const id = generateId();
        assert.strictEqual(typeof id, 'string');
        assert.ok(id.length > 0);
    });

    it('generates unique IDs', () => {
        const ids = new Set();
        for (let i = 0; i < 100; i++) {
            ids.add(generateId());
        }
        // All 100 should be unique
        assert.strictEqual(ids.size, 100, 'All generated IDs should be unique');
    });

    it('generates IDs with consistent format', () => {
        const id = generateId();
        // Should be alphanumeric (base36)
        assert.ok(/^[a-z0-9]+$/.test(id), `ID "${id}" should be alphanumeric`);
        // Should be reasonably long (timestamp + random)
        assert.ok(id.length >= 10, `ID "${id}" should be at least 10 chars`);
    });
});
