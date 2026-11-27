import { Link } from 'react-router-dom'
import { AlertMessage } from '../../components/AlertMessage'
import { NavIcon } from '../../components/Icons'
import { useAuth } from '../../context/useAuth'
import { formatDecimalHours } from '../../lib/attendanceUtils'
import { useCoordinatorData } from '../../lib/useCoordinatorData'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

const SEVERITY_STYLES = {
  high: 'border-error-border/45 bg-error-tint text-error',
  medium: 'border-accent/40 bg-accent-tint text-accent',
  info: 'border-rule bg-surface-subtle text-ink-muted',
}

export function CoordinatorDashboard() {
  useDocumentTitle('Coordinator Dashboard')

  const { profile } = useAuth()
  const {
    loading,
    loadError,
    totals,
    attentionAlerts,
    attendanceAnalytics,
    taskAnalytics,
    reportTotals,
    reload,
  } = useCoordinatorData()

  const coordinatorName = profile?.full_name?.trim() || 'SIP Coordinator'
  const topAlerts = attentionAlerts.slice(0, 3)

  const workspaceCards = [
    {
      to: '/coordinator/accounts',
      icon: 'interns',
      title: 'Account Management',
      description:
        'Create intern and supervisor accounts, configure required hours, and manage supervisor assignments.',
      meta: `${totals.totalInterns} ${totals.totalInterns === 1 ? 'intern' : 'interns'} · ${totals.totalSupervisors} ${totals.totalSupervisors === 1 ? 'supervisor' : 'supervisors'}`,
    },
    {
      to: '/coordinator/monitoring',
      icon: 'monitoring',
      title: 'Monitoring',
      description:
        'Operational overview of priority alerts, intern hours progress, supervisor workload, and latest activity.',
      meta: `${totals.activeAlertsCount} active ${totals.activeAlertsCount === 1 ? 'alert' : 'alerts'} · ${totals.internsNeedingAttention} needing attention`,
    },
    {
      to: '/coordinator/submissions',
      icon: 'submissions',
      title: 'Submissions & Reviews',
      description:
        'Search, filter, and inspect weekly attendance, accomplishments, and task records across all interns.',
      meta: `${reportTotals.total} total ${reportTotals.total === 1 ? 'record' : 'records'} · ${totals.totalPendingApprovals} pending review`,
    },
    {
      to: '/coordinator/reports',
      icon: 'reports',
      title: 'Reports & Analytics',
      description:
        'Analyze internship progress, compliance trends, task completion, and export filtered Excel or PDF reports.',
      meta:
        attendanceAnalytics.complianceRatePct !== null
          ? `${attendanceAnalytics.complianceRatePct.toFixed(1)}% weekly attendance compliance`
          : 'Charts & filtered exports',
    },
  ]

  return (
    <div className="max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1
            id="main-content"
            tabIndex={-1}
            className="ledger-title text-[clamp(1.375rem,1.2rem+0.6vw,1.75rem)] font-semibold leading-[1.2] tracking-[-0.02em] text-ink outline-none"
          >
            Welcome back, {coordinatorName}
          </h1>
          <p className="mt-1.5 max-w-[66ch] text-sm leading-[1.55] text-ink-muted">
            Oversee the Student Internship Program across accounts, daily
            monitoring, submission reviews, and program-wide analytics.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/coordinator/monitoring"
            className="inline-flex min-h-10 items-center justify-center rounded-[5px] border border-rule bg-surface px-4 text-sm font-medium text-ink hover:bg-surface-subtle"
          >
            Open Monitoring
          </Link>
          <Link
            to="/coordinator/accounts"
            className="inline-flex min-h-10 items-center justify-center rounded-[5px] bg-accent-solid px-4 text-sm font-medium text-on-accent hover:bg-accent-solid-hover"
          >
            Manage Accounts
          </Link>
        </div>
      </header>

      {loadError ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <AlertMessage
              message={`Could not load program summary: ${loadError}`}
              variant="error"
            />
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
            aria-label="Loading coordinator overview"
            className="loading-spinner"
          />
          <span>Loading program overview…</span>
        </div>
      ) : (
        <>
          <section
            aria-label="Program key metrics"
            className="dashboard-metric-wrap overflow-hidden rounded-[6px] border border-rule bg-surface"
          >
            <dl className="dashboard-metric-grid">
              <div className="dashboard-metric-cell">
                <dt className="text-xs font-medium text-ink-muted">
                  Total Active Interns
                </dt>
                <dd className="text-xl font-semibold tabular-nums text-ink">
                  {totals.totalInterns}
                </dd>
                <dd className="text-xs tabular-nums text-ink-muted">
                  {totals.totalSupervisors}{' '}
                  {totals.totalSupervisors === 1
                    ? 'supervisor'
                    : 'supervisors'}{' '}
                  registered
                </dd>
              </div>
              <div className="dashboard-metric-cell">
                <dt className="text-xs font-medium text-ink-muted">
                  Pending Supervisor Reviews
                </dt>
                <dd className="text-xl font-semibold tabular-nums text-ink">
                  {totals.totalPendingApprovals}
                </dd>
                <dd className="text-xs text-ink-muted">
                  Submitted records awaiting review
                </dd>
              </div>
              <div className="dashboard-metric-cell">
                <dt className="text-xs font-medium text-ink-muted">
                  Interns Needing Attention
                </dt>
                <dd
                  className={`text-xl font-semibold tabular-nums ${
                    totals.internsNeedingAttention > 0
                      ? 'text-error'
                      : 'text-ink'
                  }`}
                >
                  {totals.internsNeedingAttention}
                </dd>
                <dd className="text-xs tabular-nums text-ink-muted">
                  {totals.activeAlertsCount} active{' '}
                  {totals.activeAlertsCount === 1 ? 'alert' : 'alerts'}
                </dd>
              </div>
              <div className="dashboard-metric-cell">
                <dt className="text-xs font-medium text-ink-muted">
                  Total Approved Hours
                </dt>
                <dd className="text-xl font-semibold tabular-nums text-ink">
                  {formatDecimalHours(totals.totalApprovedMinutes)}
                </dd>
                <dd className="text-xs tabular-nums text-ink-muted">
                  {totals.avgProgressPct.toFixed(1)}% avg completion
                </dd>
              </div>
            </dl>
          </section>

          <section aria-labelledby="coordinator-modules-heading" className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <h2
                id="coordinator-modules-heading"
                className="text-sm font-semibold text-ink"
              >
                Coordinator Workspace
              </h2>
              <span className="text-xs text-ink-muted">
                Organized by responsibility
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {workspaceCards.map((card) => (
                <Link
                  key={card.to}
                  to={card.to}
                  className="group flex flex-col justify-between gap-3 rounded-[6px] border border-rule bg-surface p-5 transition-colors hover:border-accent/60 hover:bg-surface-subtle"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-2 text-sm font-semibold text-ink group-hover:text-accent">
                        <NavIcon
                          name={card.icon}
                          className="size-4 text-accent"
                        />
                        {card.title}
                      </span>
                      <span
                        aria-hidden="true"
                        className="text-xs font-medium text-ink-muted group-hover:text-accent"
                      >
                        Open →
                      </span>
                    </div>
                    <p className="text-xs leading-[1.55] text-ink-muted">
                      {card.description}
                    </p>
                  </div>
                  <p className="border-t border-rule pt-3 text-xs font-medium tabular-nums text-ink">
                    {card.meta}
                  </p>
                </Link>
              ))}
            </div>
          </section>

          <section
            aria-labelledby="dashboard-attention-heading"
            className="overflow-hidden rounded-[6px] border border-rule bg-surface"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-surface-subtle px-5 py-3.5">
              <div>
                <h2
                  id="dashboard-attention-heading"
                  className="text-sm font-semibold text-ink"
                >
                  Priority Alerts Snapshot
                </h2>
                <p className="mt-0.5 text-xs text-ink-muted">
                  Most urgent program exceptions requiring follow-up
                </p>
              </div>
              <Link
                to="/coordinator/monitoring"
                className="text-xs font-medium text-accent underline-offset-4 hover:underline"
              >
                View all in Monitoring →
              </Link>
            </div>

            {topAlerts.length === 0 ? (
              <div className="px-5 py-6 text-sm text-ink-muted">
                No urgent alerts right now. All active interns are on track with
                their submissions and assignments.
              </div>
            ) : (
              <ul className="divide-y divide-rule">
                {topAlerts.map((alert) => (
                  <li
                    key={alert.id}
                    className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center rounded-[4px] border px-2 py-0.5 text-[11px] font-semibold ${SEVERITY_STYLES[alert.severity] ?? SEVERITY_STYLES.info}`}
                        >
                          {alert.categoryLabel}
                        </span>
                        <span className="text-sm font-medium text-ink">
                          {alert.internName}
                        </span>
                      </div>
                      <p className="text-xs text-ink-muted">{alert.reason}</p>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-ink-muted">
                      {alert.relevantDate}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule bg-surface-subtle px-5 py-3 text-xs tabular-nums text-ink-muted">
              <span>
                Task completion rate:{' '}
                <strong className="font-semibold text-ink">
                  {taskAnalytics.completionRatePct !== null
                    ? `${taskAnalytics.completionRatePct.toFixed(1)}%`
                    : '—'}
                </strong>
              </span>
              <span>
                Average supervisor review time:{' '}
                <strong className="font-semibold text-ink">
                  {totals.overallAvgTurnaroundLabel}
                </strong>
              </span>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
