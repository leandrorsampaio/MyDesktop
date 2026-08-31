/**
 * Configuration page module — renders and manages the /:alias/config page.
 * Single scrollable page with all config sections inline.
 */

import {
    MAX_COLUMNS, MAX_EPICS, MAX_CATEGORIES, MAX_PROFILES, MAX_SKILLS, EPIC_COLORS,
    DEFAULT_CATEGORY_ID, DEFAULT_CHECKLIST_ITEMS,
    DEFAULT_DEADLINE_URGENT_HOURS, DEFAULT_DEADLINE_WARNING_HOURS, THEMES
} from './constants.js';
import { escapeHtml, toCamelCase, getStoredTheme, setStoredTheme } from './utils.js';
import { openMarkdownModal } from './modals.js';
import {
    columns, setColumns, epics, setEpics, categories, setCategories, tasks,
    profiles, setProfiles, activeProfile, setActiveProfile
} from './state.js';
import {
    fetchColumnsApi, createColumnApi, updateColumnApi, deleteColumnApi, reorderColumnsApi,
    fetchEpicsApi, createEpicApi, updateEpicApi, deleteEpicApi,
    fetchCategoriesApi, createCategoryApi, updateCategoryApi, deleteCategoryApi,
    fetchAiConfigApi, createAiConfigEntryApi, updateAiConfigEntryApi, deleteAiConfigEntryApi,
    setActiveAiConfigApi,
    fetchProfilesApi, createProfileApi, updateProfileApi, deleteProfileApi,
    fetchProfileExportApi,
    fetchMemoriesApi, createMemoryApi, updateMemoryApi, deleteMemoryApi,
    fetchAiSkillsApi, createAiSkillApi, updateAiSkillApi, deleteAiSkillApi,
    fetchInterviewDigestApi, fetchMemoryMarkdownApi
} from './api.js';

const AI_PROVIDER_DEFAULTS = {
    anthropic: { label: 'Anthropic (Claude)',                  defaultModel: 'claude-haiku-4-5-20251001', requiresKey: true  },
    openai:    { label: 'OpenAI',                              defaultModel: 'gpt-4o-mini',              requiresKey: true  },
    groq:      { label: 'Groq',                               defaultModel: 'llama-3.3-70b-versatile',  requiresKey: true  },
    google:    { label: 'Google AI Studio (Gemini)',           defaultModel: 'gemini-2.0-flash',         requiresKey: true  },
    kimi:      { label: 'Kimi (Moonshot)',                     defaultModel: 'kimi-k3',                  requiresKey: true,  allowsBaseUrl: true },
    custom:    { label: 'Custom / Local (LM Studio, Ollama…)', defaultModel: '',                         requiresKey: false, allowsBaseUrl: true }
};

/**
 * Initialises the config page inside the given container element.
 * @param {HTMLElement} pageViewEl
 * @param {{ elements: Object }} opts
 */
