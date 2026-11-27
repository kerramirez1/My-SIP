import { AlertMessage } from '../../components/AlertMessage'
import { StatusBadge } from '../../components/StatusBadge'
import { useAuth } from '../../context/useAuth'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import {
  extractIsoDatePart,
  useSupervisorData,
} from '../../lib/useSupervisorData'
import { formatCalendarDate } from '../../lib/weekUtils'

export function SupervisorHistoryPage() {
  useDocumentTitle('Review History')

  const { profile } = useAuth()
  const supervisorId = profile?.id
  const { loading, loadError, recentReviews, reload } =
    useSupervisorData(supervisorId)

  return (
    <div className="max-w-6xl space-y-6">
      <header>
        <h1
          id="main-content"
          tabIndex={-1}
          className="ledger-title text-[clamp(1.375rem,1.2rem+0.6vw,1.75rem)] font-semibold leading-[1.2] tracking-[-0.02em] text-ink outline-none"
        >
          Review History
        </h1>
        <p className="mt-1.5 max-w-[62ch] text-sm leading-[1.55] text-ink-muted">
          Your latest 10 reviewed submissions across assigned interns
        </p>
      </header>

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
            aria-label="Loading review history"
            className="loading-spinner"
          />
          <span>Loading assigned interns and pending submissions…</span>
        </div>
      ) : (
        <section className="overflow-hidden rounded-[6px] border border-rule bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-surface-subtle px-5 py-3.5">
            <div>
              <h2
                id="recent-reviews-heading"
                className="text-sm font-semibold text-ink"
              >
                Recent Reviews
              </h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                Your latest 10 reviewed submissions across assigned interns
              </p>
            </div>
            <span className="text-xs tabular-nums text-ink-muted">
              {recentReviews.length}{' '}
              {recentReviews.length === 1 ? 'review' : 'reviews'}
            </span>
          </div>

          {recentReviews.length === 0 ? (
            <div className="px-5 py-10 text-sm text-ink-muted">
              No reviews completed yet.
            </div>
          ) : (
            <div
              tabIndex={0}
              role="region"
              aria-labelledby="recent-reviews-heading"
              className="table-wrapper"
            >
              <table className="submission-table">
                <caption className="visually-hidden">
                  Recent submission review decisions made by this supervisor
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="w-40">
                      Intern
                    </th>
                    <th scope="col" className="w-36">
                      Type
                    </th>
                    <th scope="col">Submission</th>
                    <th scope="col" className="w-32">
                      Decision
                    </th>
                    <th scope="col">Remarks</th>
                    <th scope="col" className="w-36">
                      Reviewed
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {recentReviews.map((item) => {
                    const reviewedDateIso = extractIsoDatePart(item.reviewedAt)
                    return (
                      <tr key={item.key}>
                        <td
                          data-label="Intern"
                          className="whitespace-nowrap text-sm font-medium text-ink"
                        >
                          {item.internName}
                        </td>
                        <td
                          data-label="Type"
                          className="whitespace-nowrap text-xs font-medium text-ink-muted"
                        >
                          {item.typeLabel}
                        </td>
                        <td
                          data-label="Submission"
                          className="text-sm text-ink"
                        >
                          {item.summaryLabel}
                        </td>
                        <td data-label="Decision">
                          <StatusBadge status={item.status} />
                        </td>
                        <td
                          data-label="Remarks"
                          className="max-w-[36ch] whitespace-pre-line text-xs text-ink-muted break-words"
                        >
                          {item.remarks?.trim() ? item.remarks : '—'}
                        </td>
                        <td
                          data-label="Reviewed"
                          className="whitespace-nowrap text-sm tabular-nums text-ink-muted"
                        >
                          {reviewedDateIso ? (
                            <time dateTime={reviewedDateIso}>
                              {formatCalendarDate(reviewedDateIso)}
                            </time>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
