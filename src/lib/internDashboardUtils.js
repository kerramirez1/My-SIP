import {
  DEFAULT_BREAK_MINUTES,
  computeElapsedMinutes,
  formatDurationMinutes,
  formatWallClockTime,
} from './attendanceUtils.js'
import {
  formatCalendarDate,
  formatWeekRange,
  getMondayOfWeek,
  shiftIsoDate,
} from './weekUtils.js'

export const DEFAULT_REQUIRED_INTERNSHIP_HOURS = 500

const SHORT_WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * Resolves the required internship hours target:
 * 1. Per-intern profile.required_hours (highest priority)
 * 2. Optional VITE_REQUIRED_INTERNSHIP_HOURS env override
 * 3. Standard default (500 hours)
 *
 * @param {number | string | null | undefined} profileRequiredHours
 * @param {string | number | undefined} [rawEnvValue]
 * @returns {number}
 */
export function getRequiredInternshipHours(profileRequiredHours, rawEnvValue) {
  const fromProfile = Number(profileRequiredHours)
  if (Number.isFinite(fromProfile) && fromProfile > 0) {
    return fromProfile
  }
  const fromEnv = Number(rawEnvValue)
  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return fromEnv
  }
  return DEFAULT_REQUIRED_INTERNSHIP_HOURS
}

function parseIsoDayNumber(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate ?? '').trim())
  if (!match) return null
  return Math.floor(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) /
      86_400_000,
  )
}

/**
 * Computes signed whole-day difference (`targetIso - baseIso`) without local timezone drift.
 * @param {string} baseIso
 * @param {string} targetIso
 * @returns {number | null}
 */
export function getCalendarDayDiff(baseIso, targetIso) {
  if (typeof globalThis.Temporal?.PlainDate?.from === 'function') {
    try {
      const start = globalThis.Temporal.PlainDate.from(baseIso)
      const end = globalThis.Temporal.PlainDate.from(targetIso)
      return start.until(end, { largestUnit: 'day' }).days
    } catch {
      return null
    }
  }
  const baseDay = parseIsoDayNumber(baseIso)
  const targetDay = parseIsoDayNumber(targetIso)
  if (baseDay === null || targetDay === null) return null
  return targetDay - baseDay
}

/**
 * Formats a concise human deadline label relative to today's calendar date.
 * @param {string} taskDateIso
 * @param {string} todayIso
 * @returns {{ label: string, tone: 'overdue' | 'today' | 'upcoming' }}
 */
export function getDeadlineBadge(taskDateIso, todayIso) {
  const diff = getCalendarDayDiff(todayIso, taskDateIso)
  if (diff === null) {
    return { label: formatCalendarDate(taskDateIso), tone: 'upcoming' }
  }
  if (diff < 0) {
    const daysAgo = Math.abs(diff)
    return {
      label: daysAgo === 1 ? '1 day overdue' : `${daysAgo} days overdue`,
      tone: 'overdue',
    }
  }
  if (diff === 0) {
    return { label: 'Due today', tone: 'today' }
  }
  if (diff === 1) {
    return { label: 'Tomorrow', tone: 'upcoming' }
  }
  return { label: `In ${diff} days`, tone: 'upcoming' }
}

function getRowBreakMinutes(row) {
  return row?.break_minutes ?? DEFAULT_BREAK_MINUTES
}

/**
 * Computes all Intern Dashboard metrics, current-week attendance grid, upcoming tasks,
 * and unified recent submission activity strictly from live Supabase rows.
 *
 * @param {{
 *   attendance: Array<Record<string, any>>,
 *   accomplishments: Array<Record<string, any>>,
 *   tasks: Array<Record<string, any>>,
 *   todayIso: string,
 *   requiredHours?: number,
 * }} params
 */
