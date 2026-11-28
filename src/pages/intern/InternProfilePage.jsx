import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertMessage } from '../../components/AlertMessage'
import { FormField } from '../../components/FormField'
import { EditIcon } from '../../components/Icons'
import { SubmissionDialog } from '../../components/SubmissionDialog'
import { useAuth } from '../../context/useAuth'
import {
  DEFAULT_BREAK_MINUTES,
  computeElapsedMinutes,
  formatDecimalHours,
  formatDurationMinutes,
} from '../../lib/attendanceUtils'
import { getRequiredInternshipHours } from '../../lib/internDashboardUtils'
import {
  formatInternshipPeriod,
  formatInternshipTypeLabel,
  resolveHostOrganizationName,
  runWithSchemaFallback,
} from '../../lib/schemaCompat'
import { isDraftAccomplishment } from '../../lib/submissionHelpers'
import { supabase } from '../../lib/supabaseClient'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useFormValidationSync } from '../../lib/useFormValidationSync'
import { formatCalendarDate } from '../../lib/weekUtils'

const EMPTY_PROFILE_DATA = {
  loadedKey: '',
  supervisor: null,
  attendance: [],
  accomplishments: [],
  tasks: [],
  error: '',
}

function setFieldInvalidFallback(input, invalid) {
  if (!input) return
  input.classList.toggle('user-invalid-fallback', invalid)
  input.setAttribute('aria-invalid', invalid ? 'true' : 'false')
  input.closest('.field-group')?.classList.toggle('has-error-fallback', invalid)
}

function EditNameForm({ internId, currentName, onClose, onSaved }) {
  const [fullName, setFullName] = useState(currentName || '')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const formRef = useRef(null)
  const nameInputRef = useRef(null)

  useFormValidationSync(formRef)

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      nameInputRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()

    if (!supabase || !internId) {
      setFormError('Unable to verify your intern profile session.')
      return
    }

    const trimmedName = fullName.trim()
    if (!trimmedName) {
      setFormError('Full name is required.')
      setFieldInvalidFallback(nameInputRef.current, true)
      nameInputRef.current?.focus()
      return
    }

    setSaving(true)
    setFormError('')

    const { error } = await supabase
      .from('profiles')
      .update({ full_name: trimmedName })
      .eq('id', internId)
      .select('id')
      .single()

    if (error) {
      setFormError(`Could not update your name: ${error.message}`)
      setSaving(false)
      return
    }

    setSaving(false)
    onSaved('Your display name has been updated.')
    onClose()
  }

  return (
    <>
      <div className={formError ? 'mb-4' : ''}>
        <AlertMessage message={formError} variant="error" />
      </div>

      <form
        ref={formRef}
        aria-label="Edit full name"
        onSubmit={handleSubmit}
        noValidate
        className="space-y-4"
      >
        <FormField
          inputRef={nameInputRef}
          id="edit-profile-full-name"
          name="full_name"
          label="Full name"
          type="text"
          autoComplete="name"
          required
          maxLength={120}
          placeholder="Enter your full name"
          validationMessage="Enter your full name."
          value={fullName}
          onChange={(event) => {
            setFullName(event.target.value)
            setFieldInvalidFallback(nameInputRef.current, false)
            if (formError) setFormError('')
          }}
        />

        <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-rule pt-4">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="inline-flex min-h-10 items-center justify-center rounded-[5px] border border-rule bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-subtle disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex min-h-10 items-center justify-center rounded-[5px] bg-accent-solid px-4 text-sm font-medium text-on-accent hover:bg-accent-solid-hover disabled:cursor-not-allowed disabled:opacity-65"
          >
            {saving ? 'Saving…' : 'Save name'}
          </button>
        </div>
      </form>
    </>
  )
}

