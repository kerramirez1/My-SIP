import { useEffect, useId, useRef, useState } from 'react'
import { AlertMessage } from '../../components/AlertMessage'
import { FormField } from '../../components/FormField'
import { SubmissionDialog } from '../../components/SubmissionDialog'
import { extractEdgeFunctionError } from '../../lib/edgeFunctionUtils'
import { DEFAULT_REQUIRED_INTERNSHIP_HOURS } from '../../lib/internDashboardUtils'
import {
  formatInternshipPeriod,
  formatInternshipTypeLabel,
  resolveHostOrganizationName,
} from '../../lib/schemaCompat'
import { supabase } from '../../lib/supabaseClient'
import { useFormValidationSync } from '../../lib/useFormValidationSync'
import { formatCalendarDate } from '../../lib/weekUtils'

const ROLE_LABELS = {
  intern: 'Intern',
  supervisor: 'Supervisor',
  coordinator: 'Coordinator',
}

export function AccountStatusBadge({ isActive }) {
  return isActive ? (
    <span className="inline-flex items-center rounded-[5px] border border-success-border/45 bg-success-tint px-2 py-0.5 text-xs font-medium whitespace-nowrap text-success">
      Active
    </span>
  ) : (
    <span className="inline-flex items-center rounded-[5px] border border-rule bg-surface-subtle px-2 py-0.5 text-xs font-medium whitespace-nowrap text-ink-muted">
      Deactivated
    </span>
  )
}

