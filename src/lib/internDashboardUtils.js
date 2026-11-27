import {
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
 * Resolves the required internship hours target from environment config or the standard default.
 * @param {string | number | undefined} rawEnvValue
 * @returns {number}
 */
export function getRequiredInternshipHours(rawEnvValue) {
  const parsed = Number(rawEnvValue)
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed
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

  // 1. Approved internship hours (strictly from approved attendance entries only)
  let approvedAttendanceMinutes = 0
  let pendingAttendanceMinutes = 0
  let approvedAttendanceCount = 0

  for (const row of attendance) {
    const minutes = computeElapsedMinutes(row.time_in, row.time_out)
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

  for (const row of allSubmissions) {
    if (row.status === 'pending') pendingSubmissionsCount += 1
    else if (row.status === 'returned') returnedSubmissionsCount += 1
  }

  // 3. Tasks completion + upcoming/active tasks with deadlines
  const completedTasksCount = tasks.filter(
    (row) => row.status === 'approved',
  ).length

  const activeTasks = tasks
    .filter((row) => row.status !== 'approved')
    .map((row) => {
      const dayDiff = getCalendarDayDiff(todayIso, row.task_date)
      return {
        ...row,
        dayDiff: dayDiff ?? Number.MAX_SAFE_INTEGER,
        deadline: getDeadlineBadge(row.task_date, todayIso),
      }
    })
    .sort((a, b) => {
      // Show upcoming & due-today items first (nearest deadline first),
      // then overdue items (most recent overdue first).
      const aUpcoming = a.dayDiff >= 0
      const bUpcoming = b.dayDiff >= 0
      if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1
      if (aUpcoming) return a.dayDiff - b.dayDiff
      return b.dayDiff - a.dayDiff
    })

  // 4. Current Monday-Saturday weekly attendance summary
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
    const elapsed = computeElapsedMinutes(row.time_in, row.time_out)
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
      ? computeElapsedMinutes(entry.time_in, entry.time_out)
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
      const minutes = computeElapsedMinutes(row.time_in, row.time_out)
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
      periodLabel: formatCalendarDate(row.task_date),
      status: row.status,
      reviewerRemarks: row.reviewer_remarks,
      activityAt: row.reviewed_at || row.updated_at || row.created_at || '',
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
