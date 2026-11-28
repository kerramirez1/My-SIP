import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_BREAK_MINUTES,
  computeElapsedMinutes,
  formatDurationMinutes,
} from './attendanceUtils'
import { DEFAULT_REQUIRED_INTERNSHIP_HOURS } from './internDashboardUtils'
import {
  isMissingSchemaRelationError,
  resolveHostOrganizationName,
  runWithSchemaFallback,
} from './schemaCompat'
import { supabase } from './supabaseClient'
import {
  formatCalendarDate,
  formatWeekRange,
  formatWeekdayCalendarDate,
} from './weekUtils'

const EMPTY_DATA_STATE = {
  loadedKey: '',
  interns: [],
  attendance: [],
  accomplishments: [],
  weeklyReflections: [],
  tasks: [],
  error: '',
}

const TYPE_LABEL_SINGULAR = {
  attendance: 'Attendance',
  accomplishments: 'Accomplishment',
  tasks: 'Task',
}

const INTERNS_SELECT_LATEST =
  'id, full_name, student_id_no, company_name, department_office, internship_type, school_name, course, year_level, required_hours, internship_start_date, internship_end_date'

const INTERNS_SELECT_LEGACY =
  'id, full_name, student_id_no, company_name, school_name, course, required_hours, internship_start_date'

const ACCOMPLISHMENTS_SELECT_LATEST =
  'id, intern_id, week_of, entry_date, title, description, output_result, skills_acquired, challenges_encountered, lessons_learned, attachment_url, status, reviewed_by, reviewer_remarks, reviewed_at, created_at, updated_at'

const ACCOMPLISHMENTS_SELECT_LEGACY =
  'id, intern_id, week_of, title, description, skills_acquired, challenges_encountered, lessons_learned, attachment_url, status, reviewed_by, reviewer_remarks, reviewed_at, created_at, updated_at'

export function extractIsoDatePart(timestamp) {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(timestamp ?? '').trim())
  return match ? match[1] : ''
}

export function formatBreakText(breakMinutes) {
  const safeBreak = breakMinutes ?? DEFAULT_BREAK_MINUTES
  return safeBreak === 0 ? 'No break' : `Break: ${safeBreak} min`
}

