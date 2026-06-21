/**
 * Unit tests for the theme logic in /public/js/utils.js (+ the THEMES registry
 * in constants.js). These functions are the source of truth for resolving a
 * profile's stored theme to an applied theme id; the inline bootstrap in
 * index.html duplicates only the resolve step.
 *
 * The pure functions are tested directly. resolveTheme()/systemPrefersDark()
 * read window.matchMedia, so we mock global.window for the OS-fallback cases.
 */

const { describe, it, before, afterEach } = require('node:test');
const assert = require('node:assert');

let getThemeById, getThemeAppearance, defaultThemeFor, resolveTheme, systemPrefersDark;
let THEMES, AUTO_THEME_LIGHT, AUTO_THEME_DARK;

before(async () => {
    ({ getThemeById, getThemeAppearance, defaultThemeFor, resolveTheme, systemPrefersDark } =
        await import('../../public/js/utils.js'));
    ({ THEMES, AUTO_THEME_LIGHT, AUTO_THEME_DARK } =
        await import('../../public/js/constants.js'));
});

/** Mocks the OS `prefers-color-scheme` result for systemPrefersDark(). */
function mockSystemDark(isDark) {
    global.window = { matchMedia: () => ({ matches: isDark }) };
}
afterEach(() => { delete global.window; });

describe('getThemeById', () => {
    it('returns the theme object for a known id', () => {
        assert.strictEqual(getThemeById('paper').name, 'Paper');
        assert.strictEqual(getThemeById('dark').appearance, 'dark');
    });
    it('returns null for an unknown id', () => {
        assert.strictEqual(getThemeById('nope'), null);
    });
});

describe('getThemeAppearance', () => {
    it('returns the appearance of each built-in theme', () => {
        assert.strictEqual(getThemeAppearance('light'), 'light');
        assert.strictEqual(getThemeAppearance('paper'), 'light');
        assert.strictEqual(getThemeAppearance('dark'), 'dark');
        assert.strictEqual(getThemeAppearance('slate'), 'dark');
        assert.strictEqual(getThemeAppearance('dim'), 'dark');
        assert.strictEqual(getThemeAppearance('hc'), 'dark');
    });
    it('defaults to light for an unknown id', () => {
        assert.strictEqual(getThemeAppearance('nope'), 'light');
    });
});

describe('defaultThemeFor', () => {
    it('maps an appearance to the auto-pair default theme id', () => {
        assert.strictEqual(defaultThemeFor('dark'), AUTO_THEME_DARK);
        assert.strictEqual(defaultThemeFor('light'), AUTO_THEME_LIGHT);
        // anything that isn't 'dark' falls to the light default
        assert.strictEqual(defaultThemeFor('whatever'), AUTO_THEME_LIGHT);
    });
});

describe('systemPrefersDark', () => {
    it('reflects the matchMedia result', () => {
        mockSystemDark(true);
        assert.strictEqual(systemPrefersDark(), true);
        mockSystemDark(false);
        assert.strictEqual(systemPrefersDark(), false);
    });
});

describe('resolveTheme', () => {
    it('returns an explicit, known theme id as-is (no OS lookup)', () => {
        // no window mock — an explicit valid id must return early
        assert.strictEqual(resolveTheme('paper'), 'paper');
        assert.strictEqual(resolveTheme('slate'), 'slate');
        assert.strictEqual(resolveTheme('light'), 'light');
    });
    it('falls back to the OS scheme for "auto"', () => {
        mockSystemDark(false);
        assert.strictEqual(resolveTheme('auto'), AUTO_THEME_LIGHT);
        mockSystemDark(true);
        assert.strictEqual(resolveTheme('auto'), AUTO_THEME_DARK);
    });
    it('falls back to the OS scheme for unknown / empty / null values', () => {
        mockSystemDark(true);
        assert.strictEqual(resolveTheme('garbage'), AUTO_THEME_DARK);
        assert.strictEqual(resolveTheme(''), AUTO_THEME_DARK);
        assert.strictEqual(resolveTheme(null), AUTO_THEME_DARK);
        assert.strictEqual(resolveTheme(undefined), AUTO_THEME_DARK);
    });
});

describe('THEMES registry', () => {
    it('every theme has an id, a name, and a valid appearance', () => {
        assert.ok(Array.isArray(THEMES) && THEMES.length > 0);
        for (const t of THEMES) {
            assert.ok(t.id, 'theme has an id');
            assert.ok(t.name, 'theme has a name');
            assert.ok(t.appearance === 'light' || t.appearance === 'dark',
                `theme ${t.id} has a valid appearance`);
        }
    });
    it('theme ids are unique', () => {
        const ids = THEMES.map(t => t.id);
        assert.strictEqual(new Set(ids).size, ids.length);
    });
    it('the auto-pair defaults are real themes (one light, one dark)', () => {
        assert.strictEqual(getThemeAppearance(AUTO_THEME_LIGHT), 'light');
        assert.strictEqual(getThemeAppearance(AUTO_THEME_DARK), 'dark');
    });
});
