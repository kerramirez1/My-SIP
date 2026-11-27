import { useCallback, useMemo, useState } from 'react'
import { AlertMessage } from '../../components/AlertMessage'
import { PaperclipIcon } from '../../components/Icons'
import { StatusBadge } from '../../components/StatusBadge'
import { SubmissionDialog } from '../../components/SubmissionDialog'
import {
  formatDecimalHours,
  formatDurationMinutes,
  formatWallClockTime,
} from '../../lib/attendanceUtils'
import { getDeadlineBadge } from '../../lib/internDashboardUtils'
import {
  getAttachmentDisplayName,
  splitFilenameForDisplay,
} from '../../lib/submissionHelpers'
import { supabase } from '../../lib/supabaseClient'
import {
  buildProgressReportCsv,
  buildSubmissionsReportCsv,
  extractIsoDatePart,
  formatBreakText,
  useCoordinatorData,
} from '../../lib/useCoordinatorData'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import {
  formatCalendarDate,
  formatWeekRange,
  getTodayIsoDate,
} from '../../lib/weekUtils'

const PRIORITY_META = {
  high: {
    label: 'High',
    className: 'border-error-border/45 bg-error-tint text-error',
  },
  medium: {
    label: 'Medium',
    className: 'border-accent/35 bg-accent-tint text-accent',
  },
  low: {
    label: 'Low',
    className: 'border-rule bg-surface-subtle text-ink-muted',
  },
}

const DEADLINE_TONE_CLASSES = {
  overdue: 'text-error font-medium',
  today: 'text-accent font-medium',
  upcoming: 'text-ink-muted',
}

function PriorityBadge({ priority }) {
  const meta = PRIORITY_META[priority] ?? PRIORITY_META.medium
  return (
    <span
      className={`inline-flex items-center rounded-[5px] border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${meta.className}`}
    >
      {meta.label}
    </span>
  )
}

