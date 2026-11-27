import { useRef, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { AlertMessage } from '../../components/AlertMessage'
import { FormField } from '../../components/FormField'
import { useAuth } from '../../context/useAuth'
import { getDashboardPathForRole } from '../../lib/roleRoutes'
import { supabase } from '../../lib/supabaseClient'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useFormValidationSync } from '../../lib/useFormValidationSync'

export function LoginPage() {
  useDocumentTitle('Log in')

  const navigate = useNavigate()
  const { user, profile, loading } = useAuth()

  const formRef = useRef(null)
  useFormValidationSync(formRef)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  if (!loading && user && profile?.role) {
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
      setErrorMessage(
        error.message === 'Invalid login credentials'
          ? 'Invalid email address or password.'
          : error.message,
      )
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
      .select('role')
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

    navigate(getDashboardPathForRole(profileData.role), { replace: true })
  }

  return (
    <section aria-labelledby="login-heading">
      <header className="mb-7">
        <h1
          id="login-heading"
          className="ledger-title text-[clamp(1.5rem,1.25rem+0.75vw,1.875rem)] font-semibold leading-[1.2] tracking-[-0.02em] text-ink"
        >
          Log in
        </h1>
        <p className="mt-2 text-sm leading-[1.55] text-ink-muted">
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
        className="space-y-5"
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
          required
          validationMessage="Enter an email address in the format you@example.com."
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
            required
            validationMessage="Enter your password."
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
                className="inline-flex min-h-8 min-w-12 items-center justify-center rounded-[4px] px-2.5 text-xs font-medium text-ink-muted hover:bg-surface-subtle hover:text-ink"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            }
          />
          <span id="toggle-password-warning" className="visually-hidden">
            Warning: this will display your password on the screen.
          </span>
        </div>

        <div className="pt-1">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex min-h-11 w-full items-center justify-center rounded-[5px] bg-accent-solid px-4 py-2.5 text-sm font-medium text-on-accent hover:bg-accent-solid-hover disabled:cursor-not-allowed disabled:opacity-65"
          >
            {submitting ? 'Logging in…' : 'Log in'}
          </button>
        </div>
      </form>
    </section>
  )
}
