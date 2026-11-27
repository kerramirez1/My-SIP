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
  formatWeekRange,
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

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

export const DISPLAY_STATUS_META = {
  assigned_not_submitted: {
    key: 'assigned_not_submitted',
    label: 'Assigned – Not Submitted',
    shortLabel: 'Not Submitted',
    className: 'border-rule bg-surface-subtle text-ink-muted',
  },
  pending: {
    key: 'pending',
    label: 'Pending Supervisor Review',
    shortLabel: 'Pending Review',
    className: 'border-accent/40 bg-accent-tint text-accent',
  },
  approved: {
    key: 'approved',
    label: 'Approved by Supervisor',
    shortLabel: 'Approved',
    className: 'border-success-border/45 bg-success-tint text-success',
  },
  returned: {
    key: 'returned',
    label: 'Returned for Revision',
    shortLabel: 'Returned',
    className: 'border-error-border/45 bg-error-tint text-error',
  },
  rejected: {
    key: 'rejected',
    label: 'Rejected',
    shortLabel: 'Rejected',
    className: 'border-rejected-border bg-rejected-bg text-on-accent',
  },
}

export const INACTIVE_DAYS_THRESHOLD = 14

export function formatTurnaroundHours(hours) {
  if (hours === null || hours === undefined || !Number.isFinite(hours)) {
    return '—'
  }
  if (hours < 1) {
    const mins = Math.max(1, Math.round(hours * 60))
    return `${mins} min`
  }
  if (hours < 48) {
    return `${hours.toFixed(1)} hrs`
  }
  return `${(hours / 24).toFixed(1)} days`
}

function formatShortIsoDate(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate ?? '').trim())
  if (!match) return isoDate || '—'
  const monthIdx = Number(match[2]) - 1
  const day = Number(match[3])
  return `${MONTH_SHORT[monthIdx] ?? match[2]} ${day}`
}

function addDaysToIso(isoDate, days) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate ?? '').trim())
  if (!match) return ''
  const d = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days),
  )
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function computeReviewTurnaroundHours(kind, row) {
  if (!row?.reviewed_at) return null
  const startRaw =
    kind === 'tasks' ? row.submitted_at || row.created_at : row.created_at
  if (!startRaw) return null
  const startMs = Date.parse(startRaw)
  const endMs = Date.parse(row.reviewed_at)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null
  }
  return (endMs - startMs) / 3_600_000
}

export function extractIsoDatePart(timestamp) {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(timestamp ?? '').trim())
  return match ? match[1] : ''
}

export function formatBreakText(breakMinutes) {
  const safeBreak = breakMinutes ?? DEFAULT_BREAK_MINUTES
  return safeBreak === 0 ? 'No break' : `Break: ${safeBreak} min`
}

function parseIsoYearMonth(isoDate) {
  const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(String(isoDate ?? '').trim())
  if (!match) return null
  return { year: Number(match[1]), month: Number(match[2]) }
}

/**
 * Derives university Academic Year from an ISO calendar date.
 * Aug–Dec belongs to AY YYYY–(YYYY+1); Jan–Jul belongs to AY (YYYY-1)–YYYY.
 */
export function deriveAcademicYear(isoDate) {
  const ym = parseIsoYearMonth(isoDate)
  if (!ym) return ''
  const startYear = ym.month >= 8 ? ym.year : ym.year - 1
  return `AY ${startYear}–${startYear + 1}`
}

/**
 * Derives academic semester from an ISO calendar date.
 * Aug–Dec: 1st Semester; Jan–May: 2nd Semester; Jun–Jul: Summer / Midyear.
 */
export function deriveSemester(isoDate) {
  const ym = parseIsoYearMonth(isoDate)
  if (!ym) return ''
  if (ym.month >= 8) return '1st Semester'
  if (ym.month <= 5) return '2nd Semester'
  return 'Summer / Midyear'
}

/**
 * Derives internship batch label from an intern's start date (YYYY-MM).
 */
export function deriveBatchLabel(startDateIso) {
  const ym = parseIsoYearMonth(startDateIso)
  if (!ym) return ''
  return `${MONTH_SHORT[ym.month - 1]} ${ym.year} Batch`
}

function matchesDateRange(isoDate, dateFrom, dateTo) {
  if (!dateFrom && !dateTo) return true
  if (!isoDate) return false
  if (dateFrom && isoDate < dateFrom) return false
  if (dateTo && isoDate > dateTo) return false
  return true
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
    'Last submission date',
    'Pending count',
    'Returned count',
  ]

  const rows = internProgressRows.map((intern) => [
    intern.full_name,
    intern.student_id_no ?? '',
    intern.school_name ?? '',
    intern.course ?? '',
    intern.company_name ?? '',
    intern.supervisorName === '—' ? '' : intern.supervisorName,
    intern.requiredHours,
    intern.approvedHours.toFixed(2),
    intern.remainingHours.toFixed(2),
    `${intern.progressPct.toFixed(1)}%`,
    intern.lastSubmissionDate || '',
    intern.pendingCount,
    intern.returnedCount,
  ])

  return serializeCsv(headers, rows)
}

export function buildSubmissionsReportCsv(submissions) {
  const headers = [
    'Type',
    'Intern',
    'Student ID',
    'Supervisor',
    'Title or Date',
    'Reporting Period',
    'Status',
    'Submission Date',
    'Reviewed by',
    'Reviewed at',
    'Reviewer remarks',
  ]

  const rows = submissions.map((item) => [
    item.typeLabel,
    item.internName,
    item.studentIdNo || '',
    item.supervisorName === '—' ? '' : item.supervisorName,
    item.csvTitleOrDate,
    item.reportingPeriod || '',
    item.displayStatusLabel,
    item.submissionDateIso || '',
    item.reviewerName || '',
    item.row.reviewed_at ? extractIsoDatePart(item.row.reviewed_at) : '',
    item.row.reviewer_remarks ?? '',
  ])

  return serializeCsv(headers, rows)
}

function getDisplayStatusKey(kind, row) {
  if (kind === 'tasks' && row.status === 'pending' && !row.submitted_at) {
    return 'assigned_not_submitted'
  }
  return row.status || 'pending'
}