export function InternProfilePage() {
  useDocumentTitle('Profile')

  const { user, profile, refreshProfile } = useAuth()
  const internId = profile?.id
  const supervisorId = profile?.supervisor_id ?? null

  const requiredHours = getRequiredInternshipHours(
    profile?.required_hours,
    import.meta.env.VITE_REQUIRED_INTERNSHIP_HOURS,
  )

  const [reloadCounter, setReloadCounter] = useState(0)
  const [dataState, setDataState] = useState(EMPTY_PROFILE_DATA)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [nameSuccess, setNameSuccess] = useState('')

  // Change password form state
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')

  const passwordFormRef = useRef(null)
  const newPasswordRef = useRef(null)
  const confirmPasswordRef = useRef(null)

  useFormValidationSync(passwordFormRef)

  const currentQueryKey = internId
    ? `${internId}:${supervisorId ?? 'none'}:${reloadCounter}`
    : ''

  useEffect(() => {
    if (!supabase || !currentQueryKey) return undefined

    let active = true

    const supervisorPromise = supervisorId
      ? runWithSchemaFallback(
          () =>
            supabase
              .from('profiles')
              .select('id, full_name, company_name, department_office')
              .eq('id', supervisorId)
              .maybeSingle(),
          () =>
            supabase
              .from('profiles')
              .select('id, full_name, company_name')
              .eq('id', supervisorId)
              .maybeSingle(),
        )
      : Promise.resolve({ data: null, error: null })

    Promise.all([
      supervisorPromise,
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
            .select('id, status, submitted_at')
            .eq('intern_id', internId),
        () =>
          supabase
            .from('accomplishments')
            .select('id, status')
            .eq('intern_id', internId),
      ),
      supabase
        .from('tasks')
        .select('id, status, submitted_at')
        .eq('intern_id', internId),
    ]).then(([supervisorRes, attendanceRes, accomplishmentsRes, tasksRes]) => {
      if (!active) return

      const errors = [
        supervisorRes.error?.message,
        attendanceRes.error?.message,
        accomplishmentsRes.error?.message,
        tasksRes.error?.message,
      ].filter(Boolean)

      setDataState({
        loadedKey: currentQueryKey,
        supervisor: supervisorRes.error ? null : (supervisorRes.data ?? null),
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
  }, [currentQueryKey, internId, supervisorId])

  const loading = Boolean(
    supabase && currentQueryKey && dataState.loadedKey !== currentQueryKey,
  )
  const hasLoaded = dataState.loadedKey === currentQueryKey
  const loadError = hasLoaded ? dataState.error : ''

  const progress = useMemo(() => {
    const attendance = hasLoaded ? dataState.attendance : []
    const accomplishments = hasLoaded ? dataState.accomplishments : []
    const tasks = hasLoaded ? dataState.tasks : []

    const requiredMinutes = Math.max(1, Math.round(requiredHours * 60))

    let approvedAttendanceMinutes = 0
    let pendingAttendanceCount = 0
    let returnedCount = 0

    for (const row of attendance) {
      if (row.status === 'approved') {
        const minutes = computeElapsedMinutes(
          row.time_in,
          row.time_out,
          row.break_minutes ?? DEFAULT_BREAK_MINUTES,
        )
        if (minutes !== null && minutes > 0) {
          approvedAttendanceMinutes += minutes
        }
      } else if (row.status === 'pending') {
        pendingAttendanceCount += 1
      } else if (row.status === 'returned') {
        returnedCount += 1
      }
    }

    let pendingAccomplishmentsCount = 0
    for (const row of accomplishments) {
      if (row.status === 'pending' && !isDraftAccomplishment(row)) {
        pendingAccomplishmentsCount += 1
      } else if (row.status === 'returned') {
        returnedCount += 1
      }
    }

    let pendingSubmittedTasksCount = 0
    let unsubmittedTasksCount = 0
    for (const row of tasks) {
      if (row.status === 'pending') {
        if (row.submitted_at) pendingSubmittedTasksCount += 1
        else unsubmittedTasksCount += 1
      } else if (row.status === 'returned') {
        returnedCount += 1
      }
    }

    const remainingMinutes = Math.max(
      0,
      requiredMinutes - approvedAttendanceMinutes,
    )
    const progressRatio = Math.min(
      1,
      approvedAttendanceMinutes / requiredMinutes,
    )
    const progressPercent = Number((progressRatio * 100).toFixed(1))

    return {
      approvedAttendanceMinutes,
      approvedAttendanceHours: approvedAttendanceMinutes / 60,
      remainingMinutes,
      progressPercent,
      isGoalComplete: approvedAttendanceMinutes >= requiredMinutes,
      pendingSubmissionsCount:
        pendingAttendanceCount +
        pendingAccomplishmentsCount +
        pendingSubmittedTasksCount,
      unsubmittedTasksCount,
      returnedSubmissionsCount: returnedCount,
    }
  }, [
    dataState.accomplishments,
    dataState.attendance,
    dataState.tasks,
    hasLoaded,
    requiredHours,
  ])

  const closeEditDialog = useCallback(() => {
    setEditDialogOpen(false)
  }, [])

  const handleNameSaved = useCallback(
    (message) => {
      setNameSuccess(message)
      refreshProfile()
    },
    [refreshProfile],
  )

  async function handlePasswordSubmit(event) {
    event.preventDefault()

    if (!supabase) {
      setPasswordError('Unable to reach the authentication service.')
      return
    }

    setPasswordSuccess('')

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.')
      setFieldInvalidFallback(newPasswordRef.current, true)
      newPasswordRef.current?.focus()
      return
    }

    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match. Please re-enter both fields.')
      setFieldInvalidFallback(confirmPasswordRef.current, true)
      confirmPasswordRef.current?.focus()
      return
    }

    setPasswordSaving(true)
    setPasswordError('')

    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (error) {
      setPasswordError(`Could not change password: ${error.message}`)
      setPasswordSaving(false)
      return
    }

    setPasswordSaving(false)
    setNewPassword('')
    setConfirmPassword('')
    setShowNewPassword(false)
    setShowConfirmPassword(false)
    setPasswordSuccess(
      'Your password has been changed. Use it the next time you sign in.',
    )
  }

  const supervisorRecord = hasLoaded ? dataState.supervisor : null
  const supervisorDisplayName = supervisorRecord?.full_name?.trim() || ''

  const profileRows = [
    { label: 'Full name', value: profile?.full_name?.trim() || '—' },
    { label: 'Email address', value: user?.email || '—' },
    { label: 'Role', value: 'Intern' },
    { label: 'Student ID', value: profile?.student_id_no?.trim() || '—' },
    { label: 'School', value: profile?.school_name?.trim() || '—' },
    { label: 'Course / Program', value: profile?.course?.trim() || '—' },
    { label: 'Year level', value: profile?.year_level?.trim() || '—' },
    {
      label: 'Internship type',
      value: formatInternshipTypeLabel(profile?.internship_type) || '—',
    },
    {
      label: 'Host Organization / Institution',
      value: resolveHostOrganizationName(profile) || '—',
    },
    {
      label: 'Office / Department',
      value: profile?.department_office?.trim() || '—',
    },
    {
      label: 'Internship period',
      value:
        formatInternshipPeriod(
          profile?.internship_start_date,
          profile?.internship_end_date,
          formatCalendarDate,
        ) || '—',
    },
    { label: 'Required internship hours', value: `${requiredHours} hrs` },
  ]

  return (
    <div className="max-w-6xl space-y-6">
      <header>
        <h1
          id="main-content"
          tabIndex={-1}
          className="ledger-title text-[clamp(1.375rem,1.2rem+0.6vw,1.75rem)] font-semibold leading-[1.2] tracking-[-0.02em] text-ink outline-none"
        >
          Profile
        </h1>
        <p className="mt-1.5 max-w-[64ch] text-sm leading-[1.55] text-ink-muted">
          Review your internship placement details, assigned supervisor,
          progress summary, and account credentials.
        </p>
      </header>

      <div className={nameSuccess || loadError ? 'space-y-3' : ''}>
        <AlertMessage message={nameSuccess} variant="success" />
        {loadError ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <AlertMessage
                message={`Could not load profile details: ${loadError}`}
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
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-[6px] border border-rule bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-surface-subtle px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold text-ink">My profile</h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                Internship placement and enrollment details
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setNameSuccess('')
                setEditDialogOpen(true)
              }}
              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[5px] border border-rule bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-subtle"
            >
              <EditIcon className="size-3.5" />
              <span>Edit name</span>
            </button>
          </div>

          <dl className="divide-y divide-rule">
            {profileRows.map((item) => (
              <div
                key={item.label}
                className="grid grid-cols-1 gap-1 px-5 py-3 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-baseline sm:gap-4"
              >
                <dt className="text-xs font-medium text-ink-muted">
                  {item.label}
                </dt>
                <dd className="text-sm font-medium text-ink break-words tabular-nums">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>

          <p className="border-t border-rule bg-surface-subtle px-5 py-3 text-xs leading-[1.5] text-ink-muted">
            These details are set by the SIP Coordinator. Contact your
            coordinator if something needs to be corrected.
          </p>
        </section>

        <div className="space-y-6">
          <section className="overflow-hidden rounded-[6px] border border-rule bg-surface">
            <div className="border-b border-rule bg-surface-subtle px-5 py-3.5">
              <h2 className="text-sm font-semibold text-ink">My supervisor</h2>
            </div>

            <div className="px-5 py-4">
              {loading ? (
                <div className="flex items-center gap-2.5 text-xs text-ink-muted">
                  <progress
                    aria-label="Loading assigned supervisor"
                    className="loading-spinner"
                  />
                  <span>Loading supervisor…</span>
                </div>
              ) : supervisorDisplayName ? (
                <dl className="space-y-3">
                  <div>
                    <dt className="text-xs font-medium text-ink-muted">
                      Supervisor name
                    </dt>
                    <dd className="mt-0.5 text-sm font-semibold text-ink">
                      {supervisorDisplayName}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-ink-muted">
                      Host Organization / Institution
                    </dt>
                    <dd className="mt-0.5 text-sm text-ink-muted">
                      {supervisorRecord?.company_name?.trim() || '—'}
                    </dd>
                  </div>
                  {supervisorRecord?.department_office?.trim() ? (
                    <div>
                      <dt className="text-xs font-medium text-ink-muted">
                        Office / Department
                      </dt>
                      <dd className="mt-0.5 text-sm text-ink-muted">
                        {supervisorRecord.department_office.trim()}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              ) : (
                <p className="text-sm leading-[1.55] text-ink-muted">
                  {supervisorId
                    ? 'Not yet assigned'
                    : 'You have not been assigned a supervisor yet.'}
                </p>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-[6px] border border-rule bg-surface">
            <div className="border-b border-rule bg-surface-subtle px-5 py-3.5">
              <h2 className="text-sm font-semibold text-ink">
                Change password
              </h2>
              <p className="mt-0.5 text-xs leading-[1.45] text-ink-muted">
                If you are still using the temporary password from the SIP
                Coordinator, change it here.
              </p>
            </div>

            <div className="px-5 py-4">
              <div className={passwordSuccess || passwordError ? 'mb-4 space-y-2' : ''}>
                <AlertMessage message={passwordSuccess} variant="success" />
                <AlertMessage message={passwordError} variant="error" />
              </div>

              <form
                ref={passwordFormRef}
                aria-label="Change password"
                onSubmit={handlePasswordSubmit}
                noValidate
                className="space-y-4"
              >
                <FormField
                  inputRef={newPasswordRef}
                  id="profile-new-password"
                  name="new_password"
                  label="New password"
                  type={showNewPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  placeholder="Minimum 8 characters"
                  hint="At least 8 characters."
                  validationMessage="Enter a new password of at least 8 characters."
                  value={newPassword}
                  onChange={(event) => {
                    setNewPassword(event.target.value)
                    setFieldInvalidFallback(newPasswordRef.current, false)
                    if (passwordError) setPasswordError('')
                  }}
                  trailingAction={
                    <button
                      type="button"
                      aria-pressed={showNewPassword}
                      aria-label={
                        showNewPassword
                          ? 'Hide new password'
                          : 'Show new password'
                      }
                      onClick={() => setShowNewPassword((prev) => !prev)}
                      className="inline-flex min-h-8 items-center rounded-[4px] px-2 text-xs font-medium text-ink-muted hover:text-ink"
                    >
                      {showNewPassword ? 'Hide' : 'Show'}
                    </button>
                  }
                />

                <FormField
                  inputRef={confirmPasswordRef}
                  id="profile-confirm-password"
                  name="confirm_password"
                  label="Confirm new password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  required
                  placeholder="Re-enter new password"
                  validationMessage="Confirm your new password."
                  value={confirmPassword}
                  onChange={(event) => {
                    setConfirmPassword(event.target.value)
                    setFieldInvalidFallback(confirmPasswordRef.current, false)
                    if (passwordError) setPasswordError('')
                  }}
                  trailingAction={
                    <button
                      type="button"
                      aria-pressed={showConfirmPassword}
                      aria-label={
                        showConfirmPassword
                          ? 'Hide confirm password'
                          : 'Show confirm password'
                      }
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      className="inline-flex min-h-8 items-center rounded-[4px] px-2 text-xs font-medium text-ink-muted hover:text-ink"
                    >
                      {showConfirmPassword ? 'Hide' : 'Show'}
                    </button>
                  }
                />

                <button
                  type="submit"
                  disabled={passwordSaving}
                  className="inline-flex min-h-10 w-full items-center justify-center rounded-[5px] bg-accent-solid px-4 text-sm font-medium text-on-accent hover:bg-accent-solid-hover disabled:cursor-not-allowed disabled:opacity-65"
                >
                  {passwordSaving ? 'Updating password…' : 'Update password'}
                </button>
              </form>
            </div>
          </section>
        </div>
      </div>

      <section className="overflow-hidden rounded-[6px] border border-rule bg-surface">
        <div className="border-b border-rule bg-surface-subtle px-5 py-3.5">
          <h2 id="profile-progress-heading" className="text-sm font-semibold text-ink">
            My progress
          </h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Approved internship hours and submission status summary
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-3 px-5 py-10 text-sm text-ink-muted">
            <progress
              aria-label="Loading internship progress"
              className="loading-spinner"
            />
            <span>Loading progress summary…</span>
          </div>
        ) : (
          <>
            <div className="border-b border-rule px-5 py-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xs tabular-nums text-ink-muted">
                  {formatDecimalHours(progress.approvedAttendanceMinutes)}{' '}
                  approved of {requiredHours} hrs required
                </p>
                <span className="text-sm font-semibold tabular-nums text-ink">
                  {progress.progressPercent.toFixed(1)}%
                </span>
              </div>
              <div className="mt-3">
                <progress
                  value={progress.approvedAttendanceHours}
                  max={requiredHours}
                  aria-labelledby="profile-progress-heading"
                  className={`internship-progress${progress.isGoalComplete ? ' is-complete' : ''}`}
                />
              </div>
            </div>

            <dl className="grid grid-cols-2 divide-y divide-rule sm:grid-cols-3 lg:grid-cols-6 lg:divide-x lg:divide-y-0">
              <div className="px-5 py-4 max-lg:border-e max-lg:border-rule">
                <dt className="text-xs font-medium text-ink-muted">
                  Approved hours
                </dt>
                <dd className="mt-1 text-base font-semibold tabular-nums text-ink">
                  {formatDecimalHours(progress.approvedAttendanceMinutes)}
                </dd>
                <dd className="mt-0.5 text-xs tabular-nums text-ink-muted">
                  {formatDurationMinutes(progress.approvedAttendanceMinutes)}
                </dd>
              </div>
              <div className="px-5 py-4 sm:max-lg:border-e sm:max-lg:border-rule">
                <dt className="text-xs font-medium text-ink-muted">
                  Required hours
                </dt>
                <dd className="mt-1 text-base font-semibold tabular-nums text-ink">
                  {requiredHours} hrs
                </dd>
                <dd className="mt-0.5 text-xs text-ink-muted">Program target</dd>
              </div>
              <div className="px-5 py-4 max-sm:border-e max-sm:border-rule">
                <dt className="text-xs font-medium text-ink-muted">
                  Remaining hours
                </dt>
                <dd className="mt-1 text-base font-semibold tabular-nums text-ink">
                  {formatDecimalHours(progress.remainingMinutes)}
                </dd>
                <dd className="mt-0.5 text-xs tabular-nums text-ink-muted">
                  {formatDurationMinutes(progress.remainingMinutes)}
                </dd>
              </div>
              <div className="px-5 py-4 sm:max-lg:border-e sm:max-lg:border-rule">
                <dt className="text-xs font-medium text-ink-muted">
                  Pending submissions
                </dt>
                <dd className="mt-1 text-base font-semibold tabular-nums text-ink">
                  {progress.pendingSubmissionsCount}
                </dd>
                <dd className="mt-0.5 text-xs text-ink-muted">
                  Awaiting review
                </dd>
              </div>
              <div className="px-5 py-4 max-sm:border-e max-sm:border-rule sm:max-lg:border-e sm:max-lg:border-rule">
                <dt className="text-xs font-medium text-ink-muted">
                  Assigned tasks not yet submitted
                </dt>
                <dd className="mt-1 text-base font-semibold tabular-nums text-ink">
                  {progress.unsubmittedTasksCount}
                </dd>
                <dd className="mt-0.5 text-xs text-ink-muted">Not submitted</dd>
              </div>
              <div className="px-5 py-4">
                <dt className="text-xs font-medium text-ink-muted">
                  Returned submissions
                </dt>
                <dd className="mt-1 text-base font-semibold tabular-nums text-ink">
                  {progress.returnedSubmissionsCount}
                </dd>
                <dd className="mt-0.5 text-xs text-ink-muted">
                  Needs revision
                </dd>
              </div>
            </dl>
          </>
        )}
      </section>

      <SubmissionDialog
        open={editDialogOpen}
        title="Edit name"
        description="Update the display name shown on your portal workspace."
        onClose={closeEditDialog}
      >
        {editDialogOpen ? (
          <EditNameForm
            internId={internId}
            currentName={profile?.full_name ?? ''}
            onClose={closeEditDialog}
            onSaved={handleNameSaved}
          />
        ) : null}
      </SubmissionDialog>
    </div>
  )
}
