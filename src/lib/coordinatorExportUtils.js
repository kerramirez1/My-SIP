import { formatDecimalHours } from './attendanceUtils'
import { extractIsoDatePart } from './useCoordinatorData'
import { formatCalendarDate, getTodayIsoDate } from './weekUtils'

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function buildWorksheetXml(name, headers, rows) {
  const safeName = escapeXml(name.slice(0, 31))
  const headerCells = headers
    .map(
      (h) =>
        `<Cell ss:StyleID="Header"><Data ss:Type="String">${escapeXml(h)}</Data></Cell>`,
    )
    .join('')

  const bodyRows = rows
    .map((row) => {
      const cells = row
        .map((val) => {
          if (typeof val === 'number' && Number.isFinite(val)) {
            return `<Cell><Data ss:Type="Number">${val}</Data></Cell>`
          }
          return `<Cell><Data ss:Type="String">${escapeXml(val ?? '')}</Data></Cell>`
        })
        .join('')
      return `<Row>${cells}</Row>`
    })
    .join('\n')

  return `<Worksheet ss:Name="${safeName}"><Table><Row>${headerCells}</Row>\n${bodyRows}</Table></Worksheet>`
}

/**
 * Generates an Excel-compatible SpreadsheetML (.xls) multi-sheet workbook
 * reflecting the exact active filters, progress, supervisor workload,
 * consolidated summary, and filtered submissions.
 */
