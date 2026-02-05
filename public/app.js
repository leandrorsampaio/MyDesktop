// Task Tracker Application
(function() {
    'use strict';

    // ==========================================
    // Configuration
    // ==========================================

    const STATUS_COLUMNS = {
        'todo': 'kanban-column[data-status="todo"]',
        'wait': 'kanban-column[data-status="wait"]',
        'inprogress': 'kanban-column[data-status="inprogress"]',
        'done': 'kanban-column[data-status="done"]'
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
    let editingTaskId = null;
    let draggedTask = null;
    let activeCategoryFilters = new Set(); // Active category filter IDs
    let priorityFilterActive = false;
    let crisisModeActive = false;
    let originalTitle = '';

    // ==========================================
    // DOM Elements
    // ==========================================
    const elements = {
        // Header
        currentDate: document.querySelector('.js-currentDate'),
        currentWeekday: document.querySelector('.js-currentWeekday'),
        currentWeek: document.querySelector('.js-currentWeek'),
        menuBtn: document.querySelector('.js-menuBtn'),
        dropdownMenu: document.querySelector('.js-dropdownMenu'),

        // Task Modal
        taskModal: document.querySelector('.js-taskModal'),
        taskForm: document.querySelector('.js-taskForm'),
        modalTitle: document.querySelector('.js-modalTitle'),
        taskTitle: document.querySelector('.js-taskTitle'),
        taskDescription: document.querySelector('.js-taskDescription'),
        taskPriority: document.querySelector('.js-taskPriority'),
        taskLogSection: document.querySelector('.js-taskLogSection'),
        taskLogList: document.querySelector('.js-taskLogList'),
        taskModalActions: document.querySelector('.js-taskModalActions'),
        addTaskBtn: document.querySelector('.js-addTaskBtn'),

        // Reports Modal
        reportsModal: document.querySelector('.js-reportsModal'),
        reportsContainer: document.querySelector('.js-reportsContainer'),
        viewReportsBtn: document.querySelector('.js-viewReportsBtn'),

        // Archived Tasks Modal
        archivedModal: document.querySelector('.js-archivedModal'),
        archivedContainer: document.querySelector('.js-archivedContainer'),
        viewArchivedBtn: document.querySelector('.js-viewArchivedBtn'),

        // Confirm Modal
        confirmModal: document.querySelector('.js-confirmModal'),
        confirmCancel: document.querySelector('.js-confirmCancel'),
        confirmDelete: document.querySelector('.js-confirmDelete'),

        // Privacy
        appContainer: document.querySelector('.js-appContainer'),
        privacyToggleBtn: document.querySelector('.js-privacyToggleBtn'),

        // Category Filters
        categoryFilters: document.querySelector('.js-categoryFilters'),
        priorityFilterBtn: document.querySelector('.js-priorityFilterBtn'),

        // Crisis Mode
        crisisModeBtn: document.querySelector('.js-crisisModeBtn'),
        headerToolbar: document.querySelector('.toolbar'),

        // Archive & Report
        archiveBtn: document.querySelector('.js-archiveBtn'),
        reportBtn: document.querySelector('.js-reportBtn'),
        
        // Kanban container
        kanban: document.querySelector('.kanban')
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
        elements.menuBtn.classList.toggle('--active');
        elements.dropdownMenu.classList.toggle('--active');
    }

    function closeMenu() {
        elements.menuBtn.classList.remove('--active');
        elements.dropdownMenu.classList.remove('--active');
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

    async function deleteReport(id) {
        try {
            await fetch(`/api/reports/${id}`, { method: 'DELETE' });
            const reports = await fetchReports();
            renderReportsList(reports);
        } catch (error) {
            console.error('Error deleting report:', error);
        }
    }

    // ==========================================
    // Render Functions
    // ==========================================
    function renderAllColumns() {
        Object.keys(STATUS_COLUMNS).forEach(status => renderColumn(status));
        applyAllFilters();
    }

    function renderColumn(status) {
        console.log(`[app.js] renderColumn for status: ${status}`);
        const columnEl = document.querySelector(STATUS_COLUMNS[status]);
        const columnTasks = tasks
            .filter(t => t.status === status)
            .sort((a, b) => a.position - b.position);

        console.log(`[app.js] Found ${columnTasks.length} tasks for ${status}.`);

        if (columnEl) {
            console.log(`[app.js] Found column element for ${status}. Calling renderTasks...`);
            columnEl.renderTasks(columnTasks, createTaskCard);
        } else {
            console.error(`[app.js] Could not find column element for status: ${status}`);
        }

        if (activeCategoryFilters.size > 0 || priorityFilterActive) {
            applyAllFilters();
        }
    }

    function createTaskCard(task, position, totalInColumn) {
        const card = document.createElement('task-card');
        
        card.dataset.taskId = task.id;
        card.dataset.status = task.status;
        card.dataset.category = String(task.category || 1);
        card.dataset.priority = task.priority ? 'true' : 'false';
        card.dataset.title = task.title;
        card.dataset.description = task.description || '';

        card.draggable = true;

        // Apply gradient background
        card.style.background = getTaskGradient(task.status, position, totalInColumn);

        // Apply text color
        if (shouldUseLightText(task.status, position, totalInColumn)) {
            card.classList.add('--lightText');
        } else {
            card.classList.add('--darkText');
        }

        // Drag events
        card.addEventListener('dragstart', (e) => {
            e.target.classList.add('--dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', task.id);
        });

        card.addEventListener('dragend', (e) => {
            e.target.classList.remove('--dragging');
        });

        return card;
    }


    // ==========================================
    // Category Filters
    // ==========================================
    function renderCategoryFilters() {
        const container = elements.categoryFilters;
        container.innerHTML = '';

        Object.entries(CATEGORIES).forEach(([id, label]) => {
            const btn = document.createElement('button');
            btn.className = 'toolbar__categoryBtn js-categoryFilterBtn';
            btn.dataset.category = id;
            btn.textContent = label;
            if (activeCategoryFilters.has(Number(id))) {
                btn.classList.add('--active');
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
        elements.categoryFilters.querySelectorAll('.toolbar__categoryBtn').forEach(btn => {
            btn.classList.toggle('--active', activeCategoryFilters.has(Number(btn.dataset.category)));
        });

        applyAllFilters();
    }

    function togglePriorityFilter() {
        priorityFilterActive = !priorityFilterActive;
        elements.priorityFilterBtn.classList.toggle('--active', priorityFilterActive);
        applyAllFilters();
    }

    function applyAllFilters() {
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

    // ==========================================
    // Crisis Mode
    // ==========================================
    function generateRedStarFavicon() {
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

    function setFavicon(url) {
        let link = document.querySelector('link[rel="icon"]');
        if (!link) {
            link = document.createElement('link');
            link.rel = 'icon';
            document.head.appendChild(link);
        }
        link.type = 'image/png';
        link.href = url;
    }

    function toggleCrisisMode() {
        closeMenu();
        crisisModeActive = !crisisModeActive;

        if (crisisModeActive) {
            // Save original state
            originalTitle = document.title;

            // Activate priority filter
            priorityFilterActive = true;
            elements.priorityFilterBtn.classList.add('--active');
            applyAllFilters();

            // Visual changes
            document.body.classList.add('--crisisMode');
            document.title = '!!!';
            setFavicon(generateRedStarFavicon());

            // Update menu button text
            elements.crisisModeBtn.innerHTML = '<span class="navMenu__icon">🚨</span> Exit Crisis Mode';
        } else {
            // Deactivate priority filter
            priorityFilterActive = false;
            elements.priorityFilterBtn.classList.remove('--active');
            applyAllFilters();

            // Restore visuals
            document.body.classList.remove('--crisisMode');
            document.title = originalTitle;
            setFavicon('favicon.png');

            // Restore menu button text
            elements.crisisModeBtn.innerHTML = '<span class="navMenu__icon">🚨</span> Crisis Mode';
        }
    }

    // ==========================================
    // Modal Functions
    // ==========================================
    function renderTaskModalActions(isEditing) {
        elements.taskModalActions.innerHTML = '';

        const rightActions = document.createElement('div');
        rightActions.className = 'modal__actionsRight';

        const cancelBtn = document.createElement('custom-button');
        cancelBtn.setAttribute('label', 'Cancel');
        cancelBtn.addEventListener('click', () => elements.taskModal.close());

        const saveBtn = document.createElement('custom-button');
        saveBtn.setAttribute('label', isEditing ? 'Update' : 'Save');
        saveBtn.setAttribute('modifier', 'save');
        saveBtn.setAttribute('type', 'submit');
        
        // The form's submit event is already handled by handleTaskFormSubmit
        elements.taskForm.onsubmit = handleTaskFormSubmit;

        rightActions.appendChild(cancelBtn);
        rightActions.appendChild(saveBtn);

        if (isEditing) {
            const deleteBtn = document.createElement('custom-button');
            deleteBtn.setAttribute('label', 'Delete Task');
            deleteBtn.setAttribute('modifier', 'delete');
            deleteBtn.addEventListener('click', openDeleteConfirmation);
            elements.taskModalActions.appendChild(deleteBtn);
        }

        elements.taskModalActions.appendChild(rightActions);
    }

    function openAddTaskModal() {
        editingTaskId = null;
        elements.modalTitle.textContent = 'Add Task';
        elements.taskForm.reset();
        setCategorySelection(1);
        elements.taskLogSection.style.display = 'none';

        renderTaskModalActions(false);

        elements.taskModal.open();
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
                <li><span class="taskForm__logDate">${entry.date}</span>: ${escapeHtml(entry.action)}</li>
            `).join('');
        } else {
            elements.taskLogSection.style.display = 'none';
        }

        renderTaskModalActions(true);

        elements.taskModal.open();
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

        elements.taskModal.close();
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
        // This will be updated when confirmModal is componentized
        elements.confirmModal.classList.add('--active');
    }

    async function confirmDeleteTask() {
        if (editingTaskId) {
            await deleteTask(editingTaskId);
            elements.confirmModal.classList.remove('--active');
            elements.taskModal.close();
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
        elements.reportsModal.open();
    }

    function renderReportsList(reports) {
        if (reports.length === 0) {
            elements.reportsContainer.innerHTML = '<div class="emptyState">No reports generated yet</div>';
            return;
        }

        // Sort reports by date (newest first)
        reports.sort((a, b) => new Date(b.generatedDate) - new Date(a.generatedDate));

        elements.reportsContainer.innerHTML = `
            <ul class="reportsList">
                ${reports.map(report => `
                    <li class="reportsList__item" data-report-id="${report.id}">
                        <div class="reportsList__row">
                            <input type="text" class="reportsList__titleEdit js-reportTitleEdit" value="${escapeHtml(report.title)}"
                                onblur="window.updateReportTitle('${report.id}', this.value)"
                                onclick="event.stopPropagation()" />
                            <button class="reportsList__deleteBtn" onclick="event.stopPropagation(); if (confirm('Delete this report?')) window.deleteReport('${report.id}')" title="Delete report">delete</button>
                        </div>
                        <div class="reportsList__date">${formatDate(report.generatedDate)}</div>
                    </li>
                `).join('')}
            </ul>
        `;

        // Add click listeners to view reports
        elements.reportsContainer.querySelectorAll('.reportsList__item').forEach(li => {
            li.addEventListener('click', (e) => {
                if (e.target.classList.contains('reportsList__titleEdit') || e.target.classList.contains('reportsList__deleteBtn')) return;
                const reportId = li.dataset.reportId;
                const report = reports.find(r => r.id === reportId);
                if (report) renderReportView(report, reports);
            });
        });
    }

    window.updateReportTitle = async function(id, title) {
        await updateReportTitle(id, title);
    };

    window.deleteReport = async function(id) {
        await deleteReport(id);
    };

    function renderReportView(report, allReports) {
        elements.reportsContainer.innerHTML = `
            <div class="reportDetail">
                <div class="reportDetail__header">
                    <button class="reportDetail__backBtn" onclick="window.backToReportsList()">← Back to Reports</button>
                    <h3>${escapeHtml(report.title)}</h3>
                </div>

                ${renderReportSection('Completed Tasks (Archived)', report.content.archived)}
                ${renderReportSection('In Progress', report.content.inProgress)}
                ${renderReportSection('Waiting/Blocked', report.content.waiting)}
                ${renderReportSection('To Do', report.content.todo)}

                <div class="reportDetail__section">
                    <h4>Notes</h4>
                    ${report.notes && (typeof report.notes === 'string' ? report.notes.trim() : report.notes.length > 0) ?
                        (typeof report.notes === 'string' ?
                            `<pre class="reportDetail__notesText">${escapeHtml(report.notes)}</pre>` :
                            report.notes.map(note => `
                                <div class="reportDetail__notesItem ${note.checked ? '--checked' : ''}">
                                    ${note.checked ? '☑' : '☐'} ${escapeHtml(note.text)}
                                </div>
                            `).join('')
                        ) :
                        '<div class="emptyState">No notes</div>'
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
                <div class="reportDetail__section">
                    <h4>${title}</h4>
                    <div class="emptyState">No tasks</div>
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
                <div class="reportDetail__categoryGroup">
                    <div class="reportDetail__categoryLabel">${escapeHtml(catLabel)}</div>
                    ${catTasks.map(task => `
                        <div class="reportDetail__task">
                            <div class="reportDetail__taskId">[${task.id.substring(0, 8)}]</div>
                            <div class="reportDetail__taskTitle">${escapeHtml(task.title)}</div>
                            ${task.description ? `<div class="reportDetail__taskDesc">Description: ${escapeHtml(task.description)}</div>` : ''}
                        </div>
                    `).join('')}
                </div>
            `;
        }).join('');

        return `
            <div class="reportDetail__section">
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
        elements.archivedModal.open();
    }

    function renderArchivedTasks(archivedTasks) {
        if (archivedTasks.length === 0) {
            elements.archivedContainer.innerHTML = '<div class="emptyState">No completed tasks yet</div>';
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
            <div class="archivedView__count">${archivedTasks.length} completed task${archivedTasks.length !== 1 ? 's' : ''}</div>
            <ul class="archivedView__list">
                ${archivedTasks.map(task => {
                    const completedDate = task.log && task.log.length > 0
                        ? task.log[task.log.length - 1].date
                        : task.createdDate.split('T')[0];
                    return `
                        <li class="archivedView__item">
                            <div class="archivedView__itemHeader">
                                ${task.priority ? '<span class="archivedView__itemStar">★</span>' : ''}
                                <span class="archivedView__itemTitle">${escapeHtml(task.title)}</span>
                            </div>
                            ${task.description ? `<div class="archivedView__itemDesc">${escapeHtml(task.description)}</div>` : ''}
                            <div class="archivedView__itemDate">Completed: ${completedDate}</div>
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

        // Priority Filter
        elements.priorityFilterBtn.addEventListener('click', togglePriorityFilter);

        // Crisis Mode
        elements.crisisModeBtn.addEventListener('click', toggleCrisisMode);

        // Privacy Toggle
        elements.privacyToggleBtn.addEventListener('click', () => {
            elements.appContainer.classList.toggle('--privacyMode');
            const isHidden = elements.appContainer.classList.contains('--privacyMode');
            elements.privacyToggleBtn.textContent = isHidden ? 'Show' : 'Hide';
            elements.privacyToggleBtn.classList.toggle('--active', isHidden);
        });

        // Add Task
        elements.addTaskBtn.addEventListener('click', openAddTaskModal);

        // Task Form
        elements.taskForm.addEventListener('submit', handleTaskFormSubmit);

        // Report & Archive
        elements.reportBtn.addEventListener('click', handleGenerateReport);
        elements.archiveBtn.addEventListener('click', handleArchive);

        // Reports
        elements.viewReportsBtn.addEventListener('click', openReportsModal);

        // Archived Tasks
        elements.viewArchivedBtn.addEventListener('click', openArchivedModal);

        // Listen for edit requests from task-card components
        elements.kanban.addEventListener('request-edit', (e) => {
            openEditModal(e.detail.taskId);
        });

        elements.kanban.addEventListener('task-dropped', (e) => {
            const { taskId, newStatus, newPosition } = e.detail;
            moveTask(taskId, newStatus, newPosition);
        });

        // Close confirmModal on outside click (other modals are now components that handle this internally)
        if (elements.confirmModal) {
            elements.confirmModal.addEventListener('click', (e) => {
                if (e.target === elements.confirmModal) {
                    elements.confirmModal.classList.remove('--active');
                }
            });
        }

        // Close confirmModal on ESC key (other modals are now components that handle this internally)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (elements.confirmModal) elements.confirmModal.classList.remove('--active');
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

        // Initialize UI
        renderCategoryFilters();
        initEventListeners();

        // Fetch data
        await fetchTasks();
    }

    // Start the application
    document.addEventListener('DOMContentLoaded', init);
})();
