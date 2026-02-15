/**
 * Grid Picker Component
 *
 * A visual grid-based picker for colors and icons, replacing native <select>
 * elements with a popover panel showing swatches or icon tiles.
 *
 * Usage:
 *   <grid-picker type="color" placeholder="Select color" columns="5"></grid-picker>
 *   <grid-picker type="icon" placeholder="Select icon" columns="7"></grid-picker>
 *
 * Attributes:
 *   - type: "color" or "icon"
 *   - placeholder: trigger button text when nothing selected (default: "Select")
 *   - columns: number of grid columns (default: 5)
 *
 * JS API:
 *   - setItems(items) — array of {value, label, disabled}
 *   - value getter/setter — current selected value
 *   - clear() — reset selection
 *
 * Events:
 *   - change — CustomEvent with detail: {value, label}, bubbles + composed
 */

class GridPicker extends HTMLElement {
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
        this._updateGridSelection();
    }

    /**
     * Sets the available items for the picker.
     * @param {Array<{value: string, label: string, disabled?: boolean}>} items
     */
    setItems(items) {
        this._items = items;
        this._renderGrid();
        this._updateTrigger();
    }

    /** Resets the current selection. */
    clear() {
        this._value = '';
        this._updateTrigger();
        this._updateGridSelection();
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
                .gridPicker__trigger {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 14px;
                    border: none;
                    border-radius: 10px;
                    background-color: rgba(255, 255, 255, 0.7);
                    color: var(--text-primary, #2D2D2D);
                    font-size: 14px;
                    font-family: inherit;
                    cursor: pointer;
                    transition: background-color 0.3s, box-shadow 0.3s;
                    min-width: 140px;
                    text-align: left;
                }
                .gridPicker__trigger:hover {
                    background-color: rgba(255, 255, 255, 0.9);
                }
                .gridPicker__trigger:focus {
                    outline: none;
                    background-color: rgba(255, 255, 255, 0.9);
                    box-shadow: 0 0 0 3px rgba(196, 164, 132, 0.15);
                }
                .gridPicker__triggerSwatch {
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    flex-shrink: 0;
                }
                .gridPicker__triggerLabel {
                    flex: 1;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .gridPicker__triggerLabel.--placeholder {
                    color: var(--text-muted, #8A8A8A);
                }
                .gridPicker__chevron {
                    font-size: 10px;
                    color: var(--text-muted, #8A8A8A);
                    flex-shrink: 0;
                    transition: transform 0.2s;
                }
                :host(.--active) .gridPicker__chevron {
                    transform: rotate(180deg);
                }
                .gridPicker__panel {
                    position: absolute;
                    top: calc(100% + 6px);
                    left: 0;
                    z-index: 200;
                    background: #FFFFFF;
                    border-radius: 14px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
                    padding: 12px;
                    opacity: 0;
                    visibility: hidden;
                    transform: translateY(-8px);
                    transition: opacity 0.2s, transform 0.2s, visibility 0.2s;
                    min-width: 100%;
                }
                :host(.--active) .gridPicker__panel {
                    opacity: 1;
                    visibility: visible;
                    transform: translateY(0);
                }
                .gridPicker__grid {
                    display: grid;
                    grid-template-columns: repeat(${columns}, 1fr);
                    gap: 6px;
                }
                /* Color mode cells */
                .gridPicker__cell {
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
                .gridPicker__cell:hover:not(.--disabled) {
                    transform: scale(1.15);
                    background-color: rgba(0, 0, 0, 0.04);
                }
                .gridPicker__cell.--selected {
                    background-color: rgba(196, 164, 132, 0.15);
                }
                .gridPicker__cell.--disabled {
                    opacity: 0.4;
                    cursor: not-allowed;
                }
                /* Color swatch */
                .gridPicker__swatch {
                    width: 32px;
                    height: 32px;
                    border-radius: 50%;
                    transition: box-shadow 0.15s;
                }
                .gridPicker__cell.--selected .gridPicker__swatch {
                    box-shadow: 0 0 0 3px #FFFFFF, 0 0 0 5px var(--accent-color, #C4A484);
                }
                /* Icon mode cells */
                .gridPicker__cell.--icon {
                    width: 40px;
                    height: 40px;
                    border-radius: 8px;
                }
                .gridPicker__cell.--icon.--selected {
                    background-color: rgba(196, 164, 132, 0.2);
                }
                .gridPicker__cell.--icon:hover:not(.--disabled) {
                    background-color: rgba(0, 0, 0, 0.06);
                }
                /* Tooltip */
                .gridPicker__cell::after {
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
                .gridPicker__cell:hover::after {
                    opacity: 1;
                }
            </style>
            <button class="gridPicker__trigger" type="button">
                <span class="gridPicker__triggerLabel --placeholder">${this._getPlaceholder()}</span>
                <span class="gridPicker__chevron">&#9662;</span>
            </button>
            <div class="gridPicker__panel">
                <div class="gridPicker__grid"></div>
            </div>
        `;

        this.shadowRoot.querySelector('.gridPicker__trigger').addEventListener('click', (e) => {
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

    _renderGrid() {
        const grid = this.shadowRoot.querySelector('.gridPicker__grid');
        if (!grid) return;
        grid.innerHTML = '';

        const type = this._getType();

        this._items.forEach(item => {
            const cell = document.createElement('button');
            cell.type = 'button';
            cell.className = 'gridPicker__cell';
            if (type === 'icon') cell.classList.add('--icon');
            if (item.disabled) cell.classList.add('--disabled');
            if (item.value === this._value) cell.classList.add('--selected');

            const tooltipLabel = item.disabled ? `${item.label} (taken)` : item.label;
            cell.title = tooltipLabel;

            if (type === 'color') {
                const swatch = document.createElement('span');
                swatch.className = 'gridPicker__swatch';
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
                this._value = item.value;
                this._updateTrigger();
                this._updateGridSelection();
                this._close();
                this.dispatchEvent(new CustomEvent('change', {
                    detail: { value: item.value, label: item.label },
                    bubbles: true,
                    composed: true
                }));
            });

            grid.appendChild(cell);
        });
    }

    _updateTrigger() {
        const trigger = this.shadowRoot.querySelector('.gridPicker__trigger');
        if (!trigger) return;

        const type = this._getType();
        const selected = this._items.find(i => i.value === this._value);

        // Remove old swatch/icon preview if present
        const oldSwatch = trigger.querySelector('.gridPicker__triggerSwatch');
        if (oldSwatch) oldSwatch.remove();
        const oldIcon = trigger.querySelector('svg-icon');
        if (oldIcon) oldIcon.remove();

        const label = trigger.querySelector('.gridPicker__triggerLabel');

        if (selected) {
            label.textContent = selected.label;
            label.classList.remove('--placeholder');

            if (type === 'color') {
                const swatch = document.createElement('span');
                swatch.className = 'gridPicker__triggerSwatch';
                swatch.style.backgroundColor = selected.value;
                trigger.insertBefore(swatch, label);
            } else {
                const icon = document.createElement('svg-icon');
                icon.setAttribute('icon', selected.value);
                icon.setAttribute('size', '18');
                trigger.insertBefore(icon, label);
            }
        } else {
            label.textContent = this._getPlaceholder();
            label.classList.add('--placeholder');
        }
    }

    _updateGridSelection() {
        const cells = this.shadowRoot.querySelectorAll('.gridPicker__cell');
        cells.forEach((cell, idx) => {
            const item = this._items[idx];
            if (item) {
                cell.classList.toggle('--selected', item.value === this._value);
            }
        });
    }
}

customElements.define('grid-picker', GridPicker);
