import { useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { AlertMessage } from '../../components/AlertMessage'
import { FormField } from '../../components/FormField'
import { useAuth } from '../../context/useAuth'
import { getDashboardPathForRole } from '../../lib/roleRoutes'
import { supabase } from '../../lib/supabaseClient'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useFormValidationSync } from '../../lib/useFormValidationSync'

function MailIcon({ className = 'size-4 shrink-0' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
    >
      <rect x="2.75" y="4.5" width="14.5" height="11" rx="1.5" />
      <path d="m3.5 5.5 6.5 5 6.5-5" strokeLinecap="square" />
    </svg>
  )
}

function LockIcon({ className = 'size-4 shrink-0' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
    >
      <rect x="4" y="9" width="12" height="8" rx="1.5" />
      <path
        d="M6.75 9V6.75a3.25 3.25 0 0 1 6.5 0V9"
        strokeLinecap="square"
      />
    </svg>
  )
}

function EyeIcon({ className = 'size-4 shrink-0' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
    >
      <path d="M2.25 10s3-5.25 7.75-5.25S17.75 10 17.75 10s-3 5.25-7.75 5.25S2.25 10 2.25 10Z" />
      <circle cx="10" cy="10" r="2.25" />
    </svg>
  )
}

function EyeOffIcon({ className = 'size-4 shrink-0' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
    >
      <path
        d="M3.25 3.25 16.75 16.75M8.25 8.4a2.25 2.25 0 0 0 3.35 3.1M5.6 5.9C3.6 7.3 2.25 10 2.25 10s3 5.25 7.75 5.25c1.55 0 2.95-.45 4.1-1.15M10 4.75c4.75 0 7.75 5.25 7.75 5.25a14.4 14.4 0 0 1-1.75 2.35"
        strokeLinecap="square"
      />
    </svg>
  )
}

function HelpCircleIcon({ className = 'size-4 shrink-0' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
    >
      <circle cx="10" cy="10" r="7.25" />
      <path
        d="M8.1 7.8a2.1 2.1 0 0 1 3.9 1.05c0 1.35-2 1.7-2 3.15M10 14.5h.01"
        strokeLinecap="square"
      />
    </svg>
  )
}

export function LoginPage() {
  useDocumentTitle('Sign in')

  const navigate = useNavigate()
  const { user, profile, loading } = useAuth()

  const formRef = useRef(null)
  useFormValidationSync(formRef)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  if (!loading && user && profile?.role && profile?.is_active !== false) {
    return <Navigate to={getDashboardPathForRole(profile.role)} replace />
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (!supabase) {
      setErrorMessage(
        'Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.',
      )
      return
    }

    setSubmitting(true)
    setErrorMessage('')

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) {
      const lower = (error.message ?? '').toLowerCase()
      if (lower.includes('user is banned')) {
        setErrorMessage(
          'Your account has been deactivated. Contact your SIP Coordinator for assistance.',
        )
      } else {
        setErrorMessage(
          error.message === 'Invalid login credentials'
            ? 'Invalid email address or password.'
            : error.message,
        )
      }
      setSubmitting(false)
      return
    }

    const signedInUser = data?.user
    if (!signedInUser) {
      setErrorMessage('Sign-in did not return an active user session.')
      setSubmitting(false)
      return
    }

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', signedInUser.id)
      .single()

    if (profileError || !profileData?.role) {
      await supabase.auth.signOut()
      setErrorMessage(
        'Your account profile could not be loaded. Contact your SIP Coordinator.',
      )
      setSubmitting(false)
      return
    }

    if (profileData.is_active === false) {
      await supabase.auth.signOut()
      setErrorMessage(
        'Your account has been deactivated. Contact your SIP Coordinator for assistance.',
      )
      setSubmitting(false)
      return
    }

    navigate(getDashboardPathForRole(profileData.role), { replace: true })
  }

  return (
    <section aria-labelledby="login-heading">
      <header className="mb-6">
        <h1
          id="login-heading"
          className="ledger-title text-[1.625rem] font-semibold leading-[1.2] tracking-[-0.02em] text-ink"
        >
          Sign in
        </h1>
        <p className="mt-1.5 text-sm leading-[1.55] text-ink-muted">
          Enter your institutional email and password to access My SIP Portal.
        </p>
      </header>

      <div className={errorMessage ? 'mb-5' : ''}>
        <AlertMessage message={errorMessage} variant="error" />
      </div>

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        method="post"
        className="space-y-4.5"
      >
        <FormField
          id="email"
          name="email"
          label="Email address"
          type="email"
          inputMode="email"
          autoComplete="username"
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          enterKeyHint="next"
          placeholder="name@institution.edu"
          required
          requiredIndicator
          validationMessage="Enter an email address in the format you@example.com."
          leadingIcon={<MailIcon className="size-4" />}
          inputClassName="min-h-12 rounded-[7px]"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value)
            if (errorMessage) setErrorMessage('')
          }}
        />

        <div>
          <FormField
            id="password"
            name="password"
            label="Password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            enterKeyHint="done"
            placeholder="Enter your password"
            required
            requiredIndicator
            validationMessage="Enter your password."
            leadingIcon={<LockIcon className="size-4" />}
            inputClassName="min-h-12 rounded-[7px]"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value)
              if (errorMessage) setErrorMessage('')
            }}
            trailingAction={
              <button
                type="button"
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-describedby="toggle-password-warning"
                onClick={() => setShowPassword((prev) => !prev)}
                className="inline-flex min-h-8.5 items-center justify-center gap-1.5 rounded-[5px] px-2.5 text-xs font-medium text-ink-muted hover:bg-surface-subtle hover:text-ink"
              >
                {showPassword ? (
                  <EyeOffIcon className="size-3.5" />
                ) : (
                  <EyeIcon className="size-3.5" />
                )}
                <span aria-hidden="true">{showPassword ? 'Hide' : 'Show'}</span>
              </button>
            }
          />
          <span id="toggle-password-warning" className="visually-hidden">
            Warning: this will display your password on the screen.
          </span>
        </div>

        <div className="pt-1.5">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-[7px] bg-accent-solid px-4 py-2.5 text-sm font-medium text-on-accent shadow-[0_1px_2px_rgb(16_42_82/0.22)] hover:bg-accent-solid-hover disabled:cursor-not-allowed disabled:opacity-65"
          >
            {submitting ? (
              <>
                <span aria-hidden="true" className="auth-btn-spinner" />
                <span>Signing in…</span>
              </>
            ) : (
              'Sign in'
            )}
          </button>
        </div>
      </form>

      <footer className="mt-6 flex items-start gap-2.5 border-t border-rule pt-5 text-xs leading-[1.55] text-ink-muted">
        <HelpCircleIcon className="mt-0.5 size-4 shrink-0 text-ink-muted/80" />
        <p>
          <span className="font-medium text-ink">
            Need an account or password reset?
          </span>{' '}
          Contact your SIP Coordinator for credentials or access assistance.
        </p>
      </footer>
    </section>
  )
}
