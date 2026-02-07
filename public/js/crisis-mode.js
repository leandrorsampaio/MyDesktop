/**
 * Crisis Mode module for Task Tracker.
 * Handles the emergency focus mode that shows only priority tasks with urgent visual cues.
 */

import { crisisModeActive, originalTitle, setCrisisModeActive, setOriginalTitle } from './state.js';
import { setPriorityFilter, applyAllFilters } from './filters.js';

/**
 * Generates a red star favicon as a data URL using canvas.
 * Used as the favicon during crisis mode.
 * @returns {string} Data URL of the red star PNG image
 */
export function generateRedStarFavicon() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    // Draw a red star
    ctx.fillStyle = '#C0392B';
    ctx.beginPath();
    const cx = 32, cy = 32, outerR = 30, innerR = 12, points = 5;
    for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = (Math.PI / 2 * 3) + (Math.PI / points) * i;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    return canvas.toDataURL('image/png');
}

/**
 * Updates the page favicon to the specified URL.
 * @param {string} url - The favicon URL (can be a path or data URL)
 */
export function setFavicon(url) {
    let link = document.querySelector('link[rel="icon"]');
    if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.appendChild(link);
    }
    link.type = 'image/png';
    link.href = url;
}

/**
 * Toggles crisis mode on or off.
 * Crisis mode: activates priority filter, red border, hides toolbar/done column/checklist,
 * changes title to "!!!", and shows red star favicon.
 * @param {Object} elements - Object containing DOM element references
 * @param {HTMLElement} elements.priorityFilterBtn - Priority filter button
 * @param {HTMLElement} elements.crisisModeBtn - Crisis mode menu button
 * @param {Function} closeMenu - Function to close the dropdown menu
 */
export function toggleCrisisMode(elements, closeMenu) {
    closeMenu();
    setCrisisModeActive(!crisisModeActive);

    if (crisisModeActive) {
        // Save original state
        setOriginalTitle(document.title);

        // Activate priority filter
        setPriorityFilter(true, elements.priorityFilterBtn);
        applyAllFilters();

        // Visual changes
        document.body.classList.add('--crisisMode');
        document.title = '!!!';
        setFavicon(generateRedStarFavicon());

        // Update menu button text
        elements.crisisModeBtn.innerHTML = '<span class="navMenu__icon">🚨</span> Exit Crisis Mode';
    } else {
        // Deactivate priority filter
        setPriorityFilter(false, elements.priorityFilterBtn);
        applyAllFilters();

        // Restore visuals
        document.body.classList.remove('--crisisMode');
        document.title = originalTitle;
        setFavicon('favicon.png');

        // Restore menu button text
        elements.crisisModeBtn.innerHTML = '<span class="navMenu__icon">🚨</span> Crisis Mode';
    }
}
