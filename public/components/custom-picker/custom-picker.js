/**
 * Custom Picker Component
 *
 * A unified picker for colors, icons, and list items, replacing native <select>
 * elements with a popover panel showing swatches, icon tiles, or a scrollable list.
 *
 * Usage:
 *   <custom-picker type="color" placeholder="Select color" columns="5"></custom-picker>
 *   <custom-picker type="icon" placeholder="Select icon" columns="7"></custom-picker>
 *   <custom-picker type="list" placeholder="Choose an epic" size="compact"></custom-picker>
 *
 * Attributes:
 *   - type: "color", "icon", or "list"
 *   - placeholder: trigger button text when nothing selected (default: "Select")
 *   - columns: number of grid columns for color/icon modes (default: 5)
 *   - size: "compact" for smaller toolbar usage, omit for default modal size
 *
 * JS API:
 *   - setItems(items) — array of {value, label, color?, disabled?}
 *   - value getter/setter — current selected value
 *   - clear() — reset selection
 *
 * Events:
 *   - change — CustomEvent with detail: {value, label}, bubbles + composed
 */

class CustomPicker extends HTMLElement {
    static templateCache = null;

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        this._items = [];
        this._value = '';
        this._open = false;
        this._onDocClick = this._handleDocClick.bind(this);
    }

    connectedCallback() {
        this._render();
        document.addEventListener('click', this._onDocClick, true);
    }

    disconnectedCallback() {
        document.removeEventListener('click', this._onDocClick, true);
    }

    get value() {
        return this._value;
    }

    set value(val) {
        this._value = val;
        this._updateTrigger();
        this._updateSelection();
    }

    /**
     * Sets the available items for the picker.
     * @param {Array<{value: string, label: string, color?: string, disabled?: boolean}>} items
     */
    setItems(items) {
        this._items = items;
        this._renderPanel();
        this._updateTrigger();
    }

    /** Resets the current selection. */
    clear() {
        this._value = '';
        this._updateTrigger();
        this._updateSelection();
    }

    _getType() {
        return this.getAttribute('type') || 'color';
    }

    _getPlaceholder() {
        return this.getAttribute('placeholder') || 'Select';
    }

    _getColumns() {
        return parseInt(this.getAttribute('columns'), 10) || 5;
    }

    _render() {
        const type = this._getType();
        const columns = this._getColumns();

        this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: inline-block;
                    position: relative;
                    font-family: inherit;
                }
                .customPicker__trigger {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 14px;
                    border: 1px solid var(--color-border, #e5e7eb);
                    border-radius: var(--radius-md, 6px);
                    background-color: var(--color-bg-primary, #ffffff);
                    color: var(--color-text-primary, #111827);
                    font-size: 14px;
                    font-family: inherit;
                    cursor: pointer;
                    transition: border-color 0.15s, box-shadow 0.15s;
                    min-width: 140px;
                    text-align: left;
                    width: 100%;
                }
                :host([size="compact"]) .customPicker__trigger {
                    padding: 6px 10px;
                    font-size: 11px;
                    font-weight: 600;
                    min-width: auto;
                    border-radius: var(--radius-sm, 4px);
                    border: none;
                    background-color: transparent;
                    color: var(--color-text-tertiary, #9ca3af);
                }
                .customPicker__trigger:hover {
                    border-color: var(--color-text-tertiary, #9ca3af);
                }
                :host([size="compact"]) .customPicker__trigger:hover {
                    background: var(--color-bg-tertiary, #f3f4f6);
                    color: var(--color-text-secondary, #4b5563);
                }
                .customPicker__trigger:focus {
                    outline: none;
                    border-color: var(--color-accent-primary, #1a73e8);
                    box-shadow: 0 0 0 3px rgba(26, 115, 232, 0.12);
                }
                :host([size="compact"]) .customPicker__trigger:focus {
                    box-shadow: none;
                    background: var(--color-bg-tertiary, #f3f4f6);
                }
                .customPicker__triggerSwatch {
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    flex-shrink: 0;
                }
                :host([size="compact"]) .customPicker__triggerSwatch {
                    width: 10px;
                    height: 10px;
                }
                .customPicker__triggerDot {
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                    flex-shrink: 0;
                }
                :host([size="compact"]) .customPicker__triggerDot {
                    width: 8px;
                    height: 8px;
                }
                .customPicker__triggerLabel {
                    flex: 1;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .customPicker__triggerLabel.--placeholder {
                    color: var(--color-text-tertiary, #9ca3af);
                }
                .customPicker__chevron {
                    font-size: 10px;
                    color: var(--color-text-tertiary, #9ca3af);
                    flex-shrink: 0;
                    transition: transform 0.15s;
                }
                :host(.--active) .customPicker__chevron {
                    transform: rotate(180deg);
                }
                .customPicker__panel {
                    position: absolute;
                    top: calc(100% + 6px);
                    left: 0;
                    z-index: 200;
                    background: var(--color-bg-primary, #ffffff);
                    border: 1px solid var(--color-border, #e5e7eb);
                    border-radius: var(--radius-lg, 8px);
                    box-shadow: var(--shadow-md, 0 4px 12px rgba(0, 0, 0, 0.1));
                    padding: 12px;
                    opacity: 0;
                    visibility: hidden;
                    transform: translateY(-8px);
                    transition: opacity 0.15s, transform 0.15s, visibility 0.15s;
                    min-width: 100%;
                }
                :host(.--active) .customPicker__panel {
                    opacity: 1;
                    visibility: visible;
                    transform: translateY(0);
                }
                .customPicker__grid {
                    display: grid;
                    grid-template-columns: repeat(${columns}, 1fr);
                    gap: 6px;
                }
                /* Color mode cells */
                .customPicker__cell {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    border: none;
                    background: none;
                    padding: 4px;
                    border-radius: 8px;
                    transition: transform 0.15s, background-color 0.15s;
                    position: relative;
                }
                .customPicker__cell:hover:not(.--disabled) {
                    transform: scale(1.15);
                    background-color: rgba(0, 0, 0, 0.04);
                }
                .customPicker__cell.--selected {
                    background-color: rgba(26, 115, 232, 0.08);
                }
                .customPicker__cell.--disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }
                /* Color swatch */
                .customPicker__swatch {
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    transition: box-shadow 0.15s;
                }
                .customPicker__cell.--selected .customPicker__swatch {
                    box-shadow: 0 0 0 3px #FFFFFF, 0 0 0 5px var(--color-accent-primary, #1a73e8);
                }
                /* Icon mode cells */
                .customPicker__cell.--icon {
                    width: 40px;
                    height: 40px;
                    border-radius: 8px;
                }
                .customPicker__cell.--icon.--selected {
                    background-color: rgba(26, 115, 232, 0.1);
                }
                .customPicker__cell.--icon:hover:not(.--disabled) {
                    background-color: rgba(0, 0, 0, 0.06);
                }
                /* Tooltip */
                .customPicker__cell::after {
                    content: attr(title);
                    position: absolute;
                    bottom: calc(100% + 4px);
                    left: 50%;
                    transform: translateX(-50%);
                    background: rgba(45, 45, 45, 0.9);
                    color: #fff;
                    font-size: 11px;
                    padding: 4px 8px;
                    border-radius: 6px;
                    white-space: nowrap;
                    pointer-events: none;
                    opacity: 0;
                    transition: opacity 0.15s;
                    z-index: 10;
                }
                .customPicker__cell:hover::after {
                    opacity: 1;
                }
                /* List mode */
                .customPicker__list {
                    display: flex;
                    flex-direction: column;
                    max-height: 200px;
                    overflow-y: auto;
                    min-width: 180px;
                }
                .customPicker__listItem {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 8px 12px;
                    border: none;
                    background: none;
                    border-radius: var(--radius-sm, 4px);
                    cursor: pointer;
                    font-family: inherit;
                    font-size: 13px;
                    color: var(--color-text-primary, #111827);
                    transition: background-color 0.15s;
                    text-align: left;
                    width: 100%;
                }
                .customPicker__listItem:hover:not(.--disabled) {
                    background-color: rgba(26, 115, 232, 0.06);
                }
                .customPicker__listItem.--selected {
                    background-color: rgba(26, 115, 232, 0.08);
                    font-weight: 600;
                }
                .customPicker__listItem.--disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }
                .customPicker__listDot {
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                    flex-shrink: 0;
                }
                .customPicker__listLabel {
                    flex: 1;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                /* Scrollbar inside panel */
                .customPicker__list::-webkit-scrollbar {
                    width: 6px;
                }
                .customPicker__list::-webkit-scrollbar-track {
                    background: rgba(0, 0, 0, 0.03);
                    border-radius: 3px;
                }
                .customPicker__list::-webkit-scrollbar-thumb {
                    background: rgba(0, 0, 0, 0.12);
                    border-radius: 3px;
                }
            </style>
            <button class="customPicker__trigger" type="button">
                <span class="customPicker__triggerLabel --placeholder">${this._getPlaceholder()}</span>
                <span class="customPicker__chevron">&#9662;</span>
            </button>
            <div class="customPicker__panel">
                <div class="${type === 'list' ? 'customPicker__list' : 'customPicker__grid'}"></div>
            </div>
        `;

        this.shadowRoot.querySelector('.customPicker__trigger').addEventListener('click', (e) => {
            e.stopPropagation();
            this._toggle();
        });
    }

    _toggle() {
        this._open = !this._open;
        this.classList.toggle('--active', this._open);
    }

    _close() {
        this._open = false;
        this.classList.remove('--active');
    }

    _handleDocClick(e) {
        if (!this._open) return;
        if (!this.contains(e.target) && !this.shadowRoot.contains(e.target)) {
            this._close();
        }
    }

    _renderPanel() {
        const type = this._getType();
        if (type === 'list') {
            this._renderList();
        } else {
            this._renderGrid();
        }
    }

    _renderGrid() {
        const grid = this.shadowRoot.querySelector('.customPicker__grid');
        if (!grid) return;
        grid.innerHTML = '';

        const type = this._getType();

        this._items.forEach(item => {
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'customPicker__cell';
            if (type === 'icon') cell.classList.add('--icon');
            if (item.disabled) cell.classList.add('--disabled');
            if (item.value === this._value) cell.classList.add('--selected');

            const tooltipLabel = item.disabled ? `${item.label} (taken)` : item.label;
            cell.title = tooltipLabel;

            if (type === 'color') {
                const swatch = document.createElement('span');
                swatch.className = 'customPicker__swatch';
                swatch.style.backgroundColor = item.value;
                cell.appendChild(swatch);
            } else {
                const icon = document.createElement('svg-icon');
                icon.setAttribute('icon', item.value);
                icon.setAttribute('size', '20');
                cell.appendChild(icon);
            }

            cell.addEventListener('click', (e) => {
                e.stopPropagation();
                if (item.disabled) return;
                this._selectItem(item);
            });

            grid.appendChild(cell);
        });
    }

    _renderList() {
        const list = this.shadowRoot.querySelector('.customPicker__list');
        if (!list) return;
        list.innerHTML = '';

        this._items.forEach(item => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'customPicker__listItem';
            if (item.disabled) btn.classList.add('--disabled');
            if (item.value === this._value) btn.classList.add('--selected');

            if (item.color) {
                const dot = document.createElement('span');
                dot.className = 'customPicker__listDot';
                dot.style.backgroundColor = item.color;
                btn.appendChild(dot);
            }

            const label = document.createElement('span');
            label.className = 'customPicker__listLabel';
            label.textContent = item.label;
            btn.appendChild(label);

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (item.disabled) return;
                this._selectItem(item);
            });

            list.appendChild(btn);
        });
    }

    _selectItem(item) {
        this._value = item.value;
        this._updateTrigger();
        this._updateSelection();
        this._close();
        this.dispatchEvent(new CustomEvent('change', {
            detail: { value: item.value, label: item.label },
            bubbles: true,
            composed: true
        }));
    }

    _updateTrigger() {
        const trigger = this.shadowRoot.querySelector('.customPicker__trigger');
        if (!trigger) return;

        const type = this._getType();
        const selected = this._items.find(i => i.value === this._value);

        // Remove old preview elements
        const oldSwatch = trigger.querySelector('.customPicker__triggerSwatch');
        if (oldSwatch) oldSwatch.remove();
        const oldDot = trigger.querySelector('.customPicker__triggerDot');
        if (oldDot) oldDot.remove();
        const oldIcon = trigger.querySelector('svg-icon');
        if (oldIcon) oldIcon.remove();

        const label = trigger.querySelector('.customPicker__triggerLabel');

        if (selected) {
            label.textContent = selected.label;
            label.classList.remove('--placeholder');

            if (type === 'color') {
                const swatch = document.createElement('span');
                swatch.className = 'customPicker__triggerSwatch';
                swatch.style.backgroundColor = selected.value;
                trigger.insertBefore(swatch, label);
            } else if (type === 'icon') {
                const icon = document.createElement('svg-icon');
                icon.setAttribute('icon', selected.value);
                icon.setAttribute('size', '18');
                trigger.insertBefore(icon, label);
            } else if (type === 'list' && selected.color) {
                const dot = document.createElement('span');
                dot.className = 'customPicker__triggerDot';
                dot.style.backgroundColor = selected.color;
                trigger.insertBefore(dot, label);
            }
        } else {
            label.textContent = this._getPlaceholder();
            label.classList.add('--placeholder');
        }
    }

    _updateSelection() {
        const type = this._getType();
        if (type === 'list') {
            const items = this.shadowRoot.querySelectorAll('.customPicker__listItem');
            items.forEach((btn, idx) => {
                const item = this._items[idx];
                if (item) {
                    btn.classList.toggle('--selected', item.value === this._value);
                }
            });
        } else {
            const cells = this.shadowRoot.querySelectorAll('.customPicker__cell');
            cells.forEach((cell, idx) => {
                const item = this._items[idx];
                if (item) {
                    cell.classList.toggle('--selected', item.value === this._value);
                }
            });
        }
    }
}

customElements.define('custom-picker', CustomPicker);
