import { AlertMessage } from '../../components/AlertMessage'
import { useAuth } from '../../context/useAuth'
import {
  formatDecimalHours,
  formatDurationMinutes,
} from '../../lib/attendanceUtils'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { useSupervisorData } from '../../lib/useSupervisorData'

export function SupervisorInternsPage() {
  useDocumentTitle('My Interns')

  const { profile } = useAuth()
  const supervisorId = profile?.id
  const { loading, loadError, internProgressRows, reload } =
    useSupervisorData(supervisorId)

  return (
    <div className="max-w-6xl space-y-6">
      <header>
        <h1
          id="main-content"
          tabIndex={-1}
          className="ledger-title text-[clamp(1.375rem,1.2rem+0.6vw,1.75rem)] font-semibold leading-[1.2] tracking-[-0.02em] text-ink outline-none"
        >
          My Interns
        </h1>
        <p className="mt-1.5 max-w-[62ch] text-sm leading-[1.55] text-ink-muted">
          Approved break-adjusted attendance hours and overall progress
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
            aria-label="Loading assigned interns"
            className="loading-spinner"
          />
          <span>Loading assigned interns and pending submissions…</span>
        </div>
      ) : (
        <section className="overflow-hidden rounded-[6px] border border-rule bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-surface-subtle px-5 py-3.5">
            <div>
              <h2
                id="my-interns-heading"
                className="text-sm font-semibold text-ink"
              >
                My Interns
              </h2>
              <p className="mt-0.5 text-xs text-ink-muted">
                Approved break-adjusted attendance hours and overall progress
              </p>
            </div>
            <span className="text-xs tabular-nums text-ink-muted">
              {internProgressRows.length}{' '}
              {internProgressRows.length === 1 ? 'intern' : 'interns'}
            </span>
          </div>

          {internProgressRows.length === 0 ? (
            <div className="px-5 py-10 text-sm text-ink-muted">
              No interns assigned to you yet.
            </div>
          ) : (
            <div
              tabIndex={0}
              role="region"
              aria-labelledby="my-interns-heading"
              className="table-wrapper"
            >
              <table className="submission-table">
                <caption className="visually-hidden">
                  Assigned interns and approved internship hours progress
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Intern</th>
                    <th scope="col" className="w-36">
                      Student ID
                    </th>
                    <th scope="col" className="w-48">
                      Company
                    </th>
                    <th scope="col" className="w-36">
                      Approved hours
                    </th>
                    <th scope="col" className="w-32">
                      Required
                    </th>
                    <th scope="col" className="w-48">
                      Progress
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {internProgressRows.map((intern) => {
                    const academicMeta = [intern.course, intern.school_name]
                      .filter(Boolean)
                      .join(' — ')

                    return (
                      <tr key={intern.id}>
                        <td data-label="Intern">
                          <div className="min-w-0">
                            <p className="font-medium text-ink">
                              {intern.full_name}
                            </p>
                            {academicMeta ? (
                              <p className="mt-0.5 text-xs text-ink-muted">
                                {academicMeta}
                              </p>
                            ) : null}
                          </div>
                        </td>
                        <td
                          data-label="Student ID"
                          className="whitespace-nowrap text-sm tabular-nums text-ink-muted"
                        >
                          {intern.student_id_no || '—'}
                        </td>
                        <td
                          data-label="Company"
                          className="text-sm text-ink-muted"
                        >
                          {intern.company_name || '—'}
                        </td>
                        <td
                          data-label="Approved hours"
                          className="whitespace-nowrap"
                        >
                          <div className="flex flex-col">
                            <span className="text-sm font-medium tabular-nums text-ink">
                              {formatDecimalHours(intern.approvedMinutes)}
                            </span>
                            <span className="mt-0.5 text-xs tabular-nums text-ink-muted">
                              {formatDurationMinutes(intern.approvedMinutes)}
                            </span>
                          </div>
                        </td>
                        <td
                          data-label="Required"
                          className="whitespace-nowrap text-sm tabular-nums text-ink-muted"
                        >
                          {intern.requiredHours} hrs
                        </td>
                        <td data-label="Progress">
                          <div className="min-w-[8.5rem] space-y-1.5">
                            <div className="flex items-baseline justify-between gap-2 text-xs tabular-nums">
                              <span className="font-semibold text-ink">
                                {intern.progressPercent.toFixed(1)}%
                              </span>
                            </div>
                            <progress
                              value={intern.approvedHours}
                              max={intern.requiredHours}
                              aria-label={`Internship progress for ${intern.full_name}`}
                              className={`internship-progress${intern.isComplete ? ' is-complete' : ''}`}
                            />
                          </div>
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