function buildSubmissionHistory(kind, row, internName, assignerName, reviewerName) {
  const events = []
  const createdIso = extractIsoDatePart(row.created_at)

  if (kind === 'tasks') {
    events.push({
      id: 'assigned',
      label: assignerName
        ? `Assigned by ${assignerName}`
        : 'Task assigned to intern',
      timestamp: row.created_at || row.task_date || '',
      dateLabel: createdIso
        ? formatCalendarDate(createdIso)
        : row.task_date
          ? formatCalendarDate(row.task_date)
          : '—',
    })
    if (row.submitted_at) {
      const subIso = extractIsoDatePart(row.submitted_at)
      events.push({
        id: 'submitted',
        label: `Completion submitted by ${internName}`,
        timestamp: row.submitted_at,
        dateLabel: subIso ? formatCalendarDate(subIso) : '—',
      })
    }
  } else {
    events.push({
      id: 'created',
      label: `${TYPE_LABEL_SINGULAR[kind]} submitted by ${internName}`,
      timestamp: row.created_at || row.attendance_date || row.week_of || '',
      dateLabel: createdIso
        ? formatCalendarDate(createdIso)
        : formatCalendarDate(row.attendance_date || row.week_of),
    })
  }

  if (row.updated_at && row.created_at && row.updated_at !== row.created_at) {
    const updIso = extractIsoDatePart(row.updated_at)
    const revIso = extractIsoDatePart(row.reviewed_at)
    if (!row.reviewed_at || row.updated_at !== row.reviewed_at) {
      events.push({
        id: 'updated',
        label: 'Record updated',
        timestamp: row.updated_at,
        dateLabel: updIso ? formatCalendarDate(updIso) : revIso || '—',
      })
    }
  }

  if (row.reviewed_at || row.reviewed_by) {
    const statusLabel =
      DISPLAY_STATUS_META[row.status]?.label || row.status || 'Reviewed'
    const revIso = extractIsoDatePart(row.reviewed_at)
    events.push({
      id: 'reviewed',
      label: `${statusLabel}${reviewerName ? ` (${reviewerName})` : ''}`,
      timestamp: row.reviewed_at || '',
      dateLabel: revIso ? formatCalendarDate(revIso) : '—',
      remarks: row.reviewer_remarks?.trim() || '',
    })
  }

  return events
}

export function extractFilterOptions({
  profiles = [],
  attendance = [],
  accomplishments = [],
  tasks = [],
}) {
  const academicYearSet = new Set()
  const semesterSet = new Set()
  const batchSet = new Set()
  const companySet = new Set()
  const supervisors = []
  let hasUnassignedIntern = false

  const registerDate = (iso) => {
    if (!iso) return
    const ay = deriveAcademicYear(iso)
    const sem = deriveSemester(iso)
    if (ay) academicYearSet.add(ay)
    if (sem) semesterSet.add(sem)
  }

  for (const p of profiles) {
    if (p.company_name?.trim()) companySet.add(p.company_name.trim())
    if (p.role === 'supervisor') {
      supervisors.push({
        id: p.id,
        full_name: p.full_name,
        company_name: p.company_name?.trim() || '',
      })
    } else if (p.role === 'intern') {
      if (!p.supervisor_id) hasUnassignedIntern = true
      const anchorDate =
        p.internship_start_date || extractIsoDatePart(p.created_at)
      registerDate(anchorDate)
      const batch = deriveBatchLabel(p.internship_start_date)
      if (batch) batchSet.add(batch)
    }
  }

  for (const r of attendance) registerDate(r.attendance_date)
  for (const r of accomplishments) {
    registerDate(extractIsoDatePart(r.created_at) || r.week_of)
  }
  for (const r of tasks) {
    registerDate(
      extractIsoDatePart(r.submitted_at) || r.deadline || r.task_date,
    )
  }

  const semesterOrder = ['1st Semester', '2nd Semester', 'Summer / Midyear']

  return {
    academicYears: [...academicYearSet].sort((a, b) => b.localeCompare(a)),
    semesters: semesterOrder.filter((s) => semesterSet.has(s)),
    batches: [...batchSet].sort((a, b) => b.localeCompare(a)),
    companies: [...companySet].sort((a, b) => a.localeCompare(b)),
    supervisors: supervisors.sort((a, b) =>
      String(a.full_name ?? '').localeCompare(String(b.full_name ?? '')),
    ),
    hasUnassignedIntern,
  }
}

