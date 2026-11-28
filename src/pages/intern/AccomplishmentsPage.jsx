import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  computeWeeklyReviewStatus,
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
  getAttachmentDisplayName,
  getReviewResetPayload,
  hasReviewerFeedbackStatus,
  isEditableSubmissionStatus,
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
  'id, intern_id, week_of, entry_date, title, description, output_result, skills_acquired, challenges_encountered, lessons_learned, attachment_url, status, reviewed_by, reviewer_remarks, reviewed_at, created_at'

const ACCOMPLISHMENT_SELECT_LEGACY =
  'id, intern_id, week_of, title, description, skills_acquired, challenges_encountered, lessons_learned, attachment_url, status, reviewed_by, reviewer_remarks, reviewed_at, created_at'

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

function defaultDailyEntryDate(weekOfIso, existingItems = []) {
  const today = getTodayIsoDate()
  const todayMonday = getMondayOfWeek(today)
  const usedDates = new Set(
    existingItems.map((row) => row.entry_date).filter(Boolean),
  )

  // If viewing the current week and today is Mon-Sat and unused, default to today.
  if (
    todayMonday === weekOfIso &&
    getIsoDayOfWeek(today) !== 0 &&
    !usedDates.has(today)
  ) {
    return today
  }

  // Otherwise choose the first open weekday (Monday-Saturday) of the week.
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
  const [filterDate, setFilterDate] = useState(initialToday)
  const selectedWeekOf =
    getMondayOfWeek(filterDate) || getMondayOfWeek(initialToday)

  const [listState, setListState] = useState(EMPTY_LIST_STATE)
  const [supervisorState, setSupervisorState] = useState({
    loadedId: '',
    name: '',
  })
  const [reloadCounter, setReloadCounter] = useState(0)
  const [documentOpen, setDocumentOpen] = useState(false)

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

  const formWeekOf = getMondayOfWeek(formDate)
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
          supabase
            .from('accomplishments')
            .select(ACCOMPLISHMENT_SELECT_LEGACY)
            .eq('intern_id', internId)
            .eq('week_of', selectedWeekOf)
            .order('created_at', { ascending: true }),
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

  const weeklyStatus = useMemo(() => computeWeeklyReviewStatus(items), [items])
  const isWeekReflectionLocked = items.length > 0 && weeklyStatus.isApproved

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

  const hasWeeklyDocumentData =
    items.length > 0 ||
    Boolean(
      resolvedReflection.skills_acquired.trim() ||
        resolvedReflection.challenges_encountered.trim() ||
        resolvedReflection.lessons_learned.trim(),
    )

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
    if (!isEditableSubmissionStatus(row.status)) return
    setEditingRow(row)
    setFormDate(row.entry_date || row.week_of || selectedWeekOf)
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

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false)
    setFormError('')
  }, [])

  function handleWeekShift(deltaDays) {
    const baseMonday = selectedWeekOf || getMondayOfWeek(getTodayIsoDate())
    setAttachmentError('')
    setPageSuccess('')
    setReflectionError('')
    setReflectionSuccess('')
    setFilterDate(shiftIsoDate(baseMonday, deltaDays))
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

    if (!trimmedDate || !formWeekOf) {
      setFormError('Please choose a valid date (Monday to Saturday).')
      return
    }

    if (getIsoDayOfWeek(trimmedDate) === 0) {
      setFormError(
        'Weekly Accomplishment Reports cover Monday to Saturday. Please select a date between Monday and Saturday.',
      )
      return
    }

    if (!trimmedDescription) {
      setFormError('Please describe the activity or task performed.')
      activityInputRef.current?.focus()
      return
    }

    if (!isEditingLegacyWithoutDate && !trimmedOutput) {
      setFormError('Please record the output or result of this activity.')
      return
    }

    if (editingRow && !isEditableSubmissionStatus(editingRow.status)) {
      setFormError('Approved accomplishments cannot be edited.')
      return
    }

    // Prevent duplicate daily row for the same date in the loaded week.
    if (formWeekOf === selectedWeekOf) {
      const conflictRow = items.find(
        (row) =>
          row.entry_date === trimmedDate &&
          (!editingRow || row.id !== editingRow.id),
      )
      if (conflictRow) {
        setFormError(
          `An accomplishment entry for ${formatWeekdayCalendarDate(trimmedDate)} already exists. Edit that day's row instead.`,
        )
        return
      }
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
      const previousAttachmentPath = editingRow.attachment_url
      const latestPayload = {
        week_of: formWeekOf,
        entry_date: trimmedDate,
        title: derivedTitle,
        description: trimmedDescription,
        output_result: trimmedOutput || null,
        attachment_url: nextAttachmentPath,
        ...getReviewResetPayload(editingRow.status),
      }
      const legacyPayload = {
        week_of: formWeekOf,
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
          supabase
            .from('accomplishments')
            .update(legacyPayload)
            .eq('id', editingRow.id)
            .eq('intern_id', internId)
            .in('status', ['pending', 'returned', 'rejected']),
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
          ? 'Daily accomplishment updated and resubmitted as pending.'
          : 'Daily accomplishment updated.',
      )
    } else {
      const latestInsert = {
        intern_id: internId,
        week_of: formWeekOf,
        entry_date: trimmedDate,
        title: derivedTitle,
        description: trimmedDescription,
        output_result: trimmedOutput || null,
        attachment_url: nextAttachmentPath,
      }
      const legacyInsert = {
        intern_id: internId,
        week_of: formWeekOf,
        title: derivedTitle,
        description: trimmedDescription,
        attachment_url: nextAttachmentPath,
      }

      const { error: insertError } = await runWithSchemaFallback(
        () => supabase.from('accomplishments').insert(latestInsert),
        () => supabase.from('accomplishments').insert(legacyInsert),
      )

      if (insertError) {
        const isDuplicateDate =
          insertError.code === '23505' ||
          String(insertError.message ?? '').includes(
            'idx_accomplishments_intern_entry_date_unique',
          )
        setFormError(
          isDuplicateDate
            ? `An accomplishment entry for ${formatWeekdayCalendarDate(trimmedDate)} already exists. Edit that day's row instead.`
            : isMissingSchemaColumnError(insertError)
              ? 'Database schema revision 9 must be applied to record daily dates and outputs.'
              : `Could not save accomplishment: ${insertError.message}`,
        )
        setSaving(false)
        return
      }

      setPageSuccess(
        `Daily accomplishment added for ${formatWeekdayCalendarDate(trimmedDate)}.`,
      )
    }

    const savedWeekOf = formWeekOf
    resetForm(savedWeekOf)
    setSaving(false)
    setDialogOpen(false)
    setAttachmentError('')

    if (savedWeekOf !== selectedWeekOf) {
      setFilterDate(savedWeekOf)
    } else {
      setReloadCounter((count) => count + 1)
    }
  }

  async function handleSaveWeeklyReflection(event) {
    event.preventDefault()

    if (!supabase || !internId || !selectedWeekOf) {
      setReflectionError('Unable to verify your intern profile session.')
      return
    }

    if (isWeekReflectionLocked) {
      setReflectionError(
        'This weekly report is already approved and its reflection is locked.',
      )
      return
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
      return
    }

    setReflectionSuccess(
      `Weekly reflection saved for ${formatWeekRange(selectedWeekOf, 5)}.`,
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

  const weekRangeLabel = formatWeekRange(selectedWeekOf, 5)
  const formWeekRangeLabel = formWeekOf ? formatWeekRange(formWeekOf, 5) : ''
  const weekStartIso = selectedWeekOf
  const weekSaturdayIso = selectedWeekOf ? shiftIsoDate(selectedWeekOf, 5) : ''

  return (
    <div className="max-w-6xl space-y-6">
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
            Record daily internship activities and outputs (Monday to Saturday)
            and complete one weekly reflection per reporting period.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={!hasWeeklyDocumentData}
            onClick={() => setDocumentOpen(true)}
            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-[5px] border border-rule bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-55"
          >
            View weekly document
          </button>
          <button
            type="button"
            onClick={openCreateDialog}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[5px] bg-accent-solid px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-solid-hover"
          >
            <PlusIcon className="size-4" />
            <span>Add daily entry</span>
          </button>
        </div>
      </header>

      <div className={pageSuccess || listError ? 'space-y-3' : ''}>
        <AlertMessage message={pageSuccess} variant="success" />
        <AlertMessage message={listError} variant="error" />
      </div>

      <section
        aria-labelledby="accomplishments-list-heading"
        className="overflow-hidden rounded-[6px] border border-rule bg-surface"
      >
        <div className="flex flex-col gap-4 border-b border-rule bg-surface-subtle px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <h2
                id="accomplishments-list-heading"
                className="text-base font-semibold tabular-nums text-ink"
              >
                {weekRangeLabel}
              </h2>
              <span className="text-xs tabular-nums text-ink-muted">
                Monday – Saturday ({weekStartIso} to {weekSaturdayIso})
              </span>
              {!loadingList && items.length > 0 ? (
                <StatusBadge status={weeklyStatus.statusKey} />
              ) : null}
            </div>

            {!loadingList && items.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-ink-muted">
                <span className="font-medium text-ink">
                  {items.length}{' '}
                  {items.length === 1 ? 'daily entry' : 'daily entries'}
                </span>
                <span aria-hidden="true" className="h-3 w-px bg-rule" />
                <span>{weeklyStatus.pendingCount} pending</span>
                <span aria-hidden="true" className="h-3 w-px bg-rule" />
                <span>{weeklyStatus.returnedCount} returned</span>
                {weeklyStatus.rejectedCount > 0 ? (
                  <>
                    <span aria-hidden="true" className="h-3 w-px bg-rule" />
                    <span>{weeklyStatus.rejectedCount} rejected</span>
                  </>
                ) : null}
                <span aria-hidden="true" className="h-3 w-px bg-rule" />
                <span>{weeklyStatus.approvedCount} approved</span>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Week navigation"
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
                onClick={() => {
                  setAttachmentError('')
                  setPageSuccess('')
                  setReflectionError('')
                  setReflectionSuccess('')
                  setFilterDate(getTodayIsoDate())
                }}
                className="inline-flex min-h-9 items-center border-e border-rule px-3 text-xs font-medium text-ink hover:bg-surface-subtle"
              >
                This week
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

            <label htmlFor="week-selector-input" className="visually-hidden">
              Select week date
            </label>
            <input
              id="week-selector-input"
              type="date"
              value={filterDate}
              onChange={(event) => {
                if (event.target.value) {
                  setAttachmentError('')
                  setPageSuccess('')
                  setReflectionError('')
                  setReflectionSuccess('')
                  setFilterDate(event.target.value)
                }
              }}
              className="form-control min-h-9 rounded-[5px] border border-input-border bg-surface px-2.5 py-1.5 text-xs tabular-nums text-ink"
            />
          </div>
        </div>

        {loadingList ? (
          <div className="flex items-center gap-3 px-5 py-12 text-sm text-ink-muted">
            <progress
              aria-label="Loading accomplishments"
              className="loading-spinner"
            />
            <span>Loading weekly accomplishments…</span>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-start gap-4 px-5 py-12 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3.5">
              <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-[5px] border border-rule bg-surface-subtle text-ink-muted">
                <NavIcon name="accomplishments" className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">
                  No daily accomplishments recorded for this week
                </p>
                <p className="mt-1 text-sm text-ink-muted">
                  Add one row per day (Monday to Saturday) for {weekRangeLabel}{' '}
                  to build your Weekly Accomplishment Report.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={openCreateDialog}
              className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-[5px] border border-rule bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-subtle"
            >
              <PlusIcon className="size-4" />
              <span>Add daily entry</span>
            </button>
          </div>
        ) : (
          <div
            tabIndex={0}
            role="region"
            aria-labelledby="accomplishments-list-heading"
            className="table-wrapper"
          >
            <table className="submission-table is-compact">
              <caption className="visually-hidden">
                Daily accomplishments for the reporting week {weekRangeLabel}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="w-40 whitespace-nowrap">
                    Date
                  </th>
                  <th scope="col">Activities Performed</th>
                  <th scope="col" className="w-60">
                    Output / Result
                  </th>
                  <th scope="col" className="w-44 whitespace-nowrap">
                    Attachment
                  </th>
                  <th scope="col" className="w-32 whitespace-nowrap">
                    Status
                  </th>
                  <th scope="col" className="col-action w-52 whitespace-nowrap">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const editable = isEditableSubmissionStatus(row.status)
                  const signedUrl = signedUrlsById[row.id]
                  const activitySummary =
                    row.description?.trim() || row.title?.trim() || '—'
                  const outputText = row.output_result?.trim() || ''

                  return (
                    <tr key={row.id}>
                      <td
                        data-label="Date"
                        className="align-middle! whitespace-nowrap"
                      >
                        {row.entry_date ? (
                          <span className="text-sm font-medium tabular-nums text-ink">
                            {formatWeekdayCalendarDate(row.entry_date)}
                          </span>
                        ) : (
                          <div>
                            <p className="text-sm font-medium text-ink">
                              Legacy entry
                            </p>
                            <p className="text-xs italic text-ink-muted">
                              Daily date not recorded
                            </p>
                          </div>
                        )}
                      </td>

                      <td
                        data-label="Activities Performed"
                        className="align-middle!"
                      >
                        <div className="min-w-0">
                          <p className="line-clamp-2 text-sm text-ink break-words">
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

                      <td
                        data-label="Output / Result"
                        className="align-middle!"
                      >
                        {outputText ? (
                          <p className="line-clamp-2 text-sm text-ink-muted break-words">
                            {outputText}
                          </p>
                        ) : (
                          <span className="text-xs italic text-ink-muted">
                            Not provided
                          </span>
                        )}
                      </td>

                      <td data-label="Attachment" className="align-middle!">
                        {row.attachment_url ? (
                          <div className="flex min-w-0 flex-col items-start gap-1">
                            <button
                              type="button"
                              disabled={openingId === row.id}
                              onClick={() => handleOpenAttachment(row)}
                              className="inline-flex min-h-8 items-center gap-1.5 text-sm font-medium text-accent underline underline-offset-4 hover:text-accent-hover disabled:opacity-60"
                            >
                              <PaperclipIcon className="size-3.5" />
                              <span>
                                {openingId === row.id
                                  ? 'Generating link…'
                                  : 'View file'}
                              </span>
                            </button>
                            <FileNameLabel objectPath={row.attachment_url} />
                            {signedUrl ? (
                              <a
                                href={signedUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs font-medium text-ink underline underline-offset-2 hover:text-accent"
                              >
                                Open signed link directly
                              </a>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-sm text-ink-muted">None</span>
                        )}
                      </td>

                      <td
                        data-label="Status"
                        className="align-middle! whitespace-nowrap"
                      >
                        <StatusBadge status={row.status} />
                      </td>

                      <td
                        data-label="Action"
                        className="col-action align-middle!"
                      >
                        <div className="inline-flex flex-wrap items-center gap-2">
                          {editable ? (
                            <button
                              type="button"
                              onClick={() => openEditDialog(row)}
                              className="inline-flex min-h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-[5px] border border-rule bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-subtle"
                            >
                              <EditIcon className="size-3.5" />
                              <span>Edit</span>
                              <span className="visually-hidden">
                                {' '}
                                {row.entry_date
                                  ? formatWeekdayCalendarDate(row.entry_date)
                                  : row.title}
                              </span>
                            </button>
                          ) : (
                            <span className="inline-flex min-h-8 items-center text-xs text-ink-muted">
                              Locked
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => setDocumentOpen(true)}
                            className="inline-flex min-h-8 items-center justify-center whitespace-nowrap rounded-[5px] border border-rule bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-subtle"
                          >
                            <span>View document</span>
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

      {/* Weekly Reflection Section — completed once for the whole week */}
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
              Learning and Reflection — {weekRangeLabel}
            </h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              Complete once for the entire reporting week. These reflections
              appear on your Weekly Accomplishment Report.
            </p>
          </div>
          {isWeekReflectionLocked ? (
            <span className="inline-flex items-center rounded-[5px] border border-success-border/45 bg-success-tint px-2.5 py-1 text-xs font-medium text-success">
              Locked — Weekly report approved
            </span>
          ) : null}
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
              rows={3}
              disabled={loadingList || isWeekReflectionLocked}
              placeholder="Technical or workplace skills developed during this reporting week."
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
              rows={3}
              disabled={loadingList || isWeekReflectionLocked}
              placeholder="Problems, blockers, or difficulties experienced this week."
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
            rows={3}
            disabled={loadingList || isWeekReflectionLocked}
            placeholder="Key takeaways from this week and planned next steps."
            value={activeLessons}
            onChange={(event) =>
              updateReflectionField('lessons', event.target.value)
            }
          />

          {!isWeekReflectionLocked ? (
            <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-rule pt-4">
              <button
                type="submit"
                disabled={loadingList || savingReflection}
                className="inline-flex min-h-10 items-center justify-center rounded-[5px] bg-accent-solid px-4 text-sm font-medium text-on-accent hover:bg-accent-solid-hover disabled:cursor-not-allowed disabled:opacity-65"
              >
                {savingReflection
                  ? 'Saving reflection…'
                  : 'Save weekly reflection'}
              </button>
            </div>
          ) : null}
        </form>
      </section>

      <SubmissionDialog
        open={dialogOpen}
        title={
          editingRow ? 'Edit daily accomplishment' : 'Add daily accomplishment'
        }
        description={
          hasReviewerFeedbackStatus(editingRow?.status)
            ? 'Saving changes resets this daily entry to Pending for supervisor re-review.'
            : 'Record one daily row (Monday to Saturday) with the activity performed and its output or result.'
        }
        onClose={handleCloseDialog}
      >
        <div className={formError ? 'mb-4' : ''}>
          <AlertMessage message={formError} variant="error" />
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[12rem_1fr]">
            <FormField
              id="accomplishment-entry-date"
              name="entry_date"
              label="Activity date"
              type="date"
              required
              validationMessage="Choose the date (Monday to Saturday) the activity was performed."
              value={formDate}
              onChange={(event) => {
                setFormDate(event.target.value)
                if (formError) setFormError('')
              }}
            />
            <div className="flex min-h-11 flex-col justify-center rounded-[5px] border border-rule bg-surface-subtle px-3.5 py-2">
              <span className="text-xs text-ink-muted">
                Reporting period (Mon – Sat)
              </span>
              <span className="text-xs font-medium tabular-nums text-ink">
                {formWeekRangeLabel || 'Select a date'}
              </span>
            </div>
          </div>

          <FormField
            inputRef={activityInputRef}
            id="accomplishment-description"
            name="description"
            label="Activities Performed"
            multiline
            rows={4}
            required
            placeholder="Describe the activity or task you performed on this day."
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
            rows={3}
            required={!editingRow || Boolean(editingRow.entry_date)}
            placeholder="Describe the concrete deliverable, completed output, or result."
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
              Supporting attachment (optional)
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

            <div className="flex flex-wrap items-center gap-2.5">
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
                ? 'Saving…'
                : editingRow
                  ? 'Save changes'
                  : 'Add daily entry'}
            </button>
          </div>
        </form>
      </SubmissionDialog>

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
