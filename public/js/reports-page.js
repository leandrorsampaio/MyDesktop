/**
 * Reports page module — renders and manages the /:alias/reports page.
 */

import {
    fetchReportsApi, generateReportApi, deleteReportApi, summariseReportApi
} from './api.js';
import { renderReportView, openConfirmDialog } from './modals.js';

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
                <button type="button" class="btn --primary --sm js-generateReportBtn">Generate report</button>
            </div>
            <div class="reportsPage__tableWrap js-reportsTableWrap">
                <list-header class="js-listHeader"></list-header>
                <div class="reportsPage__rows js-reportsRows"></div>
            </div>
        </div>
    `;

    // Dynamically import components
    await Promise.all([
        import('/components/list-header/list-header.js'),
        import('/components/report-row/report-row.js')
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

    /** @type {string|null} The report currently open in the viewer. */
    let openReportId = null;

    /**
     * Puts the summary on the clipboard as plain bullets, ready to paste into
     * slides — which is where these end up.
     * @param {Object} report
     */
    async function copySummaryAsBullets(report) {
        if (!report?.summary) return;
        const lines = [report.summary.tldr, ''];
        for (const silo of report.summary.silos) {
            lines.push(silo.stakeholder ? `${silo.epic} (${silo.stakeholder})` : silo.epic);
            for (const bullet of silo.bullets) lines.push(`• ${bullet}`);
            lines.push('');
        }
        if (report.summary.attention?.length) {
            lines.push('Needs attention');
            for (const item of report.summary.attention) lines.push(`• ${item}`);
        }
        try {
            await navigator.clipboard.writeText(lines.join('\n').trim());
            if (toaster) toaster.success('Copied — paste into your slides');
        } catch {
            // Clipboard access can be denied; the text is still on screen.
            if (toaster) toaster.warning('Could not copy — select the text above instead');
        }
    }

    // View report — open modal with report content
    pageViewEl.addEventListener('view-report', (e) => {
        const { reportId } = e.detail;
        const report = reports.find(r => r.id === reportId);
        if (!report) return;
        openReportId = reportId;
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

    // FAB — generate new report (confirmed: it appends a permanent snapshot)
    /**
     * Writes (or rewrites) a report's AI summary and refreshes the list.
     * @param {string} reportId
     * @param {{silent?: boolean}} [opts] - silent skips the "no summary" notice,
     *        used for the automatic pass after generating.
     */
    async function summariseReport(reportId, { silent = false } = {}) {
        try {
            const result = await summariseReportApi(reportId);
            const index = reports.findIndex(r => r.id === reportId);
            if (index !== -1 && result.report) reports[index] = result.report;

            if (result.summarised) {
                if (toaster && !silent) toaster.success('Summary ready');
                // If the report is open, repaint it with the summary in place.
                if (openReportId === reportId) renderReportView(reports[index], elements);
            } else if (toaster && !silent) {
                toaster.warning(result.reason || 'Could not summarise this report');
            }
        } catch {
            if (toaster && !silent) toaster.error('Failed to summarise');
        }
    }

    // Re-summarise from the open report view — the first phrasing is not
    // always the one you want to put in front of a manager.
    elements.reportsContainer.addEventListener('click', (e) => {
        if (e.target.closest('.js-resummariseBtn')) {
            const btn = e.target.closest('.js-resummariseBtn');
            btn.disabled = true;
            btn.textContent = 'Summarising…';
            summariseReport(openReportId).finally(() => {
                btn.disabled = false;
                btn.textContent = 'Regenerate summary';
            });
        }
        if (e.target.closest('.js-copyBulletsBtn')) {
            copySummaryAsBullets(reports.find(r => r.id === openReportId));
        }
    });

    pageViewEl.querySelector('.js-generateReportBtn').addEventListener('click', async () => {
        const confirmed = await openConfirmDialog({
            title: 'Generate Report',
            message: 'Generate a report snapshot of the current board and notes? '
                + 'Tasks are not moved, archived or changed.',
            confirmLabel: 'Generate',
            variant: 'primary'
        });
        if (!confirmed) return;

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

                // Summarise afterwards, never as part of generating. The report
                // is already saved and on screen; the summary is an enrichment
                // that must not be able to delay or fail it.
                summariseReport(result.data.id, { silent: true });
            } else {
                if (toaster) toaster.error(result.error);
            }
        } catch (err) {
            console.error('Generate report error:', err);
            if (toaster) toaster.error('Failed to generate report');
        }
    });
}
