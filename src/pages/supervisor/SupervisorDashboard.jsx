import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertMessage } from '../../components/AlertMessage'
import { ChevronRightIcon, NavIcon, PlusIcon } from '../../components/Icons'
import { useAuth } from '../../context/useAuth'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useSupervisorData } from '../../lib/useSupervisorData'
import {
  InternDailyActivityUpdatesPanel,
  SupervisorWeeklyReportNotifications,
} from './SupervisorDailyUpdatesSection'
import { AssignTaskDialog } from './SupervisorDialogs'

export function SupervisorDashboard() {
  useDocumentTitle('Supervisor Dashboard')

  const { profile } = useAuth()
  const supervisorId = profile?.id
  const {
    loading,
    loadError: dataError,
    interns,
    internById,
    pendingCounts,
    dailyActivityUpdates,
    submittedWeeklyReports,
    recentReviews,
    reload,
  } = useSupervisorData(supervisorId)

  const [pageSuccess, setPageSuccess] = useState('')
  const [attachmentError, setAttachmentError] = useState('')
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)

  const loadError = attachmentError || dataError

  const closeAssignDialog = useCallback(() => {
    setAssignDialogOpen(false)
  }, [])

  const handleAssigned = useCallback(
    (message) => {
      setPageSuccess(message)
      reload()
    },
    [reload],
  )

  const supervisorName = profile?.full_name?.trim() || 'Supervisor'

  const quickLinks = [
    {
      to: '/supervisor/interns',
      icon: 'interns',
      title: 'My Interns',
      countLabel: `${interns.length} ${interns.length === 1 ? 'intern' : 'interns'}`,
      highlightCount: false,
      description:
        'Check assigned interns, break-adjusted approved hours, and required internship progress.',
      actionLabel: 'Open roster',
    },
    {
      to: '/supervisor/reviews',
      icon: 'tasks',
      title: 'Pending Reviews',
      countLabel: `${pendingCounts.all} pending`,
      highlightCount: pendingCounts.all > 0,
      description:
        'Approve, return, or reject submitted attendance logs, weekly accomplishments, and tasks.',
      actionLabel: 'Open review queue',
    },
    {
      to: '/supervisor/history',
      icon: 'history',
      title: 'Review History',
      countLabel: `${recentReviews.length} recent`,
      highlightCount: false,
      description:
        'View your latest 10 reviewed submissions, decisions, and feedback remarks.',
      actionLabel: 'Open history',
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
            Welcome back, {supervisorName}
          </h1>
          <p className="mt-1.5 max-w-[62ch] text-sm leading-[1.55] text-ink-muted">
            Monitor assigned interns, review pending submissions, and assign
            internship tasks.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setPageSuccess('')
            setAssignDialogOpen(true)
          }}
          className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-[5px] bg-accent-solid px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-solid-hover"
        >
          <PlusIcon className="size-4" />
          <span>Assign a task</span>
        </button>
      </header>

      <div className={pageSuccess || loadError ? 'space-y-3' : ''}>
        <AlertMessage message={pageSuccess} variant="success" />
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
      </div>

      {loading ? (
        <div className="flex items-center gap-3 rounded-[6px] border border-rule bg-surface px-5 py-14 text-sm text-ink-muted">
          <progress
            aria-label="Loading supervisor dashboard"
            className="loading-spinner"
          />
          <span>Loading assigned interns and pending submissions…</span>
        </div>
      ) : (
        <>
          <SupervisorWeeklyReportNotifications
            supervisorId={supervisorId}
            submittedWeeklyReports={submittedWeeklyReports}
          />

          <section className="overflow-hidden rounded-[6px] border border-rule bg-surface">
            <dl className="grid grid-cols-2 divide-y divide-rule sm:grid-cols-3 lg:grid-cols-5 lg:divide-x lg:divide-y-0">
              <div className="px-5 py-4 max-lg:border-e max-lg:border-rule">
                <dt className="text-xs font-medium text-ink-muted">
                  Assigned interns
                </dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">
                  {interns.length}
                </dd>
              </div>
              <div className="px-5 py-4 sm:max-lg:border-e sm:max-lg:border-rule">
                <dt className="text-xs font-medium text-ink-muted">
                  Pending reviews
                </dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">
                  {pendingCounts.all}
                </dd>
              </div>
              <div className="px-5 py-4 max-sm:border-e max-sm:border-rule">
                <dt className="text-xs font-medium text-ink-muted">
                  Pending attendance
                </dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">
                  {pendingCounts.attendance}
                </dd>
              </div>
              <div className="px-5 py-4 sm:max-lg:border-e sm:max-lg:border-rule">
                <dt className="text-xs font-medium text-ink-muted">
                  Pending accomplishments
                </dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">
                  {pendingCounts.accomplishments}
                </dd>
              </div>
              <div className="col-span-2 px-5 py-4 sm:col-span-1">
                <dt className="text-xs font-medium text-ink-muted">
                  Pending tasks
                </dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-ink">
                  {pendingCounts.tasks}
                </dd>
              </div>
            </dl>
          </section>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {quickLinks.map((card) => (
              <Link
                key={card.to}
                to={card.to}
                className="group block rounded-[6px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <article className="grid h-full grid-rows-[auto_1fr_auto] gap-3 rounded-[6px] border border-rule bg-surface p-5 transition-colors group-hover:border-accent/55 group-hover:bg-surface-subtle/60">
                  <header className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-[5px] border border-rule bg-surface-subtle text-ink-muted transition-colors group-hover:border-accent/35 group-hover:text-accent">
                        <NavIcon name={card.icon} className="size-4" />
                      </span>
                      <h2 className="text-sm font-semibold text-ink">
                        {card.title}
                      </h2>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center rounded-[5px] border px-2 py-0.5 text-xs font-medium tabular-nums ${
                        card.highlightCount
                          ? 'border-accent/40 bg-accent-tint text-accent'
                          : 'border-rule bg-surface-subtle text-ink-muted'
                      }`}
                    >
                      {card.countLabel}
                    </span>
                  </header>

                  <p className="text-xs leading-[1.6] text-ink-muted">
                    {card.description}
                  </p>

                  <footer className="flex items-center justify-between border-t border-rule/80 pt-3 text-xs font-medium text-accent group-hover:text-accent-hover">
                    <span>{card.actionLabel}</span>
                    <ChevronRightIcon className="size-3.5" />
                  </footer>
                </article>
              </Link>
            ))}
          </div>

          <InternDailyActivityUpdatesPanel
            dailyActivityUpdates={dailyActivityUpdates}
            onAttachmentError={setAttachmentError}
            headingId="dashboard-daily-updates-heading"
          />
        </>
      )}

      <AssignTaskDialog
        open={assignDialogOpen}
        interns={interns}
        internById={internById}
        supervisorId={supervisorId}
        onClose={closeAssignDialog}
        onAssigned={handleAssigned}
      />
    </div>
  )
}
