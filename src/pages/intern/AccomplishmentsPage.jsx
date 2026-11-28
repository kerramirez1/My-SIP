import { useCallback, useEffect, useRef, useState } from 'react'
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
  getMondayOfWeek,
  getTodayIsoDate,
  shiftIsoDate,
} from '../../lib/weekUtils'

const EMPTY_LIST_STATE = {
  loadedKey: '',
  items: [],
  error: '',
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
  const [documentRow, setDocumentRow] = useState(null)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRow, setEditingRow] = useState(null)
  const [formDate, setFormDate] = useState(initialToday)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [skillsAcquired, setSkillsAcquired] = useState('')
  const [challengesEncountered, setChallengesEncountered] = useState('')
  const [lessonsLearned, setLessonsLearned] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [removeExistingAttachment, setRemoveExistingAttachment] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [pageSuccess, setPageSuccess] = useState('')

  const [openingId, setOpeningId] = useState(null)
  const [attachmentError, setAttachmentError] = useState('')
  const [signedUrlsById, setSignedUrlsById] = useState({})

  const formRef = useRef(null)
  const titleInputRef = useRef(null)
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

    supabase
      .from('accomplishments')
      .select(
        'id, intern_id, week_of, title, description, skills_acquired, challenges_encountered, lessons_learned, attachment_url, status, reviewed_by, reviewer_remarks, reviewed_at, created_at',
      )
      .eq('intern_id', internId)
      .eq('week_of', selectedWeekOf)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!active) return
        setListState({
          loadedKey: currentQueryKey,
          items: error ? [] : (data ?? []),
          error: error ? error.message : '',
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
  const items = listState.loadedKey === currentQueryKey ? listState.items : []
  const listError =
    attachmentError ||
    (listState.loadedKey === currentQueryKey ? listState.error : '')

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

  function resetForm(targetDate = filterDate) {
    setEditingRow(null)
    setFormDate(targetDate)
    setTitle('')
    setDescription('')
    setSkillsAcquired('')
    setChallengesEncountered('')
    setLessonsLearned('')
    setSelectedFile(null)
    setRemoveExistingAttachment(false)
    setFormError('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    clearFormValidationClasses(formRef.current)
  }

  function openCreateDialog() {
    resetForm(selectedWeekOf || filterDate)
    setDialogOpen(true)
    window.requestAnimationFrame(() => titleInputRef.current?.focus())
  }

  function openEditDialog(row) {
    if (!isEditableSubmissionStatus(row.status)) return
    setEditingRow(row)
    setFormDate(row.week_of)
    setTitle(row.title ?? '')
    setDescription(row.description ?? '')
    setSkillsAcquired(row.skills_acquired ?? '')
    setChallengesEncountered(row.challenges_encountered ?? '')
    setLessonsLearned(row.lessons_learned ?? '')
    setSelectedFile(null)
    setRemoveExistingAttachment(false)
    setFormError('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    clearFormValidationClasses(formRef.current)
    setDialogOpen(true)
    window.requestAnimationFrame(() => titleInputRef.current?.focus())
  }

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false)
    setFormError('')
  }, [])

  function handleWeekShift(deltaDays) {
    const baseMonday = selectedWeekOf || getMondayOfWeek(getTodayIsoDate())
    setAttachmentError('')
    setPageSuccess('')
    setFilterDate(shiftIsoDate(baseMonday, deltaDays))
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (!supabase || !internId) {
      setFormError('Unable to verify your intern profile session.')
      return
    }

    const trimmedTitle = title.trim()
    const trimmedDescription = description.trim()
    const trimmedSkills = skillsAcquired.trim()
    const trimmedChallenges = challengesEncountered.trim()
    const trimmedLessons = lessonsLearned.trim()
    if (!trimmedTitle) {
      setFormError('Please enter a title for this accomplishment.')
      titleInputRef.current?.focus()
      return
    }

    if (!formWeekOf) {
      setFormError('Please choose a valid week date.')
      return
    }

    if (editingRow && !isEditableSubmissionStatus(editingRow.status)) {
      setFormError('Approved accomplishments cannot be edited.')
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

    if (editingRow) {
      const wasReviewedBack = hasReviewerFeedbackStatus(editingRow.status)
      const previousAttachmentPath = editingRow.attachment_url
      const { error: updateError } = await supabase
        .from('accomplishments')
        .update({
          week_of: formWeekOf,
          title: trimmedTitle,
          description: trimmedDescription || null,
          skills_acquired: trimmedSkills || null,
          challenges_encountered: trimmedChallenges || null,
          lessons_learned: trimmedLessons || null,
          attachment_url: nextAttachmentPath,
          ...getReviewResetPayload(editingRow.status),
        })
        .eq('id', editingRow.id)
        .eq('intern_id', internId)
        .in('status', ['pending', 'returned', 'rejected'])

      if (updateError) {
        setFormError(`Could not update accomplishment: ${updateError.message}`)
        setSaving(false)
        return
      }

      if (previousAttachmentPath && previousAttachmentPath !== nextAttachmentPath) {
        // Best-effort cleanup of the replaced/removed file: the update
        // already succeeded, so a failed removal must never surface as a
        // failed save.
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
          ? 'Accomplishment updated and resubmitted as pending.'
          : 'Accomplishment updated.',
      )
    } else {
      const { error: insertError } = await supabase
        .from('accomplishments')
        .insert({
          intern_id: internId,
          week_of: formWeekOf,
          title: trimmedTitle,
          description: trimmedDescription || null,
          skills_acquired: trimmedSkills || null,
          challenges_encountered: trimmedChallenges || null,
          lessons_learned: trimmedLessons || null,
          attachment_url: nextAttachmentPath,
        })

      if (insertError) {
        setFormError(`Could not save accomplishment: ${insertError.message}`)
        setSaving(false)
        return
      }

      setPageSuccess('Accomplishment added.')
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
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1
            id="main-content"
            tabIndex={-1}
            className="ledger-title text-[clamp(1.5rem,1.25rem+0.75vw,1.875rem)] font-semibold leading-[1.2] tracking-[-0.02em] text-ink outline-none"
          >
            Accomplishments
          </h1>
          <p className="mt-1.5 max-w-[60ch] text-sm leading-[1.55] text-ink-muted">
            Record weekly internship deliverables and attach supporting files
            for supervisor review.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateDialog}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[5px] bg-accent-solid px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-solid-hover"
        >
          <PlusIcon className="size-4" />
          <span>Add accomplishment</span>
        </button>
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
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2
                id="accomplishments-list-heading"
                className="text-base font-semibold tabular-nums text-ink"
              >
                {formatWeekRange(selectedWeekOf)}
              </h2>
              <span className="text-xs tabular-nums text-ink-muted">
                Week starting {selectedWeekOf}
              </span>
            </div>

            {!loadingList && items.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-ink-muted">
                <span className="font-medium text-ink">
                  {items.length}{' '}
                  {items.length === 1 ? 'submission' : 'submissions'}
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
                  No accomplishments recorded for this week
                </p>
                <p className="mt-1 text-sm text-ink-muted">
                  Add an entry for {formatWeekRange(selectedWeekOf)} to submit
                  it for supervisor review.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={openCreateDialog}
              className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-[5px] border border-rule bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-subtle"
            >
              <PlusIcon className="size-4" />
              <span>Add accomplishment</span>
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
                Accomplishments for the week of {formatWeekRange(selectedWeekOf)}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Accomplishment</th>
                  <th scope="col" className="w-56 whitespace-nowrap">
                    Attachment
                  </th>
                  <th scope="col" className="w-36 whitespace-nowrap">
                    Status
                  </th>
                  <th scope="col" className="col-action w-56 whitespace-nowrap">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const editable = isEditableSubmissionStatus(row.status)
                  const signedUrl = signedUrlsById[row.id]

                  return (
                    <tr key={row.id}>
                      <td
                        data-label="Accomplishment"
                        className="align-middle!"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-ink break-words">
                            {row.title}
                          </p>
                          {hasReviewerFeedbackStatus(row.status) ? (
                            <ReturnedRemarks
                              remarks={row.reviewer_remarks}
                              status={row.status}
                            />
                          ) : null}
                        </div>
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
                                {row.title}
                              </span>
                            </button>
                          ) : (
                            <span className="inline-flex min-h-8 items-center text-xs text-ink-muted">
                              Locked
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => setDocumentRow(row)}
                            className="inline-flex min-h-8 items-center justify-center whitespace-nowrap rounded-[5px] border border-rule bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-subtle"
                          >
                            <span>View document</span>
                            <span className="visually-hidden">
                              {' '}
                              for {row.title}
                            </span>
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

      <SubmissionDialog
        open={dialogOpen}
        title={editingRow ? 'Edit accomplishment' : 'Add accomplishment'}
        description={
          hasReviewerFeedbackStatus(editingRow?.status)
            ? 'Saving changes resets this entry to Pending for supervisor re-review.'
            : 'Entries are grouped by the Monday of the selected week.'
        }
        onClose={handleCloseDialog}
      >
        <div className={formError ? 'mb-4' : ''}>
          <AlertMessage message={formError} variant="error" />
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <FormField
            inputRef={titleInputRef}
            id="accomplishment-title"
            name="title"
            label="Title"
            type="text"
            autoFocus
            required
            maxLength={200}
            placeholder="e.g. Implemented API validation module"
            validationMessage="Enter a title for this accomplishment."
            value={title}
            onChange={(event) => {
              setTitle(event.target.value)
              if (formError) setFormError('')
            }}
          />

          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[11.5rem_1fr]">
            <FormField
              id="accomplishment-week-date"
              name="week_date"
              label="Week date"
              type="date"
              required
              validationMessage="Choose a date within the target week."
              value={formDate}
              onChange={(event) => {
                setFormDate(event.target.value)
                if (formError) setFormError('')
              }}
            />
            <div className="flex min-h-11 flex-col justify-center rounded-[5px] border border-rule bg-surface-subtle px-3.5 py-2">
              <span className="text-xs text-ink-muted">Assigned week</span>
              <span className="text-xs font-medium tabular-nums text-ink">
                {formWeekOf
                  ? `${formatWeekRange(formWeekOf)} (${formWeekOf})`
                  : 'Select a date'}
              </span>
            </div>
          </div>

          <FormField
            id="accomplishment-description"
            name="description"
            label="Activities performed"
            multiline
            rows={3}
            placeholder="List the activities you performed and the work you completed for this week."
            value={description}
            onChange={(event) => {
              setDescription(event.target.value)
              if (formError) setFormError('')
            }}
          />

          <FormField
            id="accomplishment-skills-acquired"
            name="skills_acquired"
            label="Skills acquired"
            multiline
            rows={3}
            placeholder="Skills you learned or improved this week."
            value={skillsAcquired}
            onChange={(event) => {
              setSkillsAcquired(event.target.value)
              if (formError) setFormError('')
            }}
          />

          <FormField
            id="accomplishment-challenges-encountered"
            name="challenges_encountered"
            label="Challenges encountered"
            multiline
            rows={3}
            placeholder="Problems or difficulties you encountered."
            value={challengesEncountered}
            onChange={(event) => {
              setChallengesEncountered(event.target.value)
              if (formError) setFormError('')
            }}
          />

          <FormField
            id="accomplishment-lessons-learned"
            name="lessons_learned"
            label="Lessons learned"
            multiline
            rows={3}
            placeholder="What you learned from the experience."
            value={lessonsLearned}
            onChange={(event) => {
              setLessonsLearned(event.target.value)
              if (formError) setFormError('')
            }}
          />

          <div className="field-group flex flex-col gap-1.5">
            <label
              htmlFor="accomplishment-attachment"
              className="text-sm font-medium leading-[1.4] text-ink"
            >
              Attachment (optional)
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
                  : 'Add accomplishment'}
            </button>
          </div>
        </form>
      </SubmissionDialog>

      <AccomplishmentDocumentDialog
        open={Boolean(documentRow)}
        onClose={() => setDocumentRow(null)}
        row={documentRow}
        internName={profile?.full_name}
        studentIdNo={profile?.student_id_no}
        course={profile?.course}
        schoolName={profile?.school_name}
        companyName={profile?.company_name}
        supervisorName={supervisorName}
      />
    </div>
  )
}
