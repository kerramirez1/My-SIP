import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PaperclipIcon } from '../../components/Icons'
import { StatusBadge } from '../../components/StatusBadge'
import { formatDocumentDateTime } from '../../lib/accomplishmentDocument'
import {
  getAttachmentDisplayName,
  splitFilenameForDisplay,
} from '../../lib/submissionHelpers'
import { supabase } from '../../lib/supabaseClient'

function BellIcon({ className = 'size-4 shrink-0' }) {
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
        d="M10 3.5a4.5 4.5 0 0 0-4.5 4.5v2.75L4 13.25h12l-1.5-2.5V8A4.5 4.5 0 0 0 10 3.5Z"
        strokeLinejoin="miter"
        strokeLinecap="square"
      />
      <path d="M8.25 15.25a1.75 1.75 0 0 0 3.5 0" strokeLinecap="square" />
    </svg>
  )
}

function EyeIcon({ className = 'size-3.5 shrink-0' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path
        d="M2.5 10s2.75-4.5 7.5-4.5 7.5 4.5 7.5 4.5-2.75 4.5-7.5 4.5S2.5 10 2.5 10Z"
        strokeLinecap="square"
      />
      <circle cx="10" cy="10" r="2" />
    </svg>
  )
}

function readDismissedKeys(storageKey) {
  if (!storageKey || typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(storageKey)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeDismissedKeys(storageKey, keys) {
  if (!storageKey || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(keys.slice(-40)))
  } catch {
    // Ignored — localStorage may be unavailable in restricted contexts.
  }
}

function FileNameBadge({ objectPath }) {
  const displayName = getAttachmentDisplayName(objectPath)
  const { stem, extension } = splitFilenameForDisplay(displayName)
  return (
    <span className="filename-truncate text-xs font-medium text-accent" title={displayName}>
      <span>{stem}</span>
      {extension}
    </span>
  )
}

/**
 * In-app notification banner displayed to supervisors ONLY when an assigned
 * intern has officially submitted a Weekly Accomplishment Report for formal
 * review. Never triggers for unsubmitted daily saves.
 */
export function SupervisorWeeklyReportNotifications({
  supervisorId,
  submittedWeeklyReports = [],
  onReviewReport,
}) {
  const storageKey = supervisorId
    ? `sip_sup_ack_weekly_reports:${supervisorId}`
    : ''
  const [dismissedTokens, setDismissedTokens] = useState(() =>
    readDismissedKeys(storageKey),
  )

  const visibleReports = useMemo(() => {
    const dismissedSet = new Set(dismissedTokens)
    return submittedWeeklyReports.filter(
      (report) => !dismissedSet.has(`${report.key}:${report.latestSubmittedAt}`),
    )
  }, [dismissedTokens, submittedWeeklyReports])

  if (visibleReports.length === 0) return null

  function dismissReport(report) {
    const token = `${report.key}:${report.latestSubmittedAt}`
    const next = [...new Set([...dismissedTokens, token])]
    setDismissedTokens(next)
    writeDismissedKeys(storageKey, next)
  }

  return (
    <section
      aria-label="Submitted weekly accomplishment report notifications"
      className="overflow-hidden rounded-[6px] border border-accent/35 bg-accent-tint/55"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-accent/20 px-4 py-2.5">
        <div className="flex items-center gap-2 text-accent">
          <BellIcon className="size-4" />
          <h2 className="text-xs font-semibold tracking-[0.01em]">
            Weekly Accomplishment{' '}
            {visibleReports.length === 1
              ? 'Report Submitted for Review'
              : `Reports Submitted for Review (${visibleReports.length})`}
          </h2>
        </div>
        <span className="text-[11px] font-medium text-ink-muted">
          Official submissions ready for approval
        </span>
      </div>

      <ul className="divide-y divide-accent/15">
        {visibleReports.map((report) => (
          <li
            key={report.key}
            className="flex flex-col gap-2.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 text-xs">
              <p className="font-medium text-ink">
                {report.internName}
                {report.studentIdNo ? (
                  <span className="ms-1.5 font-normal tabular-nums text-ink-muted">
                    ({report.studentIdNo})
                  </span>
                ) : null}{' '}
                <span className="font-normal text-ink-muted">
                  submitted their weekly report for{' '}
                </span>
                <span className="font-semibold tabular-nums text-ink">
                  {report.weekRangeLabel}
                </span>
              </p>
              <p className="mt-0.5 tabular-nums text-ink-muted">
                {report.pendingEntriesCount}{' '}
                {report.pendingEntriesCount === 1
                  ? 'daily entry awaiting review'
                  : 'daily entries awaiting review'}
                {report.latestSubmittedAt
                  ? ` · Submitted ${formatDocumentDateTime(report.latestSubmittedAt)}`
                  : ''}
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {typeof onReviewReport === 'function' ? (
                <button
                  type="button"
                  onClick={() => onReviewReport(report)}
                  className="inline-flex min-h-8 items-center justify-center rounded-[5px] bg-accent-solid px-3 text-xs font-medium text-on-accent hover:bg-accent-solid-hover"
                >
                  Review Report
                </button>
              ) : (
                <Link
                  to="/supervisor/reviews"
                  className="inline-flex min-h-8 items-center justify-center rounded-[5px] bg-accent-solid px-3 text-xs font-medium text-on-accent hover:bg-accent-solid-hover"
                >
                  Review in Queue
                </Link>
              )}
              <button
                type="button"
                onClick={() => dismissReport(report)}
                className="inline-flex min-h-8 items-center justify-center rounded-[5px] border border-rule bg-surface px-2.5 text-xs font-medium text-ink-muted hover:bg-surface-subtle hover:text-ink"
              >
                Dismiss
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * View-only panel showing saved (unsubmitted) daily accomplishment entries from
 * assigned interns. Clearly separated from formal approvals with zero Approve /
 * Return / Reject controls.
 */
export function InternDailyActivityUpdatesPanel({
  dailyActivityUpdates = [],
  onAttachmentError,
  headingId = 'supervisor-daily-updates-heading',
}) {
  const [selectedInternId, setSelectedInternId] = useState('all')
  const [openingId, setOpeningId] = useState(null)
  const [signedUrlsById, setSignedUrlsById] = useState({})

  const internOptions = useMemo(() => {
    const map = new Map()
    for (const item of dailyActivityUpdates) {
      if (!map.has(item.internId)) {
        map.set(item.internId, item.internName)
      }
    }
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [dailyActivityUpdates])

  const filteredUpdates = useMemo(() => {
    if (selectedInternId === 'all') return dailyActivityUpdates
    return dailyActivityUpdates.filter(
      (item) => item.internId === selectedInternId,
    )
  }, [dailyActivityUpdates, selectedInternId])

  async function handleOpenAttachment(updateItem) {
    if (!supabase || !updateItem.attachmentUrl) return

    setOpeningId(updateItem.id)
    onAttachmentError?.('')

    const { data, error } = await supabase.storage
      .from('attachments')
      .createSignedUrl(updateItem.attachmentUrl, 300)

    setOpeningId(null)

    if (error || !data?.signedUrl) {
      onAttachmentError?.(
        error?.message || 'Could not generate a signed download link.',
      )
      return
    }

    setSignedUrlsById((prev) => ({
      ...prev,
      [updateItem.id]: data.signedUrl,
    }))

    const openedWindow = window.open(
      data.signedUrl,
      '_blank',
      'noopener,noreferrer',
    )
    if (!openedWindow) {
      onAttachmentError?.(
        'Pop-up blocked by your browser. Use the direct signed link shown next to the attachment.',
      )
    }
  }

  return (
    <section
      aria-labelledby={headingId}
      className="overflow-hidden rounded-[6px] border border-rule bg-surface"
    >
      <div className="flex flex-col gap-3 border-b border-rule bg-surface-subtle px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={headingId} className="text-sm font-semibold text-ink">
              Intern Daily Activity Updates
            </h2>
            <span className="inline-flex items-center gap-1 rounded-[5px] border border-dashed border-input-border bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-muted">
              <EyeIcon className="size-3" />
              <span>View Only · Not Yet Submitted</span>
            </span>
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            Saved daily entries from your assigned interns before weekly report
            submission. Formal approval actions become available in Pending
            Reviews once the weekly report is submitted.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {internOptions.length > 1 ? (
            <label className="inline-flex items-center gap-2 text-xs text-ink-muted">
              <span className="whitespace-nowrap font-medium">Intern</span>
              <select
                value={selectedInternId}
                onChange={(event) => setSelectedInternId(event.target.value)}
                className="min-h-8 rounded-[5px] border border-rule bg-surface px-2.5 text-xs text-ink"
              >
                <option value="all">
                  All assigned interns ({dailyActivityUpdates.length})
                </option>
                {internOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <span className="text-xs font-medium tabular-nums text-ink-muted">
              {dailyActivityUpdates.length}{' '}
              {dailyActivityUpdates.length === 1 ? 'saved entry' : 'saved entries'}
            </span>
          )}
        </div>
      </div>

      {filteredUpdates.length === 0 ? (
        <div className="px-5 py-8 text-sm text-ink-muted">
          No unsubmitted daily activity updates from your assigned interns right
          now. Saved daily entries appear here automatically as interns log
          their workday progress.
        </div>
      ) : (
        <div
          tabIndex={0}
          role="region"
          aria-labelledby={headingId}
          className="table-wrapper"
        >
          <table className="submission-table is-compact">
            <caption className="visually-hidden">
              Saved unsubmitted daily accomplishment entries from assigned
              interns (view only)
            </caption>
            <thead>
              <tr>
                <th scope="col" className="w-[10.5rem]">
                  Intern
                </th>
                <th scope="col" className="w-[10.5rem]">
                  Activity Date
                </th>
                <th scope="col">Activity / Task Performed</th>
                <th scope="col">Output / Result</th>
                <th scope="col" className="w-[9.5rem]">
                  Attachment
                </th>
                <th scope="col" className="w-[12.5rem]">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredUpdates.map((item) => {
                const signedUrl = signedUrlsById[item.id]
                return (
                  <tr key={item.key}>
                    <th scope="row">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-ink">
                          {item.internName}
                        </p>
                        {item.studentIdNo ? (
                          <p className="mt-0.5 text-xs font-normal tabular-nums text-ink-muted">
                            {item.studentIdNo}
                          </p>
                        ) : null}
                      </div>
                    </th>

                    <td data-label="Activity Date">
                      <div className="min-w-0">
                        <p className="whitespace-nowrap text-xs font-medium tabular-nums text-ink">
                          {item.entryDateLabel}
                        </p>
                        <p className="mt-0.5 whitespace-nowrap text-[11px] tabular-nums text-ink-muted">
                          {item.weekRangeLabel}
                        </p>
                      </div>
                    </td>

                    <td data-label="Activity / Task Performed">
                      <p className="line-clamp-3 text-xs leading-[1.55] text-ink break-words">
                        {item.activityText || '—'}
                      </p>
                    </td>

                    <td data-label="Output / Result">
                      {item.outputText ? (
                        <p className="line-clamp-3 text-xs leading-[1.55] text-ink-muted break-words">
                          {item.outputText}
                        </p>
                      ) : (
                        <span className="text-xs italic text-ink-muted">
                          Not provided
                        </span>
                      )}
                    </td>

                    <td data-label="Attachment">
                      {item.attachmentUrl ? (
                        <div className="flex min-w-0 flex-col items-start gap-1">
                          <button
                            type="button"
                            disabled={openingId === item.id}
                            onClick={() => void handleOpenAttachment(item)}
                            className="inline-flex max-w-full min-h-8 items-center gap-1.5 rounded-[5px] border border-rule bg-surface-subtle px-2.5 text-xs font-medium text-accent hover:border-accent/45 hover:bg-accent-tint/50 disabled:opacity-60"
                          >
                            <PaperclipIcon className="size-3.5 shrink-0" />
                            {openingId === item.id ? (
                              <span>Opening…</span>
                            ) : (
                              <FileNameBadge objectPath={item.attachmentUrl} />
                            )}
                          </button>
                          {signedUrl ? (
                            <a
                              href={signedUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[11px] font-medium text-ink-muted underline underline-offset-2 hover:text-accent"
                            >
                              Direct link
                            </a>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-ink-muted">None</span>
                      )}
                    </td>

                    <td data-label="Status" className="whitespace-nowrap">
                      <StatusBadge status="saved_draft" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
