/**
 * Board Configuration module for Task Tracker.
 * Handles the "Board Configuration" modal: add, rename, reorder and delete columns.
 */

import { MAX_COLUMNS } from './constants.js';
import { escapeHtml } from './utils.js';
import { columns, setColumns } from './state.js';
import {
    fetchColumnsApi,
    createColumnApi,
    updateColumnApi,
    deleteColumnApi,
    reorderColumnsApi
} from './api.js';

/** @type {{columnId: string, elements: Object, onColumnsChanged: Function}|null} */
let pendingColumnDelete = null;

/**
 * Opens the board configuration modal.
 * @param {Object} elements - DOM element references
 * @param {Function} closeMenu - Function to close dropdown menu
 * @param {Function} onColumnsChanged - Callback when columns are modified (re-renders board)
 */
export async function openBoardConfigModal(elements, closeMenu, onColumnsChanged) {
    closeMenu();
    try {
        const fetched = await fetchColumnsApi();
        setColumns(fetched);
        renderBoardConfigEditor(elements, onColumnsChanged);
        elements.boardConfigModal.open();
    } catch (error) {
        elements.toaster.error('Failed to load board configuration');
    }
}

/**
 * Renders the board config editor (form + column list).
 * @param {Object} elements - DOM element references
 * @param {Function} onColumnsChanged - Callback when columns are modified
 */
function renderBoardConfigEditor(elements, onColumnsChanged) {
    elements.columnNameInput.value = '';
    elements.columnError.style.display = 'none';

    elements.columnAddBtn.onclick = async () => {
        const name = elements.columnNameInput.value.trim();
        if (!name) {
            elements.toaster.warning('Column name is required');
            return;
        }
        if (columns.length >= MAX_COLUMNS) {
            elements.toaster.warning(`Maximum of ${MAX_COLUMNS} columns allowed`);
            return;
        }

        const result = await createColumnApi({ name });
        if (result.ok) {
            const fetched = await fetchColumnsApi();
            setColumns(fetched);
            renderBoardConfigEditor(elements, onColumnsChanged);
            onColumnsChanged();
            elements.toaster.success(`Column "${name}" added`);
        } else {
            elements.columnError.textContent = result.error;
            elements.columnError.style.display = 'block';
        }
    };

    renderColumnsList(elements, onColumnsChanged);
}

/**
 * Renders the list of columns with drag-and-drop reordering.
 *
 * DRAG-AND-DROP PATTERN:
 * This follows the same HTML5 drag-and-drop approach used in
 * /public/components/kanban-column/kanban-column.js (handleDragOver,
 * handleDrop, drop indicator). If you modify the core DnD logic there,
 * review this file for consistency.
 *
 * @param {Object} elements - DOM element references
 * @param {Function} onColumnsChanged - Callback when columns are modified
 */
