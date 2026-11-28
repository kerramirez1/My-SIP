import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertMessage } from '../../components/AlertMessage'
import { NavIcon, PlusIcon } from '../../components/Icons'
import { ReturnedRemarks } from '../../components/ReturnedRemarks'
import { StatusBadge } from '../../components/StatusBadge'
import { useAuth } from '../../context/useAuth'
import {
  formatDecimalHours,
  formatDurationMinutes,
} from '../../lib/attendanceUtils'
import {
  buildInternDashboardMetrics,
  getRequiredInternshipHours,
} from '../../lib/internDashboardUtils'
import {
  resolveHostOrganizationName,
  runWithSchemaFallback,
} from '../../lib/schemaCompat'
import { hasReviewerFeedbackStatus } from '../../lib/submissionHelpers'
import { supabase } from '../../lib/supabaseClient'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { formatCalendarDate, getTodayIsoDate } from '../../lib/weekUtils'

const EMPTY_DASHBOARD_STATE = {
  loadedKey: '',
  attendance: [],
  accomplishments: [],
  tasks: [],
  error: '',
}

const DEADLINE_TONE_CLASSES = {
  overdue: 'text-error font-medium',
  today: 'text-accent font-medium',
  upcoming: 'text-ink-muted',
}

function getDayStatusMeta(status) {
  if (status === 'approved') {
    return {
      label: 'Approved',
      dotClass: 'bg-success-border',
      textClass: 'text-success',
    }
  }
  if (status === 'rejected') {
    return {
      label: 'Rejected',
      dotClass: 'bg-rejected-bg',
      textClass: 'text-error',
    }
  }
  if (status === 'returned') {
    return {
      label: 'Returned',
      dotClass: 'bg-error-border',
      textClass: 'text-error',
    }
  }
  return {
    label: 'Pending',
    dotClass: 'bg-ink-muted',
    textClass: 'text-ink-muted',
  }
}

