/**
 * Design System page — visual reference for typography and button styles.
 * No API data — pure showcase rendered from the current token set + button inventory.
 */

const TEXT_SIZES = [
    { token: '--text-xs',   value: '10px', use: 'Badges, micro-labels' },
    { token: '--text-sm',   value: '11px', use: 'Toolbar, small labels' },
    { token: '--text-base', value: '12px', use: 'Secondary body' },
    { token: '--text-md',   value: '13px', use: 'Body default' },
    { token: '--text-lg',   value: '14px', use: 'Larger body, alerts' },
    { token: '--text-xl',   value: '16px', use: 'Section headers' },
    { token: '--text-2xl',  value: '18px', use: 'Subtitles' },
    { token: '--text-3xl',  value: '22px', use: 'Page subheads' },
    { token: '--text-4xl',  value: '24px', use: 'Page titles' },
];

const FONT_WEIGHTS = [
    { token: '--font-weight-regular',  value: 400, label: 'Regular' },
    { token: '--font-weight-medium',   value: 500, label: 'Medium' },
    { token: '--font-weight-semibold', value: 600, label: 'Semibold' },
    { token: '--font-weight-bold',     value: 700, label: 'Bold' },
];

const TYPE_CLASSES = [
    { cls: 'title --xl', selector: '.title.--xl', size: '24px (--text-4xl)', weight: 'Semibold', use: 'Page titles' },
    { cls: 'title --lg', selector: '.title.--lg', size: '18px (--text-2xl)', weight: 'Semibold', use: 'Major section headers' },
    { cls: 'title --md', selector: '.title.--md', size: '16px (--text-xl)',  weight: 'Semibold', use: 'Subsection / card headers' },
    { cls: 'title --sm', selector: '.title.--sm', size: '14px (--text-lg)',  weight: 'Semibold', use: 'Small headings, strong labels' },
    { cls: 'text --lg',  selector: '.text.--lg',  size: '14px (--text-lg)',  weight: 'Regular',  use: 'Emphasised body copy' },
    { cls: 'text --md',  selector: '.text.--md',  size: '13px (--text-md)',  weight: 'Regular',  use: 'Default body — most common' },
    { cls: 'text --sm',  selector: '.text.--sm',  size: '12px (--text-base)',weight: 'Regular',  use: 'Secondary text, button labels' },
    { cls: 'text --xs',  selector: '.text.--xs',  size: '11px (--text-sm)',  weight: 'Medium',   use: 'Metadata, micro-labels' },
];

function renderTypographySection() {
    const classRows = TYPE_CLASSES.map(t => `
        <div class="designSystemPage__row">
            <div class="designSystemPage__meta">
                <code class="designSystemPage__token">${t.selector}</code>
                <span class="designSystemPage__value">${t.size} · ${t.weight}</span>
                <span class="designSystemPage__use">${t.use}</span>
            </div>
            <div class="${t.cls}">
                The quick brown fox jumps over the lazy dog
            </div>
        </div>
    `).join('');

    const sizeRows = TEXT_SIZES.map(s => `
        <div class="designSystemPage__row">
            <div class="designSystemPage__meta">
                <code class="designSystemPage__token">${s.token}</code>
                <span class="designSystemPage__value">${s.value}</span>
                <span class="designSystemPage__use">${s.use}</span>
            </div>
            <div class="designSystemPage__sample" style="font-size: var(${s.token});">
                The quick brown fox jumps over the lazy dog
            </div>
        </div>
    `).join('');

    const weightRows = FONT_WEIGHTS.map(w => `
        <div class="designSystemPage__row">
            <div class="designSystemPage__meta">
                <code class="designSystemPage__token">${w.token}</code>
                <span class="designSystemPage__value">${w.value}</span>
                <span class="designSystemPage__use">${w.label}</span>
            </div>
            <div class="designSystemPage__sample" style="font-weight: var(${w.token}); font-size: var(--text-lg);">
                The quick brown fox jumps over the lazy dog
            </div>
        </div>
    `).join('');

    return `
        <section class="designSystemPage__section">
            <h3 class="designSystemPage__sectionTitle">Typography Classes — what to use</h3>
            <p class="designSystemPage__sectionLead">
                Composable BEM blocks. Apply one of these to every piece of copy. Example: <code>&lt;h2 class="title --lg"&gt;</code>.
                <code>.title</code> for headings, <code>.text</code> for body and button labels.
            </p>
            <div class="designSystemPage__table">${classRows}</div>
        </section>

        <section class="designSystemPage__section">
            <h3 class="designSystemPage__sectionTitle">Underlying Size Tokens</h3>
            <p class="designSystemPage__sectionLead">Primitives. Used by the classes above. Reach for these only when a one-off size is genuinely needed.</p>
            <div class="designSystemPage__table">${sizeRows}</div>
        </section>

        <section class="designSystemPage__section">
            <h3 class="designSystemPage__sectionTitle">Underlying Weight Tokens</h3>
            <p class="designSystemPage__sectionLead">Primitives. The class system above picks weight per class — you rarely need to touch these directly.</p>
            <div class="designSystemPage__table">${weightRows}</div>
        </section>

        <section class="designSystemPage__section">
            <h3 class="designSystemPage__sectionTitle">Font Family</h3>
            <p class="designSystemPage__sectionLead"><code>--font-family</code>: native system stack — no Google Fonts, no web fonts.</p>
            <div class="designSystemPage__familySample">
                -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif
            </div>
        </section>
    `;
}