export function buildMonitoringExcelWorkbook({
  filterSummary,
  totals,
  internProgressRows,
  supervisorWorkload,
  reportMatrix,
  reportTotals,
  progressDistribution,
  filteredSubmissions,
  attendanceAnalytics,
  taskAnalytics,
}) {
  const generatedOn = getTodayIsoDate()

  const summarySheet = buildWorksheetXml(
    'Summary',
    ['Metric / Filter', 'Value'],
    [
      ['Report Title', 'My SIP Portal — Coordinator Monitoring & Analytics Report'],
      ['Generated Date', generatedOn],
      ['Academic Year', filterSummary.academicYear],
      ['Semester', filterSummary.semester],
      ['Internship Batch', filterSummary.batch],
      ['Company', filterSummary.company],
      ['Supervisor', filterSummary.supervisor],
      ['Date Range', filterSummary.dateRange],
      ['Submission Scope', filterSummary.submissionFilters],
      ['Total Active Interns', totals.totalInterns],
      ['Pending Supervisor Reviews', totals.totalPendingApprovals],
      ['Interns Needing Attention', totals.internsNeedingAttention],
      ['Total Approved Hours', Number(totals.totalApprovedHours.toFixed(2))],
      [
        'Remaining Required Hours',
        Number((totals.totalRemainingHours ?? 0).toFixed(2)),
      ],
      ['Average Completion (%)', totals.avgProgressPct],
      [
        'Weekly Attendance Compliance (%)',
        attendanceAnalytics?.complianceRatePct ?? 'N/A',
      ],
      [
        'Task Completion Rate (%)',
        taskAnalytics?.completionRatePct ?? 'N/A',
      ],
      [
        'Average Supervisor Review Time',
        totals.overallAvgTurnaroundLabel || '—',
      ],
    ],
  )

  const progressSheet = buildWorksheetXml(
    'Intern Progress',
    [
      'Intern Name',
      'Student ID',
      'School',
      'Course',
      'Company',
      'Assigned Supervisor',
      'Approved Hours',
      'Required Hours',
      'Remaining Hours',
      'Progress (%)',
      'Last Submission Date',
      'Pending Count',
      'Returned Count',
    ],
    internProgressRows.map((i) => [
      i.full_name,
      i.student_id_no ?? '',
      i.school_name ?? '',
      i.course ?? '',
      i.company_name ?? '',
      i.supervisorName === '—' ? '' : i.supervisorName,
      Number(i.approvedHours.toFixed(2)),
      i.requiredHours,
      Number(i.remainingHours.toFixed(2)),
      i.progressPct,
      i.lastSubmissionDate || '',
      i.pendingCount,
      i.returnedCount,
    ]),
  )

  const supervisorSheet = buildWorksheetXml(
    'Supervisor Workload',
    [
      'Supervisor Name',
      'Company',
      'Assigned Interns',
      'Pending Reviews',
      'Approved Submissions',
      'Returned Submissions',
      'Rejected Submissions',
      'Average Review Time',
    ],
    supervisorWorkload.map((s) => [
      s.full_name,
      s.company_name ?? '',
      s.assignedInternsCount,
      s.pendingReviews,
      s.approvedSubmissions,
      s.returnedSubmissions,
      s.rejectedSubmissions,
      s.avgReviewTurnaroundLabel || '—',
    ]),
  )

  const consolidatedSheet = buildWorksheetXml(
    'Consolidated Report',
    [
      'Record Type',
      'Pending Supervisor Review',
      'Assigned – Not Submitted',
      'Approved by Supervisor',
      'Returned for Revision',
      'Rejected',
      'Total',
    ],
    [
      ...reportMatrix.map((r) => [
        r.label,
        r.pending,
        r.key === 'tasks' ? r.notSubmitted : 0,
        r.approved,
        r.returned,
        r.rejected,
        r.total,
      ]),
      [
        'Totals',
        reportTotals.pending,
        reportTotals.notSubmitted,
        reportTotals.approved,
        reportTotals.returned,
        reportTotals.rejected,
        reportTotals.total,
      ],
      ['', '', '', '', '', '', ''],
      ['Progress Band', 'Intern Count', 'Share (%)', '', '', '', ''],
      ...progressDistribution.map((b) => [
        b.label,
        b.count,
        b.sharePct,
        '',
        '',
        '',
        '',
      ]),
    ],
  )

  const submissionsSheet = buildWorksheetXml(
    'Submissions',
    [
      'Intern',
      'Student ID',
      'Submission Type',
      'Title or Summary',
      'Reporting Period',
      'Submission Date',
      'Supervisor',
      'Status',
      'Reviewed By',
      'Review Date',
      'Supervisor Remarks',
    ],
    filteredSubmissions.map((item) => [
      item.internName,
      item.studentIdNo || '',
      item.typeLabel,
      item.csvTitleOrDate,
      item.reportingPeriod || '',
      item.submissionDateIso || '',
      item.supervisorName === '—' ? '' : item.supervisorName,
      item.displayStatusLabel,
      item.reviewerName || '',
      item.row.reviewed_at ? extractIsoDatePart(item.row.reviewed_at) : '',
      item.row.reviewer_remarks ?? '',
    ]),
  )

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Header">
      <Font ss:Bold="1" />
      <Interior ss:Color="#EAF1FA" ss:Pattern="Solid" />
    </Style>
  </Styles>
  ${summarySheet}
  ${progressSheet}
  ${supervisorSheet}
  ${consolidatedSheet}
  ${submissionsSheet}
</Workbook>`
}

export function triggerFileDownload(content, mimeType, filename) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Generates clean semantic HTML for printing / saving as PDF via the browser's
 * native PDF print engine, matching the portal's institutional aesthetic.
 */
export function buildMonitoringPdfHtml({
  filterSummary,
  totals,
  internProgressRows,
  supervisorWorkload,
  reportMatrix,
  reportTotals,
  progressDistribution,
  filteredSubmissions,
}) {
  const todayLabel = formatCalendarDate(getTodayIsoDate())

  const internRowsHtml =
    internProgressRows.length === 0
      ? '<tr><td colspan="8">No interns match the selected filters.</td></tr>'
      : internProgressRows
          .map(
            (i) => `<tr>
              <td><strong>${escapeHtml(i.full_name)}</strong></td>
              <td>${escapeHtml(i.student_id_no || '—')}</td>
              <td>${escapeHtml(i.company_name || '—')}</td>
              <td>${escapeHtml(i.supervisorName)}</td>
              <td class="num">${escapeHtml(i.approvedHours.toFixed(2))} hrs</td>
              <td class="num">${escapeHtml(i.requiredHours)} hrs</td>
              <td class="num">${escapeHtml(i.progressPct.toFixed(1))}%</td>
              <td class="num">${escapeHtml(i.pendingCount)}</td>
            </tr>`,
          )
          .join('')

  const supervisorRowsHtml =
    supervisorWorkload.length === 0
      ? '<tr><td colspan="6">No supervisors match the selected filters.</td></tr>'
      : supervisorWorkload
          .map(
            (s) => `<tr>
              <td><strong>${escapeHtml(s.full_name)}</strong></td>
              <td class="num">${escapeHtml(s.assignedInternsCount)}</td>
              <td class="num">${escapeHtml(s.pendingReviews)}</td>
              <td class="num">${escapeHtml(s.approvedSubmissions)}</td>
              <td class="num">${escapeHtml(s.returnedSubmissions)}</td>
              <td class="num">${escapeHtml(s.avgReviewTurnaroundLabel || '—')}</td>
            </tr>`,
          )
          .join('')

  const matrixRowsHtml = reportMatrix
    .map(
      (r) => `<tr>
        <td><strong>${escapeHtml(r.label)}</strong></td>
        <td class="num">${escapeHtml(r.pending)}</td>
        <td class="num">${r.key === 'tasks' ? escapeHtml(r.notSubmitted) : '—'}</td>
        <td class="num">${escapeHtml(r.approved)}</td>
        <td class="num">${escapeHtml(r.returned)}</td>
        <td class="num">${escapeHtml(r.rejected)}</td>
        <td class="num"><strong>${escapeHtml(r.total)}</strong></td>
      </tr>`,
    )
    .join('')

  const distRowsHtml = progressDistribution
    .map(
      (b) => `<tr>
        <td>${escapeHtml(b.label)}</td>
        <td class="num">${escapeHtml(b.count)}</td>
        <td class="num">${escapeHtml(b.sharePct.toFixed(1))}%</td>
      </tr>`,
    )
    .join('')

  const submissionRowsHtml =
    filteredSubmissions.length === 0
      ? '<tr><td colspan="7">No submissions match the selected filters.</td></tr>'
      : filteredSubmissions
          .map(
            (item) => `<tr>
              <td>${escapeHtml(item.internName)}</td>
              <td>${escapeHtml(item.typeLabel)}</td>
              <td>${escapeHtml(item.csvTitleOrDate)}</td>
              <td>${escapeHtml(item.reportingPeriod)}</td>
              <td>${escapeHtml(item.submissionDateIso ? formatCalendarDate(item.submissionDateIso) : '—')}</td>
              <td>${escapeHtml(item.supervisorName)}</td>
              <td>${escapeHtml(item.displayStatusLabel)}</td>
            </tr>`,
          )
          .join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>SIP Coordinator Monitoring Report — ${escapeHtml(getTodayIsoDate())}</title>
  <style>
    @page { size: landscape; margin: 14mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
      color: #14171D;
      background: #FFFFFF;
      margin: 0;
      padding: 20px;
      font-size: 11px;
      line-height: 1.45;
    }
    header {
      border-bottom: 2px solid #18498C;
      padding-bottom: 10px;
      margin-bottom: 14px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      gap: 16px;
    }
    h1 { margin: 0; font-size: 18px; color: #14171D; letter-spacing: -0.02em; }
    .meta { color: #525968; font-size: 10px; }
    .filters {
      background: #F8F9FB;
      border: 1px solid #DFE3E8;
      border-radius: 4px;
      padding: 8px 12px;
      margin-bottom: 14px;
      font-size: 10px;
      color: #525968;
    }
    .filters strong { color: #14171D; }
    .kpis {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 16px;
    }
    .kpi {
      border: 1px solid #DFE3E8;
      border-radius: 4px;
      padding: 8px 10px;
    }
    .kpi-label { font-size: 10px; color: #525968; }
    .kpi-val { font-size: 16px; font-weight: 700; margin-top: 2px; font-variant-numeric: tabular-nums; }
    h2 {
      font-size: 13px;
      margin: 16px 0 6px;
      color: #18498C;
      page-break-after: avoid;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
      font-size: 10px;
    }
    th, td {
      border: 1px solid #DFE3E8;
      padding: 5px 7px;
      text-align: left;
      vertical-align: top;
    }
    th { background: #F8F9FB; color: #525968; font-weight: 600; }
    tfoot td { background: #F8F9FB; font-weight: 700; border-top: 2px solid #717987; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .two-col { display: grid; grid-template-columns: 2fr 1fr; gap: 14px; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>My SIP Portal — Coordinator Monitoring Report</h1>
      <div class="meta">Student Internship Program Program-Wide Monitoring &amp; Analytics</div>
    </div>
    <div class="meta">Generated on ${escapeHtml(todayLabel)}</div>
  </header>

  <div class="filters">
    <strong>Active Filters:</strong>
    Academic Year: ${escapeHtml(filterSummary.academicYear)} |
    Semester: ${escapeHtml(filterSummary.semester)} |
    Batch: ${escapeHtml(filterSummary.batch)} |
    Company: ${escapeHtml(filterSummary.company)} |
    Supervisor: ${escapeHtml(filterSummary.supervisor)} |
    Date Range: ${escapeHtml(filterSummary.dateRange)} |
    Explorer: ${escapeHtml(filterSummary.submissionFilters)}
  </div>

  <div class="kpis">
    <div class="kpi"><div class="kpi-label">Total Interns</div><div class="kpi-val">${escapeHtml(totals.totalInterns)}</div></div>
    <div class="kpi"><div class="kpi-label">Pending Approvals</div><div class="kpi-val">${escapeHtml(totals.totalPendingApprovals)}</div></div>
    <div class="kpi"><div class="kpi-label">Interns Needing Attention</div><div class="kpi-val">${escapeHtml(totals.internsNeedingAttention)}</div></div>
    <div class="kpi"><div class="kpi-label">Total Approved Hours</div><div class="kpi-val">${escapeHtml(formatDecimalHours(totals.totalApprovedMinutes))}</div></div>
  </div>

  <div class="two-col">
    <div>
      <h2>Consolidated Submission Summary</h2>
      <table>
        <thead>
          <tr>
            <th>Record Type</th>
            <th class="num">Pending Review</th>
            <th class="num">Assigned – Not Submitted</th>
            <th class="num">Approved</th>
            <th class="num">Returned</th>
            <th class="num">Rejected</th>
            <th class="num">Total</th>
          </tr>
        </thead>
        <tbody>${matrixRowsHtml}</tbody>
        <tfoot>
          <tr>
            <td>Totals</td>
            <td class="num">${escapeHtml(reportTotals.pending)}</td>
            <td class="num">${escapeHtml(reportTotals.notSubmitted)}</td>
            <td class="num">${escapeHtml(reportTotals.approved)}</td>
            <td class="num">${escapeHtml(reportTotals.returned)}</td>
            <td class="num">${escapeHtml(reportTotals.rejected)}</td>
            <td class="num">${escapeHtml(reportTotals.total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    <div>
      <h2>Progress Distribution</h2>
      <table>
        <thead>
          <tr><th>Progress Band</th><th class="num">Interns</th><th class="num">Share</th></tr>
        </thead>
        <tbody>${distRowsHtml}</tbody>
      </table>
    </div>
  </div>

  <h2>Intern Progress</h2>
  <table>
    <thead>
      <tr>
        <th>Intern</th><th>Student ID</th><th>Company</th><th>Supervisor</th>
        <th class="num">Approved</th><th class="num">Required</th><th class="num">Progress</th><th class="num">Pending</th>
      </tr>
    </thead>
    <tbody>${internRowsHtml}</tbody>
  </table>

  <h2>Supervisor Workload &amp; Performance</h2>
  <table>
    <thead>
      <tr>
        <th>Supervisor</th><th class="num">Assigned Interns</th><th class="num">Pending Reviews</th><th class="num">Approved</th><th class="num">Returned</th><th class="num">Avg Review Time</th>
      </tr>
    </thead>
    <tbody>${supervisorRowsHtml}</tbody>
  </table>

  <h2>Filtered Submissions (${escapeHtml(filteredSubmissions.length)})</h2>
  <table>
    <thead>
      <tr>
        <th>Intern</th><th>Type</th><th>Title / Summary</th><th>Period</th><th>Date</th><th>Supervisor</th><th>Status</th>
      </tr>
    </thead>
    <tbody>${submissionRowsHtml}</tbody>
  </table>
</body>
</html>`
}
