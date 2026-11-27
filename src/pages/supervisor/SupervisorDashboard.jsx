import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertMessage } from '../../components/AlertMessage'
import { FormField } from '../../components/FormField'
import { NavIcon, PaperclipIcon, PlusIcon } from '../../components/Icons'
import { StatusBadge } from '../../components/StatusBadge'
import { SubmissionDialog } from '../../components/SubmissionDialog'
import { useAuth } from '../../context/useAuth'
import {
  DEFAULT_BREAK_MINUTES,
  computeElapsedMinutes,
  formatDecimalHours,
  formatDurationMinutes,
  formatWallClockTime,
} from '../../lib/attendanceUtils'
import {
  DEFAULT_REQUIRED_INTERNSHIP_HOURS,
  getDeadlineBadge,
} from '../../lib/internDashboardUtils'
import {
  getAttachmentDisplayName,
  splitFilenameForDisplay,
} from '../../lib/submissionHelpers'
import { supabase } from '../../lib/supabaseClient'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useFormValidationSync } from '../../lib/useFormValidationSync'
import {
  formatCalendarDate,
  formatWeekRange,
  getTodayIsoDate,
} from '../../lib/weekUtils'

const EMPTY_DATA_STATE = {
  loadedKey: '',
  interns: [],
  attendance: [],
  accomplishments: [],
  tasks: [],
  error: '',
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

const TYPE_LABEL_SINGULAR = {
  attendance: 'Attendance',
  accomplishments: 'Accomplishment',
  tasks: 'Task',
}

const DECISION_SUCCESS_WORD = {
  approved: 'approved',
  returned: 'returned for revision',
  rejected: 'rejected',
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

function extractIsoDatePart(timestamp) {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(timestamp ?? '').trim())
  return match ? match[1] : ''
}

function formatBreakText(breakMinutes) {
  const safeBreak = breakMinutes ?? DEFAULT_BREAK_MINUTES
  return safeBreak === 0 ? 'No break' : `Break: ${safeBreak} min`
}

function clearFormValidationClasses(form) {
  if (!form) return
  for (const field of form.querySelectorAll('.form-control')) {
    field.classList.remove('user-invalid-fallback')
    field.setAttribute('aria-invalid', 'false')
    field.closest('.field-group')?.classList.remove('has-error-fallback')
  }
}

function setFieldInvalidFallback(input, invalid) {
  if (!input) return
  input.classList.toggle('user-invalid-fallback', invalid)
  input.setAttribute('aria-invalid', invalid ? 'true' : 'false')
  input.closest('.field-group')?.classList.toggle('has-error-fallback', invalid)
}

function AttachmentControl({
  itemKey,
  objectPath,
  openingKey,
  signedUrl,
  onOpen,
}) {
  if (!objectPath) return null
  const displayName = getAttachmentDisplayName(objectPath)
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      <button
        type="button"
        disabled={openingKey === itemKey}
        onClick={() => onOpen(itemKey, objectPath)}
        className="inline-flex min-h-7 items-center gap-1 font-medium text-accent underline underline-offset-4 hover:text-accent-hover disabled:opacity-60"
      >
        <PaperclipIcon className="size-3.5" />
        <span>
          {openingKey === itemKey ? 'Generating link…' : 'View file'}
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
  )
}

