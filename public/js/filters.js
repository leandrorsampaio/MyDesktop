/**
 * Filters module for Task Tracker.
 * Handles category and priority filtering of task cards.
 */

import { CATEGORIES } from './constants.js';
import { activeCategoryFilters, priorityFilterActive, setPriorityFilterActive } from './state.js';

/**
 * Renders category filter buttons in the toolbar.
 * @param {HTMLElement} container - The container element for filter buttons
 * @param {Function} onToggle - Callback function when a filter is toggled
 */
export function renderCategoryFilters(container, onToggle) {
    container.innerHTML = '';

    Object.entries(CATEGORIES).forEach(([id, label]) => {
        const btn = document.createElement('button');
        btn.className = 'toolbar__categoryBtn js-categoryFilterBtn';
        btn.dataset.category = id;
        btn.textContent = label;
        if (activeCategoryFilters.has(Number(id))) {
            btn.classList.add('--active');
        }
        btn.addEventListener('click', () => onToggle(Number(id)));
        container.appendChild(btn);
    });
}

/**
 * Toggles a category filter on or off.
 * @param {number} categoryId - The category ID to toggle (1-6)
 * @param {HTMLElement} filtersContainer - The container with filter buttons
 * @param {Function} applyFilters - Function to apply all filters after toggle
 */
export function toggleCategoryFilter(categoryId, filtersContainer, applyFilters) {
    if (activeCategoryFilters.has(categoryId)) {
        activeCategoryFilters.delete(categoryId);
    } else {
        activeCategoryFilters.add(categoryId);
    }

    // Update button states
    filtersContainer.querySelectorAll('.toolbar__categoryBtn').forEach(btn => {
        btn.classList.toggle('--active', activeCategoryFilters.has(Number(btn.dataset.category)));
    });

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
 * Applies all active filters (category and priority) to task cards.
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

        card.hidden = hidden;
    });
}

/**
 * Sets the priority filter to a specific state (used by crisis mode).
 * @param {boolean} active - Whether priority filter should be active
 * @param {HTMLElement} priorityBtn - The priority filter button element
 */
export function setPriorityFilter(active, priorityBtn) {
    setPriorityFilterActive(active);
    priorityBtn.classList.toggle('--active', active);
}
