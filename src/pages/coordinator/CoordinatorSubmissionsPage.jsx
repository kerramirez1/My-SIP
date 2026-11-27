import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertMessage } from '../../components/AlertMessage'
import { PaperclipIcon } from '../../components/Icons'
import { formatDecimalHours, formatDurationMinutes } from '../../lib/attendanceUtils'
import { triggerFileDownload } from '../../lib/coordinatorExportUtils'
import { getCoordinatorPrefs } from '../../lib/coordinatorPrefs'
import { supabase } from '../../lib/supabaseClient'
import {
  buildSubmissionsReportCsv,
  useCoordinatorData,
} from '../../lib/useCoordinatorData'
import { useDocumentTitle } from '../../lib/useDocumentTitle'
import { formatCalendarDate, getTodayIsoDate } from '../../lib/weekUtils'
import {
  CoordinatorStatusPill,
  DeleteRecordDialog,
  PriorityBadge,
  SubmissionDetailDialog,
} from './CoordinatorMonitoringDialogs'

const COLLATOR = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

const TABS = [
  { id: 'attendance', label: 'Weekly Attendance' },
  { id: 'accomplishments', label: 'Weekly Accomplishments' },
  { id: 'tasks', label: 'Task Submissions' },
]

const VALID_TAB_IDS = new Set(TABS.map((t) => t.id))

function SortChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="sort-chevron"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
    >
      <path d="M4.5 6.25 8 9.75l3.5-3.5" strokeLinecap="square" />
    </svg>
  )
}

function SortableHeader({
  columnKey,
  label,
  sortKey,
  sortDir,
  onSort,
  className = '',
}) {
  const isSorted = sortKey === columnKey
  return (
    <th
      scope="col"
      aria-sort={isSorted ? sortDir : undefined}
      className={className}
    >
      <button
        type="button"
        className="sort-header"
        onClick={() => onSort(columnKey, label)}
      >
        <span>{label}</span>
        <SortChevronIcon />
      </button>
    </th>
  )
}

