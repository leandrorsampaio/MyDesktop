/**
 * Filters module for Task Tracker.
 * Handles category, priority, and epic filtering of task cards.
 */

import { activeCategoryFilters, priorityFilterActive, setPriorityFilterActive, activeEpicFilter, setActiveEpicFilter, epics, categories } from './state.js';

/**
 * Renders the category filter picker with all available categories.
 * Hides the picker if only the default category (id=1) exists.
 * @param {HTMLElement} pickerEl - The custom-picker element
 */
export function renderCategoryFilters(pickerEl) {
    // Hide if only the default "Non categorized" category exists
    const nonDefaultCategories = categories.filter(c => c.id !== 1);
    if (nonDefaultCategories.length === 0) {
        pickerEl.style.display = 'none';
        return;
    }
    pickerEl.style.display = '';

    const items = [
        { value: '', label: 'All categories' },
        ...categories.map(cat => ({ value: String(cat.id), label: cat.name, icon: cat.icon }))
    ];
    pickerEl.setItems(items);

    // Reflect current filter state
    const activeId = activeCategoryFilters.size === 1
        ? String([...activeCategoryFilters][0])
        : '';
    pickerEl.value = activeId;
}

/**
 * Handles category filter picker change.
 * @param {HTMLElement} pickerEl - The custom-picker element
 * @param {Function} applyFilters - Function to apply all filters
 */
export function handleCategoryFilterChange(pickerEl, applyFilters) {
    const value = pickerEl.value;
    activeCategoryFilters.clear();
    if (value) {
        activeCategoryFilters.add(Number(value));
    }
    applyFilters();
}

/**
 * Toggles the priority filter on or off.
 * @param {HTMLElement} priorityBtn - The priority filter button element
 * @param {Function} applyFilters - Function to apply all filters after toggle
 */
export function togglePriorityFilter(priorityBtn, applyFilters) {
    setPriorityFilterActive(!priorityFilterActive);
    priorityBtn.classList.toggle('--active', priorityFilterActive);
    applyFilters();
}

/**
 * Applies all active filters (category, priority, epic) to task cards.
 * Queries through kanban-column Shadow DOMs to find task-card elements.
 * Cards that don't match active filters are hidden via the hidden attribute.
 */
export function applyAllFilters() {
    // Task cards are inside kanban-column Shadow DOMs, so we need to query through them
    const columns = document.querySelectorAll('kanban-column');
    const cards = Array.from(columns).flatMap(col =>
        Array.from(col.shadowRoot?.querySelectorAll('task-card') || [])
    );
    const hasCategoryFilters = activeCategoryFilters.size > 0;

    cards.forEach(card => {
        let hidden = false;

        // Category filter
        if (hasCategoryFilters) {
            const cardCategory = Number(card.dataset.category);
            if (!activeCategoryFilters.has(cardCategory)) {
                hidden = true;
            }
        }

        // Priority filter
        if (priorityFilterActive && card.dataset.priority !== 'true') {
            hidden = true;
        }

        // Epic filter
        if (activeEpicFilter) {
            const cardEpicId = card.dataset.epicId || '';
            if (cardEpicId !== activeEpicFilter) {
                hidden = true;
            }
        }

        card.hidden = hidden;
    });
}

/**
 * Renders the epic filter picker with all available epics.
 * @param {HTMLElement} pickerEl - The custom-picker element
 */
export function renderEpicFilter(pickerEl) {
    const items = [
        { value: '', label: 'All epics' },
        ...epics.map(epic => ({ value: epic.id, label: epic.name, color: epic.color }))
    ];
    pickerEl.setItems(items);
    pickerEl.value = activeEpicFilter || '';
}

/**
 * Handles epic filter picker change.
 * @param {HTMLElement} pickerEl - The custom-picker element
 * @param {Function} applyFilters - Function to apply all filters
 */
export function handleEpicFilterChange(pickerEl, applyFilters) {
    const value = pickerEl.value || null;
    setActiveEpicFilter(value);
    applyFilters();
}
