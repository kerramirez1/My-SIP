import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertMessage } from '../../components/AlertMessage'
import { FormField } from '../../components/FormField'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  EditIcon,
  NavIcon,
  PlusIcon,
} from '../../components/Icons'
import { ReturnedRemarks } from '../../components/ReturnedRemarks'
import { StatusBadge } from '../../components/StatusBadge'
import { SubmissionDialog } from '../../components/SubmissionDialog'
import { useAuth } from '../../context/useAuth'
import {
  DEFAULT_BREAK_MINUTES,
  computeElapsedMinutes,
  formatDecimalHours,
  formatDurationMinutes,
  formatWallClockTime,
  toTimeInputValue,
} from '../../lib/attendanceUtils'
import {
  getReviewResetPayload,
  hasReviewerFeedbackStatus,
  isEditableSubmissionStatus,
} from '../../lib/submissionHelpers'
import { supabase } from '../../lib/supabaseClient'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useFormValidationSync } from '../../lib/useFormValidationSync'
import {
  formatCalendarDate,
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

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

function getWeekdayLabel(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate ?? '').trim())
  if (!match) return ''
  if (typeof globalThis.Temporal?.PlainDate?.from === 'function') {
    try {
      const plain = globalThis.Temporal.PlainDate.from(isoDate)
      return WEEKDAY_NAMES[plain.dayOfWeek % 7] ?? ''
    } catch {
      return ''
    }
  }
  const utc = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  )
  return WEEKDAY_NAMES[utc.getUTCDay()] ?? ''
}

function clearFormValidationClasses(form) {
  if (!form) return
  for (const field of form.querySelectorAll('.form-control')) {
    field.classList.remove('user-invalid-fallback')
    field.setAttribute('aria-invalid', 'false')
    field.closest('.field-group')?.classList.remove('has-error-fallback')
  }
}