function downloadCsvFile(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function CoordinatorAttachmentControl({ objectPath }) {
  const [opening, setOpening] = useState(false)
  const [signedState, setSignedState] = useState({ path: '', url: '' })
  const [errorMsg, setErrorMsg] = useState('')

  if (!objectPath) return null

  const displayName = getAttachmentDisplayName(objectPath)
  const { stem, extension } = splitFilenameForDisplay(displayName)
  const signedUrl = signedState.path === objectPath ? signedState.url : ''

  async function handleOpen() {
    if (!supabase) return
    setOpening(true)
    setErrorMsg('')

    const { data, error } = await supabase.storage
      .from('attachments')
      .createSignedUrl(objectPath, 300)

    setOpening(false)

    if (error || !data?.signedUrl) {
      setErrorMsg(
        error?.message || 'Could not generate a signed download link.',
      )
      return
    }

    setSignedState({ path: objectPath, url: data.signedUrl })

    const openedWindow = window.open(
      data.signedUrl,
      '_blank',
      'noopener,noreferrer',
    )
    if (!openedWindow) {
      setErrorMsg(
        'Pop-up blocked by your browser. Use the direct signed link shown next to the attachment.',
      )
    }
  }

  return (
    <div className="mt-2 space-y-1">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          disabled={opening}
          onClick={() => void handleOpen()}
          className="inline-flex min-h-7 items-center gap-1 font-medium text-accent underline underline-offset-4 hover:text-accent-hover disabled:opacity-60"
        >
          <PaperclipIcon className="size-3.5" />
          <span>
            {opening ? 'Generating link…' : 'View file'}
            <span className="visually-hidden"> {displayName}</span>
          </span>
        </button>
        <span className="filename-truncate text-xs text-ink-muted">
          <span>{stem}</span>
          {extension}
        </span>
        {signedUrl ? (
          <a
            href={signedUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-ink underline underline-offset-2 hover:text-accent"
          >
            Open signed link
            <span className="visually-hidden"> for {displayName}</span>
          </a>
        ) : null}
      </div>
      {errorMsg ? (
        <p role="alert" className="text-xs text-error">
          {errorMsg}
        </p>
      ) : null}
    </div>
  )
}

export function CoordinatorMonitoringPage() {
  useDocumentTitle('Monitoring')

  const {
    loading,
    loadError,
    interns,
    internProgressRows,
    flaggedInterns,
    allSubmissions,
    totals,
    reportMatrix,
    reportTotals,
    reload,
  } = useCoordinatorData()

  const todayIso = getTodayIsoDate()

  // Explorer filters
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [internFilter, setInternFilter] = useState('all')

  // Detail & Delete confirmation dialog state
  const [selectedItem, setSelectedItem] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [pageSuccess, setPageSuccess] = useState('')

  const filteredSubmissions = useMemo(() => {
    return allSubmissions.filter((item) => {
      if (typeFilter !== 'all' && item.kind !== typeFilter) return false
      if (statusFilter !== 'all' && item.status !== statusFilter) return false
      if (internFilter !== 'all' && item.internId !== internFilter) return false
      return true
    })
  }, [allSubmissions, internFilter, statusFilter, typeFilter])

  const closeDetailDialog = useCallback(() => {
    setSelectedItem(null)
  }, [])

  const closeDeleteDialog = useCallback(() => {
    setDeleteTarget(null)
    setDeleteError('')
    setDeleting(false)
  }, [])

  function handleExportProgress() {
    const csv = buildProgressReportCsv(internProgressRows)
    downloadCsvFile(csv, `sip-progress-report-${getTodayIsoDate()}.csv`)
  }

  function handleExportSubmissions() {
    const csv = buildSubmissionsReportCsv(filteredSubmissions)
    downloadCsvFile(csv, `sip-submissions-report-${getTodayIsoDate()}.csv`)
  }

  async function handleConfirmDelete() {
    if (!supabase || !deleteTarget) return

    setDeleting(true)
    setDeleteError('')

    const { data: deletedRows, error } = await supabase
      .from(deleteTarget.tableName)
      .delete()
      .eq('id', deleteTarget.id)
      .select('id')

    if (error) {
      setDeleteError(`Could not delete record: ${error.message}`)
      setDeleting(false)
      return
    }

    if (!deletedRows || deletedRows.length === 0) {
      setDeleteError('This record could not be deleted or was already removed.')
      setDeleting(false)
      return
    }

    const message = `${deleteTarget.typeLabel} record deleted for ${deleteTarget.internName}.`
    setDeleting(false)
    setDeleteTarget(null)
    setSelectedItem(null)
    setPageSuccess(message)
    reload()
  }

  const hasActiveFilters =
    typeFilter !== 'all' || statusFilter !== 'all' || internFilter !== 'all'

  return (
    <div className="max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1
            id="main-content"
            tabIndex={-1}
            className="ledger-title text-[clamp(1.375rem,1.2rem+0.6vw,1.75rem)] font-semibold leading-[1.2] tracking-[-0.02em] text-ink outline-none"
          >
            Monitoring
          </h1>
          <p className="mt-1.5 max-w-[66ch] text-sm leading-[1.55] text-ink-muted">
            Monitor intern progress, pending supervisor approvals, submission
            records, and consolidated program reports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setPageSuccess('')
              reload()
            }}
            className="inline-flex min-h-10 items-center justify-center rounded-[5px] border border-rule bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-subtle"
          >
            Reload
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={handleExportProgress}
            className="inline-flex min-h-10 items-center justify-center rounded-[5px] bg-accent-solid px-4 text-sm font-medium text-on-accent hover:bg-accent-solid-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            Export progress report
          </button>
        </div>
      </header>

      <div className={pageSuccess || loadError ? 'space-y-3' : ''}>
        <AlertMessage message={pageSuccess} variant="success" />
        {loadError ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <AlertMessage message={loadError} variant="error" />
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
      </div>

      {loading ? (
        <div className="flex items-center gap-3 rounded-[6px] border border-rule bg-surface px-5 py-14 text-sm text-ink-muted">
          <progress
            aria-label="Loading coordinator monitoring data"
            className="loading-spinner"
          />
          <span>Loading intern progress and submissions…</span>
        </div>
      ) : (
        <>
          <section className="overflow-hidden rounded-[6px] border border-rule bg-surface">
            <dl className="grid grid-cols-2 divide-y divide-rule lg:grid-cols-4 lg:divide-x lg:divide-y-0">
              <div className="px-5 py-4 max-lg:border-e max-lg:border-rule">
                <dt className="text-xs font-medium text-ink-muted">
                  Total interns
                </dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">
                  {totals.totalInterns}
                </dd>
              </div>
              <div className="px-5 py-4">
                <dt className="text-xs font-medium text-ink-muted">
                  Pending approvals
                </dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">
                  {totals.totalPendingApprovals}
                </dd>
              </div>
              <div className="px-5 py-4 max-lg:border-e max-lg:border-rule">
                <dt className="text-xs font-medium text-ink-muted">
                  Interns needing attention
                </dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">
                  {totals.internsNeedingAttention}
                </dd>
              </div>
              <div className="px-5 py-4">
                <dt className="text-xs font-medium text-ink-muted">
                  Total approved hours
                </dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">
                  {formatDecimalHours(totals.totalApprovedMinutes)}
                </dd>
              </div>
            </dl>
          </section>

          <section className="overflow-hidden rounded-[6px] border border-rule bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-surface-subtle px-5 py-3.5">
              <div>
                <h2
                  id="needs-attention-heading"
                  className="text-sm font-semibold text-ink"
                >
                  Needs attention
                </h2>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Interns with pending approvals, returned items, overdue
                  unsubmitted tasks, or missing current-week attendance
                </p>
              </div>
              <span className="text-xs tabular-nums text-ink-muted">
                {flaggedInterns.length}{' '}
                {flaggedInterns.length === 1 ? 'intern' : 'interns'}
              </span>
            </div>

            {flaggedInterns.length === 0 ? (
              <div className="px-5 py-10 text-sm text-ink-muted">
                No interns need attention right now.
              </div>
            ) : (
              <div
                tabIndex={0}
                role="region"
                aria-labelledby="needs-attention-heading"
                className="table-wrapper"
              >
                <table className="submission-table">
                  <caption className="visually-hidden">
                    Interns requiring coordinator follow-up
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" className="w-56">
                        Intern
                      </th>
                      <th scope="col" className="w-48">
                        Supervisor
                      </th>
                      <th scope="col">Attention flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flaggedInterns.map((intern) => (
                      <tr key={intern.id}>
                        <td
                          data-label="Intern"
                          className="font-medium text-ink"
                        >
                          {intern.full_name}
                        </td>
                        <td
                          data-label="Supervisor"
                          className="text-sm text-ink-muted"
                        >
                          {intern.supervisorName}
                        </td>
                        <td data-label="Attention flags">
                          <ul className="flex flex-wrap gap-1.5">
                            {intern.attentionFlags.map((flag) => (
                              <li
                                key={flag}
                                className="inline-flex items-center rounded-[5px] border border-rule bg-surface-subtle px-2.5 py-0.5 text-xs text-ink"
                              >
                                {flag}
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-[6px] border border-rule bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-surface-subtle px-5 py-3.5">
              <div>
                <h2
                  id="intern-progress-heading"
                  className="text-sm font-semibold text-ink"
                >
                  Intern progress
                </h2>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Approved break-adjusted hours, required targets, and pending
                  approval counts across all interns
                </p>
              </div>
              <span className="text-xs tabular-nums text-ink-muted">
                {internProgressRows.length}{' '}
                {internProgressRows.length === 1 ? 'intern' : 'interns'}
              </span>
            </div>

            {internProgressRows.length === 0 ? (
              <div className="px-5 py-10 text-sm text-ink-muted">
                No interns registered yet.
              </div>
            ) : (
              <div
                tabIndex={0}
                role="region"
                aria-labelledby="intern-progress-heading"
                className="table-wrapper"
              >
                <table className="submission-table">
                  <caption className="visually-hidden">
                    All interns ordered by name with approved hours and progress
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Intern</th>
                      <th scope="col" className="w-44">
                        Supervisor
                      </th>
                      <th scope="col" className="w-36">
                        Approved hrs
                      </th>
                      <th scope="col" className="w-32">
                        Required hrs
                      </th>
                      <th scope="col" className="w-48">
                        Progress
                      </th>
                      <th scope="col" className="w-28">
                        Pending
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {internProgressRows.map((intern) => {
                      const academicMeta = [intern.course, intern.school_name]
                        .filter(Boolean)
                        .join(' — ')

                      return (
                        <tr key={intern.id}>
                          <td data-label="Intern">
                            <div className="min-w-0">
                              <p className="font-medium text-ink">
                                {intern.full_name}
                              </p>
                              {academicMeta ? (
                                <p className="mt-0.5 text-xs text-ink-muted">
                                  {academicMeta}
                                </p>
                              ) : null}
                            </div>
                          </td>
                          <td
                            data-label="Supervisor"
                            className="text-sm text-ink-muted"
                          >
                            {intern.supervisorName}
                          </td>
                          <td
                            data-label="Approved hrs"
                            className="whitespace-nowrap"
                          >
                            <div className="flex flex-col">
                              <span className="text-sm font-medium tabular-nums text-ink">
                                {formatDecimalHours(intern.approvedMinutes)}
                              </span>
                              <span className="mt-0.5 text-xs tabular-nums text-ink-muted">
                                {formatDurationMinutes(intern.approvedMinutes)}
                              </span>
                            </div>
                          </td>
                          <td
                            data-label="Required hrs"
                            className="whitespace-nowrap text-sm tabular-nums text-ink-muted"
                          >
                            {intern.requiredHours} hrs
                          </td>
                          <td data-label="Progress">
                            <div className="min-w-[8.5rem] space-y-1.5">
                              <div className="flex items-baseline justify-between gap-2 text-xs tabular-nums">
                                <span className="font-semibold text-ink">
                                  {intern.progressPct.toFixed(1)}%
                                </span>
                              </div>
                              <progress
                                value={intern.approvedHours}
                                max={intern.requiredHours}
                                aria-label={`Internship progress for ${intern.full_name}`}
                                className={`internship-progress${intern.isComplete ? ' is-complete' : ''}`}
                              />
                            </div>
                          </td>
                          <td
                            data-label="Pending"
                            className="whitespace-nowrap text-sm tabular-nums text-ink"
                          >
                            {intern.pendingCount}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-[6px] border border-rule bg-surface">
            <div className="flex flex-col gap-3 border-b border-rule bg-surface-subtle px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2
                  id="all-submissions-heading"
                  className="text-sm font-semibold text-ink"
                >
                  All submissions
                </h2>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Click any record to inspect full details, attachments, review
                  remarks, or delete the record
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs tabular-nums text-ink-muted">
                  Showing {filteredSubmissions.length} of{' '}
                  {allSubmissions.length}
                </span>
                <button
                  type="button"
                  onClick={handleExportSubmissions}
                  className="inline-flex min-h-9 items-center justify-center rounded-[5px] border border-rule bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-subtle"
                >
                  Export submissions
                </button>
              </div>
            </div>

            <search
              aria-label="Filter submissions"
              className="grid grid-cols-1 gap-3 border-b border-rule bg-surface px-5 py-3.5 sm:grid-cols-3 lg:grid-cols-[1fr_1fr_1fr_auto]"
            >
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="monitoring-filter-type"
                  className="text-xs font-medium text-ink-muted"
                >
                  Type
                </label>
                <select
                  id="monitoring-filter-type"
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value)}
                  className="form-control min-h-9 w-full rounded-[5px] border border-input-border bg-surface px-3 py-1.5 text-sm text-ink"
                >
                  <option value="all">All</option>
                  <option value="attendance">Attendance</option>
                  <option value="accomplishments">Accomplishments</option>
                  <option value="tasks">Tasks</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="monitoring-filter-status"
                  className="text-xs font-medium text-ink-muted"
                >
                  Status
                </label>
                <select
                  id="monitoring-filter-status"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                  className="form-control min-h-9 w-full rounded-[5px] border border-input-border bg-surface px-3 py-1.5 text-sm text-ink"
                >
                  <option value="all">All</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="returned">Returned</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="monitoring-filter-intern"
                  className="text-xs font-medium text-ink-muted"
                >
                  Intern
                </label>
                <select
                  id="monitoring-filter-intern"
                  value={internFilter}
                  onChange={(event) => setInternFilter(event.target.value)}
                  className="form-control min-h-9 w-full rounded-[5px] border border-input-border bg-surface px-3 py-1.5 text-sm text-ink"
                >
                  <option value="all">All interns</option>
                  {interns.map((intern) => (
                    <option key={intern.id} value={intern.id}>
                      {intern.full_name}
                    </option>
                  ))}
                </select>
              </div>

              {hasActiveFilters ? (
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => {
                      setTypeFilter('all')
                      setStatusFilter('all')
                      setInternFilter('all')
                    }}
                    className="inline-flex min-h-9 items-center justify-center rounded-[5px] border border-rule bg-surface-subtle px-3 text-xs font-medium text-ink hover:bg-surface"
                  >
                    Clear filters
                  </button>
                </div>
              ) : null}
            </search>

            {filteredSubmissions.length === 0 ? (
              <div className="px-5 py-10 text-sm text-ink-muted">
                {allSubmissions.length === 0
                  ? 'No submission records found yet.'
                  : 'No submissions match the selected filters.'}
              </div>
            ) : (
              <div
                tabIndex={0}
                role="region"
                aria-labelledby="all-submissions-heading"
                className="table-wrapper"
              >
                <table className="submission-table">
                  <caption className="visually-hidden">
                    Filtered submissions across attendance, accomplishments, and
                    tasks
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" className="w-40">
                        Intern
                      </th>
                      <th scope="col" className="w-32">
                        Type
                      </th>
                      <th scope="col">Title / summary</th>
                      <th scope="col" className="w-36">
                        Status
                      </th>
                      <th scope="col" className="w-36">
                        Submitted / date
                      </th>
                      <th scope="col" className="w-40">
                        Supervisor
                      </th>
                      <th scope="col" className="col-action w-24">
                        Details
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredSubmissions.map((item) => {
                      const { row } = item
                      return (
                        <tr
                          key={item.key}
                          onClick={(event) => {
                            if (event.target.closest('button, a')) return
                            setSelectedItem(item)
                          }}
                          className="cursor-pointer transition-colors hover:bg-surface-subtle/70"
                        >
                          <td
                            data-label="Intern"
                            className="whitespace-nowrap text-sm font-medium text-ink"
                          >
                            {item.internName}
                          </td>
                          <td
                            data-label="Type"
                            className="whitespace-nowrap text-xs font-medium text-ink-muted"
                          >
                            {item.typeLabel}
                          </td>
                          <td data-label="Title / summary">
                            {item.kind === 'attendance' ? (
                              <div className="min-w-0 space-y-0.5 text-sm">
                                <p className="font-medium tabular-nums text-ink">
                                  {formatCalendarDate(row.attendance_date)} —{' '}
                                  {formatWallClockTime(row.time_in)} to{' '}
                                  {formatWallClockTime(row.time_out)}
                                </p>
                                <p className="text-xs tabular-nums text-ink-muted">
                                  Rendered:{' '}
                                  {item.renderedMinutes !== null
                                    ? `${formatDurationMinutes(item.renderedMinutes)} (${formatDecimalHours(item.renderedMinutes)})`
                                    : '—'}
                                </p>
                              </div>
                            ) : item.kind === 'accomplishments' ? (
                              <div className="min-w-0">
                                <p className="font-medium text-ink">
                                  {row.title}
                                </p>
                                <p className="mt-0.5 text-xs tabular-nums text-ink-muted">
                                  Week of {formatWeekRange(row.week_of)}
                                </p>
                              </div>
                            ) : (
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-medium text-ink">
                                    {row.title}
                                  </p>
                                  <PriorityBadge priority={row.priority} />
                                </div>
                                {!item.isSubmittedTask ? (
                                  <p className="mt-0.5 text-xs text-ink-muted">
                                    Assigned, not yet submitted
                                  </p>
                                ) : null}
                              </div>
                            )}
                          </td>
                          <td data-label="Status">
                            <StatusBadge status={row.status} />
                          </td>
                          <td
                            data-label="Submitted / date"
                            className="whitespace-nowrap text-sm tabular-nums text-ink-muted"
                          >
                            {item.submittedOrDateIso ? (
                              <time dateTime={item.submittedOrDateIso}>
                                {formatCalendarDate(item.submittedOrDateIso)}
                              </time>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td
                            data-label="Supervisor"
                            className="text-sm text-ink-muted"
                          >
                            {item.supervisorName}
                          </td>
                          <td data-label="Details" className="col-action">
                            <button
                              type="button"
                              onClick={() => setSelectedItem(item)}
                              className="inline-flex min-h-9 items-center justify-center rounded-[5px] border border-rule bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-subtle"
                            >
                              <span>View</span>
                              <span className="visually-hidden">
                                {' '}
                                {item.typeLabel} for {item.internName}
                              </span>
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-[6px] border border-rule bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-surface-subtle px-5 py-3.5">
              <div>
                <h2
                  id="consolidated-report-heading"
                  className="text-sm font-semibold text-ink"
                >
                  Consolidated report
                </h2>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Submission counts across all interns by record type and
                  approval status
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
              aria-labelledby="consolidated-report-heading"
              className="table-wrapper"
            >
              <table className="submission-table">
                <caption className="visually-hidden">
                  Consolidated counts of attendance, accomplishments, and tasks
                  by approval status
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Record type</th>
                    <th scope="col" className="w-28">
                      Pending
                    </th>
                    <th scope="col" className="w-44">
                      Assigned, not yet submitted
                    </th>
                    <th scope="col" className="w-28">
                      Approved
                    </th>
                    <th scope="col" className="w-28">
                      Returned
                    </th>
                    <th scope="col" className="w-28">
                      Rejected
                    </th>
                    <th scope="col" className="w-28">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {reportMatrix.map((row) => (
                    <tr key={row.key}>
                      <th
                        scope="row"
                        className="text-start font-medium text-ink"
                      >
                        {row.label}
                      </th>
                      <td data-label="Pending" className="tabular-nums text-ink">
                        {row.pending}
                      </td>
                      <td
                        data-label="Assigned, not yet submitted"
                        className="tabular-nums text-ink-muted"
                      >
                        {row.key === 'tasks' ? row.notSubmitted : '—'}
                      </td>
                      <td
                        data-label="Approved"
                        className="tabular-nums text-ink"
                      >
                        {row.approved}
                      </td>
                      <td
                        data-label="Returned"
                        className="tabular-nums text-ink"
                      >
                        {row.returned}
                      </td>
                      <td
                        data-label="Rejected"
                        className="tabular-nums text-ink"
                      >
                        {row.rejected}
                      </td>
                      <td
                        data-label="Total"
                        className="font-semibold tabular-nums text-ink"
                      >
                        {row.total}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-surface-subtle font-semibold">
                    <th scope="row" className="text-start font-semibold text-ink">
                      Totals
                    </th>
                    <td data-label="Pending" className="tabular-nums text-ink">
                      {reportTotals.pending}
                    </td>
                    <td
                      data-label="Assigned, not yet submitted"
                      className="tabular-nums text-ink"
                    >
                      {reportTotals.notSubmitted}
                    </td>
                    <td data-label="Approved" className="tabular-nums text-ink">
                      {reportTotals.approved}
                    </td>
                    <td data-label="Returned" className="tabular-nums text-ink">
                      {reportTotals.returned}
                    </td>
                    <td data-label="Rejected" className="tabular-nums text-ink">
                      {reportTotals.rejected}
                    </td>
                    <td data-label="Total" className="tabular-nums text-ink">
                      {reportTotals.total}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <SubmissionDialog
        open={Boolean(selectedItem)}
        title={
          selectedItem
            ? `${selectedItem.typeLabel} Details — ${selectedItem.internName}`
            : 'Submission details'
        }
        description="Read-only record inspection. Approvals are managed by the assigned supervisor."
        onClose={closeDetailDialog}
      >
        {selectedItem ? (
          <div className="space-y-4 text-xs">
            <dl className="grid grid-cols-1 gap-3 rounded-[5px] border border-rule bg-surface-subtle px-4 py-3 sm:grid-cols-3">
              <div>
                <dt className="text-ink-muted">Intern</dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {selectedItem.internName}
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Assigned supervisor</dt>
                <dd className="mt-0.5 font-medium text-ink">
                  {selectedItem.supervisorName}
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Status</dt>
                <dd className="mt-0.5">
                  <StatusBadge status={selectedItem.status} />
                </dd>
              </div>
            </dl>

            <div className="rounded-[5px] border border-rule bg-surface px-4 py-3">
              {selectedItem.kind === 'attendance' ? (
                <dl className="space-y-2">
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt className="text-ink-muted">Date</dt>
                    <dd className="font-medium tabular-nums text-ink">
                      {formatCalendarDate(selectedItem.row.attendance_date)}
                    </dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt className="text-ink-muted">Week</dt>
                    <dd className="tabular-nums text-ink">
                      {formatWeekRange(selectedItem.row.week_of, 5)}
                    </dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt className="text-ink-muted">Time in / Time out</dt>
                    <dd className="font-medium tabular-nums text-ink">
                      {formatWallClockTime(selectedItem.row.time_in)} –{' '}
                      {formatWallClockTime(selectedItem.row.time_out)}
                    </dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt className="text-ink-muted">Lunch break</dt>
                    <dd className="tabular-nums text-ink">
                      {formatBreakText(selectedItem.row.break_minutes)}
                    </dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 border-t border-rule pt-2">
                    <dt className="font-medium text-ink">Rendered hours</dt>
                    <dd className="font-semibold tabular-nums text-ink">
                      {selectedItem.renderedMinutes !== null
                        ? `${formatDurationMinutes(selectedItem.renderedMinutes)} (${formatDecimalHours(selectedItem.renderedMinutes)})`
                        : '—'}
                    </dd>
                  </div>
                </dl>
              ) : selectedItem.kind === 'accomplishments' ? (
                <div className="space-y-2.5">
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {selectedItem.row.title}
                    </p>
                    <p className="mt-0.5 tabular-nums text-ink-muted">
                      Week of {formatWeekRange(selectedItem.row.week_of)}
                    </p>
                  </div>
                  {selectedItem.row.description ? (
                    <div>
                      <p className="font-medium text-ink-muted">
                        Activities performed
                      </p>
                      <p className="mt-0.5 whitespace-pre-line text-ink break-words">
                        {selectedItem.row.description}
                      </p>
                    </div>
                  ) : null}
                  {selectedItem.row.skills_acquired ? (
                    <div>
                      <p className="font-medium text-ink-muted">
                        Skills acquired
                      </p>
                      <p className="mt-0.5 whitespace-pre-line text-ink break-words">
                        {selectedItem.row.skills_acquired}
                      </p>
                    </div>
                  ) : null}
                  {selectedItem.row.challenges_encountered ? (
                    <div>
                      <p className="font-medium text-ink-muted">
                        Challenges encountered
                      </p>
                      <p className="mt-0.5 whitespace-pre-line text-ink break-words">
                        {selectedItem.row.challenges_encountered}
                      </p>
                    </div>
                  ) : null}
                  {selectedItem.row.lessons_learned ? (
                    <div>
                      <p className="font-medium text-ink-muted">
                        Lessons learned
                      </p>
                      <p className="mt-0.5 whitespace-pre-line text-ink break-words">
                        {selectedItem.row.lessons_learned}
                      </p>
                    </div>
                  ) : null}
                  <CoordinatorAttachmentControl
                    objectPath={selectedItem.row.attachment_url}
                  />
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">
                      {selectedItem.row.title}
                    </p>
                    <PriorityBadge priority={selectedItem.row.priority} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums text-ink-muted">
                    {selectedItem.assignerName ? (
                      <span>Assigned by {selectedItem.assignerName}</span>
                    ) : null}
                    <span>
                      Deadline:{' '}
                      <span className="font-medium text-ink">
                        {formatCalendarDate(
                          selectedItem.row.deadline ||
                            selectedItem.row.task_date,
                        )}
                      </span>
                    </span>
                    {selectedItem.row.status === 'pending' &&
                    (selectedItem.row.deadline || selectedItem.row.task_date) ? (
                      <span
                        className={
                          DEADLINE_TONE_CLASSES[
                            getDeadlineBadge(
                              selectedItem.row.deadline ||
                                selectedItem.row.task_date,
                              todayIso,
                            ).tone
                          ]
                        }
                      >
                        (
                        {
                          getDeadlineBadge(
                            selectedItem.row.deadline ||
                              selectedItem.row.task_date,
                            todayIso,
                          ).label
                        }
                        )
                      </span>
                    ) : null}
                    {selectedItem.row.submitted_at ? (
                      <span>
                        Submitted on{' '}
                        {formatCalendarDate(
                          extractIsoDatePart(selectedItem.row.submitted_at),
                        )}
                      </span>
                    ) : (
                      <span>Not yet submitted</span>
                    )}
                  </div>
                  {selectedItem.row.description ? (
                    <div>
                      <p className="font-medium text-ink-muted">Instructions</p>
                      <p className="mt-0.5 whitespace-pre-line text-ink break-words">
                        {selectedItem.row.description}
                      </p>
                    </div>
                  ) : null}
                  {selectedItem.row.completion_description ? (
                    <div className="border-t border-rule pt-2">
                      <p className="font-medium text-ink-muted">
                        Intern completion notes
                      </p>
                      <p className="mt-0.5 whitespace-pre-line text-ink break-words">
                        {selectedItem.row.completion_description}
                      </p>
                    </div>
                  ) : null}
                  <CoordinatorAttachmentControl
                    objectPath={selectedItem.row.submission_attachment_url}
                  />
                </div>
              )}
            </div>

            {selectedItem.row.reviewed_at || selectedItem.row.reviewed_by ? (
              <div className="rounded-[5px] border border-rule bg-surface-subtle px-4 py-3">
                <p className="font-semibold text-ink">Review details</p>
                <dl className="mt-2 space-y-1.5">
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt className="text-ink-muted">Reviewed by</dt>
                    <dd className="font-medium text-ink">
                      {selectedItem.reviewerName || 'Unknown user'}
                    </dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt className="text-ink-muted">Reviewed at</dt>
                    <dd className="tabular-nums text-ink">
                      {selectedItem.row.reviewed_at
                        ? formatCalendarDate(
                            extractIsoDatePart(selectedItem.row.reviewed_at),
                          )
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-ink-muted">Remarks</dt>
                    <dd className="mt-0.5 whitespace-pre-line text-ink break-words">
                      {selectedItem.row.reviewer_remarks?.trim()
                        ? selectedItem.row.reviewer_remarks
                        : '—'}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rule pt-4">
              <button
                type="button"
                onClick={() => {
                  setDeleteError('')
                  setDeleteTarget(selectedItem)
                }}
                className="inline-flex min-h-10 items-center justify-center rounded-[5px] border border-rejected-border bg-rejected-bg px-3.5 text-sm font-medium text-on-accent hover:opacity-90"
              >
                Delete record
              </button>
              <button
                type="button"
                onClick={closeDetailDialog}
                className="inline-flex min-h-10 items-center justify-center rounded-[5px] border border-rule bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-subtle"
              >
                Close
              </button>
            </div>
          </div>
        ) : null}
      </SubmissionDialog>

      <SubmissionDialog
        open={Boolean(deleteTarget)}
        title="Delete record"
        description="This action permanently removes the selected submission record."
        onClose={closeDeleteDialog}
      >
        {deleteTarget ? (
          <div className="space-y-4 text-sm">
            <div>
              <AlertMessage message={deleteError} variant="error" />
            </div>

            <p className="text-ink">
              Are you sure you want to delete{' '}
              <span className="font-semibold">
                {deleteTarget.typeLabel}: {deleteTarget.shortTitle}
              </span>{' '}
              for <span className="font-semibold">{deleteTarget.internName}</span>
              ?
            </p>

            {deleteTarget.kind === 'attendance' &&
            deleteTarget.status === 'approved' ? (
              <div
                role="alert"
                className="rounded-[5px] border border-error-border bg-error-tint px-4 py-3 text-xs font-medium text-error"
              >
                This is an approved attendance record. Deleting it will reduce
                the intern&apos;s approved hours.
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-rule pt-4">
              <button
                type="button"
                disabled={deleting}
                onClick={closeDeleteDialog}
                className="inline-flex min-h-10 items-center justify-center rounded-[5px] border border-rule bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-subtle disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => void handleConfirmDelete()}
                className="inline-flex min-h-10 items-center justify-center rounded-[5px] border border-rejected-border bg-rejected-bg px-4 text-sm font-medium text-on-accent hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {deleting ? 'Deleting…' : 'Delete record'}
              </button>
            </div>
          </div>
        ) : null}
      </SubmissionDialog>
    </div>
  )
}
