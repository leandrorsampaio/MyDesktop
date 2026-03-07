# Future Features

Backlog of nice-to-have features deferred from active development. Review before each planning cycle.

---

## AI Page

### Streaming AI responses
**Deferred from:** v2.35.0 (AI page V1)

Stream the narrative portion of the AI response token-by-token so the chat feels live, instead of waiting for the full response. Tasks are only added to the staged list once the full response (including the tool call) is received and parsed.

**Implementation notes:**
- Use Server-Sent Events (SSE) or chunked Transfer-Encoding from the Express endpoint
- The `/api/:profile/ai/chat` endpoint switches to a streaming response; the client reads it via `EventSource` or `fetch` with `response.body.getReader()`
- Only the `narrative` text streams; `tasks` are emitted as a final event once the tool call resolves
- Anthropic and OpenAI-compatible providers both support streaming with `stream: true`; the server handles format differences transparently

---

### Drag-resize handle between chat and task sections
**Deferred from:** v2.35.0 (AI page V1)

A draggable horizontal divider between the chat area (top) and the staged-task list (bottom), letting the user set their preferred split. The ratio should be persisted in `localStorage` as `{alias}:aiPageSplit` (a value between 0.2 and 0.8, default 0.55).

**Implementation notes:**
- `mousedown` on the divider element starts a drag; `mousemove` on `document` updates a CSS custom property `--ai-split` on the page container; `mouseup` ends drag
- Use `pointer-events: none` on iframes/embeds during drag to prevent capture issues
- The two sections use `height: calc(var(--ai-split) * 100%)` and `height: calc((1 - var(--ai-split)) * 100%)` respectively
- Min height on each section to prevent collapse (e.g. 120px)
- A double-click on the handle resets to the default 55/45 split
