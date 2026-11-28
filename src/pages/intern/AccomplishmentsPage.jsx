import { useEffect, useMemo, useRef, useState } from 'react'
import { AccomplishmentDocumentDialog } from '../../components/AccomplishmentDocumentDialog'
import { AlertMessage } from '../../components/AlertMessage'
import { FormField } from '../../components/FormField'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  EditIcon,
  NavIcon,
  PaperclipIcon,
  PlusIcon,
} from '../../components/Icons'
import { ReturnedRemarks } from '../../components/ReturnedRemarks'
import { StatusBadge } from '../../components/StatusBadge'
import { SubmissionDialog } from '../../components/SubmissionDialog'
import { useAuth } from '../../context/useAuth'
import {
  computeWeeklyHeaderStatus,
  resolveWeeklyReflection,
} from '../../lib/accomplishmentDocument'
import {
  isMissingSchemaColumnError,
  isMissingSchemaRelationError,
  resolveHostOrganizationName,
  runWithSchemaFallback,
} from '../../lib/schemaCompat'
import {
  buildAttachmentFileName,
  getAccomplishmentDisplayStatus,
  getAttachmentDisplayName,
  getReviewResetPayload,
  hasReviewerFeedbackStatus,
  isDeletableAccomplishment,
  isDraftAccomplishment,
  isEditableAccomplishment,
  splitFilenameForDisplay,
} from '../../lib/submissionHelpers'
import { supabase } from '../../lib/supabaseClient'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useFormValidationSync } from '../../lib/useFormValidationSync'
import {
  formatWeekRange,
  formatWeekdayCalendarDate,
  getIsoDayOfWeek,
  getMondayOfWeek,
  getTodayIsoDate,
  shiftIsoDate,
} from '../../lib/weekUtils'

const EMPTY_LIST_STATE = {
  loadedKey: '',
  items: [],
  reflectionRow: null,
  error: '',
}

const ACCOMPLISHMENT_SELECT_LATEST =
  'id, intern_id, week_of, entry_date, title, description, output_result, skills_acquired, challenges_encountered, lessons_learned, attachment_url, submitted_at, status, reviewed_by, reviewer_remarks, reviewed_at, created_at'

const ACCOMPLISHMENT_SELECT_REV9 =
  'id, intern_id, week_of, entry_date, title, description, output_result, skills_acquired, challenges_encountered, lessons_learned, attachment_url, status, reviewed_by, reviewer_remarks, reviewed_at, created_at'

const ACCOMPLISHMENT_SELECT_LEGACY =
  'id, intern_id, week_of, title, description, skills_acquired, challenges_encountered, lessons_learned, attachment_url, status, reviewed_by, reviewer_remarks, reviewed_at, created_at'

const WEEKLY_STATUS_BADGE_META = {
  draft: {
    label: 'Draft',
    dotClass: 'bg-input-border',
    className: 'border-rule bg-surface text-ink-muted',
  },
  saved_not_submitted: {
    label: 'Saved – Not Yet Submitted',
    dotClass: 'bg-input-border',
    className: 'border-dashed border-input-border bg-surface text-ink-muted',
  },
  in_progress: {
    label: 'Saved – Not Yet Submitted',
    dotClass: 'bg-accent-solid',
    className: 'border-dashed border-accent/45 bg-surface text-accent',
  },
  awaiting_review: {
    label: 'Awaiting Review',
    dotClass: 'bg-accent-solid',
    className: 'border-accent/35 bg-accent-tint text-accent',
  },
  partially_reviewed: {
    label: 'Partially Reviewed',
    dotClass: 'bg-accent-solid',
    className: 'border-accent/40 bg-accent-tint text-accent',
  },
  needs_revision: {
    label: 'Needs Revision',
    dotClass: 'bg-error-border',
    className: 'border-error-border/50 bg-error-tint text-error',
  },
  approved: {
    label: 'Approved',
    dotClass: 'bg-success-border',
    className: 'border-success-border/45 bg-success-tint text-success',
  },
}

function LockIcon({ className = 'size-3.5 shrink-0' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
    >
      <rect x="4.5" y="9" width="11" height="7.5" />
      <path d="M7 9V6.75a3 3 0 0 1 6 0V9" strokeLinecap="square" />
    </svg>
  )
}

function DocumentIcon({ className = 'size-4 shrink-0' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path
        d="M5.5 3.5h6l3 3v10h-9z"
        strokeLinejoin="miter"
        strokeLinecap="square"
      />
      <path d="M11.5 3.5v3h3M7.5 9.5h5M7.5 12.5h5" strokeLinecap="square" />
    </svg>
  )
}

function CheckIcon({ className = 'size-3.5 shrink-0' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
    >
      <path d="M3.5 8.5 6.5 11.5 12.5 5" strokeLinecap="square" />
    </svg>
  )
}

function TrashIcon({ className = 'size-3.5 shrink-0' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
    >
      <path d="M4.5 6h11M8 6V4.5h4V6" strokeLinecap="square" />
      <path d="M6.25 6.5 7 16h6l.75-9.5" strokeLinecap="square" />
    </svg>
  )
}

function SendReportIcon({ className = 'size-4 shrink-0' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
    >
      <path
        d="M3.5 9.75 16.5 4.25l-4.25 11.5-2.75-4.25z"
        strokeLinejoin="miter"
        strokeLinecap="square"
      />
      <path d="M9.5 11.5 16.25 4.5" strokeLinecap="square" />
    </svg>
  )
}

