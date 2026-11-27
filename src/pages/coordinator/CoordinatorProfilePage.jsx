import { useCallback, useEffect, useRef, useState } from 'react'
import { AlertMessage } from '../../components/AlertMessage'
import { FormField } from '../../components/FormField'
import { EditIcon } from '../../components/Icons'
import { SubmissionDialog } from '../../components/SubmissionDialog'
import { useAuth } from '../../context/useAuth'
import { supabase } from '../../lib/supabaseClient'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useFormValidationSync } from '../../lib/useFormValidationSync'

function setFieldInvalidFallback(input, invalid) {
  if (!input) return
  input.classList.toggle('user-invalid-fallback', invalid)
  input.setAttribute('aria-invalid', invalid ? 'true' : 'false')
  input.closest('.field-group')?.classList.toggle('has-error-fallback', invalid)
}

function EditCoordinatorNameForm({
  coordinatorId,
  currentName,
  onClose,
  onSaved,
}) {
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

    if (!supabase || !coordinatorId) {
      setFormError('Unable to verify your coordinator session.')
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
      .eq('id', coordinatorId)
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
        aria-label="Edit display name"
        onSubmit={handleSubmit}
        noValidate
        className="space-y-4"
      >
        <FormField
          inputRef={nameInputRef}
          id="edit-coordinator-full-name"
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

export function CoordinatorProfilePage() {
  useDocumentTitle('My Profile')

  const { user, profile, refreshProfile } = useAuth()
  const coordinatorId = profile?.id

  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [nameSuccess, setNameSuccess] = useState('')

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
      'Your password has been updated. Use it the next time you sign in.',
    )
  }

  const profileRows = [
    { label: 'Full name', value: profile?.full_name?.trim() || '—' },
    { label: 'Email address', value: user?.email || '—' },
    { label: 'Role', value: 'SIP Coordinator' },
    {
      label: 'Department / Organization',
      value: profile?.company_name?.trim() || 'Student Internship Program Office',
    },
  ]

  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <h1
          id="main-content"
          tabIndex={-1}
          className="ledger-title text-[clamp(1.375rem,1.2rem+0.6vw,1.75rem)] font-semibold leading-[1.2] tracking-[-0.02em] text-ink outline-none"
        >
          My Profile
        </h1>
        <p className="mt-1.5 max-w-[64ch] text-sm leading-[1.55] text-ink-muted">
          Manage your SIP Coordinator display name and account sign-in password.
        </p>
      </header>

      {nameSuccess ? (
        <AlertMessage message={nameSuccess} variant="success" />
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-[6px] border border-rule bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-surface-subtle px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold text-ink">
                Coordinator Account
              </h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                Administrative profile details shown across the portal
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
                className="grid grid-cols-1 gap-1 px-5 py-3.5 sm:grid-cols-[12rem_minmax(0,1fr)] sm:items-baseline sm:gap-4"
              >
                <dt className="text-xs font-medium text-ink-muted">
                  {item.label}
                </dt>
                <dd className="break-words text-sm font-medium text-ink">
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>

          <p className="border-t border-rule bg-surface-subtle px-5 py-3 text-xs leading-[1.5] text-ink-muted">
            Coordinator access covers account provisioning, program monitoring,
            submission oversight, and consolidated reporting.
          </p>
        </section>

        <section className="overflow-hidden rounded-[6px] border border-rule bg-surface">
          <div className="border-b border-rule bg-surface-subtle px-5 py-3.5">
            <h2 className="text-sm font-semibold text-ink">Change password</h2>
            <p className="mt-0.5 text-xs leading-[1.45] text-ink-muted">
              Update your account password to keep program records secure.
            </p>
          </div>

          <div className="px-5 py-4">
            <div
              className={passwordSuccess || passwordError ? 'mb-4 space-y-2' : ''}
            >
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
                id="coord-new-password"
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
                id="coord-confirm-password"
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

      <SubmissionDialog
        open={editDialogOpen}
        title="Edit name"
        description="Update the display name shown on your coordinator workspace."
        onClose={closeEditDialog}
      >
        {editDialogOpen ? (
          <EditCoordinatorNameForm
            coordinatorId={coordinatorId}
            currentName={profile?.full_name ?? ''}
            onClose={closeEditDialog}
            onSaved={handleNameSaved}
          />
        ) : null}
      </SubmissionDialog>
    </div>
  )
}
