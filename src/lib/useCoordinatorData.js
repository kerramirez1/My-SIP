import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_BREAK_MINUTES,
  computeElapsedMinutes,
  formatDecimalHours,
  formatDurationMinutes,
  formatWallClockTime,
} from './attendanceUtils'
import {
  DEFAULT_REQUIRED_INTERNSHIP_HOURS,
  getCalendarDayDiff,
} from './internDashboardUtils'
import { supabase } from './supabaseClient'
import {
  formatCalendarDate,
  getMondayOfWeek,
  getTodayIsoDate,
} from './weekUtils'

const EMPTY_DATA_STATE = {
  loadedKey: '',
  profiles: [],
  attendance: [],
  accomplishments: [],
  tasks: [],
  error: '',
}

const TABLE_BY_KIND = {
  attendance: 'weekly_attendance',
  accomplishments: 'accomplishments',
  tasks: 'tasks',
}

const TYPE_LABEL_SINGULAR = {
  attendance: 'Attendance',
  accomplishments: 'Accomplishment',
  tasks: 'Task',
}

export function extractIsoDatePart(timestamp) {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(timestamp ?? '').trim())
  return match ? match[1] : ''
}

export function formatBreakText(breakMinutes) {
  const safeBreak = breakMinutes ?? DEFAULT_BREAK_MINUTES
  return safeBreak === 0 ? 'No break' : `Break: ${safeBreak} min`
}

export function escapeCsvCell(value) {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function serializeCsv(headers, rows) {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ]
  return lines.join('\r\n')
}

export function buildProgressReportCsv(internProgressRows) {
  const headers = [
    'Full name',
    'Student ID',
    'School',
    'Course',
    'Company',
    'Supervisor',
    'Required hours',
    'Approved hours',
    'Remaining hours',
    'Progress %',
    'Pending count',
    'Returned count',
  ]

  const rows = internProgressRows.map((intern) => [
    intern.full_name,
    intern.student_id_no ?? '',
    intern.school_name ?? '',
    intern.course ?? '',
    intern.company_name ?? '',
    intern.supervisorName || '',
    intern.requiredHours,
    intern.approvedHours.toFixed(2),
    intern.remainingHours.toFixed(2),
    `${intern.progressPct.toFixed(1)}%`,
    intern.pendingCount,
    intern.returnedCount,
  ])

  return serializeCsv(headers, rows)
}

export function buildSubmissionsReportCsv(submissions) {
  const headers = [
    'Type',
    'Intern',
    'Supervisor',
    'Title or Date',
    'Status',
    'Submitted/Date',
    'Reviewed by',
    'Reviewed at',
    'Reviewer remarks',
  ]

  const rows = submissions.map((item) => [
    item.typeLabel,
    item.internName,
    item.supervisorName || '',
    item.csvTitleOrDate,
    item.status,
    item.submittedOrDateIso || '',
    item.reviewerName || '',
    item.row.reviewed_at ? extractIsoDatePart(item.row.reviewed_at) : '',
    item.row.reviewer_remarks ?? '',
  ])

  return serializeCsv(headers, rows)
}

