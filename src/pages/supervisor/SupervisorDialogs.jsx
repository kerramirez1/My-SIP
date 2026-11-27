import { useEffect, useRef, useState } from 'react'
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
import { useFormValidationSync } from '../../lib/useFormValidationSync'
import { extractIsoDatePart, formatBreakText } from '../../lib/useSupervisorData'
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

function ReviewDialogBody({
  item,
  supervisorId,
  todayIso,
  onClose,
  onReviewed,
  onAttachmentError,
}) {
  const [reviewRemarks, setReviewRemarks] = useState('')
  const [reviewError, setReviewError] = useState('')
  const [submittingDecision, setSubmittingDecision] = useState(null)
  const reviewFormRef = useRef(null)
  const remarksInputRef = useRef(null)

  useFormValidationSync(reviewFormRef)

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      remarksInputRef.current?.focus()
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
    onReviewed?.(successMessage)
    onClose?.()
  }

  return (
    <div>
      <div className="rounded-[5px] border border-rule bg-surface-subtle px-4 py-3 text-xs">
        {item.type === 'attendance' ? (
          <dl className="space-y-2">
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-ink-muted">Date</dt>
              <dd className="font-medium tabular-nums text-ink">
                {formatCalendarDate(item.row.attendance_date)}
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-ink-muted">Week</dt>
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
                  : '—'}
              </dd>
            </div>
          </dl>
        ) : item.type === 'accomplishments' ? (
          <div className="space-y-2.5">
            <div>
              <p className="text-sm font-semibold text-ink">{item.row.title}</p>
              <p className="mt-0.5 tabular-nums text-ink-muted">
                Week of {formatWeekRange(item.row.week_of)}
              </p>
            </div>
            {item.row.description ? (
              <div>
                <p className="font-medium text-ink-muted">
                  Activities performed
                </p>
                <p className="mt-0.5 whitespace-pre-line text-ink break-words">
                  {item.row.description}
                </p>
              </div>
            ) : null}
            {item.row.skills_acquired ? (
              <div>
                <p className="font-medium text-ink-muted">Skills acquired</p>
                <p className="mt-0.5 whitespace-pre-line text-ink break-words">
                  {item.row.skills_acquired}
                </p>
              </div>
            ) : null}
            {item.row.challenges_encountered ? (
              <div>
                <p className="font-medium text-ink-muted">
                  Challenges encountered
                </p>
                <p className="mt-0.5 whitespace-pre-line text-ink break-words">
                  {item.row.challenges_encountered}
                </p>
              </div>
            ) : null}
            {item.row.lessons_learned ? (
              <div>
                <p className="font-medium text-ink-muted">Lessons learned</p>
                <p className="mt-0.5 whitespace-pre-line text-ink break-words">
                  {item.row.lessons_learned}
                </p>
              </div>
            ) : null}
            <AttachmentControl
              objectPath={item.row.attachment_url}
              onError={onAttachmentError}
            />
          </div>
        ) : (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">{item.row.title}</p>
              <PriorityBadge priority={item.row.priority} />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums text-ink-muted">
              <span>
                Deadline:{' '}
                <span className="font-medium text-ink">
                  {formatCalendarDate(item.row.deadline || item.row.task_date)}
                </span>
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
              {item.row.submitted_at ? (
                <span>
                  Submitted on{' '}
                  {formatCalendarDate(extractIsoDatePart(item.row.submitted_at))}
                </span>
              ) : null}
            </div>
            {item.row.description ? (
              <div>
                <p className="font-medium text-ink-muted">Instructions</p>
                <p className="mt-0.5 whitespace-pre-line text-ink break-words">
                  {item.row.description}
                </p>
              </div>
            ) : null}
            {item.row.completion_description ? (
              <div className="border-t border-rule pt-2">
                <p className="font-medium text-ink-muted">
                  Intern completion notes
                </p>
                <p className="mt-0.5 whitespace-pre-line text-ink break-words">
                  {item.row.completion_description}
                </p>
              </div>
            ) : null}
            <AttachmentControl
              objectPath={item.row.submission_attachment_url}
              onError={onAttachmentError}
            />
          </div>
        )}
      </div>

      <div className={reviewError ? 'mt-4' : ''}>
        <AlertMessage message={reviewError} variant="error" />
      </div>

      <form
        ref={reviewFormRef}
        aria-label="Review decision"
        onSubmit={(event) => {
          event.preventDefault()
          void handleReviewDecision('approved')
        }}
        noValidate
        className="mt-4 space-y-4"
      >
        <FormField
          inputRef={remarksInputRef}
          id="supervisor-review-remarks"
          name="reviewer_remarks"
          label="Remarks"
          multiline
          rows={3}
          hint="Optional for Approve. Required for Return for Revision or Reject."
          placeholder="Add feedback or instructions for the intern."
          validationMessage="Remarks are required when returning or rejecting a submission."
          value={reviewRemarks}
          onChange={(event) => {
            setReviewRemarks(event.target.value)
            setFieldInvalidFallback(remarksInputRef.current, false)
            if (reviewError) setReviewError('')
          }}
        />

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-rule pt-4">
          <button
            type="button"
            disabled={Boolean(submittingDecision)}
            onClick={onClose}
            className="inline-flex min-h-10 items-center justify-center rounded-[5px] border border-rule bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-subtle disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={Boolean(submittingDecision)}
            onClick={() => void handleReviewDecision('rejected')}
            className="inline-flex min-h-10 items-center justify-center rounded-[5px] border border-rejected-border bg-rejected-bg px-3.5 text-sm font-medium text-on-accent hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submittingDecision === 'rejected' ? 'Rejecting…' : 'Reject'}
          </button>
          <button
            type="button"
            disabled={Boolean(submittingDecision)}
            onClick={() => void handleReviewDecision('returned')}
            className="inline-flex min-h-10 items-center justify-center rounded-[5px] border border-error-border/60 bg-error-tint px-3.5 text-sm font-medium text-error hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submittingDecision === 'returned'
              ? 'Returning…'
              : 'Return for Revision'}
          </button>
          <button
            type="submit"
            disabled={Boolean(submittingDecision)}
            className="inline-flex min-h-10 items-center justify-center rounded-[5px] bg-accent-solid px-4 text-sm font-medium text-on-accent hover:bg-accent-solid-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submittingDecision === 'approved' ? 'Approving…' : 'Approve'}
          </button>
        </div>
      </form>
    </div>
  )
}

export function ReviewDialog({
  item,
  supervisorId,
  onClose,
  onReviewed,
  onAttachmentError,
}) {
  const todayIso = getTodayIsoDate()

  return (
    <SubmissionDialog
      open={Boolean(item)}
      title={
        item
          ? `Review ${item.typeLabel} — ${item.internName}`
          : 'Review submission'
      }
      description="Approve this submission, or return or reject it with remarks for the intern."
      onClose={onClose}
    >
      {item ? (
        <ReviewDialogBody
          key={item.key}
          item={item}
          supervisorId={supervisorId}
          todayIso={todayIso}
          onClose={onClose}
          onReviewed={onReviewed}
          onAttachmentError={onAttachmentError}
        />
      ) : null}
    </SubmissionDialog>
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