export function buildInternDashboardMetrics({
  attendance = [],
  accomplishments = [],
  tasks = [],
  todayIso,
  requiredHours = DEFAULT_REQUIRED_INTERNSHIP_HOURS,
}) {
  const requiredMinutes = Math.max(1, Math.round(requiredHours * 60))

  // 1. Approved internship hours (strictly from approved attendance entries, break-adjusted)
  let approvedAttendanceMinutes = 0
  let pendingAttendanceMinutes = 0
  let approvedAttendanceCount = 0

  for (const row of attendance) {
    const minutes = computeElapsedMinutes(
      row.time_in,
      row.time_out,
      getRowBreakMinutes(row),
    )
    const validMinutes = minutes !== null && minutes > 0 ? minutes : 0

    if (row.status === 'approved') {
      approvedAttendanceMinutes += validMinutes
      approvedAttendanceCount += 1
    } else if (row.status === 'pending') {
      pendingAttendanceMinutes += validMinutes
    }
  }

  const remainingMinutes = Math.max(0, requiredMinutes - approvedAttendanceMinutes)
  const progressRatio = Math.min(1, approvedAttendanceMinutes / requiredMinutes)
  const progressPercent = Number((progressRatio * 100).toFixed(1))

  // 2. Submission counts across all three modules
  const allSubmissions = [...attendance, ...accomplishments, ...tasks]
  let pendingSubmissionsCount = 0
  let returnedSubmissionsCount = 0
  let rejectedSubmissionsCount = 0

  for (const row of allSubmissions) {
    if (row.status === 'pending') pendingSubmissionsCount += 1
    else if (row.status === 'returned') returnedSubmissionsCount += 1
    else if (row.status === 'rejected') rejectedSubmissionsCount += 1
  }

  // 3. Tasks completion + upcoming/active tasks with deadlines
  const completedTasksCount = tasks.filter(
    (row) => row.status === 'approved',
  ).length

  const activeTasks = tasks
    .filter((row) => row.status !== 'approved')
    .map((row) => {
      const effectiveDeadline = row.deadline || row.task_date
      const dayDiff = getCalendarDayDiff(todayIso, effectiveDeadline)
      return {
        ...row,
        effectiveDeadline,
        dayDiff: dayDiff ?? Number.MAX_SAFE_INTEGER,
        deadlineBadge: getDeadlineBadge(effectiveDeadline, todayIso),
      }
    })
    .sort((a, b) => {
      const aUpcoming = a.dayDiff >= 0
      const bUpcoming = b.dayDiff >= 0
      if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1
      if (aUpcoming) return a.dayDiff - b.dayDiff
      return b.dayDiff - a.dayDiff
    })

  // 4. Current Monday-Saturday weekly attendance summary (break-adjusted)
  const currentWeekOf = getMondayOfWeek(todayIso)
  const currentWeekEntries = attendance
    .filter((row) => row.week_of === currentWeekOf)
    .sort((a, b) =>
      String(a.attendance_date).localeCompare(String(b.attendance_date)),
    )

  const entryByDate = new Map(
    currentWeekEntries.map((row) => [row.attendance_date, row]),
  )

  let weekTotalMinutes = 0
  let weekApprovedMinutes = 0

  for (const row of currentWeekEntries) {
    const elapsed = computeElapsedMinutes(
      row.time_in,
      row.time_out,
      getRowBreakMinutes(row),
    )
    if (elapsed !== null && elapsed > 0) {
      weekTotalMinutes += elapsed
      if (row.status === 'approved') {
        weekApprovedMinutes += elapsed
      }
    }
  }

  const weekDays = SHORT_WEEKDAY_LABELS.map((dayName, index) => {
    const isoDate = currentWeekOf ? shiftIsoDate(currentWeekOf, index) : ''
    const entry = entryByDate.get(isoDate) ?? null
    const minutes = entry
      ? computeElapsedMinutes(
          entry.time_in,
          entry.time_out,
          getRowBreakMinutes(entry),
        )
      : null

    return {
      dayName,
      isoDate,
      shortDate: isoDate ? formatCalendarDate(isoDate).replace(/,\s*\d{4}$/, '') : '',
      isToday: isoDate === todayIso,
      entry,
      minutes: minutes !== null && minutes >= 0 ? minutes : null,
    }
  })

  // 5. Unified recent submission activity across attendance, accomplishments, and tasks
  const recentActivity = [
    ...attendance.map((row) => {
      const minutes = computeElapsedMinutes(
        row.time_in,
        row.time_out,
        getRowBreakMinutes(row),
      )
      const durationText =
        minutes !== null && minutes >= 0
          ? ` (${formatDurationMinutes(minutes)})`
          : ''
      return {
        key: `attendance-${row.id}`,
        type: 'Attendance',
        route: '/intern/attendance',
        title: `${formatWallClockTime(row.time_in)} – ${formatWallClockTime(row.time_out)}${durationText}`,
        periodLabel: formatCalendarDate(row.attendance_date),
        status: row.status,
        reviewerRemarks: row.reviewer_remarks,
        activityAt: row.reviewed_at || row.updated_at || row.created_at || '',
      }
    }),
    ...accomplishments.map((row) => ({
      key: `accomplishment-${row.id}`,
      type: 'Accomplishment',
      route: '/intern/accomplishments',
      title: row.title,
      periodLabel: formatWeekRange(row.week_of),
      status: row.status,
      reviewerRemarks: row.reviewer_remarks,
      activityAt: row.reviewed_at || row.updated_at || row.created_at || '',
    })),
    ...tasks.map((row) => ({
      key: `task-${row.id}`,
      type: 'Task',
      route: '/intern/tasks',
      title: row.title,
      periodLabel: formatCalendarDate(row.deadline || row.task_date),
      status: row.status,
      reviewerRemarks: row.reviewer_remarks,
      activityAt:
        row.reviewed_at ||
        row.submitted_at ||
        row.updated_at ||
        row.created_at ||
        '',
    })),
  ]
    .sort((a, b) => String(b.activityAt).localeCompare(String(a.activityAt)))
    .slice(0, 8)

  return {
    requiredHours,
    requiredMinutes,
    approvedAttendanceMinutes,
    approvedAttendanceHours: approvedAttendanceMinutes / 60,
    approvedAttendanceCount,
    pendingAttendanceMinutes,
    remainingMinutes,
    progressPercent,
    isGoalComplete: approvedAttendanceMinutes >= requiredMinutes,
    pendingSubmissionsCount,
    returnedSubmissionsCount,
    rejectedSubmissionsCount,
    needsRevisionCount: returnedSubmissionsCount + rejectedSubmissionsCount,
    totalSubmissionsCount: allSubmissions.length,
    completedTasksCount,
    totalTasksCount: tasks.length,
    upcomingTasks: activeTasks.slice(0, 5),
    totalActiveTasksCount: activeTasks.length,
    currentWeekOf,
    currentWeekLabel: formatWeekRange(currentWeekOf, 5),
    currentWeekEntriesCount: currentWeekEntries.length,
    weekTotalMinutes,
    weekApprovedMinutes,
    weekDays,
    recentActivity,
  }
}