export function buildCoordinatorMonitoringData({
  profiles = [],
  attendance = [],
  accomplishments = [],
  tasks = [],
  todayIso = getTodayIsoDate(),
}) {
  const profileById = new Map(profiles.map((p) => [p.id, p]))
  const currentWeekStart = getMondayOfWeek(todayIso)

  function resolveName(profileId) {
    if (!profileId) return ''
    return profileById.get(profileId)?.full_name?.trim() || 'Unknown user'
  }

  function resolveSupervisorNameForIntern(internProfile) {
    if (!internProfile?.supervisor_id) return '—'
    return resolveName(internProfile.supervisor_id)
  }

  const internProfiles = profiles
    .filter((p) => p.role === 'intern')
    .sort((a, b) =>
      String(a.full_name ?? '').localeCompare(String(b.full_name ?? '')),
    )

  // Group records by intern for O(N) per-intern metrics
  const approvedMinutesByIntern = new Map()
  const pendingCountByIntern = new Map()
  const returnedCountByIntern = new Map()
  const overdueTasksByIntern = new Map()
  const hasAttendanceThisWeekByIntern = new Set()

  const incrementMap = (map, key) => {
    map.set(key, (map.get(key) ?? 0) + 1)
  }

  for (const row of attendance) {
    if (row.status === 'approved') {
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
    } else if (row.status === 'pending') {
      incrementMap(pendingCountByIntern, row.intern_id)
    } else if (row.status === 'returned') {
      incrementMap(returnedCountByIntern, row.intern_id)
    }

    if (
      currentWeekStart &&
      row.attendance_date &&
      getMondayOfWeek(row.attendance_date) === currentWeekStart
    ) {
      hasAttendanceThisWeekByIntern.add(row.intern_id)
    }
  }

  for (const row of accomplishments) {
    if (row.status === 'pending') {
      incrementMap(pendingCountByIntern, row.intern_id)
    } else if (row.status === 'returned') {
      incrementMap(returnedCountByIntern, row.intern_id)
    }
  }

  for (const row of tasks) {
    if (row.status === 'pending') {
      if (row.submitted_at) {
        // Pending approval ONLY when submitted_at is present
        incrementMap(pendingCountByIntern, row.intern_id)
      } else if (row.deadline) {
        const diff = getCalendarDayDiff(todayIso, row.deadline)
        if (diff !== null && diff < 0) {
          incrementMap(overdueTasksByIntern, row.intern_id)
        }
      }
    } else if (row.status === 'returned') {
      incrementMap(returnedCountByIntern, row.intern_id)
    }
  }

  const internProgressRows = internProfiles.map((intern) => {
    const requiredHours =
      Number.isFinite(Number(intern.required_hours)) &&
      Number(intern.required_hours) > 0
        ? Number(intern.required_hours)
        : DEFAULT_REQUIRED_INTERNSHIP_HOURS
    const approvedMinutes = approvedMinutesByIntern.get(intern.id) ?? 0
    const approvedHours = approvedMinutes / 60
    const remainingHours = Math.max(0, requiredHours - approvedHours)
    const progressPct = Math.min(
      100,
      Number(((approvedHours / requiredHours) * 100).toFixed(1)),
    )
    const pendingCount = pendingCountByIntern.get(intern.id) ?? 0
    const returnedCount = returnedCountByIntern.get(intern.id) ?? 0
    const overdueTasks = overdueTasksByIntern.get(intern.id) ?? 0
    const hasAttendanceThisWeek = hasAttendanceThisWeekByIntern.has(intern.id)

    const attentionFlags = []
    if (pendingCount > 0) {
      attentionFlags.push(
        `${pendingCount} pending ${pendingCount === 1 ? 'approval' : 'approvals'}`,
      )
    }
    if (returnedCount > 0) {
      attentionFlags.push(`${returnedCount} returned, awaiting resubmission`)
    }
    if (overdueTasks > 0) {
      attentionFlags.push(
        `${overdueTasks} overdue ${overdueTasks === 1 ? 'task' : 'tasks'} not submitted`,
      )
    }
    if (!hasAttendanceThisWeek) {
      attentionFlags.push('No attendance this week')
    }

    return {
      ...intern,
      supervisorName: resolveSupervisorNameForIntern(intern),
      approvedMinutes,
      approvedHours,
      requiredHours,
      remainingHours,
      progressPct,
      isComplete: approvedHours >= requiredHours,
      pendingCount,
      returnedCount,
      overdueTasks,
      hasAttendanceThisWeek,
      attentionFlags,
      needsAttention: attentionFlags.length > 0,
    }
  })

  const flaggedInterns = internProgressRows.filter((row) => row.needsAttention)

  // Unified submissions list across all three tables (newest sortAt first)
  const attendanceItems = attendance.map((row) => {
    const internProfile = profileById.get(row.intern_id)
    const renderedMinutes = computeElapsedMinutes(
      row.time_in,
      row.time_out,
      row.break_minutes ?? DEFAULT_BREAK_MINUTES,
    )
    const safeMinutes =
      renderedMinutes !== null && renderedMinutes >= 0 ? renderedMinutes : null
    const durationText =
      safeMinutes !== null
        ? `${formatDurationMinutes(safeMinutes)} (${formatDecimalHours(safeMinutes)})`
        : '—'
    const timeSpan = `${formatWallClockTime(row.time_in)} – ${formatWallClockTime(row.time_out)}`

    return {
      key: `attendance-${row.id}`,
      id: row.id,
      kind: 'attendance',
      tableName: TABLE_BY_KIND.attendance,
      typeLabel: TYPE_LABEL_SINGULAR.attendance,
      internId: row.intern_id,
      internName: resolveName(row.intern_id),
      supervisorName: resolveSupervisorNameForIntern(internProfile),
      reviewerName: resolveName(row.reviewed_by),
      assignerName: '',
      renderedMinutes: safeMinutes,
      titleSummary: `${formatCalendarDate(row.attendance_date)} · ${timeSpan} · ${durationText}`,
      shortTitle: `${formatCalendarDate(row.attendance_date)} (${timeSpan})`,
      csvTitleOrDate: `${row.attendance_date} (${timeSpan}, ${safeMinutes !== null ? formatDecimalHours(safeMinutes) : '—'})`,
      status: row.status,
      isSubmittedTask: true,
      submittedOrDateIso: row.attendance_date || '',
      sortAt: row.updated_at || row.created_at || row.attendance_date || '',
      row,
    }
  })

  const accomplishmentItems = accomplishments.map((row) => {
    const internProfile = profileById.get(row.intern_id)
    return {
      key: `accomplishments-${row.id}`,
      id: row.id,
      kind: 'accomplishments',
      tableName: TABLE_BY_KIND.accomplishments,
      typeLabel: TYPE_LABEL_SINGULAR.accomplishments,
      internId: row.intern_id,
      internName: resolveName(row.intern_id),
      supervisorName: resolveSupervisorNameForIntern(internProfile),
      reviewerName: resolveName(row.reviewed_by),
      assignerName: '',
      renderedMinutes: null,
      titleSummary: row.title,
      shortTitle: row.title,
      csvTitleOrDate: row.title,
      status: row.status,
      isSubmittedTask: true,
      submittedOrDateIso:
        extractIsoDatePart(row.created_at) || row.week_of || '',
      sortAt: row.updated_at || row.created_at || row.week_of || '',
      row,
    }
  })

  const taskItems = tasks.map((row) => {
    const internProfile = profileById.get(row.intern_id)
    const submittedDateIso = extractIsoDatePart(row.submitted_at)
    return {
      key: `tasks-${row.id}`,
      id: row.id,
      kind: 'tasks',
      tableName: TABLE_BY_KIND.tasks,
      typeLabel: TYPE_LABEL_SINGULAR.tasks,
      internId: row.intern_id,
      internName: resolveName(row.intern_id),
      supervisorName: resolveSupervisorNameForIntern(internProfile),
      reviewerName: resolveName(row.reviewed_by),
      assignerName: resolveName(row.assigned_by),
      renderedMinutes: null,
      titleSummary: row.title,
      shortTitle: row.title,
      csvTitleOrDate: row.title,
      status: row.status,
      isSubmittedTask: Boolean(row.submitted_at),
      submittedOrDateIso: submittedDateIso || row.deadline || row.task_date || '',
      sortAt: row.submitted_at || row.updated_at || row.created_at || '',
      row,
    }
  })

  const allSubmissions = [
    ...attendanceItems,
    ...accomplishmentItems,
    ...taskItems,
  ].sort((a, b) => String(b.sortAt).localeCompare(String(a.sortAt)))

  // Consolidated type-by-status matrix
  const countByStatus = (rows, isTasks = false) => {
    const counts = {
      pending: 0,
      notSubmitted: 0,
      approved: 0,
      returned: 0,
      rejected: 0,
    }
    for (const row of rows) {
      if (row.status === 'pending') {
        if (isTasks && !row.submitted_at) {
          counts.notSubmitted += 1
        } else {
          counts.pending += 1
        }
      } else if (row.status === 'approved') {
        counts.approved += 1
      } else if (row.status === 'returned') {
        counts.returned += 1
      } else if (row.status === 'rejected') {
        counts.rejected += 1
      }
    }
    return {
      ...counts,
      total:
        counts.pending +
        counts.notSubmitted +
        counts.approved +
        counts.returned +
        counts.rejected,
    }
  }

  const attendanceCounts = countByStatus(attendance, false)
  const accomplishmentCounts = countByStatus(accomplishments, false)
  const taskCounts = countByStatus(tasks, true)

  const reportMatrix = [
    { key: 'attendance', label: 'Attendance', ...attendanceCounts },
    { key: 'accomplishments', label: 'Accomplishments', ...accomplishmentCounts },
    { key: 'tasks', label: 'Tasks', ...taskCounts },
  ]

  const reportTotals = {
    pending:
      attendanceCounts.pending +
      accomplishmentCounts.pending +
      taskCounts.pending,
    notSubmitted: taskCounts.notSubmitted,
    approved:
      attendanceCounts.approved +
      accomplishmentCounts.approved +
      taskCounts.approved,
    returned:
      attendanceCounts.returned +
      accomplishmentCounts.returned +
      taskCounts.returned,
    rejected:
      attendanceCounts.rejected +
      accomplishmentCounts.rejected +
      taskCounts.rejected,
    total:
      attendanceCounts.total + accomplishmentCounts.total + taskCounts.total,
  }

  const totalApprovedMinutes = internProgressRows.reduce(
    (sum, intern) => sum + intern.approvedMinutes,
    0,
  )

  const totals = {
    totalInterns: internProgressRows.length,
    totalPendingApprovals: reportTotals.pending,
    internsNeedingAttention: flaggedInterns.length,
    totalApprovedMinutes,
    totalApprovedHours: totalApprovedMinutes / 60,
  }

  return {
    interns: internProfiles,
    internProgressRows,
    flaggedInterns,
    allSubmissions,
    totals,
    reportMatrix,
    reportTotals,
  }
}