function renderColumnsList(elements, onColumnsChanged) {
    const list = elements.columnsList;

    if (columns.length === 0) {
        list.innerHTML = '<div class="emptyState">No columns configured</div>';
        return;
    }

    list.innerHTML = columns.map((col, idx) => `
        <div class="boardConfigEditor__item" data-col-id="${col.id}" draggable="true">
            <span class="boardConfigEditor__dragHandle" title="Drag to reorder">⠿</span>
            <span class="boardConfigEditor__badge ${idx === 0 ? '--default' : ''}" title="${idx === 0 ? 'Default column' : ''}">
                ${idx === 0 ? 'Default' : ''}
            </span>
            <input type="text"
                   class="boardConfigEditor__itemName js-colItemName"
                   value="${escapeHtml(col.name)}"
                   data-col-id="${col.id}" />
            <label class="boardConfigEditor__archiveToggle" title="Show Archive button on this column">
                <input type="checkbox"
                       class="js-colArchiveToggle"
                       data-col-id="${col.id}"
                       ${col.hasArchive ? 'checked' : ''} />
                <span>Archive btn</span>
            </label>
            <button class="boardConfigEditor__deleteBtn js-colDeleteBtn"
                    data-col-id="${col.id}"
                    title="Delete column">&times;</button>
        </div>
    `).join('');

    // --- Drag-and-drop reordering ---
    // Pattern mirrors kanban-column.js drag-and-drop (see file header comment).
    let dragSrcId = null;

    list.querySelectorAll('.boardConfigEditor__item').forEach(item => {
        item.addEventListener('dragstart', (e) => {
            dragSrcId = item.dataset.colId;
            item.classList.add('--dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', dragSrcId);
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('--dragging');
            list.querySelectorAll('.boardConfigEditor__item').forEach(i => {
                i.classList.remove('--dragOver');
            });
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            // Highlight the target row
            list.querySelectorAll('.boardConfigEditor__item').forEach(i => i.classList.remove('--dragOver'));
            item.classList.add('--dragOver');
        });

        item.addEventListener('dragleave', (e) => {
            if (!item.contains(e.relatedTarget)) {
                item.classList.remove('--dragOver');
            }
        });

        item.addEventListener('drop', async (e) => {
            e.preventDefault();
            item.classList.remove('--dragOver');
            const targetId = item.dataset.colId;
            if (!dragSrcId || dragSrcId === targetId) return;

            // Reorder in memory
            const srcIdx = columns.findIndex(c => c.id === dragSrcId);
            const tgtIdx = columns.findIndex(c => c.id === targetId);
            if (srcIdx === -1 || tgtIdx === -1) return;

            const reordered = [...columns];
            const [moved] = reordered.splice(srcIdx, 1);
            reordered.splice(tgtIdx, 0, moved);

            // Optimistic: update UI immediately
            setColumns(reordered.map((c, i) => ({ ...c, order: i })));
            renderColumnsList(elements, onColumnsChanged);

            // Persist
            const result = await reorderColumnsApi(reordered);
            if (result.ok) {
                setColumns(result.data);
                renderColumnsList(elements, onColumnsChanged);
                onColumnsChanged();
            } else {
                // Rollback
                const fetched = await fetchColumnsApi();
                setColumns(fetched);
                renderColumnsList(elements, onColumnsChanged);
                elements.toaster.error('Failed to reorder columns. Changes reverted.');
            }
        });
    });

    // --- Name rename (blur to save) ---
    list.querySelectorAll('.js-colItemName').forEach(input => {
        input.addEventListener('blur', async () => {
            const colId = input.dataset.colId;
            const name = input.value.trim();
            if (!name) {
                elements.toaster.warning('Column name cannot be empty');
                const col = columns.find(c => c.id === colId);
                if (col) input.value = col.name;
                return;
            }
            const result = await updateColumnApi(colId, { name });
            if (result.ok) {
                const fetched = await fetchColumnsApi();
                setColumns(fetched);
                renderColumnsList(elements, onColumnsChanged);
                onColumnsChanged();
            } else {
                elements.toaster.error(result.error || 'Failed to rename column');
            }
        });
    });

    // --- Archive toggle ---
    list.querySelectorAll('.js-colArchiveToggle').forEach(checkbox => {
        checkbox.addEventListener('change', async () => {
            const colId = checkbox.dataset.colId;
            const result = await updateColumnApi(colId, { hasArchive: checkbox.checked });
            if (result.ok) {
                const fetched = await fetchColumnsApi();
                setColumns(fetched);
                renderColumnsList(elements, onColumnsChanged);
                onColumnsChanged();
                elements.toaster.success(checkbox.checked ? 'Archive button enabled' : 'Archive button disabled');
            } else {
                elements.toaster.error(result.error || 'Failed to update column');
                checkbox.checked = !checkbox.checked; // Revert
            }
        });
    });

    // --- Delete buttons — open confirm modal ---
    list.querySelectorAll('.js-colDeleteBtn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (columns.length <= 1) {
                elements.toaster.error('Cannot delete the last column');
                return;
            }
            const colId = btn.dataset.colId;
            const col = columns.find(c => c.id === colId);
            pendingColumnDelete = { columnId: colId, elements, onColumnsChanged };
            elements.columnConfirmMessage.textContent =
                `Delete column "${col?.name || ''}"? All tasks in it will be moved to the first (default) column.`;
            elements.columnConfirmModal.open();
        });
    });
}

/**
 * Confirms and executes the pending column deletion.
 * Called by the column confirm modal's delete button.
 * @param {Object} elements - DOM element references
 */
export async function confirmDeleteColumn(elements) {
    if (!pendingColumnDelete) return;

    const { columnId, onColumnsChanged } = pendingColumnDelete;
    pendingColumnDelete = null;
    elements.columnConfirmModal.close();

    const result = await deleteColumnApi(columnId);
    if (result.ok) {
        const fetched = await fetchColumnsApi();
        setColumns(fetched);
        renderBoardConfigEditor(elements, onColumnsChanged);
        onColumnsChanged();
        const msg = result.data?.movedCount > 0
            ? `Column deleted. ${result.data.movedCount} task(s) moved to "${result.data.defaultColumnName}".`
            : 'Column deleted.';
        elements.toaster.success(msg);
    } else {
        elements.toaster.error(result.error || 'Failed to delete column');
    }
}
