import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertMessage } from '../../components/AlertMessage'
import { FormField } from '../../components/FormField'
import { EditIcon, NavIcon, PlusIcon } from '../../components/Icons'
import { ReturnedRemarks } from '../../components/ReturnedRemarks'
import { StatusBadge } from '../../components/StatusBadge'
import { SubmissionDialog } from '../../components/SubmissionDialog'
import { useAuth } from '../../context/useAuth'
import {
  getReviewResetPayload,
  isEditableSubmissionStatus,
} from '../../lib/submissionHelpers'
import { supabase } from '../../lib/supabaseClient'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useFormValidationSync } from '../../lib/useFormValidationSync'
import { formatCalendarDate, getTodayIsoDate } from '../../lib/weekUtils'

const EMPTY_LIST_STATE = {
  loadedKey: '',
  items: [],
  error: '',
}

function clearFormValidationClasses(form) {
  if (!form) return
  for (const field of form.querySelectorAll('.form-control')) {
    field.classList.remove('user-invalid-fallback')
    field.setAttribute('aria-invalid', 'false')
    field.closest('.field-group')?.classList.remove('has-error-fallback')
  }
}

export function TasksPage() {
  useDocumentTitle('Tasks')

  const { profile } = useAuth()
  const internId = profile?.id

  const [listState, setListState] = useState(EMPTY_LIST_STATE)
  const [reloadCounter, setReloadCounter] = useState(0)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRow, setEditingRow] = useState(null)
  const [taskDate, setTaskDate] = useState(() => getTodayIsoDate())
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [pageSuccess, setPageSuccess] = useState('')

  const formRef = useRef(null)
  const titleInputRef = useRef(null)

  useFormValidationSync(formRef)

  const currentQueryKey = internId ? `${internId}:${reloadCounter}` : ''

  useEffect(() => {
    if (!supabase || !currentQueryKey) return undefined

    let active = true

    supabase
      .from('tasks')
      .select(
        'id, intern_id, title, description, task_date, status, reviewed_by, reviewer_remarks, reviewed_at, created_at',
      )
      .eq('intern_id', internId)
      .order('task_date', { ascending: false })
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
  }, [currentQueryKey, internId])

  const loadingList = Boolean(
    supabase && currentQueryKey && listState.loadedKey !== currentQueryKey,
  )
  const items = listState.loadedKey === currentQueryKey ? listState.items : []
  const listError = listState.loadedKey === currentQueryKey ? listState.error : ''

  const statusCounts = items.reduce(
    (counts, row) => {
      if (row.status === 'approved') counts.approved += 1
      else if (row.status === 'returned') counts.returned += 1
      else counts.pending += 1
      return counts
    },
    { pending: 0, returned: 0, approved: 0 },
  )

  function resetForm() {
    setEditingRow(null)
    setTaskDate(getTodayIsoDate())
    setTitle('')
    setDescription('')
    setFormError('')
    clearFormValidationClasses(formRef.current)
  }

  function openCreateDialog() {
    resetForm()
    setDialogOpen(true)
    window.requestAnimationFrame(() => titleInputRef.current?.focus())
  }

  function openEditDialog(row) {
    if (!isEditableSubmissionStatus(row.status)) return
    setEditingRow(row)
    setTaskDate(row.task_date)
    setTitle(row.title ?? '')
    setDescription(row.description ?? '')
    setFormError('')
    clearFormValidationClasses(formRef.current)
    setDialogOpen(true)
    window.requestAnimationFrame(() => titleInputRef.current?.focus())
  }

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false)
    setFormError('')
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()

    if (!supabase || !internId) {
      setFormError('Unable to verify your intern profile session.')
      return
    }

    const trimmedTitle = title.trim()
    const trimmedDescription = description.trim()
    if (!trimmedTitle) {
      setFormError('Please enter a task title.')
      titleInputRef.current?.focus()
      return
    }

    if (!taskDate) {
      setFormError('Please select the task date.')
      return
    }

    if (editingRow && !isEditableSubmissionStatus(editingRow.status)) {
      setFormError('Approved tasks cannot be edited.')
      return
    }

    setSaving(true)
    setFormError('')
    setPageSuccess('')

    if (editingRow) {
      const wasReturned = editingRow.status === 'returned'
      const { error: updateError } = await supabase
        .from('tasks')
        .update({
          task_date: taskDate,
          title: trimmedTitle,
          description: trimmedDescription || null,
          ...getReviewResetPayload(editingRow.status),
        })
        .eq('id', editingRow.id)
        .eq('intern_id', internId)
        .in('status', ['pending', 'returned'])

      if (updateError) {
        setFormError(`Could not update task: ${updateError.message}`)
        setSaving(false)
        return
      }

      setPageSuccess(
        wasReturned ? 'Task updated and resubmitted as pending.' : 'Task updated.',
      )
    } else {
      const { error: insertError } = await supabase.from('tasks').insert({
        intern_id: internId,
        task_date: taskDate,
        title: trimmedTitle,
        description: trimmedDescription || null,
      })

      if (insertError) {
        setFormError(`Could not save task: ${insertError.message}`)
        setSaving(false)
        return
      }

      setPageSuccess('Task added.')
    }

    resetForm()
    setSaving(false)
    setDialogOpen(false)
    setReloadCounter((count) => count + 1)
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
            Tasks
          </h1>
          <p className="mt-1.5 max-w-[60ch] text-sm leading-[1.55] text-ink-muted">
            Log daily assigned tasks and track supervisor review status.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateDialog}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[5px] bg-accent-solid px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-solid-hover"
        >
          <PlusIcon className="size-4" />
          <span>Add task</span>
        </button>
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
              Submitted tasks
            </h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              Ordered by task date, newest first.
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
              <span aria-hidden="true" className="h-3 w-px bg-rule" />
              <span>{statusCounts.approved} approved</span>
            </div>
          ) : null}
        </div>

        {loadingList ? (
          <div className="flex items-center gap-3 px-5 py-12 text-sm text-ink-muted">
            <progress aria-label="Loading tasks" className="loading-spinner" />
            <span>Loading tasks…</span>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-start gap-4 px-5 py-12 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3.5">
              <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-[5px] border border-rule bg-surface-subtle text-ink-muted">
                <NavIcon name="tasks" className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">
                  No tasks logged yet
                </p>
                <p className="mt-1 text-sm text-ink-muted">
                  Record your first daily internship task for supervisor review.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={openCreateDialog}
              className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-[5px] border border-rule bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-subtle"
            >
              <PlusIcon className="size-4" />
              <span>Add task</span>
            </button>
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
                Submitted internship tasks ordered by newest date first
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="w-40">
                    Task date
                  </th>
                  <th scope="col">Task</th>
                  <th scope="col" className="w-36">
                    Status
                  </th>
                  <th scope="col" className="col-action w-28">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const editable = isEditableSubmissionStatus(row.status)

                  return (
                    <tr key={row.id}>
                      <td data-label="Task date" className="whitespace-nowrap">
                        <time
                          dateTime={row.task_date}
                          className="text-sm font-medium tabular-nums text-ink"
                        >
                          {formatCalendarDate(row.task_date)}
                        </time>
                      </td>

                      <td data-label="Task">
                        <div className="min-w-0">
                          <p className="font-medium text-ink">{row.title}</p>
                          {row.description ? (
                            <p className="mt-1 max-w-[60ch] whitespace-pre-line text-sm text-ink-muted break-words">
                              {row.description}
                            </p>
                          ) : null}
                          {row.status === 'returned' ? (
                            <ReturnedRemarks remarks={row.reviewer_remarks} />
                          ) : null}
                        </div>
                      </td>

                      <td data-label="Status">
                        <StatusBadge status={row.status} />
                      </td>

                      <td data-label="Action" className="col-action">
                        {editable ? (
                          <button
                            type="button"
                            onClick={() => openEditDialog(row)}
                            className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[5px] border border-rule bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-subtle"
                          >
                            <EditIcon className="size-3.5" />
                            <span>Edit</span>
                            <span className="visually-hidden">
                              {' '}
                              {row.title}
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
        title={editingRow ? 'Edit task' : 'Add task'}
        description={
          editingRow?.status === 'returned'
            ? 'Saving changes resets this task to Pending for supervisor re-review.'
            : 'Record the task date, title, and details for supervisor verification.'
        }
        onClose={handleCloseDialog}
      >
        <div className={formError ? 'mb-4' : ''}>
          <AlertMessage message={formError} variant="error" />
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <FormField
            inputRef={titleInputRef}
            id="task-title"
            name="title"
            label="Title"
            type="text"
            autoFocus
            required
            maxLength={200}
            placeholder="e.g. Draft onboarding documentation"
            validationMessage="Enter a title for this task."
            value={title}
            onChange={(event) => {
              setTitle(event.target.value)
              if (formError) setFormError('')
            }}
          />

          <FormField
            id="task-date"
            name="task_date"
            label="Task date"
            type="date"
            required
            validationMessage="Choose the date for this task."
            value={taskDate}
            onChange={(event) => {
              setTaskDate(event.target.value)
              if (formError) setFormError('')
            }}
          />

          <FormField
            id="task-description"
            name="description"
            label="Description"
            multiline
            rows={3}
            placeholder="Describe the work performed or key task details."
            value={description}
            onChange={(event) => {
              setDescription(event.target.value)
              if (formError) setFormError('')
            }}
          />

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
              {saving ? 'Saving…' : editingRow ? 'Save changes' : 'Add task'}
            </button>
          </div>
        </form>
      </SubmissionDialog>
    </div>
  )
}
