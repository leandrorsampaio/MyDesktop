/**
 * Validators — turning what the model said into records this app will store.
 *
 * Everything here treats its input as untrusted, because it is: a tool call is
 * a suggestion from a remote model, and half of them arrive subtly wrong —
 * an epic id that does not exist, a column that was renamed, points off the
 * scale, a title three paragraphs long. Each function returns a clean record
 * or nothing; none of them throws, because one malformed item in a batch must
 * not take the rest of the reply with it.
 *
 * This is the layer that makes propose-first mean something. The AI writes
 * only into review buffers, and it only gets there through these functions.
 *
 * `applyProposal` is the exception in shape rather than in principle: it is
 * what runs when a human finally clicks Apply, and it re-validates then,
 * because the board has usually moved on since the proposal was written.
 *
 * @param {Object} deps
 * @param {Object} deps.VALIDATION - Shared field limits.
 * @param {Array<number>} deps.STORY_POINTS
 * @param {number} deps.DEFAULT_CATEGORY_ID
 * @param {Array<string>} deps.PROPOSAL_KINDS
 * @param {number} deps.PROPOSAL_REASON_MAX_LENGTH
 * @param {Function} deps.generateId
 * @param {Function} deps.normaliseMemoryCategory
 * @param {Function} deps.validateTaskInput
 * @param {Function} deps.validateMoveInput
 * @returns {Object} The validators.
 */
