import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { AccomplishmentDocumentDialog } from '../../components/AccomplishmentDocumentDialog'
import { AlertMessage } from '../../components/AlertMessage'
import { FormField } from '../../components/FormField'
import { CloseIcon, PaperclipIcon } from '../../components/Icons'
import { StatusBadge } from '../../components/StatusBadge'
import { SubmissionDialog } from '../../components/SubmissionDialog'
import { useAuth } from '../../context/useAuth'
import { resolveWeeklyReflection } from '../../lib/accomplishmentDocument'
import {
  formatDecimalHours,
  formatDurationMinutes,
  formatWallClockTime,
} from '../../lib/attendanceUtils'
import { getDeadlineBadge } from '../../lib/internDashboardUtils'
import { resolveHostOrganizationName } from '../../lib/schemaCompat'
import {
  getAttachmentDisplayName,
  splitFilenameForDisplay,
} from '../../lib/submissionHelpers'
import { supabase } from '../../lib/supabaseClient'
import {
  closeModalDialogAnimated,
  isPointerOutsideDialog,
  supportsDialogClosedBy,
} from '../../lib/topLayerDialog'
import { useFormValidationSync } from '../../lib/useFormValidationSync'
import { extractIsoDatePart, formatBreakText } from '../../lib/useSupervisorData'
import {
  formatCalendarDate,
  formatWeekRange,
  formatWeekdayCalendarDate,
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

const TABLE_BY_TYPE = {
  attendance: 'weekly_attendance',
  accomplishments: 'accomplishments',
  tasks: 'tasks',
}

const DECISION_SUCCESS_WORD = {
  approved: 'approved',
  returned: 'returned for revision',
  rejected: 'rejected',
}

function setFieldInvalidFallback(input, invalid) {
  if (!input) return
  input.classList.toggle('user-invalid-fallback', invalid)
  input.setAttribute('aria-invalid', invalid ? 'true' : 'false')
  input.closest('.field-group')?.classList.toggle('has-error-fallback', invalid)
}

async function openSupervisorAttachment(objectPath) {
  if (!supabase || !objectPath) {
    return { signedUrl: '', error: '' }
  }

  const { data, error } = await supabase.storage
    .from('attachments')
    .createSignedUrl(objectPath, 300)

  if (error || !data?.signedUrl) {
    return {
      signedUrl: '',
      error: error?.message || 'Could not generate a signed download link.',
    }
  }

  const openedWindow = window.open(
    data.signedUrl,
    '_blank',
    'noopener,noreferrer',
  )
  return {
    signedUrl: data.signedUrl,
    error: openedWindow
      ? ''
      : 'Pop-up blocked by your browser. Use the direct signed link shown next to the attachment.',
  }
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

export function FileNameLabel({ objectPath }) {
  const displayName = getAttachmentDisplayName(objectPath)
  const { stem, extension } = splitFilenameForDisplay(displayName)
  return (
    <span className="filename-truncate text-xs text-ink-muted">
      <span>{stem}</span>
      {extension}
    </span>
  )
}

export function AttachmentControl({ objectPath, onError }) {
  const [opening, setOpening] = useState(false)
  const [signedState, setSignedState] = useState({ path: '', url: '' })
  const [inlineError, setInlineError] = useState('')

  if (!objectPath) return null

  const displayName = getAttachmentDisplayName(objectPath)
  const signedUrl = signedState.path === objectPath ? signedState.url : ''

  async function handleOpen() {
    setOpening(true)
    setInlineError('')
    onError?.('')

    const result = await openSupervisorAttachment(objectPath)

    setOpening(false)
    if (result.signedUrl) {
      setSignedState({ path: objectPath, url: result.signedUrl })
    }
    if (result.error) {
      if (onError) {
        onError(result.error)
      } else {
        setInlineError(result.error)
      }
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
        <FileNameLabel objectPath={objectPath} />
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
      {inlineError ? (
        <p role="alert" className="text-xs text-error">
          {inlineError}
        </p>
      ) : null}
    </div>
  )
}

const DRAWER_TITLES = {
  accomplishments: 'Weekly Accomplishment Review',
  attendance: 'Weekly Attendance Review',
  tasks: 'Task Submission Review',
}

function formatTimestampDisplay(isoTimestamp) {
  const datePart = extractIsoDatePart(isoTimestamp)
  if (!datePart) return '—'
  const dateLabel = formatCalendarDate(datePart)
  const parsed = new Date(isoTimestamp)
  if (Number.isNaN(parsed.getTime())) return dateLabel
  const timeLabel = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed)
  return `${dateLabel} · ${timeLabel}`
}

function buildSubmissionHistory(item) {
  if (!item?.row) return []

  const entries = []
  const { row, type, internName } = item

  if (type === 'tasks') {
    if (row.created_at) {
      entries.push({
        id: 'assigned',
        title: 'Task assigned',
        timestamp: row.created_at,
        detail: 'Task created and assigned in the internship queue.',
      })
    }
    if (row.submitted_at) {
      entries.push({
        id: 'submitted',
        title: `Submitted by ${internName}`,
        timestamp: row.submitted_at,
        detail: 'Task completion submitted for supervisor review.',
      })
    }
  } else {
    entries.push({
      id: 'submitted',
      title: `Submitted by ${internName}`,
      timestamp: row.created_at,
      detail:
        type === 'accomplishments'
          ? `Weekly accomplishment submitted for ${formatWeekRange(row.week_of)}.`
          : `Attendance log submitted for ${formatCalendarDate(row.attendance_date)}.`,
    })
  }

  const baseTimestamp = type === 'tasks' ? row.submitted_at : row.created_at
  const baseMs = baseTimestamp ? Date.parse(baseTimestamp) : Number.NaN
  const updatedMs = row.updated_at ? Date.parse(row.updated_at) : Number.NaN
  if (
    Number.isFinite(baseMs) &&
    Number.isFinite(updatedMs) &&
    updatedMs - baseMs > 60_000
  ) {
    entries.push({
      id: 'updated',
      title: 'Submission updated',
      timestamp: row.updated_at,
      detail: 'Intern updated submission details prior to review.',
    })
  }

  if (row.reviewed_at) {
    entries.push({
      id: 'previous-review',
      title: 'Previous review record',
      timestamp: row.reviewed_at,
      detail: row.reviewer_remarks
        ? `Remarks: "${row.reviewer_remarks}"`
        : 'Previous review activity recorded.',
    })
  }

  entries.push({
    id: 'current-status',
    title: 'Pending Supervisor Review',
    timestamp: null,
    detail: 'Awaiting approve, return for revision, or reject decision.',
    isCurrent: true,
  })

  return entries
}

function DrawerNarrativeField({ label, value, emptyText = 'None provided.' }) {
  return (
    <div className="space-y-1">
      <h4 className="text-xs font-semibold uppercase tracking-[0.04em] text-ink-muted">
        {label}
      </h4>
      {value ? (
        <p className="whitespace-pre-line text-sm leading-[1.6] text-ink break-words">
          {value}
        </p>
      ) : (
        <p className="text-sm italic text-ink-muted">{emptyText}</p>
      )}
    </div>
  )
}

function ReviewDialogBody({
  item,
  intern,
  supervisorId,
  todayIso,
  headingId,
  descId,
  onRequestClose,
  onReviewed,
  onAttachmentError,
  onSubmittingChange,
  onOpenDocument,
}) {
  const [reviewRemarks, setReviewRemarks] = useState('')
  const [reviewError, setReviewError] = useState('')
  const [submittingDecision, setSubmittingDecision] = useState(null)
  const reviewFormRef = useRef(null)
  const remarksInputRef = useRef(null)
  const scrollBodyRef = useRef(null)
  const drawerHeadingRef = useRef(null)

  useFormValidationSync(reviewFormRef)

  useEffect(() => {
    onSubmittingChange?.(Boolean(submittingDecision))
  }, [submittingDecision, onSubmittingChange])

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      if (scrollBodyRef.current) {
        scrollBodyRef.current.scrollTop = 0
      }
      drawerHeadingRef.current?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [])

  async function handleReviewDecision(decision) {
    if (!supabase || !supervisorId || !item) return

    const trimmedRemarks = reviewRemarks.trim()
    if (
      (decision === 'returned' || decision === 'rejected') &&
      !trimmedRemarks
    ) {
      setReviewError(
        decision === 'returned'
          ? 'Please enter remarks explaining what needs to be revised before returning this submission.'
          : 'Please enter remarks explaining why this submission is being rejected.',
      )
      setFieldInvalidFallback(remarksInputRef.current, true)
      remarksInputRef.current?.focus()
      return
    }

    setSubmittingDecision(decision)
    setReviewError('')

    const tableName = TABLE_BY_TYPE[item.type]
    const { data: updatedRows, error: updateError } = await supabase
      .from(tableName)
      .update({
        status: decision,
        reviewed_by: supervisorId,
        reviewer_remarks: trimmedRemarks || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', item.row.id)
      .eq('status', 'pending')
      .select('id')

    if (updateError) {
      setReviewError(`Could not save review decision: ${updateError.message}`)
      setSubmittingDecision(null)
      return
    }

    if (!updatedRows || updatedRows.length === 0) {
      setReviewError(
        'This submission could not be updated because it was already reviewed or is no longer pending.',
      )
      setSubmittingDecision(null)
      return
    }

    const decisionWord = DECISION_SUCCESS_WORD[decision] ?? decision
    const successMessage = `${item.typeLabel} ${decisionWord} for ${item.internName}.`

    setSubmittingDecision(null)
    onSubmittingChange?.(false)
    onReviewed?.(successMessage)
    onRequestClose?.()
  }

  const historyEntries = buildSubmissionHistory(item)
  const drawerTitle = DRAWER_TITLES[item.type] ?? 'Submission Review'
  const submissionTimestamp =
    item.type === 'tasks'
      ? item.row.submitted_at || item.row.created_at
      : item.row.created_at
  const internProgram =
    [intern?.course, intern?.school_name].filter(Boolean).join(' · ') || '—'

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <header className="flex shrink-0 items-start justify-between gap-4 border-b border-rule bg-surface px-5 py-4 sm:px-6">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-[5px] border border-rule bg-surface-subtle px-2 py-0.5 text-xs font-medium text-ink-muted">
              {item.typeLabel}
            </span>
            <StatusBadge status={item.row.status} />
          </div>
          <h2
            id={headingId}
            ref={drawerHeadingRef}
            tabIndex={-1}
            className="text-base font-semibold tracking-[-0.01em] text-ink outline-none"
          >
            {drawerTitle}
          </h2>
          <p id={descId} className="text-xs text-ink-muted">
            {intern?.full_name || item.internName}
            {intern?.student_id_no ? ` · ${intern.student_id_no}` : ''}
          </p>
        </div>

        <button
          type="button"
          disabled={Boolean(submittingDecision)}
          onClick={onRequestClose}
          aria-label="Close review drawer"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-[5px] border border-rule bg-surface text-ink-muted hover:bg-surface-subtle hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
        >
          <CloseIcon className="size-4" />
        </button>
      </header>

      <div
        ref={scrollBodyRef}
        className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6"
      >
        <section
          aria-labelledby={`${headingId}-intern`}
          className="rounded-[6px] border border-rule bg-surface-subtle/70 p-4"
        >
          <h3
            id={`${headingId}-intern`}
            className="text-xs font-semibold uppercase tracking-[0.04em] text-ink-muted"
          >
            Intern Information
          </h3>
          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2.5 text-xs sm:grid-cols-2">
            <div>
              <dt className="text-ink-muted">Intern Name</dt>
              <dd className="mt-0.5 font-medium text-ink">
                {intern?.full_name || item.internName}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Student ID</dt>
              <dd className="mt-0.5 font-medium tabular-nums text-ink">
                {intern?.student_id_no || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Host Organization / Institution</dt>
              <dd className="mt-0.5 text-ink">
                {resolveHostOrganizationName(intern) || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Office / Department</dt>
              <dd className="mt-0.5 text-ink">
                {intern?.department_office || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Program / School</dt>
              <dd className="mt-0.5 text-ink">{internProgram}</dd>
            </div>
            {intern?.year_level ? (
              <div>
                <dt className="text-ink-muted">Year Level</dt>
                <dd className="mt-0.5 text-ink">{intern.year_level}</dd>
              </div>
            ) : null}
          </dl>
        </section>

        {item.type === 'accomplishments' ? (
          (() => {
            const weekReflection = resolveWeeklyReflection(
              item.weeklyReflection,
              item.weekRows ?? [item.row],
            )
            return (
              <section
                aria-labelledby={`${headingId}-report`}
                className="space-y-4 rounded-[6px] border border-rule bg-surface p-4 sm:p-5"
              >
                <div className="border-b border-rule pb-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3
                      id={`${headingId}-report`}
                      className="text-sm font-semibold text-ink break-words"
                    >
                      {item.row.entry_date
                        ? formatWeekdayCalendarDate(item.row.entry_date)
                        : item.row.title || 'Weekly Accomplishment Report'}
                    </h3>
                    <button
                      type="button"
                      onClick={onOpenDocument}
                      className="inline-flex min-h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-[5px] border border-rule bg-surface px-2.5 text-xs font-medium text-ink hover:bg-surface-subtle"
                    >
                      View weekly document
                    </button>
                  </div>
                  <dl className="mt-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                    <div>
                      <dt className="text-ink-muted">Reporting Period</dt>
                      <dd className="mt-0.5 font-medium tabular-nums text-ink">
                        {formatWeekRange(item.row.week_of, 5)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-ink-muted">Submission Date</dt>
                      <dd className="mt-0.5 font-medium tabular-nums text-ink">
                        {formatTimestampDisplay(submissionTimestamp)}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="space-y-4">
                  <DrawerNarrativeField
                    label="Activities Performed"
                    value={item.row.description || item.row.title}
                    emptyText="No activities recorded."
                  />
                  <DrawerNarrativeField
                    label="Output / Result"
                    value={item.row.output_result}
                    emptyText="Not provided"
                  />
                  <DrawerNarrativeField
                    label="Weekly Skills Acquired"
                    value={weekReflection.skills_acquired}
                    emptyText="No skills recorded."
                  />
                  <DrawerNarrativeField
                    label="Weekly Challenges Encountered"
                    value={weekReflection.challenges_encountered}
                    emptyText="No challenges recorded."
                  />
                  <DrawerNarrativeField
                    label="Weekly Lessons Learned / Next Steps"
                    value={weekReflection.lessons_learned}
                    emptyText="No lessons recorded."
                  />
                </div>

                <div className="border-t border-rule pt-3.5">
                  <h4 className="text-xs font-semibold uppercase tracking-[0.04em] text-ink-muted">
                    Uploaded Attachments
                  </h4>
                  {item.row.attachment_url ? (
                    <AttachmentControl
                      objectPath={item.row.attachment_url}
                      onError={onAttachmentError}
                    />
                  ) : (
                    <p className="mt-1.5 text-xs italic text-ink-muted">
                      No attachment uploaded.
                    </p>
                  )}
                </div>
              </section>
            )
          })()
        ) : item.type === 'attendance' ? (
          <section
            aria-labelledby={`${headingId}-attendance`}
            className="rounded-[6px] border border-rule bg-surface p-4 sm:p-5 text-xs"
          >
            <h3
              id={`${headingId}-attendance`}
              className="text-xs font-semibold uppercase tracking-[0.04em] text-ink-muted"
            >
              Attendance Log Details
            </h3>
            <dl className="mt-3 space-y-2.5">
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-ink-muted">Attendance Date</dt>
                <dd className="font-medium tabular-nums text-ink">
                  {formatCalendarDate(item.row.attendance_date)}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-ink-muted">Reporting Period</dt>
                <dd className="tabular-nums text-ink">
                  {formatWeekRange(item.row.week_of, 5)}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-ink-muted">Time In / Time Out</dt>
                <dd className="font-medium tabular-nums text-ink">
                  {formatWallClockTime(item.row.time_in)} –{' '}
                  {formatWallClockTime(item.row.time_out)}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-ink-muted">Lunch Break</dt>
                <dd className="tabular-nums text-ink">
                  {formatBreakText(item.row.break_minutes)}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-ink-muted">Submission Date</dt>
                <dd className="tabular-nums text-ink">
                  {formatTimestampDisplay(submissionTimestamp)}
                </dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2 border-t border-rule pt-2.5">
                <dt className="font-medium text-ink">Rendered Hours</dt>
                <dd className="font-semibold tabular-nums text-ink">
                  {item.renderedMinutes !== null
                    ? `${formatDurationMinutes(item.renderedMinutes)} (${formatDecimalHours(item.renderedMinutes)})`
                    : '—'}
                </dd>
              </div>
            </dl>
          </section>
        ) : (
          <section
            aria-labelledby={`${headingId}-task`}
            className="space-y-4 rounded-[6px] border border-rule bg-surface p-4 sm:p-5"
          >
            <div className="border-b border-rule pb-3.5">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3
                  id={`${headingId}-task`}
                  className="text-sm font-semibold text-ink break-words"
                >
                  {item.row.title}
                </h3>
                <PriorityBadge priority={item.row.priority} />
              </div>
              <dl className="mt-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                <div>
                  <dt className="text-ink-muted">Deadline</dt>
                  <dd className="mt-0.5 flex flex-wrap items-center gap-1.5 tabular-nums">
                    <span className="font-medium text-ink">
                      {formatCalendarDate(item.row.deadline || item.row.task_date)}
                    </span>
                    {item.row.deadline || item.row.task_date ? (
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
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Submission Date</dt>
                  <dd className="mt-0.5 font-medium tabular-nums text-ink">
                    {formatTimestampDisplay(submissionTimestamp)}
                  </dd>
                </div>
              </dl>
            </div>

            <div className="space-y-4">
              <DrawerNarrativeField
                label="Task Instructions"
                value={item.row.description}
                emptyText="No instructions recorded."
              />
              <DrawerNarrativeField
                label="Intern Completion Notes"
                value={item.row.completion_description}
                emptyText="No completion notes recorded."
              />
            </div>

            <div className="border-t border-rule pt-3.5">
              <h4 className="text-xs font-semibold uppercase tracking-[0.04em] text-ink-muted">
                Uploaded Attachments
              </h4>
              {item.row.submission_attachment_url ? (
                <AttachmentControl
                  objectPath={item.row.submission_attachment_url}
                  onError={onAttachmentError}
                />
              ) : (
                <p className="mt-1.5 text-xs italic text-ink-muted">
                  No attachment uploaded.
                </p>
              )}
            </div>
          </section>
        )}

        <section
          aria-labelledby={`${headingId}-history`}
          className="rounded-[6px] border border-rule bg-surface p-4"
        >
          <h3
            id={`${headingId}-history`}
            className="text-xs font-semibold uppercase tracking-[0.04em] text-ink-muted"
          >
            Submission History
          </h3>
          <ol className="mt-3 space-y-3 border-s border-rule ps-4">
            {historyEntries.map((entry) => (
              <li key={entry.id} className="relative text-xs">
                <span
                  aria-hidden="true"
                  className={`absolute -start-[1.3125rem] top-1 size-2 rounded-full border ${
                    entry.isCurrent
                      ? 'border-accent bg-accent-solid'
                      : 'border-rule bg-surface'
                  }`}
                />
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="font-medium text-ink">{entry.title}</p>
                  {entry.timestamp ? (
                    <time
                      dateTime={entry.timestamp}
                      className="tabular-nums text-ink-muted"
                    >
                      {formatTimestampDisplay(entry.timestamp)}
                    </time>
                  ) : null}
                </div>
                <p className="mt-0.5 text-ink-muted">{entry.detail}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <footer className="shrink-0 border-t border-rule bg-surface-subtle/60 px-5 py-4 sm:px-6">
        {reviewError ? (
          <div className="mb-3">
            <AlertMessage message={reviewError} variant="error" />
          </div>
        ) : null}

        <form
          ref={reviewFormRef}
          aria-label="Review decision"
          onSubmit={(event) => {
            event.preventDefault()
            void handleReviewDecision('approved')
          }}
          noValidate
          className="space-y-3"
        >
          <FormField
            inputRef={remarksInputRef}
            id="supervisor-review-remarks"
            name="reviewer_remarks"
            label="Supervisor Remarks"
            multiline
            rows={2}
            hint="Optional for Approve. Required for Return for Revision or Reject."
            placeholder="Add feedback or revision instructions for the intern."
            validationMessage="Remarks are required when returning or rejecting a submission."
            value={reviewRemarks}
            onChange={(event) => {
              setReviewRemarks(event.target.value)
              setFieldInvalidFallback(remarksInputRef.current, false)
              if (reviewError) setReviewError('')
            }}
          />

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <button
              type="button"
              disabled={Boolean(submittingDecision)}
              onClick={onRequestClose}
              className="inline-flex min-h-9 items-center justify-center rounded-[5px] border border-rule bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-subtle disabled:opacity-60 sm:text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={Boolean(submittingDecision)}
              onClick={() => void handleReviewDecision('rejected')}
              className="inline-flex min-h-9 items-center justify-center rounded-[5px] border border-rejected-border bg-rejected-bg px-3 text-xs font-medium text-on-accent hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
            >
              {submittingDecision === 'rejected' ? 'Rejecting…' : 'Reject'}
            </button>
            <button
              type="button"
              disabled={Boolean(submittingDecision)}
              onClick={() => void handleReviewDecision('returned')}
              className="inline-flex min-h-9 items-center justify-center rounded-[5px] border border-error-border/60 bg-error-tint px-3 text-xs font-medium text-error hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
            >
              {submittingDecision === 'returned'
                ? 'Returning…'
                : 'Return for Revision'}
            </button>
            <button
              type="submit"
              disabled={Boolean(submittingDecision)}
              className="inline-flex min-h-9 items-center justify-center rounded-[5px] bg-accent-solid px-4 text-xs font-medium text-on-accent hover:bg-accent-solid-hover disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
            >
              {submittingDecision === 'approved' ? 'Approving…' : 'Approve'}
            </button>
          </div>
        </form>
      </footer>
    </div>
  )
}

export function ReviewDialog({
  item,
  intern = null,
  supervisorId,
  supervisorName = '',
  onClose,
  onReviewed,
  onAttachmentError,
}) {
  const { profile } = useAuth()
  const dialogRef = useRef(null)
  const pointerDownOutsideRef = useRef(false)
  const isSubmittingRef = useRef(false)
  const headingId = useId()
  const descId = useId()
  const todayIso = getTodayIsoDate()
  const open = Boolean(item)
  const supportsClosedBy = supportsDialogClosedBy()
  const [documentKey, setDocumentKey] = useState('')
  const resolvedSupervisorName =
    supervisorName || profile?.full_name?.trim() || ''
  const isDocumentOpen = Boolean(
    item && item.type === 'accomplishments' && documentKey === item.key,
  )

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open) {
      if (dialog.hasAttribute('data-closing')) {
        dialog.removeAttribute('data-closing')
      }
      if (!dialog.open) {
        dialog.showModal()
      }
      return
    }

    if (dialog.open) {
      void closeModalDialogAnimated(dialog)
    }
  }, [open])

  const handleRequestClose = useCallback(() => {
    if (isSubmittingRef.current) return
    setDocumentKey('')
    onClose?.()
  }, [onClose])

  const handleSubmittingChange = useCallback((isSubmitting) => {
    isSubmittingRef.current = isSubmitting
  }, [])

  return (
    <>
      <dialog
        ref={dialogRef}
        aria-labelledby={headingId}
        aria-describedby={descId}
        closedby={supportsClosedBy ? 'any' : undefined}
        data-closedby={supportsClosedBy ? 'native' : 'fallback'}
        onCancel={(event) => {
          event.preventDefault()
          handleRequestClose()
        }}
        onPointerDown={(event) => {
          if (supportsClosedBy) return
          const dialog = dialogRef.current
          if (!dialog || event.target !== dialog) {
            pointerDownOutsideRef.current = false
            return
          }
          pointerDownOutsideRef.current = isPointerOutsideDialog(event, dialog)
        }}
        onClick={(event) => {
          if (supportsClosedBy) return
          const dialog = dialogRef.current
          const clickedOutside =
            pointerDownOutsideRef.current &&
            dialog &&
            event.target === dialog &&
            isPointerOutsideDialog(event, dialog)
          pointerDownOutsideRef.current = false
          if (clickedOutside) {
            handleRequestClose()
          }
        }}
        className="review-drawer-dialog shadow-2xl"
      >
        {item ? (
          <ReviewDialogBody
            key={item.key}
            item={item}
            intern={intern}
            supervisorId={supervisorId}
            todayIso={todayIso}
            headingId={headingId}
            descId={descId}
            onRequestClose={handleRequestClose}
            onReviewed={onReviewed}
            onAttachmentError={onAttachmentError}
            onSubmittingChange={handleSubmittingChange}
            onOpenDocument={() => setDocumentKey(item.key)}
          />
        ) : null}
      </dialog>

      <AccomplishmentDocumentDialog
        open={isDocumentOpen}
        onClose={() => setDocumentKey('')}
        rows={isDocumentOpen ? (item.weekRows ?? [item.row]) : null}
        row={isDocumentOpen ? item.row : null}
        weekOf={isDocumentOpen ? item.row?.week_of : ''}
        weeklyReflection={isDocumentOpen ? item.weeklyReflection : null}
        internName={intern?.full_name || item?.internName}
        studentIdNo={intern?.student_id_no ?? item?.studentIdNo}
        course={intern?.course ?? item?.course}
        yearLevel={intern?.year_level ?? item?.yearLevel}
        schoolName={intern?.school_name ?? item?.schoolName}
        internshipType={intern?.internship_type ?? item?.internshipType}
        hostOrganization={
          resolveHostOrganizationName(intern) || item?.hostOrganization
        }
        companyName={intern?.company_name ?? item?.companyName}
        departmentOffice={intern?.department_office ?? item?.departmentOffice}
        supervisorName={resolvedSupervisorName}
        reviewerName={resolvedSupervisorName}
        requiredHours={intern?.required_hours ?? item?.requiredHours}
        internshipStartDate={
          intern?.internship_start_date ?? item?.internshipStartDate
        }
        internshipEndDate={
          intern?.internship_end_date ?? item?.internshipEndDate
        }
      />
    </>
  )
}

function AssignTaskForm({
  interns,
  internById,
  supervisorId,
  onClose,
  onAssigned,
}) {
  const [assignInternId, setAssignInternId] = useState(
    () => interns[0]?.id ?? '',
  )
  const [assignTitle, setAssignTitle] = useState('')
  const [assignInstructions, setAssignInstructions] = useState('')
  const [assignDeadline, setAssignDeadline] = useState(() => getTodayIsoDate())
  const [assignPriority, setAssignPriority] = useState('medium')
  const [assignError, setAssignError] = useState('')
  const [assignSaving, setAssignSaving] = useState(false)

  const assignFormRef = useRef(null)
  const assignInternRef = useRef(null)
  const assignTitleRef = useRef(null)
  const assignDeadlineRef = useRef(null)

  useFormValidationSync(assignFormRef)

  const selectedInternId =
    assignInternId && internById.has(assignInternId)
      ? assignInternId
      : (interns[0]?.id ?? '')

  useEffect(() => {
    if (interns.length === 0) return undefined
    const frameId = window.requestAnimationFrame(() => {
      assignTitleRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [interns.length])

  async function handleAssignTask(event) {
    event.preventDefault()

    if (!supabase || !supervisorId) {
      setAssignError('Unable to verify your supervisor profile session.')
      return
    }

    if (interns.length === 0) {
      setAssignError('No interns are assigned to you yet.')
      return
    }

    if (!selectedInternId || !internById.has(selectedInternId)) {
      setAssignError('Please select an assigned intern.')
      setFieldInvalidFallback(assignInternRef.current, true)
      assignInternRef.current?.focus()
      return
    }

    const trimmedTitle = assignTitle.trim()
    const trimmedInstructions = assignInstructions.trim()
    if (!trimmedTitle) {
      setAssignError('Please enter a title for the task.')
      setFieldInvalidFallback(assignTitleRef.current, true)
      assignTitleRef.current?.focus()
      return
    }

    if (!assignDeadline) {
      setAssignError('Please choose a deadline for the task.')
      setFieldInvalidFallback(assignDeadlineRef.current, true)
      assignDeadlineRef.current?.focus()
      return
    }

    setAssignSaving(true)
    setAssignError('')

    const { error: insertError } = await supabase.from('tasks').insert({
      intern_id: selectedInternId,
      assigned_by: supervisorId,
      title: trimmedTitle,
      description: trimmedInstructions || null,
      deadline: assignDeadline,
      priority: assignPriority,
      task_date: getTodayIsoDate(),
      status: 'pending',
    })

    if (insertError) {
      setAssignError(`Could not assign task: ${insertError.message}`)
      setAssignSaving(false)
      return
    }

    const targetInternName =
      internById.get(selectedInternId)?.full_name || 'intern'
    setAssignSaving(false)
    onAssigned?.(`Task assigned to ${targetInternName}.`)
    onClose?.()
  }

  return (
    <>
      <div className={assignError ? 'mb-4' : ''}>
        <AlertMessage message={assignError} variant="error" />
      </div>

      <form
        ref={assignFormRef}
        aria-label="Assign a task"
        onSubmit={handleAssignTask}
        noValidate
        className="space-y-4"
      >
        <div className="field-group flex flex-col gap-1.5">
          <label
            htmlFor="assign-task-intern"
            className="text-sm font-medium leading-[1.4] text-ink"
          >
            Intern
          </label>
          {interns.length === 0 ? (
            <span
              id="assign-task-intern-hint"
              className="text-xs leading-[1.4] text-ink-muted"
            >
              No interns are assigned to you yet. Ask your SIP Coordinator to
              assign interns before creating tasks.
            </span>
          ) : null}
          <select
            ref={assignInternRef}
            id="assign-task-intern"
            name="intern_id"
            required
            disabled={interns.length === 0}
            aria-invalid="false"
            aria-describedby={
              interns.length === 0 ? 'assign-task-intern-hint' : undefined
            }
            value={selectedInternId}
            onChange={(event) => {
              setAssignInternId(event.target.value)
              setFieldInvalidFallback(assignInternRef.current, false)
              if (assignError) setAssignError('')
            }}
            className="form-control min-h-11 w-full rounded-[5px] border border-input-border bg-surface px-3.5 py-2.5 text-[max(1rem,1em)] text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:bg-canvas disabled:opacity-70 sm:text-sm"
          >
            {interns.length === 0 ? (
              <option value="">No assigned interns available</option>
            ) : (
              interns.map((intern) => (
                <option key={intern.id} value={intern.id}>
                  {intern.full_name}
                  {intern.student_id_no ? ` (${intern.student_id_no})` : ''}
                </option>
              ))
            )}
          </select>
        </div>

        <FormField
          inputRef={assignTitleRef}
          id="assign-task-title"
          name="title"
          label="Title"
          type="text"
          required
          maxLength={200}
          placeholder="e.g. Student Registration Form"
          validationMessage="Enter a title for this task."
          value={assignTitle}
          onChange={(event) => {
            setAssignTitle(event.target.value)
            setFieldInvalidFallback(assignTitleRef.current, false)
            if (assignError) setAssignError('')
          }}
        />

        <FormField
          id="assign-task-instructions"
          name="description"
          label="Instructions"
          multiline
          rows={3}
          placeholder="Describe the task requirements, deliverables, and guidelines."
          value={assignInstructions}
          onChange={(event) => {
            setAssignInstructions(event.target.value)
            if (assignError) setAssignError('')
          }}
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            inputRef={assignDeadlineRef}
            id="assign-task-deadline"
            name="deadline"
            label="Deadline"
            type="date"
            required
            validationMessage="Select a deadline date."
            value={assignDeadline}
            onChange={(event) => {
              setAssignDeadline(event.target.value)
              setFieldInvalidFallback(assignDeadlineRef.current, false)
              if (assignError) setAssignError('')
            }}
          />

          <div className="field-group flex flex-col gap-1.5">
            <label
              htmlFor="assign-task-priority"
              className="text-sm font-medium leading-[1.4] text-ink"
            >
              Priority
            </label>
            <select
              id="assign-task-priority"
              name="priority"
              value={assignPriority}
              onChange={(event) => setAssignPriority(event.target.value)}
              className="form-control min-h-11 w-full rounded-[5px] border border-input-border bg-surface px-3.5 py-2.5 text-[max(1rem,1em)] text-ink transition-colors hover:border-ink sm:text-sm"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-rule pt-4">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex min-h-10 items-center justify-center rounded-[5px] border border-rule bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-subtle"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={assignSaving || interns.length === 0}
            className="inline-flex min-h-10 items-center justify-center rounded-[5px] bg-accent-solid px-4 text-sm font-medium text-on-accent hover:bg-accent-solid-hover disabled:cursor-not-allowed disabled:opacity-65"
          >
            {assignSaving ? 'Assigning…' : 'Assign task'}
          </button>
        </div>
      </form>
    </>
  )
}

export function AssignTaskDialog({
  open,
  interns,
  internById,
  supervisorId,
  onClose,
  onAssigned,
}) {
  return (
    <SubmissionDialog
      open={open}
      title="Assign a Task"
      description="Assign a new task to one of your assigned interns."
      onClose={onClose}
    >
      {open ? (
        <AssignTaskForm
          interns={interns}
          internById={internById}
          supervisorId={supervisorId}
          onClose={onClose}
          onAssigned={onAssigned}
        />
      ) : null}
    </SubmissionDialog>
  )
}
