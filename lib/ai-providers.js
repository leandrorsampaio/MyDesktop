/**
 * Provider dialogue — everything that speaks HTTP to an LLM.
 *
 * Two dialects: Anthropic's Messages API, and the OpenAI-compatible shape that
 * OpenAI, Groq, Google, Kimi, LM Studio and Ollama all approximate. Each has a
 * buffered and a streaming form, and these are the only functions in the
 * project that know either wire format exists.
 *
 * Exported as a factory rather than plain functions so this file requires
 * nothing back from server.js — the four things it needs are handed in. That
 * keeps the dependency one-way and lets the module be exercised in isolation.
 *
 * @param {Object} deps
 * @param {Function} deps.parseSseChunk - Re-assembles SSE frames across chunk boundaries.
 * @param {Function} deps.extractTasksFromText - JSON-from-text fallback for models that ignore tool calls.
 * @param {Function} deps.fetchWithTimeout - fetch that gives up rather than hanging.
 * @param {Object} deps.defaultTools - Tool schema used when a caller names none.
 * @returns {Object} The provider functions.
 */
module.exports = function createAiProviders({ parseSseChunk, extractTasksFromText, fetchWithTimeout, defaultTools }) {
    const PROPOSE_TASKS_TOOL = defaultTools;

    /**
     * Accumulates streamed tool-call fragments into finished tool calls.
     *
     * Both providers stream a tool's JSON arguments as a series of string
     * fragments, so nothing can be parsed until the stream ends. This collects
     * them by index and parses once at the end — a fragment that never completes
     * is dropped rather than throwing, so a truncated tool call can't take the
     * whole reply with it.
     */
    class ToolCallAccumulator {
        constructor() {
            /** @type {Map<number|string, {name: string, json: string}>} */
            this._calls = new Map();
        }

        /**
         * @param {number|string} index - Provider's block/tool index
         * @param {string|null} name - Set on the first fragment
         * @param {string} jsonFragment
         */
        push(index, name, jsonFragment = '') {
            if (!this._calls.has(index)) this._calls.set(index, { name: name || '', json: '' });
            const call = this._calls.get(index);
            if (name) call.name = name;
            call.json += jsonFragment;
        }

        /** @returns {Array<{name: string, input: Object}>} */
        finish() {
            const out = [];
            for (const call of this._calls.values()) {
                if (!call.name) continue;
                try {
                    out.push({ name: call.name, input: call.json ? JSON.parse(call.json) : {} });
                } catch {
                    // Incomplete or malformed arguments — skip this call, keep the rest.
                }
            }
            return out;
        }
    }

    /**
     * Calls the Anthropic Messages API.
     * @returns {Promise<{ narrative: string, rawTasks: Array<Object> }>}
     */
    async function callAnthropicAi(apiKey, model, systemPrompt, messages, tools = [PROPOSE_TASKS_TOOL]) {
        const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                model,
                max_tokens: 4096,
                system: systemPrompt,
                messages,
                tools
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `Anthropic API error ${response.status}`);
        }

        const data = await response.json();
        let narrative = '';
        let rawTasks = [];
        // Every tool call the model made, in order: { name, input }. A single
        // turn may legitimately both propose tasks and propose changes.
        const toolCalls = [];
        // Surfaced to the client so the cost of the board snapshot stays visible.
        const usage = {
            inputTokens:  data.usage?.input_tokens  ?? null,
            outputTokens: data.usage?.output_tokens ?? null
        };

        for (const block of (data.content || [])) {
            if (block.type === 'text') {
                narrative += (narrative ? '\n' : '') + block.text;
            } else if (block.type === 'tool_use') {
                toolCalls.push({ name: block.name, input: block.input || {} });
                if (block.name === PROPOSE_TASKS_TOOL.name) rawTasks = block.input?.tasks || [];
            }
        }

        if (!rawTasks.length && narrative) {
            rawTasks = extractTasksFromText(narrative);
        }

        return { narrative: narrative.trim(), rawTasks, toolCalls, usage };
    }

    /**
     * Streaming Anthropic call. Narrative text is handed to `onText` as it
     * arrives; tool calls are accumulated and returned once the stream ends,
     * because their arguments are only valid JSON when complete.
     *
     * @param {Function} onText - Called with each text delta
     * @returns {Promise<{narrative: string, rawTasks: Array, toolCalls: Array, usage: Object}>}
     */
    async function streamAnthropicAi(apiKey, model, systemPrompt, messages, tools, onText) {
        const response = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            },
            body: JSON.stringify({ model, max_tokens: 4096, system: systemPrompt, messages, tools, stream: true })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `Anthropic API error ${response.status}`);
        }

        const accumulator = new ToolCallAccumulator();
        const usage = { inputTokens: null, outputTokens: null };
        let narrative = '';

        await readSseStream(response, (event) => {
            let payload;
            try { payload = JSON.parse(event.data); } catch { return; }

            switch (payload.type) {
                case 'message_start':
                    usage.inputTokens = payload.message?.usage?.input_tokens ?? null;
                    break;
                case 'content_block_start':
                    if (payload.content_block?.type === 'tool_use') {
                        accumulator.push(payload.index, payload.content_block.name);
                    }
                    break;
                case 'content_block_delta':
                    if (payload.delta?.type === 'text_delta') {
                        narrative += payload.delta.text;
                        onText(payload.delta.text);
                    } else if (payload.delta?.type === 'input_json_delta') {
                        accumulator.push(payload.index, null, payload.delta.partial_json || '');
                    }
                    break;
                case 'message_delta':
                    if (payload.usage?.output_tokens != null) usage.outputTokens = payload.usage.output_tokens;
                    break;
            }
        });

        const toolCalls = accumulator.finish();
        const proposeTasks = toolCalls.find(c => c.name === PROPOSE_TASKS_TOOL.name);
        let rawTasks = proposeTasks?.input?.tasks || [];
        if (!rawTasks.length && narrative) rawTasks = extractTasksFromText(narrative);

        return { narrative: narrative.trim(), rawTasks, toolCalls, usage };
    }

    /**
     * Streaming OpenAI-compatible call. Same contract as the Anthropic version.
     */
    async function streamOpenAiCompatibleAi(baseUrl, apiKey, model, systemPrompt, messages, tools, onText) {
        const openAiTools = tools.map(t => ({
            type: 'function',
            function: { name: t.name, description: t.description, parameters: t.input_schema }
        }));

        const response = await fetchWithTimeout(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: {
                'authorization': `Bearer ${apiKey || 'none'}`,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                model,
                messages: [{ role: 'system', content: systemPrompt }, ...messages],
                tools: openAiTools,
                tool_choice: 'auto',
                stream: true,
                // Not every OpenAI-compatible server honours this; usage stays
                // null when it doesn't, which the client renders as no counter.
                stream_options: { include_usage: true }
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `AI provider error ${response.status}`);
        }

        const accumulator = new ToolCallAccumulator();
        const usage = { inputTokens: null, outputTokens: null };
        let narrative = '';

        await readSseStream(response, (event) => {
            if (event.data === '[DONE]') return;
            let payload;
            try { payload = JSON.parse(event.data); } catch { return; }

            if (payload.usage) {
                usage.inputTokens  = payload.usage.prompt_tokens     ?? usage.inputTokens;
                usage.outputTokens = payload.usage.completion_tokens ?? usage.outputTokens;
            }

            const delta = payload.choices?.[0]?.delta;
            if (!delta) return;

            if (typeof delta.content === 'string' && delta.content) {
                narrative += delta.content;
                onText(delta.content);
            }
            for (const call of (delta.tool_calls || [])) {
                accumulator.push(
                    call.index ?? 0,
                    call.function?.name || null,
                    call.function?.arguments || ''
                );
            }
        });

        const toolCalls = accumulator.finish();
        const proposeTasks = toolCalls.find(c => c.name === PROPOSE_TASKS_TOOL.name);
        let rawTasks = proposeTasks?.input?.tasks || [];
        if (!rawTasks.length && narrative) rawTasks = extractTasksFromText(narrative);

        return { narrative: narrative.trim(), rawTasks, toolCalls, usage };
    }

    /**
     * Reads a fetch Response body as SSE, invoking `onEvent` per complete event.
     * @param {Response} response
     * @param {Function} onEvent
     */
    async function readSseStream(response, onEvent) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            // stream: true keeps multi-byte characters intact across chunks
            const parsed = parseSseChunk(buffer, decoder.decode(value, { stream: true }));
            buffer = parsed.buffer;
            for (const event of parsed.events) onEvent(event);
        }
    }

    /**
     * Calls any OpenAI-compatible API (OpenAI, Groq, LM Studio, Ollama /v1, etc.).
     * @returns {Promise<{ narrative: string, rawTasks: Array<Object> }>}
     */
    async function callOpenAiCompatibleAi(baseUrl, apiKey, model, systemPrompt, messages, tools = [PROPOSE_TASKS_TOOL]) {
        // Transform tools to OpenAI function-calling format
        const openAiTools = tools.map(t => ({
            type: 'function',
            function: {
                name: t.name,
                description: t.description,
                parameters: t.input_schema
            }
        }));

        const finalUrl = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
        const response = await fetchWithTimeout(finalUrl, {
            method: 'POST',
            headers: {
                'authorization': `Bearer ${apiKey || 'none'}`,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                model,
                messages: [{ role: 'system', content: systemPrompt }, ...messages],
                tools: openAiTools,
                tool_choice: 'auto'
            })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || `AI provider error ${response.status}`);
        }

        const data = await response.json();
        const message = data.choices?.[0]?.message;
        let narrative = (message?.content || '').trim();
        let rawTasks = [];
        const toolCalls = [];
        const usage = {
            inputTokens:  data.usage?.prompt_tokens     ?? null,
            outputTokens: data.usage?.completion_tokens ?? null
        };

        for (const call of (message?.tool_calls || [])) {
            try {
                const args = JSON.parse(call.function.arguments);
                toolCalls.push({ name: call.function.name, input: args });
                if (call.function.name === PROPOSE_TASKS_TOOL.name) rawTasks = args.tasks || [];
            } catch {
                // A malformed tool call is skipped, not fatal — the narrative and
                // any well-formed calls in the same turn are still usable.
            }
        }

        if (!rawTasks.length && narrative) {
            rawTasks = extractTasksFromText(narrative);
        }

        return { narrative, rawTasks, toolCalls, usage };
    }

    return {
        ToolCallAccumulator,
        callAnthropicAi,
        streamAnthropicAi,
        streamOpenAiCompatibleAi,
        readSseStream,
        callOpenAiCompatibleAi
    };
};
