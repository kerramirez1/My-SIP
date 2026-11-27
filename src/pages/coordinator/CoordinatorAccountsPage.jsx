import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertMessage } from '../../components/AlertMessage'
import { FormField } from '../../components/FormField'
import { PlusIcon } from '../../components/Icons'
import { SubmissionDialog } from '../../components/SubmissionDialog'
import { useAuth } from '../../context/useAuth'
import { extractEdgeFunctionError } from '../../lib/edgeFunctionUtils'
import { DEFAULT_REQUIRED_INTERNSHIP_HOURS } from '../../lib/internDashboardUtils'
import { supabase } from '../../lib/supabaseClient'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useFormValidationSync } from '../../lib/useFormValidationSync'
import { formatCalendarDate } from '../../lib/weekUtils'
import {
  AccountActionMenu,
  AccountStatusBadge,
  DeactivateAccountDialog,
  DeleteAccountDialog,
  EditAccountDialog,
  ReactivateAccountDialog,
  ViewAccountDialog,
} from './CoordinatorAccountDialogs'

const EMPTY_DATA_STATE = {
  loadedKey: '',
  accounts: [],
  auditLogs: [],
  error: '',
}

const ROLE_LABELS = {
  intern: 'Intern',
  supervisor: 'Supervisor',
  coordinator: 'Coordinator',
}

const AUDIT_ACTION_META = {
  created: {
    label: 'Created',
    className: 'border-accent/40 bg-accent-tint text-accent',
  },
  updated: {
    label: 'Updated',
    className: 'border-rule bg-surface-subtle text-ink-muted',
  },
  deactivated: {
    label: 'Deactivated',
    className: 'border-error-border/40 bg-error-tint text-error',
  },
  reactivated: {
    label: 'Reactivated',
    className: 'border-success-border/45 bg-success-tint text-success',
  },
  deleted: {
    label: 'Deleted',
    className: 'border-rejected-border bg-rejected-bg text-on-accent',
  },
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function setFieldInvalidFallback(input, invalid) {
  if (!input) return
  input.classList.toggle('user-invalid-fallback', invalid)
  input.setAttribute('aria-invalid', invalid ? 'true' : 'false')
  input.closest('.field-group')?.classList.toggle('has-error-fallback', invalid)
}

function formatAuditTimestamp(isoString) {
  if (!isoString) return '—'
  const date = new Date(isoString)
  if (Number.isNaN(date.getTime())) return isoString
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date)
}

