/**
 * Unit tests for input validation logic
 *
 * These tests document the validation rules that SHOULD be enforced.
 * Some tests may fail initially - that's intentional! They serve as
 * a specification for validation you may want to implement.
 *
 * Run with: node --test tests/unit/validation.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');

// ===========================================
// Validation helper functions
// (These can be moved to a shared module later)
// ===========================================

/**
 * Validates that a title is valid
 * @param {any} title - The title to validate
 * @returns {boolean} True if valid
 */
function isValidTitle(title) {
    if (typeof title !== 'string') return false;
    if (title.trim().length === 0) return false;
    return true;
}

/**
 * Validates that a category is valid (1-6)
 * @param {any} category - The category to validate
 * @returns {boolean} True if valid
 */
function isValidCategory(category) {
    if (category === undefined) return true; // Optional, defaults to 1
    const num = Number(category);
    return Number.isInteger(num) && num >= 1 && num <= 6;
}

/**
 * Validates that a priority is valid (boolean)
 * @param {any} priority - The priority to validate
 * @returns {boolean} True if valid
 */
function isValidPriority(priority) {
    if (priority === undefined) return true; // Optional, defaults to false
    return typeof priority === 'boolean';
}

/**
 * Validates that a status is valid
 * @param {any} status - The status to validate
 * @returns {boolean} True if valid
 */
function isValidStatus(status) {
    const validStatuses = ['todo', 'wait', 'inprogress', 'done', 'archived'];
    return validStatuses.includes(status);
}

/**
 * Validates that a position is valid (non-negative integer)
 * @param {any} position - The position to validate
 * @returns {boolean} True if valid
 */
function isValidPosition(position) {
    if (position === undefined) return true; // Optional
    if (position === null) return false; // null is not valid
    const num = Number(position);
    return Number.isInteger(num) && num >= 0;
}

// ===========================================
// Tests for Title Validation
// ===========================================
describe('Title validation', () => {

    describe('valid titles', () => {
        it('accepts a simple string', () => {
            assert.strictEqual(isValidTitle('My Task'), true);
        });

        it('accepts a string with spaces', () => {
            assert.strictEqual(isValidTitle('  My Task  '), true);
        });

        it('accepts a single character', () => {
            assert.strictEqual(isValidTitle('X'), true);
        });

        it('accepts unicode characters', () => {
            assert.strictEqual(isValidTitle('Task with emoji '), true);
        });

        it('accepts numbers as string', () => {
            assert.strictEqual(isValidTitle('123'), true);
        });
    });

    describe('invalid titles', () => {
        it('rejects empty string', () => {
            assert.strictEqual(isValidTitle(''), false);
        });

        it('rejects whitespace-only string', () => {
            assert.strictEqual(isValidTitle('   '), false);
        });

        it('rejects null', () => {
            assert.strictEqual(isValidTitle(null), false);
        });

        it('rejects undefined', () => {
            assert.strictEqual(isValidTitle(undefined), false);
        });

        it('rejects number', () => {
            assert.strictEqual(isValidTitle(123), false);
        });

        it('rejects object', () => {
            assert.strictEqual(isValidTitle({ title: 'test' }), false);
        });

        it('rejects array', () => {
            assert.strictEqual(isValidTitle(['test']), false);
        });
    });
});

// ===========================================
// Tests for Category Validation
// ===========================================
describe('Category validation', () => {

    describe('valid categories', () => {
        it('accepts category 1 (Non categorized)', () => {
            assert.strictEqual(isValidCategory(1), true);
        });

        it('accepts category 6 (Generic Task)', () => {
            assert.strictEqual(isValidCategory(6), true);
        });

        it('accepts all categories 1-6', () => {
            for (let i = 1; i <= 6; i++) {
                assert.strictEqual(isValidCategory(i), true, `Category ${i} should be valid`);
            }
        });

        it('accepts undefined (defaults to 1)', () => {
            assert.strictEqual(isValidCategory(undefined), true);
        });

        it('accepts string number that converts to valid int', () => {
            assert.strictEqual(isValidCategory('3'), true);
        });
    });

    describe('invalid categories', () => {
        it('rejects 0', () => {
            assert.strictEqual(isValidCategory(0), false);
        });

        it('rejects 7', () => {
            assert.strictEqual(isValidCategory(7), false);
        });

        it('rejects negative numbers', () => {
            assert.strictEqual(isValidCategory(-1), false);
        });

        it('rejects decimal numbers', () => {
            assert.strictEqual(isValidCategory(3.5), false);
        });

        it('rejects non-numeric strings', () => {
            assert.strictEqual(isValidCategory('abc'), false);
        });

        it('rejects null', () => {
            assert.strictEqual(isValidCategory(null), false);
        });
    });
});