function RecordBreakdownList({ summary }) {
  if (!summary) return null
  const rows = [
    { label: 'Weekly attendance records', count: summary.attendance ?? 0 },
    {
      label: 'Accomplishment submissions',
      count: summary.accomplishments ?? 0,
    },
    { label: 'Assigned / submitted tasks', count: summary.tasks ?? 0 },
    { label: 'Assigned interns (as supervisor)', count: summary.assignedInterns ?? 0 },
    {
      label: 'Historical approvals / reviews',
      count: summary.supervisorReviews ?? 0,
    },
    {
      label: 'Tasks assigned to interns',
      count: summary.assignedTasksCreated ?? 0,
    },
  ].filter((r) => r.count > 0)

  if (rows.length === 0) {
    return (
      <p className="text-xs text-ink-muted">
        No attendance logs, accomplishment reports, tasks, reviews, or
        supervisor assignments are linked to this account.
      </p>
    )
  }

  return (
    <ul className="space-y-1.5 text-xs">
      {rows.map((row) => (
        <li
          key={row.label}
          className="flex items-center justify-between gap-3 border-b border-rule/60 pb-1 last:border-b-0 last:pb-0"
        >
          <span className="text-ink-muted">{row.label}</span>
          <span className="font-semibold tabular-nums text-ink">
            {row.count}
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Accessible top-layer Popover row action menu (never clipped by .table-wrapper).
 * Implements keyboard arrow/Home/End/Escape navigation and focus restoration.
 */
export function AccountActionMenu({
  account,
  onView,
  onEdit,
  onDeactivate,
  onReactivate,
  onDelete,
}) {
  const reactId = useId()
  const triggerId = `acct-trigger-${reactId}`
  const popoverId = `acct-menu-${reactId}`
  const triggerRef = useRef(null)
  const popoverRef = useRef(null)
  const menuRef = useRef(null)
  const [open, setOpen] = useState(false)
  const keyboardOpenRef = useRef(false)

  const isActive = account.is_active !== false
  const canEdit = account.role === 'intern' || account.role === 'supervisor'
  const cannotDeactivateOrDelete =
    Boolean(account.is_self) || Boolean(account.is_last_active_coordinator)

  useEffect(() => {
    const popoverEl = popoverRef.current
    if (!popoverEl) return undefined

    function positionFallback() {
      const triggerEl = triggerRef.current
      if (!triggerEl || !popoverEl) return
      if (
        typeof CSS !== 'undefined' &&
        CSS.supports('position-area: block-end')
      ) {
        return
      }
      const rect = triggerEl.getBoundingClientRect()
      const menuRect = popoverEl.getBoundingClientRect()
      const gap = 4
      let top = rect.bottom + gap
      if (top + menuRect.height > window.innerHeight - 8) {
        top = Math.max(8, rect.top - menuRect.height - gap)
      }
      let left = rect.right - menuRect.width
      if (left < 8) left = 8
      if (left + menuRect.width > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - menuRect.width - 8)
      }
      popoverEl.style.top = `${Math.round(top)}px`
      popoverEl.style.left = `${Math.round(left)}px`
    }

    function handleToggle(event) {
      const nextOpen = event.newState === 'open'
      setOpen(nextOpen)
      if (nextOpen) {
        positionFallback()
        if (keyboardOpenRef.current) {
          keyboardOpenRef.current = false
          const firstEnabled = menuRef.current?.querySelector(
            'button[role="menuitem"]:not(:disabled)',
          )
          firstEnabled?.focus()
        }
      }
    }

    popoverEl.addEventListener('toggle', handleToggle)
    return () => popoverEl.removeEventListener('toggle', handleToggle)
  }, [])

  function closePopover(restoreFocus = false) {
    const popoverEl = popoverRef.current
    if (popoverEl && popoverEl.matches(':popover-open')) {
      popoverEl.hidePopover()
    }
    if (restoreFocus) {
      triggerRef.current?.focus()
    }
  }

  function togglePopover(viaKeyboard = false) {
    const popoverEl = popoverRef.current
    const triggerEl = triggerRef.current
    if (!popoverEl || !triggerEl) return

    if (popoverEl.matches(':popover-open')) {
      popoverEl.hidePopover()
      return
    }
    keyboardOpenRef.current = viaKeyboard
    try {
      popoverEl.showPopover({ source: triggerEl })
    } catch {
      popoverEl.showPopover()
    }
  }

  function handleTriggerKeyDown(event) {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      togglePopover(true)
    }
  }

  function handleMenuKeyDown(event) {
    const items = [
      ...(menuRef.current?.querySelectorAll(
        'button[role="menuitem"]:not(:disabled)',
      ) ?? []),
    ]
    if (items.length === 0) return

    if (event.key === 'Escape') {
      event.preventDefault()
      closePopover(true)
      return
    }
    if (event.key === 'Tab') {
      closePopover(false)
      return
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return

    event.preventDefault()
    const currentIndex = items.indexOf(document.activeElement)
    let nextIndex = 0
    if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = items.length - 1
    else if (event.key === 'ArrowDown') {
      nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length
    } else if (event.key === 'ArrowUp') {
      nextIndex =
        currentIndex < 0
          ? items.length - 1
          : (currentIndex - 1 + items.length) % items.length
    }
    items[nextIndex]?.focus()
  }

  function runCommand(handler) {
    closePopover(false)
    handler(account)
  }

  return (
    <div className="inline-flex justify-end">
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for ${account.full_name}`}
        onClick={() => togglePopover(false)}
        onKeyDown={handleTriggerKeyDown}
        className={`inline-flex min-h-8 items-center gap-1.5 rounded-[5px] border px-2.5 text-xs font-medium transition-colors ${
          open
            ? 'border-accent bg-accent-tint text-accent'
            : 'border-rule bg-surface text-ink hover:bg-surface-subtle'
        }`}
      >
        <span>Actions</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="size-3.5 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
        >
          <path d="M4.5 6.25 8 9.75l3.5-3.5" strokeLinecap="square" />
        </svg>
      </button>

      <div
        ref={popoverRef}
        id={popoverId}
        popover="auto"
        className="account-menu-popover"
      >
        <div
          ref={menuRef}
          role="menu"
          aria-labelledby={triggerId}
          onKeyDown={handleMenuKeyDown}
        >
          <button
            type="button"
            role="menuitem"
            className="account-menu-item"
            onClick={() => runCommand(onView)}
          >
            View Account
          </button>

          <button
            type="button"
            role="menuitem"
            disabled={!canEdit}
            className="account-menu-item"
            onClick={() => runCommand(onEdit)}
          >
            <span>Edit Account</span>
            {!canEdit ? (
              <span className="text-[11px] font-normal text-ink-muted">
                Profile
              </span>
            ) : null}
          </button>

          {isActive ? (
            <button
              type="button"
              role="menuitem"
              disabled={cannotDeactivateOrDelete}
              className="account-menu-item"
              onClick={() => runCommand(onDeactivate)}
            >
              <span>Deactivate Account</span>
            </button>
          ) : (
            <button
              type="button"
              role="menuitem"
              className="account-menu-item"
              onClick={() => runCommand(onReactivate)}
            >
              <span>Reactivate Account</span>
            </button>
          )}

          <hr className="my-1 border-rule" />

          <button
            type="button"
            role="menuitem"
            disabled={cannotDeactivateOrDelete}
            className="account-menu-item is-danger"
            onClick={() => runCommand(onDelete)}
          >
            <span>Delete Account</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export function ViewAccountDialog({
  account,
  supervisorName,
  onClose,
  onEdit,
  onDeactivate,
  onReactivate,
  onDelete,
}) {
  const isActive = account?.is_active !== false
  const isIntern = account?.role === 'intern'
  const canEdit =
    account?.role === 'intern' || account?.role === 'supervisor'
  const cannotDeactivateOrDelete =
    Boolean(account?.is_self) || Boolean(account?.is_last_active_coordinator)

  return (
    <SubmissionDialog
      open={Boolean(account)}
      title={account ? account.full_name : 'Account details'}
      description="Complete account profile, access status, and linked internship records."
      onClose={onClose}
    >
      {account ? (
        <div className="space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[5px] border border-rule bg-surface-subtle px-4 py-3">
            <div>
              <p className="font-semibold text-ink">{account.full_name}</p>
              <p className="mt-0.5 break-all text-ink-muted">
                {account.email || 'Email unavailable'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-[4px] border border-rule bg-surface px-2 py-0.5 font-medium text-ink-muted">
                {ROLE_LABELS[account.role] ?? account.role}
              </span>
              <AccountStatusBadge isActive={isActive} />
            </div>
          </div>

          {!isActive ? (
            <div className="rounded-[5px] border border-rule bg-surface-subtle px-4 py-3 text-ink">
              <p className="font-semibold text-ink">Account deactivated</p>
              <p className="mt-1 text-ink-muted">
                Portal sign-in is disabled while all historical internship
                records remain intact.
              </p>
              {account.deactivated_reason ? (
                <p className="mt-1.5 text-ink">
                  <span className="font-medium">Reason:</span>{' '}
                  {account.deactivated_reason}
                </p>
              ) : null}
            </div>
          ) : null}

          <dl className="grid grid-cols-1 gap-3 rounded-[5px] border border-rule bg-surface px-4 py-3 sm:grid-cols-2">
            <div>
              <dt className="text-ink-muted">Host Organization / Institution</dt>
              <dd className="mt-0.5 font-medium text-ink">
                {resolveHostOrganizationName(account) || '—'}
              </dd>
            </div>
            <div>
              <dt className="text-ink-muted">Office / Department</dt>
              <dd className="mt-0.5 font-medium text-ink">
                {account.department_office || '—'}
              </dd>
            </div>
            {isIntern ? (
              <>
                <div>
                  <dt className="text-ink-muted">Student ID</dt>
                  <dd className="mt-0.5 font-medium tabular-nums text-ink">
                    {account.student_id_no || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Internship type</dt>
                  <dd className="mt-0.5 font-medium text-ink">
                    {formatInternshipTypeLabel(account.internship_type) || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">School</dt>
                  <dd className="mt-0.5 font-medium text-ink">
                    {account.school_name || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Program &amp; Year Level</dt>
                  <dd className="mt-0.5 font-medium text-ink">
                    {[account.course, account.year_level]
                      .filter(Boolean)
                      .join(' – ') || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Assigned supervisor</dt>
                  <dd className="mt-0.5 font-medium text-ink">
                    {supervisorName || '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink-muted">Required internship hours</dt>
                  <dd className="mt-0.5 font-medium tabular-nums text-ink">
                    {account.required_hours
                      ? `${account.required_hours} hrs`
                      : '—'}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-ink-muted">Internship period</dt>
                  <dd className="mt-0.5 tabular-nums text-ink">
                    {formatInternshipPeriod(
                      account.internship_start_date,
                      account.internship_end_date,
                      formatCalendarDate,
                    ) || '—'}
                  </dd>
                </div>
              </>
            ) : null}
          </dl>

          <div className="rounded-[5px] border border-rule bg-surface px-4 py-3">
            <p className="mb-2 font-semibold text-ink">
              Linked internship records
            </p>
            <RecordBreakdownList summary={account.record_summary} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rule pt-4">
            <div className="flex flex-wrap items-center gap-2">
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    onEdit(account)
                  }}
                  className="inline-flex min-h-9 items-center rounded-[5px] border border-rule bg-surface px-3 font-medium text-ink hover:bg-surface-subtle"
                >
                  Edit
                </button>
              ) : null}
              {!cannotDeactivateOrDelete ? (
                isActive ? (
                  <button
                    type="button"
                    onClick={() => {
                      onClose()
                      onDeactivate(account)
                    }}
                    className="inline-flex min-h-9 items-center rounded-[5px] border border-rule bg-surface px-3 font-medium text-ink hover:bg-surface-subtle"
                  >
                    Deactivate
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onClose()
                      onReactivate(account)
                    }}
                    className="inline-flex min-h-9 items-center rounded-[5px] border border-accent/40 bg-accent-tint px-3 font-medium text-accent hover:bg-accent-tint/80"
                  >
                    Reactivate
                  </button>
                )
              ) : null}
              {!cannotDeactivateOrDelete ? (
                <button
                  type="button"
                  onClick={() => {
                    onClose()
                    onDelete(account)
                  }}
                  className="inline-flex min-h-9 items-center rounded-[5px] border border-error-border/50 bg-error-tint px-3 font-medium text-error hover:opacity-90"
                >
                  Delete Account
                </button>
              ) : null}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-9 items-center rounded-[5px] border border-rule bg-surface px-4 font-medium text-ink hover:bg-surface-subtle"
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </SubmissionDialog>
  )
}

function EditAccountForm({ account, supervisors, onClose, onSaved }) {
  const isIntern = account.role === 'intern'
  const [fullName, setFullName] = useState(account.full_name || '')
  const [internshipType, setInternshipType] = useState(
    account.internship_type || 'off_campus',
  )
  const [companyName, setCompanyName] = useState(account.company_name || '')
  const [departmentOffice, setDepartmentOffice] = useState(
    account.department_office || '',
  )
  const [studentIdNo, setStudentIdNo] = useState(account.student_id_no || '')
  const [schoolName, setSchoolName] = useState(account.school_name || '')
  const [course, setCourse] = useState(account.course || '')
  const [yearLevel, setYearLevel] = useState(account.year_level || '')
  const [startDate, setStartDate] = useState(
    account.internship_start_date || '',
  )
  const [endDate, setEndDate] = useState(account.internship_end_date || '')
  const [requiredHours, setRequiredHours] = useState(
    String(account.required_hours || DEFAULT_REQUIRED_INTERNSHIP_HOURS),
  )
  const [supervisorId, setSupervisorId] = useState(account.supervisor_id || '')
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const formRef = useRef(null)

  useFormValidationSync(formRef)

  const assignableSupervisors = supervisors.filter(
    (sup) => sup.is_active !== false || sup.id === account.supervisor_id,
  )

  async function handleSubmit(event) {
    event.preventDefault()
    if (!supabase) return

    const trimmedName = fullName.trim()
    if (!trimmedName) {
      setErrorMsg('Full name is required.')
      return
    }

    let parsedHours = account.required_hours || DEFAULT_REQUIRED_INTERNSHIP_HOURS
    if (isIntern) {
      const numeric = Number(String(requiredHours).trim())
      if (!Number.isInteger(numeric) || numeric <= 0) {
        setErrorMsg('Required hours must be a positive whole number.')
        return
      }
      parsedHours = numeric

      if (!supervisorId) {
        setErrorMsg('An assigned supervisor is required for intern accounts.')
        return
      }

      if (startDate.trim() && endDate.trim() && endDate.trim() < startDate.trim()) {
        setErrorMsg(
          'Internship end date must be on or after the internship start date.',
        )
        return
      }
    }

    setSaving(true)
    setErrorMsg('')

    const resolvedHostOrg =
      companyName.trim() ||
      (isIntern && internshipType === 'on_campus' ? schoolName.trim() : '')

    const body = isIntern
      ? {
          action: 'update_account',
          target_user_id: account.id,
          full_name: trimmedName,
          internship_type: internshipType || null,
          company_name: resolvedHostOrg || null,
          department_office: departmentOffice.trim() || null,
          supervisor_id: supervisorId || null,
          student_id_no: studentIdNo.trim() || null,
          school_name: schoolName.trim() || null,
          course: course.trim() || null,
          year_level: yearLevel.trim() || null,
          required_hours: parsedHours,
          internship_start_date: startDate.trim() || null,
          internship_end_date: endDate.trim() || null,
        }
      : {
          action: 'update_account',
          target_user_id: account.id,
          full_name: trimmedName,
          company_name: companyName.trim() || null,
          department_office: departmentOffice.trim() || null,
        }

    const { data, error } = await supabase.functions.invoke('manage-account', {
      body,
    })

    if (error) {
      const parsed = await extractEdgeFunctionError(
        error,
        'Could not update account details.',
      )
      setErrorMsg(parsed.message)
      setSaving(false)
      return
    }

    if (data?.error) {
      setErrorMsg(String(data.error))
      setSaving(false)
      return
    }

    setSaving(false)
    onSaved(`Updated account details for ${trimmedName}.`)
    onClose()
  }

  return (
    <>
      <div className={errorMsg ? 'mb-4' : ''}>
        <AlertMessage message={errorMsg} variant="error" />
      </div>

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        noValidate
        className="space-y-4"
      >
        <FormField
          id="edit-acct-full-name"
          name="full_name"
          label="Full name"
          type="text"
          required
          maxLength={120}
          value={fullName}
          onChange={(e) => {
            setFullName(e.target.value)
            if (errorMsg) setErrorMsg('')
          }}
        />

        {isIntern ? (
          <>
            <fieldset className="space-y-4 border-t border-rule pt-4">
              <legend className="text-xs font-semibold uppercase tracking-[0.04em] text-ink-muted">
                Intern Information
              </legend>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  id="edit-acct-student-id"
                  name="student_id_no"
                  label="Student ID"
                  type="text"
                  value={studentIdNo}
                  onChange={(e) => setStudentIdNo(e.target.value)}
                />
                <FormField
                  id="edit-acct-year-level"
                  name="year_level"
                  label="Year level"
                  type="text"
                  list="edit-year-level-options"
                  placeholder="e.g. 4th Year"
                  value={yearLevel}
                  onChange={(e) => setYearLevel(e.target.value)}
                />
                <datalist id="edit-year-level-options">
                  <option value="3rd Year" />
                  <option value="4th Year" />
                  <option value="5th Year" />
                </datalist>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  id="edit-acct-school"
                  name="school_name"
                  label="School"
                  type="text"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                />
                <FormField
                  id="edit-acct-course"
                  name="course"
                  label="Course / Program"
                  type="text"
                  value={course}
                  onChange={(e) => setCourse(e.target.value)}
                />
              </div>
            </fieldset>

            <fieldset className="space-y-4 border-t border-rule pt-4">
              <legend className="text-xs font-semibold uppercase tracking-[0.04em] text-ink-muted">
                Internship Placement Information
              </legend>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="field-group flex flex-col gap-1.5">
                  <label
                    htmlFor="edit-acct-internship-type"
                    className="text-sm font-medium leading-[1.4] text-ink"
                  >
                    Internship type
                  </label>
                  <select
                    id="edit-acct-internship-type"
                    name="internship_type"
                    value={internshipType}
                    onChange={(e) => {
                      const nextType = e.target.value
                      setInternshipType(nextType)
                      if (
                        nextType === 'on_campus' &&
                        !companyName.trim() &&
                        schoolName.trim()
                      ) {
                        setCompanyName(schoolName.trim())
                      }
                    }}
                    className="form-control min-h-11 w-full rounded-[5px] border border-input-border bg-surface px-3.5 py-2.5 text-sm text-ink hover:border-ink"
                  >
                    <option value="off_campus">Off-campus</option>
                    <option value="on_campus">On-campus</option>
                  </select>
                </div>

                <div className="field-group flex flex-col gap-1.5">
                  <label
                    htmlFor="edit-acct-supervisor"
                    className="text-sm font-medium leading-[1.4] text-ink"
                  >
                    Assigned supervisor
                  </label>
                  <select
                    id="edit-acct-supervisor"
                    required
                    value={supervisorId}
                    onChange={(e) => setSupervisorId(e.target.value)}
                    className="form-control min-h-11 w-full rounded-[5px] border border-input-border bg-surface px-3.5 py-2.5 text-sm text-ink hover:border-ink"
                  >
                    <option value="">Unassigned</option>
                    {assignableSupervisors.map((sup) => (
                      <option key={sup.id} value={sup.id}>
                        {sup.full_name}
                        {sup.is_active === false ? ' (Deactivated)' : ''}
                        {sup.company_name ? ` — ${sup.company_name}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  id="edit-acct-company"
                  name="company_name"
                  label="Host Organization / Institution"
                  type="text"
                  placeholder={
                    internshipType === 'on_campus'
                      ? 'e.g. Romblon State University – Cajidiocan Campus'
                      : 'e.g. Acme Tech Corp'
                  }
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
                <FormField
                  id="edit-acct-department-office"
                  name="department_office"
                  label="Office / Department"
                  type="text"
                  placeholder={
                    internshipType === 'on_campus'
                      ? 'e.g. Information and Communications Technology Office'
                      : 'e.g. Information Technology Department'
                  }
                  value={departmentOffice}
                  onChange={(e) => setDepartmentOffice(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <FormField
                  id="edit-acct-start-date"
                  name="internship_start_date"
                  label="Internship start date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <FormField
                  id="edit-acct-end-date"
                  name="internship_end_date"
                  label="Internship end date"
                  type="date"
                  min={startDate || undefined}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
                <FormField
                  id="edit-acct-hours"
                  name="required_hours"
                  label="Required internship hours"
                  type="number"
                  min={1}
                  step={1}
                  required
                  value={requiredHours}
                  onChange={(e) => setRequiredHours(e.target.value)}
                />
              </div>
            </fieldset>
          </>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              id="edit-acct-sup-company"
              name="company_name"
              label="Host Organization / Institution"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
            <FormField
              id="edit-acct-sup-department"
              name="department_office"
              label="Office / Department"
              type="text"
              value={departmentOffice}
              onChange={(e) => setDepartmentOffice(e.target.value)}
            />
          </div>
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
            disabled={saving}
            className="inline-flex min-h-10 items-center justify-center rounded-[5px] bg-accent-solid px-4 text-sm font-medium text-on-accent hover:bg-accent-solid-hover disabled:opacity-65"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </>
  )
}

export function EditAccountDialog({ account, supervisors, onClose, onSaved }) {
  return (
    <SubmissionDialog
      open={Boolean(account)}
      title={account ? `Edit Account — ${account.full_name}` : 'Edit Account'}
      description="Update official internship placement or supervisor profile details."
      onClose={onClose}
    >
      {account ? (
        <EditAccountForm
          key={account.id}
          account={account}
          supervisors={supervisors}
          onClose={onClose}
          onSaved={onSaved}
        />
      ) : null}
    </SubmissionDialog>
  )
}

function DeactivateAccountForm({ account, onClose, onCompleted }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (!supabase) return

    const trimmedReason = reason.trim()
    if (!trimmedReason) {
      setErrorMsg('Provide a reason for deactivating this account.')
      return
    }

    setSaving(true)
    setErrorMsg('')

    const { data, error } = await supabase.functions.invoke('manage-account', {
      body: {
        action: 'deactivate_account',
        target_user_id: account.id,
        reason: trimmedReason,
      },
    })

    if (error) {
      const parsed = await extractEdgeFunctionError(
        error,
        'Could not deactivate account.',
      )
      setErrorMsg(parsed.message)
      setSaving(false)
      return
    }

    if (data?.error) {
      setErrorMsg(String(data.error))
      setSaving(false)
      return
    }

    setSaving(false)
    onCompleted(
      `Deactivated ${account.full_name}. Portal sign-in has been revoked while historical records remain preserved.`,
    )
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4 text-xs">
      {errorMsg ? <AlertMessage message={errorMsg} variant="error" /> : null}

      <dl className="grid grid-cols-1 gap-2.5 rounded-[5px] border border-rule bg-surface-subtle px-4 py-3 sm:grid-cols-3">
        <div>
          <dt className="text-ink-muted">Account name</dt>
          <dd className="mt-0.5 font-semibold text-ink">{account.full_name}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Account email</dt>
          <dd className="mt-0.5 break-all font-medium text-ink">
            {account.email || '—'}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Assigned role</dt>
          <dd className="mt-0.5 font-medium text-ink">
            {ROLE_LABELS[account.role] ?? account.role}
          </dd>
        </div>
      </dl>

      <div className="rounded-[5px] border border-accent/35 bg-accent-tint/50 px-4 py-3 text-ink">
        Deactivating this account immediately disables login access and blocks
        portal actions, while preserving all historical attendance logs,
        accomplishments, tasks, approvals, and reports under the user&apos;s
        original identity. You can reactivate the account later if needed.
      </div>

      <FormField
        id="deactivate-reason"
        name="reason"
        label="Reason for deactivation"
        multiline
        rows={2}
        required
        placeholder="e.g. Completed internship term / transferred to another department"
        value={reason}
        onChange={(e) => {
          setReason(e.target.value)
          if (errorMsg) setErrorMsg('')
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
          className="inline-flex min-h-10 items-center justify-center rounded-[5px] bg-accent-solid px-4 text-sm font-medium text-on-accent hover:bg-accent-solid-hover disabled:opacity-65"
        >
          {saving ? 'Deactivating…' : 'Deactivate Account'}
        </button>
      </div>
    </form>
  )
}

export function DeactivateAccountDialog({ account, onClose, onCompleted }) {
  return (
    <SubmissionDialog
      open={Boolean(account)}
      title="Deactivate Account"
      description="Revoke portal access while preserving all historical internship records."
      onClose={onClose}
    >
      {account ? (
        <DeactivateAccountForm
          key={account.id}
          account={account}
          onClose={onClose}
          onCompleted={onCompleted}
        />
      ) : null}
    </SubmissionDialog>
  )
}

function ReactivateAccountForm({ account, onClose, onCompleted }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (!supabase) return

    setSaving(true)
    setErrorMsg('')

    const { data, error } = await supabase.functions.invoke('manage-account', {
      body: {
        action: 'reactivate_account',
        target_user_id: account.id,
        reason: reason.trim() || 'Account reactivated by SIP Coordinator',
      },
    })

    if (error) {
      const parsed = await extractEdgeFunctionError(
        error,
        'Could not reactivate account.',
      )
      setErrorMsg(parsed.message)
      setSaving(false)
      return
    }

    if (data?.error) {
      setErrorMsg(String(data.error))
      setSaving(false)
      return
    }

    setSaving(false)
    onCompleted(`Reactivated ${account.full_name}. Portal sign-in access has been restored.`)
    onClose()
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4 text-xs">
      {errorMsg ? <AlertMessage message={errorMsg} variant="error" /> : null}

      <dl className="grid grid-cols-1 gap-2.5 rounded-[5px] border border-rule bg-surface-subtle px-4 py-3 sm:grid-cols-3">
        <div>
          <dt className="text-ink-muted">Account name</dt>
          <dd className="mt-0.5 font-semibold text-ink">{account.full_name}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Account email</dt>
          <dd className="mt-0.5 break-all font-medium text-ink">
            {account.email || '—'}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Assigned role</dt>
          <dd className="mt-0.5 font-medium text-ink">
            {ROLE_LABELS[account.role] ?? account.role}
          </dd>
        </div>
      </dl>

      {account.deactivated_reason ? (
        <p className="rounded-[5px] border border-rule bg-surface px-4 py-3 text-ink-muted">
          <strong className="font-medium text-ink">
            Previous deactivation reason:
          </strong>{' '}
          {account.deactivated_reason}
        </p>
      ) : null}

      <FormField
        id="reactivate-reason"
        name="reason"
        label="Reactivation note (optional)"
        type="text"
        placeholder="e.g. Returned for extended internship period"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
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
          className="inline-flex min-h-10 items-center justify-center rounded-[5px] bg-accent-solid px-4 text-sm font-medium text-on-accent hover:bg-accent-solid-hover disabled:opacity-65"
        >
          {saving ? 'Reactivating…' : 'Reactivate Account'}
        </button>
      </div>
    </form>
  )
}

export function ReactivateAccountDialog({ account, onClose, onCompleted }) {
  return (
    <SubmissionDialog
      open={Boolean(account)}
      title="Reactivate Account"
      description="Restore portal sign-in access for this deactivated account."
      onClose={onClose}
    >
      {account ? (
        <ReactivateAccountForm
          key={account.id}
          account={account}
          onClose={onClose}
          onCompleted={onCompleted}
        />
      ) : null}
    </SubmissionDialog>
  )
}

function DeleteAccountBody({
  account,
  onClose,
  onSwitchToDeactivate,
  onDeleted,
}) {
  const [inspectState, setInspectState] = useState({
    loading: true,
    details: account,
    error: '',
  })
  const [typedName, setTypedName] = useState('')
  const [reason, setReason] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    if (!supabase || !account?.id) return undefined
    let active = true

    supabase.functions
      .invoke('manage-account', {
        body: {
          action: 'inspect_account',
          target_user_id: account.id,
        },
      })
      .then(async ({ data, error }) => {
        if (!active) return
        if (error) {
          const parsed = await extractEdgeFunctionError(
            error,
            'Could not verify linked internship records.',
          )
          setInspectState({
            loading: false,
            details: account,
            error: parsed.message,
          })
          return
        }
        if (data?.error || !data?.account) {
          setInspectState({
            loading: false,
            details: account,
            error: data?.error || 'Could not inspect target account.',
          })
          return
        }
        setInspectState({
          loading: false,
          details: data.account,
          error: '',
        })
      })

    return () => {
      active = false
    }
  }, [account])

  const details = inspectState.details
  const recordSummary = details?.record_summary
  const hasHistoricalRecords = Boolean(
    details?.has_historical_records || (recordSummary?.total ?? 0) > 0,
  )
  const canDeletePermanently =
    !inspectState.loading &&
    !inspectState.error &&
    Boolean(details?.can_permanently_delete) &&
    !hasHistoricalRecords

  const nameMatches =
    typedName.trim().length > 0 &&
    typedName.trim() === String(details?.full_name ?? '').trim()

  async function handleConfirmDelete(event) {
    event.preventDefault()
    if (!supabase || !canDeletePermanently) return

    if (!nameMatches) {
      setSubmitError(
        `Type "${details.full_name}" exactly to confirm permanent deletion.`,
      )
      return
    }
    if (!reason.trim()) {
      setSubmitError('Provide a reason for permanently deleting this account.')
      return
    }

    setDeleting(true)
    setSubmitError('')

    const { data, error } = await supabase.functions.invoke('manage-account', {
      body: {
        action: 'delete_account',
        target_user_id: details.id,
        confirm_name: typedName.trim(),
        reason: reason.trim(),
      },
    })

    if (error) {
      const parsed = await extractEdgeFunctionError(
        error,
        'Could not delete account.',
      )
      setSubmitError(parsed.message)
      if (parsed.code === 'HAS_HISTORICAL_RECORDS' && parsed.record_summary) {
        setInspectState((prev) => ({
          ...prev,
          details: {
            ...prev.details,
            has_historical_records: true,
            can_permanently_delete: false,
            record_summary: parsed.record_summary,
          },
        }))
      }
      setDeleting(false)
      return
    }

    if (data?.error) {
      setSubmitError(String(data.error))
      setDeleting(false)
      return
    }

    setDeleting(false)
    onDeleted(
      `Permanently deleted account for ${details.full_name} (${details.email || 'no email'}). An audit log entry has been recorded.`,
    )
    onClose()
  }

  return (
    <div className="space-y-4 text-xs">
      <dl className="grid grid-cols-1 gap-2.5 rounded-[5px] border border-rule bg-surface-subtle px-4 py-3 sm:grid-cols-3">
        <div>
          <dt className="text-ink-muted">Account name</dt>
          <dd className="mt-0.5 font-semibold text-ink">
            {details?.full_name}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Account email</dt>
          <dd className="mt-0.5 break-all font-medium text-ink">
            {details?.email || '—'}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Assigned role</dt>
          <dd className="mt-0.5 font-medium text-ink">
            {ROLE_LABELS[details?.role] ?? details?.role}
          </dd>
        </div>
      </dl>

      <div className="rounded-[5px] border border-error-border/45 bg-error-tint px-4 py-3 text-error">
        <p className="font-semibold">Portal access warning</p>
        <p className="mt-1 leading-[1.5]">
          Deleting an account removes the user&apos;s login credentials and
          permanently revokes their access to My SIP Portal. This action cannot
          be undone.
        </p>
      </div>

      {inspectState.loading ? (
        <div className="flex items-center gap-2.5 rounded-[5px] border border-rule bg-surface px-4 py-5 text-ink-muted">
          <progress
            aria-label="Checking linked internship records"
            className="loading-spinner"
          />
          <span>
            Checking attendance, accomplishments, tasks, and supervisor
            assignments…
          </span>
        </div>
      ) : inspectState.error ? (
        <div className="space-y-4">
          <AlertMessage message={inspectState.error} variant="error" />
          <div className="flex justify-end border-t border-rule pt-4">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-10 items-center rounded-[5px] border border-rule bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-subtle"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : details?.is_self || details?.is_last_active_coordinator ? (
        <div className="space-y-4">
          <AlertMessage
            message={
              details.block_reason ||
              'This protected coordinator account cannot be deleted.'
            }
            variant="error"
          />
          <div className="flex justify-end border-t border-rule pt-4">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-10 items-center rounded-[5px] border border-rule bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-subtle"
            >
              Close
            </button>
          </div>
        </div>
      ) : hasHistoricalRecords ? (
        <div className="space-y-4">
          <div className="rounded-[5px] border border-rule bg-surface px-4 py-3.5">
            <p className="font-semibold text-ink">
              Permanent deletion blocked — existing internship records found
            </p>
            <p className="mt-1 leading-[1.5] text-ink-muted">
              To preserve official internship records, approvals, and historical
              identity, accounts with linked records cannot be permanently
              deleted. Deactivate the account instead to revoke portal access
              without removing historical data.
            </p>
            <div className="mt-3 border-t border-rule pt-3">
              <RecordBreakdownList summary={recordSummary} />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-rule pt-4">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-10 items-center justify-center rounded-[5px] border border-rule bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-subtle"
            >
              Cancel
            </button>
            {details?.is_active !== false ? (
              <button
                type="button"
                onClick={() => {
                  onClose()
                  onSwitchToDeactivate(details)
                }}
                className="inline-flex min-h-10 items-center justify-center rounded-[5px] bg-accent-solid px-4 text-sm font-medium text-on-accent hover:bg-accent-solid-hover"
              >
                Deactivate Account Instead
              </button>
            ) : (
              <span className="text-xs font-medium text-ink-muted">
                Account is already deactivated &amp; archived
              </span>
            )}
          </div>
        </div>
      ) : (
        <form onSubmit={handleConfirmDelete} noValidate className="space-y-4">
          {submitError ? (
            <AlertMessage message={submitError} variant="error" />
          ) : null}

          <div className="rounded-[5px] border border-success-border/45 bg-success-tint px-4 py-3 text-success">
            Verified: no attendance records, accomplishment submissions, tasks,
            reviews, or supervisor assignments exist for this account. Permanent
            deletion is permitted.
          </div>

          <FormField
            id="delete-account-reason"
            name="reason"
            label="Reason for deletion"
            multiline
            rows={2}
            required
            placeholder="e.g. Duplicate account created in error"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value)
              if (submitError) setSubmitError('')
            }}
          />

          <FormField
            id="delete-account-confirm-name"
            name="confirm_name"
            label={`Type "${details.full_name}" to confirm permanent deletion`}
            type="text"
            autoComplete="off"
            spellCheck={false}
            required
            placeholder={details.full_name}
            value={typedName}
            onChange={(e) => {
              setTypedName(e.target.value)
              if (submitError) setSubmitError('')
            }}
          />

          <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-rule pt-4">
            <button
              type="button"
              disabled={deleting}
              onClick={onClose}
              className="inline-flex min-h-10 items-center justify-center rounded-[5px] border border-rule bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-subtle disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={deleting || !nameMatches || !reason.trim()}
              className="inline-flex min-h-10 items-center justify-center rounded-[5px] border border-rejected-border bg-rejected-bg px-4 text-sm font-medium text-on-accent hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleting ? 'Deleting…' : 'Delete Account'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

export function DeleteAccountDialog({
  account,
  onClose,
  onSwitchToDeactivate,
  onDeleted,
}) {
  return (
    <SubmissionDialog
      open={Boolean(account)}
      title="Delete Account"
      description="Confirm permanent account removal or archive accounts with existing internship records."
      onClose={onClose}
    >
      {account ? (
        <DeleteAccountBody
          key={account.id}
          account={account}
          onClose={onClose}
          onSwitchToDeactivate={onSwitchToDeactivate}
          onDeleted={onDeleted}
        />
      ) : null}
    </SubmissionDialog>
  )
}
