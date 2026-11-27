import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertMessage } from '../../components/AlertMessage'
import { FormField } from '../../components/FormField'
import { EditIcon, NavIcon, PaperclipIcon } from '../../components/Icons'
import { ReturnedRemarks } from '../../components/ReturnedRemarks'
import { StatusBadge } from '../../components/StatusBadge'
import { SubmissionDialog } from '../../components/SubmissionDialog'
import { useAuth } from '../../context/useAuth'
import { getDeadlineBadge } from '../../lib/internDashboardUtils'
import {
  buildAttachmentFileName,
  getAttachmentDisplayName,
  getReviewResetPayload,
  hasReviewerFeedbackStatus,
  isEditableSubmissionStatus,
  splitFilenameForDisplay,
} from '../../lib/submissionHelpers'
import { supabase } from '../../lib/supabaseClient'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useFormValidationSync } from '../../lib/useFormValidationSync'
import { formatCalendarDate, getTodayIsoDate } from '../../lib/weekUtils'

const EMPTY_LIST_STATE = {
  loadedKey: '',
  items: [],
  assignerNames: {},
  error: '',
}

const DEADLINE_TONE_CLASSES = {
  overdue: 'text-error font-medium',
  today: 'text-accent font-medium',
  upcoming: 'text-ink-muted',
}

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

function FileNameLabel({ objectPath }) {
  const displayName = getAttachmentDisplayName(objectPath)
  const { stem, extension } = splitFilenameForDisplay(displayName)
  return (
    <span className="filename-truncate text-xs text-ink-muted">
      <span>{stem}</span>
      {extension}
    </span>
  )
}

function clearFormValidationClasses(form) {
  if (!form) return
  for (const field of form.querySelectorAll('.form-control')) {
    field.classList.remove('user-invalid-fallback')
    field.setAttribute('aria-invalid', 'false')
    field.closest('.field-group')?.classList.remove('has-error-fallback')
  }
}

function getAssignerName(assignedBy, assignerNames) {
  if (assignedBy && assignerNames[assignedBy]) {
    return assignerNames[assignedBy]
  }
  return 'Your supervisor'
}

function extractIsoDatePart(timestamp) {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(timestamp ?? '').trim())
  return match ? match[1] : ''
}