export async function initConfigPage(pageViewEl, { elements }) {
    const toaster = document.querySelector('.js-toaster');

    pageViewEl.classList.add('--fullPage');
    pageViewEl.innerHTML = `
        <div class="configPage">
            <!-- Left tab nav -->
            <nav class="configPage__nav">
                <button class="configPage__navItem --active" data-tab="columns">Columns</button>
                <button class="configPage__navItem" data-tab="epics">Epics</button>
                <button class="configPage__navItem" data-tab="categories">Categories</button>
                <button class="configPage__navItem" data-tab="general">General</button>
                <button class="configPage__navItem" data-tab="checklist">Daily Checklist</button>
                <button class="configPage__navItem" data-tab="ai">AI Assistant</button>
                <div class="configPage__navDivider"></div>
                <button class="configPage__navItem" data-tab="profiles">Profiles</button>
            </nav>

            <!-- Right content -->
            <div class="configPage__content">

                <!-- Panel: Columns -->
                <div class="configPage__panel --active" data-panel="columns">
                    <h3 class="configPage__panelTitle">Columns</h3>
                    <p class="configPage__panelHint">Manage your board columns. Drag to reorder. The first column is the default. Maximum ${MAX_COLUMNS}.</p>
                    <div class="boardConfigEditor">
                        <div class="boardConfigEditor__form">
                            <div class="boardConfigEditor__formRow">
                                <input type="text" class="boardConfigEditor__nameInput js-cfg-columnNameInput" placeholder="New column name" />
                                <button type="button" class="btn --save js-cfg-columnAddBtn">Add Column</button>
                            </div>
                            <div class="boardConfigEditor__error js-cfg-columnError" style="display: none;"></div>
                        </div>
                        <div class="boardConfigEditor__list js-cfg-columnsList"></div>
                    </div>
                </div>

                <!-- Panel: Epics -->
                <div class="configPage__panel" data-panel="epics">
                    <h3 class="configPage__panelTitle">Epics</h3>
                    <p class="configPage__panelHint">Group tasks by project or initiative. Each epic has a unique color. Maximum ${MAX_EPICS}.</p>
                    <div class="epicsEditor">
                        <div class="epicsEditor__form">
                            <div class="epicsEditor__formRow">
                                <input type="text" class="epicsEditor__nameInput js-cfg-epicNameInput" placeholder="Epic name" />
                                <custom-picker type="color" placeholder="Select color" columns="5" class="js-cfg-epicColorSelect"></custom-picker>
                                <button type="button" class="btn --save js-cfg-epicAddBtn">Add Epic</button>
                            </div>
                            <div class="epicsEditor__alias js-cfg-epicAliasPreview"></div>
                            <div class="epicsEditor__colorError js-cfg-epicColorError" style="display: none;"></div>
                        </div>
                        <div class="epicsEditor__list js-cfg-epicsList"></div>
                    </div>
                </div>

                <!-- Panel: Categories -->
                <div class="configPage__panel" data-panel="categories">
                    <h3 class="configPage__panelTitle">Categories</h3>
                    <p class="configPage__panelHint">Organize tasks by type. Each category has an icon. Maximum ${MAX_CATEGORIES}.</p>
                    <div class="categoriesEditor">
                        <div class="categoriesEditor__form">
                            <div class="categoriesEditor__formRow">
                                <input type="text" class="categoriesEditor__nameInput js-cfg-categoryNameInput" placeholder="Category name" />
                                <custom-picker type="icon" placeholder="Select icon" columns="7" class="js-cfg-categoryIconSelect"></custom-picker>
                                <button type="button" class="btn --save js-cfg-categoryAddBtn">Add Category</button>
                            </div>
                            <div class="categoriesEditor__error js-cfg-categoryError" style="display: none;"></div>
                        </div>
                        <div class="categoriesEditor__list js-cfg-categoriesList"></div>
                    </div>
                </div>

                <!-- Panel: General -->
                <div class="configPage__panel" data-panel="general">
                    <h3 class="configPage__panelTitle">General</h3>
                    <p class="configPage__panelHint">Settings are saved per profile.</p>
                    <div class="generalConfig">
                        <div class="generalConfig__section">
                            <h4 class="generalConfig__sectionTitle">Appearance</h4>
                            <p class="generalConfig__panelHint" style="margin-bottom:12px">Theme for this profile — applies instantly. "Auto" follows your system setting (light/dark).</p>
                            <div class="generalConfig__options">
                                ${[{ value: 'auto', label: 'Auto (follow system)', auto: true }, ...THEMES.map(t => ({ value: t.id, label: t.name }))]
                                    .map(o => {
                                        const swatch = o.auto
                                            ? `<span class="themeSwatch --auto" aria-hidden="true"><span class="themeSwatch__half" data-theme="light"></span><span class="themeSwatch__half" data-theme="dark"></span></span>`
                                            : `<span class="themeSwatch" data-theme="${escapeHtml(o.value)}" aria-hidden="true"><span class="themeSwatch__band--primary"></span><span class="themeSwatch__band--secondary"></span><span class="themeSwatch__band--tertiary"></span></span>`;
                                        return `<label class="generalConfig__option">
                                    <input type="radio" name="cfgTheme" value="${escapeHtml(o.value)}">
                                    ${swatch}
                                    <span>${escapeHtml(o.label)}</span>
                                </label>`;
                                    }).join('')}
                            </div>
                        </div>
                        <div class="generalConfig__section">
                            <h4 class="generalConfig__sectionTitle">Interface Visibility</h4>
                            <div class="generalConfig__options">
                                <label class="generalConfig__option">
                                    <input type="checkbox" class="js-cfg-showDailyChecklist">
                                    <span>Show Daily Checklist</span>
                                </label>
                                <label class="generalConfig__option">
                                    <input type="checkbox" class="js-cfg-showNotes">
                                    <span>Show Notes</span>
                                </label>
                            </div>
                        </div>
                        <div class="generalConfig__section">
                            <h4 class="generalConfig__sectionTitle">Snoozed Tasks Display</h4>
                            <div class="generalConfig__options">
                                <label class="generalConfig__option">
                                    <input type="radio" name="cfgSnoozeVisibility" value="hidden">
                                    <span>Hidden — use "Show Snoozed" button to reveal</span>
                                </label>
                                <label class="generalConfig__option">
                                    <input type="radio" name="cfgSnoozeVisibility" value="transparent">
                                    <span>Semi-transparent (50% opacity, always visible)</span>
                                </label>
                            </div>
                        </div>
                        <div class="generalConfig__section">
                            <h4 class="generalConfig__sectionTitle">Deadline Urgency Thresholds</h4>
                            <p class="generalConfig__panelHint" style="margin-bottom:12px">Deadline chip changes color when the task is due within these hours.</p>
                            <div class="generalConfig__thresholds">
                                <div class="generalConfig__thresholdRow">
                                    <span class="generalConfig__thresholdLabel --urgent">Urgent (red)</span>
                                    <input type="number" class="js-cfg-deadlineUrgentHours" min="1" max="999" />
                                    <span>hours</span>
                                </div>
                                <div class="generalConfig__thresholdRow">
                                    <span class="generalConfig__thresholdLabel --warning">Warning (yellow)</span>
                                    <input type="number" class="js-cfg-deadlineWarningHours" min="1" max="999" />
                                    <span>hours</span>
                                </div>
                            </div>
                        </div>
                        <div class="configPage__actions">
                            <button type="button" class="btn --save js-cfg-generalSave">Save</button>
                        </div>
                        <div class="generalConfig__section">
                            <h4 class="generalConfig__sectionTitle">Your Data</h4>
                            <p class="configPage__panelHint" style="margin-bottom:12px">Everything lives in plain JSON on your machine (<code>data/</code> folder — copy it to back up). Export downloads this profile's data as a single JSON file.</p>
                            <button type="button" class="btn js-cfg-exportData">Export data (JSON)</button>
                        </div>
                    </div>
                </div>

                <!-- Panel: Checklist -->
                <div class="configPage__panel" data-panel="checklist">
                    <h3 class="configPage__panelTitle">Daily Checklist</h3>
                    <p class="configPage__panelHint">Add tasks to your daily checklist. Optionally add a URL to open when clicking the link icon.</p>
                    <div class="checklistEditor">
                        <div class="checklistEditor__items js-cfg-checklistItems"></div>
                        <button type="button" class="checklistEditor__addBtn js-cfg-checklistAddBtn">+ Add Item</button>
                        <div class="configPage__actions">
                            <button type="button" class="btn --save js-cfg-checklistSave">Save Checklist</button>
                        </div>
                    </div>
                </div>

                <!-- Panel: AI -->
                <div class="configPage__panel" data-panel="ai">
                    <h3 class="configPage__panelTitle">AI Assistant</h3>
                    <p class="configPage__panelHint">API keys are stored locally on your machine and never shared.</p>
                    <div class="aiConfig">
                        <div class="aiConfig__listPanel js-cfg-aiListPanel">
                            <div class="aiConfig__entries js-cfg-aiEntries"></div>
                            <button type="button" class="aiConfig__addBtn js-cfg-aiAddBtn">+ Add configuration</button>
                        </div>
                        <div class="aiConfig__formPanel js-cfg-aiFormPanel" style="display:none;">
                            <button type="button" class="aiConfig__backBtn js-cfg-aiBackBtn">← Back</button>
                            <div class="aiConfig__group">
                                <label class="aiConfig__label">Name</label>
                                <input type="text" class="aiConfig__input js-cfg-aiNameInput" placeholder="e.g. LM Studio - Devstral" maxlength="100" />
                            </div>
                            <div class="aiConfig__group">
                                <label class="aiConfig__label">Provider</label>
                                <select class="aiConfig__select js-cfg-aiProviderSel">
                                    <option value="anthropic">Anthropic (Claude)</option>
                                    <option value="openai">OpenAI</option>
                                    <option value="groq">Groq</option>
                                    <option value="google">Google AI Studio (Gemini)</option>
                                    <option value="kimi">Kimi (Moonshot)</option>
                                    <option value="custom">Custom / Local (LM Studio, Ollama…)</option>
                                </select>
                            </div>
                            <div class="aiConfig__group js-cfg-aiCustomUrlGroup" style="display:none;">
                                <label class="aiConfig__label">Base URL</label>
                                <input type="text" class="aiConfig__input js-cfg-aiCustomUrl" placeholder="http://localhost:1234/v1" />
                                <p class="aiConfig__fieldHint js-cfg-aiUrlHint">OpenAI-compatible endpoint. Works with LM Studio, Ollama, Jan, and similar tools.</p>
                            </div>
                            <div class="aiConfig__group">
                                <label class="aiConfig__label">Model</label>
                                <div class="aiConfig__inputRow">
                                    <input type="text" class="aiConfig__input js-cfg-aiModelInput" placeholder="Enter model name" list="cfgAiModelList" />
                                    <button type="button" class="btn --sm js-cfg-aiFetchModels" disabled>Fetch models</button>
                                </div>
                                <datalist id="cfgAiModelList"></datalist>
                                <p class="aiConfig__fieldHint js-cfg-aiModelHint">Model ids change without notice. Save the entry, then fetch the list the provider actually offers.</p>
                            </div>
                            <div class="aiConfig__group">
                                <label class="aiConfig__label">API Key</label>
                                <input type="password" class="aiConfig__input js-cfg-aiKeyInput" placeholder="Enter API key" autocomplete="off" />
                                <p class="aiConfig__fieldHint js-cfg-aiKeyHint"></p>
                            </div>
                            <div class="aiConfig__error js-cfg-aiError" style="display:none;"></div>
                            <div class="configPage__actions">
                                <button type="button" class="btn --cancel js-cfg-aiCancel">Cancel</button>
                                <button type="button" class="btn --save js-cfg-aiSave">Save</button>
                            </div>
                        </div>
                    </div>

                    <h3 class="configPage__panelTitle configPage__panelTitle--spaced">Skills</h3>
                    <p class="configPage__panelHint">Reusable instructions that shape <em>how</em> the assistant answers — its voice, length and format. Memories below record what it knows; skills tell it how to behave. Turn one <strong>always on</strong> to apply it to every conversation, or leave it off and switch it on per conversation from the assistant panel. Maximum ${MAX_SKILLS}.</p>
                    <div class="skillsEditor">
                        <div class="skillsEditor__list js-cfg-skillsList"></div>
                        <div class="skillsEditor__form js-cfg-skillForm" hidden>
                            <input type="text" class="aiConfig__input js-cfg-skillName" placeholder="Skill name, e.g. Be brief" maxlength="60" />
                            <textarea class="aiConfig__input skillsEditor__textarea js-cfg-skillInstructions" rows="4" maxlength="1000" placeholder="Answer in at most 3 sentences unless I ask you to expand. No preamble."></textarea>
                            <label class="skillsEditor__checkLabel">
                                <input type="checkbox" class="js-cfg-skillAlwaysOn" />
                                <span>Always on — apply to every conversation</span>
                            </label>
                            <div class="aiConfig__error js-cfg-skillError" style="display:none;"></div>
                            <div class="configPage__actions">
                                <button type="button" class="btn --cancel js-cfg-skillCancel">Cancel</button>
                                <button type="button" class="btn --save js-cfg-skillSave">Save</button>
                            </div>
                        </div>
                        <button type="button" class="aiConfig__addBtn js-cfg-skillAddBtn">+ Add skill</button>
                    </div>

                    <h3 class="configPage__panelTitle configPage__panelTitle--spaced">What the assistant remembers</h3>
                    <p class="configPage__panelHint">Durable facts about you and your work, sent with every message — so they survive restarts, new conversations, and switching to a different model. The assistant can suggest entries, but only ones you approve are used. Stored in <code>ai-memory.json</code> — plain text you can edit or delete at any time.</p>

                    <!-- What the assistant does not know yet. Computed from every
                         task including the archive, so it renders with the AI off. -->
                    <div class="interviewCard js-cfg-interviewCard">
                        <div class="interviewCard__body">
                            <span class="interviewCard__title">Let the assistant interview you</span>
                            <span class="interviewCard__hint js-cfg-interviewHint">Checking what it already knows…</span>
                        </div>
                        <button type="button" class="btn --primary js-cfg-interviewBtn" disabled>Interview me</button>
                    </div>

                    <div class="memoryEditor">
                        <div class="memoryEditor__addRow">
                            <input type="text" class="memoryEditor__input js-cfg-memoryInput" placeholder="e.g. Mikael is my boss" maxlength="300" />
                            <select class="aiConfig__select memoryEditor__categorySelect js-cfg-memoryCategory">
                                <option value="other">Other</option>
                                <option value="person">Person</option>
                                <option value="term">Term</option>
                                <option value="project">Project</option>
                                <option value="preference">Preference</option>
                            </select>
                            <button type="button" class="btn --primary js-cfg-memoryAddBtn">Add</button>
                        </div>
                        <div class="memoryEditor__list js-cfg-memoryList"></div>
                        <button type="button" class="aiConfig__addBtn js-cfg-memoryMarkdownBtn">View as Markdown</button>
                    </div>
                </div>

                <!-- Panel: Profiles -->
                <div class="configPage__panel" data-panel="profiles">
                    <h3 class="configPage__panelTitle">Profiles</h3>
                    <p class="configPage__panelHint">Separate your data (e.g., Work vs Personal). Each profile has its own tasks, epics, notes, and reports. Maximum ${MAX_PROFILES}.</p>
                    <div class="profilesEditor">
                        <div class="profilesEditor__form">
                            <div class="profilesEditor__formRow">
                                <input type="text" class="profilesEditor__nameInput js-cfg-profileNameInput" placeholder="Profile name" />
                                <input type="text" class="profilesEditor__lettersInput js-cfg-profileLettersInput" placeholder="AB" maxlength="3" />
                                <custom-picker type="color" placeholder="Select color" columns="5" class="js-cfg-profileColorSelect"></custom-picker>
                                <button type="button" class="btn --save js-cfg-profileAddBtn">Add Profile</button>
                            </div>
                            <div class="profilesEditor__alias js-cfg-profileAliasPreview"></div>
                            <div class="profilesEditor__error js-cfg-profileError" style="display: none;"></div>
                        </div>
                        <div class="profilesEditor__list js-cfg-profilesList"></div>
                    </div>
                </div>

            </div>
        </div>
    `;

    const $ = (sel) => pageViewEl.querySelector(sel);

    // ==========================================
    // Tab switching
    // ==========================================
    const navItems = pageViewEl.querySelectorAll('.configPage__navItem[data-tab]');
    const panels   = pageViewEl.querySelectorAll('.configPage__panel[data-panel]');

    navItems.forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            if (!tab) return;
            navItems.forEach(b => b.classList.remove('--active'));
            btn.classList.add('--active');
            panels.forEach(p => p.classList.toggle('--active', p.dataset.panel === tab));
        });
    });

    // ==========================================
    // Fetch all data in parallel
    // ==========================================
    try {
        const [fetchedColumns, fetchedEpics, fetchedCategories] = await Promise.all([
            fetchColumnsApi(),
            fetchEpicsApi(),
            fetchCategoriesApi()
        ]);
        setColumns(fetchedColumns);
        setEpics(fetchedEpics);
        setCategories(fetchedCategories);
    } catch (err) {
        console.error('Config page: failed to load data', err);
        if (toaster) toaster.error('Failed to load configuration data');
        return;
    }

    // ==========================================
    // Section: Columns
    // ==========================================
    const colNameInput = $('.js-cfg-columnNameInput');
    const colAddBtn    = $('.js-cfg-columnAddBtn');
    const colError     = $('.js-cfg-columnError');
    const colList      = $('.js-cfg-columnsList');

    // Confirmation modal (reused from index.html DOM)
    const colConfirmModal   = document.querySelector('.js-columnConfirmModal');
    const colConfirmMessage = document.querySelector('.js-columnConfirmMessage');
    const colConfirmCancel  = document.querySelector('.js-columnConfirmCancel');
    const colConfirmDelete  = document.querySelector('.js-columnConfirmDelete');
    let pendingColumnDelete = null;

    function renderColumns() {
        colNameInput.value = '';
        colError.style.display = 'none';

        const boardColumns = columns.filter(c => !c.isBacklog);
        if (boardColumns.length === 0) {
            colList.innerHTML = '<div class="emptyState">No columns configured</div>';
            return;
        }

        colList.innerHTML = boardColumns.map((col, idx) => `
            <div class="boardConfigEditor__item" data-col-id="${col.id}" draggable="true">
                <span class="boardConfigEditor__dragHandle" title="Drag to reorder">⠿</span>
                <span class="boardConfigEditor__badge ${idx === 0 ? '--default' : ''}">${idx === 0 ? 'Default' : ''}</span>
                <input type="text" class="boardConfigEditor__itemName js-colItemName" value="${escapeHtml(col.name)}" data-col-id="${col.id}" />
                <label class="boardConfigEditor__archiveToggle" title="Show Archive button on this column">
                    <input type="checkbox" class="js-colArchiveToggle" data-col-id="${col.id}" ${col.hasArchive ? 'checked' : ''} />
                    <span>Archive btn</span>
                </label>
                <label class="boardConfigEditor__archiveToggle" title="Play a confetti burst when a task lands in this column">
                    <input type="checkbox" class="js-colCelebrateToggle" data-col-id="${col.id}" ${col.celebrate ? 'checked' : ''} />
                    <span>Celebrate</span>
                </label>
                <button class="boardConfigEditor__deleteBtn js-colDeleteBtn" data-col-id="${col.id}" title="Delete column">&times;</button>
            </div>
        `).join('');

        // Drag-and-drop
        let dragSrcId = null;
        colList.querySelectorAll('.boardConfigEditor__item').forEach(item => {
            item.addEventListener('dragstart', (e) => {
                dragSrcId = item.dataset.colId;
                item.classList.add('--dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', dragSrcId);
            });
            item.addEventListener('dragend', () => {
                item.classList.remove('--dragging');
                colList.querySelectorAll('.boardConfigEditor__item').forEach(i => i.classList.remove('--dragOver'));
            });
            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                colList.querySelectorAll('.boardConfigEditor__item').forEach(i => i.classList.remove('--dragOver'));
                item.classList.add('--dragOver');
            });
            item.addEventListener('dragleave', (e) => {
                if (!item.contains(e.relatedTarget)) item.classList.remove('--dragOver');
            });
            item.addEventListener('drop', async (e) => {
                e.preventDefault();
                item.classList.remove('--dragOver');
                const targetId = item.dataset.colId;
                if (!dragSrcId || dragSrcId === targetId) return;
                const srcIdx = columns.findIndex(c => c.id === dragSrcId);
                const tgtIdx = columns.findIndex(c => c.id === targetId);
                if (srcIdx === -1 || tgtIdx === -1) return;
                const reordered = [...columns];
                const [moved] = reordered.splice(srcIdx, 1);
                reordered.splice(tgtIdx, 0, moved);
                setColumns(reordered.map((c, i) => ({ ...c, order: i })));
                renderColumns();
                const result = await reorderColumnsApi(reordered);
                if (result.ok) {
                    setColumns(result.data);
                    renderColumns();
                } else {
                    const fetched = await fetchColumnsApi();
                    setColumns(fetched);
                    renderColumns();
                    toaster.error('Failed to reorder columns. Changes reverted.');
                }
            });
        });

        // Rename on blur
        colList.querySelectorAll('.js-colItemName').forEach(input => {
            input.addEventListener('blur', async () => {
                const name = input.value.trim();
                if (!name) {
                    toaster.warning('Column name cannot be empty');
                    const col = columns.find(c => c.id === input.dataset.colId);
                    if (col) input.value = col.name;
                    return;
                }
                const result = await updateColumnApi(input.dataset.colId, { name });
                if (result.ok) {
                    const fetched = await fetchColumnsApi();
                    setColumns(fetched);
                    renderColumns();
                } else {
                    toaster.error(result.error || 'Failed to rename column');
                }
            });
        });

        // Archive toggle
        colList.querySelectorAll('.js-colArchiveToggle').forEach(cb => {
            cb.addEventListener('change', async () => {
                const result = await updateColumnApi(cb.dataset.colId, { hasArchive: cb.checked });
                if (result.ok) {
                    const fetched = await fetchColumnsApi();
                    setColumns(fetched);
                    renderColumns();
                    toaster.success(cb.checked ? 'Archive button enabled' : 'Archive button disabled');
                } else {
                    toaster.error(result.error || 'Failed to update column');
                    cb.checked = !cb.checked;
                }
            });
        });

        // Celebrate toggle — confetti burst when a task lands in this column
        colList.querySelectorAll('.js-colCelebrateToggle').forEach(cb => {
            cb.addEventListener('change', async () => {
                const result = await updateColumnApi(cb.dataset.colId, { celebrate: cb.checked });
                if (result.ok) {
                    const fetched = await fetchColumnsApi();
                    setColumns(fetched);
                    renderColumns();
                    toaster.success(cb.checked ? 'Celebration enabled' : 'Celebration disabled');
                } else {
                    toaster.error(result.error || 'Failed to update column');
                    cb.checked = !cb.checked;
                }
            });
        });

        // Delete
        colList.querySelectorAll('.js-colDeleteBtn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (boardColumns.length <= 1) {
                    toaster.error('Cannot delete the last column');
                    return;
                }
                const col = columns.find(c => c.id === btn.dataset.colId);
                pendingColumnDelete = btn.dataset.colId;
                colConfirmMessage.textContent = `Delete column "${col?.name || ''}"? All tasks in it will be moved to the first (default) column.`;
                colConfirmModal.open();
            });
        });
    }

    colAddBtn.addEventListener('click', async () => {
        const name = colNameInput.value.trim();
        if (!name) { toaster.warning('Column name is required'); return; }
        if (columns.length >= MAX_COLUMNS) { toaster.warning(`Maximum of ${MAX_COLUMNS} columns allowed`); return; }
        const result = await createColumnApi({ name });
        if (result.ok) {
            const fetched = await fetchColumnsApi();
            setColumns(fetched);
            renderColumns();
            toaster.success(`Column "${name}" added`);
        } else {
            colError.textContent = result.error;
            colError.style.display = 'block';
        }
    });

    colConfirmCancel.addEventListener('click', () => { pendingColumnDelete = null; colConfirmModal.close(); });
    colConfirmDelete.addEventListener('click', async () => {
        if (!pendingColumnDelete) return;
        const colId = pendingColumnDelete;
        pendingColumnDelete = null;
        colConfirmModal.close();
        const result = await deleteColumnApi(colId);
        if (result.ok) {
            const fetched = await fetchColumnsApi();
            setColumns(fetched);
            renderColumns();
            const msg = result.data?.movedCount > 0
                ? `Column deleted. ${result.data.movedCount} task(s) moved to "${result.data.defaultColumnName}".`
                : 'Column deleted.';
            toaster.success(msg);
        } else {
            toaster.error(result.error || 'Failed to delete column');
        }
    });

    renderColumns();

    // ==========================================
    // Section: Epics
    // ==========================================
    const epicNameInput   = $('.js-cfg-epicNameInput');
    const epicColorSelect = $('.js-cfg-epicColorSelect');
    const epicAddBtn      = $('.js-cfg-epicAddBtn');
    const epicAliasPreview = $('.js-cfg-epicAliasPreview');
    const epicColorError  = $('.js-cfg-epicColorError');
    const epicsList       = $('.js-cfg-epicsList');

    const epicConfirmModal   = document.querySelector('.js-epicConfirmModal');
    const epicConfirmMessage = document.querySelector('.js-epicConfirmMessage');
    const epicConfirmCancel  = document.querySelector('.js-epicConfirmCancel');
    const epicConfirmDelete  = document.querySelector('.js-epicConfirmDelete');
    let pendingEpicDelete = null;

    function populateEpicColorSelect(selectEl, currentEpics, excludeEpicId) {
        const usedColors = new Set(currentEpics.filter(e => e.id !== excludeEpicId).map(e => e.color));
        const items = EPIC_COLORS.map(color => ({ value: color.hex, label: color.name, disabled: usedColors.has(color.hex) }));
        selectEl.setItems(items);
    }

    function renderEpics() {
        populateEpicColorSelect(epicColorSelect, epics);
        epicNameInput.value = '';
        epicColorSelect.clear();
        epicAliasPreview.textContent = '';
        epicColorError.style.display = 'none';

        if (epics.length === 0) {
            epicsList.innerHTML = '<div class="emptyState">No epics created yet</div>';
            return;
        }

        // An epic is a silo you manage, not just a label — who asks about it,
        // how often, and what they expect. The context row is what turns
        // "topics" into something the assistant can reason about, and it is
        // useful on its own with the AI switched off.
        epicsList.innerHTML = epics.map(epic => `
            <div class="epicsEditor__item" data-epic-id="${epic.id}">
                <div class="epicsEditor__itemMain">
                    <div class="epicsEditor__itemColor" style="background-color: ${epic.color};"></div>
                    <div class="epicsEditor__itemInfo">
                        <input type="text" class="epicsEditor__itemName js-epicItemName" value="${escapeHtml(epic.name)}" data-epic-id="${epic.id}" />
                        <span class="epicsEditor__itemAlias">Alias: ${escapeHtml(epic.alias)}</span>
                    </div>
                    <span class="js-epicItemColorSlot" data-epic-id="${epic.id}"></span>
                    <button class="epicsEditor__deleteBtn js-epicDeleteBtn" data-epic-id="${epic.id}" title="Delete epic">&times;</button>
                </div>
                <div class="epicsEditor__itemContext">
                    <label class="epicsEditor__contextField">
                        <span>Stakeholder</span>
                        <input type="text" class="js-epicContext" data-field="stakeholder" data-epic-id="${epic.id}"
                               value="${escapeHtml(epic.stakeholder || '')}" placeholder="Who asks about this?" />
                    </label>
                    <label class="epicsEditor__contextField">
                        <span>Cadence</span>
                        <input type="text" class="js-epicContext" data-field="cadence" data-epic-id="${epic.id}"
                               value="${escapeHtml(epic.cadence || '')}" placeholder="How often?" />
                    </label>
                    <label class="epicsEditor__contextField epicsEditor__contextField--wide">
                        <span>Expectations</span>
                        <input type="text" class="js-epicContext" data-field="expectations" data-epic-id="${epic.id}"
                               value="${escapeHtml(epic.expectations || '')}" placeholder="What do they need, and when?" />
                    </label>
                </div>
            </div>
        `).join('');

        // Context fields auto-save on blur, matching the other CRUD sections.
        // A failure reverts the input rather than leaving the field showing a
        // value the server never accepted.
        epicsList.querySelectorAll('.js-epicContext').forEach(input => {
            input.addEventListener('blur', async () => {
                const epic = epics.find(e => e.id === input.dataset.epicId);
                if (!epic) return;
                const field = input.dataset.field;
                const value = input.value.trim();
                if (value === (epic[field] || '')) return;   // nothing changed

                const result = await updateEpicApi(epic.id, { [field]: value });
                if (result.ok) {
                    epic[field] = value;
                } else {
                    toaster.error(result.error || 'Failed to save');
                    input.value = epic[field] || '';
                }
            });
        });

        // Color pickers
        epicsList.querySelectorAll('.js-epicItemColorSlot').forEach(slot => {
            const epicId = slot.dataset.epicId;
            const epic = epics.find(e => e.id === epicId);
            const picker = document.createElement('custom-picker');
            picker.setAttribute('type', 'color');
            picker.setAttribute('placeholder', 'Select color');
            picker.setAttribute('columns', '5');
            picker.dataset.epicId = epicId;
            slot.replaceWith(picker);
            populateEpicColorSelect(picker, epics, epicId);
            if (epic) picker.value = epic.color;
        });

        // Name blur
        epicsList.querySelectorAll('.js-epicItemName').forEach(input => {
            input.addEventListener('blur', async () => {
                const name = input.value.trim();
                if (!name) {
                    toaster.warning('Epic name cannot be empty');
                    const epic = epics.find(e => e.id === input.dataset.epicId);
                    if (epic) input.value = epic.name;
                    return;
                }
                const result = await updateEpicApi(input.dataset.epicId, { name });
                if (result.ok) {
                    const fetched = await fetchEpicsApi();
                    setEpics(fetched);
                    renderEpics();
                } else { toaster.error(result.error); }
            });
        });

        // Color change
        epicsList.querySelectorAll('custom-picker[data-epic-id]').forEach(picker => {
            picker.addEventListener('change', async () => {
                const color = picker.value;
                if (!color) return;
                const result = await updateEpicApi(picker.dataset.epicId, { color });
                if (result.ok) {
                    const fetched = await fetchEpicsApi();
                    setEpics(fetched);
                    renderEpics();
                } else {
                    toaster.error(result.error);
                    const epic = epics.find(e => e.id === picker.dataset.epicId);
                    if (epic) picker.value = epic.color;
                }
            });
        });

        // Delete
        epicsList.querySelectorAll('.js-epicDeleteBtn').forEach(btn => {
            btn.addEventListener('click', () => {
                const epic = epics.find(e => e.id === btn.dataset.epicId);
                pendingEpicDelete = btn.dataset.epicId;
                epicConfirmMessage.textContent = `Delete epic "${epic?.name || ''}"? Tasks with this epic will lose it.`;
                epicConfirmModal.open();
            });
        });
    }

    epicNameInput.addEventListener('input', () => {
        const name = epicNameInput.value.trim();
        epicAliasPreview.textContent = name ? `Alias: ${toCamelCase(name)}` : '';
    });

    epicAddBtn.addEventListener('click', async () => {
        const name = epicNameInput.value.trim();
        const color = epicColorSelect.value;
        if (!name) { toaster.warning('Epic name is required'); return; }
        if (!color) { toaster.warning('Please select a color'); return; }
        if (epics.length >= MAX_EPICS) { toaster.warning(`Maximum of ${MAX_EPICS} epics allowed`); return; }
        const result = await createEpicApi({ name, color });
        if (result.ok) {
            const fetched = await fetchEpicsApi();
            setEpics(fetched);
            renderEpics();
            toaster.success(`Epic "${name}" created`);
        } else {
            epicColorError.textContent = result.error;
            epicColorError.style.display = 'block';
        }
    });

    epicConfirmCancel.addEventListener('click', () => { pendingEpicDelete = null; epicConfirmModal.close(); });
    epicConfirmDelete.addEventListener('click', async () => {
        if (!pendingEpicDelete) return;
        const epicId = pendingEpicDelete;
        pendingEpicDelete = null;
        epicConfirmModal.close();
        const result = await deleteEpicApi(epicId);
        if (result.ok) {
            tasks.forEach(t => { if (t.epicId === epicId) t.epicId = null; });
            const fetched = await fetchEpicsApi();
            setEpics(fetched);
            renderEpics();
            toaster.success('Epic deleted');
        } else { toaster.error(result.error); }
    });

    renderEpics();

    // ==========================================
    // Section: Categories
    // ==========================================
    const catNameInput   = $('.js-cfg-categoryNameInput');
    const catIconSelect  = $('.js-cfg-categoryIconSelect');
    const catAddBtn      = $('.js-cfg-categoryAddBtn');
    const catError       = $('.js-cfg-categoryError');
    const catList        = $('.js-cfg-categoriesList');

    const catConfirmModal   = document.querySelector('.js-categoryConfirmModal');
    const catConfirmMessage = document.querySelector('.js-categoryConfirmMessage');
    const catConfirmCancel  = document.querySelector('.js-categoryConfirmCancel');
    const catConfirmDelete  = document.querySelector('.js-categoryConfirmDelete');
    let pendingCategoryDelete = null;

    function populateIconSelect(selectEl, selectedIcon) {
        const SvgIconClass = customElements.get('svg-icon');
        const icons = SvgIconClass ? SvgIconClass.availableIcons : [];
        selectEl.setItems(icons.map(n => ({ value: n, label: n })));
        if (selectedIcon) selectEl.value = selectedIcon;
    }

    function renderCategories() {
        populateIconSelect(catIconSelect);
        catNameInput.value = '';
        catIconSelect.clear();
        catError.style.display = 'none';

        if (categories.length === 0) {
            catList.innerHTML = '<div class="emptyState">No categories created yet</div>';
            return;
        }

        catList.innerHTML = categories.map(cat => `
            <div class="categoriesEditor__item" data-category-id="${cat.id}">
                <div class="categoriesEditor__itemInfo">
                    <input type="text" class="categoriesEditor__itemName js-catItemName" value="${escapeHtml(cat.name)}" data-category-id="${cat.id}" />
                    ${cat.id === DEFAULT_CATEGORY_ID ? '<span class="categoriesEditor__undeletable">Default (cannot be deleted)</span>' : ''}
                </div>
                <span class="js-catItemIconSlot" data-category-id="${cat.id}"></span>
                ${cat.id !== DEFAULT_CATEGORY_ID
                    ? `<button class="categoriesEditor__deleteBtn js-catDeleteBtn" data-category-id="${cat.id}" title="Delete category">&times;</button>`
                    : '<div style="width: 36px;"></div>'}
            </div>
        `).join('');

        // Icon pickers
        catList.querySelectorAll('.js-catItemIconSlot').forEach(slot => {
            const catId = Number(slot.dataset.categoryId);
            const cat = categories.find(c => c.id === catId);
            const picker = document.createElement('custom-picker');
            picker.setAttribute('type', 'icon');
            picker.setAttribute('placeholder', 'Select icon');
            picker.setAttribute('columns', '7');
            picker.dataset.categoryId = String(catId);
            slot.replaceWith(picker);
            populateIconSelect(picker, cat?.icon);
        });

        // Name blur
        catList.querySelectorAll('.js-catItemName').forEach(input => {
            input.addEventListener('blur', async () => {
                const name = input.value.trim();
                if (!name) {
                    toaster.warning('Category name cannot be empty');
                    const cat = categories.find(c => c.id === Number(input.dataset.categoryId));
                    if (cat) input.value = cat.name;
                    return;
                }
                const result = await updateCategoryApi(Number(input.dataset.categoryId), { name });
                if (result.ok) {
                    const fetched = await fetchCategoriesApi();
                    setCategories(fetched);
                    renderCategories();
                } else { toaster.error(result.error); }
            });
        });

        // Icon change
        catList.querySelectorAll('custom-picker[data-category-id]').forEach(picker => {
            picker.addEventListener('change', async () => {
                const icon = picker.value;
                if (!icon) return;
                const result = await updateCategoryApi(Number(picker.dataset.categoryId), { icon });
                if (result.ok) {
                    const fetched = await fetchCategoriesApi();
                    setCategories(fetched);
                    renderCategories();
                } else {
                    toaster.error(result.error);
                    const cat = categories.find(c => c.id === Number(picker.dataset.categoryId));
                    if (cat) picker.value = cat.icon;
                }
            });
        });

        // Delete
        catList.querySelectorAll('.js-catDeleteBtn').forEach(btn => {
            btn.addEventListener('click', () => {
                const catId = Number(btn.dataset.categoryId);
                const cat = categories.find(c => c.id === catId);
                pendingCategoryDelete = catId;
                catConfirmMessage.textContent = `Delete category "${cat?.name || ''}"? Active tasks with this category will be reassigned to "Non categorized".`;
                catConfirmModal.open();
            });
        });
    }

    catAddBtn.addEventListener('click', async () => {
        const name = catNameInput.value.trim();
        const icon = catIconSelect.value;
        if (!name) { toaster.warning('Category name is required'); return; }
        if (!icon) { toaster.warning('Please select an icon'); return; }
        if (categories.length >= MAX_CATEGORIES) { toaster.warning(`Maximum of ${MAX_CATEGORIES} categories allowed`); return; }
        const result = await createCategoryApi({ name, icon });
        if (result.ok) {
            const fetched = await fetchCategoriesApi();
            setCategories(fetched);
            renderCategories();
            toaster.success(`Category "${name}" created`);
        } else {
            catError.textContent = result.error;
            catError.style.display = 'block';
        }
    });

    catConfirmCancel.addEventListener('click', () => { pendingCategoryDelete = null; catConfirmModal.close(); });
    catConfirmDelete.addEventListener('click', async () => {
        if (!pendingCategoryDelete) return;
        const catId = pendingCategoryDelete;
        pendingCategoryDelete = null;
        catConfirmModal.close();
        const result = await deleteCategoryApi(catId);
        if (result.ok) {
            tasks.forEach(t => { if (t.category === catId) t.category = DEFAULT_CATEGORY_ID; });
            const fetched = await fetchCategoriesApi();
            setCategories(fetched);
            renderCategories();
            toaster.success('Category deleted');
        } else { toaster.error(result.error); }
    });

    renderCategories();

    // ==========================================
    // Section: General Settings
    // ==========================================
    const alias = activeProfile?.alias || window.location.pathname.split('/').filter(Boolean)[0] || 'default';

    // Appearance (theme) — per profile, applies immediately on change (no Save).
    const currentTheme = getStoredTheme(alias);
    const themeRadio = pageViewEl.querySelector(`input[name="cfgTheme"][value="${currentTheme}"]`);
    if (themeRadio) themeRadio.checked = true;
    pageViewEl.querySelectorAll('input[name="cfgTheme"]').forEach(radio => {
        radio.addEventListener('change', () => {
            if (radio.checked) setStoredTheme(alias, radio.value);
        });
    });

    const showChecklistToggle  = $('.js-cfg-showDailyChecklist');
    const showNotesToggle      = $('.js-cfg-showNotes');
    const deadlineUrgentHours  = $('.js-cfg-deadlineUrgentHours');
    const deadlineWarningHours = $('.js-cfg-deadlineWarningHours');
    const generalSaveBtn       = $('.js-cfg-generalSave');

    // Populate current values
    showChecklistToggle.checked = localStorage.getItem(`${alias}:showDailyChecklist`) !== 'false';
    showNotesToggle.checked     = localStorage.getItem(`${alias}:showNotes`) !== 'false';

    const snoozeMode = localStorage.getItem(`${alias}:snoozeVisibility`) || 'hidden';
    const snoozeRadio = pageViewEl.querySelector(`input[name="cfgSnoozeVisibility"][value="${snoozeMode}"]`);
    if (snoozeRadio) snoozeRadio.checked = true;

    const storedThresholds = localStorage.getItem(`${alias}:deadlineThresholds`);
    let thresholds = [DEFAULT_DEADLINE_URGENT_HOURS, DEFAULT_DEADLINE_WARNING_HOURS];
    if (storedThresholds) { try { const p = JSON.parse(storedThresholds); if (Array.isArray(p) && p.length === 2) thresholds = p; } catch {} }
    deadlineUrgentHours.value  = thresholds[0];
    deadlineWarningHours.value = thresholds[1];

    generalSaveBtn.addEventListener('click', () => {
        localStorage.setItem(`${alias}:showDailyChecklist`, String(showChecklistToggle.checked));
        localStorage.setItem(`${alias}:showNotes`, String(showNotesToggle.checked));

        const sMode = pageViewEl.querySelector('input[name="cfgSnoozeVisibility"]:checked')?.value || 'hidden';
        localStorage.setItem(`${alias}:snoozeVisibility`, sMode);

        const urgent  = parseInt(deadlineUrgentHours.value) || DEFAULT_DEADLINE_URGENT_HOURS;
        const warning = parseInt(deadlineWarningHours.value) || DEFAULT_DEADLINE_WARNING_HOURS;
        if (urgent >= warning) {
            toaster.warning('Urgent threshold must be less than Warning threshold');
            return;
        }
        localStorage.setItem(`${alias}:deadlineThresholds`, JSON.stringify([urgent, warning]));
        toaster.success('Settings saved');
    });

    // Your Data — export the profile as a single JSON download
    $('.js-cfg-exportData').addEventListener('click', async () => {
        try {
            const bundle = await fetchProfileExportApi();
            const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `mydesktop-${alias}-${bundle.exportedAt.split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            toaster.success('Data exported');
        } catch (err) {
            console.error('Export error:', err);
            toaster.error('Failed to export data');
        }
    });

    // ==========================================
    // Section: Daily Checklist
    // ==========================================
    const checklistItemsEl = $('.js-cfg-checklistItems');
    const checklistAddBtn  = $('.js-cfg-checklistAddBtn');
    const checklistSaveBtn = $('.js-cfg-checklistSave');

    const stored = localStorage.getItem(`${alias}:checklistConfig`);
    let checklistItems;
    try { checklistItems = stored ? JSON.parse(stored) : [...DEFAULT_CHECKLIST_ITEMS]; }
    catch { checklistItems = [...DEFAULT_CHECKLIST_ITEMS]; }

    function renderChecklist() {
        checklistItemsEl.innerHTML = checklistItems.map((item, i) => `
            <div class="checklistEditor__row" data-index="${i}">
                <input type="text" class="checklistEditor__textInput" value="${escapeHtml(item.text)}" placeholder="Task text" />
                <input type="text" class="checklistEditor__urlInput" value="${escapeHtml(item.url || '')}" placeholder="URL (optional)" />
                <button type="button" class="checklistEditor__removeBtn" data-index="${i}">&times;</button>
            </div>
        `).join('');

        checklistItemsEl.querySelectorAll('.checklistEditor__removeBtn').forEach(btn => {
            btn.addEventListener('click', () => {
                checklistItems.splice(parseInt(btn.dataset.index), 1);
                renderChecklist();
            });
        });
    }

    checklistAddBtn.addEventListener('click', () => {
        checklistItems.push({ text: '', url: '' });
        renderChecklist();
        const inputs = checklistItemsEl.querySelectorAll('.checklistEditor__textInput');
        if (inputs.length > 0) inputs[inputs.length - 1].focus();
    });

    checklistSaveBtn.addEventListener('click', () => {
        const items = [];
        checklistItemsEl.querySelectorAll('.checklistEditor__row').forEach(row => {
            const text = row.querySelector('.checklistEditor__textInput').value.trim();
            const url  = row.querySelector('.checklistEditor__urlInput').value.trim();
            if (text) items.push({ text, url });
        });
        localStorage.setItem(`${alias}:checklistConfig`, JSON.stringify(items));
        checklistItems = items;
        renderChecklist();
        const checklistComponent = document.querySelector('daily-checklist');
        if (checklistComponent) { checklistComponent.loadRecurrentTasks(); checklistComponent.render(); }
        toaster.success('Checklist saved');
    });

    renderChecklist();

    // ==========================================
    // Section: AI Configuration
    // ==========================================
    const aiListPanel   = $('.js-cfg-aiListPanel');
    const aiFormPanel   = $('.js-cfg-aiFormPanel');
    const aiEntries     = $('.js-cfg-aiEntries');
    const aiAddBtn      = $('.js-cfg-aiAddBtn');
    const aiBackBtn     = $('.js-cfg-aiBackBtn');
    const aiNameInput   = $('.js-cfg-aiNameInput');
    const aiProviderSel = $('.js-cfg-aiProviderSel');
    const aiCustomUrlGrp = $('.js-cfg-aiCustomUrlGroup');
    const aiCustomUrl   = $('.js-cfg-aiCustomUrl');
    const aiModelInput  = $('.js-cfg-aiModelInput');
    const aiFetchModelsBtn = $('.js-cfg-aiFetchModels');
    const aiModelList   = $('#cfgAiModelList');
    const aiKeyInput    = $('.js-cfg-aiKeyInput');
    const aiKeyHint     = $('.js-cfg-aiKeyHint');
    const aiError       = $('.js-cfg-aiError');
    const aiCancelBtn   = $('.js-cfg-aiCancel');
    const aiSaveBtn     = $('.js-cfg-aiSave');

    let aiConfigState = { activeConfigId: null, configs: [] };
    try { aiConfigState = await fetchAiConfigApi(); } catch { /* empty is fine */ }

    function aiShowList() {
        aiFormPanel.style.display = 'none';
        aiListPanel.style.display = '';
        aiRenderList();
    }

    function aiRenderList() {
        aiEntries.innerHTML = '';
        if (!aiConfigState.configs.length) {
            aiEntries.innerHTML = '<p class="aiConfig__emptyHint">No configurations yet. Add one below.</p>';
            return;
        }
        for (const cfg of aiConfigState.configs) {
            const isActive = cfg.id === aiConfigState.activeConfigId;
            const row = document.createElement('div');
            row.className = 'aiConfig__entry' + (isActive ? ' --active' : '');

            const dot = document.createElement('span');
            dot.className = 'aiConfig__entryDot' + (isActive ? ' --active' : '');

            const info = document.createElement('div');
            info.className = 'aiConfig__entryInfo';
            const name = document.createElement('span');
            name.className = 'aiConfig__entryName';
            name.textContent = cfg.name;
            const sub = document.createElement('span');
            sub.className = 'aiConfig__entrySub';
            sub.textContent = cfg.model ? `${AI_PROVIDER_DEFAULTS[cfg.provider]?.label || cfg.provider} · ${cfg.model}` : (AI_PROVIDER_DEFAULTS[cfg.provider]?.label || cfg.provider);
            info.appendChild(name);
            info.appendChild(sub);

            const actions = document.createElement('div');
            actions.className = 'aiConfig__entryActions';

            // The dot alone showed which config was in use but gave no way to
            // change it, leaving the server's active-config route unreachable.
            // The active row states its status rather than offering a no-op.
            if (isActive) {
                const activeTag = document.createElement('span');
                activeTag.className = 'aiConfig__entryActive';
                activeTag.textContent = 'Active';
                actions.appendChild(activeTag);
            } else {
                const useBtn = document.createElement('button');
                useBtn.type = 'button';
                useBtn.className = 'aiConfig__entryBtn aiConfig__entryBtn--use';
                useBtn.textContent = 'Use';
                useBtn.title = `Make ${cfg.name} the active configuration`;
                useBtn.addEventListener('click', async () => {
                    const result = await setActiveAiConfigApi(cfg.id);
                    if (!result.ok) { toaster.error(result.error || 'Failed to switch configuration'); return; }
                    aiConfigState.activeConfigId = cfg.id;
                    toaster.success(`Now using ${cfg.name}`);
                    aiRenderList();
                });
                actions.appendChild(useBtn);
            }

            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'aiConfig__entryBtn';
            editBtn.textContent = 'Edit';
            editBtn.addEventListener('click', () => aiShowForm(cfg));
            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'aiConfig__entryBtn aiConfig__entryBtn--delete';
            delBtn.textContent = '✕';
            delBtn.title = 'Delete';
            delBtn.addEventListener('click', async () => {
                if (aiConfigState.configs.length <= 1) { toaster.error('Cannot delete the last configuration'); return; }
                const result = await deleteAiConfigEntryApi(cfg.id);
                if (!result.ok) { toaster.error(result.error || 'Failed to delete'); return; }
                aiConfigState.configs = aiConfigState.configs.filter(c => c.id !== cfg.id);
                aiConfigState.activeConfigId = result.data.activeConfigId;
                toaster.success('Configuration deleted');
                aiRenderList();
            });
            actions.appendChild(editBtn);
            actions.appendChild(delBtn);

            row.appendChild(dot);
            row.appendChild(info);
            row.appendChild(actions);
            aiEntries.appendChild(row);
        }
    }

    /**
     * Shows or hides the provider-dependent fields.
     *
     * The Base URL field is no longer Custom-only: Kimi runs two regional
     * hosts, and switching between them shouldn't cost you the provider's
     * defaults by forcing a drop to Custom.
     */
    function syncProviderFields() {
        const provider = aiProviderSel.value;
        const meta = AI_PROVIDER_DEFAULTS[provider];
        const urlHint = $('.js-cfg-aiUrlHint');

        aiCustomUrlGrp.style.display = meta?.allowsBaseUrl ? '' : 'none';

        if (!urlHint) return;
        urlHint.textContent = provider === 'kimi'
            ? 'Defaults to the international host (api.moonshot.ai/v1). Use https://api.moonshot.cn/v1 for the China platform. Leave blank for the default.'
            : 'OpenAI-compatible endpoint. Works with LM Studio, Ollama, Jan, and similar tools.';
    }

    function aiShowForm(entry) {
        const isEdit = !!entry;
        aiListPanel.style.display = 'none';
        aiFormPanel.style.display = '';
        aiNameInput.value   = isEdit ? entry.name : '';
        aiProviderSel.value = isEdit ? entry.provider : 'anthropic';
        aiCustomUrl.value   = isEdit ? (entry.baseUrl || '') : '';
        aiModelInput.value  = isEdit ? entry.model : AI_PROVIDER_DEFAULTS['anthropic'].defaultModel;
        aiKeyInput.value    = '';
        aiKeyHint.textContent = isEdit && entry.hasKey ? 'Key saved — leave blank to keep current' : '';
        aiError.style.display = 'none';
        syncProviderFields();
        aiSaveBtn.dataset.editId = isEdit ? entry.id : '';
        // Fetching asks the provider with the *stored* key, so it needs a saved
        // entry. A new one has nothing to authenticate with yet.
        aiFetchModelsBtn.disabled = !isEdit;
        aiFetchModelsBtn.title = isEdit ? '' : 'Save this configuration first';
        aiModelList.innerHTML = '';
        aiNameInput.focus();
    }

    aiProviderSel.addEventListener('change', () => {
        const def = AI_PROVIDER_DEFAULTS[aiProviderSel.value];
        const isDefaultOfOther = Object.values(AI_PROVIDER_DEFAULTS).some(d => d !== def && d.defaultModel && d.defaultModel === aiModelInput.value);
        if (isDefaultOfOther || !aiModelInput.value.trim()) aiModelInput.value = def?.defaultModel || '';
        syncProviderFields();
    });

    aiFetchModelsBtn.addEventListener('click', async () => {
        const editId = aiSaveBtn.dataset.editId;
        if (!editId) return;

        const original = aiFetchModelsBtn.textContent;
        aiFetchModelsBtn.disabled = true;
        aiFetchModelsBtn.textContent = 'Fetching…';
        try {
            const res = await fetch(`/api/ai/config/entries/${editId}/models`);
            const data = await res.json();
            if (!res.ok) {
                toaster.error(data.error || 'Could not fetch models');
                return;
            }
            aiModelList.innerHTML = data.models
                .map(id => `<option value="${escapeHtml(id)}"></option>`).join('');
            if (data.models.length === 0) {
                toaster.warning('The provider listed no models.');
            } else {
                toaster.success(`${data.models.length} model${data.models.length === 1 ? '' : 's'} available — click the Model field to pick one.`);
                aiModelInput.focus();
            }
        } catch {
            toaster.error('Could not reach the server');
        } finally {
            aiFetchModelsBtn.disabled = false;
            aiFetchModelsBtn.textContent = original;
        }
    });

    aiAddBtn.addEventListener('click', () => aiShowForm(null));
    aiBackBtn.addEventListener('click', () => aiShowList());
    aiCancelBtn.addEventListener('click', () => aiShowList());

    aiSaveBtn.addEventListener('click', async () => {
        aiError.style.display = 'none';
        const name = aiNameInput.value.trim();
        const provider = aiProviderSel.value;
        const model = aiModelInput.value.trim();
        const key = aiKeyInput.value.trim();
        const baseUrl = aiCustomUrl.value.trim();
        const editId = aiSaveBtn.dataset.editId;

        if (!name) { aiError.textContent = 'Name is required'; aiError.style.display = ''; return; }
        if (!model) { aiError.textContent = 'Model name is required'; aiError.style.display = ''; return; }
        if (provider === 'custom' && !baseUrl) { aiError.textContent = 'Base URL is required for Custom provider'; aiError.style.display = ''; return; }

        const payload = { name, provider, model, apiKey: key, baseUrl };
        const result = editId ? await updateAiConfigEntryApi(editId, payload) : await createAiConfigEntryApi(payload);
        if (!result.ok) { aiError.textContent = result.error || 'Failed to save'; aiError.style.display = ''; return; }

        if (editId) {
            const idx = aiConfigState.configs.findIndex(c => c.id === editId);
            if (idx !== -1) aiConfigState.configs[idx] = result.data.entry;
        } else {
            aiConfigState.configs.push(result.data.entry);
            if (!aiConfigState.activeConfigId) aiConfigState.activeConfigId = result.data.activeConfigId;
        }
        toaster.success(editId ? 'Configuration updated' : 'Configuration added');
        aiShowList();
    });

    aiShowList();

    // ==========================================
    // Section: Skills
    // ==========================================
    const skillsList        = $('.js-cfg-skillsList');
    const skillForm         = $('.js-cfg-skillForm');
    const skillNameInput    = $('.js-cfg-skillName');
    const skillInstrInput   = $('.js-cfg-skillInstructions');
    const skillAlwaysOnBox  = $('.js-cfg-skillAlwaysOn');
    const skillError        = $('.js-cfg-skillError');
    const skillSaveBtn      = $('.js-cfg-skillSave');
    const skillCancelBtn    = $('.js-cfg-skillCancel');
    const skillAddBtn       = $('.js-cfg-skillAddBtn');

    /** @type {Array<Object>} Mirror of ai-skills.json */
    let skills = [];

    function renderSkills() {
        if (skills.length === 0) {
            skillsList.innerHTML = '<div class="emptyState">No skills yet. Add one to control how the assistant writes.</div>';
            return;
        }
        skillsList.innerHTML = skills.map(skill => `
            <div class="skillsEditor__item">
                <div class="skillsEditor__itemInfo">
                    <span class="skillsEditor__itemName">
                        ${escapeHtml(skill.name)}
                        ${skill.alwaysOn ? '<span class="skillsEditor__badge">always on</span>' : ''}
                    </span>
                    <span class="skillsEditor__itemInstructions">${escapeHtml(skill.instructions)}</span>
                </div>
                <div class="skillsEditor__itemActions">
                    <button type="button" class="aiConfig__entryBtn js-skillEdit" data-id="${escapeHtml(skill.id)}">Edit</button>
                    <button type="button" class="aiConfig__entryBtn aiConfig__entryBtn--delete js-skillDelete" data-id="${escapeHtml(skill.id)}" title="Delete">&times;</button>
                </div>
            </div>
        `).join('');

        skillsList.querySelectorAll('.js-skillEdit').forEach(btn => {
            btn.addEventListener('click', () => showSkillForm(skills.find(sk => sk.id === btn.dataset.id)));
        });
        skillsList.querySelectorAll('.js-skillDelete').forEach(btn => {
            btn.addEventListener('click', async () => {
                try {
                    await deleteAiSkillApi(btn.dataset.id);
                    skills = skills.filter(sk => sk.id !== btn.dataset.id);
                    renderSkills();
                    toaster.success('Skill deleted');
                } catch {
                    toaster.error('Could not delete skill');
                }
            });
        });
    }

    /** @param {Object} [skill] - Omit to add a new one. */
    function showSkillForm(skill) {
        skillForm.hidden = false;
        skillAddBtn.hidden = true;
        skillError.style.display = 'none';
        skillNameInput.value = skill ? skill.name : '';
        skillInstrInput.value = skill ? skill.instructions : '';
        skillAlwaysOnBox.checked = skill ? skill.alwaysOn : false;
        skillSaveBtn.dataset.editId = skill ? skill.id : '';
        skillNameInput.focus();
    }

    function hideSkillForm() {
        skillForm.hidden = true;
        skillAddBtn.hidden = false;
        skillSaveBtn.dataset.editId = '';
    }

    skillAddBtn.addEventListener('click', () => {
        if (skills.length >= MAX_SKILLS) { toaster.warning(`Maximum of ${MAX_SKILLS} skills allowed`); return; }
        showSkillForm(null);
    });
    skillCancelBtn.addEventListener('click', hideSkillForm);

    skillSaveBtn.addEventListener('click', async () => {
        skillError.style.display = 'none';
        const payload = {
            name: skillNameInput.value.trim(),
            instructions: skillInstrInput.value.trim(),
            alwaysOn: skillAlwaysOnBox.checked
        };
        if (!payload.name) { skillError.textContent = 'Name is required'; skillError.style.display = ''; return; }
        if (!payload.instructions) { skillError.textContent = 'Instructions are required'; skillError.style.display = ''; return; }

        const editId = skillSaveBtn.dataset.editId;
        try {
            const saved = editId
                ? await updateAiSkillApi(editId, payload)
                : await createAiSkillApi(payload);
            if (editId) {
                const idx = skills.findIndex(sk => sk.id === editId);
                if (idx !== -1) skills[idx] = saved;
            } else {
                skills.push(saved);
            }
            hideSkillForm();
            renderSkills();
            toaster.success(editId ? 'Skill updated' : 'Skill added');
        } catch (error) {
            skillError.textContent = error.message || 'Could not save skill';
            skillError.style.display = '';
        }
    });

    // Loaded after the page renders, like memory — the config page must not
    // wait on the assistant's data to become usable.
    fetchAiSkillsApi()
        .then(fetched => { skills = fetched; renderSkills(); })
        .catch(() => { skillsList.innerHTML = '<div class="emptyState">Could not load skills</div>'; });

    // ==========================================
    // Section: Assistant Memory
    // ==========================================
    const memoryInput  = $('.js-cfg-memoryInput');
    const memoryAddBtn = $('.js-cfg-memoryAddBtn');
    const memoryList   = $('.js-cfg-memoryList');
    const memoryCategorySelect = $('.js-cfg-memoryCategory');
    const memoryMarkdownBtn    = $('.js-cfg-memoryMarkdownBtn');
    const interviewBtn  = $('.js-cfg-interviewBtn');
    const interviewHint = $('.js-cfg-interviewHint');

    /** @type {Array<Object>} Mirror of ai-memory.json */
    let memories = [];

    /**
     * Renders the memory list, unapproved AI suggestions first.
     *
     * Everything the assistant proposes lands here unapproved and unused —
     * approving is what lets an entry into a prompt, which is the same
     * propose-first rule the board changes follow.
     */
    function renderMemories() {
        if (memories.length === 0) {
            memoryList.innerHTML = '<div class="emptyState">Nothing remembered yet</div>';
            return;
        }

        const ordered = [...memories].sort((a, b) => Number(a.approved) - Number(b.approved));
        memoryList.innerHTML = ordered.map(memory => `
            <div class="memoryEditor__item ${memory.approved ? '' : '--pending'}" data-memory-id="${memory.id}">
                <input type="text" class="memoryEditor__itemText js-memoryText"
                       value="${escapeHtml(memory.text)}" maxlength="300" data-memory-id="${memory.id}" />
                <div class="memoryEditor__itemActions">
                    <select class="memoryEditor__categorySelect js-memoryCategory" data-memory-id="${memory.id}">
                        ${['other','person','term','project','preference'].map(c =>
                            `<option value="${c}"${(memory.category || 'other') === c ? ' selected' : ''}>${c[0].toUpperCase() + c.slice(1)}</option>`).join('')}
                    </select>
                    ${memory.approved
                        ? `<span class="memoryEditor__source">${memory.source === 'ai' ? 'suggested' : 'yours'}</span>`
                        : `<button type="button" class="btn --primary --sm js-memoryApprove" data-memory-id="${memory.id}">Remember this</button>`}
                    <button type="button" class="memoryEditor__deleteBtn js-memoryDelete" data-memory-id="${memory.id}" title="Forget">&times;</button>
                </div>
            </div>
        `).join('');

        // Edit on blur, matching the other CRUD sections here.
        memoryList.querySelectorAll('.js-memoryText').forEach(input => {
            input.addEventListener('blur', async () => {
                const memory = memories.find(m => m.id === input.dataset.memoryId);
                if (!memory) return;
                const text = input.value.trim();
                if (!text || text === memory.text) {
                    input.value = memory.text;
                    return;
                }
                try {
                    const updated = await updateMemoryApi(memory.id, { text });
                    Object.assign(memory, updated);
                } catch (error) {
                    toaster.error(error.message || 'Failed to save');
                    input.value = memory.text;
                }
            });
        });

        memoryList.querySelectorAll('.js-memoryCategory').forEach(select => {
            select.addEventListener('change', async () => {
                const memory = memories.find(m => m.id === select.dataset.memoryId);
                if (!memory) return;
                try {
                    Object.assign(memory, await updateMemoryApi(memory.id, { category: select.value }));
                } catch (error) {
                    toaster.error(error.message || 'Failed to save');
                    select.value = memory.category || 'other';
                }
            });
        });

        memoryList.querySelectorAll('.js-memoryApprove').forEach(btn => {
            btn.addEventListener('click', async () => {
                const memory = memories.find(m => m.id === btn.dataset.memoryId);
                if (!memory) return;
                try {
                    Object.assign(memory, await updateMemoryApi(memory.id, { approved: true }));
                    renderMemories();
                    toaster.success('The assistant will remember that');
                } catch (error) {
                    toaster.error(error.message || 'Failed to approve');
                }
            });
        });

        memoryList.querySelectorAll('.js-memoryDelete').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.memoryId;
                memories = memories.filter(m => m.id !== id);
                renderMemories();
                try {
                    await deleteMemoryApi(id);
                } catch (error) {
                    toaster.error(error.message || 'Failed to delete');
                }
            });
        });
    }

    async function addMemory() {
        const text = memoryInput.value.trim();
        if (!text) return;
        try {
            memories.push(await createMemoryApi(text, memoryCategorySelect.value));
            memoryInput.value = '';
            memoryCategorySelect.value = 'other';
            renderMemories();
        } catch (error) {
            toaster.error(error.message || 'Failed to add');
        }
    }

    memoryAddBtn.addEventListener('click', addMemory);
    memoryInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addMemory();
        }
    });

    /**
     * Describes what the assistant is missing, in plain terms.
     *
     * Runs whether or not an AI is configured — the gaps are computed from the
     * board, so the card is honest about what an interview would cover even
     * when the assistant itself is unavailable.
     */
    fetchInterviewDigestApi()
        .then(digest => {
            const bits = [];
            if (digest.names.length) bits.push(`${digest.names.length} recurring name${digest.names.length === 1 ? '' : 's'} it doesn't recognise`);
            if (digest.prefixes.length) bits.push(`${digest.prefixes.length} title prefix${digest.prefixes.length === 1 ? '' : 'es'}`);
            if (digest.epicsMissingContext.length) bits.push(`${digest.epicsMissingContext.length} epic${digest.epicsMissingContext.length === 1 ? '' : 's'} with no stakeholder`);

            interviewHint.textContent = digest.hasGaps
                ? `It read all ${digest.totals.tasks + digest.totals.archived} of your tasks, archive included, and found ${bits.join(', ')}. Run this again any time — after switching model, for instance.`
                : `Nothing obvious left to ask about. Run it again after the board has moved on.`;
            interviewBtn.disabled = false;
        })
        .catch(() => {
            interviewHint.textContent = 'Could not check what it knows.';
        });

    interviewBtn.addEventListener('click', async () => {
        const dock = document.querySelector('assistant-dock');
        if (!dock) { toaster.error('Assistant is not available on this page'); return; }
        // The dock reports its own failures — the conversation lands there, so
        // that is where an explanation has to appear.
        await dock.startInterview();
    });

    memoryMarkdownBtn.addEventListener('click', async () => {
        try {
            const md = await fetchMemoryMarkdownApi();
            openMarkdownModal(elements, 'What the assistant knows about me', md);
        } catch {
            toaster.error('Could not render memory');
        }
    });

    // Loaded after the page renders — memory is not something the config page
    // should wait on to become usable.
    fetchMemoriesApi()
        .then(fetched => { memories = fetched; renderMemories(); })
        .catch(() => { memoryList.innerHTML = '<div class="emptyState">Could not load memory</div>'; });

    // ==========================================
    // Section: Profiles
    // ==========================================
    const profNameInput    = $('.js-cfg-profileNameInput');
    const profLettersInput = $('.js-cfg-profileLettersInput');
    const profColorSelect  = $('.js-cfg-profileColorSelect');
    const profAddBtn       = $('.js-cfg-profileAddBtn');
    const profAliasPreview = $('.js-cfg-profileAliasPreview');
    const profError        = $('.js-cfg-profileError');
    const profList         = $('.js-cfg-profilesList');

    const profConfirmModal   = document.querySelector('.js-profileConfirmModal');
    const profConfirmMessage = document.querySelector('.js-profileConfirmMessage');
    const profConfirmCancel  = document.querySelector('.js-profileConfirmCancel');
    const profConfirmDelete  = document.querySelector('.js-profileConfirmDelete');
    let pendingProfileDelete = null;

    function populateProfileColorSelect(selectEl, currentProfiles, excludeId) {
        const usedColors = new Set(currentProfiles.filter(p => p.id !== excludeId).map(p => p.color));
        const items = EPIC_COLORS.map(color => ({ value: color.hex, label: color.name, disabled: usedColors.has(color.hex) }));
        selectEl.setItems(items);
    }

    async function refreshProfiles() {
        const fetched = await fetchProfilesApi();
        setProfiles(fetched);
        return fetched;
    }

    function renderProfiles() {
        populateProfileColorSelect(profColorSelect, profiles);
        profNameInput.value = '';
        profLettersInput.value = '';
        profColorSelect.clear();
        profAliasPreview.textContent = '';
        profError.style.display = 'none';

        if (profiles.length === 0) {
            profList.innerHTML = '<div class="emptyState">No profiles created yet</div>';
            return;
        }

        profList.innerHTML = profiles.map(profile => `
            <div class="profilesEditor__item" data-profile-id="${profile.id}">
                <button class="profilesEditor__defaultBtn js-profDefaultBtn ${profile.isDefault ? '--active' : ''}"
                        data-profile-id="${profile.id}" title="${profile.isDefault ? 'Default profile' : 'Set as default'}">&#9733;</button>
                <div class="profilesEditor__itemColor" style="background-color: ${profile.color};">${escapeHtml(profile.letters)}</div>
                <div class="profilesEditor__itemInfo">
                    <input type="text" class="profilesEditor__itemName js-profItemName" value="${escapeHtml(profile.name)}" data-profile-id="${profile.id}" />
                    <span class="profilesEditor__itemAlias">Alias: ${escapeHtml(profile.alias)}</span>
                </div>
                <input type="text" class="profilesEditor__itemLetters js-profItemLetters" value="${escapeHtml(profile.letters)}" data-profile-id="${profile.id}" maxlength="3" />
                <span class="js-profItemColorSlot" data-profile-id="${profile.id}"></span>
                <button class="profilesEditor__deleteBtn js-profDeleteBtn" data-profile-id="${profile.id}" title="Delete profile">&times;</button>
            </div>
        `).join('');

        // Color pickers
        profList.querySelectorAll('.js-profItemColorSlot').forEach(slot => {
            const profileId = slot.dataset.profileId;
            const profile = profiles.find(p => p.id === profileId);
            const picker = document.createElement('custom-picker');
            picker.setAttribute('type', 'color');
            picker.setAttribute('placeholder', 'Select color');
            picker.setAttribute('columns', '5');
            picker.dataset.profileId = profileId;
            slot.replaceWith(picker);
            populateProfileColorSelect(picker, profiles, profileId);
            if (profile) picker.value = profile.color;
        });

        // Name blur
        profList.querySelectorAll('.js-profItemName').forEach(input => {
            input.addEventListener('blur', async () => {
                const name = input.value.trim();
                if (!name) {
                    toaster.warning('Profile name cannot be empty');
                    const p = profiles.find(p => p.id === input.dataset.profileId);
                    if (p) input.value = p.name;
                    return;
                }
                const result = await updateProfileApi(input.dataset.profileId, { name });
                if (result.ok) { await refreshProfiles(); renderProfiles(); }
                else { toaster.error(result.error); }
            });
        });

        // Letters blur
        profList.querySelectorAll('.js-profItemLetters').forEach(input => {
            input.addEventListener('input', () => { input.value = input.value.toUpperCase().replace(/[^A-Z]/g, ''); });
            input.addEventListener('blur', async () => {
                const letters = input.value.trim().toUpperCase();
                if (!letters) {
                    toaster.warning('Profile letters cannot be empty');
                    const p = profiles.find(p => p.id === input.dataset.profileId);
                    if (p) input.value = p.letters;
                    return;
                }
                const result = await updateProfileApi(input.dataset.profileId, { letters });
                if (result.ok) { await refreshProfiles(); renderProfiles(); }
                else { toaster.error(result.error); }
            });
        });

        // Color change
        profList.querySelectorAll('custom-picker[data-profile-id]').forEach(picker => {
            picker.addEventListener('change', async () => {
                const color = picker.value;
                if (!color) return;
                const result = await updateProfileApi(picker.dataset.profileId, { color });
                if (result.ok) { await refreshProfiles(); renderProfiles(); }
                else {
                    toaster.error(result.error);
                    const p = profiles.find(p => p.id === picker.dataset.profileId);
                    if (p) picker.value = p.color;
                }
            });
        });

        // Default toggle
        profList.querySelectorAll('.js-profDefaultBtn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const profile = profiles.find(p => p.id === btn.dataset.profileId);
                if (profile?.isDefault) return;
                const result = await updateProfileApi(btn.dataset.profileId, { isDefault: true });
                if (result.ok) {
                    await refreshProfiles();
                    renderProfiles();
                    toaster.success(`"${profile?.name}" set as default profile`);
                } else { toaster.error(result.error); }
            });
        });

        // Delete
        profList.querySelectorAll('.js-profDeleteBtn').forEach(btn => {
            btn.addEventListener('click', () => {
                if (profiles.length <= 1) { toaster.warning('Cannot delete the last profile'); return; }
                const profile = profiles.find(p => p.id === btn.dataset.profileId);
                pendingProfileDelete = btn.dataset.profileId;
                profConfirmMessage.textContent = `Delete profile "${profile?.name || ''}"? All tasks, reports, and data for this profile will be permanently deleted.`;
                profConfirmModal.open();
            });
        });
    }

    profNameInput.addEventListener('input', () => {
        const name = profNameInput.value.trim();
        profAliasPreview.textContent = name ? `Alias: ${toCamelCase(name)}` : '';
    });

    profLettersInput.addEventListener('input', () => {
        profLettersInput.value = profLettersInput.value.toUpperCase().replace(/[^A-Z]/g, '');
    });

    profAddBtn.addEventListener('click', async () => {
        const name = profNameInput.value.trim();
        const letters = profLettersInput.value.trim().toUpperCase();
        const color = profColorSelect.value;
        if (!name) { toaster.warning('Profile name is required'); return; }
        if (!letters) { toaster.warning('Profile letters are required'); return; }
        if (!color) { toaster.warning('Please select a color'); return; }
        if (profiles.length >= MAX_PROFILES) { toaster.warning(`Maximum of ${MAX_PROFILES} profiles allowed`); return; }
        const result = await createProfileApi({ name, letters, color });
        if (result.ok) {
            await refreshProfiles();
            renderProfiles();
            toaster.success(`Profile "${name}" created`);
        } else {
            profError.textContent = result.error;
            profError.style.display = 'block';
        }
    });

    profConfirmCancel.addEventListener('click', () => { pendingProfileDelete = null; profConfirmModal.close(); });
    profConfirmDelete.addEventListener('click', async () => {
        if (!pendingProfileDelete) return;
        const profileId = pendingProfileDelete;
        const deletedProfile = profiles.find(p => p.id === profileId);
        pendingProfileDelete = null;
        profConfirmModal.close();
        const result = await deleteProfileApi(profileId);
        if (result.ok) {
            await refreshProfiles();
            renderProfiles();
            toaster.success('Profile deleted');
            // If we deleted the active profile, navigate to first remaining
            if (deletedProfile && activeProfile && deletedProfile.id === activeProfile.id) {
                if (profiles.length > 0) {
                    window.location.href = '/' + profiles[0].alias + '/config';
                }
            }
        } else { toaster.error(result.error); }
    });

    renderProfiles();
}
