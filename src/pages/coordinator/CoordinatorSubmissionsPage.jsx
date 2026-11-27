import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertMessage } from '../../components/AlertMessage'
import { PaperclipIcon } from '../../components/Icons'
import {
  formatDecimalHours,
  formatDurationMinutes,
  formatWallClockTime,
} from '../../lib/attendanceUtils'
import { triggerFileDownload } from '../../lib/coordinatorExportUtils'
import { getCoordinatorPrefs } from '../../lib/coordinatorPrefs'
import { getDeadlineBadge } from '../../lib/internDashboardUtils'
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

const DEADLINE_TONE_CLASSES = {
  overdue: 'text-error font-medium',
  today: 'text-accent font-medium',
  upcoming: 'text-ink-muted',
}

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

function SearchIcon({ className = 'size-4 shrink-0' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
    >
      <circle cx="9" cy="9" r="5.25" />
      <path d="m13 13 3.5 3.5" strokeLinecap="square" />
    </svg>
  )
}

function ExportIcon({ className = 'size-4 shrink-0' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
    >
      <path d="M10 3.75v8.5m0 0-3-3m3 3 3-3" strokeLinecap="square" />
      <path d="M4.25 13.75v2.25h11.5v-2.25" strokeLinecap="square" />
    </svg>
  )
}

function FilterSlidersIcon({ className = 'size-3.5 shrink-0' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
    >
      <path d="M3.5 6h13M3.5 10h13M3.5 14h13" strokeLinecap="square" />
      <circle cx="7" cy="6" r="1.5" fill="var(--color-surface)" />
      <circle cx="13" cy="10" r="1.5" fill="var(--color-surface)" />
      <circle cx="8.5" cy="14" r="1.5" fill="var(--color-surface)" />
    </svg>
  )
}

