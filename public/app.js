// Task Tracker Application
(function() {
    'use strict';

    // ==========================================
    // Configuration
    // ==========================================

    // Default recurrent tasks (used if no saved checklist exists)
    const DEFAULT_RECURRENT_TASKS = [
        { text: 'Check email', url: '' },
        { text: 'Review calendar', url: '' },
        { text: 'Water plants', url: '' },
        { text: 'Take vitamins', url: '' },
        { text: 'Exercise', url: '' },
        { text: 'Read for 30 minutes', url: '' }
    ];

    const STATUS_COLUMNS = {
        'todo': 'todo-list',
        'wait': 'wait-list',
        'inprogress': 'inprogress-list',
        'done': 'done-list'
    };

    const CATEGORIES = {
        1: 'Non categorized',
        2: 'Development',
        3: 'Communication',
        4: 'To Remember',
        5: 'Planning',
        6: 'Generic Task'
    };

    // ==========================================
    // State
    // ==========================================
    let tasks = [];
    let notes = { content: '' };
    let editingTaskId = null;
    let draggedTask = null;
    let saveNotesTimeout = null;
    let recurrentTasks = []; // Will be loaded from localStorage or default
    let activeCategoryFilters = new Set(); // Active category filter IDs

    // ==========================================
    // DOM Elements
    // ==========================================
    const elements = {
        // Header
        currentDate: document.getElementById('current-date'),
        currentWeekday: document.getElementById('current-weekday'),
        currentWeek: document.getElementById('current-week'),
        menuBtn: document.getElementById('menu-btn'),
        dropdownMenu: document.getElementById('dropdown-menu'),

        // Task Modal
        taskModal: document.getElementById('task-modal'),
        taskForm: document.getElementById('task-form'),
        modalTitle: document.getElementById('modal-title'),
        taskTitle: document.getElementById('task-title'),
        taskDescription: document.getElementById('task-description'),
        taskPriority: document.getElementById('task-priority'),
        taskLogSection: document.getElementById('task-log-section'),
        taskLogList: document.getElementById('task-log-list'),
        deleteTaskBtn: document.getElementById('delete-task-btn'),
        modalClose: document.getElementById('modal-close'),
        cancelBtn: document.getElementById('cancel-btn'),
        addTaskBtn: document.getElementById('add-task-btn'),

        // Reports Modal
        reportsModal: document.getElementById('reports-modal'),
        reportsContainer: document.getElementById('reports-container'),
        reportsModalClose: document.getElementById('reports-modal-close'),
        viewReportsBtn: document.getElementById('view-reports-btn'),

        // Archived Tasks Modal
        archivedModal: document.getElementById('archived-modal'),
        archivedContainer: document.getElementById('archived-container'),
        archivedModalClose: document.getElementById('archived-modal-close'),
        viewArchivedBtn: document.getElementById('view-archived-btn'),

        // Checklist Modal
        checklistModal: document.getElementById('checklist-modal'),
        checklistModalClose: document.getElementById('checklist-modal-close'),
        checklistItemsContainer: document.getElementById('checklist-items-container'),
        addChecklistItemBtn: document.getElementById('add-checklist-item-btn'),
        checklistCancelBtn: document.getElementById('checklist-cancel-btn'),
        checklistSaveBtn: document.getElementById('checklist-save-btn'),
        editChecklistBtn: document.getElementById('edit-checklist-btn'),

        // Confirm Modal
        confirmModal: document.getElementById('confirm-modal'),
        confirmCancel: document.getElementById('confirm-cancel'),
        confirmDelete: document.getElementById('confirm-delete'),

        // Privacy
        appContainer: document.getElementById('app-container'),
        privacyToggleBtn: document.getElementById('privacy-toggle-btn'),

        // Category Filters
        categoryFilters: document.getElementById('category-filters'),

        // Archive & Report
        archiveBtn: document.getElementById('archive-btn'),
        reportBtn: document.getElementById('report-btn'),

        // Notes
        notesTextarea: document.getElementById('notes-textarea'),
        notesSaveStatus: document.getElementById('notes-save-status'),

        // Recurrent Tasks
        recurrentList: document.getElementById('recurrent-list')
    };

    // ==========================================
    // Header Date Functions
    // ==========================================
    function initHeaderDate() {
        const now = new Date();

        // Format date: "January 25, 2026"
        const dateOptions = { year: 'numeric', month: 'long', day: 'numeric' };
        elements.currentDate.textContent = now.toLocaleDateString('en-US', dateOptions);

        // Weekday: "Saturday"
        const weekdayOptions = { weekday: 'long' };
        elements.currentWeekday.textContent = now.toLocaleDateString('en-US', weekdayOptions);

        // Week number
        const weekNumber = getWeekNumber(now);
        elements.currentWeek.textContent = `Week ${weekNumber}`;
    }

    function getWeekNumber(date) {
        const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }

    // ==========================================
    // Hamburger Menu
    // ==========================================
    function toggleMenu() {
        elements.menuBtn.classList.toggle('active');
        elements.dropdownMenu.classList.toggle('active');
    }

    function closeMenu() {
        elements.menuBtn.classList.remove('active');
        elements.dropdownMenu.classList.remove('active');
    }

    // ==========================================
    // Color Management
    // ==========================================
    function getTaskGradient(status, position, totalInColumn) {
        const maxGradients = 20;
        let gradientIndex;

        if (totalInColumn <= maxGradients) {
            gradientIndex = position;
        } else {
            // Distribute evenly across 20 gradients
            gradientIndex = Math.floor((position / totalInColumn) * maxGradients);
        }

        gradientIndex = Math.min(gradientIndex, maxGradients - 1);

        return `var(--${status}-gradient-${gradientIndex})`;
    }

    function shouldUseLightText(status, position, totalInColumn) {
        const maxGradients = 20;
        let gradientIndex;

        if (totalInColumn <= maxGradients) {
            gradientIndex = position;
        } else {
            gradientIndex = Math.floor((position / totalInColumn) * maxGradients);
        }

        // Use light text for darker gradients (lower index)
        return gradientIndex < 12;
    }

    // ==========================================
    // API Functions
    // ==========================================
    async function fetchTasks() {
        try {
            const response = await fetch('/api/tasks');
            tasks = await response.json();
            renderAllColumns();
        } catch (error) {
            console.error('Error fetching tasks:', error);
        }
    }

    async function createTask(taskData) {
        try {
            const response = await fetch('/api/tasks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(taskData)
            });
            const newTask = await response.json();
            tasks.push(newTask);
            renderColumn('todo');
            return newTask;
        } catch (error) {
            console.error('Error creating task:', error);
        }
    }

    async function updateTask(id, taskData) {
        try {
            const response = await fetch(`/api/tasks/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(taskData)
            });
            const updatedTask = await response.json();
            const index = tasks.findIndex(t => t.id === id);
            if (index !== -1) {
                tasks[index] = { ...tasks[index], ...updatedTask };
            }
            renderAllColumns();
            return updatedTask;
        } catch (error) {
            console.error('Error updating task:', error);
        }
    }

    async function deleteTask(id) {
        try {
            await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
            tasks = tasks.filter(t => t.id !== id);
            renderAllColumns();
        } catch (error) {
            console.error('Error deleting task:', error);
        }
    }

    async function moveTask(id, newStatus, newPosition) {
        try {
            const response = await fetch(`/api/tasks/${id}/move`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ newStatus, newPosition })
            });
            const result = await response.json();
            await fetchTasks(); // Refresh all tasks to get updated positions
            return result;
        } catch (error) {
            console.error('Error moving task:', error);
        }
    }

    async function generateReport() {
        try {
            const response = await fetch('/api/reports/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                const error = await response.json();
                alert(error.error || 'Failed to generate report');
                return null;
            }

            return await response.json();
        } catch (error) {
            console.error('Error generating report:', error);
            alert('Failed to generate report');
            return null;
        }
    }

    async function archiveTasks() {
        try {
            const response = await fetch('/api/tasks/archive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                const error = await response.json();
                alert(error.error || 'Failed to archive tasks');
                return null;
            }

            const result = await response.json();
            await fetchTasks();
            return result;
        } catch (error) {
            console.error('Error archiving tasks:', error);
            alert('Failed to archive tasks');
            return null;
        }
    }

    async function fetchArchivedTasks() {
        try {
            const response = await fetch('/api/archived');
            return await response.json();
        } catch (error) {
            console.error('Error fetching archived tasks:', error);
            return [];
        }
    }

    async function fetchNotes() {
        try {
            const response = await fetch('/api/notes');
            const data = await response.json();
            // Handle both old format (items array) and new format (content string)
            if (data.content !== undefined) {
                notes = data;
            } else if (data.items && Array.isArray(data.items)) {
                // Convert old format to new format
                notes = { content: data.items.map(item => item.text).join('\n') };
            } else {
                notes = { content: '' };
            }
            elements.notesTextarea.value = notes.content;
        } catch (error) {
            console.error('Error fetching notes:', error);
        }
    }

    async function saveNotes() {
        try {
            showNotesSaveStatus('saving');
            await fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(notes)
            });
            showNotesSaveStatus('saved');
        } catch (error) {
            console.error('Error saving notes:', error);
        }
    }

    function showNotesSaveStatus(status) {
        const el = elements.notesSaveStatus;
        el.className = '';
        el.style.opacity = '1';

        if (status === 'saving') {
            el.textContent = 'Saving...';
            el.classList.add('saving');
        } else if (status === 'saved') {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit'
            });
            el.textContent = `Saved at ${timeStr}`;
            el.classList.add('saved');
        }
    }

    function debouncedSaveNotes() {
        // Clear any pending save
        if (saveNotesTimeout) {
            clearTimeout(saveNotesTimeout);
        }
        // Schedule save after 500ms of no typing
        saveNotesTimeout = setTimeout(() => {
            notes.content = elements.notesTextarea.value;
            saveNotes();
        }, 500);
    }

    async function fetchReports() {
        try {
            const response = await fetch('/api/reports');
            return await response.json();
        } catch (error) {
            console.error('Error fetching reports:', error);
            return [];
        }
    }

    async function updateReportTitle(id, title) {
        try {
            await fetch(`/api/reports/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title })
            });
        } catch (error) {
            console.error('Error updating report title:', error);
        }
    }

    // ==========================================
    // Render Functions
    // ==========================================
    function renderAllColumns() {
        Object.keys(STATUS_COLUMNS).forEach(status => renderColumn(status));
        applyCategoryFilters();
    }

    function renderColumn(status) {
        const columnEl = document.getElementById(STATUS_COLUMNS[status]);
        const columnTasks = tasks
            .filter(t => t.status === status)
            .sort((a, b) => a.position - b.position);

        columnEl.innerHTML = '';

        if (columnTasks.length === 0) {
            columnEl.innerHTML = '<div class="empty-state">No tasks</div>';
            return;
        }

        columnTasks.forEach((task, index) => {
            const card = createTaskCard(task, index, columnTasks.length);
            columnEl.appendChild(card);
        });

        if (activeCategoryFilters.size > 0) {
            applyCategoryFilters();
        }
    }

    function createTaskCard(task, position, totalInColumn) {
        const card = document.createElement('div');
        card.className = 'task-card';
        card.dataset.taskId = task.id;
        card.dataset.status = task.status;
        card.dataset.category = String(task.category || 1);
        card.draggable = true;

        // Apply gradient background
        card.style.background = getTaskGradient(task.status, position, totalInColumn);

        // Apply text color
        if (shouldUseLightText(task.status, position, totalInColumn)) {
            card.classList.add('light-text');
        } else {
            card.classList.add('dark-text');
        }

        card.innerHTML = `
            <div class="drag-handle">
                <div class="drag-handle-dots">
                    <span></span><span></span>
                    <span></span><span></span>
                    <span></span><span></span>
                </div>
            </div>
            <div class="task-card-content">
                <div class="task-card-header">
                    ${task.priority ? '<span class="priority-star">★</span>' : ''}
                    <span class="task-title">${escapeHtml(task.title)}</span>
                </div>
                ${task.description ? `<div class="task-description">${escapeHtml(task.description)}</div>` : ''}
                ${(task.category && task.category !== 1) ? `<span class="category-badge">${escapeHtml(CATEGORIES[task.category] || 'Unknown')}</span>` : ''}
            </div>
            <button class="btn-edit" onclick="window.openEditModal('${task.id}')">Edit</button>
        `;

        // Drag events
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);

        return card;
    }


    function renderRecurrentTasks() {
        const list = elements.recurrentList;
        list.innerHTML = '';

        const checkedItems = getRecurrentTasksState();

        recurrentTasks.forEach((task, index) => {
            const li = document.createElement('li');
            const isChecked = checkedItems[index];
            li.className = isChecked ? 'checked' : '';

            const hasUrl = task.url && task.url.trim() !== '';

            li.innerHTML = `
                <input type="checkbox" ${isChecked ? 'checked' : ''} />
                <span class="task-text">${escapeHtml(task.text)}</span>
                ${hasUrl ? `<a href="${escapeHtml(task.url)}" target="_blank" class="external-link" title="Open link">↗</a>` : ''}
            `;

            li.querySelector('input').addEventListener('change', (e) => {
                toggleRecurrentTask(index, e.target.checked);
                li.classList.toggle('checked', e.target.checked);
            });

            // Make task text clickable for checkbox
            li.querySelector('.task-text').addEventListener('click', () => {
                const checkbox = li.querySelector('input');
                checkbox.checked = !checkbox.checked;
                toggleRecurrentTask(index, checkbox.checked);
                li.classList.toggle('checked', checkbox.checked);
            });

            list.appendChild(li);
        });
    }

    // ==========================================
    // Recurrent Tasks - Daily Reset & Storage
    // ==========================================
    function loadRecurrentTasks() {
        const stored = localStorage.getItem('checklistConfig');
        if (stored) {
            try {
                recurrentTasks = JSON.parse(stored);
            } catch {
                recurrentTasks = [...DEFAULT_RECURRENT_TASKS];
            }
        } else {
            recurrentTasks = [...DEFAULT_RECURRENT_TASKS];
        }
    }

    function saveRecurrentTasks() {
        localStorage.setItem('checklistConfig', JSON.stringify(recurrentTasks));
    }

    function getRecurrentTasksState() {
        const stored = localStorage.getItem('recurrentTasksChecked');
        if (!stored) return {};

        try {
            return JSON.parse(stored);
        } catch {
            return {};
        }
    }

    function toggleRecurrentTask(index, checked) {
        const state = getRecurrentTasksState();
        state[index] = checked;
        localStorage.setItem('recurrentTasksChecked', JSON.stringify(state));
    }

    function checkDailyReset() {
        const lastResetStr = localStorage.getItem('lastRecurrentReset');
        const now = new Date();

        // Create today's 6 AM date
        const todayAt6AM = new Date(now);
        todayAt6AM.setHours(6, 0, 0, 0);

        // If it's before 6 AM, use yesterday's 6 AM
        if (now.getHours() < 6) {
            todayAt6AM.setDate(todayAt6AM.getDate() - 1);
        }

        let shouldReset = false;

        if (!lastResetStr) {
            shouldReset = true;
        } else {
            const lastReset = new Date(lastResetStr);
            if (lastReset < todayAt6AM) {
                shouldReset = true;
            }
        }

        if (shouldReset) {
            localStorage.removeItem('recurrentTasksChecked');
            localStorage.setItem('lastRecurrentReset', now.toISOString());
        }
    }

    // ==========================================
    // Checklist Editor Functions
    // ==========================================
    function openChecklistModal() {
        closeMenu();
        renderChecklistEditor();
        openModal(elements.checklistModal);
    }

    function renderChecklistEditor() {
        const container = elements.checklistItemsContainer;
        container.innerHTML = '';

        recurrentTasks.forEach((task, index) => {
            const row = createChecklistItemRow(task.text, task.url, index);
            container.appendChild(row);
        });
    }

    function createChecklistItemRow(text = '', url = '', index = -1) {
        const row = document.createElement('div');
        row.className = 'checklist-item-row';
        row.dataset.index = index;

        row.innerHTML = `
            <input type="text" class="text-input" placeholder="Task name" value="${escapeHtml(text)}" />
            <input type="text" class="url-input" placeholder="URL (optional)" value="${escapeHtml(url)}" />
            <button type="button" class="btn-remove-item" title="Remove item">&times;</button>
        `;

        row.querySelector('.btn-remove-item').addEventListener('click', () => {
            row.remove();
        });

        return row;
    }

    function addChecklistItem() {
        const row = createChecklistItemRow();
        elements.checklistItemsContainer.appendChild(row);
        row.querySelector('.text-input').focus();
    }

    function saveChecklistFromEditor() {
        const rows = elements.checklistItemsContainer.querySelectorAll('.checklist-item-row');
        const newTasks = [];

        rows.forEach(row => {
            const text = row.querySelector('.text-input').value.trim();
            const url = row.querySelector('.url-input').value.trim();

            if (text) {
                newTasks.push({ text, url });
            }
        });

        recurrentTasks = newTasks;
        saveRecurrentTasks();
        renderRecurrentTasks();
        closeModal(elements.checklistModal);
    }

    // ==========================================
    // Category Filters
    // ==========================================
    function renderCategoryFilters() {
        const container = elements.categoryFilters;
        container.innerHTML = '';

        Object.entries(CATEGORIES).forEach(([id, label]) => {
            const btn = document.createElement('button');
            btn.className = 'btn-category-filter';
            btn.dataset.category = id;
            btn.textContent = label;
            if (activeCategoryFilters.has(Number(id))) {
                btn.classList.add('active');
            }
            btn.addEventListener('click', () => toggleCategoryFilter(Number(id)));
            container.appendChild(btn);
        });
    }

    function toggleCategoryFilter(categoryId) {
        if (activeCategoryFilters.has(categoryId)) {
            activeCategoryFilters.delete(categoryId);
        } else {
            activeCategoryFilters.add(categoryId);
        }

        // Update button states
        elements.categoryFilters.querySelectorAll('.btn-category-filter').forEach(btn => {
            btn.classList.toggle('active', activeCategoryFilters.has(Number(btn.dataset.category)));
        });

        applyCategoryFilters();
    }

    function applyCategoryFilters() {
        const cards = document.querySelectorAll('.task-card');
        const hasActiveFilters = activeCategoryFilters.size > 0;

        cards.forEach(card => {
            if (!hasActiveFilters) {
                card.classList.remove('category-filtered');
            } else {
                const cardCategory = Number(card.dataset.category);
                card.classList.toggle('category-filtered', !activeCategoryFilters.has(cardCategory));
            }
        });
    }

    // ==========================================
    // Drag and Drop
    // ==========================================
    function handleDragStart(e) {
        draggedTask = e.target;
        e.target.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', e.target.dataset.taskId);
    }

    function handleDragEnd(e) {
        e.target.classList.remove('dragging');
        draggedTask = null;
        document.querySelectorAll('.task-list').forEach(list => {
            list.classList.remove('drag-over');
        });
    }

    function handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    }

    function handleDragEnter(e) {
        e.preventDefault();
        const taskList = e.target.closest('.task-list');
        if (taskList) {
            taskList.classList.add('drag-over');
        }
    }

    function handleDragLeave(e) {
        const taskList = e.target.closest('.task-list');
        if (taskList && !taskList.contains(e.relatedTarget)) {
            taskList.classList.remove('drag-over');
        }
    }

    async function handleDrop(e) {
        e.preventDefault();
        const taskList = e.target.closest('.task-list');
        if (!taskList || !draggedTask) return;

        taskList.classList.remove('drag-over');

        const taskId = e.dataTransfer.getData('text/plain');
        const newStatus = taskList.dataset.status;
        const task = tasks.find(t => t.id === taskId);

        if (!task) return;

        // Calculate new position based on drop location
        const cards = Array.from(taskList.querySelectorAll('.task-card:not(.dragging)'));
        let newPosition = cards.length; // Default to end

        for (let i = 0; i < cards.length; i++) {
            const rect = cards[i].getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            if (e.clientY < midY) {
                newPosition = i;
                break;
            }
        }

        await moveTask(taskId, newStatus, newPosition);
    }

    function initDragAndDrop() {
        document.querySelectorAll('.task-list').forEach(list => {
            list.addEventListener('dragover', handleDragOver);
            list.addEventListener('dragenter', handleDragEnter);
            list.addEventListener('dragleave', handleDragLeave);
            list.addEventListener('drop', handleDrop);
        });
    }

    // ==========================================
    // Modal Functions
    // ==========================================
    function openModal(modal) {
        modal.classList.add('active');
    }

    function closeModal(modal) {
        modal.classList.remove('active');
    }

    function openAddTaskModal() {
        editingTaskId = null;
        elements.modalTitle.textContent = 'Add Task';
        elements.taskTitle.value = '';
        elements.taskDescription.value = '';
        elements.taskPriority.checked = false;
        setCategorySelection(1);
        elements.taskLogSection.style.display = 'none';
        elements.deleteTaskBtn.style.display = 'none';
        openModal(elements.taskModal);
        elements.taskTitle.focus();
    }

    window.openEditModal = function(taskId) {
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;

        editingTaskId = taskId;
        elements.modalTitle.textContent = 'Edit Task';
        elements.taskTitle.value = task.title;
        elements.taskDescription.value = task.description || '';
        elements.taskPriority.checked = task.priority || false;
        setCategorySelection(task.category || 1);

        // Render task log
        if (task.log && task.log.length > 0) {
            elements.taskLogSection.style.display = 'block';
            elements.taskLogList.innerHTML = task.log.map(entry => `
                <li><span class="log-date">${entry.date}</span>: ${escapeHtml(entry.action)}</li>
            `).join('');
        } else {
            elements.taskLogSection.style.display = 'none';
        }

        elements.deleteTaskBtn.style.display = 'block';
        openModal(elements.taskModal);
        elements.taskTitle.focus();
    };

    async function handleTaskFormSubmit(e) {
        e.preventDefault();

        const title = elements.taskTitle.value.trim();
        const description = elements.taskDescription.value.trim();
        const priority = elements.taskPriority.checked;
        const category = getSelectedCategory();

        if (!title) {
            alert('Title is required');
            return;
        }

        if (editingTaskId) {
            await updateTask(editingTaskId, { title, description, priority, category });
        } else {
            await createTask({ title, description, priority, category });
        }

        closeModal(elements.taskModal);
    }

    function setCategorySelection(value) {
        const radio = document.querySelector(`input[name="task-category"][value="${value}"]`);
        if (radio) radio.checked = true;
    }

    function getSelectedCategory() {
        const selected = document.querySelector('input[name="task-category"]:checked');
        return selected ? Number(selected.value) : 1;
    }

    function openDeleteConfirmation() {
        openModal(elements.confirmModal);
    }

    async function confirmDeleteTask() {
        if (editingTaskId) {
            await deleteTask(editingTaskId);
            closeModal(elements.confirmModal);
            closeModal(elements.taskModal);
            editingTaskId = null;
        }
    }

    // ==========================================
    // Reports Functions
    // ==========================================
    async function openReportsModal() {
        closeMenu();
        const reports = await fetchReports();
        renderReportsList(reports);
        openModal(elements.reportsModal);
    }

    function renderReportsList(reports) {
        if (reports.length === 0) {
            elements.reportsContainer.innerHTML = '<div class="empty-state">No reports generated yet</div>';
            return;
        }

        // Sort reports by date (newest first)
        reports.sort((a, b) => new Date(b.generatedDate) - new Date(a.generatedDate));

        elements.reportsContainer.innerHTML = `
            <ul class="reports-list">
                ${reports.map(report => `
                    <li data-report-id="${report.id}">
                        <input type="text" class="report-title-edit" value="${escapeHtml(report.title)}"
                            onblur="window.updateReportTitle('${report.id}', this.value)"
                            onclick="event.stopPropagation()" />
                        <div class="report-date">${formatDate(report.generatedDate)}</div>
                    </li>
                `).join('')}
            </ul>
        `;

        // Add click listeners to view reports
        elements.reportsContainer.querySelectorAll('.reports-list li').forEach(li => {
            li.addEventListener('click', (e) => {
                if (e.target.classList.contains('report-title-edit')) return;
                const reportId = li.dataset.reportId;
                const report = reports.find(r => r.id === reportId);
                if (report) renderReportView(report, reports);
            });
        });
    }

    window.updateReportTitle = async function(id, title) {
        await updateReportTitle(id, title);
    };

    function renderReportView(report, allReports) {
        elements.reportsContainer.innerHTML = `
            <div class="report-view">
                <div class="report-view-header">
                    <button class="btn-back" onclick="window.backToReportsList()">← Back to Reports</button>
                    <h3>${escapeHtml(report.title)}</h3>
                </div>

                ${renderReportSection('Completed Tasks (Archived)', report.content.archived)}
                ${renderReportSection('In Progress', report.content.inProgress)}
                ${renderReportSection('Waiting/Blocked', report.content.waiting)}
                ${renderReportSection('To Do', report.content.todo)}

                <div class="report-section">
                    <h4>Notes</h4>
                    ${report.notes && (typeof report.notes === 'string' ? report.notes.trim() : report.notes.length > 0) ?
                        (typeof report.notes === 'string' ?
                            `<pre class="report-notes-text">${escapeHtml(report.notes)}</pre>` :
                            report.notes.map(note => `
                                <div class="report-notes-item ${note.checked ? 'checked' : ''}">
                                    ${note.checked ? '☑' : '☐'} ${escapeHtml(note.text)}
                                </div>
                            `).join('')
                        ) :
                        '<div class="empty-state">No notes</div>'
                    }
                </div>
            </div>
        `;

        window.backToReportsList = async () => {
            renderReportsList(allReports);
        };
    }

    function renderReportSection(title, taskList) {
        if (!taskList || taskList.length === 0) {
            return `
                <div class="report-section">
                    <h4>${title}</h4>
                    <div class="empty-state">No tasks</div>
                </div>
            `;
        }

        // Group tasks by category
        const grouped = {};
        taskList.forEach(task => {
            const cat = task.category || 1;
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(task);
        });

        // Sort category keys numerically
        const sortedKeys = Object.keys(grouped).map(Number).sort((a, b) => a - b);

        const taskHtml = sortedKeys.map(catKey => {
            const catLabel = CATEGORIES[catKey] || 'Non categorized';
            const catTasks = grouped[catKey];
            return `
                <div class="report-category-group">
                    <div class="report-category-label">${escapeHtml(catLabel)}</div>
                    ${catTasks.map(task => `
                        <div class="report-task">
                            <div class="report-task-id">[${task.id.substring(0, 8)}]</div>
                            <div class="report-task-title">${escapeHtml(task.title)}</div>
                            ${task.description ? `<div class="report-task-desc">Description: ${escapeHtml(task.description)}</div>` : ''}
                        </div>
                    `).join('')}
                </div>
            `;
        }).join('');

        return `
            <div class="report-section">
                <h4>${title}</h4>
                ${taskHtml}
            </div>
        `;
    }

    async function handleGenerateReport() {
        if (!confirm('Generate a report snapshot of all current tasks?')) {
            return;
        }

        const report = await generateReport();
        if (report) {
            alert(`Report generated: ${report.title}`);
        }
    }

    async function handleArchive() {
        const doneTasks = tasks.filter(t => t.status === 'done');
        if (doneTasks.length === 0) {
            alert('No completed tasks to archive');
            return;
        }

        if (!confirm(`Archive ${doneTasks.length} completed task${doneTasks.length !== 1 ? 's' : ''}?`)) {
            return;
        }

        const result = await archiveTasks();
        if (result) {
            alert(`${result.archivedCount} task${result.archivedCount !== 1 ? 's' : ''} archived`);
        }
    }

    // ==========================================
    // Archived Tasks Functions
    // ==========================================
    async function openArchivedModal() {
        closeMenu();
        const archivedTasks = await fetchArchivedTasks();
        renderArchivedTasks(archivedTasks);
        openModal(elements.archivedModal);
    }

    function renderArchivedTasks(archivedTasks) {
        if (archivedTasks.length === 0) {
            elements.archivedContainer.innerHTML = '<div class="empty-state">No completed tasks yet</div>';
            return;
        }

        // Sort by createdDate descending (newest completed first)
        // We use the last log entry date if available, otherwise createdDate
        archivedTasks.sort((a, b) => {
            const aDate = a.log && a.log.length > 0
                ? new Date(a.log[a.log.length - 1].date)
                : new Date(a.createdDate);
            const bDate = b.log && b.log.length > 0
                ? new Date(b.log[b.log.length - 1].date)
                : new Date(b.createdDate);
            return bDate - aDate;
        });

        elements.archivedContainer.innerHTML = `
            <div class="archived-count">${archivedTasks.length} completed task${archivedTasks.length !== 1 ? 's' : ''}</div>
            <ul class="archived-list">
                ${archivedTasks.map(task => {
                    const completedDate = task.log && task.log.length > 0
                        ? task.log[task.log.length - 1].date
                        : task.createdDate.split('T')[0];
                    return `
                        <li class="archived-task-item">
                            <div class="archived-task-header">
                                ${task.priority ? '<span class="archived-task-priority">★</span>' : ''}
                                <span class="archived-task-title">${escapeHtml(task.title)}</span>
                            </div>
                            ${task.description ? `<div class="archived-task-desc">${escapeHtml(task.description)}</div>` : ''}
                            <div class="archived-task-date">Completed: ${completedDate}</div>
                        </li>
                    `;
                }).join('')}
            </ul>
        `;
    }

    // ==========================================
    // Utility Functions
    // ==========================================
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatDate(isoString) {
        const date = new Date(isoString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    // ==========================================
    // Event Listeners
    // ==========================================
    function initEventListeners() {
        // Hamburger Menu
        elements.menuBtn.addEventListener('click', toggleMenu);

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!elements.menuBtn.contains(e.target) && !elements.dropdownMenu.contains(e.target)) {
                closeMenu();
            }
        });

        // Privacy Toggle
        elements.privacyToggleBtn.addEventListener('click', () => {
            elements.appContainer.classList.toggle('privacy-mode');
            const isHidden = elements.appContainer.classList.contains('privacy-mode');
            elements.privacyToggleBtn.textContent = isHidden ? 'Show' : 'Hide';
            elements.privacyToggleBtn.classList.toggle('active', isHidden);
        });

        // Add Task
        elements.addTaskBtn.addEventListener('click', openAddTaskModal);

        // Task Form
        elements.taskForm.addEventListener('submit', handleTaskFormSubmit);

        // Modal Close Buttons
        elements.modalClose.addEventListener('click', () => closeModal(elements.taskModal));
        elements.cancelBtn.addEventListener('click', () => closeModal(elements.taskModal));

        // Delete Task
        elements.deleteTaskBtn.addEventListener('click', openDeleteConfirmation);
        elements.confirmDelete.addEventListener('click', confirmDeleteTask);
        elements.confirmCancel.addEventListener('click', () => closeModal(elements.confirmModal));

        // Report & Archive
        elements.reportBtn.addEventListener('click', handleGenerateReport);
        elements.archiveBtn.addEventListener('click', handleArchive);

        // Reports
        elements.viewReportsBtn.addEventListener('click', openReportsModal);
        elements.reportsModalClose.addEventListener('click', () => closeModal(elements.reportsModal));

        // Archived Tasks
        elements.viewArchivedBtn.addEventListener('click', openArchivedModal);
        elements.archivedModalClose.addEventListener('click', () => closeModal(elements.archivedModal));

        // Checklist Editor
        elements.editChecklistBtn.addEventListener('click', openChecklistModal);
        elements.checklistModalClose.addEventListener('click', () => closeModal(elements.checklistModal));
        elements.checklistCancelBtn.addEventListener('click', () => closeModal(elements.checklistModal));
        elements.checklistSaveBtn.addEventListener('click', saveChecklistFromEditor);
        elements.addChecklistItemBtn.addEventListener('click', addChecklistItem);

        // Notes - debounced auto-save
        elements.notesTextarea.addEventListener('input', debouncedSaveNotes);

        // Close modals on outside click
        [elements.taskModal, elements.reportsModal, elements.archivedModal, elements.confirmModal, elements.checklistModal].forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    closeModal(modal);
                }
            });
        });

        // Close modals on ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                [elements.taskModal, elements.reportsModal, elements.archivedModal, elements.confirmModal, elements.checklistModal].forEach(closeModal);
                closeMenu();
            }
        });
    }

    // ==========================================
    // Initialize
    // ==========================================
    async function init() {
        // Initialize header date
        initHeaderDate();

        // Load recurrent tasks configuration
        loadRecurrentTasks();

        // Check for daily reset of recurrent tasks
        checkDailyReset();

        // Initialize UI
        renderCategoryFilters();
        renderRecurrentTasks();
        initEventListeners();
        initDragAndDrop();

        // Fetch data
        await Promise.all([fetchTasks(), fetchNotes()]);
    }

    // Start the application
    document.addEventListener('DOMContentLoaded', init);
})();
