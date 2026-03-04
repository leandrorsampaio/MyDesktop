/**
 * Client-side router.
 * Parses window.location.pathname to determine which page to show.
 * No dependencies — safe to import early.
 */

/** Sub-pages that live under /:alias/<page>. Board is the default (no segment). */
export const SUB_PAGES = ['dashboard', 'backlog', 'archive', 'reports', 'ai'];

/**
 * Parses a pathname into { alias, page }.
 * @param {string} [pathname] - Defaults to window.location.pathname
 * @returns {{ alias: string, page: string }}
 */
export function parsePath(pathname = window.location.pathname) {
    const segments = pathname.split('/').filter(Boolean);
    const alias = segments[0] || '';
    const page = SUB_PAGES.includes(segments[1]) ? segments[1] : 'board';
    return { alias, page };
}

/**
 * Builds a URL path for a given alias and page.
 * @param {string} alias
 * @param {string} page
 * @returns {string}
 */
export function buildPath(alias, page) {
    return page === 'board' ? `/${alias}` : `/${alias}/${page}`;
}
