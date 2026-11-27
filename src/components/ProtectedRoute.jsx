import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { getDashboardPathForRole } from '../lib/roleRoutes'

export function ProtectedRoute({ allowedRole }) {
  const { user, profile, profileError, loading, logout, refreshProfile } =
    useAuth()

  if (loading) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-surface px-6">
        <progress aria-label="Loading workspace" className="loading-spinner" />
        <p className="text-sm font-medium text-ink-muted">Loading session…</p>
      </main>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (!profile) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-surface px-6">
        <section
          role="alert"
          className="w-full max-w-md rounded-[6px] border border-rule bg-surface p-6"
        >
          <h1 className="text-lg font-semibold text-ink">
            Profile unavailable
          </h1>
          <p className="mt-2 text-sm text-ink-muted">
            {profileError
              ? 'Your account profile could not be loaded. Please try again or log out.'
              : 'No profile record was found for your account. Contact your SIP Coordinator.'}
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={refreshProfile}
              className="inline-flex min-h-10 items-center justify-center rounded-[5px] border border-rule bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-subtle"
            >
              Try again
            </button>
            <button
              type="button"
              onClick={logout}
              className="inline-flex min-h-10 items-center justify-center rounded-[5px] bg-accent-solid px-4 text-sm font-medium text-on-accent hover:bg-accent-solid-hover"
            >
              Log out
            </button>
          </div>
        </section>
      </main>
    )
  }

  if (allowedRole && profile.role !== allowedRole) {
    return <Navigate to={getDashboardPathForRole(profile.role)} replace />
  }

  return <Outlet />
}