function ChevronDownIcon({ className = 'size-3.5 shrink-0 transition-transform' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
    >
      <path d="M4 6l4 4 4-4" strokeLinecap="square" />
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
      className={`whitespace-nowrap ${className}`}
    >
      <button
        type="button"
        className="sort-header whitespace-nowrap"
        onClick={() => onSort(columnKey, label)}
      >
        <span className="whitespace-nowrap">{label}</span>
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
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(() =>
    Boolean(searchParams.get('supervisor')),
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
    if (
      (nextTabId !== 'attendance' && sortKey === 'hours') ||
      (nextTabId !== 'tasks' && sortKey === 'deadline')
    ) {
      setSortKey('date')
      setSortDir('descending')
    }
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('tab', nextTabId)
    setSearchParams(nextParams, { replace: true })

    const tabEl = tabRefs.current[nextTabId]
    if (tabEl && typeof tabEl.scrollIntoView === 'function') {
      tabEl.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
        container: 'nearest',
      })
    }
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

  const secondaryFilterCount = [
    supervisorFilter !== 'all',
    Boolean(dateFrom) || Boolean(dateTo),
  ].filter(Boolean).length

  const activeFilterCount = [
    Boolean(searchQuery.trim()),
    internFilter !== 'all',
    supervisorFilter !== 'all',
    statusFilter !== 'all',
    Boolean(dateFrom) || Boolean(dateTo),
  ].filter(Boolean).length

  const activeSupervisorLabel =
    supervisorFilter === 'unassigned'
      ? 'Unassigned interns'
      : supervisorFilter !== 'all'
        ? filterOptions.supervisors.find((s) => s.id === supervisorFilter)
            ?.full_name || 'Selected supervisor'
        : ''

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

  function toggleStatusQuickFilter(nextStatusKey) {
    setStatusFilter((prev) => (prev === nextStatusKey ? 'all' : nextStatusKey))
    setPage(1)
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
          item.row.description,
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
      if (sortKey === 'period') {
        const aVal = a.row.week_of || a.row.attendance_date || ''
        const bVal = b.row.week_of || b.row.attendance_date || ''
        return String(aVal).localeCompare(String(bVal)) * dir
      }
      if (sortKey === 'deadline') {
        const aVal = a.row.deadline || a.row.task_date || ''
        const bVal = b.row.deadline || b.row.task_date || ''
        return String(aVal).localeCompare(String(bVal)) * dir
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

  const activeTabLabel =
    TABS.find((t) => t.id === activeTab)?.label ?? 'Submissions'

  const statusChips = [
    {
      key: 'pending',
      label: 'Pending Supervisor Review',
      count: tabStatusBreakdown.pending,
      dotClass: 'bg-accent-solid',
    },
    ...(activeTab === 'tasks'
      ? [
          {
            key: 'assigned_not_submitted',
            label: 'Assigned – Not Submitted',
            count: tabStatusBreakdown.notSubmitted,
            dotClass: 'bg-input-border',
          },
        ]
      : []),
    {
      key: 'approved',
      label: 'Approved',
      count: tabStatusBreakdown.approved,
      dotClass: 'bg-success-border',
    },
    {
      key: 'returned',
      label: 'Returned',
      count: tabStatusBreakdown.returned,
      dotClass: 'bg-error-border',
    },
  ]

  return (
    <div className="max-w-6xl space-y-5">
      {/* 1. Compact, Aligned Page Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1
            id="main-content"
            tabIndex={-1}
            className="ledger-title text-[clamp(1.375rem,1.2rem+0.5vw,1.625rem)] font-semibold leading-[1.2] tracking-[-0.02em] text-ink outline-none"
          >
            Submissions &amp; Reviews
          </h1>
          <p className="mt-1 text-sm leading-[1.45] text-ink-muted">
            Review attendance logs, weekly accomplishments, and task submissions
            across all interns.
          </p>
        </div>

        <button
          type="button"
          disabled={loading || tabSubmissions.length === 0}
          onClick={handleExportCsv}
          className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-[5px] border border-rule bg-surface px-3.5 text-xs font-medium text-ink hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-55"
        >
          <ExportIcon className="size-3.5 text-ink-muted" />
          <span className="whitespace-nowrap">Export CSV</span>
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
            className="inline-flex h-9 shrink-0 items-center justify-center rounded-[5px] border border-rule bg-surface px-4 text-xs font-medium text-ink hover:bg-surface-subtle"
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
          {/* 2. Accessible Tab Bar with Anchor-Positioned Active Underline */}
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
                  <span className="whitespace-nowrap">{tab.label}</span>
                  <span
                    className={`inline-flex min-w-5 items-center justify-center whitespace-nowrap rounded-[4px] border px-1.5 py-0.5 text-[11px] font-medium tabular-nums leading-none ${
                      selected
                        ? 'border-accent/35 bg-accent-tint text-accent'
                        : 'border-rule bg-surface text-ink-muted'
                    }`}
                  >
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
            {/* 3. Compact Scannable Status Summary Strip */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 bg-surface px-5 pt-3.5 pb-2.5">
              <div
                role="group"
                aria-label="Filter by submission status"
                className="flex flex-wrap items-center gap-1.5"
              >
                {statusChips.map((chip) => {
                  const pressed = statusFilter === chip.key
                  return (
                    <button
                      key={chip.key}
                      type="button"
                      aria-pressed={pressed}
                      onClick={() => toggleStatusQuickFilter(chip.key)}
                      className={`inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-[4px] border px-2.5 text-xs transition-colors ${
                        pressed
                          ? 'border-accent bg-accent-tint font-medium text-accent'
                          : 'border-rule bg-surface-subtle/70 text-ink-muted hover:border-input-border hover:text-ink'
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`size-1.5 shrink-0 rounded-full ${chip.dotClass}`}
                      />
                      <span className="whitespace-nowrap">{chip.label}</span>
                      <span className="font-semibold tabular-nums text-ink">
                        {chip.count}
                      </span>
                    </button>
                  )
                })}
              </div>

              <span className="whitespace-nowrap text-xs tabular-nums text-ink-muted">
                Showing{' '}
                <strong className="font-semibold text-ink">
                  {tabSubmissions.length}
                </strong>{' '}
                of {tabStatusBreakdown.total}
              </span>
            </div>

            {/* 4. Single-Row Primary Filter Toolbar + Collapsible More Filters */}
            <search
              aria-label={`Filter ${activeTabLabel}`}
              className="border-b border-rule bg-surface px-5 pt-1 pb-3.5"
            >
              {/* Primary Horizontal Toolbar Row (1 row on desktop, responsive grid on tablet/mobile) */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:flex lg:flex-row lg:flex-nowrap lg:items-center">
                {/* 1. Search submissions (widest element) */}
                <div className="relative min-w-0 sm:col-span-2 lg:flex-1">
                  <label htmlFor="sub-search" className="visually-hidden">
                    Search submissions
                  </label>
                  <SearchIcon className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
                  <input
                    id="sub-search"
                    type="search"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value)
                      setPage(1)
                    }}
                    placeholder="Search submissions (intern, student ID, title, remarks)…"
                    className="min-h-9 w-full rounded-[5px] border border-input-border bg-surface ps-9 pe-3 text-xs text-ink placeholder:text-ink-muted/75 hover:border-ink"
                  />
                </div>

                {/* 2. Status dropdown */}
                <div className="min-w-0 lg:w-36 lg:shrink-0 xl:w-48">
                  <label htmlFor="sub-status" className="visually-hidden">
                    Status
                  </label>
                  <select
                    id="sub-status"
                    value={statusFilter}
                    onChange={(e) => {
                      setStatusFilter(e.target.value)
                      setPage(1)
                    }}
                    className="min-h-9 w-full rounded-[5px] border border-input-border bg-surface px-2.5 text-xs text-ink hover:border-ink"
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

                {/* 3. Intern dropdown */}
                <div className="min-w-0 lg:w-36 lg:shrink-0 xl:w-44">
                  <label htmlFor="sub-intern" className="visually-hidden">
                    Intern
                  </label>
                  <select
                    id="sub-intern"
                    value={internFilter}
                    onChange={(e) => {
                      setInternFilter(e.target.value)
                      setPage(1)
                    }}
                    className="min-h-9 w-full rounded-[5px] border border-input-border bg-surface px-2.5 text-xs text-ink hover:border-ink"
                  >
                    <option value="all">All interns</option>
                    {internProgressRows.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.full_name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 4. More Filters button + conditional Clear Filters */}
                <div className="flex flex-wrap items-center gap-2 sm:col-span-2 sm:justify-between lg:shrink-0 lg:flex-nowrap lg:justify-end">
                  <button
                    type="button"
                    aria-expanded={moreFiltersOpen}
                    aria-controls="sub-more-filters"
                    onClick={() => setMoreFiltersOpen((open) => !open)}
                    className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[5px] border px-3 text-xs font-medium whitespace-nowrap transition-colors ${
                      moreFiltersOpen || secondaryFilterCount > 0
                        ? 'border-accent bg-accent-tint text-accent'
                        : 'border-rule bg-surface text-ink hover:bg-surface-subtle'
                    }`}
                  >
                    <FilterSlidersIcon />
                    <span className="whitespace-nowrap">More Filters</span>
                    {secondaryFilterCount > 0 ? (
                      <span
                        aria-label={`${secondaryFilterCount} active secondary ${
                          secondaryFilterCount === 1 ? 'filter' : 'filters'
                        }`}
                        className="inline-flex min-w-4.5 items-center justify-center rounded-full bg-accent-solid px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums text-on-accent"
                      >
                        {secondaryFilterCount}
                      </span>
                    ) : null}
                    <ChevronDownIcon
                      className={`size-3.5 shrink-0 transition-transform ${
                        moreFiltersOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {activeFilterCount > 0 ? (
                    <button
                      type="button"
                      onClick={resetFilters}
                      className="inline-flex min-h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-[5px] border border-rule bg-surface px-2.5 text-xs font-medium text-ink hover:bg-surface-subtle"
                    >
                      <span className="whitespace-nowrap">Clear Filters</span>
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Active secondary filter indicators when More Filters is collapsed */}
              {!moreFiltersOpen && secondaryFilterCount > 0 ? (
                <div
                  aria-label="Active secondary filters"
                  className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]"
                >
                  <span className="whitespace-nowrap font-medium text-ink-muted">
                    Secondary filters:
                  </span>
                  {supervisorFilter !== 'all' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSupervisorFilter('all')
                        setPage(1)
                      }}
                      className="inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-[4px] border border-accent/35 bg-accent-tint px-2 font-medium text-accent hover:opacity-85"
                    >
                      <span>Supervisor: {activeSupervisorLabel}</span>
                      <span aria-hidden="true">×</span>
                      <span className="visually-hidden">
                        Remove supervisor filter
                      </span>
                    </button>
                  ) : null}
                  {dateFrom || dateTo ? (
                    <button
                      type="button"
                      onClick={() => {
                        setDateFrom('')
                        setDateTo('')
                        setPage(1)
                      }}
                      className="inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-[4px] border border-accent/35 bg-accent-tint px-2 font-medium tabular-nums text-accent hover:opacity-85"
                    >
                      <span>
                        Date: {dateFrom || 'Start'} to {dateTo || 'Present'}
                      </span>
                      <span aria-hidden="true">×</span>
                      <span className="visually-hidden">
                        Remove date range filter
                      </span>
                    </button>
                  ) : null}
                </div>
              ) : null}

              {/* Expandable More Filters Panel (Supervisor + Date Range From/To) */}
              {moreFiltersOpen ? (
                <div
                  id="sub-more-filters"
                  className="mt-3 grid grid-cols-1 gap-3 border-t border-rule pt-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,16rem)_minmax(0,22rem)_1fr] lg:items-end"
                >
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="sub-supervisor"
                      className="whitespace-nowrap text-xs font-medium text-ink-muted"
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
                      className="min-h-9 w-full rounded-[5px] border border-input-border bg-surface px-2.5 text-xs text-ink hover:border-ink"
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

                  <fieldset className="m-0 min-w-0 border-0 p-0">
                    <legend className="mb-1 whitespace-nowrap text-xs font-medium text-ink-muted">
                      Date range (From – To)
                    </legend>
                    <div className="date-range-group">
                      <label htmlFor="sub-date-from" className="visually-hidden">
                        Date from
                      </label>
                      <input
                        id="sub-date-from"
                        type="date"
                        aria-label="Date from"
                        value={dateFrom}
                        onChange={(e) => {
                          setDateFrom(e.target.value)
                          setPage(1)
                        }}
                      />
                      <span
                        aria-hidden="true"
                        className="select-none px-1.5 text-xs text-ink-muted"
                      >
                        to
                      </span>
                      <label htmlFor="sub-date-to" className="visually-hidden">
                        Date to
                      </label>
                      <input
                        id="sub-date-to"
                        type="date"
                        aria-label="Date to"
                        value={dateTo}
                        onChange={(e) => {
                          setDateTo(e.target.value)
                          setPage(1)
                        }}
                      />
                    </div>
                  </fieldset>

                  <div className="flex items-center justify-between gap-2 sm:col-span-2 lg:col-span-1 lg:justify-end">
                    <span className="whitespace-nowrap text-xs text-ink-muted">
                      Filters persist while switching tabs.
                    </span>
                    {secondaryFilterCount > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setSupervisorFilter('all')
                          setDateFrom('')
                          setDateTo('')
                          setPage(1)
                        }}
                        className="whitespace-nowrap text-xs font-medium text-accent underline-offset-4 hover:underline"
                      >
                        Reset secondary
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </search>

            <span role="status" className="visually-hidden">
              {sortAnnouncement}
            </span>

            {/* 5. Tab-Specific Data Table */}
            {paginatedRows.length === 0 ? (
              <div className="px-5 py-12 text-sm text-ink-muted">
                {tabStatusBreakdown.total === 0
                  ? `No ${activeTabLabel.toLowerCase()} records have been logged yet.`
                  : 'No records match the current filters.'}
              </div>
            ) : (
              <div
                tabIndex={0}
                role="region"
                aria-labelledby={`submissions-caption-${activeTab}`}
                className="table-wrapper"
              >
                <table
                  className={`submission-table is-compact submissions-scroll-table${
                    activeTab === 'accomplishments'
                      ? ' is-accomplishments'
                      : activeTab === 'tasks'
                        ? ' is-tasks'
                        : ''
                  }`}
                >
                  <caption
                    id={`submissions-caption-${activeTab}`}
                    className="visually-hidden"
                  >
                    {activeTabLabel} records across all interns
                  </caption>

                  {activeTab === 'attendance' ? (
                    <>
                      <colgroup>
                        <col />
                        <col className="w-36" />
                        <col className="w-40" />
                        <col className="w-30" />
                        <col className="w-30" />
                        <col className="w-24" />
                      </colgroup>
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
                            columnKey="date"
                            label="Attendance Date"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                          />
                          <th scope="col" className="whitespace-nowrap">
                            Time In – Out
                          </th>
                          <SortableHeader
                            columnKey="hours"
                            label="Hours"
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
                          />
                          <th scope="col" className="col-action whitespace-nowrap">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedRows.map((item) => (
                          <tr key={item.key}>
                            <th scope="row">
                              <div className="min-w-0">
                                <p
                                  title={item.internName}
                                  className="truncate whitespace-nowrap text-xs font-semibold text-ink"
                                >
                                  {item.internName}
                                </p>
                                <p className="mt-0.5 truncate whitespace-nowrap text-[11px] font-normal tabular-nums text-ink-muted">
                                  {item.studentIdNo || 'No student ID'}
                                </p>
                              </div>
                            </th>
                            <td
                              data-label="Attendance Date"
                              className="whitespace-nowrap text-xs font-medium tabular-nums text-ink"
                              title={`Reporting period: ${item.reportingPeriod}`}
                            >
                              {formatCalendarDate(item.row.attendance_date)}
                            </td>
                            <td
                              data-label="Time In – Out"
                              className="whitespace-nowrap text-xs tabular-nums text-ink-muted"
                            >
                              {formatWallClockTime(item.row.time_in)} –{' '}
                              {formatWallClockTime(item.row.time_out)}
                            </td>
                            <td
                              data-label="Hours"
                              className="whitespace-nowrap text-xs tabular-nums text-ink"
                            >
                              {item.renderedMinutes !== null ? (
                                <span
                                  className="font-semibold"
                                  title={formatDurationMinutes(item.renderedMinutes)}
                                >
                                  {formatDecimalHours(item.renderedMinutes)}
                                </span>
                              ) : (
                                <span className="whitespace-nowrap font-medium text-error">
                                  Incomplete
                                </span>
                              )}
                            </td>
                            <td data-label="Status">
                              <CoordinatorStatusPill
                                statusKey={item.displayStatusKey}
                                compact
                              />
                            </td>
                            <td data-label="Action" className="col-action">
                              <button
                                type="button"
                                onClick={() => setSelectedSubmission(item)}
                                className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-[5px] border border-rule bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-subtle"
                              >
                                View                                <span className="visually-hidden"> details for {item.internName}</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                  ) : activeTab === 'accomplishments' ? (
                    <>
                      <colgroup>
                        <col className="w-40" />
                        <col />
                        <col className="w-44" />
                        <col className="w-30" />
                        <col className="w-30" />
                        <col className="w-24" />
                      </colgroup>
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
                            label="Accomplishment"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                          />
                          <SortableHeader
                            columnKey="period"
                            label="Reporting Period"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                          />
                          <SortableHeader
                            columnKey="date"
                            label="Submitted"
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
                          />
                          <th scope="col" className="col-action whitespace-nowrap">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedRows.map((item) => (
                          <tr key={item.key}>
                            <th scope="row">
                              <div className="min-w-0">
                                <p
                                  title={item.internName}
                                  className="truncate whitespace-nowrap text-xs font-semibold text-ink"
                                >
                                  {item.internName}
                                </p>
                                <p className="mt-0.5 truncate whitespace-nowrap text-[11px] font-normal tabular-nums text-ink-muted">
                                  {item.studentIdNo || 'No student ID'}
                                </p>
                              </div>
                            </th>
                            <td data-label="Accomplishment">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <p
                                  title={
                                    item.row.description
                                      ? `${item.row.title} — ${item.row.description}`
                                      : item.row.title
                                  }
                                  className="min-w-0 truncate whitespace-nowrap text-xs font-medium text-ink"
                                >
                                  {item.row.title}
                                </p>
                                {item.row.attachment_url ? (
                                  <PaperclipIcon className="size-3 shrink-0 text-accent" />
                                ) : null}
                              </div>
                            </td>
                            <td
                              data-label="Reporting Period"
                              className="truncate whitespace-nowrap text-xs tabular-nums text-ink-muted"
                              title={item.reportingPeriod}
                            >
                              {item.reportingPeriod}
                            </td>
                            <td
                              data-label="Submission Date"
                              className="whitespace-nowrap text-xs tabular-nums text-ink-muted"
                            >
                              {item.submissionDateIso
                                ? formatCalendarDate(item.submissionDateIso)
                                : '—'}
                            </td>
                            <td data-label="Status">
                              <CoordinatorStatusPill
                                statusKey={item.displayStatusKey}
                                compact
                              />
                            </td>
                            <td data-label="Action" className="col-action">
                              <button
                                type="button"
                                onClick={() => setSelectedSubmission(item)}
                                className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-[5px] border border-rule bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-subtle"
                              >
                                View                                <span className="visually-hidden"> details for {item.internName}</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </>
                  ) : (
                    <>
                      <colgroup>
                        <col className="w-40" />
                        <col />
                        <col className="w-32" />
                        <col className="w-30" />
                        <col className="w-30" />
                        <col className="w-24" />
                      </colgroup>
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
                            label="Task Title"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                          />
                          <SortableHeader
                            columnKey="deadline"
                            label="Deadline"
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={handleSort}
                          />
                          <SortableHeader
                            columnKey="date"
                            label="Submitted"
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
                          />
                          <th scope="col" className="col-action whitespace-nowrap">
                            Action
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedRows.map((item) => {
                          const effectiveDeadline =
                            item.row.deadline || item.row.task_date || ''
                          const deadlineBadge =
                            item.row.status === 'pending' &&
                            !item.row.submitted_at &&
                            effectiveDeadline
                              ? getDeadlineBadge(effectiveDeadline, todayIso)
                              : null

                          return (
                            <tr key={item.key}>
                              <th scope="row">
                                <div className="min-w-0">
                                  <p
                                    title={item.internName}
                                    className="truncate whitespace-nowrap text-xs font-semibold text-ink"
                                  >
                                    {item.internName}
                                  </p>
                                  <p className="mt-0.5 truncate whitespace-nowrap text-[11px] font-normal tabular-nums text-ink-muted">
                                    {item.studentIdNo || 'No student ID'}
                                  </p>
                                </div>
                              </th>
                              <td data-label="Task Title">
                                <div className="min-w-0 space-y-1">
                                  <p
                                    title={item.row.title}
                                    className="truncate whitespace-nowrap text-xs font-medium text-ink"
                                  >
                                    {item.row.title}
                                  </p>
                                  <div className="flex flex-nowrap items-center gap-2 overflow-hidden">
                                    <PriorityBadge
                                      priority={item.row.priority}
                                    />
                                    {item.row.submission_attachment_url ? (
                                      <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] text-accent">
                                        <PaperclipIcon className="size-3" />
                                        <span>File</span>
                                      </span>
                                    ) : null}
                                    {item.row.reviewer_remarks?.trim() ? (
                                      <span className="shrink-0 whitespace-nowrap text-[11px] text-ink-muted">
                                        Remarks
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              </td>
                              <td
                                data-label="Deadline"
                                className="whitespace-nowrap text-xs tabular-nums"
                              >
                                <span className="block truncate whitespace-nowrap text-ink">
                                  {effectiveDeadline
                                    ? formatCalendarDate(effectiveDeadline)
                                    : '—'}
                                </span>
                                {deadlineBadge ? (
                                  <span
                                    className={`mt-0.5 block truncate whitespace-nowrap text-[11px] ${DEADLINE_TONE_CLASSES[deadlineBadge.tone]}`}
                                  >
                                    {deadlineBadge.label}
                                  </span>
                                ) : null}
                              </td>
                              <td
                                data-label="Submission Date"
                                className="whitespace-nowrap text-xs tabular-nums text-ink-muted"
                              >
                                {item.submissionDateIso
                                  ? formatCalendarDate(item.submissionDateIso)
                                  : 'Not submitted'}
                              </td>
                              <td data-label="Status">
                                <CoordinatorStatusPill
                                  statusKey={item.displayStatusKey}
                                  compact
                                />
                              </td>
                              <td data-label="Action" className="col-action">
                                <button
                                  type="button"
                                  onClick={() => setSelectedSubmission(item)}
                                  className="inline-flex h-8 items-center justify-center whitespace-nowrap rounded-[5px] border border-rule bg-surface px-3 text-xs font-medium text-ink hover:bg-surface-subtle"
                                >
                                  View                                  <span className="visually-hidden"> details for {item.internName}</span>
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </>
                  )}
                </table>
              </div>
            )}

            {/* Pagination Footer */}
            {tabSubmissions.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule bg-surface-subtle px-5 py-3 text-xs text-ink-muted">
                <div className="flex items-center gap-2">
                  <label
                    htmlFor="sub-page-size"
                    className="whitespace-nowrap font-medium"
                  >
                    Rows per page
                  </label>
                  <select
                    id="sub-page-size"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value))
                      setPage(1)
                    }}
                    className="h-8 rounded-[4px] border border-input-border bg-surface px-2 text-xs text-ink"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>

                <div className="flex items-center gap-2 whitespace-nowrap tabular-nums">
                  <span className="whitespace-nowrap">
                    Page {safePage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="inline-flex h-8 items-center whitespace-nowrap rounded-[4px] border border-rule bg-surface px-2.5 font-medium text-ink hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    className="inline-flex h-8 items-center whitespace-nowrap rounded-[4px] border border-rule bg-surface px-2.5 font-medium text-ink hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-50"
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
