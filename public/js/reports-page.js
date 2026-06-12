/**
 * Reports page module — renders and manages the /:alias/reports page.
 */

import {
    fetchReportsApi, generateReportApi, deleteReportApi
} from './api.js';
import { renderReportView } from './modals.js';

/**
 * Initialises the reports page inside the given container element.
 * @param {HTMLElement} pageViewEl
 * @param {{ elements: Object }} opts - elements from app.js (for modals)
 */
export async function initReportsPage(pageViewEl, { elements }) {
    const toaster = document.querySelector('.js-toaster');

    pageViewEl.classList.add('--fullPage');
    pageViewEl.innerHTML = `
        <div class="reportsPage">
            <div class="reportsPage__header">
                <h2 class="reportsPage__title">Reports</h2>
                <span class="reportsPage__count js-reportsCount">Loading…</span>
            </div>
            <div class="reportsPage__tableWrap js-reportsTableWrap">
                <list-header class="js-listHeader"></list-header>
                <div class="reportsPage__rows js-reportsRows"></div>
            </div>
            <page-fab label="Generate report" icon="+"></page-fab>
        </div>
    `;

    // Dynamically import components
    await Promise.all([
        import('/components/list-header/list-header.js'),
        import('/components/report-row/report-row.js'),
        import('/components/page-fab/page-fab.js')
    ]);

    let reports = [];

    try {
        reports = await fetchReportsApi();
    } catch (err) {
        console.error('Reports page: failed to load data', err);
        if (toaster) toaster.error('Failed to load reports');
        pageViewEl.querySelector('.js-reportsCount').textContent = 'Error loading data';
        return;
    }

    // Sort newest first by default
    reports.sort((a, b) => new Date(b.generatedDate) - new Date(a.generatedDate));

    // Configure list-header
    const headerEl = pageViewEl.querySelector('.js-listHeader');
    headerEl.setColumns([
        { id: 'title',         label: 'Title',     sortable: false },
        { id: 'generatedDate', label: 'Generated',  sortable: false },
        { id: 'actions',       label: '',           sortable: false }
    ]);

    function updateCount() {
        const countEl = pageViewEl.querySelector('.js-reportsCount');
        if (countEl) {
            const n = reports.length;
            countEl.textContent = `${n} report${n !== 1 ? 's' : ''}`;
        }
    }

    function renderRows() {
        const rowsContainer = pageViewEl.querySelector('.js-reportsRows');
        if (!rowsContainer) return;
        rowsContainer.innerHTML = '';

        if (reports.length === 0) {
            rowsContainer.innerHTML = '<div class="reportsPage__empty">No reports generated yet. Use the + button to create one.</div>';
            updateCount();
            return;
        }

        reports.forEach(report => {
            const row = document.createElement('report-row');
            rowsContainer.appendChild(row);
            row.setReport(report);
        });

        updateCount();
    }

    renderRows();

    // View report — open modal with report content
    pageViewEl.addEventListener('view-report', (e) => {
        const { reportId } = e.detail;
        const report = reports.find(r => r.id === reportId);
        if (!report) return;
        renderReportView(report, elements);
        // Attach back button → close modal (renderReportView no longer
        // attaches its own handler; v2.38.3 deleted the dead modal-list path)
        const backBtn = elements.reportsContainer.querySelector('.js-backToReportsBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                elements.reportsModal.close();
            });
        }
        elements.reportsModal.open();
    });

    // Delete report
    pageViewEl.addEventListener('delete-report', async (e) => {
        const { reportId } = e.detail;
        try {
            await deleteReportApi(reportId);
            reports = reports.filter(r => r.id !== reportId);
            renderRows();
            if (toaster) toaster.success('Report deleted');
        } catch (err) {
            console.error('Delete report error:', err);
            if (toaster) toaster.error('Failed to delete report');
        }
    });

    // FAB — generate new report
    pageViewEl.querySelector('page-fab').addEventListener('fab-click', async () => {
        try {
            const result = await generateReportApi();
            if (result.ok) {
                if (toaster) toaster.success(`Report generated: ${result.data.title}`);
                // Reload reports to include the new one
                try {
                    reports = await fetchReportsApi();
                    reports.sort((a, b) => new Date(b.generatedDate) - new Date(a.generatedDate));
                    renderRows();
                } catch {
                    // Toast already shown; user can reload
                }
            } else {
                if (toaster) toaster.error(result.error);
            }
        } catch (err) {
            console.error('Generate report error:', err);
            if (toaster) toaster.error('Failed to generate report');
        }
    });
}
