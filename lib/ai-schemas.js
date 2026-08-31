/**
 * Tool schemas — the shapes the model is asked to emit.
 *
 * Five verbs, and the descriptions matter as much as the JSON: they are the
 * only place the model is told *when* a tool applies, and a vague one is how
 * you end up with every conversation turning into ticket creation.
 *
 * Kept apart from the prompt builders because these are a contract with the
 * provider — the same objects are handed to two different wire formats — while
 * the prompts around them are free text that changes far more often.
 *
 * @param {Object} deps
 * @param {Array<number>} deps.STORY_POINTS - The estimation scale, quoted in descriptions.
 * @param {Array<string>} deps.PROPOSAL_KINDS - The change kinds a proposal may take.
 * @returns {Object} The five tool schemas.
 */
module.exports = function createAiSchemas({ STORY_POINTS, PROPOSAL_KINDS }) {

    /**
     * Tool definition for structured task extraction.
     * Anthropic format — transformed for OpenAI-compatible providers in callOpenAiCompatibleAi().
     */
    const PROPOSE_TASKS_TOOL = {
        name: 'propose_tasks',
        description: 'Propose structured task objects extracted from the conversation. Call this ONLY when the user is asking for tasks to be created. Do not call it when answering a question about the existing board — a question deserves an answer, not tickets.',
        input_schema: {
            type: 'object',
            properties: {
                tasks: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            title:       { type: 'string',  description: 'Task title, concise and actionable, max 200 chars' },
                            description: { type: 'string',  description: 'Optional details that do not fit in the title' },
                            priority:    { type: 'boolean', description: 'true only for explicitly urgent or blocking tasks' },
                            epicId:      { type: 'string',  description: 'Epic ID from the provided list if the task clearly belongs to it, otherwise omit' },
                            category:    { type: 'integer', description: 'Category ID from the provided list, default 1 (Non categorized)' },
                            deadline:    { type: 'string',  description: 'ISO 8601 datetime only if a specific date or time is explicitly mentioned, otherwise omit' }
                        },
                        required: ['title']
                    }
                }
            },
            required: ['tasks']
        }
    };

    /**
     * Tool for classifying a single captured line into board fields.
     *
     * Deliberately separate from PROPOSE_TASKS_TOOL: quick capture runs on every
     * hallway note, so its prompt stays small (epics + categories + columns, no
     * board snapshot) and it answers about exactly one task.
     */
    const CLASSIFY_TASK_TOOL = {
        name: 'classify_task',
        description: 'Classify one captured note into board fields. Always call this exactly once.',
        input_schema: {
            type: 'object',
            properties: {
                title:    { type: 'string',  description: 'A clean, actionable rewrite of the note (verb + object), max 200 chars. Omit if the original is already a good title.' },
                epicId:   { type: 'string',  description: 'Epic ID from the provided list, only when the note clearly belongs to it. Omit otherwise.' },
                category: { type: 'integer', description: 'Category ID from the provided list.' },
                priority: { type: 'boolean', description: 'true only when the note says it is urgent or blocking.' },
                points:   { type: 'integer', description: 'Rough size: 1 = minutes, 2 = under an hour, 3 = half a day, 5 = a day, 8 = nearly too big, 13 = one to two days, 21/34 = bigger, 100 = too big to size (split it). Omit when the note gives no idea of size.' },
                columnId: { type: 'string',  description: 'Destination column ID from the provided list.' },
                deadline: { type: 'string',  description: 'ISO 8601 datetime, only when a specific date or time is stated. Omit otherwise.' }
            },
            required: []
        }
    };

    /**
     * Tool the AI uses to propose something worth remembering.
     *
     * Nothing it proposes is used until the user approves it on the config page —
     * the same propose-first rule the board changes follow.
     */
    const PROPOSE_MEMORY_TOOL = {
        name: 'propose_memory',
        description: 'Propose a durable fact worth remembering across conversations: who someone is ("Mikael is my boss"), what a term or abbreviation means ("SDS is the design system"), what a project or epic covers, or how this person prefers to work. Only for things that will still be true next month; never for one-off details about a single task. Proposals are reviewed by the user before they are used.',
        input_schema: {
            type: 'object',
            properties: {
                facts: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            text: { type: 'string', description: 'One sentence, stated as a fact. E.g. "ESB- prefixed tickets always belong to the ECOM epic."' },
                            category: {
                                type: 'string',
                                enum: ['person', 'term', 'project', 'preference', 'other'],
                                description: 'person = who someone is; term = what a word or abbreviation means; project = what an epic or project covers; preference = how they like to work.'
                            }
                        },
                        required: ['text']
                    }
                }
            },
            required: ['facts']
        }
    };

    /**
     * Tool for turning a report's raw activity into something presentable.
     *
     * The grouping and counting are done in code — deterministic, free, and not
     * something a model should be trusted with. What the model is for is the one
     * thing code cannot do: ticket titles are not presentation bullets. Rewriting
     * "ESB-767 - Shipping address not changes on order" into "Fixed shipping
     * addresses not updating on orders", and merging several related tickets into
     * a single line, is the manual work this replaces.
     */
    const WRITE_REPORT_SUMMARY_TOOL = {
        name: 'write_report_summary',
        description: 'Summarise a period of work for a one-to-one with a manager. Call exactly once.',
        input_schema: {
            type: 'object',
            properties: {
                tldr: { type: 'string', description: 'One or two sentences covering the period. Plain and factual; no filler, no adjectives like "successfully".' },
                silos: {
                    type: 'array',
                    description: 'One entry per epic that saw activity, in the order given. Omit epics with nothing to report.',
                    items: {
                        type: 'object',
                        properties: {
                            epic: { type: 'string', description: 'Epic name exactly as given' },
                            bullets: {
                                type: 'array',
                                description: 'Presentation-ready lines. Past tense, start with a verb, no ticket ids, merge related tickets into one line.',
                                items: { type: 'string' }
                            }
                        },
                        required: ['epic', 'bullets']
                    }
                },
                attention: {
                    type: 'array',
                    description: 'Things to raise rather than report — blocked, overdue, or needing a decision from the manager. Empty array if none.',
                    items: { type: 'string' }
                }
            },
            required: ['tldr', 'silos']
        }
    };

    /**
     * The assistant's second verb: propose changes to tasks that already exist.
     *
     * Nothing here reaches the board. Each entry lands in the review buffer and
     * needs a human click to apply — see docs/design/AI_ASSISTANT.md § Principles.
     */
    const PROPOSE_CHANGES_TOOL = {
        name: 'propose_changes',
        description: 'Propose changes to tasks that already exist on the board. Every proposal is reviewed by the user before it applies, so be specific and give a short reason. Use this when asked to reorganise, reschedule, re-file, tidy up or remove existing work. Do NOT use it to create new tasks.',
        input_schema: {
            type: 'object',
            properties: {
                changes: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            kind:   { type: 'string', enum: PROPOSAL_KINDS, description: 'update = change fields; move = change column; delete = remove the task' },
                            taskId: { type: 'string', description: 'ID of the existing task, exactly as shown in the board listing' },
                            reason: { type: 'string', description: 'One short line on why. Shown to the user next to the change.' },
                            title:       { type: 'string',  description: 'update only — new title' },
                            description: { type: 'string',  description: 'update only — new description' },
                            priority:    { type: 'boolean', description: 'update only — new priority flag' },
                            category:    { type: 'integer', description: 'update only — new category ID' },
                            epicId:      { type: 'string',  description: 'update only — new epic ID, or empty string to clear' },
                            points:      { type: 'integer', description: 'update only — new size (1, 2, 3, 5, 8, 13, 21, 34, 100)' },
                            deadline:    { type: 'string',  description: 'update only — ISO 8601 datetime, or empty string to clear' },
                            newStatus:   { type: 'string',  description: 'move only — destination column ID' }
                        },
                        required: ['kind', 'taskId', 'reason']
                    }
                }
            },
            required: ['changes']
        }
    };

    return {
        PROPOSE_TASKS_TOOL,
        CLASSIFY_TASK_TOOL,
        PROPOSE_MEMORY_TOOL,
        WRITE_REPORT_SUMMARY_TOOL,
        PROPOSE_CHANGES_TOOL
    };
};