export function useCoordinatorData() {
  const [reloadCounter, setReloadCounter] = useState(0)
  const [dataState, setDataState] = useState(EMPTY_DATA_STATE)

  const reload = useCallback(() => {
    setReloadCounter((count) => count + 1)
  }, [])

  const currentQueryKey = `coordinator:${reloadCounter}`

  useEffect(() => {
    if (!supabase) return undefined

    let active = true

    Promise.all([
      supabase
        .from('profiles')
        .select(
          'id, full_name, role, supervisor_id, student_id_no, company_name, school_name, course, required_hours, internship_start_date',
        )
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
    ]).then(([profilesRes, attendanceRes, accomplishmentsRes, tasksRes]) => {
      if (!active) return

      const errors = [
        profilesRes.error?.message,
        attendanceRes.error?.message,
        accomplishmentsRes.error?.message,
        tasksRes.error?.message,
      ].filter(Boolean)

      setDataState({
        loadedKey: currentQueryKey,
        profiles: profilesRes.error ? [] : (profilesRes.data ?? []),
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
  }, [currentQueryKey])

  const loading = Boolean(supabase && dataState.loadedKey !== currentQueryKey)
  const hasLoaded = dataState.loadedKey === currentQueryKey
  const loadError = hasLoaded ? dataState.error : ''

  const derived = useMemo(
    () =>
      buildCoordinatorMonitoringData({
        profiles: hasLoaded ? dataState.profiles : [],
        attendance: hasLoaded ? dataState.attendance : [],
        accomplishments: hasLoaded ? dataState.accomplishments : [],
        tasks: hasLoaded ? dataState.tasks : [],
        todayIso: getTodayIsoDate(),
      }),
    [
      dataState.accomplishments,
      dataState.attendance,
      dataState.profiles,
      dataState.tasks,
      hasLoaded,
    ],
  )

  return {
    loading,
    loadError,
    interns: derived.interns,
    internProgressRows: derived.internProgressRows,
    flaggedInterns: derived.flaggedInterns,
    allSubmissions: derived.allSubmissions,
    totals: derived.totals,
    reportMatrix: derived.reportMatrix,
    reportTotals: derived.reportTotals,
    reload,
  }
}