export function SupervisorDashboard() {
  useDocumentTitle('Supervisor Dashboard')

  const { profile } = useAuth()
  const supervisorId = profile?.id
  const todayIso = getTodayIsoDate()

  const [reloadCounter, setReloadCounter] = useState(0)
  const [dataState, setDataState] = useState(EMPTY_DATA_STATE)
  const [queueFilter, setQueueFilter] = useState('all')
  const [pageSuccess, setPageSuccess] = useState('')
  const [attachmentError, setAttachmentError] = useState('')
  const [openingAttachmentKey, setOpeningAttachmentKey] = useState(null)
  const [signedUrlsByKey, setSignedUrlsByKey] = useState({})

  // Review dialog state
  const [reviewItem, setReviewItem] = useState(null)
  const [reviewRemarks, setReviewRemarks] = useState('')
  const [reviewError, setReviewError] = useState('')
  const [submittingDecision, setSubmittingDecision] = useState(null)
  const reviewFormRef = useRef(null)
  const remarksInputRef = useRef(null)

  // Assign a Task dialog state
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [assignInternId, setAssignInternId] = useState('')
  const [assignTitle, setAssignTitle] = useState('')
  const [assignInstructions, setAssignInstructions] = useState('')
  const [assignDeadline, setAssignDeadline] = useState(todayIso)
  const [assignPriority, setAssignPriority] = useState('medium')
  const [assignError, setAssignError] = useState('')
  const [assignSaving, setAssignSaving] = useState(false)
  const assignFormRef = useRef(null)
  const assignInternRef = useRef(null)
  const assignTitleRef = useRef(null)
  const assignDeadlineRef = useRef(null)

  useFormValidationSync(reviewFormRef)
  useFormValidationSync(assignFormRef)

  const currentQueryKey = supervisorId ? `${supervisorId}:${reloadCounter}` : ''

  useEffect(() => {
    if (!supabase || !currentQueryKey) return undefined

    let active = true

    Promise.all([
      supabase
        .from('profiles')
        .select(
          'id, full_name, student_id_no, company_name, school_name, course, required_hours, internship_start_date',
        )
        .eq('role', 'intern')
        .eq('supervisor_id', supervisorId)
        .order('full_name', { ascending: true }),
      supabase
        .from('weekly_attendance')
        .select(
          'id, intern_id, attendance_date, time_in, time_out, break_minutes, week_of, status, reviewed_by, reviewer_remarks, reviewed_at, created_at, updated_at',
        )
        .order('attendance_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase
        .from('accomplishments')
        .select(
          'id, intern_id, week_of, title, description, skills_acquired, challenges_encountered, lessons_learned, attachment_url, status, reviewed_by, reviewer_remarks, reviewed_at, created_at, updated_at',
        )
        .order('created_at', { ascending: false }),
      supabase
        .from('tasks')
        .select(
          'id, intern_id, assigned_by, title, description, task_date, deadline, priority, completion_description, submission_attachment_url, submitted_at, status, reviewed_by, reviewer_remarks, reviewed_at, created_at, updated_at',
        )
        .order('created_at', { ascending: false }),
    ]).then(([internsRes, attendanceRes, accomplishmentsRes, tasksRes]) => {
      if (!active) return

      const errors = [
        internsRes.error?.message,
        attendanceRes.error?.message,
        accomplishmentsRes.error?.message,
        tasksRes.error?.message,
      ].filter(Boolean)

      setDataState({
        loadedKey: currentQueryKey,
        interns: internsRes.error ? [] : (internsRes.data ?? []),
        attendance: attendanceRes.error ? [] : (attendanceRes.data ?? []),
        accomplishments: accomplishmentsRes.error
          ? []
          : (accomplishmentsRes.data ?? []),
        tasks: tasksRes.error ? [] : (tasksRes.data ?? []),
        error: errors.length > 0 ? errors[0] : '',
      })
    })

    return () => {
      active = false
    }
  }, [currentQueryKey, supervisorId])

  const loading = Boolean(
    supabase && currentQueryKey && dataState.loadedKey !== currentQueryKey,
  )
  const hasLoaded = dataState.loadedKey === currentQueryKey
  const loadError = attachmentError || (hasLoaded ? dataState.error : '')

  const derived = useMemo(() => {
    const interns = hasLoaded ? dataState.interns : []
    const internById = new Map(interns.map((intern) => [intern.id, intern]))

    const attendance = (hasLoaded ? dataState.attendance : []).filter((row) =>
      internById.has(row.intern_id),
    )
    const accomplishments = (hasLoaded ? dataState.accomplishments : []).filter(
      (row) => internById.has(row.intern_id),
    )
    const tasks = (hasLoaded ? dataState.tasks : []).filter((row) =>
      internById.has(row.intern_id),
    )

    // Approved break-adjusted attendance minutes per intern
    const approvedMinutesByIntern = new Map()
    for (const row of attendance) {
      if (row.status !== 'approved') continue
      const minutes = computeElapsedMinutes(
        row.time_in,
        row.time_out,
        row.break_minutes ?? DEFAULT_BREAK_MINUTES,
      )
      if (minutes !== null && minutes > 0) {
        approvedMinutesByIntern.set(
          row.intern_id,
          (approvedMinutesByIntern.get(row.intern_id) ?? 0) + minutes,
        )
      }
    }

    const internProgressRows = interns.map((intern) => {
      const requiredHours =
        Number.isFinite(Number(intern.required_hours)) &&
        Number(intern.required_hours) > 0
          ? Number(intern.required_hours)
          : DEFAULT_REQUIRED_INTERNSHIP_HOURS
      const approvedMinutes = approvedMinutesByIntern.get(intern.id) ?? 0
      const approvedHours = approvedMinutes / 60
      const progressPercent = Math.min(
        100,
        Number(((approvedHours / requiredHours) * 100).toFixed(1)),
      )
      return {
        ...intern,
        requiredHours,
        approvedMinutes,
        approvedHours,
        progressPercent,
        isComplete: approvedHours >= requiredHours,
      }
    })

    // Pending reviews queue (newest first)
    const pendingAttendance = attendance
      .filter((row) => row.status === 'pending')
      .map((row) => {
        const minutes = computeElapsedMinutes(
          row.time_in,
          row.time_out,
          row.break_minutes ?? DEFAULT_BREAK_MINUTES,
        )
        return {
          key: `attendance-${row.id}`,
          type: 'attendance',
          typeLabel: TYPE_LABEL_SINGULAR.attendance,
          internName: internById.get(row.intern_id)?.full_name || 'Intern',
          sortAt: row.updated_at || row.created_at || row.attendance_date || '',
          renderedMinutes: minutes !== null && minutes >= 0 ? minutes : null,
          row,
        }
      })

    const pendingAccomplishments = accomplishments
      .filter((row) => row.status === 'pending')
      .map((row) => ({
        key: `accomplishments-${row.id}`,
        type: 'accomplishments',
        typeLabel: TYPE_LABEL_SINGULAR.accomplishments,
        internName: internById.get(row.intern_id)?.full_name || 'Intern',
        sortAt: row.updated_at || row.created_at || row.week_of || '',
        row,
      }))

    // Tasks MUST have status === 'pending' AND submitted_at IS NOT NULL
    const pendingTasks = tasks
      .filter((row) => row.status === 'pending' && Boolean(row.submitted_at))
      .map((row) => ({
        key: `tasks-${row.id}`,
        type: 'tasks',
        typeLabel: TYPE_LABEL_SINGULAR.tasks,
        internName: internById.get(row.intern_id)?.full_name || 'Intern',
        sortAt: row.submitted_at || row.updated_at || row.created_at || '',
        row,
      }))

    const pendingItems = [
      ...pendingAttendance,
      ...pendingAccomplishments,
      ...pendingTasks,
    ].sort((a, b) => String(b.sortAt).localeCompare(String(a.sortAt)))

    // Recent reviews history: latest 10 rows reviewed by this supervisor
    const recentReviews = [
      ...attendance
        .filter((row) => row.reviewed_by === supervisorId && row.reviewed_at)
        .map((row) => {
          const minutes = computeElapsedMinutes(
            row.time_in,
            row.time_out,
            row.break_minutes ?? DEFAULT_BREAK_MINUTES,
          )
          const durationSuffix =
            minutes !== null && minutes >= 0
              ? ` (${formatDurationMinutes(minutes)})`
              : ''
          return {
            key: `rev-attendance-${row.id}`,
            internName: internById.get(row.intern_id)?.full_name || 'Intern',
            typeLabel: TYPE_LABEL_SINGULAR.attendance,
            summaryLabel: `${formatCalendarDate(row.attendance_date)}${durationSuffix}`,
            status: row.status,
            remarks: row.reviewer_remarks,
            reviewedAt: row.reviewed_at,
          }
        }),
      ...accomplishments
        .filter((row) => row.reviewed_by === supervisorId && row.reviewed_at)
        .map((row) => ({
          key: `rev-accomplishments-${row.id}`,
          internName: internById.get(row.intern_id)?.full_name || 'Intern',
          typeLabel: TYPE_LABEL_SINGULAR.accomplishments,
          summaryLabel: `${row.title} (${formatWeekRange(row.week_of)})`,
          status: row.status,
          remarks: row.reviewer_remarks,
          reviewedAt: row.reviewed_at,
        })),
      ...tasks
        .filter((row) => row.reviewed_by === supervisorId && row.reviewed_at)
        .map((row) => ({
          key: `rev-tasks-${row.id}`,
          internName: internById.get(row.intern_id)?.full_name || 'Intern',
          typeLabel: TYPE_LABEL_SINGULAR.tasks,
          summaryLabel: row.title,
          status: row.status,
          remarks: row.reviewer_remarks,
          reviewedAt: row.reviewed_at,
        })),
    ]
      .sort((a, b) => String(b.reviewedAt).localeCompare(String(a.reviewedAt)))
      .slice(0, 10)

    return {
      interns,
      internById,
      internProgressRows,
      pendingItems,
      pendingCounts: {
        all: pendingItems.length,
        attendance: pendingAttendance.length,
        accomplishments: pendingAccomplishments.length,
        tasks: pendingTasks.length,
      },
      recentReviews,
    }
  }, [
    dataState.accomplishments,
    dataState.attendance,
    dataState.interns,
    dataState.tasks,
    hasLoaded,
    supervisorId,
  ])

  const filteredPendingItems = useMemo(() => {
    if (queueFilter === 'all') return derived.pendingItems
    return derived.pendingItems.filter((item) => item.type === queueFilter)
  }, [derived.pendingItems, queueFilter])

  async function handleOpenAttachment(itemKey, objectPath) {
    if (!supabase || !objectPath) return

    setOpeningAttachmentKey(itemKey)
    setAttachmentError('')

    const { data, error } = await supabase.storage
      .from('attachments')
      .createSignedUrl(objectPath, 300)

    setOpeningAttachmentKey(null)

    if (error || !data?.signedUrl) {
      setAttachmentError(
        error?.message || 'Could not generate a signed download link.',
      )
      return
    }

    setSignedUrlsByKey((prev) => ({ ...prev, [itemKey]: data.signedUrl }))

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

  function openReviewDialog(item) {
    setReviewItem(item)
    setReviewRemarks('')
    setReviewError('')
    setSubmittingDecision(null)
    clearFormValidationClasses(reviewFormRef.current)
    window.requestAnimationFrame(() => remarksInputRef.current?.focus())
  }

  const closeReviewDialog = useCallback(() => {
    setReviewItem(null)
    setReviewError('')
    setSubmittingDecision(null)
  }, [])

  async function handleReviewDecision(decision) {
    if (!supabase || !supervisorId || !reviewItem) return

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
    setPageSuccess('')

    const tableName = TABLE_BY_TYPE[reviewItem.type]
    const { data: updatedRows, error: updateError } = await supabase
      .from(tableName)
      .update({
        status: decision,
        reviewed_by: supervisorId,
        reviewer_remarks: trimmedRemarks || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', reviewItem.row.id)
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
    const label = reviewItem.typeLabel
    const internName = reviewItem.internName

    setSubmittingDecision(null)
    setReviewItem(null)
    setReviewRemarks('')
    setPageSuccess(`${label} ${decisionWord} for ${internName}.`)
    setReloadCounter((count) => count + 1)
  }

  function resetAssignForm(defaultInternId = '') {
    setAssignInternId(defaultInternId)
    setAssignTitle('')
    setAssignInstructions('')
    setAssignDeadline(getTodayIsoDate())
    setAssignPriority('medium')
    setAssignError('')
    clearFormValidationClasses(assignFormRef.current)
  }

  function openAssignDialog() {
    const defaultInternId = derived.interns[0]?.id ?? ''
    resetAssignForm(defaultInternId)
    setAssignDialogOpen(true)
    window.requestAnimationFrame(() => {
      if (derived.interns.length > 0) {
        assignTitleRef.current?.focus()
      }
    })
  }

  const closeAssignDialog = useCallback(() => {
    setAssignDialogOpen(false)
    setAssignError('')
  }, [setAssignError])

  async function handleAssignTask(event) {
    event.preventDefault()

    if (!supabase || !supervisorId) {
      setAssignError('Unable to verify your supervisor profile session.')
      return
    }

    if (derived.interns.length === 0) {
      setAssignError('No interns are assigned to you yet.')
      return
    }

    if (!assignInternId || !derived.internById.has(assignInternId)) {
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
    setPageSuccess('')

    const { error: insertError } = await supabase.from('tasks').insert({
      intern_id: assignInternId,
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
      derived.internById.get(assignInternId)?.full_name || 'intern'
    resetAssignForm(derived.interns[0]?.id ?? '')
    setAssignSaving(false)
    setAssignDialogOpen(false)
    setPageSuccess(`Task assigned to ${targetInternName}.`)
    setReloadCounter((count) => count + 1)
  }

  const supervisorName = profile?.full_name?.trim() || 'Supervisor'

  const filterButtons = [
    { key: 'all', label: 'All', count: derived.pendingCounts.all },
    {
      key: 'attendance',
      label: 'Attendance',
      count: derived.pendingCounts.attendance,
    },
    {
      key: 'accomplishments',
      label: 'Accomplishments',
      count: derived.pendingCounts.accomplishments,
    },
    { key: 'tasks', label: 'Tasks', count: derived.pendingCounts.tasks },
  ]

  return (
    <div className="max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1
            id="main-content"
            tabIndex={-1}
            className="ledger-title text-[clamp(1.375rem,1.2rem+0.6vw,1.75rem)] font-semibold leading-[1.2] tracking-[-0.02em] text-ink outline-none"
          >
            Welcome back, {supervisorName}
          </h1>
          <p className="mt-1.5 max-w-[62ch] text-sm leading-[1.55] text-ink-muted">
            Monitor assigned interns, review pending submissions, and assign
            internship tasks.
          </p>
        </div>

        <button
          type="button"
          onClick={openAssignDialog}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[5px] bg-accent-solid px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-solid-hover"
        >
          <PlusIcon className="size-4" />
          <span>Assign a task</span>
        </button>
      </header>

      {pageSuccess || loadError ? (
        <div className="space-y-3">
          <AlertMessage message={pageSuccess} variant="success" />
          {loadError ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <AlertMessage message={loadError} variant="error" />
              </div>
              <button
                type="button"
                onClick={() => {
                  setAttachmentError('')
                  setReloadCounter((count) => count + 1)
                }}
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-[5px] border border-rule bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-subtle"
              >
                Retry
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-3 rounded-[6px] border border-rule bg-surface px-5 py-14 text-sm text-ink-muted">
          <progress
            aria-label="Loading supervisor dashboard"
            className="loading-spinner"
          />
          <span>Loading assigned interns and pending submissions…</span>
        </div>
      ) : (
        <>
          <section className="overflow-hidden rounded-[6px] border border-rule bg-surface">
            <dl className="grid grid-cols-2 divide-y divide-rule sm:grid-cols-3 lg:grid-cols-5 lg:divide-x lg:divide-y-0">
              <div className="px-5 py-4 max-lg:border-e max-lg:border-rule">
                <dt className="text-xs font-medium text-ink-muted">
                  Assigned interns
                </dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">
                  {derived.interns.length}
                </dd>
              </div>
              <div className="px-5 py-4 sm:max-lg:border-e sm:max-lg:border-rule">
                <dt className="text-xs font-medium text-ink-muted">
                  Pending reviews
                </dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">
                  {derived.pendingCounts.all}
                </dd>
              </div>
              <div className="px-5 py-4 max-sm:border-e max-sm:border-rule">
                <dt className="text-xs font-medium text-ink-muted">
                  Pending attendance
                </dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">
                  {derived.pendingCounts.attendance}
                </dd>
              </div>
              <div className="px-5 py-4 sm:max-lg:border-e sm:max-lg:border-rule">
                <dt className="text-xs font-medium text-ink-muted">
                  Pending accomplishments
                </dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">
                  {derived.pendingCounts.accomplishments}
                </dd>
              </div>
              <div className="col-span-2 px-5 py-4 sm:col-span-1">
                <dt className="text-xs font-medium text-ink-muted">
                  Pending tasks
                </dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">
                  {derived.pendingCounts.tasks}
                </dd>
              </div>
            </dl>
          </section>

          <section className="overflow-hidden rounded-[6px] border border-rule bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-surface-subtle px-5 py-3.5">
              <div>
                <h2
                  id="my-interns-heading"
                  className="text-sm font-semibold text-ink"
                >
                  My Interns
                </h2>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Approved break-adjusted attendance hours and overall progress
                </p>
              </div>
              <span className="text-xs tabular-nums text-ink-muted">
                {derived.internProgressRows.length}{' '}
                {derived.internProgressRows.length === 1 ? 'intern' : 'interns'}
              </span>
            </div>

            {derived.internProgressRows.length === 0 ? (
              <div className="px-5 py-10 text-sm text-ink-muted">
                No interns assigned to you yet.
              </div>
            ) : (
              <div
                tabIndex={0}
                role="region"
                aria-labelledby="my-interns-heading"
                className="table-wrapper"
              >
                <table className="submission-table">
                  <caption className="visually-hidden">
                    Assigned interns and approved internship hours progress
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Intern</th>
                      <th scope="col" className="w-36">
                        Student ID
                      </th>
                      <th scope="col" className="w-48">
                        Company
                      </th>
                      <th scope="col" className="w-36">
                        Approved hours
                      </th>
                      <th scope="col" className="w-32">
                        Required
                      </th>
                      <th scope="col" className="w-48">
                        Progress
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {derived.internProgressRows.map((intern) => {
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
                            data-label="Student ID"
                            className="whitespace-nowrap text-sm tabular-nums text-ink-muted"
                          >
                            {intern.student_id_no || '—'}
                          </td>
                          <td
                            data-label="Company"
                            className="text-sm text-ink-muted"
                          >
                            {intern.company_name || '—'}
                          </td>
                          <td
                            data-label="Approved hours"
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
                            data-label="Required"
                            className="whitespace-nowrap text-sm tabular-nums text-ink-muted"
                          >
                            {intern.requiredHours} hrs
                          </td>
                          <td data-label="Progress">
                            <div className="min-w-[8.5rem] space-y-1.5">
                              <div className="flex items-baseline justify-between gap-2 text-xs tabular-nums">
                                <span className="font-semibold text-ink">
                                  {intern.progressPercent.toFixed(1)}%
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
                  id="pending-reviews-heading"
                  className="text-sm font-semibold text-ink"
                >
                  Pending Reviews
                </h2>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Submitted attendance, accomplishments, and completed tasks
                  awaiting review
                </p>
              </div>

              <search
                aria-label="Filter pending reviews by submission type"
                className="flex flex-wrap items-center gap-1.5"
              >
                {filterButtons.map((btn) => {
                  const active = queueFilter === btn.key
                  return (
                    <button
                      key={btn.key}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setQueueFilter(btn.key)}
                      className={`inline-flex min-h-9 items-center gap-1.5 rounded-[5px] border px-3 text-xs font-medium transition-colors ${
                        active
                          ? 'border-accent/45 bg-accent-tint text-accent'
                          : 'border-rule bg-surface text-ink-muted hover:bg-surface-subtle hover:text-ink'
                      }`}
                    >
                      <span>{btn.label}</span>
                      <span className="tabular-nums opacity-80">
                        ({btn.count})
                      </span>
                    </button>
                  )
                })}
              </search>
            </div>

            {derived.pendingItems.length === 0 ? (
              <div className="flex items-start gap-3.5 px-5 py-12">
                <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-[5px] border border-rule bg-surface-subtle text-ink-muted">
                  <NavIcon name="tasks" className="size-4" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink">
                    No pending submissions to review.
                  </p>
                  <p className="mt-1 text-sm text-ink-muted">
                    New attendance entries, weekly accomplishments, and
                    submitted tasks from your assigned interns will appear here.
                  </p>
                </div>
              </div>
            ) : filteredPendingItems.length === 0 ? (
              <div className="px-5 py-10 text-sm text-ink-muted">
                No pending {queueFilter} submissions to review.
              </div>
            ) : (
              <div
                tabIndex={0}
                role="region"
                aria-labelledby="pending-reviews-heading"
                className="table-wrapper"
              >
                <table className="submission-table">
                  <caption className="visually-hidden">
                    Pending intern submissions awaiting supervisor review
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" className="w-40">
                        Intern
                      </th>
                      <th scope="col" className="w-36">
                        Type
                      </th>
                      <th scope="col">Submission details</th>
                      <th scope="col" className="w-32">
                        Status
                      </th>
                      <th scope="col" className="col-action w-28">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPendingItems.map((item) => {
                      const { row } = item
                      return (
                        <tr key={item.key}>
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

                          <td data-label="Submission details">
                            {item.type === 'attendance' ? (
                              <div className="min-w-0 space-y-1 text-sm">
                                <p className="font-medium tabular-nums text-ink">
                                  {formatCalendarDate(row.attendance_date)} —{' '}
                                  {formatWallClockTime(row.time_in)} to{' '}
                                  {formatWallClockTime(row.time_out)}
                                </p>
                                <p className="text-xs tabular-nums text-ink-muted">
                                  {formatBreakText(row.break_minutes)} —
                                  Rendered:{' '}
                                  <span className="font-medium text-ink">
                                    {item.renderedMinutes !== null
                                      ? `${formatDurationMinutes(item.renderedMinutes)} (${formatDecimalHours(item.renderedMinutes)})`
                                      : '—'}
                                  </span>
                                </p>
                                <p className="text-xs tabular-nums text-ink-muted">
                                  Week of {formatWeekRange(row.week_of, 5)}
                                </p>
                              </div>
                            ) : item.type === 'accomplishments' ? (
                              <div className="min-w-0">
                                <p className="font-medium text-ink">
                                  {row.title}
                                </p>
                                <p className="mt-0.5 text-xs tabular-nums text-ink-muted">
                                  Week of {formatWeekRange(row.week_of)}
                                </p>
                                {row.description ? (
                                  <p className="mt-1.5 max-w-[60ch] whitespace-pre-line text-sm text-ink-muted break-words">
                                    {row.description}
                                  </p>
                                ) : null}
                                {row.skills_acquired ||
                                row.challenges_encountered ||
                                row.lessons_learned ? (
                                  <dl className="mt-2.5 space-y-2 border-t border-rule/70 pt-2">
                                    {row.skills_acquired ? (
                                      <div>
                                        <dt className="text-xs font-medium text-ink-muted">
                                          Skills acquired
                                        </dt>
                                        <dd className="mt-0.5 max-w-[60ch] whitespace-pre-line text-xs text-ink break-words">
                                          {row.skills_acquired}
                                        </dd>
                                      </div>
                                    ) : null}
                                    {row.challenges_encountered ? (
                                      <div>
                                        <dt className="text-xs font-medium text-ink-muted">
                                          Challenges encountered
                                        </dt>
                                        <dd className="mt-0.5 max-w-[60ch] whitespace-pre-line text-xs text-ink break-words">
                                          {row.challenges_encountered}
                                        </dd>
                                      </div>
                                    ) : null}
                                    {row.lessons_learned ? (
                                      <div>
                                        <dt className="text-xs font-medium text-ink-muted">
                                          Lessons learned
                                        </dt>
                                        <dd className="mt-0.5 max-w-[60ch] whitespace-pre-line text-xs text-ink break-words">
                                          {row.lessons_learned}
                                        </dd>
                                      </div>
                                    ) : null}
                                  </dl>
                                ) : null}
                                <AttachmentControl
                                  itemKey={item.key}
                                  objectPath={row.attachment_url}
                                  openingKey={openingAttachmentKey}
                                  signedUrl={signedUrlsByKey[item.key]}
                                  onOpen={handleOpenAttachment}
                                />
                              </div>
                            ) : (
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-medium text-ink">
                                    {row.title}
                                  </p>
                                  <PriorityBadge priority={row.priority} />
                                </div>
                                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs tabular-nums text-ink-muted">
                                  <span>
                                    Deadline:{' '}
                                    <span className="font-medium text-ink">
                                      {formatCalendarDate(
                                        row.deadline || row.task_date,
                                      )}
                                    </span>
                                  </span>
                                  {row.submitted_at ? (
                                    <span>
                                      Submitted on{' '}
                                      {formatCalendarDate(
                                        extractIsoDatePart(row.submitted_at),
                                      )}
                                    </span>
                                  ) : null}
                                </div>
                                {row.description ? (
                                  <p className="mt-1.5 max-w-[60ch] whitespace-pre-line text-xs text-ink-muted break-words">
                                    Instructions: {row.description}
                                  </p>
                                ) : null}
                                {row.completion_description ? (
                                  <div className="mt-2 rounded-[5px] border border-rule bg-surface-subtle px-3 py-2 text-xs">
                                    <p className="font-semibold text-ink">
                                      Intern completion notes
                                    </p>
                                    <p className="mt-1 whitespace-pre-line text-ink-muted break-words">
                                      {row.completion_description}
                                    </p>
                                  </div>
                                ) : null}
                                <AttachmentControl
                                  itemKey={item.key}
                                  objectPath={row.submission_attachment_url}
                                  openingKey={openingAttachmentKey}
                                  signedUrl={signedUrlsByKey[item.key]}
                                  onOpen={handleOpenAttachment}
                                />
                              </div>
                            )}
                          </td>

                          <td data-label="Status">
                            <StatusBadge status={row.status} />
                          </td>

                          <td data-label="Action" className="col-action">
                            <button
                              type="button"
                              onClick={() => openReviewDialog(item)}
                              className="inline-flex min-h-9 items-center justify-center rounded-[5px] border border-rule bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-subtle"
                            >
                              <span>Review</span>
                              <span className="visually-hidden">
                                {' '}
                                {item.typeLabel} from {item.internName}
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
                  id="recent-reviews-heading"
                  className="text-sm font-semibold text-ink"
                >
                  Recent Reviews
                </h2>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Your latest 10 reviewed submissions across assigned interns
                </p>
              </div>
              <span className="text-xs tabular-nums text-ink-muted">
                {derived.recentReviews.length}{' '}
                {derived.recentReviews.length === 1 ? 'review' : 'reviews'}
              </span>
            </div>

            {derived.recentReviews.length === 0 ? (
              <div className="px-5 py-10 text-sm text-ink-muted">
                No reviews completed yet.
              </div>
            ) : (
              <div
                tabIndex={0}
                role="region"
                aria-labelledby="recent-reviews-heading"
                className="table-wrapper"
              >
                <table className="submission-table">
                  <caption className="visually-hidden">
                    Recent submission review decisions made by this supervisor
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" className="w-40">
                        Intern
                      </th>
                      <th scope="col" className="w-36">
                        Type
                      </th>
                      <th scope="col">Submission</th>
                      <th scope="col" className="w-32">
                        Decision
                      </th>
                      <th scope="col">Remarks</th>
                      <th scope="col" className="w-36">
                        Reviewed
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {derived.recentReviews.map((item) => {
                      const reviewedDateIso = extractIsoDatePart(
                        item.reviewedAt,
                      )
                      return (
                        <tr key={item.key}>
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
                          <td
                            data-label="Submission"
                            className="text-sm text-ink"
                          >
                            {item.summaryLabel}
                          </td>
                          <td data-label="Decision">
                            <StatusBadge status={item.status} />
                          </td>
                          <td
                            data-label="Remarks"
                            className="max-w-[36ch] whitespace-pre-line text-xs text-ink-muted break-words"
                          >
                            {item.remarks?.trim() ? item.remarks : '—'}
                          </td>
                          <td
                            data-label="Reviewed"
                            className="whitespace-nowrap text-sm tabular-nums text-ink-muted"
                          >
                            {reviewedDateIso ? (
                              <time dateTime={reviewedDateIso}>
                                {formatCalendarDate(reviewedDateIso)}
                              </time>
                            ) : (
                              '—'
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
        </>
      )}

      <SubmissionDialog
        open={Boolean(reviewItem)}
        title={
          reviewItem
            ? `Review ${reviewItem.typeLabel} — ${reviewItem.internName}`
            : 'Review submission'
        }
        description="Approve this submission, or return or reject it with remarks for the intern."
        onClose={closeReviewDialog}
      >
        {reviewItem ? (
          <div>
            <div className="rounded-[5px] border border-rule bg-surface-subtle px-4 py-3 text-xs">
              {reviewItem.type === 'attendance' ? (
                <dl className="space-y-2">
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt className="text-ink-muted">Date</dt>
                    <dd className="font-medium tabular-nums text-ink">
                      {formatCalendarDate(reviewItem.row.attendance_date)}
                    </dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt className="text-ink-muted">Week</dt>
                    <dd className="tabular-nums text-ink">
                      {formatWeekRange(reviewItem.row.week_of, 5)}
                    </dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt className="text-ink-muted">Time in / Time out</dt>
                    <dd className="font-medium tabular-nums text-ink">
                      {formatWallClockTime(reviewItem.row.time_in)} –{' '}
                      {formatWallClockTime(reviewItem.row.time_out)}
                    </dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2">
                    <dt className="text-ink-muted">Lunch break</dt>
                    <dd className="tabular-nums text-ink">
                      {formatBreakText(reviewItem.row.break_minutes)}
                    </dd>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 border-t border-rule pt-2">
                    <dt className="font-medium text-ink">Rendered hours</dt>
                    <dd className="font-semibold tabular-nums text-ink">
                      {reviewItem.renderedMinutes !== null
                        ? `${formatDurationMinutes(reviewItem.renderedMinutes)} (${formatDecimalHours(reviewItem.renderedMinutes)})`
                        : '—'}
                    </dd>
                  </div>
                </dl>
              ) : reviewItem.type === 'accomplishments' ? (
                <div className="space-y-2.5">
                  <div>
                    <p className="text-sm font-semibold text-ink">
                      {reviewItem.row.title}
                    </p>
                    <p className="mt-0.5 tabular-nums text-ink-muted">
                      Week of {formatWeekRange(reviewItem.row.week_of)}
                    </p>
                  </div>
                  {reviewItem.row.description ? (
                    <div>
                      <p className="font-medium text-ink-muted">
                        Activities performed
                      </p>
                      <p className="mt-0.5 whitespace-pre-line text-ink break-words">
                        {reviewItem.row.description}
                      </p>
                    </div>
                  ) : null}
                  {reviewItem.row.skills_acquired ? (
                    <div>
                      <p className="font-medium text-ink-muted">
                        Skills acquired
                      </p>
                      <p className="mt-0.5 whitespace-pre-line text-ink break-words">
                        {reviewItem.row.skills_acquired}
                      </p>
                    </div>
                  ) : null}
                  {reviewItem.row.challenges_encountered ? (
                    <div>
                      <p className="font-medium text-ink-muted">
                        Challenges encountered
                      </p>
                      <p className="mt-0.5 whitespace-pre-line text-ink break-words">
                        {reviewItem.row.challenges_encountered}
                      </p>
                    </div>
                  ) : null}
                  {reviewItem.row.lessons_learned ? (
                    <div>
                      <p className="font-medium text-ink-muted">
                        Lessons learned
                      </p>
                      <p className="mt-0.5 whitespace-pre-line text-ink break-words">
                        {reviewItem.row.lessons_learned}
                      </p>
                    </div>
                  ) : null}
                  <AttachmentControl
                    itemKey={`dialog-${reviewItem.key}`}
                    objectPath={reviewItem.row.attachment_url}
                    openingKey={openingAttachmentKey}
                    signedUrl={signedUrlsByKey[`dialog-${reviewItem.key}`]}
                    onOpen={handleOpenAttachment}
                  />
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-ink">
                      {reviewItem.row.title}
                    </p>
                    <PriorityBadge priority={reviewItem.row.priority} />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums text-ink-muted">
                    <span>
                      Deadline:{' '}
                      <span className="font-medium text-ink">
                        {formatCalendarDate(
                          reviewItem.row.deadline || reviewItem.row.task_date,
                        )}
                      </span>
                    </span>
                    {reviewItem.row.deadline || reviewItem.row.task_date ? (
                      <span
                        className={
                          DEADLINE_TONE_CLASSES[
                            getDeadlineBadge(
                              reviewItem.row.deadline ||
                                reviewItem.row.task_date,
                              todayIso,
                            ).tone
                          ]
                        }
                      >
                        (
                        {
                          getDeadlineBadge(
                            reviewItem.row.deadline || reviewItem.row.task_date,
                            todayIso,
                          ).label
                        }
                        )
                      </span>
                    ) : null}
                    {reviewItem.row.submitted_at ? (
                      <span>
                        Submitted on{' '}
                        {formatCalendarDate(
                          extractIsoDatePart(reviewItem.row.submitted_at),
                        )}
                      </span>
                    ) : null}
                  </div>
                  {reviewItem.row.description ? (
                    <div>
                      <p className="font-medium text-ink-muted">Instructions</p>
                      <p className="mt-0.5 whitespace-pre-line text-ink break-words">
                        {reviewItem.row.description}
                      </p>
                    </div>
                  ) : null}
                  {reviewItem.row.completion_description ? (
                    <div className="border-t border-rule pt-2">
                      <p className="font-medium text-ink-muted">
                        Intern completion notes
                      </p>
                      <p className="mt-0.5 whitespace-pre-line text-ink break-words">
                        {reviewItem.row.completion_description}
                      </p>
                    </div>
                  ) : null}
                  <AttachmentControl
                    itemKey={`dialog-${reviewItem.key}`}
                    objectPath={reviewItem.row.submission_attachment_url}
                    openingKey={openingAttachmentKey}
                    signedUrl={signedUrlsByKey[`dialog-${reviewItem.key}`]}
                    onOpen={handleOpenAttachment}
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
                  onClick={closeReviewDialog}
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
        ) : null}
      </SubmissionDialog>

      <SubmissionDialog
        open={assignDialogOpen}
        title="Assign a Task"
        description="Assign a new task to one of your assigned interns."
        onClose={closeAssignDialog}
      >
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
            {derived.interns.length === 0 ? (
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
              disabled={derived.interns.length === 0}
              aria-invalid="false"
              aria-describedby={
                derived.interns.length === 0
                  ? 'assign-task-intern-hint'
                  : undefined
              }
              value={assignInternId}
              onChange={(event) => {
                setAssignInternId(event.target.value)
                setFieldInvalidFallback(assignInternRef.current, false)
                if (assignError) setAssignError('')
              }}
              className="form-control min-h-11 w-full rounded-[5px] border border-input-border bg-surface px-3.5 py-2.5 text-[max(1rem,1em)] text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:bg-canvas disabled:opacity-70 sm:text-sm"
            >
              {derived.interns.length === 0 ? (
                <option value="">No assigned interns available</option>
              ) : (
                derived.interns.map((intern) => (
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
              onClick={closeAssignDialog}
              className="inline-flex min-h-10 items-center justify-center rounded-[5px] border border-rule bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-subtle"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={assignSaving || derived.interns.length === 0}
              className="inline-flex min-h-10 items-center justify-center rounded-[5px] bg-accent-solid px-4 text-sm font-medium text-on-accent hover:bg-accent-solid-hover disabled:cursor-not-allowed disabled:opacity-65"
            >
              {assignSaving ? 'Assigning…' : 'Assign task'}
            </button>
          </div>
        </form>
      </SubmissionDialog>
    </div>
  )
}