function CreateAccountForm({ supervisors, supervisorById, onClose, onCreated }) {
  const [role, setRole] = useState('intern')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [studentIdNo, setStudentIdNo] = useState('')
  const [schoolName, setSchoolName] = useState('')
  const [course, setCourse] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [requiredHours, setRequiredHours] = useState(
    String(DEFAULT_REQUIRED_INTERNSHIP_HOURS),
  )
  const [supervisorId, setSupervisorId] = useState(
    () => supervisors[0]?.id ?? '',
  )
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)

  const formRef = useRef(null)
  const fullNameRef = useRef(null)
  const emailRef = useRef(null)
  const passwordRef = useRef(null)
  const requiredHoursRef = useRef(null)
  const supervisorRef = useRef(null)

  useFormValidationSync(formRef)

  const isIntern = role === 'intern'
  const selectedSupervisorId =
    supervisorId && supervisorById.has(supervisorId)
      ? supervisorId
      : (supervisors[0]?.id ?? '')
  const missingSupervisorsForIntern = isIntern && supervisors.length === 0

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      fullNameRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(frameId)
  }, [])

  async function handleSubmit(event) {
    event.preventDefault()

    if (!supabase) {
      setFormError('Unable to reach the authentication service.')
      return
    }

    if (role !== 'intern' && role !== 'supervisor') {
      setFormError("Role must be either 'intern' or 'supervisor'.")
      return
    }

    const trimmedName = fullName.trim()
    if (!trimmedName) {
      setFormError('Full name is required.')
      setFieldInvalidFallback(fullNameRef.current, true)
      fullNameRef.current?.focus()
      return
    }

    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedEmail || !EMAIL_PATTERN.test(trimmedEmail)) {
      setFormError('A valid email address is required.')
      setFieldInvalidFallback(emailRef.current, true)
      emailRef.current?.focus()
      return
    }

    if (password.length < 8) {
      setFormError('Temporary password must be at least 8 characters.')
      setFieldInvalidFallback(passwordRef.current, true)
      passwordRef.current?.focus()
      return
    }

    let parsedRequiredHours = DEFAULT_REQUIRED_INTERNSHIP_HOURS
    if (isIntern) {
      if (supervisors.length === 0 || !selectedSupervisorId) {
        setFormError('Create an active supervisor account first.')
        setFieldInvalidFallback(supervisorRef.current, true)
        supervisorRef.current?.focus()
        return
      }

      if (!supervisorById.has(selectedSupervisorId)) {
        setFormError('Please select an active supervisor account.')
        setFieldInvalidFallback(supervisorRef.current, true)
        supervisorRef.current?.focus()
        return
      }

      const trimmedHours = String(requiredHours).trim()
      if (trimmedHours !== '') {
        const numericHours = Number(trimmedHours)
        if (!Number.isInteger(numericHours) || numericHours <= 0) {
          setFormError('Required hours must be a positive whole number.')
          setFieldInvalidFallback(requiredHoursRef.current, true)
          requiredHoursRef.current?.focus()
          return
        }
        parsedRequiredHours = numericHours
      }
    }

    setSaving(true)
    setFormError('')

    const body = isIntern
      ? {
          role: 'intern',
          full_name: trimmedName,
          email: trimmedEmail,
          password,
          supervisor_id: selectedSupervisorId,
          student_id_no: studentIdNo.trim() || null,
          school_name: schoolName.trim() || null,
          course: course.trim() || null,
          company_name: companyName.trim() || null,
          internship_start_date: startDate.trim() || null,
          required_hours: parsedRequiredHours,
        }
      : {
          role: 'supervisor',
          full_name: trimmedName,
          email: trimmedEmail,
          password,
          company_name: companyName.trim() || null,
        }

    const { data, error } = await supabase.functions.invoke('create-account', {
      body,
    })

    if (error) {
      const parsed = await extractEdgeFunctionError(
        error,
        'Could not create account. Please try again.',
      )
      setFormError(parsed.message)
      setSaving(false)
      return
    }

    if (data?.error) {
      setFormError(String(data.error))
      setSaving(false)
      return
    }

    setSaving(false)
    onCreated({
      id: data?.id ?? '',
      fullName: data?.full_name || trimmedName,
      role: data?.role || role,
      email: data?.email || trimmedEmail,
      password,
    })
    onClose()
  }

  return (
    <>
      <div className={formError ? 'mb-4' : ''}>
        <AlertMessage message={formError} variant="error" />
      </div>

      <form
        ref={formRef}
        aria-label="Create account"
        onSubmit={handleSubmit}
        noValidate
        className="space-y-4"
      >
        <div className="field-group flex flex-col gap-1.5">
          <label
            htmlFor="create-account-role"
            className="text-sm font-medium leading-[1.4] text-ink"
          >
            Role
          </label>
          <select
            id="create-account-role"
            name="role"
            value={role}
            onChange={(event) => {
              setRole(event.target.value)
              if (formError) setFormError('')
            }}
            className="form-control min-h-11 w-full rounded-[5px] border border-input-border bg-surface px-3.5 py-2.5 text-[max(1rem,1em)] text-ink transition-colors hover:border-ink sm:text-sm"
          >
            <option value="intern">Intern</option>
            <option value="supervisor">Supervisor</option>
          </select>
        </div>

        <FormField
          inputRef={fullNameRef}
          id="create-account-full-name"
          name="full_name"
          label="Full name"
          type="text"
          autoComplete="name"
          required
          maxLength={120}
          placeholder="e.g. Juan Dela Cruz"
          validationMessage="Enter the user's full name."
          value={fullName}
          onChange={(event) => {
            setFullName(event.target.value)
            setFieldInvalidFallback(fullNameRef.current, false)
            if (formError) setFormError('')
          }}
        />

        <FormField
          inputRef={emailRef}
          id="create-account-email"
          name="email"
          label="Email address"
          type="email"
          autoComplete="off"
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          required
          placeholder="e.g. juan.delacruz@sipportal.test"
          validationMessage="Enter a valid email address."
          value={email}
          onChange={(event) => {
            setEmail(event.target.value)
            setFieldInvalidFallback(emailRef.current, false)
            if (formError) setFormError('')
          }}
        />

        <FormField
          inputRef={passwordRef}
          id="create-account-password"
          name="password"
          label="Temporary password"
          type={showPassword ? 'text' : 'password'}
          autoComplete="new-password"
          required
          placeholder="Minimum 8 characters"
          hint="At least 8 characters. Give this to the user together with the email — it cannot be shown again after this dialog closes."
          validationMessage="Enter a temporary password of at least 8 characters."
          value={password}
          onChange={(event) => {
            setPassword(event.target.value)
            setFieldInvalidFallback(passwordRef.current, false)
            if (formError) setFormError('')
          }}
          trailingAction={
            <button
              type="button"
              aria-pressed={showPassword}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              onClick={() => setShowPassword((prev) => !prev)}
              className="inline-flex min-h-8 items-center rounded-[4px] px-2 text-xs font-medium text-ink-muted hover:text-ink"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          }
        />

        {isIntern ? (
          <>
            <div className="field-group flex flex-col gap-1.5">
              <label
                htmlFor="create-account-supervisor"
                className="text-sm font-medium leading-[1.4] text-ink"
              >
                Assigned supervisor
              </label>
              {missingSupervisorsForIntern ? (
                <span
                  id="create-account-supervisor-hint"
                  className="text-xs leading-[1.4] text-error"
                >
                  Create an active supervisor account first.
                </span>
              ) : null}
              <select
                ref={supervisorRef}
                id="create-account-supervisor"
                name="supervisor_id"
                required
                disabled={missingSupervisorsForIntern}
                aria-invalid="false"
                aria-describedby={
                  missingSupervisorsForIntern
                    ? 'create-account-supervisor-hint'
                    : undefined
                }
                value={selectedSupervisorId}
                onChange={(event) => {
                  setSupervisorId(event.target.value)
                  setFieldInvalidFallback(supervisorRef.current, false)
                  if (formError) setFormError('')
                }}
                className="form-control min-h-11 w-full rounded-[5px] border border-input-border bg-surface px-3.5 py-2.5 text-[max(1rem,1em)] text-ink transition-colors hover:border-ink disabled:cursor-not-allowed disabled:bg-canvas disabled:opacity-70 sm:text-sm"
              >
                {missingSupervisorsForIntern ? (
                  <option value="">No active supervisors available</option>
                ) : (
                  supervisors.map((sup) => (
                    <option key={sup.id} value={sup.id}>
                      {sup.full_name}
                      {sup.company_name ? ` — ${sup.company_name}` : ''}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                id="create-account-student-id"
                name="student_id_no"
                label="Student ID No."
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="e.g. 2023-00142"
                value={studentIdNo}
                onChange={(event) => {
                  setStudentIdNo(event.target.value)
                  if (formError) setFormError('')
                }}
              />

              <FormField
                inputRef={requiredHoursRef}
                id="create-account-required-hours"
                name="required_hours"
                label="Required hours"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                required
                validationMessage="Enter a positive whole number of hours."
                value={requiredHours}
                onChange={(event) => {
                  setRequiredHours(event.target.value)
                  setFieldInvalidFallback(requiredHoursRef.current, false)
                  if (formError) setFormError('')
                }}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                id="create-account-school"
                name="school_name"
                label="School name"
                type="text"
                placeholder="e.g. State University"
                value={schoolName}
                onChange={(event) => {
                  setSchoolName(event.target.value)
                  if (formError) setFormError('')
                }}
              />

              <FormField
                id="create-account-course"
                name="course"
                label="Course"
                type="text"
                placeholder="e.g. BS Information Technology"
                value={course}
                onChange={(event) => {
                  setCourse(event.target.value)
                  if (formError) setFormError('')
                }}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                id="create-account-company"
                name="company_name"
                label="Company name"
                type="text"
                placeholder="e.g. Acme Tech Corp"
                value={companyName}
                onChange={(event) => {
                  setCompanyName(event.target.value)
                  if (formError) setFormError('')
                }}
              />

              <FormField
                id="create-account-start-date"
                name="internship_start_date"
                label="Internship start date"
                type="date"
                value={startDate}
                onChange={(event) => {
                  setStartDate(event.target.value)
                  if (formError) setFormError('')
                }}
              />
            </div>
          </>
        ) : (
          <FormField
            id="create-account-supervisor-company"
            name="company_name"
            label="Company name"
            type="text"
            placeholder="e.g. Acme Tech Corp"
            value={companyName}
            onChange={(event) => {
              setCompanyName(event.target.value)
              if (formError) setFormError('')
            }}
          />
        )}

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
            disabled={saving || missingSupervisorsForIntern}
            className="inline-flex min-h-10 items-center justify-center rounded-[5px] bg-accent-solid px-4 text-sm font-medium text-on-accent hover:bg-accent-solid-hover disabled:cursor-not-allowed disabled:opacity-65"
          >
            {saving ? 'Creating…' : 'Create account'}
          </button>
        </div>
      </form>
    </>
  )
}

export function CoordinatorAccountsPage() {
  useDocumentTitle('Account Management')

  const { profile } = useAuth()
  const coordinatorId = profile?.id

  const [reloadCounter, setReloadCounter] = useState(0)
  const [dataState, setDataState] = useState(EMPTY_DATA_STATE)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [createdCredentials, setCreatedCredentials] = useState(null)
  const [actionBanner, setActionBanner] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Account lifecycle dialog targets
  const [viewTarget, setViewTarget] = useState(null)
  const [editTarget, setEditTarget] = useState(null)
  const [deactivateTarget, setDeactivateTarget] = useState(null)
  const [reactivateTarget, setReactivateTarget] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const reload = useCallback(() => {
    setReloadCounter((count) => count + 1)
  }, [])

  const closeDialog = useCallback(() => {
    setDialogOpen(false)
  }, [])

  const handleCreated = useCallback(
    (credentials) => {
      setCreatedCredentials(credentials)
      setActionBanner('')
      reload()
    },
    [reload],
  )

  const handleLifecycleSuccess = useCallback(
    (message) => {
      setActionBanner(message)
      setCreatedCredentials(null)
      reload()
    },
    [reload],
  )

  const currentQueryKey = coordinatorId
    ? `${coordinatorId}:${reloadCounter}`
    : ''

  useEffect(() => {
    if (!supabase || !currentQueryKey) return undefined

    let active = true

    supabase.functions
      .invoke('manage-account', {
        body: { action: 'list_accounts' },
      })
      .then(async ({ data, error }) => {
        if (!active) return
        if (!error && data && !data.error && Array.isArray(data.accounts)) {
          setDataState({
            loadedKey: currentQueryKey,
            accounts: data.accounts,
            auditLogs: Array.isArray(data.audit_logs) ? data.audit_logs : [],
            error: '',
          })
          return
        }

        const parsedErr = error
          ? await extractEdgeFunctionError(
              error,
              'Could not load account management service.',
            )
          : { message: data?.error || 'Could not load accounts.' }

        // Fallback to direct profiles read so accounts remain visible even if
        // manage-account Edge Function is temporarily unreachable
        const { data: fallbackProfiles, error: fallbackErr } = await supabase
          .from('profiles')
          .select(
            'id, full_name, role, supervisor_id, student_id_no, company_name, school_name, course, internship_start_date, required_hours, is_active, deactivated_at, deactivated_reason, created_at',
          )
          .order('role', { ascending: true })
          .order('full_name', { ascending: true })

        if (!active) return

        setDataState({
          loadedKey: currentQueryKey,
          accounts: fallbackErr
            ? []
            : (fallbackProfiles ?? []).map((p) => ({
                ...p,
                is_active: p.is_active !== false,
                email: '',
                is_self: p.id === coordinatorId,
                record_summary: null,
              })),
          auditLogs: [],
          error: fallbackErr
            ? fallbackErr.message
            : `Account service warning: ${parsedErr.message}`,
        })
      })

    return () => {
      active = false
    }
  }, [coordinatorId, currentQueryKey])

  const loading = Boolean(
    supabase && currentQueryKey && dataState.loadedKey !== currentQueryKey,
  )
  const hasLoaded = dataState.loadedKey === currentQueryKey
  const loadError = hasLoaded ? dataState.error : ''

  const derived = useMemo(() => {
    const accounts = hasLoaded ? dataState.accounts : []
    const auditLogs = hasLoaded ? dataState.auditLogs : []
    const profileById = new Map(accounts.map((row) => [row.id, row]))
    const supervisors = accounts.filter((row) => row.role === 'supervisor')
    const activeSupervisors = supervisors.filter((row) => row.is_active !== false)
    const activeSupervisorById = new Map(
      activeSupervisors.map((row) => [row.id, row]),
    )

    let internsCount = 0
    let supervisorsCount = 0
    let deactivatedCount = 0
    let unassignedInternsCount = 0

    for (const row of accounts) {
      if (row.is_active === false) deactivatedCount += 1
      if (row.role === 'intern') {
        internsCount += 1
        if (!row.supervisor_id && row.is_active !== false) {
          unassignedInternsCount += 1
        }
      } else if (row.role === 'supervisor') {
        supervisorsCount += 1
      }
    }

    return {
      accounts,
      auditLogs,
      profileById,
      supervisors,
      activeSupervisors,
      activeSupervisorById,
      counts: {
        interns: internsCount,
        supervisors: supervisorsCount,
        deactivated: deactivatedCount,
        unassignedInterns: unassignedInternsCount,
      },
    }
  }, [dataState.accounts, dataState.auditLogs, hasLoaded])

  const visibleAccounts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return derived.accounts.filter((account) => {
      if (roleFilter === 'unassigned') {
        if (account.role !== 'intern' || account.supervisor_id) return false
      } else if (roleFilter !== 'all' && account.role !== roleFilter) {
        return false
      }

      const isActive = account.is_active !== false
      if (statusFilter === 'active' && !isActive) return false
      if (statusFilter === 'deactivated' && isActive) return false

      if (!q) return true
      const supName = account.supervisor_id
        ? (derived.profileById.get(account.supervisor_id)?.full_name ?? '')
        : ''
      const haystack = [
        account.full_name,
        account.email,
        account.student_id_no,
        account.company_name,
        account.school_name,
        account.course,
        supName,
        ROLE_LABELS[account.role] ?? account.role,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [derived.accounts, derived.profileById, roleFilter, searchQuery, statusFilter])

  return (
    <div className="max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1
            id="main-content"
            tabIndex={-1}
            className="ledger-title text-[clamp(1.375rem,1.2rem+0.6vw,1.75rem)] font-semibold leading-[1.2] tracking-[-0.02em] text-ink outline-none"
          >
            Account Management
          </h1>
          <p className="mt-1.5 max-w-[66ch] text-sm leading-[1.55] text-ink-muted">
            Create, edit, deactivate, reactivate, or safely remove intern and
            supervisor accounts while preserving historical internship records.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setDialogOpen(true)}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[5px] bg-accent-solid px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-solid-hover"
        >
          <PlusIcon className="size-4" />
          <span>Create account</span>
        </button>
      </header>

      {actionBanner ? (
        <AlertMessage message={actionBanner} variant="success" />
      ) : null}

      {createdCredentials ? (
        <section
          role="status"
          aria-live="polite"
          className="rounded-[6px] border border-success-border bg-success-tint p-5 text-sm text-ink"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-3">
              <p className="font-semibold text-success">
                Login credentials for {createdCredentials.fullName} — share
                these with the user now. This password will not be shown again.
              </p>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <dt className="font-medium text-ink-muted">Name</dt>
                  <dd className="mt-0.5 font-medium text-ink">
                    {createdCredentials.fullName}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-ink-muted">Role</dt>
                  <dd className="mt-0.5 font-medium text-ink">
                    {ROLE_LABELS[createdCredentials.role] ??
                      createdCredentials.role}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-ink-muted">Email</dt>
                  <dd className="mt-0.5 break-all font-medium text-ink">
                    {createdCredentials.email}
                  </dd>
                </div>
                <div>
                  <dt className="font-medium text-ink-muted">
                    Temporary password
                  </dt>
                  <dd className="mt-0.5 break-all font-mono font-semibold text-ink">
                    {createdCredentials.password}
                  </dd>
                </div>
              </dl>
            </div>

            <button
              type="button"
              onClick={() => setCreatedCredentials(null)}
              className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-[5px] border border-success-border/60 bg-surface px-3.5 text-xs font-medium text-ink hover:bg-surface-subtle"
            >
              Dismiss
            </button>
          </div>
        </section>
      ) : null}

      {loadError ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <AlertMessage message={loadError} variant="error" />
          </div>
          <button
            type="button"
            onClick={reload}
            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-[5px] border border-rule bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-subtle"
          >
            Retry
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-3 rounded-[6px] border border-rule bg-surface px-5 py-14 text-sm text-ink-muted">
          <progress
            aria-label="Loading portal accounts"
            className="loading-spinner"
          />
          <span>Loading accounts…</span>
        </div>
      ) : (
        <>
          <section
            aria-label="Account counts"
            className="dashboard-metric-wrap overflow-hidden rounded-[6px] border border-rule bg-surface"
          >
            <dl className="dashboard-metric-grid">
              <div className="dashboard-metric-cell">
                <dt className="text-xs font-medium text-ink-muted">Interns</dt>
                <dd className="text-xl font-semibold tabular-nums text-ink">
                  {derived.counts.interns}
                </dd>
                <dd className="text-xs text-ink-muted">Registered trainees</dd>
              </div>
              <div className="dashboard-metric-cell">
                <dt className="text-xs font-medium text-ink-muted">
                  Supervisors
                </dt>
                <dd className="text-xl font-semibold tabular-nums text-ink">
                  {derived.counts.supervisors}
                </dd>
                <dd className="text-xs text-ink-muted">Host evaluators</dd>
              </div>
              <div className="dashboard-metric-cell">
                <dt className="text-xs font-medium text-ink-muted">
                  Deactivated Accounts
                </dt>
                <dd className="text-xl font-semibold tabular-nums text-ink">
                  {derived.counts.deactivated}
                </dd>
                <dd className="text-xs text-ink-muted">
                  Access revoked, records archived
                </dd>
              </div>
              <div className="dashboard-metric-cell">
                <dt className="text-xs font-medium text-ink-muted">
                  Unassigned Active Interns
                </dt>
                <dd
                  className={`text-xl font-semibold tabular-nums ${
                    derived.counts.unassignedInterns > 0
                      ? 'text-error'
                      : 'text-ink'
                  }`}
                >
                  {derived.counts.unassignedInterns}
                </dd>
                <dd className="text-xs text-ink-muted">
                  {derived.counts.unassignedInterns === 0
                    ? 'All active interns assigned'
                    : 'Require supervisor assignment'}
                </dd>
              </div>
            </dl>
          </section>

          <section className="overflow-hidden rounded-[6px] border border-rule bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule bg-surface-subtle px-5 py-3.5">
              <div>
                <h2
                  id="accounts-heading"
                  className="text-sm font-semibold text-ink"
                >
                  Portal Accounts
                </h2>
                <p className="mt-0.5 text-xs text-ink-muted">
                  All registered intern, supervisor, and coordinator profiles
                </p>
              </div>
              <span className="text-xs tabular-nums text-ink-muted">
                Showing {visibleAccounts.length} of {derived.accounts.length}{' '}
                {derived.accounts.length === 1 ? 'account' : 'accounts'}
              </span>
            </div>

            <search
              aria-label="Filter portal accounts"
              className="grid grid-cols-1 gap-3 border-b border-rule bg-surface px-5 py-3.5 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_13rem_12rem]"
            >
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="accounts-search"
                  className="text-xs font-medium text-ink-muted"
                >
                  Search accounts
                </label>
                <input
                  id="accounts-search"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Name, email, student ID, company, course, or supervisor…"
                  className="min-h-10 w-full rounded-[5px] border border-input-border bg-surface px-3 text-sm text-ink placeholder:text-ink-muted/70 hover:border-ink"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="accounts-role-filter"
                  className="text-xs font-medium text-ink-muted"
                >
                  Role
                </label>
                <select
                  id="accounts-role-filter"
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="min-h-10 w-full rounded-[5px] border border-input-border bg-surface px-3 text-sm text-ink hover:border-ink"
                >
                  <option value="all">All roles</option>
                  <option value="intern">Interns</option>
                  <option value="supervisor">Supervisors</option>
                  <option value="coordinator">Coordinators</option>
                  {derived.counts.unassignedInterns > 0 ? (
                    <option value="unassigned">
                      Interns without supervisor
                    </option>
                  ) : null}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor="accounts-status-filter"
                  className="text-xs font-medium text-ink-muted"
                >
                  Status
                </label>
                <select
                  id="accounts-status-filter"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="min-h-10 w-full rounded-[5px] border border-input-border bg-surface px-3 text-sm text-ink hover:border-ink"
                >
                  <option value="all">All statuses</option>
                  <option value="active">Active</option>
                  <option value="deactivated">Deactivated</option>
                </select>
              </div>
            </search>

            {visibleAccounts.length === 0 ? (
              <div className="px-5 py-10 text-sm text-ink-muted">
                {derived.accounts.length === 0
                  ? 'No accounts found yet.'
                  : 'No accounts match the current search or filters.'}
              </div>
            ) : (
              <div
                tabIndex={0}
                role="region"
                aria-labelledby="accounts-heading"
                className="table-wrapper"
              >
                <table className="submission-table is-compact">
                  <caption className="visually-hidden">
                    Registered portal accounts ordered by role and name
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col" className="w-28">
                        Role
                      </th>
                      <th scope="col" className="w-28">
                        Status
                      </th>
                      <th scope="col" className="w-32">
                        Student ID
                      </th>
                      <th scope="col" className="w-40">
                        Company
                      </th>
                      <th scope="col" className="w-40">
                        Supervisor
                      </th>
                      <th scope="col" className="w-28">
                        Required
                      </th>
                      <th scope="col" className="w-32">
                        Start date
                      </th>
                      <th scope="col" className="col-action w-28">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleAccounts.map((account) => {
                      const isIntern = account.role === 'intern'
                      const isActive = account.is_active !== false
                      const supervisorName =
                        isIntern && account.supervisor_id
                          ? (derived.profileById.get(account.supervisor_id)
                              ?.full_name ?? '—')
                          : '—'
                      const academicMeta = isIntern
                        ? [account.course, account.school_name]
                            .filter(Boolean)
                            .join(' — ')
                        : ''

                      return (
                        <tr
                          key={account.id}
                          className={!isActive ? 'opacity-75' : undefined}
                        >
                          <th scope="row">
                            <div className="min-w-0">
                              <p className="font-medium text-ink">
                                {account.full_name}
                                {account.is_self ? (
                                  <span className="ms-1.5 text-[11px] font-normal text-ink-muted">
                                    (You)
                                  </span>
                                ) : null}
                              </p>
                              {account.email ? (
                                <p className="mt-0.5 truncate text-xs font-normal text-ink-muted">
                                  {account.email}
                                </p>
                              ) : null}
                              {academicMeta ? (
                                <p className="mt-0.5 text-xs font-normal text-ink-muted">
                                  {academicMeta}
                                </p>
                              ) : null}
                            </div>
                          </th>
                          <td
                            data-label="Role"
                            className="whitespace-nowrap text-xs font-medium text-ink-muted"
                          >
                            {ROLE_LABELS[account.role] ?? account.role}
                          </td>
                          <td data-label="Status">
                            <AccountStatusBadge isActive={isActive} />
                          </td>
                          <td
                            data-label="Student ID"
                            className="whitespace-nowrap text-xs tabular-nums text-ink-muted"
                          >
                            {isIntern && account.student_id_no
                              ? account.student_id_no
                              : '—'}
                          </td>
                          <td
                            data-label="Company"
                            className="text-xs text-ink-muted"
                          >
                            {account.company_name || '—'}
                          </td>
                          <td
                            data-label="Supervisor"
                            className="text-xs text-ink-muted"
                          >
                            {supervisorName}
                          </td>
                          <td
                            data-label="Required"
                            className="whitespace-nowrap text-xs tabular-nums text-ink-muted"
                          >
                            {isIntern && account.required_hours
                              ? `${account.required_hours} hrs`
                              : '—'}
                          </td>
                          <td
                            data-label="Start date"
                            className="whitespace-nowrap text-xs tabular-nums text-ink-muted"
                          >
                            {isIntern && account.internship_start_date ? (
                              <time dateTime={account.internship_start_date}>
                                {formatCalendarDate(
                                  account.internship_start_date,
                                )}
                              </time>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td data-label="Actions" className="col-action">
                            <AccountActionMenu
                              account={account}
                              onView={(acct) => setViewTarget(acct)}
                              onEdit={(acct) => setEditTarget(acct)}
                              onDeactivate={(acct) => setDeactivateTarget(acct)}
                              onReactivate={(acct) => setReactivateTarget(acct)}
                              onDelete={(acct) => setDeleteTarget(acct)}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Account Audit Trail */}
          <section
            aria-labelledby="audit-log-heading"
            className="overflow-hidden rounded-[6px] border border-rule bg-surface"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-surface-subtle px-5 py-3.5">
              <div>
                <h2
                  id="audit-log-heading"
                  className="text-sm font-semibold text-ink"
                >
                  Account Management Audit Trail
                </h2>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Permanent record of account creations, edits, deactivations,
                  reactivations, and deletions
                </p>
              </div>
              <span className="text-xs tabular-nums text-ink-muted">
                {derived.auditLogs.length}{' '}
                {derived.auditLogs.length === 1 ? 'entry' : 'entries'}
              </span>
            </div>

            {derived.auditLogs.length === 0 ? (
              <div className="px-5 py-8 text-xs text-ink-muted">
                No account management actions have been logged yet.
              </div>
            ) : (
              <div
                tabIndex={0}
                role="region"
                aria-labelledby="audit-log-heading"
                className="table-wrapper"
              >
                <table className="submission-table is-compact">
                  <caption className="visually-hidden">
                    Audit history of coordinator account management actions
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" className="w-32">
                        Action
                      </th>
                      <th scope="col">Target Account</th>
                      <th scope="col" className="w-28">
                        Role
                      </th>
                      <th scope="col" className="w-40">
                        Performed By
                      </th>
                      <th scope="col">Reason</th>
                      <th scope="col" className="w-40">
                        Date &amp; Time
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {derived.auditLogs.map((log) => {
                      const badge =
                        AUDIT_ACTION_META[log.action] ??
                        AUDIT_ACTION_META.updated
                      return (
                        <tr key={log.id}>
                          <td data-label="Action">
                            <span
                              className={`inline-flex items-center rounded-[5px] border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          </td>
                          <th scope="row">
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-ink">
                                {log.target_name}
                              </p>
                              {log.target_email ? (
                                <p className="mt-0.5 text-[11px] font-normal text-ink-muted">
                                  {log.target_email}
                                </p>
                              ) : null}
                            </div>
                          </th>
                          <td
                            data-label="Role"
                            className="whitespace-nowrap text-xs text-ink-muted"
                          >
                            {ROLE_LABELS[log.target_role] ?? log.target_role}
                          </td>
                          <td
                            data-label="Performed By"
                            className="text-xs text-ink-muted"
                          >
                            {log.performed_by_name}
                          </td>
                          <td
                            data-label="Reason"
                            className="text-xs text-ink-muted"
                          >
                            {log.reason || '—'}
                          </td>
                          <td
                            data-label="Date & Time"
                            className="whitespace-nowrap text-xs tabular-nums text-ink-muted"
                          >
                            {formatAuditTimestamp(log.created_at)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <SubmissionDialog
        open={dialogOpen}
        title="Create Account"
        description="Create a new intern or supervisor account and set up their profile."
        onClose={closeDialog}
      >
        {dialogOpen ? (
          <CreateAccountForm
            supervisors={derived.activeSupervisors}
            supervisorById={derived.activeSupervisorById}
            onClose={closeDialog}
            onCreated={handleCreated}
          />
        ) : null}
      </SubmissionDialog>

      <ViewAccountDialog
        account={viewTarget}
        supervisorName={
          viewTarget?.supervisor_id
            ? (derived.profileById.get(viewTarget.supervisor_id)?.full_name ??
              '—')
            : '—'
        }
        onClose={() => setViewTarget(null)}
        onEdit={(acct) => setEditTarget(acct)}
        onDeactivate={(acct) => setDeactivateTarget(acct)}
        onReactivate={(acct) => setReactivateTarget(acct)}
        onDelete={(acct) => setDeleteTarget(acct)}
      />

      <EditAccountDialog
        account={editTarget}
        supervisors={derived.supervisors}
        onClose={() => setEditTarget(null)}
        onSaved={handleLifecycleSuccess}
      />

      <DeactivateAccountDialog
        account={deactivateTarget}
        onClose={() => setDeactivateTarget(null)}
        onCompleted={handleLifecycleSuccess}
      />

      <ReactivateAccountDialog
        account={reactivateTarget}
        onClose={() => setReactivateTarget(null)}
        onCompleted={handleLifecycleSuccess}
      />

      <DeleteAccountDialog
        account={deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onSwitchToDeactivate={(acct) => setDeactivateTarget(acct)}
        onDeleted={handleLifecycleSuccess}
      />
    </div>
  )
}