export function buildCoordinatorMonitoringData({
  profiles = [],
  attendance = [],
  accomplishments = [],
  tasks = [],
  filters = {},
  todayIso = getTodayIsoDate(),
}) {
  const {
    academicYear = 'all',
    semester = 'all',
    batch = 'all',
    company = 'all',
    supervisorId = 'all',
    dateFrom = '',
    dateTo = '',
  } = filters

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

  const allInternProfiles = profiles
    .filter((p) => p.role === 'intern')
    .sort((a, b) =>
      String(a.full_name ?? '').localeCompare(String(b.full_name ?? '')),
    )

  const allSupervisorProfiles = profiles
    .filter((p) => p.role === 'supervisor')
    .sort((a, b) =>
      String(a.full_name ?? '').localeCompare(String(b.full_name ?? '')),
    )

  // Match interns against global cohort/org/supervisor filters
  const filteredInterns = allInternProfiles.filter((intern) => {
    if (company !== 'all' && (intern.company_name?.trim() || '') !== company) {
      return false
    }
    if (supervisorId === 'unassigned') {
      if (intern.supervisor_id) return false
    } else if (supervisorId !== 'all' && intern.supervisor_id !== supervisorId) {
      return false
    }
    if (batch !== 'all') {
      const internBatch = deriveBatchLabel(intern.internship_start_date)
      if (internBatch !== batch) return false
    }
    if (academicYear !== 'all' || semester !== 'all') {
      const anchor =
        intern.internship_start_date || extractIsoDatePart(intern.created_at)
      if (academicYear !== 'all' && deriveAcademicYear(anchor) !== academicYear) {
        // Also allow intern if they have records inside the chosen academic year
        const hasMatchingRecord =
          attendance.some(
            (r) =>
              r.intern_id === intern.id &&
              deriveAcademicYear(r.attendance_date) === academicYear,
          ) ||
          accomplishments.some(
            (r) =>
              r.intern_id === intern.id &&
              deriveAcademicYear(extractIsoDatePart(r.created_at) || r.week_of) ===
                academicYear,
          ) ||
          tasks.some(
            (r) =>
              r.intern_id === intern.id &&
              deriveAcademicYear(
                extractIsoDatePart(r.submitted_at) || r.deadline || r.task_date,
              ) === academicYear,
          )
        if (!hasMatchingRecord) return false
      }
      if (semester !== 'all' && deriveSemester(anchor) !== semester) {
        const hasMatchingSem =
          attendance.some(
            (r) =>
              r.intern_id === intern.id &&
              deriveSemester(r.attendance_date) === semester,
          ) ||
          accomplishments.some(
            (r) =>
              r.intern_id === intern.id &&
              deriveSemester(extractIsoDatePart(r.created_at) || r.week_of) ===
                semester,
          ) ||
          tasks.some(
            (r) =>
              r.intern_id === intern.id &&
              deriveSemester(
                extractIsoDatePart(r.submitted_at) || r.deadline || r.task_date,
              ) === semester,
          )
        if (!hasMatchingSem) return false
      }
    }
    return true
  })

  const activeInternIds = new Set(filteredInterns.map((i) => i.id))

  const recordMatchesPeriodFilters = (isoDate) => {
    if (!matchesDateRange(isoDate, dateFrom, dateTo)) return false
    if (academicYear !== 'all' && deriveAcademicYear(isoDate) !== academicYear) {
      return false
    }
    if (semester !== 'all' && deriveSemester(isoDate) !== semester) {
      return false
    }
    return true
  }

  const scopedAttendance = attendance.filter(
    (row) =>
      activeInternIds.has(row.intern_id) &&
      recordMatchesPeriodFilters(row.attendance_date),
  )

  const scopedAccomplishments = accomplishments.filter((row) => {
    const refDate = extractIsoDatePart(row.created_at) || row.week_of
    return (
      activeInternIds.has(row.intern_id) && recordMatchesPeriodFilters(refDate)
    )
  })

  const scopedTasks = tasks.filter((row) => {
    const refDate =
      extractIsoDatePart(row.submitted_at) || row.deadline || row.task_date
    return (
      activeInternIds.has(row.intern_id) && recordMatchesPeriodFilters(refDate)
    )
  })

  // Build normalized unified submission objects first so alerts can link directly to them
  const attendanceItems = scopedAttendance.map((row) => {
    const internProfile = profileById.get(row.intern_id)
    const renderedMinutes = computeElapsedMinutes(
      row.time_in,
      row.time_out,
      row.break_minutes ?? DEFAULT_BREAK_MINUTES,
    )
    const isIncomplete =
      !row.time_in ||
      !row.time_out ||
      renderedMinutes === null ||
      renderedMinutes <= 0
    const safeMinutes =
      renderedMinutes !== null && renderedMinutes >= 0 ? renderedMinutes : null
    const durationText =
      safeMinutes !== null
        ? `${formatDurationMinutes(safeMinutes)} (${formatDecimalHours(safeMinutes)})`
        : 'Incomplete time log'
    const timeSpan = `${formatWallClockTime(row.time_in)} – ${formatWallClockTime(row.time_out)}`
    const displayStatusKey = getDisplayStatusKey('attendance', row)
    const internName = resolveName(row.intern_id)
    const reviewerName = resolveName(row.reviewed_by)

    return {
      key: `attendance-${row.id}`,
      id: row.id,
      kind: 'attendance',
      tableName: TABLE_BY_KIND.attendance,
      typeLabel: TYPE_LABEL_SINGULAR.attendance,
      internId: row.intern_id,
      internName,
      studentIdNo: internProfile?.student_id_no?.trim() || '',
      companyName: internProfile?.company_name?.trim() || '',
      supervisorId: internProfile?.supervisor_id || null,
      supervisorName: resolveSupervisorNameForIntern(internProfile),
      reviewerName,
      assignerName: '',
      renderedMinutes: safeMinutes,
      isIncompleteAttendance: isIncomplete,
      titleSummary: `${formatCalendarDate(row.attendance_date)} — ${timeSpan}`,
      subtitleSummary:
        safeMinutes !== null
          ? `Rendered ${durationText}`
          : 'Missing or invalid time in / time out',
      shortTitle: `${formatCalendarDate(row.attendance_date)} (${timeSpan})`,
      csvTitleOrDate: `${row.attendance_date} (${timeSpan}, ${safeMinutes !== null ? formatDecimalHours(safeMinutes) : 'Incomplete'})`,
      reportingPeriod: row.week_of ? formatWeekRange(row.week_of, 5) : '—',
      status: row.status,
      displayStatusKey,
      displayStatusLabel:
        DISPLAY_STATUS_META[displayStatusKey]?.label || row.status,
      isSubmittedTask: true,
      submissionDateIso: row.attendance_date || '',
      submittedOrDateIso: row.attendance_date || '',
      sortAt: row.attendance_date || row.updated_at || row.created_at || '',
      history: buildSubmissionHistory(
        'attendance',
        row,
        internName,
        '',
        reviewerName,
      ),
      row,
    }
  })

  const accomplishmentItems = scopedAccomplishments.map((row) => {
    const internProfile = profileById.get(row.intern_id)
    const displayStatusKey = getDisplayStatusKey('accomplishments', row)
    const internName = resolveName(row.intern_id)
    const reviewerName = resolveName(row.reviewed_by)
    const subDateIso = extractIsoDatePart(row.created_at) || row.week_of || ''

    return {
      key: `accomplishments-${row.id}`,
      id: row.id,
      kind: 'accomplishments',
      tableName: TABLE_BY_KIND.accomplishments,
      typeLabel: TYPE_LABEL_SINGULAR.accomplishments,
      internId: row.intern_id,
      internName,
      studentIdNo: internProfile?.student_id_no?.trim() || '',
      companyName: internProfile?.company_name?.trim() || '',
      supervisorId: internProfile?.supervisor_id || null,
      supervisorName: resolveSupervisorNameForIntern(internProfile),
      reviewerName,
      assignerName: '',
      renderedMinutes: null,
      isIncompleteAttendance: false,
      titleSummary: row.title,
      subtitleSummary: row.week_of ? `Week of ${formatWeekRange(row.week_of)}` : '',
      shortTitle: row.title,
      csvTitleOrDate: row.title,
      reportingPeriod: row.week_of ? formatWeekRange(row.week_of) : '—',
      status: row.status,
      displayStatusKey,
      displayStatusLabel:
        DISPLAY_STATUS_META[displayStatusKey]?.label || row.status,
      isSubmittedTask: true,
      submissionDateIso: subDateIso,
      submittedOrDateIso: subDateIso,
      sortAt: row.updated_at || row.created_at || row.week_of || '',
      history: buildSubmissionHistory(
        'accomplishments',
        row,
        internName,
        '',
        reviewerName,
      ),
      row,
    }
  })

  const taskItems = scopedTasks.map((row) => {
    const internProfile = profileById.get(row.intern_id)
    const submittedDateIso = extractIsoDatePart(row.submitted_at)
    const displayStatusKey = getDisplayStatusKey('tasks', row)
    const internName = resolveName(row.intern_id)
    const assignerName = resolveName(row.assigned_by)
    const reviewerName = resolveName(row.reviewed_by)
    const effectiveDeadline = row.deadline || row.task_date || ''

    return {
      key: `tasks-${row.id}`,
      id: row.id,
      kind: 'tasks',
      tableName: TABLE_BY_KIND.tasks,
      typeLabel: TYPE_LABEL_SINGULAR.tasks,
      internId: row.intern_id,
      internName,
      studentIdNo: internProfile?.student_id_no?.trim() || '',
      companyName: internProfile?.company_name?.trim() || '',
      supervisorId: internProfile?.supervisor_id || null,
      supervisorName: resolveSupervisorNameForIntern(internProfile),
      reviewerName,
      assignerName,
      renderedMinutes: null,
      isIncompleteAttendance: false,
      titleSummary: row.title,
      subtitleSummary: !row.submitted_at ? 'Assigned – Not Submitted' : '',
      shortTitle: row.title,
      csvTitleOrDate: row.title,
      reportingPeriod: effectiveDeadline
        ? `Due ${formatCalendarDate(effectiveDeadline)}`
        : '—',
      status: row.status,
      displayStatusKey,
      displayStatusLabel:
        DISPLAY_STATUS_META[displayStatusKey]?.label || row.status,
      isSubmittedTask: Boolean(row.submitted_at),
      submissionDateIso: submittedDateIso,
      submittedOrDateIso: submittedDateIso || effectiveDeadline,
      sortAt:
        row.submitted_at ||
        row.updated_at ||
        row.created_at ||
        effectiveDeadline,
      history: buildSubmissionHistory(
        'tasks',
        row,
        internName,
        assignerName,
        reviewerName,
      ),
      row,
    }
  })

  const allSubmissions = [
    ...attendanceItems,
    ...accomplishmentItems,
    ...taskItems,
  ].sort((a, b) => String(b.sortAt).localeCompare(String(a.sortAt)))

  // Per-intern accumulators (scoped to active filters)
  const approvedMinutesByIntern = new Map()
  const pendingCountByIntern = new Map()
  const returnedCountByIntern = new Map()
  const overdueTaskItemsByIntern = new Map()
  const returnedItemsByIntern = new Map()
  const incompleteAttendanceByIntern = new Map()
  const hasAttendanceThisWeekByIntern = new Set()
  const hasAccomplishmentThisWeekByIntern = new Set()
  const lastSubmissionDateByIntern = new Map()
  const submissionsByIntern = new Map()

  const pushMap = (map, key, val) => {
    const arr = map.get(key)
    if (arr) arr.push(val)
    else map.set(key, [val])
  }

  const bumpMap = (map, key) => {
    map.set(key, (map.get(key) ?? 0) + 1)
  }

  const trackLastDate = (internId, isoDate) => {
    if (!isoDate) return
    const prev = lastSubmissionDateByIntern.get(internId)
    if (!prev || isoDate > prev) {
      lastSubmissionDateByIntern.set(internId, isoDate)
    }
  }

  for (const item of allSubmissions) {
    pushMap(submissionsByIntern, item.internId, item)

    if (item.kind === 'attendance') {
      trackLastDate(item.internId, item.row.attendance_date)
      if (item.status === 'approved' && item.renderedMinutes > 0) {
        approvedMinutesByIntern.set(
          item.internId,
          (approvedMinutesByIntern.get(item.internId) ?? 0) +
            item.renderedMinutes,
        )
      } else if (item.status === 'pending') {
        bumpMap(pendingCountByIntern, item.internId)
      } else if (item.status === 'returned') {
        bumpMap(returnedCountByIntern, item.internId)
        pushMap(returnedItemsByIntern, item.internId, item)
      }

      if (item.isIncompleteAttendance) {
        pushMap(incompleteAttendanceByIntern, item.internId, item)
      }

      if (
        currentWeekStart &&
        item.row.attendance_date &&
        getMondayOfWeek(item.row.attendance_date) === currentWeekStart
      ) {
        hasAttendanceThisWeekByIntern.add(item.internId)
      }
    } else if (item.kind === 'accomplishments') {
      trackLastDate(item.internId, item.submissionDateIso)
      if (item.status === 'pending') {
        bumpMap(pendingCountByIntern, item.internId)
      } else if (item.status === 'returned') {
        bumpMap(returnedCountByIntern, item.internId)
        pushMap(returnedItemsByIntern, item.internId, item)
      }

      if (
        currentWeekStart &&
        item.row.week_of &&
        getMondayOfWeek(item.row.week_of) === currentWeekStart
      ) {
        hasAccomplishmentThisWeekByIntern.add(item.internId)
      }
    } else if (item.kind === 'tasks') {
      if (item.submissionDateIso) {
        trackLastDate(item.internId, item.submissionDateIso)
      }
      if (item.status === 'pending') {
        if (item.isSubmittedTask) {
          // Pending approval ONLY when submitted_at is present
          bumpMap(pendingCountByIntern, item.internId)
        } else if (item.row.deadline) {
          const diff = getCalendarDayDiff(todayIso, item.row.deadline)
          if (diff !== null && diff < 0) {
            pushMap(overdueTaskItemsByIntern, item.internId, item)
          }
        }
      } else if (item.status === 'returned') {
        bumpMap(returnedCountByIntern, item.internId)
        pushMap(returnedItemsByIntern, item.internId, item)
      }
    }
  }

  const attentionAlerts = []

  const internProgressRows = filteredInterns.map((intern) => {
    const requiredHours =
      Number.isFinite(Number(intern.required_hours)) &&
      Number(intern.required_hours) > 0
        ? Number(intern.required_hours)
        : DEFAULT_REQUIRED_INTERNSHIP_HOURS
    const approvedMinutes = approvedMinutesByIntern.get(intern.id) ?? 0
    const approvedHours = approvedMinutes / 60
    const remainingMinutes = Math.max(
      0,
      Math.round(requiredHours * 60) - approvedMinutes,
    )
    const remainingHours = Math.max(0, requiredHours - approvedHours)
    const progressPct = Math.min(
      100,
      Number(((approvedHours / requiredHours) * 100).toFixed(1)),
    )
    const isComplete = approvedHours >= requiredHours

    // Guard: do not flag interns whose internship_start_date is still in the future
    const startDiff = intern.internship_start_date
      ? getCalendarDayDiff(todayIso, intern.internship_start_date)
      : null
    const hasStarted = startDiff === null || startDiff <= 0

    const pendingCount = pendingCountByIntern.get(intern.id) ?? 0
    const returnedCount = returnedCountByIntern.get(intern.id) ?? 0
    const overdueItems = overdueTaskItemsByIntern.get(intern.id) ?? []
    const returnedItems = returnedItemsByIntern.get(intern.id) ?? []
    const incompleteAttItems = incompleteAttendanceByIntern.get(intern.id) ?? []
    const overdueTasks = overdueItems.length
    const hasAttendanceThisWeek = hasAttendanceThisWeekByIntern.has(intern.id)
    const hasAccomplishmentThisWeek = hasAccomplishmentThisWeekByIntern.has(
      intern.id,
    )
    const lastSubmissionDate = lastSubmissionDateByIntern.get(intern.id) || ''
    const supervisorName = resolveSupervisorNameForIntern(intern)
    const internSubmissions = submissionsByIntern.get(intern.id) ?? []

    // Inactivity check: only for active started interns who haven't met required hours
    let daysSinceActivity = null
    let isInactive = false
    if (hasStarted && !isComplete) {
      const referenceIso = lastSubmissionDate || intern.internship_start_date
      if (referenceIso) {
        const diff = getCalendarDayDiff(referenceIso, todayIso)
        if (diff !== null && diff >= INACTIVE_DAYS_THRESHOLD) {
          daysSinceActivity = diff
          isInactive = true
        }
      }
    }

    const internAlerts = []

    if (!intern.supervisor_id) {
      internAlerts.push({
        id: `no-supervisor-${intern.id}`,
        internId: intern.id,
        internName: intern.full_name,
        studentIdNo: intern.student_id_no?.trim() || '',
        supervisorName: 'Unassigned',
        category: 'unassigned_supervisor',
        categoryLabel: 'No assigned supervisor',
        severity: 'high',
        reason: 'Intern has no assigned supervisor to review submissions.',
        relevantDate: intern.internship_start_date
          ? `Start ${formatCalendarDate(intern.internship_start_date)}`
          : 'Unscheduled',
        actionType: 'view-intern',
        actionLabel: 'View Intern',
        recordItem: null,
      })
    }

    if (overdueItems.length > 0) {
      const mostUrgent = [...overdueItems].sort((a, b) =>
        String(a.row.deadline ?? '').localeCompare(String(b.row.deadline ?? '')),
      )[0]
      internAlerts.push({
        id: `overdue-task-${intern.id}`,
        internId: intern.id,
        internName: intern.full_name,
        studentIdNo: intern.student_id_no?.trim() || '',
        supervisorName,
        category: 'overdue_task',
        categoryLabel: 'Overdue assigned task',
        severity: 'high',
        reason:
          overdueItems.length === 1
            ? `Task "${mostUrgent.row.title}" passed its deadline without submission.`
            : `${overdueItems.length} assigned tasks are past deadline and not yet submitted.`,
        relevantDate: mostUrgent.row.deadline
          ? `Due ${formatCalendarDate(mostUrgent.row.deadline)}`
          : '—',
        actionType: 'view-record',
        actionLabel: 'View Record',
        recordItem: mostUrgent,
      })
    }

    if (incompleteAttItems.length > 0) {
      const firstInc = incompleteAttItems[0]
      internAlerts.push({
        id: `incomplete-att-${intern.id}`,
        internId: intern.id,
        internName: intern.full_name,
        studentIdNo: intern.student_id_no?.trim() || '',
        supervisorName,
        category: 'incomplete_attendance',
        categoryLabel: 'Incomplete attendance',
        severity: 'high',
        reason:
          incompleteAttItems.length === 1
            ? 'Attendance entry has missing or zero-duration time log.'
            : `${incompleteAttItems.length} attendance entries have incomplete time logs.`,
        relevantDate: firstInc.row.attendance_date
          ? formatCalendarDate(firstInc.row.attendance_date)
          : '—',
        actionType: 'view-record',
        actionLabel: 'View Record',
        recordItem: firstInc,
      })
    }

    if (returnedItems.length > 0) {
      const latestReturned = returnedItems[0]
      const revIso = extractIsoDatePart(latestReturned.row.reviewed_at)
      internAlerts.push({
        id: `returned-${intern.id}`,
        internId: intern.id,
        internName: intern.full_name,
        studentIdNo: intern.student_id_no?.trim() || '',
        supervisorName,
        category: 'returned_submission',
        categoryLabel: 'Returned for revision',
        severity: 'medium',
        reason:
          returnedItems.length === 1
            ? `${latestReturned.typeLabel} returned by supervisor, awaiting intern resubmission.`
            : `${returnedItems.length} returned submissions awaiting intern revision.`,
        relevantDate: revIso ? `Returned ${formatCalendarDate(revIso)}` : '—',
        actionType: 'view-record',
        actionLabel: 'View Record',
        recordItem: latestReturned,
      })
    }

    if (isInactive) {
      internAlerts.push({
        id: `inactive-${intern.id}`,
        internId: intern.id,
        internName: intern.full_name,
        studentIdNo: intern.student_id_no?.trim() || '',
        supervisorName,
        category: 'inactive_intern',
        categoryLabel: 'Inactive intern',
        severity: 'high',
        reason: lastSubmissionDate
          ? `No new submission logged in ${daysSinceActivity} days.`
          : `No submissions recorded since internship start (${daysSinceActivity} days ago).`,
        relevantDate: lastSubmissionDate
          ? `Last: ${formatCalendarDate(lastSubmissionDate)}`
          : `Start: ${formatCalendarDate(intern.internship_start_date)}`,
        actionType: 'view-intern',
        actionLabel: 'View Intern',
        recordItem: null,
      })
    }

    if (hasStarted && !isComplete && !hasAttendanceThisWeek) {
      internAlerts.push({
        id: `missing-attendance-${intern.id}`,
        internId: intern.id,
        internName: intern.full_name,
        studentIdNo: intern.student_id_no?.trim() || '',
        supervisorName,
        category: 'missing_attendance',
        categoryLabel: 'Missing weekly attendance',
        severity: 'medium',
        reason: 'No attendance entries recorded for the current work week.',
        relevantDate: currentWeekStart
          ? formatWeekRange(currentWeekStart, 5)
          : 'Current week',
        actionType: 'view-intern',
        actionLabel: 'View Intern',
        recordItem: null,
      })
    }

    if (hasStarted && !isComplete && !hasAccomplishmentThisWeek) {
      internAlerts.push({
        id: `missing-accomplishment-${intern.id}`,
        internId: intern.id,
        internName: intern.full_name,
        studentIdNo: intern.student_id_no?.trim() || '',
        supervisorName,
        category: 'missing_accomplishment',
        categoryLabel: 'Missing weekly accomplishment',
        severity: 'info',
        reason: 'No weekly accomplishment report logged for the current week.',
        relevantDate: currentWeekStart
          ? formatWeekRange(currentWeekStart)
          : 'Current week',
        actionType: 'view-intern',
        actionLabel: 'View Intern',
        recordItem: null,
      })
    }

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
    if (!intern.supervisor_id) {
      attentionFlags.push('No assigned supervisor')
    }
    if (incompleteAttItems.length > 0) {
      attentionFlags.push(
        `${incompleteAttItems.length} incomplete attendance ${incompleteAttItems.length === 1 ? 'record' : 'records'}`,
      )
    }
    if (hasStarted && !isComplete && !hasAttendanceThisWeek) {
      attentionFlags.push('No attendance this week')
    }
    if (hasStarted && !isComplete && !hasAccomplishmentThisWeek) {
      attentionFlags.push('No accomplishment this week')
    }
    if (isInactive) {
      attentionFlags.push(`Inactive (${daysSinceActivity}d)`)
    }

    attentionAlerts.push(...internAlerts)

    return {
      ...intern,
      supervisorName,
      approvedMinutes,
      approvedHours,
      requiredHours,
      remainingMinutes,
      remainingHours,
      progressPct,
      isComplete,
      hasStarted,
      pendingCount,
      returnedCount,
      overdueTasks,
      hasAttendanceThisWeek,
      hasAccomplishmentThisWeek,
      lastSubmissionDate,
      isInactive,
      attentionFlags,
      alerts: internAlerts,
      submissions: internSubmissions,
      needsAttention: internAlerts.length > 0 || pendingCount > 0,
    }
  })

  const severityRank = { high: 0, medium: 1, info: 2 }
  attentionAlerts.sort((a, b) => {
    const diff = severityRank[a.severity] - severityRank[b.severity]
    if (diff !== 0) return diff
    return String(a.internName).localeCompare(String(b.internName))
  })

  const flaggedInterns = internProgressRows.filter((row) => row.needsAttention)

  // Supervisor Workload summary (respecting active company/supervisor filters)
  const scopedSupervisors = allSupervisorProfiles.filter((sup) => {
    if (supervisorId === 'unassigned') return false
    if (supervisorId !== 'all' && sup.id !== supervisorId) return false
    if (company !== 'all') {
      const supHasScopedIntern = internProgressRows.some(
        (i) => i.supervisor_id === sup.id,
      )
      const supMatchesCompany = (sup.company_name?.trim() || '') === company
      if (!supHasScopedIntern && !supMatchesCompany) return false
    }
    return true
  })

  const supervisorWorkload = scopedSupervisors.map((sup) => {
    const assignedInterns = internProgressRows.filter(
      (i) => i.supervisor_id === sup.id,
    )
    const assignedIdSet = new Set(assignedInterns.map((i) => i.id))
    const supSubmissions = allSubmissions.filter((item) =>
      assignedIdSet.has(item.internId),
    )

    let pendingReviews = 0
    let approvedSubmissions = 0
    let returnedSubmissions = 0
    let rejectedSubmissions = 0
    let turnaroundSumHours = 0
    let turnaroundSampleCount = 0

    for (const item of supSubmissions) {
      if (item.displayStatusKey === 'pending') pendingReviews += 1
      else if (item.displayStatusKey === 'approved') approvedSubmissions += 1
      else if (item.displayStatusKey === 'returned') returnedSubmissions += 1
      else if (item.displayStatusKey === 'rejected') rejectedSubmissions += 1

      const turnaround = computeReviewTurnaroundHours(item.kind, item.row)
      if (turnaround !== null) {
        turnaroundSumHours += turnaround
        turnaroundSampleCount += 1
      }
    }

    const avgReviewTurnaroundHours =
      turnaroundSampleCount > 0
        ? Number((turnaroundSumHours / turnaroundSampleCount).toFixed(2))
        : null

    return {
      ...sup,
      assignedInternsCount: assignedInterns.length,
      assignedInterns,
      pendingReviews,
      approvedSubmissions,
      returnedSubmissions,
      rejectedSubmissions,
      totalReviewed:
        approvedSubmissions + returnedSubmissions + rejectedSubmissions,
      avgReviewTurnaroundHours,
      avgReviewTurnaroundLabel: formatTurnaroundHours(avgReviewTurnaroundHours),
    }
  })

  // Overall review turnaround across all scoped reviewed records
  let overallTurnaroundSum = 0
  let overallTurnaroundCount = 0
  for (const item of allSubmissions) {
    const turnaround = computeReviewTurnaroundHours(item.kind, item.row)
    if (turnaround !== null) {
      overallTurnaroundSum += turnaround
      overallTurnaroundCount += 1
    }
  }
  const overallAvgTurnaroundHours =
    overallTurnaroundCount > 0
      ? Number((overallTurnaroundSum / overallTurnaroundCount).toFixed(2))
      : null
  const overallAvgTurnaroundLabel = formatTurnaroundHours(
    overallAvgTurnaroundHours,
  )

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

  const attendanceCounts = countByStatus(scopedAttendance, false)
  const accomplishmentCounts = countByStatus(scopedAccomplishments, false)
  const taskCounts = countByStatus(scopedTasks, true)

  const reportMatrix = [
    { key: 'attendance', label: 'Attendance', ...attendanceCounts },
    {
      key: 'accomplishments',
      label: 'Accomplishments',
      ...accomplishmentCounts,
    },
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

  // Internship Progress Distribution across bands
  const progressBands = [
    { key: 'not_started', label: '0% (Not started)', min: 0, max: 0, count: 0 },
    { key: 'early', label: '1% – 24%', min: 0.01, max: 24.99, count: 0 },
    { key: 'quarter', label: '25% – 49%', min: 25, max: 49.99, count: 0 },
    { key: 'half', label: '50% – 74%', min: 50, max: 74.99, count: 0 },
    { key: 'near', label: '75% – 99%', min: 75, max: 99.99, count: 0 },
    { key: 'complete', label: '100% (Completed)', min: 100, max: 100, count: 0 },
  ]

  for (const intern of internProgressRows) {
    if (intern.progressPct <= 0) progressBands[0].count += 1
    else if (intern.progressPct < 25) progressBands[1].count += 1
    else if (intern.progressPct < 50) progressBands[2].count += 1
    else if (intern.progressPct < 75) progressBands[3].count += 1
    else if (intern.progressPct < 100) progressBands[4].count += 1
    else progressBands[5].count += 1
  }

  const totalInternCount = internProgressRows.length
  const progressDistribution = progressBands.map((band) => ({
    ...band,
    sharePct:
      totalInternCount > 0
        ? Number(((band.count / totalInternCount) * 100).toFixed(1))
        : 0,
  }))

  const totalApprovedMinutes = internProgressRows.reduce(
    (sum, intern) => sum + intern.approvedMinutes,
    0,
  )

  const totalRequiredHours = internProgressRows.reduce(
    (sum, intern) => sum + intern.requiredHours,
    0,
  )

  const totalRemainingMinutes = internProgressRows.reduce(
    (sum, intern) => sum + intern.remainingMinutes,
    0,
  )

  const avgProgressPct =
    totalInternCount > 0
      ? Number(
          (
            internProgressRows.reduce((s, i) => s + i.progressPct, 0) /
            totalInternCount
          ).toFixed(1),
        )
      : 0

  // Helper: count interns eligible (already started & not completed) during a given week
  const countEligibleInternsForWeek = (weekMondayIso) => {
    const weekEndIso = addDaysToIso(weekMondayIso, 6)
    let count = 0
    for (const intern of internProgressRows) {
      if (intern.isComplete) continue
      if (
        intern.internship_start_date &&
        weekEndIso &&
        intern.internship_start_date > weekEndIso
      ) {
        continue
      }
      count += 1
    }
    return count
  }

  const eligibleThisWeekInterns = internProgressRows.filter(
    (intern) => intern.hasStarted && !intern.isComplete,
  )
  const eligibleThisWeekCount = eligibleThisWeekInterns.length
  const includeCurrentWeekInTrends =
    Boolean(currentWeekStart) &&
    eligibleThisWeekCount > 0 &&
    recordMatchesPeriodFilters(currentWeekStart)

  // B. Attendance Analytics — weekly submission trends, approved hours per week, compliance & missing trends
  const attendanceWeekBuckets = new Map()
  const ensureAttWeek = (weekMonday) => {
    if (!weekMonday) return null
    let bucket = attendanceWeekBuckets.get(weekMonday)
    if (!bucket) {
      bucket = {
        weekOf: weekMonday,
        label: formatShortIsoDate(weekMonday),
        rangeLabel: formatWeekRange(weekMonday, 5),
        submissionsCount: 0,
        approvedCount: 0,
        pendingCount: 0,
        returnedCount: 0,
        approvedMinutes: 0,
        internIds: new Set(),
      }
      attendanceWeekBuckets.set(weekMonday, bucket)
    }
    return bucket
  }

  for (const item of attendanceItems) {
    const weekMonday =
      getMondayOfWeek(item.row.week_of || item.row.attendance_date) || ''
    const bucket = ensureAttWeek(weekMonday)
    if (!bucket) continue
    bucket.submissionsCount += 1
    bucket.internIds.add(item.internId)
    if (item.status === 'approved') {
      bucket.approvedCount += 1
      if (item.renderedMinutes > 0) {
        bucket.approvedMinutes += item.renderedMinutes
      }
    } else if (item.status === 'pending') {
      bucket.pendingCount += 1
    } else if (item.status === 'returned') {
      bucket.returnedCount += 1
    }
  }

  if (includeCurrentWeekInTrends) {
    ensureAttWeek(currentWeekStart)
  }

  const attendanceWeeklyTrends = [...attendanceWeekBuckets.values()]
    .sort((a, b) => a.weekOf.localeCompare(b.weekOf))
    .slice(-12)
    .map((bucket) => {
      const eligible = countEligibleInternsForWeek(bucket.weekOf)
      const logged = bucket.internIds.size
      const missing = Math.max(0, eligible - logged)
      return {
        weekOf: bucket.weekOf,
        label: bucket.label,
        rangeLabel: bucket.rangeLabel,
        submissionsCount: bucket.submissionsCount,
        approvedCount: bucket.approvedCount,
        pendingCount: bucket.pendingCount,
        returnedCount: bucket.returnedCount,
        approvedMinutes: bucket.approvedMinutes,
        approvedHours: Number((bucket.approvedMinutes / 60).toFixed(2)),
        loggedInternsCount: logged,
        eligibleInternsCount: eligible,
        missingInternsCount: missing,
        complianceRatePct:
          eligible > 0 ? Number(((logged / eligible) * 100).toFixed(1)) : null,
      }
    })

  const loggedAttendanceThisWeek = eligibleThisWeekInterns.filter(
    (intern) => intern.hasAttendanceThisWeek,
  ).length
  const missingAttendanceThisWeek = Math.max(
    0,
    eligibleThisWeekCount - loggedAttendanceThisWeek,
  )
  const attendanceComplianceRatePct =
    eligibleThisWeekCount > 0
      ? Number(
          ((loggedAttendanceThisWeek / eligibleThisWeekCount) * 100).toFixed(1),
        )
      : null

  const attendanceAnalytics = {
    weeklyTrends: attendanceWeeklyTrends,
    totalEntries: attendanceCounts.total,
    approvedEntries: attendanceCounts.approved,
    pendingEntries: attendanceCounts.pending,
    returnedEntries: attendanceCounts.returned,
    totalApprovedMinutes,
    totalApprovedHours: Number((totalApprovedMinutes / 60).toFixed(2)),
    eligibleThisWeekCount,
    loggedThisWeekCount: loggedAttendanceThisWeek,
    missingThisWeekCount: missingAttendanceThisWeek,
    complianceRatePct: attendanceComplianceRatePct,
  }

  // C. Accomplishment Analytics — weekly submission trends + status/missing breakdown
  const accomplishmentWeekBuckets = new Map()
  const ensureAccWeek = (weekMonday) => {
    if (!weekMonday) return null
    let bucket = accomplishmentWeekBuckets.get(weekMonday)
    if (!bucket) {
      bucket = {
        weekOf: weekMonday,
        label: formatShortIsoDate(weekMonday),
        rangeLabel: formatWeekRange(weekMonday),
        submittedCount: 0,
        approvedCount: 0,
        pendingCount: 0,
        returnedCount: 0,
        rejectedCount: 0,
        internIds: new Set(),
      }
      accomplishmentWeekBuckets.set(weekMonday, bucket)
    }
    return bucket
  }

  for (const item of accomplishmentItems) {
    const weekMonday =
      getMondayOfWeek(item.row.week_of || item.submissionDateIso) || ''
    const bucket = ensureAccWeek(weekMonday)
    if (!bucket) continue
    bucket.submittedCount += 1
    bucket.internIds.add(item.internId)
    if (item.status === 'approved') bucket.approvedCount += 1
    else if (item.status === 'pending') bucket.pendingCount += 1
    else if (item.status === 'returned') bucket.returnedCount += 1
    else if (item.status === 'rejected') bucket.rejectedCount += 1
  }

  if (includeCurrentWeekInTrends) {
    ensureAccWeek(currentWeekStart)
  }

  const accomplishmentWeeklyTrends = [...accomplishmentWeekBuckets.values()]
    .sort((a, b) => a.weekOf.localeCompare(b.weekOf))
    .slice(-12)
    .map((bucket) => {
      const eligible = countEligibleInternsForWeek(bucket.weekOf)
      const logged = bucket.internIds.size
      const missing = Math.max(0, eligible - logged)
      return {
        weekOf: bucket.weekOf,
        label: bucket.label,
        rangeLabel: bucket.rangeLabel,
        submittedCount: bucket.submittedCount,
        approvedCount: bucket.approvedCount,
        pendingCount: bucket.pendingCount,
        returnedCount: bucket.returnedCount,
        rejectedCount: bucket.rejectedCount,
        loggedInternsCount: logged,
        missingInternsCount: missing,
      }
    })

  const loggedAccomplishmentsThisWeek = eligibleThisWeekInterns.filter(
    (intern) => intern.hasAccomplishmentThisWeek,
  ).length
  const missingAccomplishmentsThisWeek = Math.max(
    0,
    eligibleThisWeekCount - loggedAccomplishmentsThisWeek,
  )

  const accomplishmentAnalytics = {
    weeklyTrends: accomplishmentWeeklyTrends,
    submittedTotal: accomplishmentCounts.total,
    pendingCount: accomplishmentCounts.pending,
    approvedCount: accomplishmentCounts.approved,
    returnedCount: accomplishmentCounts.returned,
    rejectedCount: accomplishmentCounts.rejected,
    missingThisWeekCount: missingAccomplishmentsThisWeek,
  }

  // D. Task Analytics
  let overdueTaskCount = 0
  for (const item of taskItems) {
    if (
      item.status === 'pending' &&
      !item.isSubmittedTask &&
      item.row.deadline
    ) {
      const diff = getCalendarDayDiff(todayIso, item.row.deadline)
      if (diff !== null && diff < 0) overdueTaskCount += 1
    }
  }

  const taskAnalytics = {
    assignedCount: taskCounts.total,
    completedCount: taskCounts.approved,
    pendingSubmittedCount: taskCounts.pending,
    notSubmittedCount: taskCounts.notSubmitted,
    returnedCount: taskCounts.returned,
    rejectedCount: taskCounts.rejected,
    overdueCount: overdueTaskCount,
    completionRatePct:
      taskCounts.total > 0
        ? Number(((taskCounts.approved / taskCounts.total) * 100).toFixed(1))
        : null,
  }

  // A. Internship Progress Analytics
  const progressAnalytics = {
    avgCompletionPct: avgProgressPct,
    totalApprovedMinutes,
    totalApprovedHours: Number((totalApprovedMinutes / 60).toFixed(2)),
    totalRequiredHours,
    totalRemainingMinutes,
    totalRemainingHours: Number((totalRemainingMinutes / 60).toFixed(2)),
    distribution: progressDistribution,
  }

  // E. Supervisor Performance Analytics
  const supervisorAnalytics = {
    supervisors: supervisorWorkload,
    totalSupervisors: supervisorWorkload.length,
    totalPendingReviews: supervisorWorkload.reduce(
      (sum, s) => sum + s.pendingReviews,
      0,
    ),
    overallAvgTurnaroundHours,
    overallAvgTurnaroundLabel,
  }

  const totals = {
    totalInterns: totalInternCount,
    totalSupervisors: supervisorWorkload.length,
    totalPendingApprovals: reportTotals.pending,
    internsNeedingAttention: flaggedInterns.length,
    activeAlertsCount: attentionAlerts.length,
    totalApprovedMinutes,
    totalApprovedHours: totalApprovedMinutes / 60,
    totalRequiredHours,
    totalRemainingMinutes,
    totalRemainingHours: totalRemainingMinutes / 60,
    avgProgressPct,
    overallAvgTurnaroundHours,
    overallAvgTurnaroundLabel,
  }

  return {
    interns: filteredInterns,
    internProgressRows,
    flaggedInterns,
    attentionAlerts,
    supervisorWorkload,
    allSubmissions,
    totals,
    reportMatrix,
    reportTotals,
    progressDistribution,
    progressAnalytics,
    attendanceAnalytics,
    accomplishmentAnalytics,
    taskAnalytics,
    supervisorAnalytics,
  }
}

export function useCoordinatorData(filters = {}) {
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
          'id, full_name, role, supervisor_id, student_id_no, company_name, school_name, course, required_hours, internship_start_date, created_at',
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

  const filterOptions = useMemo(
    () =>
      extractFilterOptions({
        profiles: hasLoaded ? dataState.profiles : [],
        attendance: hasLoaded ? dataState.attendance : [],
        accomplishments: hasLoaded ? dataState.accomplishments : [],
        tasks: hasLoaded ? dataState.tasks : [],
      }),
    [
      dataState.accomplishments,
      dataState.attendance,
      dataState.profiles,
      dataState.tasks,
      hasLoaded,
    ],
  )

  const {
    academicYear = 'all',
    semester = 'all',
    batch = 'all',
    company = 'all',
    supervisorId = 'all',
    dateFrom = '',
    dateTo = '',
  } = filters

  const derived = useMemo(
    () =>
      buildCoordinatorMonitoringData({
        profiles: hasLoaded ? dataState.profiles : [],
        attendance: hasLoaded ? dataState.attendance : [],
        accomplishments: hasLoaded ? dataState.accomplishments : [],
        tasks: hasLoaded ? dataState.tasks : [],
        filters: {
          academicYear,
          semester,
          batch,
          company,
          supervisorId,
          dateFrom,
          dateTo,
        },
        todayIso: getTodayIsoDate(),
      }),
    [
      academicYear,
      batch,
      company,
      dataState.accomplishments,
      dataState.attendance,
      dataState.profiles,
      dataState.tasks,
      dateFrom,
      dateTo,
      hasLoaded,
      semester,
      supervisorId,
    ],
  )

  return {
    loading,
    loadError,
    filterOptions,
    interns: derived.interns,
    internProgressRows: derived.internProgressRows,
    flaggedInterns: derived.flaggedInterns,
    attentionAlerts: derived.attentionAlerts,
    supervisorWorkload: derived.supervisorWorkload,
    allSubmissions: derived.allSubmissions,
    totals: derived.totals,
    reportMatrix: derived.reportMatrix,
    reportTotals: derived.reportTotals,
    progressDistribution: derived.progressDistribution,
    progressAnalytics: derived.progressAnalytics,
    attendanceAnalytics: derived.attendanceAnalytics,
    accomplishmentAnalytics: derived.accomplishmentAnalytics,
    taskAnalytics: derived.taskAnalytics,
    supervisorAnalytics: derived.supervisorAnalytics,
    reload,
  }
}
