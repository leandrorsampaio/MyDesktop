/**
 * Attachments — the bytes, and every path built to reach them.
 *
 * Files are stored on disk under `data/{alias}/attachments/{taskId}/`, named
 * from an id this server generated plus an extension from a fixed allowlist.
 * Nothing a user typed ever reaches the filesystem: the original filename is
 * kept in the task's JSON for display and in a Content-Disposition header for
 * download, and is used for neither the path nor the content type.
 *
 * That is the whole security posture, and it is why the id and extension are
 * re-validated in `attachmentFilePath` even though they were validated on the
 * way in — the record has been to disk and back since.
 *
 * @param {Object} deps
 * @param {string} deps.DATA_DIR - Root of the per-profile data directories.
 * @param {Function} deps.generateId - Ids for stored files; never derived from user input.
 * @returns {Object} Attachment constants and helpers.
 */
const fs = require('fs').promises;
const path = require('path');

module.exports = function createAttachments({ DATA_DIR, generateId }) {

    /** Largest single file accepted, in bytes. */
    const MAX_ATTACHMENT_SIZE = 5 * 1024 * 1024;          // 5 MB

    /** Most attachments one task may carry. */
    const MAX_ATTACHMENTS_PER_TASK = 20;

    /** Total attachment bytes one profile may store on disk. */
    const MAX_PROFILE_ATTACHMENT_BYTES = 200 * 1024 * 1024;  // 200 MB

    /**
     * MIME types stored as declared. `inline` marks the ones safe to render in the
     * browser rather than force-download.
     *
     * `image/svg+xml` is deliberately absent: an SVG served from this origin can
     * execute script against the app, and every download here is same-origin.
     * Anything not listed still uploads fine — it is just stored as
     * application/octet-stream and can only ever be downloaded, never rendered.
     */
    const ATTACHMENT_TYPES = {
        'image/png':       { ext: '.png',  inline: true  },
        'image/jpeg':      { ext: '.jpg',  inline: true  },
        'image/gif':       { ext: '.gif',  inline: true  },
        'image/webp':      { ext: '.webp', inline: true  },
        'image/avif':      { ext: '.avif', inline: true  },
        'application/pdf': { ext: '.pdf',  inline: true  },
        'text/plain':      { ext: '.txt',  inline: true  },
        'text/csv':        { ext: '.csv',  inline: false },
        'application/json':{ ext: '.json', inline: false },
        'application/zip': { ext: '.zip',  inline: false }
    };

    /** Fallback for any MIME type outside the allowlist. */
    const ATTACHMENT_FALLBACK = { mime: 'application/octet-stream', ext: '.bin', inline: false };

    /** Stored ids are base36 from generateId(); anything else never touches a path. */
    const ATTACHMENT_ID_REGEX = /^[a-z0-9]{1,32}$/;

    const ATTACHMENT_EXT_REGEX = /^\.[a-z0-9]{1,8}$/;

    /**
     * Builds a Content-Disposition header for a download. RFC 6266: the plain
     * `filename` carries an ASCII-safe fallback for old clients, `filename*`
     * carries the real UTF-8 name. Quotes and backslashes are stripped from the
     * fallback so a crafted name can't inject extra header parameters.
     * @param {boolean} inline - Render in the browser instead of downloading.
     * @param {string} name - Original filename.
     * @returns {string}
     */
    function buildContentDisposition(inline, name) {
        const safeName = String(name || 'attachment')
            .replace(/[^\x20-\x7e]/g, '_')
            .replace(/["\\]/g, '_');
        const disposition = inline ? 'inline' : 'attachment';
        return `${disposition}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(name || 'attachment')}`;
    }

    /** Directory holding one task's attachment files. */
    function attachmentsDir(alias, taskId) {
        return path.join(DATA_DIR, alias, 'attachments', taskId);
    }

    /**
     * Absolute path of one stored attachment, or null when the metadata record is
     * malformed. Both components are re-validated here so a hand-edited JSON file
     * can't build a path outside the attachments directory.
     * @param {string} alias
     * @param {string} taskId
     * @param {{id: string, ext: string}} attachment
     * @returns {string|null}
     */
    function attachmentFilePath(alias, taskId, attachment) {
        const id = attachment && attachment.id;
        const ext = (attachment && attachment.ext) || ATTACHMENT_FALLBACK.ext;
        if (!ATTACHMENT_ID_REGEX.test(id || '') || !ATTACHMENT_EXT_REGEX.test(ext)) return null;
        return path.join(attachmentsDir(alias, taskId), id + ext);
    }

    /**
     * Total bytes currently stored under a profile's attachments directory.
     * Measured from disk rather than summed from metadata so orphaned files still
     * count against the budget — this guards disk usage, not bookkeeping.
     * @param {string} alias
     * @returns {Promise<number>}
     */
    async function profileAttachmentBytes(alias) {
        const root = path.join(DATA_DIR, alias, 'attachments');
        let taskDirs;
        try {
            taskDirs = await fs.readdir(root, { withFileTypes: true });
        } catch {
            return 0;   // no attachments directory yet
        }

        let total = 0;
        for (const dirent of taskDirs) {
            if (!dirent.isDirectory()) continue;
            const dir = path.join(root, dirent.name);
            let files;
            try {
                files = await fs.readdir(dir, { withFileTypes: true });
            } catch {
                continue;
            }
            for (const file of files) {
                if (!file.isFile()) continue;
                try {
                    total += (await fs.stat(path.join(dir, file.name))).size;
                } catch { /* vanished mid-walk — not our problem */ }
            }
        }
        return total;
    }

    /**
     * Removes a task's whole attachment directory. Best effort: a failure here
     * leaves disk clutter but never breaks the delete that triggered it.
     * @param {string} alias
     * @param {string} taskId
     */
    async function removeTaskAttachments(alias, taskId) {
        try {
            await fs.rm(attachmentsDir(alias, taskId), { recursive: true, force: true });
        } catch (err) {
            console.warn(`Attachment cleanup failed for task ${taskId}:`, err.message);
        }
    }

    /**
     * Re-keys a task's attachment directory when the task itself gets a new id
     * (promoting a staged task creates a new board/backlog task). Returns the
     * attachment metadata to copy onto the new task, or an empty array.
     * @param {string} alias
     * @param {string} fromTaskId
     * @param {string} toTaskId
     * @param {Array|undefined} attachments
     * @returns {Promise<Array>}
     */
    async function moveTaskAttachments(alias, fromTaskId, toTaskId, attachments) {
        const list = Array.isArray(attachments) ? attachments : [];
        if (list.length === 0) return [];
        try {
            await fs.rename(attachmentsDir(alias, fromTaskId), attachmentsDir(alias, toTaskId));
            return list;
        } catch (err) {
            // The files stayed put but the task they belonged to is gone — drop the
            // metadata rather than hand the new task a list of dead links.
            console.warn(`Attachment move failed ${fromTaskId} -> ${toTaskId}:`, err.message);
            return [];
        }
    }

    return {
        // The upload and download routes both need the fallback, for a type
        // that is not on the allowlist: stored as octet-stream, served as a
        // download rather than inline.
        ATTACHMENT_FALLBACK,
        MAX_ATTACHMENT_SIZE,
        MAX_ATTACHMENTS_PER_TASK,
        MAX_PROFILE_ATTACHMENT_BYTES,
        ATTACHMENT_TYPES,
        buildContentDisposition,
        attachmentsDir,
        attachmentFilePath,
        profileAttachmentBytes,
        removeTaskAttachments,
        moveTaskAttachments
    };
};