module.exports = function createAiValidators({
    VALIDATION, STORY_POINTS, DEFAULT_CATEGORY_ID, PROPOSAL_KINDS,
    PROPOSAL_REASON_MAX_LENGTH, generateId, normaliseMemoryCategory,
    validateTaskInput, validateMoveInput
}) {

    /**
     * ===========================================
     * Skills
     * ===========================================
     *
     * Reusable instruction blocks that shape *how* the assistant answers, as
     * opposed to memories, which record *what* it knows. "Answer in three
     * sentences" is a skill; "ESB- tickets belong to ECOM" is a memory.
     *
     * The split matters because the two have different lifetimes. A memory is a
     * fact that should hold next month. A skill is a preference you switch on for
     * one conversation and off for the next — writing tickets needs a different
     * voice from talking through a board.
     *
     * `alwaysOn` skills apply to every conversation, which is what makes a
     * standing preference like brevity actually stick. The rest are selected per
     * conversation and travel with it, so reopening an old thread restores the
     * voice it was written in.
     *
     * Unlike memories, the AI cannot propose these. Telling the model how to
     * behave is the user's job.
     */
    const MAX_SKILLS = 20;

    /** Long enough to name a voice, short enough to fit a chip in the dock. */
    const SKILL_NAME_MAX_LENGTH = 60;

    /** A skill is a short brief, not a document. */
    const SKILL_INSTRUCTIONS_MAX_LENGTH = 1000;

    /**
     * Validates and normalises a skill from a request body.
     * @param {Object} raw
     * @param {Object} [existing] - The current record, when updating.
     * @returns {{ok: true, skill: Object}|{ok: false, error: string}}
     */
    function normaliseSkillInput(raw, existing = null) {
        const has = (field) => raw && Object.prototype.hasOwnProperty.call(raw, field);

        const name = has('name') ? raw.name : existing?.name;
        if (typeof name !== 'string' || !name.trim()) {
            return { ok: false, error: 'Skill name is required' };
        }
        if (name.trim().length > SKILL_NAME_MAX_LENGTH) {
            return { ok: false, error: `Skill name must be ${SKILL_NAME_MAX_LENGTH} characters or less` };
        }

        const instructions = has('instructions') ? raw.instructions : existing?.instructions;
        if (typeof instructions !== 'string' || !instructions.trim()) {
            return { ok: false, error: 'Skill instructions are required' };
        }
        if (instructions.trim().length > SKILL_INSTRUCTIONS_MAX_LENGTH) {
            return { ok: false, error: `Skill instructions must be ${SKILL_INSTRUCTIONS_MAX_LENGTH} characters or less` };
        }

        const alwaysOn = has('alwaysOn') ? raw.alwaysOn : (existing?.alwaysOn ?? false);
        if (typeof alwaysOn !== 'boolean') {
            return { ok: false, error: 'alwaysOn must be a boolean' };
        }

        return {
            ok: true,
            skill: {
                id: existing?.id || generateId(),
                name: name.trim(),
                instructions: instructions.trim(),
                alwaysOn,
                createdAt: existing?.createdAt || new Date().toISOString(),
                updatedAt: new Date().toISOString()
            }
        };
    }

    /**
     * ===========================================
     * Long-term memory
     * ===========================================
     *
     * A short, curated list of durable facts about how this person works —
     * their sizing conventions, what an epic really means, which prefixes map to
     * which work. Injected on every call, which is what lets story points and epic
     * conventions compound instead of resetting each session.
     *
     * Deliberately a plain, hand-editable JSON list rather than an embedding
     * store: "your data, your machine" has to mean a file you can read, edit and
     * version — and a vector database would break the zero-dependency rule for a
     * board this size.
     *
     * The AI may *propose* entries but never adds one. Unapproved entries are
     * stored and shown for review; only approved entries reach the prompt.
     */
    const MAX_MEMORIES = 40;

    /** Longest single memory entry. Long enough for a sentence, not a paragraph. */
    const MEMORY_TEXT_MAX_LENGTH = 300;

    /**
     * Normalises one raw memory entry from the model, or returns null.
     * @param {Object} raw
     * @returns {Object|null}
     */
    function normaliseMemory(raw) {
        const text = raw && typeof raw.text === 'string' ? raw.text.trim() : '';
        if (!text) return null;
        return {
            id: generateId(),
            text: text.slice(0, MEMORY_TEXT_MAX_LENGTH),
            category: normaliseMemoryCategory(raw.category),
            source: 'ai',
            approved: false,
            createdAt: new Date().toISOString()
        };
    }

    /**
     * Validates and normalises one raw proposal from the model into a stored
     * proposal, or null when it is unusable.
     *
     * Everything here is untrusted model output. A proposal that references a
     * task, column, epic or category this profile doesn't have is dropped rather
     * than stored — a review buffer full of un-appliable rows is worse than a
     * shorter honest one.
     *
     * @param {Object} raw - One entry from the propose_changes tool call
     * @param {Object} ctx
     * @param {Set<string>} ctx.validTaskIds
     * @param {Set<string>} ctx.validColumnIds
     * @param {Set<string>} ctx.validEpicIds
     * @param {Set<number>} ctx.validCategoryIds
     * @returns {Object|null}
     */
    function normaliseProposal(raw, { validTaskIds, validColumnIds, validEpicIds, validCategoryIds }) {
        if (!raw || typeof raw !== 'object') return null;
        if (!PROPOSAL_KINDS.includes(raw.kind)) return null;
        if (typeof raw.taskId !== 'string' || !validTaskIds.has(raw.taskId)) return null;

        const reason = typeof raw.reason === 'string'
            ? raw.reason.trim().slice(0, PROPOSAL_REASON_MAX_LENGTH)
            : '';

        const proposal = {
            id: generateId(),
            kind: raw.kind,
            taskId: raw.taskId,
            reason,
            payload: {},
            createdAt: new Date().toISOString()
        };

        if (raw.kind === 'move') {
            if (typeof raw.newStatus !== 'string' || !validColumnIds.has(raw.newStatus)) return null;
            proposal.payload.newStatus = raw.newStatus;
            return proposal;
        }

        if (raw.kind === 'delete') {
            return proposal;   // no payload
        }

        // update — keep only the fields that are present AND valid
        const p = proposal.payload;
        if (typeof raw.title === 'string' && raw.title.trim()) {
            p.title = raw.title.trim().slice(0, VALIDATION.TITLE_MAX_LENGTH);
        }
        if (typeof raw.description === 'string') {
            p.description = raw.description.slice(0, VALIDATION.DESCRIPTION_MAX_LENGTH);
        }
        if (typeof raw.priority === 'boolean') p.priority = raw.priority;
        if (validCategoryIds.has(Number(raw.category))) p.category = Number(raw.category);
        if (typeof raw.epicId === 'string') {
            // Empty string is a deliberate "clear the epic", not a bad value.
            if (raw.epicId === '') p.epicId = null;
            else if (validEpicIds.has(raw.epicId)) p.epicId = raw.epicId;
        }
        if (STORY_POINTS.includes(Number(raw.points))) p.points = Number(raw.points);
        if (typeof raw.deadline === 'string') {
            if (raw.deadline === '') p.deadline = null;
            else if (!isNaN(Date.parse(raw.deadline))) p.deadline = new Date(raw.deadline).toISOString();
        }

        // An update that changes nothing is noise in the review list.
        if (Object.keys(p).length === 0) return null;
        return proposal;
    }

    /**
     * Applies one proposal to the task list, in place.
     *
     * Runs the same validators the equivalent hand-driven routes run
     * (`validateTaskInput`, `validateMoveInput`) rather than trusting what was
     * stored: the board's state may have moved on since the proposal was made, so
     * a stored proposal is re-checked at apply time, not just at write time.
     *
     * @param {Array<Object>} tasks - Mutated in place
     * @param {Object} proposal
     * @param {Object} ctx
     * @param {Array<Object>} ctx.columns
     * @param {Set<number>} ctx.validCategoryIds
     * @param {Map<number, string>} ctx.categoryNames
     * @returns {{ok: true, task: Object|null} | {ok: false, error: string}}
     */
    function applyProposal(tasks, proposal, { columns, validCategoryIds, categoryNames }) {
        const index = tasks.findIndex(t => t.id === proposal.taskId);
        if (index === -1) {
            return { ok: false, error: 'That task no longer exists' };
        }
        const task = tasks[index];
        const today = new Date().toISOString().split('T')[0];

        if (proposal.kind === 'delete') {
            // Archived, not destroyed. A model mistake plus one click on "Apply
            // all" was the only path in the whole application to permanent data
            // loss, and it was the newest one. This routes it through the same
            // store the archive page reads, so Restore already works on it.
            tasks.splice(index, 1);
            task.status = 'archived';
            task.archivedDate = new Date().toISOString();
            task.log.push({ date: today, action: 'Archived from an AI proposal' });
            return { ok: true, task: null, archivedTask: task };
        }

        if (proposal.kind === 'move') {
            const validColumnIds = new Set(columns.map(c => c.id));
            const validation = validateMoveInput({ newStatus: proposal.payload.newStatus }, validColumnIds);
            if (!validation.valid) return { ok: false, error: validation.errors.join('; ') };

            const from = columns.find(c => c.id === task.status);
            const to   = columns.find(c => c.id === proposal.payload.newStatus);
            if (task.status === to.id) return { ok: false, error: 'Task is already in that column' };

            for (const t of tasks) {
                if (t.id !== task.id && t.status === to.id) t.position += 1;
            }
            task.status = to.id;
            task.position = 0;
            if (!task.log) task.log = [];
            task.log.push({ date: today, action: `Moved from '${from ? from.name : '?'}' to '${to.name}'` });
            return { ok: true, task };
        }

        // update
        const validation = validateTaskInput(proposal.payload, { requireTitle: false, validCategoryIds });
        if (!validation.valid) return { ok: false, error: validation.errors.join('; ') };

        const p = proposal.payload;
        if (p.title       !== undefined) task.title = p.title.trim();
        if (p.description !== undefined) task.description = p.description.trim();
        if (p.priority    !== undefined) task.priority = Boolean(p.priority);
        if (p.epicId      !== undefined) task.epicId = p.epicId || null;
        if (p.points      !== undefined) task.points = p.points;
        if (p.deadline    !== undefined) task.deadline = p.deadline || null;
        if (p.category    !== undefined) {
            const newCategory = Number(p.category);
            const oldCategory = task.category || DEFAULT_CATEGORY_ID;
            // Same logging rule the hand-driven PUT route follows
            if (newCategory !== oldCategory) {
                if (!task.log) task.log = [];
                task.log.push({
                    date: today,
                    action: `Category changed from ${categoryNames.get(oldCategory) || 'Non categorized'} to ${categoryNames.get(newCategory) || 'Non categorized'}`
                });
            }
            task.category = newCategory;
        }

        return { ok: true, task };
    }

    /**
     * Attempts to extract tasks JSON from a plain-text response (fallback when tool use fails).
     * Looks for a JSON block containing a "tasks" array.
     * @param {string} text
     * @returns {Array<Object>} extracted tasks or []
     */
    function extractTasksFromText(text) {
        try {
            // Try ```json ... ``` block first
            const fenced = text.match(/```json\s*([\s\S]*?)\s*```/);
            if (fenced) {
                const parsed = JSON.parse(fenced[1]);
                if (Array.isArray(parsed.tasks)) return parsed.tasks;
                if (Array.isArray(parsed)) return parsed;
            }
            // Try bare { "tasks": [...] } anywhere in the text
            const bare = text.match(/\{[\s\S]*"tasks"\s*:\s*\[[\s\S]*?\]\s*\}/);
            if (bare) {
                const parsed = JSON.parse(bare[0]);
                if (Array.isArray(parsed.tasks)) return parsed.tasks;
            }
        } catch {
            // Parsing failed — return empty
        }
        return [];
    }

    /**
     * Normalises a raw task from the AI into a valid StagedTask object.
     * Validates fields against loaded epics and categories; applies safe defaults.
     * @param {Object} raw
     * @param {string} id
     * @param {Set<string>} validEpicIds
     * @param {Set<number>} validCategoryIds
     * @returns {Object} StagedTask
     */
    function normaliseStagedTask(raw, id, validEpicIds, validCategoryIds) {
        const title = typeof raw.title === 'string' ? raw.title.trim().substring(0, 200) : '';
        if (!title) return null;

        const description = typeof raw.description === 'string' ? raw.description.substring(0, 2000) : '';
        const priority    = raw.priority === true;
        const epicId      = (typeof raw.epicId === 'string' && validEpicIds.has(raw.epicId)) ? raw.epicId : null;
        const catNum      = Number(raw.category);
        const category    = (!isNaN(catNum) && validCategoryIds.has(catNum)) ? catNum : 1;
        const deadline    = (raw.deadline && typeof raw.deadline === 'string' && !isNaN(Date.parse(raw.deadline)))
            ? raw.deadline
            : null;

        return {
            id,
            title,
            description,
            priority,
            epicId,
            category,
            deadline,
            createdDate: new Date().toISOString()
        };
    }

    /**
     * Validates memory text from a request body.
     * @param {*} text
     * @returns {{valid: boolean, error?: string, text?: string}}
     */


    function validateMemoryText(text) {
        if (typeof text !== 'string' || text.trim() === '') {
            return { valid: false, error: 'Memory text is required' };
        }
        if (text.trim().length > MEMORY_TEXT_MAX_LENGTH) {
            return { valid: false, error: `Memory must be ${MEMORY_TEXT_MAX_LENGTH} characters or less` };
        }
        return { valid: true, text: text.trim() };
    }

    return {
        MAX_SKILLS,
        MAX_MEMORIES,
        normaliseSkillInput,
        validateMemoryText,
        normaliseMemory,
        normaliseProposal,
        applyProposal,
        normaliseStagedTask,
        extractTasksFromText
    };
};