export function CoordinatorSubmissionsPage() {
  useDocumentTitle('Submissions & Reviews')

  const [searchParams, setSearchParams] = useSearchParams()
  const initialPrefs = useMemo(() => getCoordinatorPrefs(), [])
  const todayIso = getTodayIsoDate()

  const paramTab = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState(() =>
    VALID_TAB_IDS.has(paramTab)
      ? paramTab
      : initialPrefs.defaultSubmissionsTab,
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [internFilter, setInternFilter] = useState(
    () => searchParams.get('intern') || 'all',
  )
  const [supervisorFilter, setSupervisorFilter] = useState(
    () => searchParams.get('supervisor') || 'all',
  )
  const [statusFilter, setStatusFilter] = useState(
    () => searchParams.get('status') || 'all',
  )
  const [sortKey, setSortKey] = useState('date')
  const [sortDir, setSortDir] = useState('descending')
  const [sortAnnouncement, setSortAnnouncement] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPrefs.defaultPageSize)

  const [selectedSubmission, setSelectedSubmission] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [actionBanner, setActionBanner] = useState('')

  const tabRefs = useRef({})

  const {
    loading,
    loadError,
    filterOptions,
    internProgressRows,
    allSubmissions,
    reload,
  } = useCoordinatorData()

  const tabCounts = useMemo(() => {
    const counts = { attendance: 0, accomplishments: 0, tasks: 0 }
    for (const item of allSubmissions) {
      if (item.kind in counts) counts[item.kind] += 1
    }
    return counts
  }, [allSubmissions])

  function selectTab(nextTabId) {
    setActiveTab(nextTabId)
    setPage(1)
    if (
      nextTabId !== 'tasks' &&
      statusFilter === 'assigned_not_submitted'
    ) {
      setStatusFilter('all')
    }
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('tab', nextTabId)
    setSearchParams(nextParams, { replace: true })
  }

  function handleTabKeyDown(event, index) {
    let nextIndex = null
    if (event.key === 'ArrowRight') {
      nextIndex = (index + 1) % TABS.length
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (index - 1 + TABS.length) % TABS.length
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = TABS.length - 1
    }
    if (nextIndex === null) return
    event.preventDefault()
    const nextTab = TABS[nextIndex]
    selectTab(nextTab.id)
    tabRefs.current[nextTab.id]?.focus()
  }

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    Boolean(dateFrom) ||
    Boolean(dateTo) ||
    internFilter !== 'all' ||
    supervisorFilter !== 'all' ||
    statusFilter !== 'all'

  function resetFilters() {
    setSearchQuery('')
    setDateFrom('')
    setDateTo('')
    setInternFilter('all')
    setSupervisorFilter('all')
    setStatusFilter('all')
    setPage(1)
    const nextParams = new URLSearchParams()
    nextParams.set('tab', activeTab)
    setSearchParams(nextParams, { replace: true })
  }

  function handleSort(nextKey, label) {
    const nextDir =
      sortKey === nextKey && sortDir === 'ascending'
        ? 'descending'
        : 'ascending'
    setSortKey(nextKey)
    setSortDir(nextDir)
    setPage(1)
    setSortAnnouncement(`Sorted by ${label}, ${nextDir}.`)
  }

  const tabSubmissions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()

    const filtered = allSubmissions.filter((item) => {
      if (item.kind !== activeTab) return false
      if (internFilter !== 'all' && item.internId !== internFilter) return false
      if (supervisorFilter === 'unassigned') {
        if (item.supervisorId) return false
      } else if (
        supervisorFilter !== 'all' &&
        item.supervisorId !== supervisorFilter
      ) {
        return false
      }
      if (statusFilter !== 'all' && item.displayStatusKey !== statusFilter) {
        return false
      }
      if (dateFrom || dateTo) {
        const refIso = item.submittedOrDateIso || ''
        if (!refIso) return false
        if (dateFrom && refIso < dateFrom) return false
        if (dateTo && refIso > dateTo) return false
      }
      if (q) {
        const haystack = [
          item.internName,
          item.studentIdNo,
          item.titleSummary,
          item.subtitleSummary,
          item.reportingPeriod,
          item.supervisorName,
          item.displayStatusLabel,
          item.row.reviewer_remarks,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })

    const dir = sortDir === 'ascending' ? 1 : -1
    return [...filtered].sort((a, b) => {
      if (sortKey === 'intern') {
        return COLLATOR.compare(a.internName, b.internName) * dir
      }
      if (sortKey === 'title') {
        return COLLATOR.compare(a.shortTitle, b.shortTitle) * dir
      }
      if (sortKey === 'supervisor') {
        return COLLATOR.compare(a.supervisorName, b.supervisorName) * dir
      }
      if (sortKey === 'status') {
        return COLLATOR.compare(a.displayStatusLabel, b.displayStatusLabel) * dir
      }
      if (sortKey === 'hours') {
        return ((a.renderedMinutes ?? -1) - (b.renderedMinutes ?? -1)) * dir
      }
      return String(a.sortAt).localeCompare(String(b.sortAt)) * dir
    })
  }, [
    activeTab,
    allSubmissions,
    dateFrom,
    dateTo,
    internFilter,
    searchQuery,
    sortDir,
    sortKey,
    statusFilter,
    supervisorFilter,
  ])

  const tabStatusBreakdown = useMemo(() => {
    const items = allSubmissions.filter((item) => item.kind === activeTab)
    let pending = 0
    let notSubmitted = 0
    let approved = 0
    let returned = 0
    for (const item of items) {
      if (item.displayStatusKey === 'pending') pending += 1
      else if (item.displayStatusKey === 'assigned_not_submitted')
        notSubmitted += 1
      else if (item.displayStatusKey === 'approved') approved += 1
      else if (item.displayStatusKey === 'returned') returned += 1
    }
    return {
      total: items.length,
      pending,
      notSubmitted,
      approved,
      returned,
    }
  }, [activeTab, allSubmissions])

  const totalPages = Math.max(1, Math.ceil(tabSubmissions.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return tabSubmissions.slice(start, start + pageSize)
  }, [pageSize, safePage, tabSubmissions])

  function handleExportCsv() {
    const csv = buildSubmissionsReportCsv(tabSubmissions)
    triggerFileDownload(
      csv,
      'text/csv;charset=utf-8',
      `sip-${activeTab}-submissions-${todayIso}.csv`,
    )
  }

  async function handleConfirmDelete(adminReason) {
    if (!supabase || !deleteTarget || deleteTarget.status === 'approved') return

    setDeleting(true)
    setDeleteError('')

    const { error } = await supabase
      .from(deleteTarget.tableName)
      .delete()
      .eq('id', deleteTarget.id)

    setDeleting(false)

    if (error) {
      setDeleteError(`Could not remove record: ${error.message}`)
      return
    }

    const removedLabel = `${deleteTarget.typeLabel} record for ${deleteTarget.internName}`
    setDeleteTarget(null)
    setSelectedSubmission(null)
    setActionBanner(
      `Removed ${removedLabel}. Administrative reason: ${adminReason}`,
    )
    reload()
  }

  return (
    <div className="max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1
            id="main-content"
            tabIndex={-1}
            className="ledger-title text-[clamp(1.375rem,1.2rem+0.6vw,1.75rem)] font-semibold leading-[1.2] tracking-[-0.02em] text-ink outline-none"
          >
            Submissions &amp; Reviews
          </h1>
          <p className="mt-1.5 max-w-[66ch] text-sm leading-[1.55] text-ink-muted">
            Inspect weekly attendance logs, weekly accomplishments, and task
            submissions with attachments, supervisor remarks, and full review
            history.
          </p>
        </div>

        <button
          type="button"
          disabled={loading || tabSubmissions.length === 0}
          onClick={handleExportCsv}
          className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-[5px] border border-rule bg-surface px-4 text-xs font-medium text-ink hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-55"
        >
          Export current tab CSV
        </button>
      </header>

      {actionBanner ? (
        <AlertMessage message={actionBanner} variant="success" />
      ) : null}

      {loadError ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            <AlertMessage
              message={`Could not load submission records: ${loadError}`}
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
            aria-label="Loading submissions"
            className="loading-spinner"
          />
          <span>Loading submissions…</span>
        </div>
      ) : (
        <section className="overflow-hidden rounded-[6px] border border-rule bg-surface">
          {/* Accessible Tablist */}
          <div
            role="tablist"
            aria-label="Submission categories"
            className="sip-tablist bg-surface-subtle"
          >
            {TABS.map((tab, index) => {
              const selected = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  ref={(el) => {
                    tabRefs.current[tab.id] = el
                  }}
                  type="button"
                  role="tab"
                  id={`tab-${tab.id}`}
                  aria-selected={selected}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => selectTab(tab.id)}
                  onKeyDown={(e) => handleTabKeyDown(e, index)}
                >
                  <span>{tab.label}</span>
                  <span className="rounded-[4px] border border-rule bg-surface px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-ink-muted">
                    {tabCounts[tab.id] ?? 0}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Active Tab Panel */}
          <div
            role="tabpanel"
            aria-labelledby={`tab-${activeTab}`}
            tabIndex={0}
            className="outline-none"
          >
            {/* Tab Summary Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-surface px-5 py-3 text-xs text-ink-muted">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 tabular-nums">
                <span>
                  <strong className="font-semibold text-ink">
                    {tabStatusBreakdown.pending}
                  </strong>{' '}
                  pending supervisor review
                </span>
                {activeTab === 'tasks' ? (
                  <span>
                    <strong className="font-semibold text-ink">
                      {tabStatusBreakdown.notSubmitted}
                    </strong>{' '}
                    assigned – not submitted
                  </span>
                ) : null}
                <span>
                  <strong className="font-semibold text-ink">
                    {tabStatusBreakdown.approved}
                  </strong>{' '}
                  approved
                </span>
                <span>
                  <strong className="font-semibold text-ink">
                    {tabStatusBreakdown.returned}
                  </strong>{' '}
                  returned
                </span>
              </div>
              <span className="tabular-nums">
                Showing {tabSubmissions.length} of {tabStatusBreakdown.total}
              </span>
            </div>

            {/* Filters */}
            <search
              aria-label={`Filter ${TABS.find((t) => t.id === activeTab)?.label ?? 'submissions'}`}
              className="space-y-3 border-b border-rule bg-surface-subtle/50 px-5 py-4"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <label
                    htmlFor="sub-search"
                    className="text-xs font-medium text-ink-muted"
                  >
                    Search
                  </label>
                  <input
                    id="sub-search"
                    type="search"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value)
                      setPage(1)
                    }}
                    placeholder="Intern, student ID, title, supervisor, or remarks…"
                    className="min-h-10 w-full rounded-[5px] border border-input-border bg-surface px-3 text-sm text-ink placeholder:text-ink-muted/70 hover:border-ink"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="sub-intern"
                    className="text-xs font-medium text-ink-muted"
                  >
                    Intern
                  </label>
                  <select
                    id="sub-intern"
                    value={internFilter}
                    onChange={(e) => {
                      setInternFilter(e.target.value)
                      setPage(1)
                    }}
                    className="min-h-10 w-full rounded-[5px] border border-input-border bg-surface px-3 text-sm text-ink hover:border-ink"
                  >
                    <option value="all">All interns</option>
                    {internProgressRows.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.full_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="sub-supervisor"
                    className="text-xs font-medium text-ink-muted"
                  >
                    Supervisor
                  </label>
                  <select
                    id="sub-supervisor"
                    value={supervisorFilter}
                    onChange={(e) => {
                      setSupervisorFilter(e.target.value)
                      setPage(1)
                    }}
                    className="min-h-10 w-full rounded-[5px] border border-input-border bg-surface px-3 text-sm text-ink hover:border-ink"
                  >
                    <option value="all">All supervisors</option>
                    {filterOptions.supervisors.map((sup) => (
                      <option key={sup.id} value={sup.id}>
                        {sup.full_name}
                      </option>
                    ))}
                    {filterOptions.hasUnassignedIntern ? (
                      <option value="unassigned">Unassigned interns</option>
                    ) : null}
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="sub-status"
                    className="text-xs font-medium text-ink-muted"
                  >
                    Status
                  </label>
                  <select
                    id="sub-status"
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value)
                      setPage(1)
                    }}
                    className="min-h-10 w-full rounded-[5px] border border-input-border bg-surface px-3 text-sm text-ink hover:border-ink"
                  >
                    <option value="all">All statuses</option>
                    <option value="pending">Pending Supervisor Review</option>
                    {activeTab === 'tasks' ? (
                      <option value="assigned_not_submitted">
                        Assigned – Not Submitted
                      </option>
                    ) : null}
                    <option value="approved">Approved by Supervisor</option>
                    <option value="returned">Returned for Revision</option>
                    <option value="rejected">Rejected</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="sub-date-from"
                    className="text-xs font-medium text-ink-muted"
                  >
                    Date from
                  </label>
                  <input
                    id="sub-date-from"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => {
                      setDateFrom(e.target.value)
                      setPage(1)
                    }}
                    className="min-h-10 w-full rounded-[5px] border border-input-border bg-surface px-2.5 text-sm text-ink hover:border-ink"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="sub-date-to"
                      className="text-xs font-medium text-ink-muted"
                    >
                      Date to
                    </label>
                    <input
                      id="sub-date-to"
                      type="date"
                      value={dateTo}
                      onChange={(e) => {
                        setDateTo(e.target.value)
                        setPage(1)
                      }}
                      className="min-h-10 w-44 rounded-[5px] border border-input-border bg-surface px-2.5 text-sm text-ink hover:border-ink"
                    />
                  </div>
                </div>

                {hasActiveFilters ? (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="inline-flex min-h-9 items-center rounded-[5px] border border-rule bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-subtle"
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>
            </search>

            <span role="status" className="visually-hidden">
              {sortAnnouncement}
            </span>

            {/* Tab Table */}
            {paginatedRows.length === 0 ? (
              <div className="px-5 py-12 text-sm text-ink-muted">
                {tabStatusBreakdown.total === 0
                  ? `No ${TABS.find((t) => t.id === activeTab)?.label.toLowerCase()} records exist yet.`
                  : 'No records match the current filters.'}
              </div>
            ) : (
              <div
                tabIndex={0}
                role="region"
                aria-label={`${TABS.find((t) => t.id === activeTab)?.label} table`}
                className="table-wrapper"
              >
                <table className="submission-table is-compact">
                  <caption className="visually-hidden">
                    {TABS.find((t) => t.id === activeTab)?.label} records across
                    all interns
                  </caption>
                  <thead>
                    <tr>
                      <SortableHeader
                        columnKey="intern"
                        label="Intern"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={handleSort}
                      />
                      <SortableHeader
                        columnKey="title"
                        label={
                          activeTab === 'attendance'
                            ? 'Attendance Date & Shift'
                            : activeTab === 'accomplishments'
                              ? 'Accomplishment Report'
                              : 'Task Title & Priority'
                        }
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={handleSort}
                      />
                      <th scope="col" className="w-36">
                        {activeTab === 'tasks'
                          ? 'Deadline'
                          : 'Reporting Period'}
                      </th>
                      {activeTab === 'attendance' ? (
                        <SortableHeader
                          columnKey="hours"
                          label="Rendered"
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={handleSort}
                          className="w-32"
                        />
                      ) : (
                        <SortableHeader
                          columnKey="date"
                          label="Submitted"
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={handleSort}
                          className="w-32"
                        />
                      )}
                      <SortableHeader
                        columnKey="supervisor"
                        label="Supervisor"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={handleSort}
                      />
                      <SortableHeader
                        columnKey="status"
                        label="Status"
                        sortKey={sortKey}
                        sortDir={sortDir}
                        onSort={handleSort}
                        className="w-44"
                      />
                      <th scope="col" className="col-action w-24">
                        Details
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRows.map((item) => {
                      const hasAttachment = Boolean(
                        item.row.attachment_url ||
                          item.row.submission_attachment_url,
                      )

                      return (
                        <tr key={item.key}>
                          <th scope="row">
                            <div className="min-w-0">
                              <p className="font-medium text-ink">
                                {item.internName}
                              </p>
                              <p className="mt-0.5 text-xs font-normal tabular-nums text-ink-muted">
                                {item.studentIdNo || 'No student ID'}
                              </p>
                            </div>
                          </th>

                          <td
                            data-label={
                              activeTab === 'attendance'
                                ? 'Shift'
                                : activeTab === 'accomplishments'
                                  ? 'Report'
                                  : 'Task'
                            }
                          >
                            <div className="min-w-0 space-y-1">
                              <p className="text-xs font-medium text-ink">
                                {item.titleSummary}
                              </p>
                              <div className="flex flex-wrap items-center gap-2">
                                {item.kind === 'tasks' ? (
                                  <PriorityBadge priority={item.row.priority} />
                                ) : null}
                                {hasAttachment ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] text-ink-muted">
                                    <PaperclipIcon className="size-3" />
                                    <span>Attachment</span>
                                  </span>
                                ) : null}
                                {item.row.reviewer_remarks?.trim() ? (
                                  <span className="text-[11px] text-ink-muted">
                                    Has remarks
                                  </span>
                                ) : null}
                              </div>
                            </div>
                          </td>

                          <td
                            data-label={
                              activeTab === 'tasks' ? 'Deadline' : 'Period'
                            }
                            className="whitespace-nowrap text-xs tabular-nums text-ink-muted"
                          >
                            {item.reportingPeriod}
                          </td>

                          {activeTab === 'attendance' ? (
                            <td
                              data-label="Rendered"
                              className="whitespace-nowrap text-xs tabular-nums text-ink"
                            >
                              {item.renderedMinutes !== null ? (
                                <span>
                                  <strong className="font-medium">
                                    {formatDecimalHours(item.renderedMinutes)}
                                  </strong>
                                  <span className="block text-[11px] text-ink-muted">
                                    {formatDurationMinutes(item.renderedMinutes)}
                                  </span>
                                </span>
                              ) : (
                                <span className="font-medium text-error">
                                  Incomplete
                                </span>
                              )}
                            </td>
                          ) : (
                            <td
                              data-label="Submitted"
                              className="whitespace-nowrap text-xs tabular-nums text-ink-muted"
                            >
                              {item.submissionDateIso
                                ? formatCalendarDate(item.submissionDateIso)
                                : 'Not submitted'}
                            </td>
                          )}

                          <td
                            data-label="Supervisor"
                            className="text-xs text-ink-muted"
                          >
                            {item.supervisorName}
                          </td>

                          <td data-label="Status">
                            <CoordinatorStatusPill
                              statusKey={item.displayStatusKey}
                            />
                          </td>

                          <td data-label="Details" className="col-action">
                            <button
                              type="button"
                              onClick={() => setSelectedSubmission(item)}
                              className="inline-flex min-h-8 items-center justify-center rounded-[5px] border border-rule bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-subtle"
                            >
                              Inspect
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination Footer */}
            {tabSubmissions.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule bg-surface-subtle px-5 py-3 text-xs text-ink-muted">
                <div className="flex items-center gap-2">
                  <label htmlFor="sub-page-size" className="font-medium">
                    Rows per page
                  </label>
                  <select
                    id="sub-page-size"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value))
                      setPage(1)
                    }}
                    className="min-h-8 rounded-[4px] border border-input-border bg-surface px-2 text-xs text-ink"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 tabular-nums">
                  <span>
                    Page {safePage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="inline-flex min-h-8 items-center rounded-[4px] border border-rule bg-surface px-2.5 font-medium text-ink hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="inline-flex min-h-8 items-center rounded-[4px] border border-rule bg-surface px-2.5 font-medium text-ink hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      )}

      <SubmissionDetailDialog
        item={selectedSubmission}
        todayIso={todayIso}
        onClose={() => setSelectedSubmission(null)}
        onRequestDelete={(item) => {
          setDeleteError('')
          setDeleteTarget(item)
        }}
      />

      <DeleteRecordDialog
        target={deleteTarget}
        deleting={deleting}
        errorMessage={deleteError}
        onClose={() => {
          setDeleteTarget(null)
          setDeleteError('')
        }}
        onConfirm={(reason) => void handleConfirmDelete(reason)}
      />
    </div>
  )
}