function WeeklyStatusBadge({ statusKey }) {
  const meta =
    WEEKLY_STATUS_BADGE_META[statusKey] ?? WEEKLY_STATUS_BADGE_META.draft
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-[5px] border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${meta.className}`}
    >
      <span
        aria-hidden="true"
        className={`size-1.5 shrink-0 rounded-full ${meta.dotClass}`}
      />
      <span>{meta.label}</span>
    </span>
  )
}

function FileNameLabel({ objectPath, className = 'text-xs text-ink-muted' }) {
  const displayName = getAttachmentDisplayName(objectPath)
  const { stem, extension } = splitFilenameForDisplay(displayName)
  return (
    <span className={`filename-truncate ${className}`} title={displayName}>
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

function defaultDailyEntryDate(weekOfIso, existingItems = []) {
  const today = getTodayIsoDate()
  const todayMonday = getMondayOfWeek(today)
  const usedDates = new Set(
    existingItems.map((row) => row.entry_date).filter(Boolean),
  )

  if (
    todayMonday === weekOfIso &&
    getIsoDayOfWeek(today) !== 0 &&
    !usedDates.has(today)
  ) {
    return today
  }

  for (let offset = 0; offset <= 5; offset += 1) {
    const candidate = shiftIsoDate(weekOfIso, offset)
    if (!usedDates.has(candidate)) return candidate
  }

  return weekOfIso
}

function deriveEntryTitle(entryDate, descriptionText) {
  const firstLine = String(descriptionText ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean)
  if (firstLine) {
    return firstLine.length > 120 ? `${firstLine.slice(0, 117)}…` : firstLine
  }
  return entryDate
    ? `Daily Accomplishment (${formatWeekdayCalendarDate(entryDate)})`
    : 'Weekly Accomplishment'
}

function sortWeekEntries(rows) {
  return [...rows].sort((a, b) => {
    const aDate = String(a.entry_date ?? '')
    const bDate = String(b.entry_date ?? '')
    if (aDate && bDate) {
      const cmp = aDate.localeCompare(bDate)
      if (cmp !== 0) return cmp
    } else if (aDate && !bDate) {
      return -1
    } else if (!aDate && bDate) {
      return 1
    }
    return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
  })
}

export function AccomplishmentsPage() {
  useDocumentTitle('Accomplishments')

  const { profile } = useAuth()
  const internId = profile?.id
  const supervisorId = profile?.supervisor_id ?? null

  const initialToday = getTodayIsoDate()
  const currentWeekMonday = getMondayOfWeek(initialToday)
  const [filterDate, setFilterDate] = useState(initialToday)
  const selectedWeekOf = getMondayOfWeek(filterDate) || currentWeekMonday

  const [listState, setListState] = useState(EMPTY_LIST_STATE)
  const [supervisorState, setSupervisorState] = useState({
    loadedId: '',
    name: '',
  })
  const [reloadCounter, setReloadCounter] = useState(0)
  const [documentOpen, setDocumentOpen] = useState(false)
  const [unsavedPreviewPromptOpen, setUnsavedPreviewPromptOpen] =
    useState(false)
  const [savingAndPreviewing, setSavingAndPreviewing] = useState(false)

  // Weekly submission & draft deletion dialog states
  const [submitWeekDialogOpen, setSubmitWeekDialogOpen] = useState(false)
  const [submittingWeek, setSubmittingWeek] = useState(false)
  const [submitWeekError, setSubmitWeekError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deletingDraft, setDeletingDraft] = useState(false)
  const [deleteDraftError, setDeleteDraftError] = useState('')

  // Daily entry modal state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRow, setEditingRow] = useState(null)
  const [formDate, setFormDate] = useState(initialToday)
  const [description, setDescription] = useState('')
  const [outputResult, setOutputResult] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [removeExistingAttachment, setRemoveExistingAttachment] =
    useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [pageSuccess, setPageSuccess] = useState('')

  // Weekly reflection form state (once per reporting week)
  const [reflectionDraft, setReflectionDraft] = useState({
    key: '',
    skills: '',
    challenges: '',
    lessons: '',
  })
  const [savingReflection, setSavingReflection] = useState(false)
  const [reflectionError, setReflectionError] = useState('')
  const [reflectionSuccess, setReflectionSuccess] = useState('')

  const [openingId, setOpeningId] = useState(null)
  const [attachmentError, setAttachmentError] = useState('')
  const [signedUrlsById, setSignedUrlsById] = useState({})

  const formRef = useRef(null)
  const activityInputRef = useRef(null)
  const fileInputRef = useRef(null)

  useFormValidationSync(formRef)

  const weekStartIso = selectedWeekOf
  const weekSaturdayIso = selectedWeekOf ? shiftIsoDate(selectedWeekOf, 5) : ''
  const weekRangeLabel = formatWeekRange(selectedWeekOf, 5)
  const isCurrentWeek = selectedWeekOf === currentWeekMonday

  const currentQueryKey =
    internId && selectedWeekOf
      ? `${internId}:${selectedWeekOf}:${reloadCounter}`
      : ''

  useEffect(() => {
    if (!supabase || !currentQueryKey) return undefined

    let active = true

    Promise.all([
      runWithSchemaFallback(
        () =>
          supabase
            .from('accomplishments')
            .select(ACCOMPLISHMENT_SELECT_LATEST)
            .eq('intern_id', internId)
            .eq('week_of', selectedWeekOf)
            .order('entry_date', { ascending: true, nullsFirst: false })
            .order('created_at', { ascending: true }),
        () =>
          runWithSchemaFallback(
            () =>
              supabase
                .from('accomplishments')
                .select(ACCOMPLISHMENT_SELECT_REV9)
                .eq('intern_id', internId)
                .eq('week_of', selectedWeekOf)
                .order('entry_date', { ascending: true, nullsFirst: false })
                .order('created_at', { ascending: true }),
            () =>
              supabase
                .from('accomplishments')
                .select(ACCOMPLISHMENT_SELECT_LEGACY)
                .eq('intern_id', internId)
                .eq('week_of', selectedWeekOf)
                .order('created_at', { ascending: true }),
          ),
      ),
      supabase
        .from('weekly_accomplishment_reflections')
        .select(
          'id, intern_id, week_of, skills_acquired, challenges_encountered, lessons_learned, created_at, updated_at',
        )
        .eq('intern_id', internId)
        .eq('week_of', selectedWeekOf)
        .maybeSingle(),
    ]).then(([entriesRes, reflectionRes]) => {
      if (!active) return
      const reflMissingTable = isMissingSchemaRelationError(reflectionRes.error)
      const firstError =
        entriesRes.error?.message ||
        (!reflMissingTable && reflectionRes.error?.message) ||
        ''

      setListState({
        loadedKey: currentQueryKey,
        items: entriesRes.error ? [] : sortWeekEntries(entriesRes.data ?? []),
        reflectionRow:
          reflectionRes.error || !reflectionRes.data
            ? null
            : reflectionRes.data,
        error: firstError,
      })
    })

    return () => {
      active = false
    }
  }, [currentQueryKey, internId, selectedWeekOf])

  useEffect(() => {
    if (!supabase || !supervisorId) return undefined

    let active = true

    supabase
      .from('profiles')
      .select('id, full_name')
      .eq('id', supervisorId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        setSupervisorState({
          loadedId: supervisorId,
          name: error ? '' : (data?.full_name?.trim() || ''),
        })
      })

    return () => {
      active = false
    }
  }, [supervisorId])

  const supervisorName =
    supervisorId && supervisorState.loadedId === supervisorId
      ? supervisorState.name
      : ''

  const loadingList = Boolean(
    supabase && currentQueryKey && listState.loadedKey !== currentQueryKey,
  )
  const items = useMemo(
    () => (listState.loadedKey === currentQueryKey ? listState.items : []),
    [currentQueryKey, listState.items, listState.loadedKey],
  )
  const reflectionRow =
    listState.loadedKey === currentQueryKey ? listState.reflectionRow : null
  const listError =
    attachmentError ||
    (listState.loadedKey === currentQueryKey ? listState.error : '')

  const resolvedReflection = useMemo(
    () => resolveWeeklyReflection(reflectionRow, items),
    [items, reflectionRow],
  )

  const weeklyStatus = useMemo(() => computeWeeklyHeaderStatus(items), [items])
  const hasSubmittedPendingLock =
    items.length > 0 &&
    !weeklyStatus.hasUnsubmittedEntries &&
    weeklyStatus.returnedCount === 0 &&
    weeklyStatus.rejectedCount === 0
  const isWeekReflectionLocked =
    items.length > 0 && (weeklyStatus.isApproved || hasSubmittedPendingLock)
  const canSubmitWeeklyReport = weeklyStatus.draftCount > 0

  // Count how many distinct Mon-Sat dates in the week already have entries.
  const usedDatesInWeek = useMemo(
    () => new Set(items.map((row) => row.entry_date).filter(Boolean)),
    [items],
  )
  const allWeekdaysLogged = usedDatesInWeek.size >= 6
  const canAddDailyEntry = !allWeekdaysLogged && !weeklyStatus.isApproved

  const activeSkills =
    reflectionDraft.key === currentQueryKey
      ? reflectionDraft.skills
      : resolvedReflection.skills_acquired
  const activeChallenges =
    reflectionDraft.key === currentQueryKey
      ? reflectionDraft.challenges
      : resolvedReflection.challenges_encountered
  const activeLessons =
    reflectionDraft.key === currentQueryKey
      ? reflectionDraft.lessons
      : resolvedReflection.lessons_learned

  const hasSavedReflectionContent = Boolean(
    resolvedReflection.skills_acquired.trim() ||
      resolvedReflection.challenges_encountered.trim() ||
      resolvedReflection.lessons_learned.trim(),
  )

  const hasUnsavedReflectionChanges =
    !loadingList &&
    !isWeekReflectionLocked &&
    reflectionDraft.key === currentQueryKey &&
    (activeSkills !== resolvedReflection.skills_acquired ||
      activeChallenges !== resolvedReflection.challenges_encountered ||
      activeLessons !== resolvedReflection.lessons_learned)

  const hasWeeklyDocumentData = items.length > 0 || hasSavedReflectionContent

  function updateReflectionField(field, value) {
    setReflectionError('')
    setReflectionSuccess('')
    setReflectionDraft((prev) => ({
      key: currentQueryKey,
      skills:
        field === 'skills'
          ? value
          : prev.key === currentQueryKey
            ? prev.skills
            : resolvedReflection.skills_acquired,
      challenges:
        field === 'challenges'
          ? value
          : prev.key === currentQueryKey
            ? prev.challenges
            : resolvedReflection.challenges_encountered,
      lessons:
        field === 'lessons'
          ? value
          : prev.key === currentQueryKey
            ? prev.lessons
            : resolvedReflection.lessons_learned,
    }))
  }

  function discardReflectionDraft() {
    setReflectionDraft({ key: '', skills: '', challenges: '', lessons: '' })
    setReflectionError('')
    setReflectionSuccess('')
  }

  function resetForm(targetDate = defaultDailyEntryDate(selectedWeekOf, items)) {
    setEditingRow(null)
    setFormDate(targetDate)
    setDescription('')
    setOutputResult('')
    setSelectedFile(null)
    setRemoveExistingAttachment(false)
    setFormError('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    clearFormValidationClasses(formRef.current)
  }

  function openCreateDialog() {
    resetForm(defaultDailyEntryDate(selectedWeekOf, items))
    setDialogOpen(true)
    window.requestAnimationFrame(() => activityInputRef.current?.focus())
  }

  function openEditDialog(row) {
    if (!isEditableAccomplishment(row)) return
    setEditingRow(row)
    setFormDate(
      row.entry_date || defaultDailyEntryDate(selectedWeekOf, items),
    )
    setDescription(row.description ?? row.title ?? '')
    setOutputResult(row.output_result ?? '')
    setSelectedFile(null)
    setRemoveExistingAttachment(false)
    setFormError('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    clearFormValidationClasses(formRef.current)
    setDialogOpen(true)
    window.requestAnimationFrame(() => activityInputRef.current?.focus())
  }

  function handleCloseDialog() {
    setDialogOpen(false)
    setFormError('')
  }

  function navigateToWeekDate(nextDateIso) {
    setAttachmentError('')
    setPageSuccess('')
    setReflectionError('')
    setReflectionSuccess('')
    setFilterDate(nextDateIso)
  }

  function handleWeekShift(deltaDays) {
    const baseMonday = selectedWeekOf || currentWeekMonday
    navigateToWeekDate(shiftIsoDate(baseMonday, deltaDays))
  }

  function requestOpenWeeklyDocument() {
    if (hasUnsavedReflectionChanges) {
      setUnsavedPreviewPromptOpen(true)
      return
    }
    setDocumentOpen(true)
  }

  async function saveWeeklyReflectionRecord() {
    if (!supabase || !internId || !selectedWeekOf) {
      setReflectionError('Unable to verify your intern profile session.')
      return false
    }

    if (isWeekReflectionLocked) {
      setReflectionError(
        weeklyStatus.isApproved
          ? 'This weekly report is already approved and its reflection is locked.'
          : 'This weekly report has been submitted for supervisor review and is locked until reviewed.',
      )
      return false
    }

    setSavingReflection(true)
    setReflectionError('')
    setReflectionSuccess('')

    const { error } = await supabase
      .from('weekly_accomplishment_reflections')
      .upsert(
        {
          intern_id: internId,
          week_of: selectedWeekOf,
          skills_acquired: activeSkills.trim() || null,
          challenges_encountered: activeChallenges.trim() || null,
          lessons_learned: activeLessons.trim() || null,
        },
        { onConflict: 'intern_id,week_of' },
      )

    setSavingReflection(false)

    if (error) {
      setReflectionError(
        isMissingSchemaRelationError(error)
          ? 'Apply supabase/schema-revision-9.sql in the Supabase SQL Editor to enable saving weekly reflections.'
          : `Could not save weekly reflection: ${error.message}`,
      )
      return false
    }

    setReflectionDraft({ key: '', skills: '', challenges: '', lessons: '' })
    setReflectionSuccess(`Weekly reflection saved for ${weekRangeLabel}.`)
    setReloadCounter((count) => count + 1)
    return true
  }

  async function handleSaveWeeklyReflection(event) {
    event.preventDefault()
    await saveWeeklyReflectionRecord()
  }

  async function handleSaveAndOpenDocument() {
    setSavingAndPreviewing(true)
    const ok = await saveWeeklyReflectionRecord()
    setSavingAndPreviewing(false)
    setUnsavedPreviewPromptOpen(false)
    if (ok) {
      setDocumentOpen(true)
    }
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (!supabase || !internId) {
      setFormError('Unable to verify your intern profile session.')
      return
    }

    const trimmedDate = String(formDate ?? '').trim()
    const trimmedDescription = description.trim()
    const trimmedOutput = outputResult.trim()
    const isEditingLegacyWithoutDate = Boolean(
      editingRow && !editingRow.entry_date,
    )

    if (!trimmedDate) {
      setFormError('Please select an activity date within the reporting week.')
      return
    }

    if (getIsoDayOfWeek(trimmedDate) === 0) {
      setFormError(
        'Reporting weeks cover Monday to Saturday. Please choose a date between Monday and Saturday.',
      )
      return
    }

    if (trimmedDate < weekStartIso || trimmedDate > weekSaturdayIso) {
      setFormError(
        `Choose a date within the selected reporting week (${weekRangeLabel}).`,
      )
      return
    }

    if (!trimmedDescription) {
      setFormError('Please enter the activity or task performed.')
      activityInputRef.current?.focus()
      return
    }

    if (!isEditingLegacyWithoutDate && !trimmedOutput) {
      setFormError('Please enter the output or result of this activity.')
      return
    }

    if (editingRow && !isEditableAccomplishment(editingRow)) {
      setFormError(
        editingRow.status === 'approved'
          ? 'Approved entries are locked and cannot be edited.'
          : 'Submitted entries awaiting supervisor review are locked until reviewed.',
      )
      return
    }

    const conflictRow = items.find(
      (row) =>
        row.entry_date === trimmedDate &&
        (!editingRow || row.id !== editingRow.id),
    )
    if (conflictRow) {
      setFormError(
        `An entry for ${formatWeekdayCalendarDate(trimmedDate)} already exists. Edit that day's row instead.`,
      )
      return
    }

    setSaving(true)
    setFormError('')
    setPageSuccess('')

    let nextAttachmentPath = editingRow
      ? removeExistingAttachment
        ? null
        : editingRow.attachment_url
      : null

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

    const derivedTitle =
      isEditingLegacyWithoutDate && editingRow?.title?.trim()
        ? editingRow.title.trim()
        : deriveEntryTitle(trimmedDate, trimmedDescription)

    if (editingRow) {
      const wasReviewedBack = hasReviewerFeedbackStatus(editingRow.status)
      const wasDraft = isDraftAccomplishment(editingRow)
      const previousAttachmentPath = editingRow.attachment_url
      const submittedAtOverride = wasReviewedBack
        ? { submitted_at: new Date().toISOString() }
        : {}

      const latestPayload = {
        week_of: selectedWeekOf,
        entry_date: trimmedDate,
        title: derivedTitle,
        description: trimmedDescription,
        output_result: trimmedOutput || null,
        attachment_url: nextAttachmentPath,
        ...submittedAtOverride,
        ...getReviewResetPayload(editingRow.status),
      }
      const rev9Payload = {
        week_of: selectedWeekOf,
        entry_date: trimmedDate,
        title: derivedTitle,
        description: trimmedDescription,
        output_result: trimmedOutput || null,
        attachment_url: nextAttachmentPath,
        ...getReviewResetPayload(editingRow.status),
      }
      const legacyPayload = {
        week_of: selectedWeekOf,
        title: derivedTitle,
        description: trimmedDescription,
        attachment_url: nextAttachmentPath,
        ...getReviewResetPayload(editingRow.status),
      }

      const { error: updateError } = await runWithSchemaFallback(
        () =>
          supabase
            .from('accomplishments')
            .update(latestPayload)
            .eq('id', editingRow.id)
            .eq('intern_id', internId)
            .in('status', ['pending', 'returned', 'rejected']),
        () =>
          runWithSchemaFallback(
            () =>
              supabase
                .from('accomplishments')
                .update(rev9Payload)
                .eq('id', editingRow.id)
                .eq('intern_id', internId)
                .in('status', ['pending', 'returned', 'rejected']),
            () =>
              supabase
                .from('accomplishments')
                .update(legacyPayload)
                .eq('id', editingRow.id)
                .eq('intern_id', internId)
                .in('status', ['pending', 'returned', 'rejected']),
          ),
      )

      if (updateError) {
        setFormError(`Could not update accomplishment: ${updateError.message}`)
        setSaving(false)
        return
      }

      if (
        previousAttachmentPath &&
        previousAttachmentPath !== nextAttachmentPath
      ) {
        try {
          await supabase.storage
            .from('attachments')
            .remove([previousAttachmentPath])
        } catch {
          // Ignored — orphan cleanup is secondary to the successful save.
        }
      }

      setPageSuccess(
        wasReviewedBack
          ? 'Daily entry updated and resubmitted for supervisor review.'
          : wasDraft
            ? 'Saved daily entry updated. Submit your weekly report when ready for review.'
            : 'Daily entry updated.',
      )
    } else {
      const latestInsert = {
        intern_id: internId,
        week_of: selectedWeekOf,
        entry_date: trimmedDate,
        title: derivedTitle,
        description: trimmedDescription,
        output_result: trimmedOutput || null,
        attachment_url: nextAttachmentPath,
        submitted_at: null,
      }
      const rev9Insert = {
        intern_id: internId,
        week_of: selectedWeekOf,
        entry_date: trimmedDate,
        title: derivedTitle,
        description: trimmedDescription,
        output_result: trimmedOutput || null,
        attachment_url: nextAttachmentPath,
      }
      const legacyInsert = {
        intern_id: internId,
        week_of: selectedWeekOf,
        title: derivedTitle,
        description: trimmedDescription,
        attachment_url: nextAttachmentPath,
      }

      const { error: insertError } = await runWithSchemaFallback(
        () => supabase.from('accomplishments').insert(latestInsert),
        () =>
          runWithSchemaFallback(
            () => supabase.from('accomplishments').insert(rev9Insert),
            () => supabase.from('accomplishments').insert(legacyInsert),
          ),
      )

      if (insertError) {
        const isDuplicateDate =
          insertError.code === '23505' ||
          String(insertError.message ?? '').includes(
            'idx_accomplishments_intern_entry_date_unique',
          )
        setFormError(
          isDuplicateDate
            ? `An entry for ${formatWeekdayCalendarDate(trimmedDate)} already exists. Edit that day's row instead.`
            : isMissingSchemaColumnError(insertError)
              ? 'Database schema revisions 9 and 10 must be applied to record daily dates, outputs, and draft saves.'
              : `Could not save accomplishment: ${insertError.message}`,
        )
        setSaving(false)
        return
      }

      setPageSuccess(
        `Daily entry saved for ${formatWeekdayCalendarDate(trimmedDate)} (Not Yet Submitted). Your supervisor can view this update immediately; submit your weekly report when ready for formal review.`,
      )
    }

    resetForm(selectedWeekOf)
    setSaving(false)
    setDialogOpen(false)
    setAttachmentError('')
    setReloadCounter((count) => count + 1)
  }

  async function handleConfirmDeleteDraft() {
    if (!supabase || !internId || !deleteTarget) return
    if (!isDeletableAccomplishment(deleteTarget)) {
      setDeleteDraftError(
        'Only unsubmitted saved daily entries can be deleted.',
      )
      return
    }

    setDeletingDraft(true)
    setDeleteDraftError('')
    setPageSuccess('')

    const { error } = await supabase
      .from('accomplishments')
      .delete()
      .eq('id', deleteTarget.id)
      .eq('intern_id', internId)
      .eq('status', 'pending')
      .is('submitted_at', null)

    if (error) {
      setDeletingDraft(false)
      setDeleteDraftError(`Could not delete daily entry: ${error.message}`)
      return
    }

    if (deleteTarget.attachment_url) {
      try {
        await supabase.storage
          .from('attachments')
          .remove([deleteTarget.attachment_url])
      } catch {
        // Ignored — orphan cleanup is secondary to the successful delete.
      }
    }

    const removedDateLabel = deleteTarget.entry_date
      ? formatWeekdayCalendarDate(deleteTarget.entry_date)
      : deleteTarget.title || 'daily entry'

    setDeletingDraft(false)
    setDeleteTarget(null)
    setPageSuccess(`Deleted saved daily entry (${removedDateLabel}).`)
    setReloadCounter((count) => count + 1)
  }

  async function handleConfirmSubmitWeeklyReport() {
    if (!supabase || !internId || !selectedWeekOf) return

    const draftRows = items.filter((row) => isDraftAccomplishment(row))
    if (draftRows.length === 0) {
      setSubmitWeekDialogOpen(false)
      return
    }

    setSubmittingWeek(true)
    setSubmitWeekError('')
    setPageSuccess('')

    // Save any unsaved weekly reflection changes first so the submitted
    // Weekly Accomplishment Report includes the intern's latest reflection.
    if (hasUnsavedReflectionChanges) {
      const reflectionSaved = await saveWeeklyReflectionRecord()
      if (!reflectionSaved) {
        setSubmittingWeek(false)
        setSubmitWeekError(
          'Could not save your weekly reflection before submitting. Please check the reflection section and try again.',
        )
        return
      }
    }

    const submittedAtIso = new Date().toISOString()
    const draftIds = draftRows.map((row) => row.id)

    const { error } = await supabase
      .from('accomplishments')
      .update({
        submitted_at: submittedAtIso,
        status: 'pending',
        reviewed_by: null,
        reviewer_remarks: null,
        reviewed_at: null,
      })
      .eq('intern_id', internId)
      .eq('week_of', selectedWeekOf)
      .in('id', draftIds)
      .eq('status', 'pending')
      .is('submitted_at', null)

    setSubmittingWeek(false)

    if (error) {
      setSubmitWeekError(
        isMissingSchemaColumnError(error)
          ? 'Apply supabase/schema-revision-10.sql in the Supabase SQL Editor to enable explicit weekly report submission.'
          : `Could not submit weekly report: ${error.message}`,
      )
      return
    }

    setSubmitWeekDialogOpen(false)
    setPageSuccess(
      `Weekly Accomplishment Report for ${weekRangeLabel} submitted (${draftRows.length} ${draftRows.length === 1 ? 'daily entry' : 'daily entries'}). Your supervisor has been notified for formal review.`,
    )
    setReloadCounter((count) => count + 1)
  }

  async function handleOpenAttachment(row) {
    if (!supabase || !row.attachment_url) return

    setOpeningId(row.id)
    setAttachmentError('')

    const { data, error } = await supabase.storage
      .from('attachments')
      .createSignedUrl(row.attachment_url, 300)

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
      {/* Page Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1
            id="main-content"
            tabIndex={-1}
            className="ledger-title text-[clamp(1.5rem,1.25rem+0.75vw,1.875rem)] font-semibold leading-[1.2] tracking-[-0.02em] text-ink outline-none"
          >
            Accomplishments
          </h1>
          <p className="mt-1.5 max-w-[64ch] text-sm leading-[1.55] text-ink-muted">
            Log daily activities and outputs for each Monday–Saturday reporting
            week and complete one weekly reflection.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!hasWeeklyDocumentData && !hasUnsavedReflectionChanges}
            onClick={requestOpenWeeklyDocument}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[5px] border border-rule bg-surface px-3.5 py-2 text-sm font-medium text-ink hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-55"
          >
            <DocumentIcon className="size-4 text-ink-muted" />
            <span>View Weekly Document</span>
          </button>
          <button
            type="button"
            disabled={!canAddDailyEntry}
            title={
              weeklyStatus.isApproved
                ? 'This weekly report has already been approved.'
                : allWeekdaysLogged
                  ? 'All 6 workdays (Monday–Saturday) already have entries for this week.'
                  : undefined
            }
            onClick={openCreateDialog}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[5px] bg-accent-solid px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-solid-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            <PlusIcon className="size-4" />
            <span>Add Daily Entry</span>
          </button>
        </div>
      </header>

      <div className={pageSuccess || listError ? 'space-y-3' : ''}>
        <AlertMessage message={pageSuccess} variant="success" />
        <AlertMessage message={listError} variant="error" />
      </div>

      {/* Reporting Week & Daily Accomplishments */}
      <section
        aria-labelledby="accomplishments-list-heading"
        className="overflow-hidden rounded-[6px] border border-rule bg-surface"
      >
        <div className="flex flex-col gap-3.5 border-b border-rule bg-surface-subtle px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <h2
                id="accomplishments-list-heading"
                className="text-base font-semibold tabular-nums text-ink"
              >
                {weekRangeLabel}
              </h2>
              <span className="text-xs text-ink-muted">Monday – Saturday</span>
              {!loadingList ? (
                <WeeklyStatusBadge statusKey={weeklyStatus.headerKey} />
              ) : null}
            </div>

            {!loadingList ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-ink-muted">
                <span className="font-medium text-ink">
                  {items.length}{' '}
                  {items.length === 1 ? 'daily entry' : 'daily entries'}
                </span>
                {weeklyStatus.draftCount > 0 ? (
                  <>
                    <span aria-hidden="true" className="h-3 w-px bg-rule" />
                    <span className="font-medium text-ink">
                      {weeklyStatus.draftCount} saved (not submitted)
                    </span>
                  </>
                ) : null}
                <span aria-hidden="true" className="h-3 w-px bg-rule" />
                <span>{weeklyStatus.approvedCount} approved</span>
                <span aria-hidden="true" className="h-3 w-px bg-rule" />
                <span>{weeklyStatus.pendingCount} pending review</span>
                <span aria-hidden="true" className="h-3 w-px bg-rule" />
                <span>{weeklyStatus.returnedCount} returned</span>
                {weeklyStatus.rejectedCount > 0 ? (
                  <>
                    <span aria-hidden="true" className="h-3 w-px bg-rule" />
                    <span>{weeklyStatus.rejectedCount} rejected</span>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Reporting week navigation"
              className="inline-flex overflow-hidden rounded-[5px] border border-rule bg-surface"
            >
              <button
                type="button"
                onClick={() => handleWeekShift(-7)}
                aria-label="Previous week"
                className="inline-flex min-h-9 items-center gap-1 border-e border-rule px-2.5 text-xs font-medium text-ink hover:bg-surface-subtle"
              >
                <ChevronLeftIcon className="size-3.5" />
                <span className="hidden sm:inline">Previous</span>
              </button>
              <button
                type="button"
                disabled={isCurrentWeek}
                onClick={() => navigateToWeekDate(getTodayIsoDate())}
                className="inline-flex min-h-9 items-center border-e border-rule px-3 text-xs font-medium text-ink hover:bg-surface-subtle disabled:cursor-default disabled:bg-surface-subtle disabled:text-ink-muted"
              >
                This Week
              </button>
              <button
                type="button"
                onClick={() => handleWeekShift(7)}
                aria-label="Next week"
                className="inline-flex min-h-9 items-center gap-1 px-2.5 text-xs font-medium text-ink hover:bg-surface-subtle"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRightIcon className="size-3.5" />
              </button>
            </div>

            <div className="inline-flex items-center gap-1.5 rounded-[5px] border border-rule bg-surface px-2.5 min-h-9">
              <label
                htmlFor="week-selector-input"
                className="whitespace-nowrap text-xs font-medium text-ink-muted"
              >
                Jump to week
              </label>
              <input
                id="week-selector-input"
                type="date"
                value={filterDate}
                onChange={(event) => {
                  if (event.target.value) {
                    navigateToWeekDate(event.target.value)
                  }
                }}
                className="min-h-8 border-0 bg-transparent py-1 text-xs tabular-nums text-ink outline-none focus-visible:ring-0"
              />
            </div>
          </div>
        </div>

        {!loadingList && canSubmitWeeklyReport ? (
          <div className="flex flex-col gap-3 border-b border-rule bg-accent-tint/55 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-ink">
                {weeklyStatus.draftCount}{' '}
                {weeklyStatus.draftCount === 1
                  ? 'daily entry saved — not yet submitted'
                  : 'daily entries saved — not yet submitted'}
              </p>
              <p className="mt-0.5 text-xs text-ink-muted">
                Your supervisor can already view your saved daily updates in
                read-only mode. When your week&apos;s entries and reflection are
                ready, submit the complete weekly report for formal review.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSubmitWeekError('')
                setSubmitWeekDialogOpen(true)
              }}
              className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[5px] bg-accent-solid px-4 py-1.5 text-xs font-medium text-on-accent hover:bg-accent-solid-hover"
            >
              <SendReportIcon className="size-3.5" />
              <span>Submit Weekly Report</span>
            </button>
          </div>
        ) : null}

        {loadingList ? (
          <div className="flex items-center gap-3 px-5 py-10 text-sm text-ink-muted">
            <progress
              aria-label="Loading accomplishments"
              className="loading-spinner"
            />
            <span>Loading weekly accomplishments…</span>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-start gap-4 px-5 py-10 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3.5">
              <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-[5px] border border-rule bg-surface-subtle text-ink-muted">
                <NavIcon name="accomplishments" className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">
                  No daily entries for {weekRangeLabel}
                </p>
                <p className="mt-1 text-sm text-ink-muted">
                  Add one row per workday (Monday–Saturday) with your activity
                  and output to build this week&apos;s report.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={openCreateDialog}
              className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-[5px] border border-rule bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-subtle"
            >
              <PlusIcon className="size-4" />
              <span>Add Daily Entry</span>
            </button>
          </div>
        ) : (
          <div
            tabIndex={0}
            role="region"
            aria-labelledby="accomplishments-list-heading"
            className="table-wrapper"
          >
            <table className="submission-table is-compact intern-accomplishments-table">
              <caption className="visually-hidden">
                Daily accomplishments for the reporting week {weekRangeLabel}
              </caption>
              <colgroup>
                <col className="intern-acc-col-date" />
                <col className="intern-acc-col-activity" />
                <col className="intern-acc-col-output" />
                <col className="intern-acc-col-attachment" />
                <col className="intern-acc-col-status" />
                <col className="intern-acc-col-action" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Activity / Task Performed</th>
                  <th scope="col">Output / Result</th>
                  <th scope="col">Attachment</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="col-action">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const editable = isEditableAccomplishment(row)
                  const deletable = isDeletableAccomplishment(row)
                  const displayStatus = getAccomplishmentDisplayStatus(row)
                  const signedUrl = signedUrlsById[row.id]
                  const activitySummary =
                    row.description?.trim() || row.title?.trim() || '—'
                  const outputText = row.output_result?.trim() || ''
                  const datePrimary = row.entry_date
                    ? formatWeekdayCalendarDate(row.entry_date)
                    : 'Legacy entry'

                  return (
                    <tr key={row.id}>
                      <th
                        scope="row"
                        className="intern-acc-date-cell font-normal"
                      >
                        {row.entry_date ? (
                          <span className="text-sm font-medium tabular-nums text-ink">
                            {datePrimary}
                          </span>
                        ) : (
                          <div>
                            <p className="text-sm font-medium text-ink">
                              Legacy entry
                            </p>
                            <p className="mt-0.5 text-xs italic text-ink-muted">
                              Daily date not recorded
                            </p>
                          </div>
                        )}
                      </th>

                      <td data-label="Activity / Task Performed">
                        <div className="min-w-0">
                          <p className="line-clamp-3 text-sm leading-[1.5] text-ink break-words">
                            {activitySummary}
                          </p>
                          {hasReviewerFeedbackStatus(row.status) ? (
                            <ReturnedRemarks
                              remarks={row.reviewer_remarks}
                              status={row.status}
                            />
                          ) : null}
                        </div>
                      </td>

                      <td data-label="Output / Result">
                        {outputText ? (
                          <p className="line-clamp-3 text-sm leading-[1.5] text-ink-muted break-words">
                            {outputText}
                          </p>
                        ) : (
                          <span className="text-xs italic text-ink-muted">
                            Not provided
                          </span>
                        )}
                      </td>

                      <td data-label="Attachment">
                        {row.attachment_url ? (
                          <div className="flex min-w-0 flex-col items-start gap-1">
                            <button
                              type="button"
                              disabled={openingId === row.id}
                              onClick={() => handleOpenAttachment(row)}
                              className="inline-flex max-w-full min-h-8 items-center gap-1.5 rounded-[5px] border border-rule bg-surface-subtle px-2.5 text-xs font-medium text-accent hover:border-accent/45 hover:bg-accent-tint/50 disabled:opacity-60"
                            >
                              <PaperclipIcon className="size-3.5 shrink-0" />
                              {openingId === row.id ? (
                                <span>Opening…</span>
                              ) : (
                                <FileNameLabel
                                  objectPath={row.attachment_url}
                                  className="text-xs font-medium text-accent"
                                />
                              )}
                            </button>
                            {signedUrl ? (
                              <a
                                href={signedUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] font-medium text-ink-muted underline underline-offset-2 hover:text-accent"
                              >
                                Direct link
                              </a>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-xs text-ink-muted">None</span>
                        )}
                      </td>

                      <td data-label="Status" className="whitespace-nowrap">
                        <StatusBadge status={displayStatus} />
                      </td>

                      <td
                        data-label="Action"
                        className="col-action whitespace-nowrap"
                      >
                        <div className="intern-acc-action-wrap">
                          {editable ? (
                            <button
                              type="button"
                              onClick={() => openEditDialog(row)}
                              className="inline-flex min-h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-[5px] border border-rule bg-surface px-2.5 text-xs font-medium text-ink hover:bg-surface-subtle"
                            >
                              <EditIcon className="size-3.5" />
                              <span>Edit</span>
                              <span className="visually-hidden">
                                {' '}
                                {datePrimary}
                              </span>
                            </button>
                          ) : (
                            <span
                              title={
                                row.status === 'approved'
                                  ? 'Approved entry is locked.'
                                  : 'Submitted entry is locked while awaiting supervisor review.'
                              }
                              className="inline-flex min-h-8 items-center gap-1 rounded-[5px] border border-rule/80 bg-surface-subtle px-2.5 text-xs font-medium text-ink-muted"
                            >
                              <LockIcon className="size-3" />
                              <span>Locked</span>
                            </span>
                          )}
                          {deletable ? (
                            <button
                              type="button"
                              onClick={() => {
                                setDeleteDraftError('')
                                setDeleteTarget(row)
                              }}
                              className="inline-flex min-h-8 items-center justify-center gap-1 whitespace-nowrap rounded-[5px] border border-error-border/45 bg-surface px-2.5 text-xs font-medium text-error hover:bg-error-tint"
                            >
                              <TrashIcon className="size-3.5" />
                              <span>Delete</span>
                              <span className="visually-hidden">
                                {' '}
                                {datePrimary}
                              </span>
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={requestOpenWeeklyDocument}
                            className="inline-flex min-h-8 items-center justify-center whitespace-nowrap rounded-[5px] border border-rule bg-surface px-2.5 text-xs font-medium text-ink hover:bg-surface-subtle"
                          >
                            <span>Document</span>
                          </button>
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

      {/* Weekly Reflection Section — entered once per reporting week */}
      <section
        aria-labelledby="weekly-reflection-heading"
        className="overflow-hidden rounded-[6px] border border-rule bg-surface"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-surface-subtle px-5 py-3.5">
          <div>
            <h2
              id="weekly-reflection-heading"
              className="text-sm font-semibold text-ink"
            >
              Weekly Reflection — {weekRangeLabel}
            </h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              Completed once per reporting week and included on your Weekly
              Accomplishment Report.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isWeekReflectionLocked ? (
              <span
                className={`inline-flex items-center gap-1.5 rounded-[5px] border px-2.5 py-1 text-xs font-medium ${
                  weeklyStatus.isApproved
                    ? 'border-success-border/45 bg-success-tint text-success'
                    : 'border-accent/35 bg-accent-tint text-accent'
                }`}
              >
                <LockIcon className="size-3" />
                <span>
                  {weeklyStatus.isApproved
                    ? 'Locked · Approved'
                    : 'Locked · Submitted'}
                </span>
              </span>
            ) : hasUnsavedReflectionChanges ? (
              <span className="inline-flex items-center gap-1.5 rounded-[5px] border border-accent/45 bg-accent-tint px-2.5 py-1 text-xs font-medium text-accent">
                <span
                  aria-hidden="true"
                  className="size-1.5 rounded-full bg-accent-solid"
                />
                <span>Unsaved changes</span>
              </span>
            ) : hasSavedReflectionContent ? (
              <span className="inline-flex items-center gap-1.5 rounded-[5px] border border-success-border/40 bg-success-tint px-2.5 py-1 text-xs font-medium text-success">
                <CheckIcon className="size-3.5" />
                <span>Saved</span>
              </span>
            ) : (
              <span className="inline-flex items-center rounded-[5px] border border-rule bg-surface px-2.5 py-1 text-xs font-medium text-ink-muted">
                Not yet saved
              </span>
            )}
          </div>
        </div>

        <form onSubmit={handleSaveWeeklyReflection} className="space-y-4 p-5">
          <div
            className={reflectionSuccess || reflectionError ? 'space-y-2' : ''}
          >
            <AlertMessage message={reflectionSuccess} variant="success" />
            <AlertMessage message={reflectionError} variant="error" />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField
              id="weekly-reflection-skills"
              name="skills_acquired"
              label="Skills Acquired"
              multiline
              rows={2}
              inputClassName="auto-grow-textarea"
              disabled={loadingList || isWeekReflectionLocked}
              placeholder="e.g. Network switch VLAN setup, database querying, or client communication skills developed this week."
              value={activeSkills}
              onChange={(event) =>
                updateReflectionField('skills', event.target.value)
              }
            />

            <FormField
              id="weekly-reflection-challenges"
              name="challenges_encountered"
              label="Challenges Encountered"
              multiline
              rows={2}
              inputClassName="auto-grow-textarea"
              disabled={loadingList || isWeekReflectionLocked}
              placeholder="e.g. Unlabeled hardware ports, tight turnaround on tickets, or unfamiliar tools encountered."
              value={activeChallenges}
              onChange={(event) =>
                updateReflectionField('challenges', event.target.value)
              }
            />
          </div>

          <FormField
            id="weekly-reflection-lessons"
            name="lessons_learned"
            label="Lessons Learned / Next Steps"
            multiline
            rows={2}
            inputClassName="auto-grow-textarea"
            disabled={loadingList || isWeekReflectionLocked}
            placeholder="e.g. Key takeaways from this week's work and what you plan to focus on next week."
            value={activeLessons}
            onChange={(event) =>
              updateReflectionField('lessons', event.target.value)
            }
          />

          {!isWeekReflectionLocked ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-3.5">
              <p className="text-xs text-ink-muted">
                {hasUnsavedReflectionChanges
                  ? 'You have unsaved reflection edits for this reporting week.'
                  : hasSavedReflectionContent
                    ? 'All reflection changes for this week are saved.'
                    : 'Enter your reflection once for the entire Monday–Saturday week.'}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {hasUnsavedReflectionChanges ? (
                  <button
                    type="button"
                    disabled={savingReflection}
                    onClick={discardReflectionDraft}
                    className="inline-flex min-h-9 items-center justify-center rounded-[5px] border border-rule bg-surface px-3.5 text-xs font-medium text-ink hover:bg-surface-subtle disabled:opacity-60"
                  >
                    Discard changes
                  </button>
                ) : null}
                <button
                  type="submit"
                  disabled={
                    loadingList ||
                    savingReflection ||
                    !hasUnsavedReflectionChanges
                  }
                  className="inline-flex min-h-9 items-center justify-center rounded-[5px] bg-accent-solid px-4 text-xs font-medium text-on-accent hover:bg-accent-solid-hover disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {savingReflection
                    ? 'Saving reflection…'
                    : 'Save weekly reflection'}
                </button>
              </div>
            </div>
          ) : null}
        </form>
      </section>

      {/* Add / Edit Daily Entry Modal */}
      <SubmissionDialog
        open={dialogOpen}
        title={editingRow ? 'Edit Daily Entry' : 'Add Daily Entry'}
        description={
          hasReviewerFeedbackStatus(editingRow?.status)
            ? 'Saving changes resets this entry to Pending for supervisor re-review.'
            : `Record one daily row within ${weekRangeLabel} (Monday–Saturday).`
        }
        onClose={handleCloseDialog}
      >
        <div className={formError ? 'mb-4' : ''}>
          <AlertMessage message={formError} variant="error" />
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-3.5">
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[12.5rem_1fr]">
            <FormField
              id="accomplishment-entry-date"
              name="entry_date"
              label="Activity Date"
              type="date"
              min={weekStartIso}
              max={weekSaturdayIso}
              required
              validationMessage={`Choose a date between ${weekRangeLabel} (Monday–Saturday).`}
              value={formDate}
              onChange={(event) => {
                setFormDate(event.target.value)
                if (formError) setFormError('')
              }}
            />
            <div className="flex min-h-11 flex-col justify-center rounded-[5px] border border-rule bg-surface-subtle px-3 py-2">
              <span className="text-[11px] text-ink-muted">
                Selected Reporting Week
              </span>
              <span className="text-xs font-medium tabular-nums text-ink">
                {weekRangeLabel} (Mon – Sat)
              </span>
            </div>
          </div>

          <FormField
            inputRef={activityInputRef}
            id="accomplishment-description"
            name="description"
            label="Activity / Task Performed"
            multiline
            rows={2}
            inputClassName="auto-grow-textarea"
            required
            placeholder="Describe the specific task or activity you worked on for this day."
            validationMessage="Enter the activity or task performed."
            value={description}
            onChange={(event) => {
              setDescription(event.target.value)
              if (formError) setFormError('')
            }}
          />

          <FormField
            id="accomplishment-output-result"
            name="output_result"
            label="Output / Result"
            multiline
            rows={2}
            inputClassName="auto-grow-textarea"
            required={!editingRow || Boolean(editingRow.entry_date)}
            placeholder="Record the concrete output, deliverable, or result achieved."
            validationMessage="Enter the output or result of this activity."
            value={outputResult}
            onChange={(event) => {
              setOutputResult(event.target.value)
              if (formError) setFormError('')
            }}
          />

          <div className="field-group flex flex-col gap-1.5">
            <label
              htmlFor="accomplishment-attachment"
              className="text-sm font-medium leading-[1.4] text-ink"
            >
              Supporting Attachment (Optional)
            </label>
            <span
              id="accomplishment-attachment-hint"
              className="text-xs leading-[1.4] text-ink-muted"
            >
              Stored privately in your intern folder and opened via signed URLs.
            </span>

            {editingRow?.attachment_url ? (
              <div className="my-1 flex flex-wrap items-center justify-between gap-2 rounded-[5px] border border-rule bg-surface-subtle px-3 py-2 text-xs text-ink">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className="shrink-0">Current file:</span>
                  <FileNameLabel objectPath={editingRow.attachment_url} />
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

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                id="accomplishment-attachment"
                name="attachment"
                type="file"
                aria-invalid="false"
                aria-describedby="accomplishment-attachment-hint"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null
                  setSelectedFile(file)
                  if (file) setRemoveExistingAttachment(false)
                  if (formError) setFormError('')
                }}
                className="form-control min-h-10 flex-1 rounded-[5px] border border-input-border bg-surface px-2.5 py-1.5 text-xs text-ink file:me-3 file:min-h-7 file:cursor-pointer file:rounded-[4px] file:border file:border-rule file:bg-surface-subtle file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-ink hover:file:bg-canvas"
              />
              {selectedFile ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFile(null)
                    if (fileInputRef.current) fileInputRef.current.value = ''
                  }}
                  className="inline-flex min-h-9 items-center justify-center rounded-[5px] border border-rule bg-surface px-3 text-xs font-medium text-ink-muted hover:bg-surface-subtle hover:text-ink"
                >
                  Clear file
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-rule pt-3.5">
            <button
              type="button"
              onClick={handleCloseDialog}
              className="inline-flex min-h-9 items-center justify-center rounded-[5px] border border-rule bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-subtle"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-9 items-center justify-center rounded-[5px] bg-accent-solid px-4 text-sm font-medium text-on-accent hover:bg-accent-solid-hover disabled:cursor-not-allowed disabled:opacity-65"
            >
              {saving
                ? 'Saving…'
                : editingRow
                  ? hasReviewerFeedbackStatus(editingRow.status)
                    ? 'Save & Resubmit'
                    : 'Save Changes'
                  : 'Save Daily Entry'}
            </button>
          </div>
        </form>
      </SubmissionDialog>

      {/* Submit Complete Weekly Report Confirmation Modal */}
      <SubmissionDialog
        open={submitWeekDialogOpen}
        title="Submit Weekly Accomplishment Report"
        description={`Reporting Period: ${weekRangeLabel} (Monday–Saturday)`}
        onClose={() => {
          if (!submittingWeek) {
            setSubmitWeekDialogOpen(false)
            setSubmitWeekError('')
          }
        }}
      >
        <div className="space-y-4 text-sm">
          {submitWeekError ? (
            <AlertMessage message={submitWeekError} variant="error" />
          ) : null}

          <p className="leading-[1.55] text-ink-muted">
            You are about to formally submit{' '}
            <span className="font-semibold text-ink">
              {weeklyStatus.draftCount}{' '}
              {weeklyStatus.draftCount === 1
                ? 'saved daily entry'
                : 'saved daily entries'}
            </span>{' '}
            for{' '}
            <span className="font-medium tabular-nums text-ink">
              {weekRangeLabel}
            </span>{' '}
            along with your weekly reflection to your assigned supervisor for
            review.
          </p>

          <dl className="space-y-2 rounded-[5px] border border-rule bg-surface-subtle px-4 py-3 text-xs">
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-ink-muted">Total daily entries in week</dt>
              <dd className="font-medium tabular-nums text-ink">
                {items.length} of 6 workdays
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-ink-muted">Entries to submit now</dt>
              <dd className="font-medium tabular-nums text-ink">
                {weeklyStatus.draftCount}
              </dd>
            </div>
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-ink-muted">Weekly reflection</dt>
              <dd className="font-medium text-ink">
                {hasUnsavedReflectionChanges
                  ? 'Unsaved edits (will be saved automatically)'
                  : hasSavedReflectionContent
                    ? 'Saved and included'
                    : 'Not yet filled (optional — you can still submit)'}
              </dd>
            </div>
          </dl>

          <p className="text-xs leading-[1.5] text-ink-muted">
            Once submitted, these entries will be locked from editing or
            deletion while awaiting supervisor review. If your supervisor
            returns any entry for revision, you will be able to edit and
            resubmit it.
          </p>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-rule pt-4">
            <button
              type="button"
              disabled={submittingWeek}
              onClick={() => {
                setSubmitWeekDialogOpen(false)
                setSubmitWeekError('')
              }}
              className="inline-flex min-h-9 items-center justify-center rounded-[5px] border border-rule bg-surface px-3.5 text-xs font-medium text-ink hover:bg-surface-subtle disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submittingWeek}
              onClick={() => void handleConfirmSubmitWeeklyReport()}
              className="inline-flex min-h-9 items-center justify-center gap-2 rounded-[5px] bg-accent-solid px-4 text-xs font-medium text-on-accent hover:bg-accent-solid-hover disabled:opacity-65"
            >
              <SendReportIcon className="size-3.5" />
              <span>
                {submittingWeek ? 'Submitting…' : 'Confirm & Submit Report'}
              </span>
            </button>
          </div>
        </div>
      </SubmissionDialog>

      {/* Delete Saved (Unsubmitted) Daily Entry Confirmation Modal */}
      <SubmissionDialog
        open={Boolean(deleteTarget)}
        title="Delete Saved Daily Entry"
        description="Only unsubmitted daily entries can be deleted."
        onClose={() => {
          if (!deletingDraft) {
            setDeleteTarget(null)
            setDeleteDraftError('')
          }
        }}
      >
        {deleteTarget ? (
          <div className="space-y-4 text-sm">
            {deleteDraftError ? (
              <AlertMessage message={deleteDraftError} variant="error" />
            ) : null}

            <p className="leading-[1.55] text-ink-muted">
              Remove your saved daily entry for{' '}
              <span className="font-semibold text-ink">
                {deleteTarget.entry_date
                  ? formatWeekdayCalendarDate(deleteTarget.entry_date)
                  : deleteTarget.title}
              </span>
              ? This action cannot be undone.
            </p>

            <div className="rounded-[5px] border border-rule bg-surface-subtle px-3.5 py-2.5 text-xs">
              <p className="font-medium text-ink">
                {deleteTarget.description?.trim() || deleteTarget.title}
              </p>
              {deleteTarget.output_result?.trim() ? (
                <p className="mt-1 text-ink-muted">
                  Output: {deleteTarget.output_result.trim()}
                </p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-rule pt-4">
              <button
                type="button"
                disabled={deletingDraft}
                onClick={() => {
                  setDeleteTarget(null)
                  setDeleteDraftError('')
                }}
                className="inline-flex min-h-9 items-center justify-center rounded-[5px] border border-rule bg-surface px-3.5 text-xs font-medium text-ink hover:bg-surface-subtle disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deletingDraft}
                onClick={() => void handleConfirmDeleteDraft()}
                className="inline-flex min-h-9 items-center justify-center rounded-[5px] border border-rejected-border bg-rejected-bg px-4 text-xs font-medium text-on-accent hover:opacity-90 disabled:opacity-65"
              >
                {deletingDraft ? 'Deleting…' : 'Delete Entry'}
              </button>
            </div>
          </div>
        ) : null}
      </SubmissionDialog>

      {/* Unsaved Reflection Warning before Previewing Document */}
      <SubmissionDialog
        open={unsavedPreviewPromptOpen}
        title="Unsaved weekly reflection changes"
        description="Your Weekly Accomplishment Report preview uses saved data."
        onClose={() => {
          if (!savingAndPreviewing) setUnsavedPreviewPromptOpen(false)
        }}
      >
        <div className="space-y-4 text-sm">
          <p className="leading-[1.55] text-ink-muted">
            You have unsaved edits in your{' '}
            <span className="font-medium text-ink">Weekly Reflection</span> for{' '}
            <span className="font-medium tabular-nums text-ink">
              {weekRangeLabel}
            </span>
            . Save them now so they appear in the generated document, or preview
            using the last saved version.
          </p>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-rule pt-4">
            <button
              type="button"
              disabled={savingAndPreviewing}
              onClick={() => setUnsavedPreviewPromptOpen(false)}
              className="inline-flex min-h-9 items-center justify-center rounded-[5px] border border-rule bg-surface px-3.5 text-xs font-medium text-ink hover:bg-surface-subtle disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={savingAndPreviewing || !hasWeeklyDocumentData}
              onClick={() => {
                setUnsavedPreviewPromptOpen(false)
                setDocumentOpen(true)
              }}
              className="inline-flex min-h-9 items-center justify-center rounded-[5px] border border-rule bg-surface px-3.5 text-xs font-medium text-ink hover:bg-surface-subtle disabled:opacity-55"
            >
              Preview saved version
            </button>
            <button
              type="button"
              disabled={savingAndPreviewing}
              onClick={() => void handleSaveAndOpenDocument()}
              className="inline-flex min-h-9 items-center justify-center rounded-[5px] bg-accent-solid px-4 text-xs font-medium text-on-accent hover:bg-accent-solid-hover disabled:opacity-65"
            >
              {savingAndPreviewing ? 'Saving…' : 'Save & preview document'}
            </button>
          </div>
        </div>
      </SubmissionDialog>

      {/* Canonical Weekly Accomplishment Document Preview */}
      <AccomplishmentDocumentDialog
        open={documentOpen}
        onClose={() => setDocumentOpen(false)}
        rows={items}
        weekOf={selectedWeekOf}
        weeklyReflection={reflectionRow}
        internName={profile?.full_name}
        studentIdNo={profile?.student_id_no}
        course={profile?.course}
        yearLevel={profile?.year_level}
        schoolName={profile?.school_name}
        internshipType={profile?.internship_type}
        hostOrganization={resolveHostOrganizationName(profile)}
        companyName={profile?.company_name}
        departmentOffice={profile?.department_office}
        supervisorName={supervisorName}
        reviewerName={weeklyStatus.isApproved ? supervisorName : ''}
        requiredHours={profile?.required_hours}
        internshipStartDate={profile?.internship_start_date}
        internshipEndDate={profile?.internship_end_date}
      />
    </div>
  )
}