export function WeeklyAttendancePage() {
  useDocumentTitle('Weekly Attendance')

  const { profile } = useAuth()
  const internId = profile?.id

  const initialToday = getTodayIsoDate()
  const [filterDate, setFilterDate] = useState(initialToday)
  const selectedWeekOf =
    getMondayOfWeek(filterDate) || getMondayOfWeek(initialToday)

  const [listState, setListState] = useState(EMPTY_LIST_STATE)
  const [reloadCounter, setReloadCounter] = useState(0)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRow, setEditingRow] = useState(null)
  const [attendanceDate, setAttendanceDate] = useState(initialToday)
  const [timeIn, setTimeIn] = useState('08:00')
  const [timeOut, setTimeOut] = useState('17:00')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [pageSuccess, setPageSuccess] = useState('')

  const formRef = useRef(null)
  const dateInputRef = useRef(null)
  const timeOutInputRef = useRef(null)

  useFormValidationSync(formRef)

  const formWeekOf = getMondayOfWeek(attendanceDate)
  const activeBreakMinutes = editingRow?.break_minutes ?? DEFAULT_BREAK_MINUTES
  const rawPreviewMinutes = computeElapsedMinutes(timeIn, timeOut, 0)
  const previewMinutes = computeElapsedMinutes(
    timeIn,
    timeOut,
    activeBreakMinutes,
  )
  const isTimeRangeInvalid =
    Boolean(timeIn && timeOut) &&
    rawPreviewMinutes !== null &&
    rawPreviewMinutes < 0

  const currentQueryKey =
    internId && selectedWeekOf
      ? `${internId}:${selectedWeekOf}:${reloadCounter}`
      : ''

  useEffect(() => {
    if (!supabase || !currentQueryKey) return undefined

    let active = true

    supabase
      .from('weekly_attendance')
      .select(
        'id, intern_id, attendance_date, time_in, time_out, break_minutes, week_of, status, reviewed_by, reviewer_remarks, reviewed_at, created_at',
      )
      .eq('intern_id', internId)
      .eq('week_of', selectedWeekOf)
      .order('attendance_date', { ascending: true })
      .order('created_at', { ascending: true })
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

  const loadingList = Boolean(
    supabase && currentQueryKey && listState.loadedKey !== currentQueryKey,
  )
  const items = listState.loadedKey === currentQueryKey ? listState.items : []
  const listError = listState.loadedKey === currentQueryKey ? listState.error : ''

  const summary = items.reduce(
    (acc, row) => {
      const elapsed = computeElapsedMinutes(
        row.time_in,
        row.time_out,
        row.break_minutes ?? DEFAULT_BREAK_MINUTES,
      )
      if (elapsed !== null && elapsed > 0) {
        acc.totalMinutes += elapsed
      }
      if (row.status === 'approved') acc.approved += 1
      else if (row.status === 'rejected') acc.rejected += 1
      else if (row.status === 'returned') acc.returned += 1
      else acc.pending += 1
      return acc
    },
    { totalMinutes: 0, pending: 0, returned: 0, rejected: 0, approved: 0 },
  )

  function resetForm(targetDate = filterDate) {
    setEditingRow(null)
    setAttendanceDate(targetDate)
    setTimeIn('08:00')
    setTimeOut('17:00')
    setFormError('')
    clearFormValidationClasses(formRef.current)
  }

  function openCreateDialog() {
    resetForm(filterDate || getTodayIsoDate())
    setDialogOpen(true)
    window.requestAnimationFrame(() => dateInputRef.current?.focus())
  }

  function openEditDialog(row) {
    if (!isEditableSubmissionStatus(row.status)) return
    setEditingRow(row)
    setAttendanceDate(row.attendance_date)
    setTimeIn(toTimeInputValue(row.time_in))
    setTimeOut(toTimeInputValue(row.time_out))
    setFormError('')
    clearFormValidationClasses(formRef.current)
    setDialogOpen(true)
    window.requestAnimationFrame(() => dateInputRef.current?.focus())
  }

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false)
    setFormError('')
  }, [])

  function handleWeekShift(deltaDays) {
    const baseMonday = selectedWeekOf || getMondayOfWeek(getTodayIsoDate())
    setPageSuccess('')
    setFilterDate(shiftIsoDate(baseMonday, deltaDays))
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (!supabase || !internId) {
      setFormError('Unable to verify your intern profile session.')
      return
    }

    if (!attendanceDate || !formWeekOf) {
      setFormError('Please select a valid attendance date.')
      dateInputRef.current?.focus()
      return
    }

    if (!timeIn || !timeOut) {
      setFormError('Please enter both time in and time out.')
      return
    }

    const elapsedMinutes = computeElapsedMinutes(timeIn, timeOut, 0)
    if (elapsedMinutes === null) {
      setFormError('Please enter valid wall-clock times for time in and time out.')
      return
    }

    if (elapsedMinutes < 0) {
      setFormError('Time out cannot be earlier than time in.')
      timeOutInputRef.current?.focus()
      return
    }

    if (editingRow && !isEditableSubmissionStatus(editingRow.status)) {
      setFormError('Approved attendance entries cannot be edited.')
      return
    }

    setSaving(true)
    setFormError('')
    setPageSuccess('')

    if (editingRow) {
      const wasReviewedBack = hasReviewerFeedbackStatus(editingRow.status)
      const { error: updateError } = await supabase
        .from('weekly_attendance')
        .update({
          attendance_date: attendanceDate,
          time_in: timeIn,
          time_out: timeOut,
          week_of: formWeekOf,
          ...getReviewResetPayload(editingRow.status),
        })
        .eq('id', editingRow.id)
        .eq('intern_id', internId)
        .in('status', ['pending', 'returned', 'rejected'])

      if (updateError) {
        setFormError(
          updateError.code === '23505'
            ? 'An attendance entry already exists for this date.'
            : `Could not update attendance entry: ${updateError.message}`,
        )
        setSaving(false)
        return
      }

      setPageSuccess(
        wasReviewedBack
          ? 'Attendance entry updated and resubmitted as pending.'
          : 'Attendance entry updated.',
      )
    } else {
      const { error: insertError } = await supabase
        .from('weekly_attendance')
        .insert({
          intern_id: internId,
          attendance_date: attendanceDate,
          time_in: timeIn,
          time_out: timeOut,
          week_of: formWeekOf,
          status: 'pending',
        })

      if (insertError) {
        setFormError(
          insertError.code === '23505'
            ? 'An attendance entry already exists for this date. Edit the existing entry instead.'
            : `Could not save attendance entry: ${insertError.message}`,
        )
        setSaving(false)
        return
      }

      setPageSuccess('Attendance entry added.')
    }

    const savedWeekOf = formWeekOf
    resetForm(savedWeekOf)
    setSaving(false)
    setDialogOpen(false)

    if (savedWeekOf !== selectedWeekOf) {
      setFilterDate(savedWeekOf)
    } else {
      setReloadCounter((count) => count + 1)
    }
  }

  const weekSpanLabel = formatWeekRange(selectedWeekOf, 5)

  return (
    <div className="max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1
            id="main-content"
            tabIndex={-1}
            className="ledger-title text-[clamp(1.5rem,1.25rem+0.75vw,1.875rem)] font-semibold leading-[1.2] tracking-[-0.02em] text-ink outline-none"
          >
            Weekly Attendance
          </h1>
          <p className="mt-1.5 max-w-[60ch] text-sm leading-[1.55] text-ink-muted">
            Log daily time in and time out for the Monday–Saturday work week and
            track rendered internship hours.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreateDialog}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[5px] bg-accent-solid px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-solid-hover"
        >
          <PlusIcon className="size-4" />
          <span>Add entry</span>
        </button>
      </header>

      <div className={pageSuccess || listError ? 'space-y-3' : ''}>
        <AlertMessage message={pageSuccess} variant="success" />
        <AlertMessage message={listError} variant="error" />
      </div>

      <section
        aria-labelledby="attendance-list-heading"
        className="overflow-hidden rounded-[6px] border border-rule bg-surface"
      >
        <div className="flex flex-col gap-4 border-b border-rule bg-surface-subtle px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2
                id="attendance-list-heading"
                className="text-base font-semibold tabular-nums text-ink"
              >
                {weekSpanLabel}
              </h2>
              <span className="text-xs tabular-nums text-ink-muted">
                Monday–Saturday (week of {selectedWeekOf})
              </span>
            </div>
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

            <label
              htmlFor="attendance-week-selector"
              className="visually-hidden"
            >
              Select date within week
            </label>
            <input
              id="attendance-week-selector"
              type="date"
              value={filterDate}
              onChange={(event) => {
                if (event.target.value) {
                  setPageSuccess('')
                  setFilterDate(event.target.value)
                }
              }}
              className="form-control min-h-9 rounded-[5px] border border-input-border bg-surface px-2.5 py-1.5 text-xs tabular-nums text-ink"
            />
          </div>
        </div>

        <dl
          aria-label="Weekly summary"
          className="grid grid-cols-1 divide-y divide-rule border-b border-rule bg-surface sm:grid-cols-2 sm:divide-x sm:divide-y-0"
        >
          <div className="px-5 py-3.5">
            <dt className="text-xs font-medium text-ink-muted">
              Total entries
            </dt>
            <dd className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-base font-semibold tabular-nums text-ink">
                {loadingList
                  ? '—'
                  : `${items.length} ${items.length === 1 ? 'entry' : 'entries'}`}
              </span>
              {!loadingList && items.length > 0 ? (
                <span className="text-xs tabular-nums text-ink-muted">
                  {summary.pending} pending, {summary.returned} returned
                  {summary.rejected > 0 ? `, ${summary.rejected} rejected` : ''}
                  , {summary.approved} approved
                </span>
              ) : null}
            </dd>
          </div>

          <div className="px-5 py-3.5">
            <dt className="text-xs font-medium text-ink-muted">
              Total hours rendered
            </dt>
            <dd className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
              <span className="text-base font-semibold tabular-nums text-ink">
                {loadingList ? '—' : formatDurationMinutes(summary.totalMinutes)}
              </span>
              {!loadingList ? (
                <span className="text-xs tabular-nums text-ink-muted">
                  ({formatDecimalHours(summary.totalMinutes)})
                </span>
              ) : null}
            </dd>
          </div>
        </dl>

        {loadingList ? (
          <div className="flex items-center gap-3 px-5 py-12 text-sm text-ink-muted">
            <progress
              aria-label="Loading weekly attendance"
              className="loading-spinner"
            />
            <span>Loading attendance entries…</span>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-start gap-4 px-5 py-12 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3.5">
              <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-[5px] border border-rule bg-surface-subtle text-ink-muted">
                <NavIcon name="attendance" className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">
                  No attendance logged for this week
                </p>
                <p className="mt-1 text-sm text-ink-muted">
                  Add your daily time in and time out for {weekSpanLabel}.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={openCreateDialog}
              className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-[5px] border border-rule bg-surface px-3.5 text-sm font-medium text-ink hover:bg-surface-subtle"
            >
              <PlusIcon className="size-4" />
              <span>Add entry</span>
            </button>
          </div>
        ) : (
          <div
            tabIndex={0}
            role="region"
            aria-labelledby="attendance-list-heading"
            className="table-wrapper"
          >
            <table className="submission-table">
              <caption className="visually-hidden">
                Weekly attendance entries for {weekSpanLabel}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="w-44">
                    Date
                  </th>
                  <th scope="col" className="w-32">
                    Time In
                  </th>
                  <th scope="col" className="w-32">
                    Time Out
                  </th>
                  <th scope="col" className="w-36">
                    Hours
                  </th>
                  <th scope="col">Status</th>
                  <th scope="col" className="col-action w-28">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => {
                  const editable = isEditableSubmissionStatus(row.status)
                  const elapsed = computeElapsedMinutes(
                    row.time_in,
                    row.time_out,
                    row.break_minutes ?? DEFAULT_BREAK_MINUTES,
                  )
                  const weekday = getWeekdayLabel(row.attendance_date)

                  return (
                    <tr key={row.id}>
                      <td data-label="Date" className="whitespace-nowrap">
                        <div className="flex flex-col">
                          <time
                            dateTime={row.attendance_date}
                            className="text-sm font-medium tabular-nums text-ink"
                          >
                            {formatCalendarDate(row.attendance_date)}
                          </time>
                          {weekday ? (
                            <span className="mt-0.5 text-xs text-ink-muted">
                              {weekday}
                            </span>
                          ) : null}
                        </div>
                      </td>

                      <td
                        data-label="Time In"
                        className="whitespace-nowrap text-sm tabular-nums text-ink"
                      >
                        {formatWallClockTime(row.time_in)}
                      </td>

                      <td
                        data-label="Time Out"
                        className="whitespace-nowrap text-sm tabular-nums text-ink"
                      >
                        {formatWallClockTime(row.time_out)}
                      </td>

                      <td data-label="Hours" className="whitespace-nowrap">
                        {elapsed !== null && elapsed >= 0 ? (
                          <div className="flex flex-col">
                            <span className="text-sm font-medium tabular-nums text-ink">
                              {formatDurationMinutes(elapsed)}
                            </span>
                            <span className="mt-0.5 text-xs tabular-nums text-ink-muted">
                              {formatDecimalHours(elapsed)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-ink-muted">—</span>
                        )}
                      </td>

                      <td data-label="Status">
                        <div className="min-w-0">
                          <StatusBadge status={row.status} />
                          {hasReviewerFeedbackStatus(row.status) ? (
                            <ReturnedRemarks
                              remarks={row.reviewer_remarks}
                              status={row.status}
                            />
                          ) : null}
                        </div>
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
                              attendance for{' '}
                              {formatCalendarDate(row.attendance_date)}
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
        title={editingRow ? 'Edit entry' : 'Add entry'}
        description={
          hasReviewerFeedbackStatus(editingRow?.status)
            ? 'Saving changes resets this entry to Pending for supervisor re-review.'
            : 'Entries are grouped automatically under the Monday of the selected date.'
        }
        onClose={handleCloseDialog}
      >
        <div className={formError ? 'mb-4' : ''}>
          <AlertMessage message={formError} variant="error" />
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[11.5rem_1fr]">
            <FormField
              inputRef={dateInputRef}
              id="attendance-date"
              name="attendance_date"
              label="Date"
              type="date"
              autoFocus
              required
              validationMessage="Select an attendance date."
              value={attendanceDate}
              onChange={(event) => {
                setAttendanceDate(event.target.value)
                if (formError) setFormError('')
              }}
            />

            <div className="flex min-h-11 flex-col justify-center rounded-[5px] border border-rule bg-surface-subtle px-3.5 py-2">
              <span className="text-xs text-ink-muted">Assigned week</span>
              <span className="text-xs font-medium tabular-nums text-ink">
                {formWeekOf
                  ? `${formatWeekRange(formWeekOf, 5)} (${formWeekOf})`
                  : 'Select a date'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              id="attendance-time-in"
              name="time_in"
              label="Time in"
              type="time"
              required
              validationMessage="Enter your time in."
              value={timeIn}
              onChange={(event) => {
                setTimeIn(event.target.value)
                if (formError) setFormError('')
              }}
            />

            <FormField
              inputRef={timeOutInputRef}
              id="attendance-time-out"
              name="time_out"
              label="Time out"
              type="time"
              min={timeIn || undefined}
              required
              validationMessage={
                isTimeRangeInvalid
                  ? 'Time out cannot be earlier than time in.'
                  : 'Enter your time out.'
              }
              value={timeOut}
              onChange={(event) => {
                setTimeOut(event.target.value)
                if (formError) setFormError('')
              }}
            />
          </div>

          <div className="flex items-center justify-between rounded-[5px] border border-rule bg-surface-subtle px-3.5 py-2.5 text-xs">
            <span className="font-medium text-ink-muted">
              Rendered hours ({activeBreakMinutes} min break deducted)
            </span>
            {isTimeRangeInvalid ? (
              <span className="font-medium text-error">
                Time out cannot be earlier than time in
              </span>
            ) : previewMinutes !== null ? (
              <span className="font-semibold tabular-nums text-ink">
                {formatDurationMinutes(previewMinutes)} (
                {formatDecimalHours(previewMinutes)})
              </span>
            ) : (
              <span className="text-ink-muted">Enter time in and time out</span>
            )}
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
                  : 'Add entry'}
            </button>
          </div>
        </form>
      </SubmissionDialog>
    </div>
  )
}
