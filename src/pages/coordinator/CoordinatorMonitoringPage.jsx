import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertMessage } from '../../components/AlertMessage'
import { SubmissionDialog } from '../../components/SubmissionDialog'
import { useAuth } from '../../context/useAuth'
import { formatDecimalHours } from '../../lib/attendanceUtils'
import { logSubmissionDeletion } from '../../lib/submissionDeletionLog'
import { supabase } from '../../lib/supabaseClient'
import { useCoordinatorData } from '../../lib/useCoordinatorData'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { formatCalendarDate, getTodayIsoDate } from '../../lib/weekUtils'
import {
  CoordinatorStatusPill,
  DeleteRecordDialog,
  InternDetailDialog,
  SubmissionDetailDialog,
  SupervisorDetailDialog,
} from './CoordinatorMonitoringDialogs'

const SEVERITY_BADGE_CLASSES = {
  high: 'border-error-border/45 bg-error-tint text-error',
  medium: 'border-accent/40 bg-accent-tint text-accent',
  info: 'border-rule bg-surface-subtle text-ink-muted',
}

const MAX_OVERVIEW_ALERTS = 5
const MAX_RECENT_SUBMISSIONS = 5

export function CoordinatorMonitoringPage() {
  useDocumentTitle('Monitoring')

  const { profile } = useAuth()
  const navigate = useNavigate()
  const todayIso = getTodayIsoDate()

  const {
    loading,
    loadError,
    internProgressRows,
    attentionAlerts,
    supervisorWorkload,
    allSubmissions,
    totals,
    reload,
  } = useCoordinatorData()

  const [selectedIntern, setSelectedIntern] = useState(null)
  const [selectedSupervisor, setSelectedSupervisor] = useState(null)
  const [selectedSubmission, setSelectedSubmission] = useState(null)
  const [allAlertsOpen, setAllAlertsOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [actionBanner, setActionBanner] = useState('')

  const priorityAlerts = useMemo(
    () => attentionAlerts.slice(0, MAX_OVERVIEW_ALERTS),
    [attentionAlerts],
  )

  const recentSubmissions = useMemo(
    () => allSubmissions.slice(0, MAX_RECENT_SUBMISSIONS),
    [allSubmissions],
  )

  function handleAlertAction(alert) {
    if (alert.actionType === 'view-record' && alert.recordItem) {
      setAllAlertsOpen(false)
      setSelectedSubmission(alert.recordItem)
      return
    }
    const foundIntern = internProgressRows.find((i) => i.id === alert.internId)
    if (foundIntern) {
      setAllAlertsOpen(false)
      setSelectedIntern(foundIntern)
    }
  }

  function handleFilterToIntern(internId) {
    navigate(`/coordinator/submissions?intern=${encodeURIComponent(internId)}`)
  }

  function handleFilterBySupervisor(supervisorId) {
    navigate(
      `/coordinator/submissions?supervisor=${encodeURIComponent(supervisorId)}`,
    )
  }

  async function handleConfirmDelete(adminReason) {
    if (
      !supabase ||
      !profile ||
      !deleteTarget ||
      deleteTarget.status === 'approved'
    )
      return

    setDeleting(true)
    setDeleteError('')

    const { error: logError } = await logSubmissionDeletion({
      supabase,
      coordinatorProfile: profile,
      deleteTarget,
      reason: adminReason,
    })

    if (logError) {
      setDeleting(false)
      setDeleteError(
        `Could not remove record: the removal was not recorded (${logError.message})`,
      )
      return
    }

    const { error } = await supabase
      .from(deleteTarget.tableName)
      .delete()
      .eq('id', deleteTarget.id)

    setDeleting(false)

    if (error) {
      setDeleteError(`Could not remove record: ${error.message}`)
      return
    }

    const attachmentPath =
      deleteTarget.tableName === 'accomplishments'
        ? deleteTarget.row?.attachment_url
        : deleteTarget.tableName === 'tasks'
          ? deleteTarget.row?.submission_attachment_url
          : null

    if (attachmentPath) {
      // Best-effort cleanup of the deleted record's file: the record is
      // already deleted, so a failed removal must never surface as a
      // failed delete.
      try {
        await supabase.storage.from('attachments').remove([attachmentPath])
      } catch {
        // Ignored — orphan cleanup is secondary to the successful delete.
      }
    }

    const removedLabel = `${deleteTarget.typeLabel} record for ${deleteTarget.internName}`
    setDeleteTarget(null)
    setSelectedSubmission(null)
    setActionBanner(
      `Removed ${removedLabel}. Administrative reason: ${adminReason}`,
    )
    reload()
  }

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
            Operational overview of active interns, priority alerts, supervisor
            workload, and latest submissions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/coordinator/submissions"
            className="inline-flex min-h-10 items-center justify-center rounded-[5px] border border-rule bg-surface px-3.5 text-xs font-medium text-ink hover:bg-surface-subtle"
          >
            Submissions &amp; Reviews
          </Link>
          <Link
            to="/coordinator/reports"
            className="inline-flex min-h-10 items-center justify-center rounded-[5px] bg-accent-solid px-3.5 text-xs font-medium text-on-accent hover:bg-accent-solid-hover"
          >
            Reports &amp; Analytics
          </Link>
        </div>
      </header>

      {actionBanner ? (
        <AlertMessage message={actionBanner} variant="success" />
      ) : null}

      {loadError ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <AlertMessage
              message={`Could not load monitoring data: ${loadError}`}
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

      {loading ? (
        <div className="flex items-center gap-3 rounded-[6px] border border-rule bg-surface px-5 py-14 text-sm text-ink-muted">
          <progress
            aria-label="Loading monitoring overview"
            className="loading-spinner"
          />
          <span>Loading monitoring overview…</span>
        </div>
      ) : (
        <>
          {/* 1. Four Overview Statistics */}
          <section
            aria-label="Monitoring overview statistics"
            className="dashboard-metric-wrap overflow-hidden rounded-[6px] border border-rule bg-surface"
          >
            <dl className="dashboard-metric-grid">
              <div className="dashboard-metric-cell">
                <dt className="text-xs font-medium text-ink-muted">
                  Total Active Interns
                </dt>
                <dd className="text-xl font-semibold tabular-nums text-ink">
                  {totals.totalInterns}
                </dd>
                <dd className="text-xs tabular-nums text-ink-muted">
                  {totals.avgProgressPct.toFixed(1)}% avg completion
                </dd>
              </div>
              <div className="dashboard-metric-cell">
                <dt className="text-xs font-medium text-ink-muted">
                  Pending Supervisor Reviews
                </dt>
                <dd className="text-xl font-semibold tabular-nums text-ink">
                  {totals.totalPendingApprovals}
                </dd>
                <dd className="text-xs text-ink-muted">
                  Submitted records awaiting review
                </dd>
              </div>
              <div className="dashboard-metric-cell">
                <dt className="text-xs font-medium text-ink-muted">
                  Interns Needing Attention
                </dt>
                <dd
                  className={`text-xl font-semibold tabular-nums ${
                    totals.internsNeedingAttention > 0
                      ? 'text-error'
                      : 'text-ink'
                  }`}
                >
                  {totals.internsNeedingAttention}
                </dd>
                <dd className="text-xs tabular-nums text-ink-muted">
                  {totals.activeAlertsCount} priority{' '}
                  {totals.activeAlertsCount === 1 ? 'alert' : 'alerts'}
                </dd>
              </div>
              <div className="dashboard-metric-cell">
                <dt className="text-xs font-medium text-ink-muted">
                  Total Approved Hours
                </dt>
                <dd className="text-xl font-semibold tabular-nums text-ink">
                  {formatDecimalHours(totals.totalApprovedMinutes)}
                </dd>
                <dd className="text-xs text-ink-muted">
                  Approved attendance logs only
                </dd>
              </div>
            </dl>
          </section>

          {/* 2. Needs Attention Center (Top 5 Priority Alerts + View All) */}
          <section
            aria-labelledby="needs-attention-heading"
            className="overflow-hidden rounded-[6px] border border-rule bg-surface"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-surface-subtle px-5 py-3.5">
              <div>
                <h2
                  id="needs-attention-heading"
                  className="text-sm font-semibold text-ink"
                >
                  Needs Attention Center
                </h2>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Up to five highest-priority compliance and review alerts
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-xs tabular-nums text-ink-muted">
                  Showing {priorityAlerts.length} of {attentionAlerts.length}{' '}
                  {attentionAlerts.length === 1 ? 'alert' : 'alerts'}
                </span>
                {attentionAlerts.length > MAX_OVERVIEW_ALERTS ? (
                  <button
                    type="button"
                    onClick={() => setAllAlertsOpen(true)}
                    className="inline-flex min-h-8 items-center rounded-[5px] border border-rule bg-surface px-3 text-xs font-medium text-accent hover:bg-surface-subtle"
                  >
                    View All ({attentionAlerts.length})
                  </button>
                ) : attentionAlerts.length > 0 ? (
                  <Link
                    to="/coordinator/submissions"
                    className="text-xs font-medium text-accent underline-offset-4 hover:underline"
                  >
                    View All in Submissions →
                  </Link>
                ) : null}
              </div>
            </div>

            {priorityAlerts.length === 0 ? (
              <div className="px-5 py-8 text-sm text-ink-muted">
                All active interns are on track with weekly logs, assigned
                tasks, and supervisor assignments.
              </div>
            ) : (
              <ul className="divide-y divide-rule">
                {priorityAlerts.map((alert) => (
                  <li
                    key={alert.id}
                    className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-[4px] border px-2 py-0.5 text-[11px] font-semibold ${SEVERITY_BADGE_CLASSES[alert.severity] ?? SEVERITY_BADGE_CLASSES.info}`}
                        >
                          {alert.categoryLabel}
                        </span>
                        <span className="text-sm font-medium text-ink">
                          {alert.internName}
                        </span>
                        {alert.studentIdNo ? (
                          <span className="text-xs tabular-nums text-ink-muted">
                            ({alert.studentIdNo})
                          </span>
                        ) : null}
                      </div>
                      <p className="text-xs text-ink-muted">{alert.reason}</p>
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-3">
                      <span className="text-xs tabular-nums text-ink-muted">
                        {alert.relevantDate}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleAlertAction(alert)}
                        className="inline-flex min-h-8 items-center justify-center rounded-[5px] border border-rule bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-subtle"
                      >
                        {alert.actionLabel}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 3. Simplified Intern Progress Table */}
          <section
            aria-labelledby="intern-progress-heading"
            className="overflow-hidden rounded-[6px] border border-rule bg-surface"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-surface-subtle px-5 py-3.5">
              <div>
                <h2
                  id="intern-progress-heading"
                  className="text-sm font-semibold text-ink"
                >
                  Intern Progress
                </h2>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Essential hours progress and pending approvals per intern
                </p>
              </div>
              <Link
                to="/coordinator/reports"
                className="text-xs font-medium text-accent underline-offset-4 hover:underline"
              >
                Progress analytics &amp; exports →
              </Link>
            </div>

            {internProgressRows.length === 0 ? (
              <div className="px-5 py-10 text-sm text-ink-muted">
                No intern accounts registered yet. Create intern accounts in{' '}
                <Link
                  to="/coordinator/accounts"
                  className="font-medium text-accent underline underline-offset-4"
                >
                  Account Management
                </Link>
                .
              </div>
            ) : (
              <div
                tabIndex={0}
                role="region"
                aria-labelledby="intern-progress-heading"
                className="table-wrapper"
              >
                <table className="submission-table is-compact">
                  <caption className="visually-hidden">
                    Simplified intern hours progress overview
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Intern</th>
                      <th scope="col">Company</th>
                      <th scope="col">Supervisor</th>
                      <th scope="col" className="w-48">
                        Approved Hours &amp; Progress
                      </th>
                      <th scope="col" className="col-num w-24">
                        Pending
                      </th>
                      <th scope="col" className="col-action w-24">
                        Details
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {internProgressRows.map((intern) => (
                      <tr key={intern.id}>
                        <th scope="row">
                          <div className="min-w-0">
                            <p className="font-medium text-ink">
                              {intern.full_name}
                            </p>
                            <p className="mt-0.5 text-xs font-normal tabular-nums text-ink-muted">
                              {intern.student_id_no || 'No student ID'}
                            </p>
                          </div>
                        </th>
                        <td
                          data-label="Company"
                          className="text-xs text-ink-muted"
                        >
                          {intern.company_name || '—'}
                        </td>
                        <td
                          data-label="Supervisor"
                          className="text-xs text-ink-muted"
                        >
                          {intern.supervisorName}
                        </td>
                        <td data-label="Progress">
                          <div className="min-w-36 space-y-1">
                            <div className="flex items-baseline justify-between gap-2 text-xs tabular-nums">
                              <span className="font-medium text-ink">
                                {formatDecimalHours(intern.approvedMinutes)} /{' '}
                                {intern.requiredHours} hrs
                              </span>
                              <span className="font-semibold text-ink">
                                {intern.progressPct.toFixed(1)}%
                              </span>
                            </div>
                            <progress
                              value={intern.approvedHours}
                              max={intern.requiredHours}
                              aria-label={`Progress for ${intern.full_name}: ${intern.progressPct.toFixed(1)}%`}
                              className={`internship-progress${intern.isComplete ? ' is-complete' : ''}`}
                            />
                          </div>
                        </td>
                        <td
                          data-label="Pending"
                          className="col-num whitespace-nowrap text-xs font-medium text-ink"
                        >
                          {intern.pendingCount}
                        </td>
                        <td data-label="Details" className="col-action">
                          <button
                            type="button"
                            onClick={() => setSelectedIntern(intern)}
                            className="inline-flex min-h-8 items-center justify-center rounded-[5px] border border-rule bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-subtle"
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* 4. Compact Supervisor Workload Preview (Section 5) */}
          <section
            aria-labelledby="supervisor-workload-heading"
            className="overflow-hidden rounded-[6px] border border-rule bg-surface"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-surface-subtle px-5 py-3.5">
              <div>
                <h2
                  id="supervisor-workload-heading"
                  className="text-sm font-semibold text-ink"
                >
                  Supervisor Workload
                </h2>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Assigned interns, pending review queues, and average review
                  turnaround
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  to="/coordinator/reports"
                  className="text-xs font-medium text-accent underline-offset-4 hover:underline"
                >
                  Performance analytics →
                </Link>
                <Link
                  to="/coordinator/accounts"
                  className="text-xs font-medium text-ink-muted underline-offset-4 hover:text-ink hover:underline"
                >
                  Manage assignments →
                </Link>
              </div>
            </div>

            {supervisorWorkload.length === 0 ? (
              <div className="px-5 py-8 text-sm text-ink-muted">
                No supervisors registered yet.
              </div>
            ) : (
              <div
                tabIndex={0}
                role="region"
                aria-labelledby="supervisor-workload-heading"
                className="table-wrapper"
              >
                <table className="submission-table is-compact">
                  <caption className="visually-hidden">
                    Supervisor review workload summary
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Supervisor</th>
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
                        Avg Review Time
                      </th>
                      <th scope="col" className="col-action w-24">
                        Details
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {supervisorWorkload.map((sup) => (
                      <tr key={sup.id}>
                        <th scope="row">
                          <div className="min-w-0">
                            <p className="font-medium text-ink">
                              {sup.full_name}
                            </p>
                            {sup.company_name ? (
                              <p className="mt-0.5 text-xs font-normal text-ink-muted">
                                {sup.company_name}
                              </p>
                            ) : null}
                          </div>
                        </th>
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
                          data-label="Avg Review Time"
                          className="col-num whitespace-nowrap text-xs text-ink-muted"
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

          {/* 5. Recent Submissions Preview (Latest 5 Records Only) */}
          <section
            aria-labelledby="recent-submissions-heading"
            className="overflow-hidden rounded-[6px] border border-rule bg-surface"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-surface-subtle px-5 py-3.5">
              <div>
                <h2
                  id="recent-submissions-heading"
                  className="text-sm font-semibold text-ink"
                >
                  Recent Submissions
                </h2>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Latest five attendance, accomplishment, and task records
                </p>
              </div>
              <Link
                to="/coordinator/submissions"
                className="text-xs font-medium text-accent underline-offset-4 hover:underline"
              >
                View all submissions ({allSubmissions.length}) →
              </Link>
            </div>

            {recentSubmissions.length === 0 ? (
              <div className="px-5 py-8 text-sm text-ink-muted">
                No submissions have been recorded yet.
              </div>
            ) : (
              <div
                tabIndex={0}
                role="region"
                aria-labelledby="recent-submissions-heading"
                className="table-wrapper"
              >
                <table className="submission-table is-compact">
                  <caption className="visually-hidden">
                    Latest five intern submissions
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Intern</th>
                      <th scope="col" className="w-32">
                        Type
                      </th>
                      <th scope="col">Summary</th>
                      <th scope="col" className="w-32">
                        Date
                      </th>
                      <th scope="col" className="w-40">
                        Status
                      </th>
                      <th scope="col" className="col-action w-24">
                        Details
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentSubmissions.map((item) => (
                      <tr key={item.key}>
                        <th scope="row">
                          <div className="min-w-0">
                            <p className="font-medium text-ink">
                              {item.internName}
                            </p>
                            <p className="mt-0.5 text-xs font-normal text-ink-muted">
                              {item.supervisorName}
                            </p>
                          </div>
                        </th>
                        <td
                          data-label="Type"
                          className="whitespace-nowrap text-xs font-medium text-ink-muted"
                        >
                          {item.typeLabel}
                        </td>
                        <td data-label="Summary">
                          <p className="text-xs font-medium text-ink">
                            {item.titleSummary}
                          </p>
                          {item.subtitleSummary ? (
                            <p className="mt-0.5 text-xs text-ink-muted">
                              {item.subtitleSummary}
                            </p>
                          ) : null}
                        </td>
                        <td
                          data-label="Date"
                          className="whitespace-nowrap text-xs tabular-nums text-ink-muted"
                        >
                          {item.submissionDateIso
                            ? formatCalendarDate(item.submissionDateIso)
                            : 'Not submitted'}
                        </td>
                        <td data-label="Status">
                          <CoordinatorStatusPill
                            statusKey={item.displayStatusKey}
                            compact
                          />
                        </td>
                        <td data-label="Details" className="col-action">
                          <button
                            type="button"
                            onClick={() => setSelectedSubmission(item)}
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
        </>
      )}

      {/* All Priority Alerts Modal */}
      <SubmissionDialog
        open={allAlertsOpen}
        title={`All Priority Alerts (${attentionAlerts.length})`}
        description="Complete list of active compliance, assignment, and revision alerts across all interns."
        onClose={() => setAllAlertsOpen(false)}
      >
        <div className="space-y-4">
          <ul className="divide-y divide-rule rounded-[5px] border border-rule bg-surface">
            {attentionAlerts.map((alert) => (
              <li
                key={alert.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center rounded-[4px] border px-2 py-0.5 text-[11px] font-semibold ${SEVERITY_BADGE_CLASSES[alert.severity] ?? SEVERITY_BADGE_CLASSES.info}`}
                    >
                      {alert.categoryLabel}
                    </span>
                    <span className="text-xs font-semibold text-ink">
                      {alert.internName}
                    </span>
                  </div>
                  <p className="text-xs text-ink-muted">{alert.reason}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs tabular-nums text-ink-muted">
                    {alert.relevantDate}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleAlertAction(alert)}
                    className="inline-flex min-h-7 items-center rounded-[4px] border border-rule bg-surface px-2.5 text-xs font-medium text-ink hover:bg-surface-subtle"
                  >
                    {alert.actionLabel}
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex justify-end border-t border-rule pt-4">
            <button
              type="button"
              onClick={() => setAllAlertsOpen(false)}
              className="inline-flex min-h-9 items-center justify-center rounded-[5px] border border-rule bg-surface px-4 text-xs font-medium text-ink hover:bg-surface-subtle"
            >
              Close
            </button>
          </div>
        </div>
      </SubmissionDialog>

      <InternDetailDialog
        intern={selectedIntern}
        onClose={() => setSelectedIntern(null)}
        onSelectSubmission={(item) => setSelectedSubmission(item)}
        onFilterToIntern={handleFilterToIntern}
      />

      <SupervisorDetailDialog
        supervisor={selectedSupervisor}
        onClose={() => setSelectedSupervisor(null)}
        onFilterBySupervisor={handleFilterBySupervisor}
        onInspectIntern={(intern) => setSelectedIntern(intern)}
      />

      <SubmissionDetailDialog
        item={selectedSubmission}
        todayIso={todayIso}
        onClose={() => setSelectedSubmission(null)}
        onRequestDelete={(item) => {
          setDeleteError('')
          setDeleteTarget(item)
        }}
      />

      <DeleteRecordDialog
        target={deleteTarget}
        deleting={deleting}
        errorMessage={deleteError}
        onClose={() => {
          setDeleteTarget(null)
          setDeleteError('')
        }}
        onConfirm={(reason) => void handleConfirmDelete(reason)}
      />
    </div>
  )
}
