import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AccomplishmentDocumentDialog } from '../../components/AccomplishmentDocumentDialog'
import { AlertMessage } from '../../components/AlertMessage'
import { FormField } from '../../components/FormField'
import { PaperclipIcon } from '../../components/Icons'
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
  DISPLAY_STATUS_META,
  extractIsoDatePart,
  formatBreakText,
} from '../../lib/useCoordinatorData'
import { formatCalendarDate, formatWeekRange } from '../../lib/weekUtils'

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

export function PriorityBadge({ priority }) {
  const meta = PRIORITY_META[priority] ?? PRIORITY_META.medium
  return (
    <span
      className={`inline-flex items-center rounded-[5px] border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${meta.className}`}
    >
      {meta.label}
    </span>
  )
}

export function CoordinatorStatusPill({ statusKey, compact = false }) {
  const meta =
    DISPLAY_STATUS_META[statusKey] ?? DISPLAY_STATUS_META.pending
  return (
    <span
      className={`inline-flex items-center gap-1.5 border font-medium whitespace-nowrap ${
        compact
          ? 'rounded-full px-2.5 py-0.5 text-[11px]'
          : 'rounded-[5px] px-2.5 py-0.5 text-xs'
      } ${meta.className}`}
    >
      {compact ? (
        <span
          aria-hidden="true"
          className="size-1.5 shrink-0 rounded-full bg-current opacity-80"
        />
      ) : null}
      <span>{compact ? meta.shortLabel : meta.label}</span>
    </span>
  )
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

export function InternDetailDialog({
  intern,
  onClose,
  onSelectSubmission,
  onFilterToIntern,
}) {
  return (
    <SubmissionDialog
      open={Boolean(intern)}
      title={intern ? intern.full_name : 'Intern details'}
      description="Detailed internship placement, rendered hours, active alerts, and recent submissions."
      onClose={onClose}
    >
      {intern ? (
        <div className="space-y-4 text-xs">
          <dl className="grid grid-cols-1 gap-3 rounded-[5px] border border-rule bg-surface-subtle px-4 py-3 sm:grid-cols-2">
            <div>
              <dt className="text-ink-muted">Student ID</dt>
              <dd className="mt-0.5 font-medium tabular-nums text-ink">
                {intern.student_id_no || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Assigned supervisor</dt>
              <dd className="mt-0.5 font-medium text-ink">
                {intern.supervisorName}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Company</dt>
              <dd className="mt-0.5 font-medium text-ink">
                {intern.company_name || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">School &amp; course</dt>
              <dd className="mt-0.5 font-medium text-ink">
                {[intern.course, intern.school_name].filter(Boolean).join(' — ') ||
                  '—'}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Internship start date</dt>
              <dd className="mt-0.5 tabular-nums text-ink">
                {intern.internship_start_date
                  ? formatCalendarDate(intern.internship_start_date)
                  : '—'}
                {!intern.hasStarted ? (
                  <span className="ms-1.5 text-accent">(Upcoming)</span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Last submission</dt>
              <dd className="mt-0.5 tabular-nums text-ink">
                {intern.lastSubmissionDate
                  ? formatCalendarDate(intern.lastSubmissionDate)
                  : 'No submissions yet'}
              </dd>
            </div>
          </dl>

          <div className="rounded-[5px] border border-rule bg-surface px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold text-ink">Hours progress</p>
              <span className="font-semibold tabular-nums text-ink">
                {intern.progressPct.toFixed(1)}%
              </span>
            </div>
            <div className="mt-2">
              <progress
                value={intern.approvedHours}
                max={intern.requiredHours}
                aria-label={`Hours progress for ${intern.full_name}`}
                className={`internship-progress${intern.isComplete ? ' is-complete' : ''}`}
              />
            </div>
            <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-rule pt-2.5 tabular-nums">
              <div>
                <dt className="text-ink-muted">Approved</dt>
                <dd className="mt-0.5 font-semibold text-ink">
                  {formatDecimalHours(intern.approvedMinutes)}
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Remaining</dt>
                <dd className="mt-0.5 font-semibold text-ink">
                  {formatDecimalHours(intern.remainingMinutes)}
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Required</dt>
                <dd className="mt-0.5 font-semibold text-ink">
                  {intern.requiredHours} hrs
                </dd>
              </div>
            </dl>
          </div>

          {intern.alerts.length > 0 ? (
            <div className="rounded-[5px] border border-rule bg-surface px-4 py-3">
              <p className="font-semibold text-ink">
                Active alerts ({intern.alerts.length})
              </p>
              <ul className="mt-2 space-y-1.5">
                {intern.alerts.map((alert) => (
                  <li
                    key={alert.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule/60 pb-1.5 last:border-b-0 last:pb-0"
                  >
                    <span className="text-ink">
                      <strong className="font-medium">
                        {alert.categoryLabel}:
                      </strong>{' '}
                      {alert.reason}
                    </span>
                    <span className="tabular-nums text-ink-muted">
                      {alert.relevantDate}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="rounded-[5px] border border-rule bg-surface px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-ink">
                Recent submissions ({intern.submissions.length})
              </p>
            </div>
            {intern.submissions.length === 0 ? (
              <p className="mt-2 text-ink-muted">
                No submissions in the selected filter range.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-rule/70">
                {intern.submissions.slice(0, 6).map((item) => (
                  <li
                    key={item.key}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">
                        {item.typeLabel}: {item.shortTitle}
                      </p>
                      <p className="text-ink-muted tabular-nums">
                        {item.reportingPeriod}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <CoordinatorStatusPill
                        statusKey={item.displayStatusKey}
                        compact
                      />
                      <button
                        type="button"
                        onClick={() => {
                          onClose()
                          onSelectSubmission(item)
                        }}
                        className="inline-flex min-h-7 items-center rounded-[4px] border border-rule bg-surface px-2.5 text-xs font-medium text-ink hover:bg-surface-subtle"
                      >
                        View
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rule pt-4">
            <button
              type="button"
              onClick={() => {
                onFilterToIntern(intern.id)
                onClose()
              }}
              className="inline-flex min-h-9 items-center justify-center rounded-[5px] border border-accent/40 bg-accent-tint px-3.5 text-xs font-medium text-accent hover:bg-accent-tint/80"
            >
              Filter submissions to this intern
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-9 items-center justify-center rounded-[5px] border border-rule bg-surface px-4 text-xs font-medium text-ink hover:bg-surface-subtle"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </SubmissionDialog>
  )
}

export function SupervisorDetailDialog({
  supervisor,
  onClose,
  onFilterBySupervisor,
  onInspectIntern,
}) {
  return (
    <SubmissionDialog
      open={Boolean(supervisor)}
      title={supervisor ? supervisor.full_name : 'Supervisor details'}
      description="Assigned intern roster, review workload, and assignment management."
      onClose={onClose}
    >
      {supervisor ? (
        <div className="space-y-4 text-xs">
          <dl className="grid grid-cols-2 gap-3 rounded-[5px] border border-rule bg-surface-subtle px-4 py-3 sm:grid-cols-5">
            <div>
              <dt className="text-ink-muted">Company</dt>
              <dd className="mt-0.5 font-medium text-ink">
                {supervisor.company_name || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Assigned interns</dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-ink">
                {supervisor.assignedInternsCount}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Pending reviews</dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-accent">
                {supervisor.pendingReviews}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Approved / Returned</dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-ink">
                {supervisor.approvedSubmissions} /{' '}
                {supervisor.returnedSubmissions}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Avg review time</dt>
              <dd className="mt-0.5 font-semibold tabular-nums text-ink">
                {supervisor.avgReviewTurnaroundLabel || '—'}
              </dd>
            </div>
          </dl>

          <div className="rounded-[5px] border border-rule bg-surface px-4 py-3">
            <p className="font-semibold text-ink">
              Assigned interns ({supervisor.assignedInterns.length})
            </p>
            {supervisor.assignedInterns.length === 0 ? (
              <p className="mt-2 text-ink-muted">
                No interns assigned to this supervisor in the active filter
                scope.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-rule/70">
                {supervisor.assignedInterns.map((intern) => (
                  <li
                    key={intern.id}
                    className="flex flex-wrap items-center justify-between gap-2 py-2"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-ink">{intern.full_name}</p>
                      <p className="tabular-nums text-ink-muted">
                        {formatDecimalHours(intern.approvedMinutes)} /{' '}
                        {intern.requiredHours} hrs (
                        {intern.progressPct.toFixed(1)}%) — {intern.pendingCount}{' '}
                        pending
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onClose()
                        onInspectIntern(intern)
                      }}
                      className="inline-flex min-h-7 items-center rounded-[4px] border border-rule bg-surface px-2.5 text-xs font-medium text-ink hover:bg-surface-subtle"
                    >
                      Inspect intern
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-[5px] border border-rule bg-surface-subtle px-4 py-3 text-ink-muted">
            New intern-to-supervisor assignments are configured during account
            setup on the Account Management page.
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rule pt-4">
            <div className="flex flex-wrap items-center gap-2">
              {onFilterBySupervisor ? (
                <button
                  type="button"
                  onClick={() => {
                    onFilterBySupervisor(supervisor.id)
                    onClose()
                  }}
                  className="inline-flex min-h-9 items-center justify-center rounded-[5px] border border-accent/40 bg-accent-tint px-3 text-xs font-medium text-accent hover:bg-accent-tint/80"
                >
                  Filter by supervisor
                </button>
              ) : null}
              <Link
                to="/coordinator/accounts"
                onClick={onClose}
                className="inline-flex min-h-9 items-center justify-center rounded-[5px] border border-rule bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-subtle"
              >
                Manage accounts &amp; assignments
              </Link>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-9 items-center justify-center rounded-[5px] border border-rule bg-surface px-4 text-xs font-medium text-ink hover:bg-surface-subtle"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </SubmissionDialog>
  )
}

export function SubmissionDetailDialog({
  item,
  todayIso,
  onClose,
  onRequestDelete,
}) {
  const isApproved = item?.status === 'approved'
  const [documentKey, setDocumentKey] = useState('')
  const isDocumentOpen = Boolean(
    item && item.kind === 'accomplishments' && documentKey === item.key,
  )

  function handleClose() {
    setDocumentKey('')
    onClose?.()
  }

  return (
    <>
      <SubmissionDialog
        open={Boolean(item)}
        title={
          item
            ? `${item.typeLabel} Details — ${item.internName}`
            : 'Submission details'
        }
        description="Complete submission record, history timeline, supervisor review remarks, and coordinator oversight."
        onClose={handleClose}
      >
      {item ? (
        <div className="space-y-4 text-xs">
          {/* Structured Header Metadata */}
          <dl className="grid grid-cols-1 gap-3 rounded-[5px] border border-rule bg-surface-subtle px-4 py-3 sm:grid-cols-2">
            <div>
              <dt className="text-ink-muted">Intern</dt>
              <dd className="mt-0.5 font-semibold text-ink">
                {item.internName}
                {item.studentIdNo ? (
                  <span className="ms-1.5 tabular-nums font-normal text-ink-muted">
                    ({item.studentIdNo})
                  </span>
                ) : null}
                {item.companyName ? (
                  <span className="block font-normal text-ink-muted">
                    {item.companyName}
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Current status</dt>
              <dd className="mt-1">
                <CoordinatorStatusPill statusKey={item.displayStatusKey} />
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Assigned supervisor</dt>
              <dd className="mt-0.5 font-medium text-ink">
                {item.supervisorName}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">
                {item.kind === 'tasks' ? 'Deadline' : 'Reporting period'}
              </dt>
              <dd className="mt-0.5 font-medium tabular-nums text-ink">
                {item.reportingPeriod}
              </dd>
            </div>
          </dl>

          <div className="rounded-[5px] border border-rule bg-surface px-4 py-3">
            {item.kind === 'attendance' ? (
              <dl className="space-y-2">
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-ink-muted">Date</dt>
                  <dd className="font-medium tabular-nums text-ink">
                    {formatCalendarDate(item.row.attendance_date)}
                  </dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-ink-muted">Reporting week</dt>
                  <dd className="tabular-nums text-ink">
                    {formatWeekRange(item.row.week_of, 5)}
                  </dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-ink-muted">Time in / Time out</dt>
                  <dd className="font-medium tabular-nums text-ink">
                    {formatWallClockTime(item.row.time_in)} –{' '}
                    {formatWallClockTime(item.row.time_out)}
                  </dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-ink-muted">Lunch break</dt>
                  <dd className="tabular-nums text-ink">
                    {formatBreakText(item.row.break_minutes)}
                  </dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2 border-t border-rule pt-2">
                  <dt className="font-medium text-ink">Rendered hours</dt>
                  <dd className="font-semibold tabular-nums text-ink">
                    {item.renderedMinutes !== null
                      ? `${formatDurationMinutes(item.renderedMinutes)} (${formatDecimalHours(item.renderedMinutes)})`
                      : 'Incomplete time log'}
                  </dd>
                </div>
              </dl>
            ) : item.kind === 'accomplishments' ? (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">
                      {item.row.title}
                    </p>
                    <p className="mt-0.5 tabular-nums text-ink-muted">
                      Week of {formatWeekRange(item.row.week_of)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDocumentKey(item.key)}
                    className="inline-flex min-h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-[5px] border border-rule bg-surface px-2.5 text-xs font-medium text-ink hover:bg-surface-subtle"
                  >
                    View document
                  </button>
                </div>
                {item.row.description ? (
                  <div>
                    <p className="font-medium text-ink-muted">
                      Activities performed
                    </p>
                    <p className="mt-0.5 whitespace-pre-line text-ink text-pretty break-words">
                      {item.row.description}
                    </p>
                  </div>
                ) : null}
                {item.row.skills_acquired ? (
                  <div>
                    <p className="font-medium text-ink-muted">
                      Skills acquired
                    </p>
                    <p className="mt-0.5 whitespace-pre-line text-ink text-pretty break-words">
                      {item.row.skills_acquired}
                    </p>
                  </div>
                ) : null}
                {item.row.challenges_encountered ? (
                  <div>
                    <p className="font-medium text-ink-muted">
                      Challenges encountered
                    </p>
                    <p className="mt-0.5 whitespace-pre-line text-ink text-pretty break-words">
                      {item.row.challenges_encountered}
                    </p>
                  </div>
                ) : null}
                {item.row.lessons_learned ? (
                  <div>
                    <p className="font-medium text-ink-muted">
                      Lessons learned
                    </p>
                    <p className="mt-0.5 whitespace-pre-line text-ink text-pretty break-words">
                      {item.row.lessons_learned}
                    </p>
                  </div>
                ) : null}
                <CoordinatorAttachmentControl
                  objectPath={item.row.attachment_url}
                />
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">
                    {item.row.title}
                  </p>
                  <PriorityBadge priority={item.row.priority} />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums text-ink-muted">
                  {item.assignerName ? (
                    <span>Assigned by {item.assignerName}</span>
                  ) : null}
                  <span>
                    Deadline:{' '}
                    <span className="font-medium text-ink">
                      {formatCalendarDate(
                        item.row.deadline || item.row.task_date,
                      )}
                    </span>
                  </span>
                  {item.row.status === 'pending' &&
                  !item.row.submitted_at &&
                  (item.row.deadline || item.row.task_date) ? (
                    <span
                      className={
                        DEADLINE_TONE_CLASSES[
                          getDeadlineBadge(
                            item.row.deadline || item.row.task_date,
                            todayIso,
                          ).tone
                        ]
                      }
                    >
                      (
                      {
                        getDeadlineBadge(
                          item.row.deadline || item.row.task_date,
                          todayIso,
                        ).label
                      }
                      )
                    </span>
                  ) : null}
                  {item.row.submitted_at ? (
                    <span>
                      Submitted on{' '}
                      {formatCalendarDate(
                        extractIsoDatePart(item.row.submitted_at),
                      )}
                    </span>
                  ) : (
                    <span>Assigned – Not Submitted</span>
                  )}
                </div>
                {item.row.description ? (
                  <div>
                    <p className="font-medium text-ink-muted">Instructions</p>
                    <p className="mt-0.5 whitespace-pre-line text-ink text-pretty break-words">
                      {item.row.description}
                    </p>
                  </div>
                ) : null}
                {item.row.completion_description ? (
                  <div className="border-t border-rule pt-2">
                    <p className="font-medium text-ink-muted">
                      Intern completion notes
                    </p>
                    <p className="mt-0.5 whitespace-pre-line text-ink text-pretty break-words">
                      {item.row.completion_description}
                    </p>
                  </div>
                ) : null}
                <CoordinatorAttachmentControl
                  objectPath={item.row.submission_attachment_url}
                />
              </div>
            )}
          </div>

          <div className="rounded-[5px] border border-rule bg-surface-subtle px-4 py-3">
            <p className="font-semibold text-ink">Supervisor review &amp; remarks</p>
            {item.row.reviewed_at || item.row.reviewed_by ? (
              <dl className="mt-2 space-y-1.5">
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-ink-muted">Reviewed by</dt>
                  <dd className="font-medium text-ink">
                    {item.reviewerName || 'Unknown user'}
                  </dd>
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <dt className="text-ink-muted">Review date</dt>
                  <dd className="tabular-nums text-ink">
                    {item.row.reviewed_at
                      ? formatCalendarDate(
                          extractIsoDatePart(item.row.reviewed_at),
                        )
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Supervisor remarks</dt>
                  <dd className="mt-0.5 whitespace-pre-line text-ink break-words">
                    {item.row.reviewer_remarks?.trim()
                      ? item.row.reviewer_remarks
                      : 'No remarks provided.'}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-1.5 text-ink-muted">
                {item.displayStatusKey === 'assigned_not_submitted'
                  ? 'This task has not yet been submitted by the intern for supervisor review.'
                  : 'Pending supervisor review — no review remarks recorded yet.'}
              </p>
            )}
          </div>

          <div className="rounded-[5px] border border-rule bg-surface px-4 py-3">
            <p className="font-semibold text-ink">Submission history</p>
            <ol className="mt-2 space-y-2 border-s border-rule ps-3">
              {item.history.map((ev) => (
                <li key={ev.id} className="space-y-0.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-ink">{ev.label}</span>
                    <span className="tabular-nums text-ink-muted">
                      {ev.dateLabel}
                    </span>
                  </div>
                  {ev.remarks ? (
                    <p className="text-ink-muted">Remarks: {ev.remarks}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>

          {isApproved ? (
            <div className="rounded-[5px] border border-success-border/40 bg-success-tint px-4 py-3 text-success">
              Approved historical records are protected from direct deletion to
              preserve official internship hour logs and audit trails.
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rule pt-4">
            {isApproved ? (
              <span className="text-xs font-medium text-ink-muted">
                Historical approved record locked
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onRequestDelete(item)}
                className="inline-flex min-h-9 items-center justify-center rounded-[5px] border border-rejected-border bg-rejected-bg px-3.5 text-xs font-medium text-on-accent hover:opacity-90"
              >
                Remove record
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex min-h-9 items-center justify-center rounded-[5px] border border-rule bg-surface px-4 text-xs font-medium text-ink hover:bg-surface-subtle"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
      </SubmissionDialog>

      <AccomplishmentDocumentDialog
        open={isDocumentOpen}
        onClose={() => setDocumentKey('')}
        row={isDocumentOpen ? item.row : null}
        internName={item?.internName}
        studentIdNo={item?.studentIdNo}
        course={item?.course}
        schoolName={item?.schoolName}
        companyName={item?.companyName}
        supervisorName={
          item?.supervisorName === '—' ? '' : item?.supervisorName
        }
      />
    </>
  )
}

export function DeleteRecordDialog({
  target,
  deleting,
  errorMessage,
  onClose,
  onConfirm,
}) {
  const [reason, setReason] = useState('')
  const [validationError, setValidationError] = useState('')

  function handleSubmit(event) {
    event.preventDefault()
    const trimmed = reason.trim()
    if (!trimmed) {
      setValidationError(
        'Enter an administrative reason before removing this record.',
      )
      return
    }
    setValidationError('')
    onConfirm(trimmed)
  }

  return (
    <SubmissionDialog
      open={Boolean(target)}
      title="Administrative record removal"
      description="Only non-approved records may be removed directly. Record a clear administrative reason."
      onClose={() => {
        setReason('')
        setValidationError('')
        onClose()
      }}
    >
      {target ? (
        <form onSubmit={handleSubmit} noValidate className="space-y-4 text-sm">
          <div>
            <AlertMessage
              message={validationError || errorMessage}
              variant="error"
            />
          </div>

          <p className="text-ink">
            Remove{' '}
            <span className="font-semibold">
              {target.typeLabel}: {target.shortTitle}
            </span>{' '}
            for <span className="font-semibold">{target.internName}</span>?
          </p>

          <FormField
            id="admin-delete-reason"
            name="administrative_reason"
            label="Reason for administrative removal"
            multiline
            rows={2}
            required
            placeholder="e.g. Duplicate submission created in error"
            value={reason}
            onChange={(event) => {
              setReason(event.target.value)
              if (validationError) setValidationError('')
            }}
          />

          <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-rule pt-4">
            <button
              type="button"
              disabled={deleting}
              onClick={() => {
                setReason('')
                setValidationError('')
                onClose()
              }}
              className="inline-flex min-h-10 items-center justify-center rounded-[5px] border border-rule bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-subtle disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={deleting}
              className="inline-flex min-h-10 items-center justify-center rounded-[5px] border border-rejected-border bg-rejected-bg px-4 text-sm font-medium text-on-accent hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {deleting ? 'Removing…' : 'Confirm removal'}
            </button>
          </div>
        </form>
      ) : null}
    </SubmissionDialog>
  )
}