export function useSupervisorData(supervisorId) {
  const [reloadCounter, setReloadCounter] = useState(0)
  const [dataState, setDataState] = useState(EMPTY_DATA_STATE)

  const reload = useCallback(() => {
    setReloadCounter((count) => count + 1)
  }, [])

  const currentQueryKey = supervisorId ? `${supervisorId}:${reloadCounter}` : ''

  useEffect(() => {
    if (!supabase || !currentQueryKey) return undefined

    let active = true

    Promise.all([
      runWithSchemaFallback(
        () =>
          supabase
            .from('profiles')
            .select(INTERNS_SELECT_LATEST)
            .eq('role', 'intern')
            .eq('supervisor_id', supervisorId)
            .order('full_name', { ascending: true }),
        () =>
          supabase
            .from('profiles')
            .select(INTERNS_SELECT_LEGACY)
            .eq('role', 'intern')
            .eq('supervisor_id', supervisorId)
            .order('full_name', { ascending: true }),
      ),
      supabase
        .from('weekly_attendance')
        .select(
          'id, intern_id, attendance_date, time_in, time_out, break_minutes, week_of, status, reviewed_by, reviewer_remarks, reviewed_at, created_at, updated_at',
        )
        .order('attendance_date', { ascending: false })
        .order('created_at', { ascending: false }),
      runWithSchemaFallback(
        () =>
          supabase
            .from('accomplishments')
            .select(ACCOMPLISHMENTS_SELECT_LATEST)
            .order('created_at', { ascending: false }),
        () =>
          supabase
            .from('accomplishments')
            .select(ACCOMPLISHMENTS_SELECT_LEGACY)
            .order('created_at', { ascending: false }),
      ),
      supabase
        .from('weekly_accomplishment_reflections')
        .select(
          'id, intern_id, week_of, skills_acquired, challenges_encountered, lessons_learned, created_at, updated_at',
        ),
      supabase
        .from('tasks')
        .select(
          'id, intern_id, assigned_by, title, description, task_date, deadline, priority, completion_description, submission_attachment_url, submitted_at, status, reviewed_by, reviewer_remarks, reviewed_at, created_at, updated_at',
        )
        .order('created_at', { ascending: false }),
    ]).then(
      ([
        internsRes,
        attendanceRes,
        accomplishmentsRes,
        reflectionsRes,
        tasksRes,
      ]) => {
        if (!active) return

        const reflMissing = isMissingSchemaRelationError(reflectionsRes.error)
        const errors = [
          internsRes.error?.message,
          attendanceRes.error?.message,
          accomplishmentsRes.error?.message,
          !reflMissing ? reflectionsRes.error?.message : null,
          tasksRes.error?.message,
        ].filter(Boolean)

        setDataState({
          loadedKey: currentQueryKey,
          interns: internsRes.error ? [] : (internsRes.data ?? []),
          attendance: attendanceRes.error ? [] : (attendanceRes.data ?? []),
          accomplishments: accomplishmentsRes.error
            ? []
            : (accomplishmentsRes.data ?? []),
          weeklyReflections:
            reflectionsRes.error ? [] : (reflectionsRes.data ?? []),
          tasks: tasksRes.error ? [] : (tasksRes.data ?? []),
          error: errors.length > 0 ? errors[0] : '',
        })
      },
    )

    return () => {
      active = false
    }
  }, [currentQueryKey, supervisorId])

  const loading = Boolean(
    supabase && currentQueryKey && dataState.loadedKey !== currentQueryKey,
  )
  const hasLoaded = dataState.loadedKey === currentQueryKey
  const loadError = hasLoaded ? dataState.error : ''

  const derived = useMemo(() => {
    const interns = hasLoaded ? dataState.interns : []
    const internById = new Map(interns.map((intern) => [intern.id, intern]))

    const attendance = (hasLoaded ? dataState.attendance : []).filter((row) =>
      internById.has(row.intern_id),
    )
    const accomplishments = (hasLoaded ? dataState.accomplishments : []).filter(
      (row) => internById.has(row.intern_id),
    )
    const weeklyReflections = (
      hasLoaded ? dataState.weeklyReflections : []
    ).filter((row) => internById.has(row.intern_id))
    const tasks = (hasLoaded ? dataState.tasks : []).filter((row) =>
      internById.has(row.intern_id),
    )

    // Group all accomplishment entries and reflections by (intern_id, week_of)
    // so the Weekly Accomplishment Document renders the full canonical week.
    const accomplishmentsByInternWeek = new Map()
    for (const row of accomplishments) {
      const weekKey = `${row.intern_id}:${row.week_of}`
      const list = accomplishmentsByInternWeek.get(weekKey)
      if (list) list.push(row)
      else accomplishmentsByInternWeek.set(weekKey, [row])
    }

    const reflectionsByInternWeek = new Map()
    for (const refl of weeklyReflections) {
      reflectionsByInternWeek.set(`${refl.intern_id}:${refl.week_of}`, refl)
    }

    // Approved break-adjusted attendance minutes per intern
    const approvedMinutesByIntern = new Map()
    for (const row of attendance) {
      if (row.status !== 'approved') continue
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
    }

    const internProgressRows = interns.map((intern) => {
      const requiredHours =
        Number.isFinite(Number(intern.required_hours)) &&
        Number(intern.required_hours) > 0
          ? Number(intern.required_hours)
          : DEFAULT_REQUIRED_INTERNSHIP_HOURS
      const approvedMinutes = approvedMinutesByIntern.get(intern.id) ?? 0
      const approvedHours = approvedMinutes / 60
      const progressPercent = Math.min(
        100,
        Number(((approvedHours / requiredHours) * 100).toFixed(1)),
      )
      return {
        ...intern,
        requiredHours,
        approvedMinutes,
        approvedHours,
        progressPercent,
        isComplete: approvedHours >= requiredHours,
      }
    })

    // Pending reviews queue (newest first)
    const pendingAttendance = attendance
      .filter((row) => row.status === 'pending')
      .map((row) => {
        const minutes = computeElapsedMinutes(
          row.time_in,
          row.time_out,
          row.break_minutes ?? DEFAULT_BREAK_MINUTES,
        )
        return {
          key: `attendance-${row.id}`,
          type: 'attendance',
          typeLabel: TYPE_LABEL_SINGULAR.attendance,
          internName: internById.get(row.intern_id)?.full_name || 'Intern',
          sortAt: row.updated_at || row.created_at || row.attendance_date || '',
          renderedMinutes: minutes !== null && minutes >= 0 ? minutes : null,
          row,
        }
      })

    const buildAccomplishmentPlacementMeta = (row) => {
      const intern = internById.get(row.intern_id)
      const weekKey = `${row.intern_id}:${row.week_of}`
      return {
        internName: intern?.full_name || 'Intern',
        studentIdNo: intern?.student_id_no || '',
        course: intern?.course || '',
        yearLevel: intern?.year_level || '',
        schoolName: intern?.school_name || '',
        internshipType: intern?.internship_type || '',
        hostOrganization: resolveHostOrganizationName(intern),
        companyName: intern?.company_name || '',
        departmentOffice: intern?.department_office || '',
        requiredHours: intern?.required_hours ?? null,
        internshipStartDate: intern?.internship_start_date || '',
        internshipEndDate: intern?.internship_end_date || '',
        weekRows: accomplishmentsByInternWeek.get(weekKey) ?? [row],
        weeklyReflection: reflectionsByInternWeek.get(weekKey) ?? null,
      }
    }

    const pendingAccomplishments = accomplishments
      .filter((row) => row.status === 'pending')
      .map((row) => ({
        key: `accomplishments-${row.id}`,
        type: 'accomplishments',
        typeLabel: TYPE_LABEL_SINGULAR.accomplishments,
        ...buildAccomplishmentPlacementMeta(row),
        sortAt:
          row.updated_at ||
          row.created_at ||
          row.entry_date ||
          row.week_of ||
          '',
        row,
      }))

    // Tasks MUST have status === 'pending' AND submitted_at IS NOT NULL
    const pendingTasks = tasks
      .filter((row) => row.status === 'pending' && Boolean(row.submitted_at))
      .map((row) => ({
        key: `tasks-${row.id}`,
        type: 'tasks',
        typeLabel: TYPE_LABEL_SINGULAR.tasks,
        internName: internById.get(row.intern_id)?.full_name || 'Intern',
        sortAt: row.submitted_at || row.updated_at || row.created_at || '',
        row,
      }))

    const pendingItems = [
      ...pendingAttendance,
      ...pendingAccomplishments,
      ...pendingTasks,
    ].sort((a, b) => String(b.sortAt).localeCompare(String(a.sortAt)))

    // Review history: all rows reviewed by this supervisor, newest first
    const allReviews = [
      ...attendance
        .filter((row) => row.reviewed_by === supervisorId && row.reviewed_at)
        .map((row) => {
          const minutes = computeElapsedMinutes(
            row.time_in,
            row.time_out,
            row.break_minutes ?? DEFAULT_BREAK_MINUTES,
          )
          const durationSuffix =
            minutes !== null && minutes >= 0
              ? ` (${formatDurationMinutes(minutes)})`
              : ''
          return {
            key: `rev-attendance-${row.id}`,
            internName: internById.get(row.intern_id)?.full_name || 'Intern',
            typeLabel: TYPE_LABEL_SINGULAR.attendance,
            summaryLabel: `${formatCalendarDate(row.attendance_date)}${durationSuffix}`,
            status: row.status,
            remarks: row.reviewer_remarks,
            reviewedAt: row.reviewed_at,
          }
        }),
      ...accomplishments
        .filter((row) => row.reviewed_by === supervisorId && row.reviewed_at)
        .map((row) => {
          const datePrefix = row.entry_date
            ? `${formatWeekdayCalendarDate(row.entry_date)} — `
            : ''
          return {
            key: `rev-accomplishments-${row.id}`,
            type: 'accomplishments',
            ...buildAccomplishmentPlacementMeta(row),
            typeLabel: TYPE_LABEL_SINGULAR.accomplishments,
            summaryLabel: `${datePrefix}${row.title} (${formatWeekRange(row.week_of, 5)})`,
            status: row.status,
            remarks: row.reviewer_remarks,
            reviewedAt: row.reviewed_at,
            row,
          }
        }),
      ...tasks
        .filter((row) => row.reviewed_by === supervisorId && row.reviewed_at)
        .map((row) => ({
          key: `rev-tasks-${row.id}`,
          internName: internById.get(row.intern_id)?.full_name || 'Intern',
          typeLabel: TYPE_LABEL_SINGULAR.tasks,
          summaryLabel: row.title,
          status: row.status,
          remarks: row.reviewer_remarks,
          reviewedAt: row.reviewed_at,
        })),
    ].sort((a, b) => String(b.reviewedAt).localeCompare(String(a.reviewedAt)))

    const recentReviews = allReviews.slice(0, 10)

    return {
      interns,
      internById,
      internProgressRows,
      pendingItems,
      pendingCounts: {
        all: pendingItems.length,
        attendance: pendingAttendance.length,
        accomplishments: pendingAccomplishments.length,
        tasks: pendingTasks.length,
      },
      recentReviews,
      reviewHistory: allReviews,
    }
  }, [
    dataState.accomplishments,
    dataState.attendance,
    dataState.interns,
    dataState.tasks,
    dataState.weeklyReflections,
    hasLoaded,
    supervisorId,
  ])

  return {
    loading,
    loadError,
    interns: derived.interns,
    internById: derived.internById,
    internProgressRows: derived.internProgressRows,
    pendingItems: derived.pendingItems,
    pendingCounts: derived.pendingCounts,
    recentReviews: derived.recentReviews,
    reviewHistory: derived.reviewHistory,
    reload,
  }
}