function buttonGroup(title, lead, buttonsHtml) {
    return `
        <section class="designSystemPage__section">
            <h3 class="designSystemPage__sectionTitle">${title}</h3>
            <p class="designSystemPage__sectionLead">${lead}</p>
            <div class="designSystemPage__buttons">${buttonsHtml}</div>
        </section>
    `;
}

function buttonCard(label, className, inner) {
    return `
        <div class="designSystemPage__buttonCard">
            <div class="designSystemPage__buttonStage">${inner}</div>
            <code class="designSystemPage__buttonClass">${className}</code>
            <span class="designSystemPage__buttonLabel">${label}</span>
        </div>
    `;
}

function renderButtonsSection() {
    // Modal / form action buttons (.btn family)
    const modalBtns = [
        buttonCard('Primary action',  '.btn.--save',   '<button type="button" class="btn --save">Save Task</button>'),
        buttonCard('Cancel / dismiss','.btn.--cancel', '<button type="button" class="btn --cancel">Cancel</button>'),
        buttonCard('Destructive',     '.btn.--delete', '<button type="button" class="btn --delete">Delete</button>'),
    ].join('');

    // Toolbar buttons — render with the same .toolbar wrapper so styling resolves
    const toolbarBtns = `
        <div class="designSystemPage__buttonCard">
            <div class="designSystemPage__buttonStage">
                <div class="toolbar">
                    <button type="button" class="toolbar__priorityBtn">All</button>
                    <button type="button" class="toolbar__priorityBtn --active">High</button>
                </div>
            </div>
            <code class="designSystemPage__buttonClass">.toolbar__priorityBtn / .--active</code>
            <span class="designSystemPage__buttonLabel">Toolbar filter (default + active)</span>
        </div>
        <div class="designSystemPage__buttonCard">
            <div class="designSystemPage__buttonStage">
                <div class="toolbar">
                    <button type="button" class="toolbar__privacyBtn">Privacy</button>
                    <button type="button" class="toolbar__privacyBtn --active">Privacy</button>
                </div>
            </div>
            <code class="designSystemPage__buttonClass">.toolbar__privacyBtn / .--active</code>
            <span class="designSystemPage__buttonLabel">Toolbar toggle (uppercase, letter-spaced)</span>
        </div>
        <div class="designSystemPage__buttonCard">
            <div class="designSystemPage__buttonStage">
                <button type="button" class="toolbar__snoozeBtn">Snooze</button>
                <button type="button" class="toolbar__snoozeBtn --active">Active</button>
            </div>
            <code class="designSystemPage__buttonClass">.toolbar__snoozeBtn</code>
            <span class="designSystemPage__buttonLabel">Pill button (border-radius: 20px)</span>
        </div>
    `;

    // Editor buttons
    const editorBtns = `
        <div class="designSystemPage__buttonCard">
            <div class="designSystemPage__buttonStage">
                <button type="button" class="checklistEditor__addBtn">+ Add item</button>
            </div>
            <code class="designSystemPage__buttonClass">.checklistEditor__addBtn</code>
            <span class="designSystemPage__buttonLabel">Dashed-border add button</span>
        </div>
        <div class="designSystemPage__buttonCard">
            <div class="designSystemPage__buttonStage">
                <button type="button" class="checklistEditor__removeBtn" aria-label="Remove">×</button>
            </div>
            <code class="designSystemPage__buttonClass">.checklistEditor__removeBtn</code>
            <span class="designSystemPage__buttonLabel">Icon square remove (36×36)</span>
        </div>
        <div class="designSystemPage__buttonCard">
            <div class="designSystemPage__buttonStage">
                <button type="button" class="taskForm__quickBtn">Today</button>
                <button type="button" class="taskForm__quickBtn">Tomorrow</button>
            </div>
            <code class="designSystemPage__buttonClass">.taskForm__quickBtn</code>
            <span class="designSystemPage__buttonLabel">Inline quick-pick</span>
        </div>
        <div class="designSystemPage__buttonCard">
            <div class="designSystemPage__buttonStage">
                <button type="button" class="configPage__profilesBtn">Manage Profiles →</button>
            </div>
            <code class="designSystemPage__buttonClass">.configPage__profilesBtn</code>
            <span class="designSystemPage__buttonLabel">Outline / secondary action</span>
        </div>
    `;

    // Icon-only & minimal
    const minimalBtns = `
        <div class="designSystemPage__buttonCard">
            <div class="designSystemPage__buttonStage" style="background: var(--color-bg-primary); padding: var(--space-16); border-radius: var(--radius-md);">
                <button type="button" class="modal__closeBtn" aria-label="Close">×</button>
            </div>
            <code class="designSystemPage__buttonClass">.modal__closeBtn</code>
            <span class="designSystemPage__buttonLabel">Modal close (28px ×)</span>
        </div>
        <div class="designSystemPage__buttonCard">
            <div class="designSystemPage__buttonStage">
                <button type="button" class="reportsList__deleteBtn">Delete</button>
            </div>
            <code class="designSystemPage__buttonClass">.reportsList__deleteBtn</code>
            <span class="designSystemPage__buttonLabel">Minimal destructive (text → red on hover)</span>
        </div>
        <div class="designSystemPage__buttonCard">
            <div class="designSystemPage__buttonStage">
                <button type="button" class="aiPage__clearBtn">Clear chat</button>
            </div>
            <code class="designSystemPage__buttonClass">.aiPage__clearBtn</code>
            <span class="designSystemPage__buttonLabel">Ghost text button</span>
        </div>
        <div class="designSystemPage__buttonCard">
            <div class="designSystemPage__buttonStage">
                <button type="button" class="aiPage__sendBtn">Send</button>
                <button type="button" class="aiPage__sendBtn" disabled>Send</button>
            </div>
            <code class="designSystemPage__buttonClass">.aiPage__sendBtn (+ :disabled)</code>
            <span class="designSystemPage__buttonLabel">Inline primary (with disabled state)</span>
        </div>
    `;

    // FAB — visual replica (real <page-fab> uses position:fixed via Shadow :host
    // and would float to the page corner instead of sitting in the showcase card).
    const fabBtns = `
        <div class="designSystemPage__buttonCard">
            <div class="designSystemPage__buttonStage designSystemPage__buttonStage--fab">
                <button type="button" class="designSystemPage__fabReplica" aria-label="Add">+</button>
            </div>
            <code class="designSystemPage__buttonClass">&lt;page-fab&gt;</code>
            <span class="designSystemPage__buttonLabel">Floating action (48×48, position: fixed bottom-left in production)</span>
        </div>
    `;

    return `
        ${buttonGroup('Modal / Form Actions', 'The <code>.btn</code> family — used at the foot of every modal. <code>.--save</code> is the primary, <code>.--cancel</code> is neutral, <code>.--delete</code> is destructive.', modalBtns)}
        ${buttonGroup('Toolbar Buttons', 'Compact buttons used in the board toolbar. Filters use <code>.--active</code> to indicate selection.', toolbarBtns)}
        ${buttonGroup('Editor &amp; Inline Buttons', 'Buttons that live inside forms, editors, and config panels.', editorBtns)}
        ${buttonGroup('Icon-Only &amp; Minimal', 'Low-emphasis or icon-only controls. Most have a hover state that reveals colour.', minimalBtns)}
        ${buttonGroup('Floating Action Button', 'The <code>&lt;page-fab&gt;</code> Web Component used on Backlog and Reports pages.', fabBtns)}
    `;
}

/**
 * Initialises the Design System page inside the given container element.
 * @param {HTMLElement} pageViewEl
 */
export async function initDesignSystemPage(pageViewEl) {
    pageViewEl.classList.add('--fullPage');
    pageViewEl.innerHTML = `
        <div class="designSystemPage">
            <header class="designSystemPage__header">
                <h2 class="designSystemPage__title">Design System</h2>
                <p class="designSystemPage__subtitle">Live reference for typography and button styles. Pulled from the current token set in <code>:root</code>.</p>
            </header>

            <nav class="designSystemPage__nav">
                <a href="#typography" class="designSystemPage__navLink">Typography</a>
                <a href="#buttons" class="designSystemPage__navLink">Buttons</a>
            </nav>

            <div id="typography" class="designSystemPage__anchor">${renderTypographySection()}</div>
            <div id="buttons" class="designSystemPage__anchor">${renderButtonsSection()}</div>
        </div>
    `;
}