// ===========================================
// Tests for Priority Validation
// ===========================================
describe('Priority validation', () => {

    describe('valid priority values', () => {
        it('accepts true', () => {
            assert.strictEqual(isValidPriority(true), true);
        });

        it('accepts false', () => {
            assert.strictEqual(isValidPriority(false), true);
        });

        it('accepts undefined (defaults to false)', () => {
            assert.strictEqual(isValidPriority(undefined), true);
        });
    });

    describe('invalid priority values', () => {
        it('rejects string "true"', () => {
            assert.strictEqual(isValidPriority('true'), false);
        });

        it('rejects number 1', () => {
            assert.strictEqual(isValidPriority(1), false);
        });

        it('rejects number 0', () => {
            assert.strictEqual(isValidPriority(0), false);
        });

        it('rejects null', () => {
            assert.strictEqual(isValidPriority(null), false);
        });

        it('rejects object', () => {
            assert.strictEqual(isValidPriority({}), false);
        });
    });
});

// ===========================================
// Tests for Status Validation
// ===========================================
describe('Status validation', () => {

    describe('valid statuses', () => {
        it('accepts "todo"', () => {
            assert.strictEqual(isValidStatus('todo'), true);
        });

        it('accepts "wait"', () => {
            assert.strictEqual(isValidStatus('wait'), true);
        });

        it('accepts "inprogress"', () => {
            assert.strictEqual(isValidStatus('inprogress'), true);
        });

        it('accepts "done"', () => {
            assert.strictEqual(isValidStatus('done'), true);
        });

        it('accepts "archived"', () => {
            assert.strictEqual(isValidStatus('archived'), true);
        });
    });

    describe('invalid statuses', () => {
        it('rejects "Todo" (wrong case)', () => {
            assert.strictEqual(isValidStatus('Todo'), false);
        });

        it('rejects "in-progress" (wrong format)', () => {
            assert.strictEqual(isValidStatus('in-progress'), false);
        });

        it('rejects empty string', () => {
            assert.strictEqual(isValidStatus(''), false);
        });

        it('rejects random string', () => {
            assert.strictEqual(isValidStatus('invalid'), false);
        });

        it('rejects null', () => {
            assert.strictEqual(isValidStatus(null), false);
        });

        it('rejects undefined', () => {
            assert.strictEqual(isValidStatus(undefined), false);
        });
    });
});

// ===========================================
// Tests for Position Validation
// ===========================================
describe('Position validation', () => {

    describe('valid positions', () => {
        it('accepts 0', () => {
            assert.strictEqual(isValidPosition(0), true);
        });

        it('accepts positive integers', () => {
            assert.strictEqual(isValidPosition(1), true);
            assert.strictEqual(isValidPosition(100), true);
        });

        it('accepts undefined (optional)', () => {
            assert.strictEqual(isValidPosition(undefined), true);
        });

        it('accepts string number that converts to valid int', () => {
            assert.strictEqual(isValidPosition('5'), true);
        });
    });

    describe('invalid positions', () => {
        it('rejects negative numbers', () => {
            assert.strictEqual(isValidPosition(-1), false);
        });

        it('rejects decimal numbers', () => {
            assert.strictEqual(isValidPosition(1.5), false);
        });

        it('rejects non-numeric strings', () => {
            assert.strictEqual(isValidPosition('abc'), false);
        });

        it('rejects null', () => {
            assert.strictEqual(isValidPosition(null), false);
        });
    });
});

// ===========================================
// Tests for Constants (sanity checks)
// ===========================================
describe('Constants sanity checks', () => {

    const CATEGORIES = {
        1: 'Non categorized',
        2: 'Development',
        3: 'Communication',
        4: 'To Remember',
        5: 'Planning',
        6: 'Generic Task'
    };

    it('has 6 categories', () => {
        assert.strictEqual(Object.keys(CATEGORIES).length, 6);
    });

    it('categories are numbered 1-6', () => {
        const keys = Object.keys(CATEGORIES).map(Number);
        assert.deepStrictEqual(keys, [1, 2, 3, 4, 5, 6]);
    });

    it('all category labels are non-empty strings', () => {
        for (const [id, label] of Object.entries(CATEGORIES)) {
            assert.strictEqual(typeof label, 'string', `Category ${id} label should be string`);
            assert.ok(label.length > 0, `Category ${id} label should not be empty`);
        }
    });

    it('category 1 is "Non categorized" (default)', () => {
        assert.strictEqual(CATEGORIES[1], 'Non categorized');
    });
});
