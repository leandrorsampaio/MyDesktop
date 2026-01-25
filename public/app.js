// Task Tracker Application
(function() {
    'use strict';

    // ==========================================
    // Configuration
    // ==========================================
    const RECURRENT_TASKS = [
        'Check email',
        'Review calendar',
        'Water plants',
        'Take vitamins',
        'Exercise',
        'Read for 30 minutes'
    ];

    const STATUS_COLUMNS = {
        'todo': 'todo-list',
        'wait': 'wait-list',
        'inprogress': 'inprogress-list',
        'done': 'done-list'
    };

    // ==========================================
    // State
    // ==========================================
    let tasks = [];
    let notes = { items: [] };
    let editingTaskId = null;
    let draggedTask = null;

    // ==========================================
    // DOM Elements
    // ==========================================
    const elements = {
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

        // Confirm Modal
        confirmModal: document.getElementById('confirm-modal'),
        confirmCancel: document.getElementById('confirm-cancel'),
        confirmDelete: document.getElementById('confirm-delete'),

        // Archive
        archiveBtn: document.getElementById('archive-btn'),

        // Notes
        notesList: document.getElementById('notes-list'),
        newNoteInput: document.getElementById('new-note-input'),
        addNoteBtn: document.getElementById('add-note-btn'),

        // Recurrent Tasks
        recurrentList: document.getElementById('recurrent-list')
    };

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

    async function archiveTasks() {
        try {
            const response = await fetch('/api/archive', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (!response.ok) {
                const error = await response.json();
                alert(error.error || 'Failed to archive tasks');
                return null;
            }

            const report = await response.json();
            await fetchTasks();
            return report;
        } catch (error) {
            console.error('Error archiving tasks:', error);
            alert('Failed to archive tasks');
            return null;
        }
    }

    async function fetchNotes() {
        try {
            const response = await fetch('/api/notes');
            notes = await response.json();
            renderNotes();
        } catch (error) {
            console.error('Error fetching notes:', error);
        }
    }

    async function saveNotes() {
        try {
            await fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(notes)
            });
        } catch (error) {
            console.error('Error saving notes:', error);
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

    // ==========================================
    // Render Functions
    // ==========================================
    function renderAllColumns() {
        Object.keys(STATUS_COLUMNS).forEach(status => renderColumn(status));
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
    }

    function createTaskCard(task, position, totalInColumn) {
        const card = document.createElement('div');
        card.className = 'task-card';
        card.dataset.taskId = task.id;
        card.dataset.status = task.status;
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
            </div>
            <button class="btn-edit" onclick="window.openEditModal('${task.id}')">Edit</button>
        `;

        // Drag events
        card.addEventListener('dragstart', handleDragStart);
        card.addEventListener('dragend', handleDragEnd);

        return card;
    }

    function renderNotes() {
        const notesList = elements.notesList;
        notesList.innerHTML = '';

        if (!notes.items || notes.items.length === 0) {
            return;
        }

        notes.items.forEach(note => {
            const li = document.createElement('li');
            li.className = note.checked ? 'checked' : '';
            li.innerHTML = `
                <input type="checkbox" ${note.checked ? 'checked' : ''} onchange="window.toggleNote('${note.id}')" />
                <span class="note-text" contenteditable="true" data-note-id="${note.id}">${escapeHtml(note.text)}</span>
                <button class="delete-note" onclick="window.deleteNote('${note.id}')">&times;</button>
            `;

            // Handle note text editing
            const noteText = li.querySelector('.note-text');
            noteText.addEventListener('blur', () => {
                updateNoteText(note.id, noteText.textContent);
            });
            noteText.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    noteText.blur();
                }
            });

            notesList.appendChild(li);
        });
    }

    function renderRecurrentTasks() {
        const list = elements.recurrentList;
        list.innerHTML = '';

        const checkedItems = getRecurrentTasksState();

        RECURRENT_TASKS.forEach((task, index) => {
            const li = document.createElement('li');
            const isChecked = checkedItems[index];
            li.className = isChecked ? 'checked' : '';
            li.innerHTML = `
                <input type="checkbox" ${isChecked ? 'checked' : ''} />
                <span>${escapeHtml(task)}</span>
            `;

            li.querySelector('input').addEventListener('change', (e) => {
                toggleRecurrentTask(index, e.target.checked);
                li.classList.toggle('checked', e.target.checked);
            });

            list.appendChild(li);
        });
    }

    // ==========================================
    // Recurrent Tasks - Daily Reset
    // ==========================================
    function getRecurrentTasksState() {
        const stored = localStorage.getItem('recurrentTasks');
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
        localStorage.setItem('recurrentTasks', JSON.stringify(state));
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
            localStorage.removeItem('recurrentTasks');
            localStorage.setItem('lastRecurrentReset', now.toISOString());
        }
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

        if (!title) {
            alert('Title is required');
            return;
        }

        if (editingTaskId) {
            await updateTask(editingTaskId, { title, description, priority });
        } else {
            await createTask({ title, description, priority });
        }

        closeModal(elements.taskModal);
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
                    ${report.notes && report.notes.length > 0 ?
                        report.notes.map(note => `
                            <div class="report-notes-item ${note.checked ? 'checked' : ''}">
                                ${note.checked ? '☑' : '☐'} ${escapeHtml(note.text)}
                            </div>
                        `).join('') :
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

        return `
            <div class="report-section">
                <h4>${title}</h4>
                ${taskList.map(task => `
                    <div class="report-task">
                        <div class="report-task-id">[${task.id.substring(0, 8)}]</div>
                        <div class="report-task-title">${escapeHtml(task.title)}</div>
                        ${task.description ? `<div class="report-task-desc">Description: ${escapeHtml(task.description)}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }

    async function handleArchive() {
        const doneTasks = tasks.filter(t => t.status === 'done');
        if (doneTasks.length === 0) {
            alert('No completed tasks to archive');
            return;
        }

        if (!confirm('Archive all completed tasks and generate a report?')) {
            return;
        }

        const report = await archiveTasks();
        if (report) {
            alert(`Report generated: ${report.title}`);
        }
    }

    // ==========================================
    // Notes Functions
    // ==========================================
    function generateNoteId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
    }

    function addNote() {
        const text = elements.newNoteInput.value.trim();
        if (!text) return;

        if (!notes.items) notes.items = [];

        notes.items.push({
            id: generateNoteId(),
            text,
            checked: false
        });

        elements.newNoteInput.value = '';
        renderNotes();
        saveNotes();
    }

    window.toggleNote = function(noteId) {
        const note = notes.items.find(n => n.id === noteId);
        if (note) {
            note.checked = !note.checked;
            renderNotes();
            saveNotes();
        }
    };

    window.deleteNote = function(noteId) {
        notes.items = notes.items.filter(n => n.id !== noteId);
        renderNotes();
        saveNotes();
    };

    function updateNoteText(noteId, newText) {
        const note = notes.items.find(n => n.id === noteId);
        if (note && newText.trim()) {
            note.text = newText.trim();
            saveNotes();
        } else if (note && !newText.trim()) {
            // Delete empty notes
            window.deleteNote(noteId);
        }
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

        // Archive
        elements.archiveBtn.addEventListener('click', handleArchive);

        // Reports
        elements.viewReportsBtn.addEventListener('click', openReportsModal);
        elements.reportsModalClose.addEventListener('click', () => closeModal(elements.reportsModal));

        // Notes
        elements.addNoteBtn.addEventListener('click', addNote);
        elements.newNoteInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addNote();
            }
        });

        // Close modals on outside click
        [elements.taskModal, elements.reportsModal, elements.confirmModal].forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    closeModal(modal);
                }
            });
        });

        // Close modals on ESC key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                [elements.taskModal, elements.reportsModal, elements.confirmModal].forEach(closeModal);
            }
        });
    }

    // ==========================================
    // Initialize
    // ==========================================
    async function init() {
        // Check for daily reset of recurrent tasks
        checkDailyReset();

        // Initialize UI
        renderRecurrentTasks();
        initEventListeners();
        initDragAndDrop();

        // Fetch data
        await Promise.all([fetchTasks(), fetchNotes()]);
    }

    // Start the application
    document.addEventListener('DOMContentLoaded', init);
})();
