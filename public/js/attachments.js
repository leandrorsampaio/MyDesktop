/**
 * Attachments module for Task Tracker.
 *
 * Owns the "Files" tab of the task modal: the drop zone, the paste handler,
 * the thumbnail/file list, and the full-size viewer. The same list renderer is
 * reused read-only by the archive page, so the markup stays in one place.
 *
 * Two modes, decided by whether the modal has a saved task to hang files on:
 *
 *  - **live** (editing an existing task): every drop, paste or file pick
 *    uploads straight away and the list re-renders from the server's reply.
 *  - **pending** (adding a brand-new task, or editing an AI-staged proposal
 *    before it has been promoted): there is no task id to attach to yet, so
 *    files are held in memory with object-URL previews and flushed by
 *    `flushPendingAttachments()` once the task exists.
 */

import { MAX_ATTACHMENTS_PER_TASK, MAX_ATTACHMENT_SIZE } from './constants.js';
import { escapeHtml, formatBytes, isViewableAttachment } from './utils.js';
import { attachmentUrl, uploadAttachmentApi, deleteAttachmentApi } from './api.js';

/**
 * Current panel context. Null when no task modal is open.
 * @type {{taskId: string|null, attachments: Array, pending: Array,
 *         onChange: Function|null, uploading: number}|null}
 */
let ctx = null;

/** DOM references captured once by initAttachments(). */
let els = null;

/**
 * Wires the attachment panel's delegated listeners. Call once at app start,
 * after `elements` is populated.
 *
 * Every listener here is delegated from containers that live in index.html for
 * the page's whole lifetime, so there is nothing to tear down — no
 * disconnectedCallback equivalent is needed.
 *
 * @param {Object} elements - DOM element references from app.js
 */