export function InternDashboard() {
  useDocumentTitle('Intern Dashboard')

  const { profile } = useAuth()
  const internId = profile?.id
  const todayIso = getTodayIsoDate()
  const requiredHours = getRequiredInternshipHours(
    profile?.required_hours,
    import.meta.env.VITE_REQUIRED_INTERNSHIP_HOURS,
  )

  const [reloadCounter, setReloadCounter] = useState(0)
  const [dashboardState, setDashboardState] = useState(EMPTY_DASHBOARD_STATE)

  const currentQueryKey = internId ? `${internId}:${reloadCounter}` : ''

  useEffect(() => {
    if (!supabase || !currentQueryKey) return undefined

    let active = true

    Promise.all([
      supabase
        .from('weekly_attendance')
        .select(
          'id, attendance_date, time_in, time_out, break_minutes, week_of, status, reviewer_remarks, reviewed_at, created_at, updated_at',
        )
        .eq('intern_id', internId)
        .order('attendance_date', { ascending: false }),
      runWithSchemaFallback(
        () =>
          supabase
            .from('accomplishments')
            .select(
              'id, week_of, entry_date, title, submitted_at, status, reviewer_remarks, reviewed_at, created_at, updated_at',
            )
            .eq('intern_id', internId)
            .order('created_at', { ascending: false }),
        () =>
          supabase
            .from('accomplishments')
            .select(
              'id, week_of, title, status, reviewer_remarks, reviewed_at, created_at, updated_at',
            )
            .eq('intern_id', internId)
            .order('created_at', { ascending: false }),
      ),
      supabase
        .from('tasks')
        .select(
          'id, title, task_date, deadline, priority, submitted_at, status, reviewer_remarks, reviewed_at, created_at, updated_at',
        )
        .eq('intern_id', internId)
        .order('deadline', { ascending: true, nullsFirst: false }),
    ]).then(([attendanceRes, accomplishmentsRes, tasksRes]) => {
      if (!active) return

      const errors = [
        attendanceRes.error?.message,
        accomplishmentsRes.error?.message,
        tasksRes.error?.message,
      ].filter(Boolean)

      setDashboardState({
        loadedKey: currentQueryKey,
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
  }, [currentQueryKey, internId])

  const loading = Boolean(
    supabase && currentQueryKey && dashboardState.loadedKey !== currentQueryKey,
  )
  const hasLoaded = dashboardState.loadedKey === currentQueryKey
  const loadError = hasLoaded ? dashboardState.error : ''

  const metrics = useMemo(
    () =>
      buildInternDashboardMetrics({
        attendance: hasLoaded ? dashboardState.attendance : [],
        accomplishments: hasLoaded ? dashboardState.accomplishments : [],
        tasks: hasLoaded ? dashboardState.tasks : [],
        todayIso,
        requiredHours,
      }),
    [
      dashboardState.accomplishments,
      dashboardState.attendance,
      dashboardState.tasks,
      hasLoaded,
      requiredHours,
      todayIso,
    ],
  )

  const displayName = profile?.full_name?.trim() || 'Intern'
  const profileDetails = [
    resolveHostOrganizationName(profile),
    profile?.department_office?.trim(),
    profile?.student_id_no?.trim()
      ? `Student ID ${profile.student_id_no.trim()}`
      : '',
  ].filter(Boolean)

  return (
    <div className="max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1
            id="main-content"
            tabIndex={-1}
            className="ledger-title text-[clamp(1.375rem,1.2rem+0.6vw,1.75rem)] font-semibold leading-[1.2] tracking-[-0.02em] text-ink outline-none"
          >
            Welcome back, {displayName}
          </h1>
          <p className="mt-1.5 text-sm leading-[1.55] text-ink-muted">
            {profileDetails.length > 0
              ? `${profileDetails.join(' — ')} — `
              : ''}
            Work week of{' '}
            <span className="font-medium tabular-nums text-ink">
              {metrics.currentWeekLabel}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to="/intern/attendance"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[5px] bg-accent-solid px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-solid-hover"
          >
            <PlusIcon className="size-4" />
            <span>Submit attendance</span>
          </Link>
          <Link
            to="/intern/accomplishments"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[5px] border border-rule bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-subtle"
          >
            <PlusIcon className="size-4" />
            <span>Add accomplishment</span>
          </Link>
        </div>
      </header>

      {loadError ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <AlertMessage
              message={`Could not load all internship records: ${loadError}`}
              variant="error"
            />
          </div>
          <button
            type="button"
            onClick={() => setReloadCounter((count) => count + 1)}
            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-[5px] border border-rule bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-subtle"
          >
            Retry
          </button>
        </div>
      ) : null}

      {loading ? (
        <section
          aria-label="Loading internship overview"
          className="flex items-center gap-3 rounded-[6px] border border-rule bg-surface px-5 py-14 text-sm text-ink-muted"
        >
          <progress
            aria-label="Loading intern dashboard"
            className="loading-spinner"
          />
          <span>Loading your internship progress and submissions…</span>
        </section>
      ) : (
        <>
          <section
            aria-labelledby="internship-progress-label"
            className="overflow-hidden rounded-[6px] border border-rule bg-surface"
          >
            <div className="border-b border-rule px-5 py-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h2
                    id="internship-progress-label"
                    className="text-sm font-semibold text-ink"
                  >
                    Overall internship progress
                  </h2>
                  <p className="mt-1 text-xs tabular-nums text-ink-muted">
                    {formatDecimalHours(metrics.approvedAttendanceMinutes)}{' '}
                    approved of {metrics.requiredHours} hrs required
                    {metrics.pendingAttendanceMinutes > 0
                      ? ` (${formatDurationMinutes(metrics.pendingAttendanceMinutes)} pending review)`
                      : ''}
                  </p>
                </div>

                <span className="text-sm font-semibold tabular-nums text-ink">
                  {metrics.progressPercent.toFixed(1)}%
                </span>
              </div>

              <div className="mt-3.5">
                <progress
                  value={metrics.approvedAttendanceHours}
                  max={metrics.requiredHours}
                  aria-labelledby="internship-progress-label"
                  className={`internship-progress${metrics.isGoalComplete ? ' is-complete' : ''}`}
                />
              </div>
            </div>

            <div className="dashboard-metric-wrap">
              <dl
                aria-label="Key internship metrics"
                className="dashboard-metric-grid bg-surface"
              >
                <div className="dashboard-metric-cell">
                  <dt className="text-xs font-medium text-ink-muted">
                    Approved hours
                  </dt>
                  <dd className="text-lg font-semibold tabular-nums text-ink">
                    {formatDurationMinutes(metrics.approvedAttendanceMinutes)}
                  </dd>
                  <dd className="text-xs tabular-nums text-ink-muted">
                    {metrics.approvedAttendanceCount > 0
                      ? `${formatDecimalHours(metrics.approvedAttendanceMinutes)} from ${metrics.approvedAttendanceCount} approved ${metrics.approvedAttendanceCount === 1 ? 'entry' : 'entries'}`
                      : 'No approved attendance yet'}
                  </dd>
                </div>

                <div className="dashboard-metric-cell">
                  <dt className="text-xs font-medium text-ink-muted">
                    Remaining required hours
                  </dt>
                  <dd className="text-lg font-semibold tabular-nums text-ink">
                    {formatDurationMinutes(metrics.remainingMinutes)}
                  </dd>
                  <dd className="text-xs tabular-nums text-ink-muted">
                    {metrics.isGoalComplete
                      ? 'Required hour target met'
                      : `${formatDecimalHours(metrics.remainingMinutes)} of ${metrics.requiredHours} hr target`}
                  </dd>
                </div>

                <div className="dashboard-metric-cell">
                  <dt className="text-xs font-medium text-ink-muted">
                    Pending submissions
                  </dt>
                  <dd className="text-lg font-semibold tabular-nums text-ink">
                    {metrics.pendingSubmissionsCount}
                  </dd>
                  <dd className="text-xs tabular-nums text-ink-muted">
                    {metrics.needsRevisionCount > 0
                      ? `${metrics.returnedSubmissionsCount} returned, ${metrics.rejectedSubmissionsCount} rejected`
                      : metrics.pendingSubmissionsCount > 0
                        ? 'Awaiting supervisor review'
                        : 'No items awaiting review'}
                  </dd>
                </div>

                <div className="dashboard-metric-cell">
                  <dt className="text-xs font-medium text-ink-muted">
                    Completed tasks
                  </dt>
                  <dd className="text-lg font-semibold tabular-nums text-ink">
                    {metrics.completedTasksCount}
                  </dd>
                  <dd className="text-xs tabular-nums text-ink-muted">
                    {metrics.totalTasksCount > 0
                      ? `of ${metrics.totalTasksCount} assigned ${metrics.totalTasksCount === 1 ? 'task' : 'tasks'}`
                      : 'No tasks assigned yet'}
                  </dd>
                </div>
              </dl>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
            <section
              aria-labelledby="weekly-attendance-heading"
              className="flex flex-col overflow-hidden rounded-[6px] border border-rule bg-surface xl:col-span-7"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-surface-subtle px-5 py-3.5">
                <div>
                  <h2
                    id="weekly-attendance-heading"
                    className="text-sm font-semibold text-ink"
                  >
                    Weekly attendance summary
                  </h2>
                  <p className="mt-0.5 text-xs tabular-nums text-ink-muted">
                    Monday–Saturday, {metrics.currentWeekLabel}
                  </p>
                </div>

                <Link
                  to="/intern/attendance"
                  className="inline-flex min-h-8 items-center text-xs font-medium text-accent underline underline-offset-4 hover:text-accent-hover"
                >
                  Open attendance log
                </Link>
              </div>

              <dl className="grid grid-cols-1 divide-y divide-rule border-b border-rule sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <div className="px-5 py-3">
                  <dt className="text-xs text-ink-muted">Days logged</dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">
                    {metrics.currentWeekEntriesCount} / 6 days
                  </dd>
                </div>
                <div className="px-5 py-3">
                  <dt className="text-xs text-ink-muted">Week hours logged</dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">
                    {formatDurationMinutes(metrics.weekTotalMinutes)}
                  </dd>
                </div>
                <div className="px-5 py-3">
                  <dt className="text-xs text-ink-muted">Approved this week</dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink">
                    {formatDurationMinutes(metrics.weekApprovedMinutes)}
                  </dd>
                </div>
              </dl>

              <div className="week-strip-wrap flex flex-1 flex-col justify-between p-5">
                <ol className="week-strip-grid">
                  {metrics.weekDays.map((day) => {
                    const statusMeta = day.entry
                      ? getDayStatusMeta(day.entry.status)
                      : null

                    return (
                      <li
                        key={day.isoDate}
                        className={`flex flex-col justify-between rounded-[5px] border p-3 ${
                          day.isToday
                            ? 'border-accent/55 bg-accent-tint/45'
                            : 'border-rule bg-surface-subtle/50'
                        }`}
                      >
                        <div className="flex items-baseline justify-between gap-1">
                          <span className="text-xs font-semibold text-ink">
                            {day.dayName}
                          </span>
                          <span className="text-[0.6875rem] tabular-nums text-ink-muted">
                            {day.shortDate}
                          </span>
                        </div>

                        <div className="mt-3">
                          {day.entry && day.minutes !== null ? (
                            <>
                              <p className="text-xs font-semibold tabular-nums text-ink">
                                {formatDurationMinutes(day.minutes)}
                              </p>
                              <p
                                className={`mt-1 inline-flex items-center gap-1.5 text-[0.6875rem] font-medium ${statusMeta.textClass}`}
                              >
                                <span
                                  aria-hidden="true"
                                  className={`size-1.5 shrink-0 rounded-full ${statusMeta.dotClass}`}
                                />
                                <span>{statusMeta.label}</span>
                              </p>
                            </>
                          ) : (
                            <p className="text-xs text-ink-muted">
                              {day.isToday ? 'Today' : 'No entry'}
                            </p>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ol>

                {metrics.currentWeekEntriesCount === 0 ? (
                  <p className="mt-4 text-xs text-ink-muted">
                    No attendance logged yet for this week. Use{' '}
                    <Link
                      to="/intern/attendance"
                      className="font-medium text-accent underline underline-offset-4 hover:text-accent-hover"
                    >
                      Weekly Attendance
                    </Link>{' '}
                    to record your daily time in and time out.
                  </p>
                ) : null}
              </div>
            </section>

            <section
              aria-labelledby="upcoming-tasks-heading"
              className="flex flex-col overflow-hidden rounded-[6px] border border-rule bg-surface xl:col-span-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-surface-subtle px-5 py-3.5">
                <div>
                  <h2
                    id="upcoming-tasks-heading"
                    className="text-sm font-semibold text-ink"
                  >
                    Upcoming assigned tasks
                  </h2>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    Open deadlines and pending revisions
                  </p>
                </div>

                <Link
                  to="/intern/tasks"
                  className="inline-flex min-h-8 items-center text-xs font-medium text-accent underline underline-offset-4 hover:text-accent-hover"
                >
                  View tasks
                </Link>
              </div>

              {metrics.upcomingTasks.length === 0 ? (
                <div className="flex flex-1 flex-col items-start justify-center gap-3 p-5">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-[5px] border border-rule bg-surface-subtle text-ink-muted">
                      <NavIcon name="tasks" className="size-4" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-ink">
                        No open task deadlines
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                        {metrics.totalTasksCount > 0
                          ? 'All assigned tasks have been approved by your supervisor.'
                          : 'Tasks assigned by your supervisor will appear here with their deadlines.'}
                      </p>
                    </div>
                  </div>
                  <Link
                    to="/intern/tasks"
                    className="inline-flex min-h-9 items-center rounded-[5px] border border-rule bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-subtle"
                  >
                    Open tasks
                  </Link>
                </div>
              ) : (
                <ul className="divide-y divide-rule">
                  {metrics.upcomingTasks.map((task) => (
                    <li key={task.id} className="px-5 py-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            to="/intern/tasks"
                            className="block truncate text-sm font-medium text-ink hover:text-accent hover:underline hover:underline-offset-4"
                          >
                            {task.title}
                          </Link>
                          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs tabular-nums">
                            <time
                              dateTime={task.effectiveDeadline}
                              className="text-ink-muted"
                            >
                              {formatCalendarDate(task.effectiveDeadline)}
                            </time>
                            <span
                              aria-hidden="true"
                              className="h-3 w-px bg-rule"
                            />
                            <span
                              className={
                                DEADLINE_TONE_CLASSES[task.deadlineBadge.tone]
                              }
                            >
                              {task.deadlineBadge.label}
                            </span>
                          </div>
                        </div>
                        <StatusBadge status={task.status} />
                      </div>

                      {hasReviewerFeedbackStatus(task.status) ? (
                        <ReturnedRemarks
                          remarks={task.reviewer_remarks}
                          status={task.status}
                        />
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}

              {metrics.totalActiveTasksCount > metrics.upcomingTasks.length ? (
                <div className="border-t border-rule bg-surface-subtle/50 px-5 py-2.5 text-xs text-ink-muted">
                  Showing {metrics.upcomingTasks.length} of{' '}
                  {metrics.totalActiveTasksCount} open tasks.{' '}
                  <Link
                    to="/intern/tasks"
                    className="font-medium text-accent underline underline-offset-4 hover:text-accent-hover"
                  >
                    See all
                  </Link>
                </div>
              ) : null}
            </section>
          </div>

          <section
            aria-labelledby="recent-activity-heading"
            className="overflow-hidden rounded-[6px] border border-rule bg-surface"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-surface-subtle px-5 py-3.5">
              <div>
                <h2
                  id="recent-activity-heading"
                  className="text-sm font-semibold text-ink"
                >
                  Recent submission activity
                </h2>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Latest attendance logs, weekly accomplishments, and task
                  records
                </p>
              </div>
              <span className="text-xs tabular-nums text-ink-muted">
                {metrics.totalSubmissionsCount}{' '}
                {metrics.totalSubmissionsCount === 1
                  ? 'total record'
                  : 'total records'}
              </span>
            </div>

            {metrics.recentActivity.length === 0 ? (
              <div className="flex flex-col items-start gap-3 px-5 py-10 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-ink">
                    No submissions recorded yet
                  </p>
                  <p className="mt-1 text-sm text-ink-muted">
                    Start by logging your daily attendance, adding a weekly
                    accomplishment, or checking assigned tasks.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    to="/intern/attendance"
                    className="inline-flex min-h-9 items-center rounded-[5px] border border-rule bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-subtle"
                  >
                    Attendance
                  </Link>
                  <Link
                    to="/intern/accomplishments"
                    className="inline-flex min-h-9 items-center rounded-[5px] border border-rule bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-subtle"
                  >
                    Accomplishments
                  </Link>
                  <Link
                    to="/intern/tasks"
                    className="inline-flex min-h-9 items-center rounded-[5px] border border-rule bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-subtle"
                  >
                    Tasks
                  </Link>
                </div>
              </div>
            ) : (
              <div
                tabIndex={0}
                role="region"
                aria-labelledby="recent-activity-heading"
                className="table-wrapper"
              >
                <table className="submission-table">
                  <caption className="visually-hidden">
                    Recent intern submissions and approval statuses
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" className="w-36">
                        Module
                      </th>
                      <th scope="col">Entry</th>
                      <th scope="col" className="w-44">
                        Date / Week
                      </th>
                      <th scope="col" className="w-36">
                        Status
                      </th>
                      <th scope="col" className="col-action w-24">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.recentActivity.map((item) => (
                      <tr key={item.key}>
                        <td
                          data-label="Module"
                          className="whitespace-nowrap text-xs font-medium text-ink-muted"
                        >
                          {item.type}
                        </td>

                        <td data-label="Entry">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-ink">
                              {item.title}
                            </p>
                            {hasReviewerFeedbackStatus(item.status) ? (
                              <ReturnedRemarks
                                remarks={item.reviewerRemarks}
                                status={item.status}
                              />
                            ) : null}
                          </div>
                        </td>

                        <td
                          data-label="Date / Week"
                          className="whitespace-nowrap text-sm tabular-nums text-ink-muted"
                        >
                          {item.periodLabel}
                        </td>

                        <td data-label="Status">
                          <StatusBadge status={item.status} />
                        </td>

                        <td data-label="Action" className="col-action">
                          <Link
                            to={item.route}
                            className="inline-flex min-h-8 items-center text-xs font-medium text-accent underline underline-offset-4 hover:text-accent-hover"
                          >
                            Open
                            <span className="visually-hidden">
                              {' '}
                              {item.type}
                            </span>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
