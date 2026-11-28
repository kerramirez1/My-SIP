import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertMessage } from '../../components/AlertMessage'
import {
  ComparisonBarChart,
  ProgressHorizontalBars,
  StatusDonutChart,
  TrendLineChart,
} from '../../components/CoordinatorCharts'
import { formatDecimalHours } from '../../lib/attendanceUtils'
import {
  buildMonitoringExcelWorkbook,
  buildMonitoringPdfHtml,
  triggerFileDownload,
} from '../../lib/coordinatorExportUtils'
import { useCoordinatorData } from '../../lib/useCoordinatorData'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { getTodayIsoDate } from '../../lib/weekUtils'
import {
  InternDetailDialog,
  SubmissionDetailDialog,
  SupervisorDetailDialog,
} from './CoordinatorMonitoringDialogs'

export function CoordinatorReportsPage() {
  useDocumentTitle('Reports & Analytics')

  const navigate = useNavigate()
  const todayIso = getTodayIsoDate()

  // Global analytics filters
  const [academicYear, setAcademicYear] = useState('all')
  const [semester, setSemester] = useState('all')
  const [batch, setBatch] = useState('all')
  const [company, setCompany] = useState('all')
  const [supervisorId, setSupervisorId] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [exportNotice, setExportNotice] = useState('')

  const [selectedSupervisor, setSelectedSupervisor] = useState(null)
  const [selectedIntern, setSelectedIntern] = useState(null)
  const [selectedSubmission, setSelectedSubmission] = useState(null)

  const {
    loading,
    loadError,
    filterOptions,
    internProgressRows,
    supervisorWorkload,
    allSubmissions,
    totals,
    reportMatrix,
    reportTotals,
    progressDistribution,
    progressAnalytics,
    attendanceAnalytics,
    accomplishmentAnalytics,
    taskAnalytics,
    supervisorAnalytics,
    reload,
  } = useCoordinatorData({
    academicYear,
    semester,
    batch,
    company,
    supervisorId,
    dateFrom,
    dateTo,
  })

  const activeFilterCount = [
    academicYear !== 'all',
    semester !== 'all',
    batch !== 'all',
    company !== 'all',
    supervisorId !== 'all',
    Boolean(dateFrom),
    Boolean(dateTo),
  ].filter(Boolean).length

  function resetAllFilters() {
    setAcademicYear('all')
    setSemester('all')
    setBatch('all')
    setCompany('all')
    setSupervisorId('all')
    setDateFrom('')
    setDateTo('')
  }

  const filterSummary = useMemo(() => {
    const supName =
      supervisorId === 'all'
        ? 'All supervisors'
        : supervisorId === 'unassigned'
          ? 'Unassigned interns'
          : filterOptions.supervisors.find((s) => s.id === supervisorId)
              ?.full_name || 'Selected supervisor'

    return {
      academicYear:
        academicYear === 'all' ? 'All academic years' : academicYear,
      semester: semester === 'all' ? 'All semesters' : semester,
      batch: batch === 'all' ? 'All batches' : batch,
      company: company === 'all' ? 'All host organizations' : company,
      supervisor: supName,
      dateRange:
        dateFrom || dateTo
          ? `${dateFrom || 'Start'} to ${dateTo || 'Present'}`
          : 'All dates',
      submissionFilters: 'All submission types',
    }
  }, [
    academicYear,
    batch,
    company,
    dateFrom,
    dateTo,
    filterOptions.supervisors,
    semester,
    supervisorId,
  ])

  function handleExportExcel() {
    const xml = buildMonitoringExcelWorkbook({
      filterSummary,
      totals,
      internProgressRows,
      supervisorWorkload,
      reportMatrix,
      reportTotals,
      progressDistribution,
      filteredSubmissions: allSubmissions,
      attendanceAnalytics,
      taskAnalytics,
    })
    triggerFileDownload(
      xml,
      'application/vnd.ms-excel;charset=utf-8',
      `sip-analytics-report-${todayIso}.xls`,
    )
    setExportNotice(
      'Excel analytics workbook downloaded reflecting all active filters.',
    )
  }

  function handleExportPdf() {
    const html = buildMonitoringPdfHtml({
      filterSummary,
      totals,
      internProgressRows,
      supervisorWorkload,
      reportMatrix,
      reportTotals,
      progressDistribution,
      filteredSubmissions: allSubmissions,
    })
    const win = window.open('', '_blank', 'width=1120,height=780')
    if (!win) {
      setExportNotice(
        'Pop-up blocked by your browser. Allow pop-ups for this site to generate the printable PDF report.',
      )
      return
    }
    win.document.open()
    win.document.write(html)
    win.document.close()
    win.focus()
    window.setTimeout(() => {
      win.print()
    }, 250)
  }

  // Chart datasets derived 100% from live filtered Supabase records
  const accomplishmentDonutSegments = useMemo(
    () => [
      {
        key: 'approved',
        label: 'Approved',
        value: accomplishmentAnalytics.approvedCount,
        color: 'var(--color-success-border)',
      },
      {
        key: 'pending',
        label: 'Pending Supervisor Review',
        value: accomplishmentAnalytics.pendingCount,
        color: 'var(--color-accent-solid)',
      },
      {
        key: 'returned',
        label: 'Returned for Revision',
        value: accomplishmentAnalytics.returnedCount,
        color: 'var(--color-error-border)',
      },
      {
        key: 'missing',
        label: 'Missing This Week',
        value: accomplishmentAnalytics.missingThisWeekCount,
        color: 'var(--color-input-border)',
      },
    ],
    [accomplishmentAnalytics],
  )

  const taskDonutSegments = useMemo(
    () => [
      {
        key: 'completed',
        label: 'Completed (Approved)',
        value: taskAnalytics.completedCount,
        color: 'var(--color-success-border)',
      },
      {
        key: 'pending_review',
        label: 'Pending Supervisor Review',
        value: taskAnalytics.pendingSubmittedCount,
        color: 'var(--color-accent-solid)',
      },
      {
        key: 'not_submitted',
        label: 'Assigned – Not Submitted',
        value: taskAnalytics.notSubmittedCount,
        color: 'var(--color-input-border)',
      },
      {
        key: 'returned',
        label: 'Returned for Revision',
        value: taskAnalytics.returnedCount,
        color: 'var(--color-error-border)',
      },
      {
        key: 'rejected',
        label: 'Rejected',
        value: taskAnalytics.rejectedCount,
        color: 'var(--color-rejected-bg)',
      },
    ],
    [taskAnalytics],
  )

  const supervisorChartData = useMemo(
    () =>
      supervisorWorkload.map((sup) => ({
        id: sup.id,
        label: sup.full_name,
        fullLabel: sup.full_name,
        assigned: sup.assignedInternsCount,
        pending: sup.pendingReviews,
        approved: sup.approvedSubmissions,
        returned: sup.returnedSubmissions,
      })),
    [supervisorWorkload],
  )

  return (
    <div className="max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1
            id="main-content"
            tabIndex={-1}
            className="ledger-title text-[clamp(1.375rem,1.2rem+0.6vw,1.75rem)] font-semibold leading-[1.2] tracking-[-0.02em] text-ink outline-none"
          >
            Reports &amp; Analytics
          </h1>
          <p className="mt-1.5 max-w-[66ch] text-sm leading-[1.55] text-ink-muted">
            Program-wide progress analytics, weekly compliance trends, task
            completion metrics, supervisor review performance, and filtered
            exports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={handleExportExcel}
            className="inline-flex min-h-10 items-center justify-center rounded-[5px] border border-rule bg-surface px-3.5 text-xs font-medium text-ink hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-55"
          >
            Export Excel (.xls)
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={handleExportPdf}
            className="inline-flex min-h-10 items-center justify-center rounded-[5px] bg-accent-solid px-3.5 text-xs font-medium text-on-accent hover:bg-accent-solid-hover disabled:cursor-not-allowed disabled:opacity-55"
          >
            Export PDF Report
          </button>
        </div>
      </header>

      {exportNotice ? (
        <AlertMessage message={exportNotice} variant="success" />
      ) : null}

      {loadError ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <AlertMessage
              message={`Could not load analytics data: ${loadError}`}
              variant="error"
            />
          </div>
          <button
            type="button"
            onClick={reload}
            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-[5px] border border-rule bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-subtle"
          >
            Retry
          </button>
        </div>
      ) : null}

      {/* Global Analytics Filters */}
      <search
        aria-label="Analytics global filters"
        className="rounded-[6px] border border-rule bg-surface p-4 sm:p-5"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-[0.04em] text-ink-muted">
              Analytics &amp; Report Filters
            </h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              All charts, metrics, tables, and Excel/PDF exports reflect these
              filters.
            </p>
          </div>
          {activeFilterCount > 0 ? (
            <button
              type="button"
              onClick={resetAllFilters}
              className="inline-flex min-h-8 items-center rounded-[5px] border border-rule bg-surface-subtle px-3 text-xs font-medium text-ink hover:bg-surface"
            >
              Reset filters ({activeFilterCount})
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="rep-filter-ay"
              className="text-xs font-medium text-ink-muted"
            >
              Academic Year
            </label>
            <select
              id="rep-filter-ay"
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="min-h-10 w-full rounded-[5px] border border-input-border bg-surface px-2.5 text-xs text-ink hover:border-ink"
            >
              <option value="all">All years</option>
              {filterOptions.academicYears.map((ay) => (
                <option key={ay} value={ay}>
                  {ay}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="rep-filter-sem"
              className="text-xs font-medium text-ink-muted"
            >
              Semester
            </label>
            <select
              id="rep-filter-sem"
              value={semester}
              onChange={(e) => setSemester(e.target.value)}
              className="min-h-10 w-full rounded-[5px] border border-input-border bg-surface px-2.5 text-xs text-ink hover:border-ink"
            >
              <option value="all">All semesters</option>
              {filterOptions.semesters.map((sem) => (
                <option key={sem} value={sem}>
                  {sem}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="rep-filter-batch"
              className="text-xs font-medium text-ink-muted"
            >
              Internship Batch
            </label>
            <select
              id="rep-filter-batch"
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              className="min-h-10 w-full rounded-[5px] border border-input-border bg-surface px-2.5 text-xs text-ink hover:border-ink"
            >
              <option value="all">All batches</option>
              {filterOptions.batches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="rep-filter-company"
              className="text-xs font-medium text-ink-muted"
            >
              Host Organization / Institution
            </label>
            <select
              id="rep-filter-company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="min-h-10 w-full rounded-[5px] border border-input-border bg-surface px-2.5 text-xs text-ink hover:border-ink"
            >
              <option value="all">All host organizations</option>
              {filterOptions.companies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="rep-filter-supervisor"
              className="text-xs font-medium text-ink-muted"
            >
              Supervisor
            </label>
            <select
              id="rep-filter-supervisor"
              value={supervisorId}
              onChange={(e) => setSupervisorId(e.target.value)}
              className="min-h-10 w-full rounded-[5px] border border-input-border bg-surface px-2.5 text-xs text-ink hover:border-ink"
            >
              <option value="all">All supervisors</option>
              {filterOptions.supervisors.map((sup) => (
                <option key={sup.id} value={sup.id}>
                  {sup.full_name}
                </option>
              ))}
              {filterOptions.hasUnassignedIntern ? (
                <option value="unassigned">Unassigned interns</option>
              ) : null}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="rep-filter-from"
              className="text-xs font-medium text-ink-muted"
            >
              Date from
            </label>
            <input
              id="rep-filter-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="min-h-10 w-full rounded-[5px] border border-input-border bg-surface px-2.5 text-xs text-ink hover:border-ink"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="rep-filter-to"
              className="text-xs font-medium text-ink-muted"
            >
              Date to
            </label>
            <input
              id="rep-filter-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="min-h-10 w-full rounded-[5px] border border-input-border bg-surface px-2.5 text-xs text-ink hover:border-ink"
            />
          </div>
        </div>
      </search>

      {loading ? (
        <div className="flex items-center gap-3 rounded-[6px] border border-rule bg-surface px-5 py-14 text-sm text-ink-muted">
          <progress
            aria-label="Loading analytics dashboard"
            className="loading-spinner"
          />
          <span>Calculating program analytics…</span>
        </div>
      ) : (
        <>
          {/* A. Internship Progress Analytics */}
          <section
            aria-labelledby="progress-analytics-heading"
            className="overflow-hidden rounded-[6px] border border-rule bg-surface"
          >
            <div className="border-b border-rule bg-surface-subtle px-5 py-3.5">
              <h2
                id="progress-analytics-heading"
                className="text-sm font-semibold text-ink"
              >
                Internship Progress Analytics
              </h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                Approved hours completion distribution and remaining required
                internship hours
              </p>
            </div>

            <div className="dashboard-metric-wrap border-b border-rule">
              <dl className="dashboard-metric-grid">
                <div className="dashboard-metric-cell">
                  <dt className="text-xs font-medium text-ink-muted">
                    Average Completion
                  </dt>
                  <dd className="text-xl font-semibold tabular-nums text-ink">
                    {progressAnalytics.avgCompletionPct.toFixed(1)}%
                  </dd>
                  <dd className="text-xs tabular-nums text-ink-muted">
                    Across {totals.totalInterns}{' '}
                    {totals.totalInterns === 1 ? 'intern' : 'interns'}
                  </dd>
                </div>
                <div className="dashboard-metric-cell">
                  <dt className="text-xs font-medium text-ink-muted">
                    Total Approved Hours
                  </dt>
                  <dd className="text-xl font-semibold tabular-nums text-ink">
                    {formatDecimalHours(progressAnalytics.totalApprovedMinutes)}
                  </dd>
                  <dd className="text-xs text-ink-muted">
                    Approved attendance only
                  </dd>
                </div>
                <div className="dashboard-metric-cell">
                  <dt className="text-xs font-medium text-ink-muted">
                    Remaining Required Hours
                  </dt>
                  <dd className="text-xl font-semibold tabular-nums text-ink">
                    {formatDecimalHours(progressAnalytics.totalRemainingMinutes)}
                  </dd>
                  <dd className="text-xs text-ink-muted">
                    Outstanding target balance
                  </dd>
                </div>
                <div className="dashboard-metric-cell">
                  <dt className="text-xs font-medium text-ink-muted">
                    Program Required Target
                  </dt>
                  <dd className="text-xl font-semibold tabular-nums text-ink">
                    {progressAnalytics.totalRequiredHours.toLocaleString()} hrs
                  </dd>
                  <dd className="text-xs text-ink-muted">
                    Combined cohort requirement
                  </dd>
                </div>
              </dl>
            </div>

            <div className="p-5">
              <h3 className="mb-3 text-xs font-semibold text-ink">
                Internship Hours Completion Distribution
              </h3>
              <ProgressHorizontalBars
                bands={progressAnalytics.distribution}
                totalCount={totals.totalInterns}
                emptyMessage="No intern profiles match the current filters."
              />
            </div>
          </section>

          {/* B. Attendance Analytics */}
          <section
            aria-labelledby="attendance-analytics-heading"
            className="overflow-hidden rounded-[6px] border border-rule bg-surface"
          >
            <div className="border-b border-rule bg-surface-subtle px-5 py-3.5">
              <h2
                id="attendance-analytics-heading"
                className="text-sm font-semibold text-ink"
              >
                Attendance Analytics
              </h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                Weekly attendance submission activity, approved hours rendered
                per week, and compliance trends
              </p>
            </div>

            <div className="dashboard-metric-wrap border-b border-rule">
              <dl className="dashboard-metric-grid">
                <div className="dashboard-metric-cell">
                  <dt className="text-xs font-medium text-ink-muted">
                    Weekly Attendance Compliance
                  </dt>
                  <dd className="text-xl font-semibold tabular-nums text-ink">
                    {attendanceAnalytics.complianceRatePct !== null
                      ? `${attendanceAnalytics.complianceRatePct.toFixed(1)}%`
                      : '—'}
                  </dd>
                  <dd className="text-xs tabular-nums text-ink-muted">
                    {attendanceAnalytics.loggedThisWeekCount} of{' '}
                    {attendanceAnalytics.eligibleThisWeekCount} started interns
                    this week
                  </dd>
                </div>
                <div className="dashboard-metric-cell">
                  <dt className="text-xs font-medium text-ink-muted">
                    Approved Rendered Hours
                  </dt>
                  <dd className="text-xl font-semibold tabular-nums text-ink">
                    {formatDecimalHours(
                      attendanceAnalytics.totalApprovedMinutes,
                    )}
                  </dd>
                  <dd className="text-xs tabular-nums text-ink-muted">
                    {attendanceAnalytics.approvedEntries} approved{' '}
                    {attendanceAnalytics.approvedEntries === 1
                      ? 'entry'
                      : 'entries'}
                  </dd>
                </div>
                <div className="dashboard-metric-cell">
                  <dt className="text-xs font-medium text-ink-muted">
                    Total Attendance Records
                  </dt>
                  <dd className="text-xl font-semibold tabular-nums text-ink">
                    {attendanceAnalytics.totalEntries}
                  </dd>
                  <dd className="text-xs tabular-nums text-ink-muted">
                    {attendanceAnalytics.pendingEntries} pending ·{' '}
                    {attendanceAnalytics.returnedEntries} returned
                  </dd>
                </div>
                <div className="dashboard-metric-cell">
                  <dt className="text-xs font-medium text-ink-muted">
                    Missing Attendance This Week
                  </dt>
                  <dd
                    className={`text-xl font-semibold tabular-nums ${
                      attendanceAnalytics.missingThisWeekCount > 0
                        ? 'text-error'
                        : 'text-ink'
                    }`}
                  >
                    {attendanceAnalytics.missingThisWeekCount}
                  </dd>
                  <dd className="text-xs text-ink-muted">
                    Started interns without current-week log
                  </dd>
                </div>
              </dl>
            </div>

            <div className="grid grid-cols-1 divide-y divide-rule lg:grid-cols-2 lg:divide-x lg:divide-y-0">
              <div className="p-5">
                <h3 className="mb-3 text-xs font-semibold text-ink">
                  Weekly Attendance Submissions &amp; Missing Trends
                </h3>
                <TrendLineChart
                  title="Weekly attendance submission and missing intern trends"
                  data={attendanceAnalytics.weeklyTrends}
                  series={[
                    {
                      key: 'submissionsCount',
                      label: 'Attendance Entries Logged',
                      color: 'var(--color-accent-solid)',
                    },
                    {
                      key: 'missingInternsCount',
                      label: 'Interns Missing Attendance',
                      color: 'var(--color-error-border)',
                      dashed: true,
                    },
                  ]}
                  emptyMessage="Not enough attendance records yet to plot weekly submission and missing trends."
                />
              </div>

              <div className="p-5">
                <h3 className="mb-3 text-xs font-semibold text-ink">
                  Total Approved Rendered Hours per Week
                </h3>
                <ComparisonBarChart
                  title="Total approved rendered hours per week"
                  data={attendanceAnalytics.weeklyTrends}
                  series={[
                    {
                      key: 'approvedHours',
                      label: 'Approved Hours',
                      color: 'var(--color-success-border)',
                    },
                  ]}
                  valueSuffix="h"
                  emptyMessage="No approved attendance hours recorded in the selected filter range."
                />
              </div>
            </div>
          </section>

          {/* C. Accomplishment Analytics */}
          <section
            aria-labelledby="accomplishment-analytics-heading"
            className="overflow-hidden rounded-[6px] border border-rule bg-surface"
          >
            <div className="border-b border-rule bg-surface-subtle px-5 py-3.5">
              <h2
                id="accomplishment-analytics-heading"
                className="text-sm font-semibold text-ink"
              >
                Accomplishment Analytics
              </h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                Weekly accomplishment report trends and breakdown of submitted,
                approved, returned, and missing reports
              </p>
            </div>

            <div className="dashboard-metric-wrap border-b border-rule">
              <dl className="dashboard-metric-grid">
                <div className="dashboard-metric-cell">
                  <dt className="text-xs font-medium text-ink-muted">
                    Submitted Reports
                  </dt>
                  <dd className="text-xl font-semibold tabular-nums text-ink">
                    {accomplishmentAnalytics.submittedTotal}
                  </dd>
                  <dd className="text-xs tabular-nums text-ink-muted">
                    {accomplishmentAnalytics.pendingCount} pending review
                  </dd>
                </div>
                <div className="dashboard-metric-cell">
                  <dt className="text-xs font-medium text-ink-muted">
                    Approved Reports
                  </dt>
                  <dd className="text-xl font-semibold tabular-nums text-ink">
                    {accomplishmentAnalytics.approvedCount}
                  </dd>
                  <dd className="text-xs text-ink-muted">
                    Validated by supervisors
                  </dd>
                </div>
                <div className="dashboard-metric-cell">
                  <dt className="text-xs font-medium text-ink-muted">
                    Returned for Revision
                  </dt>
                  <dd className="text-xl font-semibold tabular-nums text-ink">
                    {accomplishmentAnalytics.returnedCount}
                  </dd>
                  <dd className="text-xs text-ink-muted">
                    Awaiting intern update
                  </dd>
                </div>
                <div className="dashboard-metric-cell">
                  <dt className="text-xs font-medium text-ink-muted">
                    Missing This Week
                  </dt>
                  <dd
                    className={`text-xl font-semibold tabular-nums ${
                      accomplishmentAnalytics.missingThisWeekCount > 0
                        ? 'text-error'
                        : 'text-ink'
                    }`}
                  >
                    {accomplishmentAnalytics.missingThisWeekCount}
                  </dd>
                  <dd className="text-xs text-ink-muted">
                    Active interns without weekly report
                  </dd>
                </div>
              </dl>
            </div>

            <div className="grid grid-cols-1 divide-y divide-rule lg:grid-cols-2 lg:divide-x lg:divide-y-0">
              <div className="p-5">
                <h3 className="mb-3 text-xs font-semibold text-ink">
                  Weekly Accomplishment Submission Trends
                </h3>
                <TrendLineChart
                  title="Weekly accomplishment submission and missing report trends"
                  data={accomplishmentAnalytics.weeklyTrends}
                  series={[
                    {
                      key: 'submittedCount',
                      label: 'Reports Submitted',
                      color: 'var(--color-accent-solid)',
                    },
                    {
                      key: 'missingInternsCount',
                      label: 'Interns Missing Report',
                      color: 'var(--color-error-border)',
                      dashed: true,
                    },
                  ]}
                  emptyMessage="No weekly accomplishment reports recorded yet for the selected filters."
                />
              </div>

              <div className="p-5">
                <h3 className="mb-3 text-xs font-semibold text-ink">
                  Submitted, Approved, Returned &amp; Missing Breakdown
                </h3>
                <StatusDonutChart
                  title="Accomplishment report status distribution"
                  centerLabel="Reports & gaps"
                  segments={accomplishmentDonutSegments}
                  emptyMessage="No accomplishment reports or active weekly reporting gaps found."
                />
              </div>
            </div>
          </section>

          {/* D. Task Analytics */}
          <section
            aria-labelledby="task-analytics-heading"
            className="overflow-hidden rounded-[6px] border border-rule bg-surface"
          >
            <div className="border-b border-rule bg-surface-subtle px-5 py-3.5">
              <h2
                id="task-analytics-heading"
                className="text-sm font-semibold text-ink"
              >
                Task Analytics
              </h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                Assigned task lifecycle distinguishing unsubmitted assignments
                from submitted work pending supervisor review
              </p>
            </div>

            <div className="dashboard-metric-wrap border-b border-rule">
              <dl className="dashboard-metric-grid">
                <div className="dashboard-metric-cell">
                  <dt className="text-xs font-medium text-ink-muted">
                    Assigned Tasks
                  </dt>
                  <dd className="text-xl font-semibold tabular-nums text-ink">
                    {taskAnalytics.assignedCount}
                  </dd>
                  <dd className="text-xs tabular-nums text-ink-muted">
                    {taskAnalytics.notSubmittedCount} not yet submitted
                  </dd>
                </div>
                <div className="dashboard-metric-cell">
                  <dt className="text-xs font-medium text-ink-muted">
                    Completed Tasks
                  </dt>
                  <dd className="text-xl font-semibold tabular-nums text-ink">
                    {taskAnalytics.completedCount}
                  </dd>
                  <dd className="text-xs tabular-nums text-ink-muted">
                    {taskAnalytics.completionRatePct !== null
                      ? `${taskAnalytics.completionRatePct.toFixed(1)}% completion rate`
                      : 'No tasks assigned yet'}
                  </dd>
                </div>
                <div className="dashboard-metric-cell">
                  <dt className="text-xs font-medium text-ink-muted">
                    Pending Submissions
                  </dt>
                  <dd className="text-xl font-semibold tabular-nums text-ink">
                    {taskAnalytics.pendingSubmittedCount}
                  </dd>
                  <dd className="text-xs text-ink-muted">
                    Submitted, awaiting supervisor approval
                  </dd>
                </div>
                <div className="dashboard-metric-cell">
                  <dt className="text-xs font-medium text-ink-muted">
                    Overdue Tasks
                  </dt>
                  <dd
                    className={`text-xl font-semibold tabular-nums ${
                      taskAnalytics.overdueCount > 0 ? 'text-error' : 'text-ink'
                    }`}
                  >
                    {taskAnalytics.overdueCount}
                  </dd>
                  <dd className="text-xs text-ink-muted">
                    Past deadline without submission
                  </dd>
                </div>
              </dl>
            </div>

            <div className="p-5">
              <h3 className="mb-3 text-xs font-semibold text-ink">
                Task Status Distribution
              </h3>
              <StatusDonutChart
                title="Task status distribution"
                centerLabel="Tasks"
                segments={taskDonutSegments}
                emptyMessage="No assigned tasks exist for the selected filters."
              />
            </div>
          </section>

          {/* E. Supervisor Performance Analytics */}
          <section
            id="supervisor-performance"
            aria-labelledby="supervisor-analytics-heading"
            className="overflow-hidden rounded-[6px] border border-rule bg-surface"
          >
            <div className="border-b border-rule bg-surface-subtle px-5 py-3.5">
              <h2
                id="supervisor-analytics-heading"
                className="text-sm font-semibold text-ink"
              >
                Supervisor Performance Analytics
              </h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                Assigned intern load, review queue status, and average review
                turnaround time per supervisor
              </p>
            </div>

            <div className="grid grid-cols-1 divide-y divide-rule sm:grid-cols-3 sm:divide-x sm:divide-y-0 border-b border-rule">
              <div className="px-5 py-4">
                <p className="text-xs font-medium text-ink-muted">
                  Supervisors in Scope
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-ink">
                  {supervisorAnalytics.totalSupervisors}
                </p>
              </div>
              <div className="px-5 py-4">
                <p className="text-xs font-medium text-ink-muted">
                  Pending Supervisor Reviews
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-ink">
                  {supervisorAnalytics.totalPendingReviews}
                </p>
              </div>
              <div className="px-5 py-4">
                <p className="text-xs font-medium text-ink-muted">
                  Average Review Turnaround
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-ink">
                  {supervisorAnalytics.overallAvgTurnaroundLabel}
                </p>
              </div>
            </div>

            <div className="border-b border-rule p-5">
              <h3 className="mb-3 text-xs font-semibold text-ink">
                Workload &amp; Review Activity by Supervisor
              </h3>
              <ComparisonBarChart
                title="Assigned interns, pending reviews, approved, and returned submissions by supervisor"
                data={supervisorChartData}
                series={[
                  {
                    key: 'assigned',
                    label: 'Assigned Interns',
                    color: 'var(--color-accent-solid)',
                  },
                  {
                    key: 'pending',
                    label: 'Pending Reviews',
                    color: 'var(--color-input-border)',
                  },
                  {
                    key: 'approved',
                    label: 'Approved',
                    color: 'var(--color-success-border)',
                  },
                  {
                    key: 'returned',
                    label: 'Returned',
                    color: 'var(--color-error-border)',
                  },
                ]}
                emptyMessage="No supervisor workload records match the selected filters."
              />
            </div>

            {supervisorWorkload.length === 0 ? (
              <div className="px-5 py-8 text-sm text-ink-muted">
                No supervisors match the selected filters.
              </div>
            ) : (
              <div
                tabIndex={0}
                role="region"
                aria-labelledby="supervisor-analytics-heading"
                className="table-wrapper"
              >
                <table className="submission-table is-compact">
                  <caption className="visually-hidden">
                    Supervisor performance metrics including average review
                    turnaround time
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Supervisor</th>
                      <th scope="col">Host Organization / Institution</th>
                      <th scope="col" className="col-num w-32">
                        Assigned Interns
                      </th>
                      <th scope="col" className="col-num w-32">
                        Pending Reviews
                      </th>
                      <th scope="col" className="col-num w-28">
                        Approved
                      </th>
                      <th scope="col" className="col-num w-28">
                        Returned
                      </th>
                      <th scope="col" className="col-num w-36">
                        Avg Turnaround
                      </th>
                      <th scope="col" className="col-action w-24">
                        Details
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {supervisorWorkload.map((sup) => (
                      <tr key={sup.id}>
                        <th scope="row" className="font-medium text-ink">
                          {sup.full_name}
                        </th>
                        <td
                          data-label="Host Organization / Institution"
                          className="text-xs text-ink-muted"
                        >
                          {sup.company_name || '—'}
                        </td>
                        <td
                          data-label="Assigned Interns"
                          className="col-num whitespace-nowrap text-xs font-medium text-ink"
                        >
                          {sup.assignedInternsCount}
                        </td>
                        <td
                          data-label="Pending Reviews"
                          className={`col-num whitespace-nowrap text-xs font-semibold ${
                            sup.pendingReviews > 0 ? 'text-accent' : 'text-ink'
                          }`}
                        >
                          {sup.pendingReviews}
                        </td>
                        <td
                          data-label="Approved"
                          className="col-num whitespace-nowrap text-xs text-ink-muted"
                        >
                          {sup.approvedSubmissions}
                        </td>
                        <td
                          data-label="Returned"
                          className="col-num whitespace-nowrap text-xs text-ink-muted"
                        >
                          {sup.returnedSubmissions}
                        </td>
                        <td
                          data-label="Avg Turnaround"
                          className="col-num whitespace-nowrap text-xs font-medium text-ink"
                        >
                          {sup.avgReviewTurnaroundLabel}
                        </td>
                        <td data-label="Details" className="col-action">
                          <button
                            type="button"
                            onClick={() => setSelectedSupervisor(sup)}
                            className="inline-flex min-h-8 items-center justify-center rounded-[5px] border border-rule bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-subtle"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Consolidated Submission Summary Matrix */}
          <section
            aria-labelledby="consolidated-summary-heading"
            className="overflow-hidden rounded-[6px] border border-rule bg-surface"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-surface-subtle px-5 py-3.5">
              <div>
                <h2
                  id="consolidated-summary-heading"
                  className="text-sm font-semibold text-ink"
                >
                  Consolidated Submission Summary
                </h2>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Status breakdown by submission type matching exported Excel
                  and PDF reports
                </p>
              </div>
              <span className="text-xs tabular-nums text-ink-muted">
                {reportTotals.total}{' '}
                {reportTotals.total === 1 ? 'record' : 'records'}
              </span>
            </div>

            <div
              tabIndex={0}
              role="region"
              aria-labelledby="consolidated-summary-heading"
              className="table-wrapper"
            >
              <table className="submission-table is-compact">
                <caption className="visually-hidden">
                  Consolidated counts across attendance, accomplishments, and
                  tasks by status
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Record Type</th>
                    <th scope="col" className="col-num">
                      Pending Review
                    </th>
                    <th scope="col" className="col-num">
                      Assigned – Not Submitted
                    </th>
                    <th scope="col" className="col-num">
                      Approved
                    </th>
                    <th scope="col" className="col-num">
                      Returned
                    </th>
                    <th scope="col" className="col-num">
                      Rejected
                    </th>
                    <th scope="col" className="col-num">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {reportMatrix.map((row) => (
                    <tr key={row.key}>
                      <th scope="row" className="font-medium text-ink">
                        {row.label}
                      </th>
                      <td
                        data-label="Pending Review"
                        className="col-num text-xs text-ink"
                      >
                        {row.pending}
                      </td>
                      <td
                        data-label="Assigned – Not Submitted"
                        className="col-num text-xs text-ink-muted"
                      >
                        {row.key === 'tasks' ? row.notSubmitted : '—'}
                      </td>
                      <td
                        data-label="Approved"
                        className="col-num text-xs text-ink"
                      >
                        {row.approved}
                      </td>
                      <td
                        data-label="Returned"
                        className="col-num text-xs text-ink"
                      >
                        {row.returned}
                      </td>
                      <td
                        data-label="Rejected"
                        className="col-num text-xs text-ink"
                      >
                        {row.rejected}
                      </td>
                      <td
                        data-label="Total"
                        className="col-num text-xs font-semibold text-ink"
                      >
                        {row.total}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" className="text-xs font-semibold text-ink">
                      Totals
                    </th>
                    <td
                      data-label="Pending Review"
                      className="col-num text-xs font-semibold text-ink"
                    >
                      {reportTotals.pending}
                    </td>
                    <td
                      data-label="Assigned – Not Submitted"
                      className="col-num text-xs font-semibold text-ink"
                    >
                      {reportTotals.notSubmitted}
                    </td>
                    <td
                      data-label="Approved"
                      className="col-num text-xs font-semibold text-ink"
                    >
                      {reportTotals.approved}
                    </td>
                    <td
                      data-label="Returned"
                      className="col-num text-xs font-semibold text-ink"
                    >
                      {reportTotals.returned}
                    </td>
                    <td
                      data-label="Rejected"
                      className="col-num text-xs font-semibold text-ink"
                    >
                      {reportTotals.rejected}
                    </td>
                    <td
                      data-label="Total"
                      className="col-num text-xs font-semibold text-ink"
                    >
                      {reportTotals.total}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      )}

      <SupervisorDetailDialog
        supervisor={selectedSupervisor}
        onClose={() => setSelectedSupervisor(null)}
        onFilterBySupervisor={(supId) => setSupervisorId(supId)}
        onInspectIntern={(intern) => setSelectedIntern(intern)}
      />

      <InternDetailDialog
        intern={selectedIntern}
        onClose={() => setSelectedIntern(null)}
        onSelectSubmission={(item) => setSelectedSubmission(item)}
        onFilterToIntern={(id) =>
          navigate(`/coordinator/submissions?intern=${encodeURIComponent(id)}`)
        }
      />

      <SubmissionDetailDialog
        item={selectedSubmission}
        todayIso={todayIso}
        onClose={() => setSelectedSubmission(null)}
        onRequestDelete={() => {
          setSelectedSubmission(null)
          navigate('/coordinator/submissions')
        }}
      />
    </div>
  )
}