export function initAttachments(elements) {
    els = elements;
    if (!els.attachments) return;

    els.attachments.addEventListener('click', handlePanelClick);
    els.attachments.addEventListener('change', handleFileInputChange);

    // A thumbnail that won't decode (a truncated upload, or a file whose
    // declared type doesn't match its bytes) would otherwise show the
    // browser's broken-image glyph. Swap in the generic file icon instead.
    // `error` doesn't bubble, so this listens in the capture phase.
    els.attachments.addEventListener('error', (e) => {
        const img = e.target;
        if (!img.classList?.contains('attachments__thumb')) return;
        const fallback = document.createElement('span');
        fallback.className = 'attachments__fileIcon';
        fallback.innerHTML = '<svg-icon icon="folder" size="20"></svg-icon>';
        img.replaceWith(fallback);
    }, true);

    // Drag-and-drop anywhere on the open dialog — not just on the Files tab.
    // Dropping while Description is showing switches tabs and attaches, so the
    // user never has to find the right panel first.
    //
    // dragenter/dragleave fire once per element crossed, so a naive
    // "hide on dragleave" flickers off every time the pointer moves between
    // children. Counting enters and leaves is the reliable fix.
    let dragDepth = 0;

    els.taskModal.addEventListener('dragenter', (e) => {
        if (!ctx || !hasFiles(e)) return;
        e.preventDefault();
        dragDepth += 1;
        showDropOverlay(true);
    });

    // dragover must be cancelled on every event or the browser navigates to
    // the dropped file instead of handing it over.
    els.taskModal.addEventListener('dragover', (e) => {
        if (!ctx || !hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
    });

    els.taskModal.addEventListener('dragleave', (e) => {
        if (!ctx || !hasFiles(e)) return;
        dragDepth = Math.max(0, dragDepth - 1);
        if (dragDepth === 0) showDropOverlay(false);
    });

    els.taskModal.addEventListener('drop', (e) => {
        if (!ctx || !hasFiles(e)) return;
        e.preventDefault();
        dragDepth = 0;
        showDropOverlay(false);
        showPanel();
        addFiles(Array.from(e.dataTransfer.files));
    });

    // A drag that ends outside the window never fires drop, and the counter
    // would strand the overlay on screen — reset on the modal closing too.
    window.addEventListener('dragend', () => { dragDepth = 0; showDropOverlay(false); });

    // Paste anywhere in the task modal — the Print Screen → Ctrl+V path.
    // Ignored while the caret is in a text field so pasting into the
    // description or title still behaves normally.
    els.taskModal.addEventListener('paste', (e) => {
        if (!ctx) return;
        const target = e.composedPath()[0];
        if (isTextEntry(target) && !isPanelVisible()) return;
        const files = Array.from(e.clipboardData?.files || []);
        if (files.length === 0) return;
        e.preventDefault();
        showPanel();
        addFiles(files);
    });

    // Tab strip
    els.taskTabs?.addEventListener('click', (e) => {
        const tab = e.target.closest('.js-taskTab');
        if (tab) selectTab(tab.dataset.tab);
    });

    // Viewer modal
    els.attachmentViewer?.addEventListener('click', (e) => {
        if (e.target.closest('.js-viewerClose')) els.attachmentModal.close();
    });

    // Drop the context when the task modal closes, so a stale task's files
    // can never show up under the next one the user opens. The viewer is a
    // separate modal stacked on top — closing it must not wipe the panel
    // underneath, hence the target check.
    els.taskModal.addEventListener('modal-closed', (e) => {
        if (e.target === els.taskModal) {
            dragDepth = 0;
            showDropOverlay(false);
            closeAttachments();
        }
    });
}

/**
 * Points the panel at a task and renders it.
 * @param {string|null} taskId - null for a task that doesn't exist yet
 * @param {Array} attachments - Existing attachment records (ignored when taskId is null)
 * @param {{onChange?: Function}} [opts] - onChange(attachments) after any add/remove
 */
export function openAttachmentsFor(taskId, attachments = [], { onChange = null } = {}) {
    releasePreviewUrls();
    ctx = {
        taskId,
        attachments: Array.isArray(attachments) ? [...attachments] : [],
        pending: [],
        onChange,
        uploading: 0
    };
    selectTab('description');
    render();
}

/**
 * Clears the panel. Called when the task modal closes so a stale task's files
 * can't leak into the next one the user opens.
 */
export function closeAttachments() {
    releasePreviewUrls();
    ctx = null;
    if (els?.attachments) els.attachments.innerHTML = '';
    updateTabCount(0);
}

/**
 * Uploads anything queued while the task had no id yet.
 *
 * Called by the task-create paths once the server has handed back a real task.
 * Failures are reported but never rethrown: the task itself was created
 * successfully, and losing the whole save over one rejected file would be
 * worse than losing the file.
 *
 * @param {string} taskId - The freshly created task's id
 * @param {Array<File>} files - Queued files (from `takePendingFiles()`)
 * @param {Object} elements - DOM element references, for the toaster
 * @returns {Promise<Array>} The attachment records that uploaded successfully
 */
export async function flushPendingAttachments(taskId, files, elements) {
    if (!taskId || !files || files.length === 0) return [];

    const uploaded = [];
    let failed = 0;
    for (const file of files) {
        try {
            uploaded.push(await uploadAttachmentApi(taskId, file));
        } catch {
            failed += 1;
        }
    }
    if (failed > 0) {
        elements?.toaster?.error(`${failed} file${failed === 1 ? '' : 's'} could not be attached`);
    }
    return uploaded;
}

/**
 * Hands over the files queued in pending mode and clears the queue, so the
 * caller can upload them after creating the task.
 * @returns {Array<File>}
 */
export function takePendingFiles() {
    if (!ctx) return [];
    const files = ctx.pending.map(p => p.file);
    releasePreviewUrls();
    ctx.pending = [];
    return files;
}

// ==========================================
// Internals
// ==========================================

/** True when a drag/drop event is carrying files rather than a dragged card. */
function hasFiles(e) {
    return Array.from(e.dataTransfer?.types || []).includes('Files');
}

/** True when the event target is somewhere the user is typing. */
function isTextEntry(el) {
    if (!el || !el.tagName) return false;
    return el.tagName === 'INPUT'
        || el.tagName === 'TEXTAREA'
        || el.isContentEditable === true;
}

/**
 * Shows or hides the dialog-wide "Drop to attach" overlay.
 * @param {boolean} visible
 */
function showDropOverlay(visible) {
    if (els?.taskDropOverlay) els.taskDropOverlay.hidden = !visible;
}

function isPanelVisible() {
    return els?.attachmentsPanel && !els.attachmentsPanel.hidden;
}

function showPanel() {
    selectTab('attachments');
}

/**
 * Switches the task modal's main column between Description and Files.
 * @param {string} name - 'description' | 'attachments'
 */
export function selectTab(name) {
    if (!els?.taskTabs) return;
    for (const tab of els.taskTabs.querySelectorAll('.js-taskTab')) {
        const active = tab.dataset.tab === name;
        tab.classList.toggle('--active', active);
        tab.setAttribute('aria-selected', String(active));
    }
    for (const panel of document.querySelectorAll('.js-taskPanel')) {
        panel.hidden = panel.dataset.panel !== name;
    }
}

function updateTabCount(count) {
    const badge = els?.attachmentCount;
    if (!badge) return;
    badge.textContent = String(count);
    badge.hidden = count === 0;
}

/** Frees object URLs held by pending previews so blobs aren't leaked. */
function releasePreviewUrls() {
    for (const item of ctx?.pending || []) {
        if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    }
}

/**
 * Validates and takes on a batch of files, uploading immediately when the task
 * already exists and queueing them otherwise.
 * @param {Array<File>} files
 */
async function addFiles(files) {
    if (!ctx || files.length === 0) return;

    const current = ctx.attachments.length + ctx.pending.length;
    const room = MAX_ATTACHMENTS_PER_TASK - current;
    if (room <= 0) {
        els.toaster.warning(`A task can hold at most ${MAX_ATTACHMENTS_PER_TASK} files`);
        return;
    }

    let accepted = files;
    if (accepted.length > room) {
        els.toaster.warning(`Only ${room} more file${room === 1 ? '' : 's'} fit on this task`);
        accepted = accepted.slice(0, room);
    }

    // Reject oversized files here rather than uploading megabytes just to be
    // turned away — the server enforces the same limit regardless.
    const oversized = accepted.filter(f => f.size > MAX_ATTACHMENT_SIZE);
    for (const file of oversized) {
        els.toaster.error(`"${file.name}" is larger than ${formatBytes(MAX_ATTACHMENT_SIZE)}`);
    }
    accepted = accepted.filter(f => f.size <= MAX_ATTACHMENT_SIZE);
    if (accepted.length === 0) return;

    if (!ctx.taskId) {
        for (const file of accepted) {
            ctx.pending.push({
                tempId: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                file,
                previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null
            });
        }
        render();
        return;
    }

    ctx.uploading += accepted.length;
    render();

    for (const file of accepted) {
        try {
            const attachment = await uploadAttachmentApi(ctx.taskId, file);
            // The modal may have moved on to another task mid-upload; only
            // apply the result if it still belongs to the open one.
            if (ctx) ctx.attachments.push(attachment);
        } catch (error) {
            els.toaster.error(error.message || `Failed to attach "${file.name}"`);
        } finally {
            if (ctx) ctx.uploading -= 1;
        }
        if (ctx) render();
    }
    notifyChange();
}

/**
 * Removes an attachment. Optimistic: the row disappears at once and comes back
 * if the server refuses.
 * @param {string} attachmentId
 */
async function removeAttachment(attachmentId) {
    if (!ctx) return;

    const pendingIndex = ctx.pending.findIndex(p => p.tempId === attachmentId);
    if (pendingIndex !== -1) {
        const [removed] = ctx.pending.splice(pendingIndex, 1);
        if (removed.previewUrl) URL.revokeObjectURL(removed.previewUrl);
        render();
        return;
    }

    const index = ctx.attachments.findIndex(a => a.id === attachmentId);
    if (index === -1) return;

    const [removed] = ctx.attachments.splice(index, 1);
    render();

    try {
        await deleteAttachmentApi(ctx.taskId, attachmentId);
        notifyChange();
    } catch (error) {
        ctx.attachments.splice(index, 0, removed);
        render();
        els.toaster.error(error.message || 'Failed to remove file');
    }
}

function notifyChange() {
    ctx?.onChange?.([...ctx.attachments]);
}

function handlePanelClick(e) {
    const removeBtn = e.target.closest('.js-attachmentRemove');
    if (removeBtn) {
        e.preventDefault();
        removeAttachment(removeBtn.dataset.attachmentId);
        return;
    }

    const viewBtn = e.target.closest('.js-attachmentView');
    if (viewBtn) {
        e.preventDefault();
        const attachment = ctx?.attachments.find(a => a.id === viewBtn.dataset.attachmentId);
        if (attachment) openViewer(attachment);
    }
}

function handleFileInputChange(e) {
    const input = e.target.closest('.js-attachmentInput');
    if (!input) return;
    addFiles(Array.from(input.files || []));
    input.value = '';   // so picking the same file twice in a row still fires
}

/**
 * Opens the full-size viewer for one attachment. Images render as an <img>,
 * text is fetched and shown in a <pre>, PDFs get an <iframe>; anything else
 * only offers the download link.
 * @param {Object} attachment
 */
async function openViewer(attachment) {
    if (!els?.attachmentModal || !ctx) return;

    const url = attachmentUrl(ctx.taskId, attachment.id);
    const downloadHref = attachmentUrl(ctx.taskId, attachment.id, { download: true });

    els.attachmentModalTitle.textContent = attachment.name;
    els.attachmentOpen.href = url;
    els.attachmentDownload.href = downloadHref;
    els.attachmentDownload.setAttribute('download', attachment.name);

    const body = els.attachmentViewerBody;
    if (attachment.mime.startsWith('image/')) {
        body.innerHTML = `<img class="attachmentViewer__image" src="${escapeHtml(url)}" alt="${escapeHtml(attachment.name)}">`;
    } else if (attachment.mime === 'application/pdf') {
        body.innerHTML = `<iframe class="attachmentViewer__frame" src="${escapeHtml(url)}" title="${escapeHtml(attachment.name)}"></iframe>`;
    } else if (attachment.mime === 'text/plain') {
        body.innerHTML = '<div class="attachmentViewer__loading">Loading…</div>';
        try {
            const text = await fetch(url).then(r => r.text());
            body.innerHTML = `<pre class="attachmentViewer__text">${escapeHtml(text)}</pre>`;
        } catch {
            body.innerHTML = '<div class="attachmentViewer__loading">Could not read this file.</div>';
        }
    } else {
        body.innerHTML = `<div class="attachmentViewer__loading">No preview for ${escapeHtml(attachment.mime)}. Use Download to open it.</div>`;
    }

    els.attachmentModal.open();
}

/** Repaints the panel from the current context. */
function render() {
    if (!ctx || !els?.attachments) return;

    const total = ctx.attachments.length + ctx.pending.length;
    updateTabCount(total);

    const items = [
        ...ctx.attachments.map(a => savedItemHtml(ctx.taskId, a)),
        ...ctx.pending.map(p => pendingItemHtml(p))
    ];

    const uploadingHtml = ctx.uploading > 0
        ? `<div class="attachments__status">Uploading ${ctx.uploading} file${ctx.uploading === 1 ? '' : 's'}…</div>`
        : '';

    const hint = ctx.taskId
        ? 'Drop files anywhere on this dialog, or paste a screenshot.'
        : 'Files are attached when you save the task. Drop them anywhere on this dialog, or paste a screenshot.';

    els.attachments.innerHTML = `
        <div class="attachments__dropZone">
            <span class="attachments__hint">${hint}</span>
            <label class="btn --secondary --sm attachments__browse">
                Browse files
                <input type="file" class="js-attachmentInput" multiple hidden>
            </label>
        </div>
        ${uploadingHtml}
        ${items.length ? `<div class="attachments__grid">${items.join('')}</div>` : ''}
    `;
}

/**
 * Markup for one saved attachment. Image types show a thumbnail served from
 * the download route; everything else shows an icon tile.
 *
 * Actions are design-system icon buttons (`.btn --ghost --icon --sm`) rather
 * than text links: three labelled buttons don't fit a 140px tile, and this is
 * the same vocabulary the rest of the app uses.
 */
function savedItemHtml(taskId, a) {
    const url = attachmentUrl(taskId, a.id);
    // No loading="lazy" here: the Files panel starts hidden behind the
    // Description tab, so a lazy image never enters the viewport and never
    // loads — the tile just shows a broken thumbnail. These are a handful of
    // small local files; deferring them buys nothing.
    const preview = a.mime.startsWith('image/')
        ? `<img class="attachments__thumb" src="${escapeHtml(url)}" alt="">`
        : `<span class="attachments__fileIcon"><svg-icon icon="folder" size="20"></svg-icon></span>`;
    const viewable = isViewableAttachment(a);

    return `
        <figure class="attachments__item">
            <button type="button"
                    class="attachments__preview js-attachmentView"
                    data-attachment-id="${escapeHtml(a.id)}"
                    ${viewable ? '' : 'disabled'}
                    title="${viewable ? 'Open preview' : 'No preview available'}">
                ${preview}
            </button>
            <figcaption class="attachments__meta">
                <span class="attachments__name" title="${escapeHtml(a.name)}">${escapeHtml(a.name)}</span>
                <span class="attachments__size">${formatBytes(a.size)}</span>
            </figcaption>
            <div class="attachments__actions">
                <a class="btn --ghost --icon --sm"
                   href="${escapeHtml(url)}" target="_blank" rel="noopener"
                   title="Open in new tab" aria-label="Open ${escapeHtml(a.name)} in a new tab">
                    <svg-icon icon="box-arrow-in-up-right" size="14"></svg-icon>
                </a>
                <a class="btn --ghost --icon --sm"
                   href="${escapeHtml(attachmentUrl(taskId, a.id, { download: true }))}"
                   download="${escapeHtml(a.name)}"
                   title="Download" aria-label="Download ${escapeHtml(a.name)}">
                    <svg-icon icon="download" size="14"></svg-icon>
                </a>
                <button type="button"
                        class="btn --ghost --icon --sm --removeAction js-attachmentRemove"
                        data-attachment-id="${escapeHtml(a.id)}"
                        title="Remove" aria-label="Remove ${escapeHtml(a.name)}">
                    <svg-icon icon="trash" size="14"></svg-icon>
                </button>
            </div>
        </figure>
    `;
}

/** Markup for a file queued against a task that doesn't exist yet. */
function pendingItemHtml(p) {
    const preview = p.previewUrl
        ? `<img class="attachments__thumb" src="${escapeHtml(p.previewUrl)}" alt="">`
        : `<span class="attachments__fileIcon"><svg-icon icon="folder" size="20"></svg-icon></span>`;

    return `
        <figure class="attachments__item --pending">
            <span class="attachments__preview">${preview}</span>
            <figcaption class="attachments__meta">
                <span class="attachments__name" title="${escapeHtml(p.file.name)}">${escapeHtml(p.file.name)}</span>
                <span class="attachments__size">${formatBytes(p.file.size)} · pending</span>
            </figcaption>
            <div class="attachments__actions">
                <button type="button"
                        class="btn --ghost --icon --sm --removeAction js-attachmentRemove"
                        data-attachment-id="${escapeHtml(p.tempId)}"
                        title="Remove" aria-label="Remove ${escapeHtml(p.file.name)}">
                    <svg-icon icon="trash" size="14"></svg-icon>
                </button>
            </div>
        </figure>
    `;
}
