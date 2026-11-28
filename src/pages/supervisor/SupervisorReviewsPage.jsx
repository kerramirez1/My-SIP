import { useCallback, useMemo, useState } from 'react'
import { AlertMessage } from '../../components/AlertMessage'
import { NavIcon, PlusIcon } from '../../components/Icons'
import { StatusBadge } from '../../components/StatusBadge'
import { useAuth } from '../../context/useAuth'
import {
  formatDecimalHours,
  formatDurationMinutes,
  formatWallClockTime,
} from '../../lib/attendanceUtils'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import {
  extractIsoDatePart,
  formatBreakText,
  useSupervisorData,
} from '../../lib/useSupervisorData'
import {
  formatCalendarDate,
  formatWeekRange,
  formatWeekdayCalendarDate,
} from '../../lib/weekUtils'
import {
  InternDailyActivityUpdatesPanel,
  SupervisorWeeklyReportNotifications,
} from './SupervisorDailyUpdatesSection'
import {
  AssignTaskDialog,
  PriorityBadge,
  ReviewDialog,
} from './SupervisorDialogs'

function collapseWhitespace(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatAccomplishmentPreview(row) {
  const dateLabel = row.entry_date
    ? formatWeekdayCalendarDate(row.entry_date)
    : ''
  const title =
    dateLabel || collapseWhitespace(row.title) || 'Weekly Accomplishment'
  const summary = collapseWhitespace(row.description)
  return {
    title,
    summary,
    fullText: summary ? `${title} — ${summary}` : title,
  }
}

export function SupervisorReviewsPage() {
  useDocumentTitle('Pending Reviews')

  const { profile } = useAuth()
  const supervisorId = profile?.id
  const {
    loading,
    loadError: dataError,
    interns,
    internById,
    pendingItems,
    pendingCounts,
    dailyActivityUpdates,
    submittedWeeklyReports,
    reload,
  } = useSupervisorData(supervisorId)

  const [queueFilter, setQueueFilter] = useState('all')
  const [pageSuccess, setPageSuccess] = useState('')
  const [attachmentError, setAttachmentError] = useState('')
  const [reviewItem, setReviewItem] = useState(null)
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)

  const loadError = attachmentError || dataError

  const filteredPendingItems = useMemo(() => {
    if (queueFilter === 'all') return pendingItems
    return pendingItems.filter((item) => item.type === queueFilter)
  }, [pendingItems, queueFilter])

  const closeReviewDialog = useCallback(() => {
    setReviewItem(null)
  }, [])

  const closeAssignDialog = useCallback(() => {
    setAssignDialogOpen(false)
  }, [])

  const handleReviewed = useCallback(
    (message) => {
      setPageSuccess(message)
      reload()
    },
    [reload],
  )

  const handleAssigned = useCallback(
    (message) => {
      setPageSuccess(message)
      reload()
    },
    [reload],
  )

  const isAccomplishmentsView = queueFilter === 'accomplishments'

  const filterButtons = [
    { key: 'all', label: 'All', count: pendingCounts.all },
    {
      key: 'attendance',
      label: 'Attendance',
      count: pendingCounts.attendance,
    },
    {
      key: 'accomplishments',
      label: 'Accomplishments',
      count: pendingCounts.accomplishments,
    },
    { key: 'tasks', label: 'Tasks', count: pendingCounts.tasks },
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
            Pending Reviews
          </h1>
          <p className="mt-1.5 max-w-[62ch] text-sm leading-[1.55] text-ink-muted">
            Submitted attendance, accomplishments, and completed tasks awaiting
            review
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setPageSuccess('')
            setAssignDialogOpen(true)
          }}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[5px] bg-accent-solid px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-solid-hover"
        >
          <PlusIcon className="size-4" />
          <span>Assign a task</span>
        </button>
      </header>

      <div className={pageSuccess || loadError ? 'space-y-3' : ''}>
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
                reload()
              }}
              className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-[5px] border border-rule bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-subtle"
            >
              Retry
            </button>
          </div>
        ) : null}
      </div>

      {loading ? (
        <div className="flex items-center gap-3 rounded-[6px] border border-rule bg-surface px-5 py-14 text-sm text-ink-muted">
          <progress
            aria-label="Loading pending reviews"
            className="loading-spinner"
          />
          <span>Loading assigned interns and pending submissions…</span>
        </div>
      ) : (
        <div className="space-y-6">
          <SupervisorWeeklyReportNotifications
            supervisorId={supervisorId}
            submittedWeeklyReports={submittedWeeklyReports}
            onReviewReport={(report) => {
              setPageSuccess('')
              setQueueFilter('accomplishments')
              if (report.firstPendingItem) {
                setReviewItem(report.firstPendingItem)
              }
            }}
          />

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

          {pendingItems.length === 0 ? (
            <div className="flex items-start gap-3.5 px-5 py-12">
              <span className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-[5px] border border-rule bg-surface-subtle text-ink-muted">
                <NavIcon name="tasks" className="size-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-ink">
                  No pending submissions to review.
                </p>
                <p className="mt-1 text-sm text-ink-muted">
                  New attendance entries, weekly accomplishments, and submitted
                  tasks from your assigned interns will appear here.
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
              <table className="submission-table supervisor-compact-table">
                <caption className="visually-hidden">
                  {isAccomplishmentsView
                    ? 'Pending weekly accomplishment reports awaiting supervisor review'
                    : 'Pending intern submissions awaiting supervisor review'}
                </caption>
                <colgroup>
                  <col className="w-[10.5rem]" />
                  {isAccomplishmentsView ? (
                    <>
                      <col />
                      <col className="w-[10.5rem]" />
                      <col className="w-[8.25rem]" />
                    </>
                  ) : (
                    <>
                      <col className="w-[8rem]" />
                      <col />
                      <col className="w-[8.25rem]" />
                    </>
                  )}
                  <col className="w-[7.25rem]" />
                  <col className="w-[6.25rem]" />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">Intern Name</th>
                    {isAccomplishmentsView ? (
                      <>
                        <th scope="col">Accomplishment Summary</th>
                        <th scope="col">Reporting Period</th>
                        <th scope="col">Submission Date</th>
                      </>
                    ) : (
                      <>
                        <th scope="col">Type</th>
                        <th scope="col">Submission Summary</th>
                        <th scope="col">Submission Date</th>
                      </>
                    )}
                    <th scope="col">Status</th>
                    <th scope="col" className="col-action">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPendingItems.map((item) => {
                    const { row } = item
                    const submissionDateIso = extractIsoDatePart(
                      item.type === 'tasks' || item.type === 'accomplishments'
                        ? row.submitted_at || row.created_at
                        : row.created_at,
                    )
                    const submissionDateLabel = submissionDateIso
                      ? formatCalendarDate(submissionDateIso)
                      : '—'
                    const accomplishmentPreview =
                      item.type === 'accomplishments'
                        ? formatAccomplishmentPreview(row)
                        : null
                    const taskPreview =
                      item.type === 'tasks'
                        ? collapseWhitespace(
                            row.completion_description || row.description,
                          )
                        : ''

                    return (
                      <tr key={item.key}>
                        <td
                          data-label="Intern Name"
                          className="text-sm font-medium text-ink"
                        >
                          <div className="min-w-0">
                            <p
                              className="truncate"
                              title={item.internName}
                            >
                              {item.internName}
                            </p>
                          </div>
                        </td>

                        {isAccomplishmentsView ? (
                          <>
                            <td data-label="Accomplishment Summary">
                              <div className="min-w-0">
                                <p
                                  className="truncate text-sm text-ink"
                                  title={accomplishmentPreview.fullText}
                                >
                                  <span className="font-medium">
                                    {accomplishmentPreview.title}
                                  </span>
                                  {accomplishmentPreview.summary ? (
                                    <span className="text-ink-muted">
                                      {' '}
                                      — {accomplishmentPreview.summary}
                                    </span>
                                  ) : null}
                                </p>
                              </div>
                            </td>

                            <td
                              data-label="Reporting Period"
                              className="whitespace-nowrap text-xs tabular-nums text-ink-muted"
                            >
                              {formatWeekRange(row.week_of, 5)}
                            </td>

                            <td
                              data-label="Submission Date"
                              className="whitespace-nowrap text-xs tabular-nums text-ink-muted"
                            >
                              {submissionDateLabel}
                            </td>
                          </>
                        ) : (
                          <>
                            <td
                              data-label="Type"
                              className="whitespace-nowrap text-xs font-medium text-ink-muted"
                            >
                              {item.typeLabel}
                            </td>

                            <td data-label="Submission Summary">
                              {item.type === 'attendance' ? (
                                <div className="min-w-0 space-y-0.5">
                                  <p
                                    className="truncate text-sm font-medium tabular-nums text-ink"
                                    title={`${formatCalendarDate(row.attendance_date)} — ${formatWallClockTime(row.time_in)} to ${formatWallClockTime(row.time_out)}`}
                                  >
                                    {formatCalendarDate(row.attendance_date)} ·{' '}
                                    {formatWallClockTime(row.time_in)} –{' '}
                                    {formatWallClockTime(row.time_out)}
                                    {item.renderedMinutes !== null
                                      ? ` · ${formatDurationMinutes(item.renderedMinutes)} (${formatDecimalHours(item.renderedMinutes)})`
                                      : ''}
                                  </p>
                                  <p className="truncate text-xs tabular-nums text-ink-muted">
                                    Week of {formatWeekRange(row.week_of, 5)} ·{' '}
                                    {formatBreakText(row.break_minutes)}
                                  </p>
                                </div>
                              ) : item.type === 'accomplishments' ? (
                                <div className="min-w-0 space-y-0.5">
                                  <p
                                    className="truncate text-sm text-ink"
                                    title={accomplishmentPreview.fullText}
                                  >
                                    <span className="font-medium">
                                      {accomplishmentPreview.title}
                                    </span>
                                    {accomplishmentPreview.summary ? (
                                      <span className="text-ink-muted">
                                        {' '}
                                        — {accomplishmentPreview.summary}
                                      </span>
                                    ) : null}
                                  </p>
                                  <p className="truncate text-xs tabular-nums text-ink-muted">
                                    Week of {formatWeekRange(row.week_of, 5)}
                                  </p>
                                </div>
                              ) : (
                                <div className="min-w-0 space-y-0.5">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <p
                                      className="min-w-0 truncate text-sm font-medium text-ink"
                                      title={row.title}
                                    >
                                      {row.title}
                                    </p>
                                    <PriorityBadge priority={row.priority} />
                                  </div>
                                  <p
                                    className="truncate text-xs tabular-nums text-ink-muted"
                                    title={
                                      taskPreview
                                        ? `Deadline ${formatCalendarDate(row.deadline || row.task_date)} — ${taskPreview}`
                                        : `Deadline ${formatCalendarDate(row.deadline || row.task_date)}`
                                    }
                                  >
                                    Deadline{' '}
                                    {formatCalendarDate(
                                      row.deadline || row.task_date,
                                    )}
                                    {taskPreview ? ` — ${taskPreview}` : ''}
                                  </p>
                                </div>
                              )}
                            </td>

                            <td
                              data-label="Submission Date"
                              className="whitespace-nowrap text-xs tabular-nums text-ink-muted"
                            >
                              {submissionDateLabel}
                            </td>
                          </>
                        )}

                        <td data-label="Status">
                          <StatusBadge status={row.status} />
                        </td>

                        <td data-label="Action" className="col-action">
                          <button
                            type="button"
                            onClick={() => {
                              setPageSuccess('')
                              setReviewItem(item)
                            }}
                            className="inline-flex min-h-9 items-center justify-center whitespace-nowrap rounded-[5px] border border-rule bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-subtle"
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

        <InternDailyActivityUpdatesPanel
          dailyActivityUpdates={dailyActivityUpdates}
          onAttachmentError={setAttachmentError}
          headingId="reviews-daily-updates-heading"
        />
      </div>
      )}

      <ReviewDialog
        item={reviewItem}
        intern={
          reviewItem ? (internById.get(reviewItem.row.intern_id) ?? null) : null
        }
        supervisorId={supervisorId}
        supervisorName={profile?.full_name}
        onClose={closeReviewDialog}
        onReviewed={handleReviewed}
        onAttachmentError={setAttachmentError}
      />

      <AssignTaskDialog
        open={assignDialogOpen}
        interns={interns}
        internById={internById}
        supervisorId={supervisorId}
        onClose={closeAssignDialog}
        onAssigned={handleAssigned}
      />
    </div>
  )
}