export function TasksPage() {
  useDocumentTitle('Tasks')

  const { profile } = useAuth()
  const internId = profile?.id

  const [listState, setListState] = useState(EMPTY_LIST_STATE)
  const [reloadCounter, setReloadCounter] = useState(0)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [activeTask, setActiveTask] = useState(null)
  const [completionDescription, setCompletionDescription] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [removeExistingAttachment, setRemoveExistingAttachment] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [pageSuccess, setPageSuccess] = useState('')

  const [openingId, setOpeningId] = useState(null)
  const [attachmentError, setAttachmentError] = useState('')
  const [signedUrlsById, setSignedUrlsById] = useState({})

  const formRef = useRef(null)
  const completionInputRef = useRef(null)
  const fileInputRef = useRef(null)

  useFormValidationSync(formRef)

  const currentQueryKey = internId ? `${internId}:${reloadCounter}` : ''

  useEffect(() => {
    if (!supabase || !currentQueryKey) return undefined

    let active = true

    supabase
      .from('tasks')
      .select(
        'id, intern_id, assigned_by, title, description, task_date, deadline, priority, completion_description, submission_attachment_url, submitted_at, status, reviewed_by, reviewer_remarks, reviewed_at, created_at',
      )
      .eq('intern_id', internId)
      .order('deadline', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .then(async ({ data, error }) => {
        if (!active) return
        const rows = error ? [] : (data ?? [])
        const assignerIds = [
          ...new Set(rows.map((row) => row.assigned_by).filter(Boolean)),
        ]
        let assignerNames = {}

        if (!error && assignerIds.length > 0) {
          const { data: profilesData } = await supabase
            .from('profiles')
            .select('id, full_name')
            .in('id', assignerIds)

          if (!active) return
          if (Array.isArray(profilesData)) {
            assignerNames = Object.fromEntries(
              profilesData
                .filter((p) => p?.id && p?.full_name?.trim())
                .map((p) => [p.id, p.full_name.trim()]),
            )
          }
        }

        if (!active) return
        setListState({
          loadedKey: currentQueryKey,
          items: rows,
          assignerNames,
          error: error ? error.message : '',
        })
      })

    return () => {
      active = false
    }
  }, [currentQueryKey, internId])

  const loadingList = Boolean(
    supabase && currentQueryKey && listState.loadedKey !== currentQueryKey,
  )
  const items = listState.loadedKey === currentQueryKey ? listState.items : []
  const assignerNames =
    listState.loadedKey === currentQueryKey ? listState.assignerNames : {}
  const listError =
    attachmentError ||
    (listState.loadedKey === currentQueryKey ? listState.error : '')
  const todayIso = getTodayIsoDate()

  const statusCounts = items.reduce(
    (counts, row) => {
      if (row.status === 'approved') counts.approved += 1
      else if (row.status === 'rejected') counts.rejected += 1
      else if (row.status === 'returned') counts.returned += 1
      else counts.pending += 1
      return counts
    },
    { pending: 0, returned: 0, rejected: 0, approved: 0 },
  )

  function openSubmissionDialog(row) {
    if (!isEditableSubmissionStatus(row.status)) return
    setActiveTask(row)
    setCompletionDescription(row.completion_description ?? '')
    setSelectedFile(null)
    setRemoveExistingAttachment(false)
    setFormError('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    clearFormValidationClasses(formRef.current)
    setDialogOpen(true)
    window.requestAnimationFrame(() => completionInputRef.current?.focus())
  }

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false)
    setFormError('')
  }, [])

  async function handleSubmitCompletion(event) {
    event.preventDefault()

    if (!supabase || !internId || !activeTask) {
      setFormError('Unable to verify your intern profile session.')
      return
    }

    if (!isEditableSubmissionStatus(activeTask.status)) {
      setFormError('Approved tasks cannot be modified.')
      return
    }

    const trimmedCompletion = completionDescription.trim()
    if (!trimmedCompletion) {
      setFormError('Please describe your completed work before submitting.')
      completionInputRef.current?.focus()
      return
    }

    setSaving(true)
    setFormError('')
    setPageSuccess('')

    let nextAttachmentPath = removeExistingAttachment
      ? null
      : (activeTask.submission_attachment_url ?? null)

    if (selectedFile) {
      const filePath = `${internId}/${buildAttachmentFileName(selectedFile.name)}`
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('attachments')
        .upload(filePath, selectedFile)

      if (uploadError) {
        setFormError(`Attachment upload failed: ${uploadError.message}`)
        setSaving(false)
        return
      }

      nextAttachmentPath = uploadData?.path ?? filePath
    }

    const wasReviewedBack = hasReviewerFeedbackStatus(activeTask.status)
    const { error: updateError } = await supabase
      .from('tasks')
      .update({
        completion_description: trimmedCompletion,
        submission_attachment_url: nextAttachmentPath,
        submitted_at: new Date().toISOString(),
        ...getReviewResetPayload(activeTask.status),
      })
      .eq('id', activeTask.id)
      .eq('intern_id', internId)
      .in('status', ['pending', 'returned', 'rejected'])

    if (updateError) {
      setFormError(`Could not submit task completion: ${updateError.message}`)
      setSaving(false)
      return
    }

    setPageSuccess(
      wasReviewedBack
        ? 'Task completion resubmitted as pending for supervisor review.'
        : 'Task completion submitted.',
    )
    setSaving(false)
    setDialogOpen(false)
    setAttachmentError('')
    setReloadCounter((count) => count + 1)
  }

  async function handleOpenAttachment(row) {
    if (!supabase || !row.submission_attachment_url) return

    setOpeningId(row.id)
    setAttachmentError('')

    const { data, error } = await supabase.storage
      .from('attachments')
      .createSignedUrl(row.submission_attachment_url, 300)

    setOpeningId(null)

    if (error || !data?.signedUrl) {
      setAttachmentError(
        error?.message || 'Could not generate a signed download link.',
      )
      return
    }

    setSignedUrlsById((prev) => ({ ...prev, [row.id]: data.signedUrl }))

    const openedWindow = window.open(
      data.signedUrl,
      '_blank',
      'noopener,noreferrer',
    )
    if (!openedWindow) {
      setAttachmentError(
        'Pop-up blocked by your browser. Use the direct signed link shown next to the attachment.',
      )
    }
  }

  return (
    <div className="max-w-6xl space-y-6">
      <header>
        <h1
          id="main-content"
          tabIndex={-1}
          className="ledger-title text-[clamp(1.5rem,1.25rem+0.75vw,1.875rem)] font-semibold leading-[1.2] tracking-[-0.02em] text-ink outline-none"
        >
          Assigned Tasks
        </h1>
        <p className="mt-1.5 max-w-[64ch] text-sm leading-[1.55] text-ink-muted">
          Review tasks assigned by your supervisor and submit your completion
          notes and supporting files.
        </p>
      </header>

      <div className={pageSuccess || listError ? 'space-y-3' : ''}>
        <AlertMessage message={pageSuccess} variant="success" />
        <AlertMessage message={listError} variant="error" />
      </div>

      <section
        aria-labelledby="tasks-list-heading"
        className="overflow-hidden rounded-[6px] border border-rule bg-surface"
      >
        <div className="flex flex-col gap-2 border-b border-rule bg-surface-subtle px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2
              id="tasks-list-heading"
              className="text-base font-semibold text-ink"
            >
              Tasks assigned to you
            </h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              Ordered by nearest deadline first.
            </p>
          </div>

          {!loadingList && items.length > 0 ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-ink-muted">
              <span className="font-medium text-ink">
                {items.length} {items.length === 1 ? 'task' : 'tasks'}
              </span>
              <span aria-hidden="true" className="h-3 w-px bg-rule" />
              <span>{statusCounts.pending} pending</span>
              <span aria-hidden="true" className="h-3 w-px bg-rule" />
              <span>{statusCounts.returned} returned</span>
              {statusCounts.rejected > 0 ? (
                <>
                  <span aria-hidden="true" className="h-3 w-px bg-rule" />
                  <span>{statusCounts.rejected} rejected</span>
                </>
              ) : null}
              <span aria-hidden="true" className="h-3 w-px bg-rule" />
              <span>{statusCounts.approved} approved</span>
            </div>
          ) : null}
        </div>

        {loadingList ? (
          <div className="flex items-center gap-3 px-5 py-12 text-sm text-ink-muted">
            <progress aria-label="Loading tasks" className="loading-spinner" />
            <span>Loading assigned tasks…</span>
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-start gap-3.5 px-5 py-12">
            <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-[5px] border border-rule bg-surface-subtle text-ink-muted">
              <NavIcon name="tasks" className="size-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">
                No tasks assigned yet
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                Tasks assigned by your supervisor will appear here once posted.
              </p>
            </div>
          </div>
        ) : (
          <div
            tabIndex={0}
            role="region"
            aria-labelledby="tasks-list-heading"
            className="table-wrapper"
          >
            <table className="submission-table">
              <caption className="visually-hidden">
                Supervisor-assigned tasks and completion submission status
              </caption>
              <thead>
                <tr>
                  <th scope="col">Task & instructions</th>
                  <th scope="col" className="w-36">
                    Deadline
                  </th>
                  <th scope="col" className="w-28">
                    Priority
                  </th>
                  <th scope="col" className="w-36">
                    Status
                  </th>
                  <th scope="col" className="col-action w-36">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const editable = isEditableSubmissionStatus(row.status)
                  const effectiveDeadline = row.deadline || row.task_date
                  const assignerName = getAssignerName(
                    row.assigned_by,
                    assignerNames,
                  )
                  const showDeadlineUrgency =
                    !row.submitted_at &&
                    row.status !== 'approved' &&
                    Boolean(effectiveDeadline)
                  const deadlineBadge = showDeadlineUrgency
                    ? getDeadlineBadge(effectiveDeadline, todayIso)
                    : null
                  const submittedDateIso = extractIsoDatePart(row.submitted_at)
                  const signedUrl = signedUrlsById[row.id]
                  const actionLabel = hasReviewerFeedbackStatus(row.status)
                    ? 'Resubmit'
                    : row.submitted_at
                      ? 'Edit submission'
                      : 'Submit work'

                  return (
                    <tr key={row.id}>
                      <td data-label="Task & instructions">
                        <div className="min-w-0">
                          <p className="font-medium text-ink">{row.title}</p>
                          {row.description ? (
                            <p className="mt-1 max-w-[60ch] whitespace-pre-line text-sm text-ink-muted break-words">
                              {row.description}
                            </p>
                          ) : null}
                          <p className="mt-1 text-xs text-ink-muted">
                            Assigned by {assignerName}
                          </p>

                          {row.completion_description ||
                          row.submission_attachment_url ||
                          row.submitted_at ? (
                            <div className="mt-2.5 rounded-[5px] border border-rule bg-surface-subtle px-3 py-2 text-xs">
                              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                                <p className="font-semibold text-ink">
                                  Your submission
                                </p>
                                {submittedDateIso ? (
                                  <p className="tabular-nums text-ink-muted">
                                    Submitted on{' '}
                                    <time dateTime={submittedDateIso}>
                                      {formatCalendarDate(submittedDateIso)}
                                    </time>
                                  </p>
                                ) : null}
                              </div>
                              {row.completion_description ? (
                                <p className="mt-1 whitespace-pre-line text-ink-muted break-words">
                                  {row.completion_description}
                                </p>
                              ) : null}
                              {row.submission_attachment_url ? (
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={openingId === row.id}
                                    onClick={() => handleOpenAttachment(row)}
                                    className="inline-flex min-h-7 items-center gap-1 font-medium text-accent underline underline-offset-4 hover:text-accent-hover disabled:opacity-60"
                                  >
                                    <PaperclipIcon className="size-3.5" />
                                    <span>
                                      {openingId === row.id
                                        ? 'Generating link…'
                                        : 'View attachment'}
                                    </span>
                                  </button>
                                  <FileNameLabel
                                    objectPath={row.submission_attachment_url}
                                  />
                                  {signedUrl ? (
                                    <a
                                      href={signedUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="font-medium text-ink underline underline-offset-2 hover:text-accent"
                                    >
                                      Open signed link
                                    </a>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          {hasReviewerFeedbackStatus(row.status) ? (
                            <ReturnedRemarks
                              remarks={row.reviewer_remarks}
                              status={row.status}
                            />
                          ) : null}
                        </div>
                      </td>

                      <td data-label="Deadline" className="whitespace-nowrap">
                        <div className="flex flex-col">
                          <time
                            dateTime={effectiveDeadline}
                            className="text-sm font-medium tabular-nums text-ink"
                          >
                            {formatCalendarDate(effectiveDeadline)}
                          </time>
                          {deadlineBadge ? (
                            <span
                              className={`mt-0.5 text-xs tabular-nums ${DEADLINE_TONE_CLASSES[deadlineBadge.tone]}`}
                            >
                              {deadlineBadge.label}
                            </span>
                          ) : null}
                        </div>
                      </td>

                      <td data-label="Priority" className="whitespace-nowrap">
                        <PriorityBadge priority={row.priority} />
                      </td>

                      <td data-label="Status">
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge status={row.status} />
                          <span className="text-[0.6875rem] text-ink-muted">
                            {row.submitted_at ? 'Submitted' : 'Not submitted'}
                          </span>
                        </div>
                      </td>

                      <td data-label="Action" className="col-action">
                        {editable ? (
                          <button
                            type="button"
                            onClick={() => openSubmissionDialog(row)}
                            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[5px] border border-rule bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-subtle"
                          >
                            <EditIcon className="size-3.5" />
                            <span>{actionLabel}</span>
                            <span className="visually-hidden">
                              {' '}
                              for {row.title}
                            </span>
                          </button>
                        ) : (
                          <span className="text-xs text-ink-muted">Locked</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <SubmissionDialog
        open={dialogOpen}
        title={
          hasReviewerFeedbackStatus(activeTask?.status)
            ? 'Resubmit task completion'
            : activeTask?.submitted_at
              ? 'Edit task submission'
              : 'Submit task completion'
        }
        description={
          hasReviewerFeedbackStatus(activeTask?.status)
            ? 'Submitting updates resets this task to Pending for supervisor re-review.'
            : 'Describe your completed work and attach an optional file for your supervisor.'
        }
        onClose={handleCloseDialog}
      >
        {activeTask ? (
          <div className="mb-4 rounded-[5px] border border-rule bg-surface-subtle px-3.5 py-3 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">
                {activeTask.title}
              </p>
              <PriorityBadge priority={activeTask.priority} />
            </div>
            {activeTask.description ? (
              <p className="mt-1.5 whitespace-pre-line text-ink-muted">
                {activeTask.description}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-muted">
              <p className="tabular-nums">
                Deadline:{' '}
                <span className="font-medium text-ink">
                  {formatCalendarDate(
                    activeTask.deadline || activeTask.task_date,
                  )}
                </span>
              </p>
              <span aria-hidden="true" className="h-3 w-px bg-rule" />
              <p>
                Assigned by{' '}
                <span className="font-medium text-ink">
                  {getAssignerName(activeTask.assigned_by, assignerNames)}
                </span>
              </p>
            </div>
          </div>
        ) : null}

        <div className={formError ? 'mb-4' : ''}>
          <AlertMessage message={formError} variant="error" />
        </div>

        <form
          ref={formRef}
          onSubmit={handleSubmitCompletion}
          className="space-y-4"
        >
          <FormField
            inputRef={completionInputRef}
            id="task-completion-description"
            name="completion_description"
            label="Completion description"
            multiline
            rows={4}
            autoFocus
            required
            placeholder="Summarize what you completed and any notes for your supervisor."
            validationMessage="Enter a completion description before submitting."
            value={completionDescription}
            onChange={(event) => {
              setCompletionDescription(event.target.value)
              if (formError) setFormError('')
            }}
          />

          <div className="field-group flex flex-col gap-1.5">
            <label
              htmlFor="task-submission-attachment"
              className="text-sm font-medium leading-[1.4] text-ink"
            >
              Submission attachment (optional)
            </label>
            <span
              id="task-submission-attachment-hint"
              className="text-xs leading-[1.4] text-ink-muted"
            >
              Uploaded privately to your intern folder and opened via signed
              URLs.
            </span>

            {activeTask?.submission_attachment_url ? (
              <div className="my-1 flex flex-wrap items-center justify-between gap-2 rounded-[5px] border border-rule bg-surface-subtle px-3 py-2 text-xs text-ink">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="shrink-0">Current file:</span>
                  <FileNameLabel
                    objectPath={activeTask.submission_attachment_url}
                  />
                </div>
                <label className="branded-checkbox-label inline-flex items-center gap-2 font-medium text-ink-muted">
                  <input
                    type="checkbox"
                    checked={removeExistingAttachment}
                    disabled={Boolean(selectedFile)}
                    onChange={(event) =>
                      setRemoveExistingAttachment(event.target.checked)
                    }
                    className="branded-checkbox size-4"
                  />
                  <span>Remove current file</span>
                </label>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2.5">
              <input
                ref={fileInputRef}
                id="task-submission-attachment"
                name="submission_attachment"
                type="file"
                aria-invalid="false"
                aria-describedby="task-submission-attachment-hint"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null
                  setSelectedFile(file)
                  if (file) setRemoveExistingAttachment(false)
                  if (formError) setFormError('')
                }}
                className="form-control min-h-11 flex-1 rounded-[5px] border border-input-border bg-surface px-2.5 py-2 text-xs text-ink file:me-3 file:min-h-8 file:cursor-pointer file:rounded-[4px] file:border file:border-rule file:bg-surface-subtle file:px-3 file:py-1 file:text-xs file:font-medium file:text-ink hover:file:bg-canvas"
              />
              {selectedFile ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  className="inline-flex min-h-10 items-center justify-center rounded-[5px] border border-rule bg-surface px-3 text-xs font-medium text-ink-muted hover:bg-surface-subtle hover:text-ink"
                >
                  Clear file
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-rule pt-4">
            <button
              type="button"
              onClick={handleCloseDialog}
              className="inline-flex min-h-10 items-center justify-center rounded-[5px] border border-rule bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-subtle"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-10 items-center justify-center rounded-[5px] bg-accent-solid px-4 text-sm font-medium text-on-accent hover:bg-accent-solid-hover disabled:cursor-not-allowed disabled:opacity-65"
            >
              {saving
                ? 'Submitting…'
                : hasReviewerFeedbackStatus(activeTask?.status)
                  ? 'Resubmit completion'
                  : 'Submit completion'}
            </button>
          </div>
        </form>
      </SubmissionDialog>
    </div>
  )
}
