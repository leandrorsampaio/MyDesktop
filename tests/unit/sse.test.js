/**
 * Unit tests for the server-sent-event chunk parser
 * (Phase 8 of docs/design/AI_ASSISTANT.md).
 *
 * A network chunk can end anywhere — mid-line, mid-event, mid-character — and
 * getting the re-assembly wrong silently truncates the model's output. That
 * makes this the one piece of streaming worth testing exhaustively and in
 * isolation.
 *
 * Run with: node --test tests/unit/sse.test.js
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const MODULE_URL = pathToFileURL(
    path.join(__dirname, '..', '..', 'public', 'js', 'utils.js')
).href;

/** Feeds a whole payload through the parser in fixed-size slices. */
async function feed(text, sliceSize) {
    const { parseSseChunk } = await import(MODULE_URL);
    let buffer = '';
    const events = [];
    for (let i = 0; i < text.length; i += sliceSize) {
        const result = parseSseChunk(buffer, text.slice(i, i + sliceSize));
        buffer = result.buffer;
        events.push(...result.events);
    }
    return events;
}

describe('parseSseChunk', () => {

    it('parses a complete event', async () => {
        const { parseSseChunk } = await import(MODULE_URL);
        const { events, buffer } = parseSseChunk('', 'event: text\ndata: {"delta":"hi"}\n\n');

        assert.strictEqual(events.length, 1);
        assert.strictEqual(events[0].event, 'text');
        assert.strictEqual(events[0].data, '{"delta":"hi"}');
        assert.strictEqual(buffer, '');
    });

    it('parses several events in one chunk', async () => {
        const { parseSseChunk } = await import(MODULE_URL);
        const { events } = parseSseChunk('',
            'event: text\ndata: a\n\nevent: text\ndata: b\n\n');

        assert.deepStrictEqual(events.map(e => e.data), ['a', 'b']);
    });

    it('holds an incomplete event until the rest arrives', async () => {
        const { parseSseChunk } = await import(MODULE_URL);

        const first = parseSseChunk('', 'event: text\ndata: {"del');
        assert.deepStrictEqual(first.events, [], 'emitted a half-received event');

        const second = parseSseChunk(first.buffer, 'ta":"hi"}\n\n');
        assert.strictEqual(second.events.length, 1);
        assert.strictEqual(second.events[0].data, '{"delta":"hi"}');
    });

    it('survives being sliced one character at a time', async () => {
        // The worst case a network can produce, and the one that catches
        // off-by-one errors in the buffering.
        const payload = 'event: text\ndata: one\n\nevent: text\ndata: two\n\nevent: done\ndata: {"ok":true}\n\n';
        const events = await feed(payload, 1);

        assert.deepStrictEqual(events.map(e => [e.event, e.data]), [
            ['text', 'one'],
            ['text', 'two'],
            ['done', '{"ok":true}']
        ]);
    });

    it('produces the same events at every chunk size', async () => {
        const payload = 'event: text\ndata: alpha\n\nevent: text\ndata: beta\n\nevent: done\ndata: {}\n\n';
        const reference = await feed(payload, payload.length);

        for (const size of [1, 2, 3, 7, 13, 40]) {
            assert.deepStrictEqual(await feed(payload, size), reference,
                `chunk size ${size} parsed differently`);
        }
    });

    it('handles CRLF line endings', async () => {
        const { parseSseChunk } = await import(MODULE_URL);
        const { events } = parseSseChunk('', 'event: text\r\ndata: hi\r\n\r\n');

        assert.strictEqual(events[0].event, 'text');
        assert.strictEqual(events[0].data, 'hi');
    });

    it('accepts an event with no name', async () => {
        // OpenAI-compatible servers send bare `data:` lines with no event field.
        const { parseSseChunk } = await import(MODULE_URL);
        const { events } = parseSseChunk('', 'data: {"choices":[]}\n\n');

        assert.strictEqual(events[0].event, null);
        assert.strictEqual(events[0].data, '{"choices":[]}');
    });

    it('joins multi-line data fields', async () => {
        const { parseSseChunk } = await import(MODULE_URL);
        const { events } = parseSseChunk('', 'data: line one\ndata: line two\n\n');

        assert.strictEqual(events[0].data, 'line one\nline two');
    });

    it('ignores comment lines used as keep-alives', async () => {
        const { parseSseChunk } = await import(MODULE_URL);
        const { events } = parseSseChunk('', ': keep-alive\n\nevent: text\ndata: hi\n\n');

        assert.strictEqual(events.length, 1);
        assert.strictEqual(events[0].data, 'hi');
    });

    it('drops an event carrying no data field', async () => {
        const { parseSseChunk } = await import(MODULE_URL);
        const { events } = parseSseChunk('', 'event: ping\n\n');
        assert.deepStrictEqual(events, []);
    });

    it('passes the terminal [DONE] sentinel through untouched', async () => {
        const { parseSseChunk } = await import(MODULE_URL);
        const { events } = parseSseChunk('', 'data: [DONE]\n\n');
        assert.strictEqual(events[0].data, '[DONE]');
    });

    it('returns an empty buffer once everything is consumed', async () => {
        const { parseSseChunk } = await import(MODULE_URL);
        const { buffer } = parseSseChunk('', 'data: a\n\ndata: b\n\n');
        assert.strictEqual(buffer, '');
    });
});
