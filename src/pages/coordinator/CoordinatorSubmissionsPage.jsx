import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertMessage } from '../../components/AlertMessage'
import { CloseIcon, PaperclipIcon } from '../../components/Icons'
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

const PRIORITY_TEXT_META = {
  high: {
    label: 'High priority',
    dotClass: 'bg-error-border',
    textClass: 'font-medium text-error',
  },
  medium: {
    label: 'Medium priority',
    dotClass: 'bg-accent-solid',
    textClass: 'text-ink-muted',
  },
  low: {
    label: 'Low priority',
    dotClass: 'bg-input-border/70',
    textClass: 'text-ink-muted',
  },
}

function toNumericTime(value) {
  if (!value) return -1
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : -1
}

function collapseOneLine(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
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

function InternRowHeader({ item }) {
  const subline = item.studentIdNo
    ? `${item.studentIdNo} · ${item.supervisorName}`
    : item.supervisorName

  return (
    <th scope="row">
      <div className="min-w-0">
        <p
          title={item.internName}
          className="truncate whitespace-nowrap text-[13px] font-medium text-ink"
        >
          {item.internName}
        </p>
        {subline ? (
          <p
            title={subline}
            className="mt-0.5 truncate whitespace-nowrap text-[11px] font-normal tabular-nums text-ink-muted"
          >
            {subline}
          </p>
        ) : null}
      </div>
    </th>
  )
}

function RowViewButton({ item, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className="inline-flex h-7.5 items-center justify-center whitespace-nowrap rounded-[5px] border border-rule bg-surface px-2.5 text-xs font-medium text-ink hover:border-accent/45 hover:bg-accent-tint/50 hover:text-accent"
    >
      <span>View</span>
      <span className="visually-hidden"> details for {item.internName}</span>
    </button>
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

  const tablistRef = useRef(null)
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
    if (nextStatusKey === 'all') {
      setStatusFilter('all')
    } else {
      setStatusFilter((prev) => (prev === nextStatusKey ? 'all' : nextStatusKey))
    }
    setPage(1)
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
        const aVal = toNumericTime(a.row.week_of || a.row.attendance_date)
        const bVal = toNumericTime(b.row.week_of || b.row.attendance_date)
        return (aVal - bVal) * dir
      }
      if (sortKey === 'deadline') {
        const aVal = toNumericTime(a.row.deadline || a.row.task_date)
        const bVal = toNumericTime(b.row.deadline || b.row.task_date)
        return (aVal - bVal) * dir
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
      return (toNumericTime(a.sortAt) - toNumericTime(b.sortAt)) * dir
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

  function handleSort(nextKey, label) {
    const nextDir =
      sortKey === nextKey && sortDir === 'ascending'
        ? 'descending'
        : 'ascending'
    setSortKey(nextKey)
    setSortDir(nextDir)
    setPage(1)
    setSortAnnouncement(
      `Sorted by ${label}, ${nextDir}, ${tabSubmissions.length} ${tabSubmissions.length === 1 ? 'row' : 'rows'}.`,
    )
  }

  useEffect(() => {
    if (
      loading ||
      typeof window === 'undefined' ||
      window.CSS?.supports?.('animation-timeline', 'scroll()')
    ) {
      return undefined
    }
    const scroller = tablistRef.current
    const first = scroller?.firstElementChild
    const last = scroller?.lastElementChild
    if (!scroller || !first || !last) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        for (const { target, intersectionRatio } of entries) {
          scroller.classList.toggle(
            target === first ? 'more-start' : 'more-end',
            intersectionRatio < 1,
          )
        }
      },
      { root: scroller, threshold: 1, rootMargin: '1px' },
    )
    observer.observe(first)
    observer.observe(last)
    return () => observer.disconnect()
  }, [loading])

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

    const attachmentPath =
      deleteTarget.tableName === 'accomplishments'
        ? deleteTarget.row?.attachment_url
        : deleteTarget.tableName === 'tasks'
          ? deleteTarget.row?.submission_attachment_url
          : null

    if (attachmentPath) {
      // Best-effort cleanup of the deleted record's file: the record is
      // already deleted, so a failed removal must never surface as a
      // failed delete.
      try {
        await supabase.storage.from('attachments').remove([attachmentPath])
      } catch {
        // Ignored — orphan cleanup is secondary to the successful delete.
      }
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
      key: 'all',
      label: 'All',
      count: tabStatusBreakdown.total,
      dotClass: null,
    },
    {
      key: 'pending',
      label: 'Pending review',
      count: tabStatusBreakdown.pending,
      dotClass: 'bg-accent-solid',
    },
    ...(activeTab === 'tasks'
      ? [
          {
            key: 'assigned_not_submitted',
            label: 'Not submitted',
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

  const rangeStart =
    tabSubmissions.length === 0 ? 0 : (safePage - 1) * pageSize + 1
  const rangeEnd = Math.min(safePage * pageSize, tabSubmissions.length)

  return (
    <div className="max-w-6xl space-y-5">
      {/* 1. Page Header + Baseline Category Navigation */}
      <div className="space-y-4">
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
              Review intern attendance logs, weekly accomplishments, and task
              submissions.
            </p>
          </div>

          <button
            type="button"
            disabled={loading || tabSubmissions.length === 0}
            onClick={handleExportCsv}
            className="ledger-control inline-flex h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap px-3.5 text-xs font-medium text-ink shadow-[0_1px_2px_rgb(20_23_29/0.04)] hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-55"
          >
            <ExportIcon className="size-3.5 text-ink-muted" />
            <span className="whitespace-nowrap">Export CSV</span>
          </button>
        </header>

        {!loading ? (
          <div
            ref={tablistRef}
            role="tablist"
            aria-label="Submission categories"
            className="sip-tablist is-page-tabs"
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
                    className={`inline-flex min-w-5 items-center justify-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums leading-none ${
                      selected
                        ? 'bg-accent-tint text-accent'
                        : 'bg-surface-subtle text-ink-muted'
                    }`}
                  >
                    {tabCounts[tab.id] ?? 0}
                  </span>
                </button>
              )
            })}
          </div>
        ) : null}
      </div>

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
            className="ledger-control inline-flex h-9 shrink-0 items-center justify-center px-4 text-xs font-medium text-ink hover:bg-surface-subtle"
          >
            Retry
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-3 rounded-[8px] border border-rule bg-surface px-5 py-14 text-sm text-ink-muted">
          <progress
            aria-label="Loading submissions"
            className="loading-spinner"
          />
          <span>Loading submissions…</span>
        </div>
      ) : (
        <div
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
          className="overflow-hidden rounded-[8px] border border-rule bg-surface shadow-[0_1px_2px_rgb(20_23_29/0.03)]"
        >
          {/* 2. Quiet Inline Status Summary & Record Count */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule/80 bg-surface-subtle/45 px-5 py-2">
            <div
              role="group"
              aria-label="Quick filter by submission status"
              className="flex flex-wrap items-center gap-1"
            >
              {statusChips.map((chip) => {
                const pressed = statusFilter === chip.key
                return (
                  <button
                    key={chip.key}
                    type="button"
                    aria-pressed={pressed}
                    onClick={() => toggleStatusQuickFilter(chip.key)}
                    className={`inline-flex min-h-7 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-xs transition-colors ${
                      pressed
                        ? 'border-accent/35 bg-accent-tint font-medium text-accent'
                        : 'border-transparent bg-transparent text-ink-muted hover:bg-surface hover:text-ink'
                    }`}
                  >
                    {chip.dotClass ? (
                      <span
                        aria-hidden="true"
                        className={`size-1.5 shrink-0 rounded-full ${chip.dotClass}`}
                      />
                    ) : null}
                    <span className="whitespace-nowrap">{chip.label}</span>
                    <span
                      className={`tabular-nums ${
                        pressed ? 'font-semibold text-accent' : 'font-medium text-ink'
                      }`}
                    >
                      {chip.count}
                    </span>
                  </button>
                )
              })}
            </div>

            <span className="whitespace-nowrap text-xs tabular-nums text-ink-muted">
              {tabSubmissions.length === 0 ? (
                '0 matching'
              ) : tabSubmissions.length === 1 && tabStatusBreakdown.total === 1 ? (
                '1 record'
              ) : (
                <>
                  Showing{' '}
                  <strong className="font-medium text-ink">
                    {rangeStart}–{rangeEnd}
                  </strong>{' '}
                  of {tabSubmissions.length}
                </>
              )}
            </span>
          </div>

          {/* 3. Unified Single-Row Filter Toolbar + Collapsible More Filters */}
          <search
            aria-label={`Filter ${activeTabLabel}`}
            className="border-b border-rule bg-surface px-5 py-3"
          >
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-row lg:flex-nowrap lg:items-center">
              {/* Search submissions (widest element) */}
              <div className="relative min-w-0 sm:col-span-2 lg:flex-1">
                <label htmlFor="sub-search" className="visually-hidden">
                  Search submissions
                </label>
                <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-ink-muted" />
                <input
                  id="sub-search"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setPage(1)
                  }}
                  placeholder="Search intern, student ID, title, or remarks…"
                  className="ledger-control h-9 w-full ps-8.5 pe-8 text-xs text-ink placeholder:text-ink-muted/75"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('')
                      setPage(1)
                    }}
                    aria-label="Clear search query"
                    className="absolute end-1.5 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-[4px] text-ink-muted hover:bg-surface-subtle hover:text-ink"
                  >
                    <CloseIcon className="size-3" />
                  </button>
                ) : null}
              </div>

              {/* Status dropdown */}
              <div className="relative min-w-0 lg:w-40 lg:shrink-0 xl:w-44">
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
                  className="ledger-control ledger-select h-9 w-full ps-3 text-xs text-ink"
                >
                  <option value="all">All statuses</option>
                  <option value="pending">Pending review</option>
                  {activeTab === 'tasks' ? (
                    <option value="assigned_not_submitted">
                      Not submitted
                    </option>
                  ) : null}
                  <option value="approved">Approved</option>
                  <option value="returned">Returned</option>
                  <option value="rejected">Rejected</option>
                </select>
                <ChevronDownIcon className="ledger-select-chevron absolute end-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-muted" />
              </div>

              {/* Intern dropdown */}
              <div className="relative min-w-0 lg:w-40 lg:shrink-0 xl:w-44">
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
                  className="ledger-control ledger-select h-9 w-full ps-3 text-xs text-ink"
                >
                  <option value="all">All interns</option>
                  {internProgressRows.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.full_name}
                    </option>
                  ))}
                </select>
                <ChevronDownIcon className="ledger-select-chevron absolute end-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-muted" />
              </div>

              {/* More Filters + conditional Clear */}
              <div className="flex flex-wrap items-center gap-2 sm:col-span-2 sm:justify-between lg:shrink-0 lg:flex-nowrap lg:justify-end">
                <button
                  type="button"
                  aria-expanded={moreFiltersOpen}
                  aria-controls="sub-more-filters"
                  onClick={() => setMoreFiltersOpen((open) => !open)}
                  className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-[6px] border px-3 text-xs font-medium whitespace-nowrap transition-colors ${
                    moreFiltersOpen || secondaryFilterCount > 0
                      ? 'border-accent/45 bg-accent-tint text-accent'
                      : 'border-rule bg-surface text-ink hover:border-input-border hover:bg-surface-subtle'
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
                    className={`size-3.5 shrink-0 text-ink-muted transition-transform ${
                      moreFiltersOpen ? 'rotate-180 text-accent' : ''
                    }`}
                  />
                </button>

                {activeFilterCount > 0 ? (
                  <button
                    type="button"
                    onClick={resetFilters}
                    className="inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-[6px] px-2.5 text-xs font-medium text-ink-muted hover:bg-surface-subtle hover:text-ink"
                  >
                    <span className="whitespace-nowrap">Clear</span>
                  </button>
                ) : null}
              </div>
            </div>

            {/* Active secondary filter pills when More Filters is collapsed */}
            {!moreFiltersOpen && secondaryFilterCount > 0 ? (
              <div
                aria-label="Active secondary filters"
                className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]"
              >
                <span className="whitespace-nowrap text-ink-muted">
                  Filtered by:
                </span>
                {supervisorFilter !== 'all' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSupervisorFilter('all')
                      setPage(1)
                    }}
                    className="inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full border border-accent/30 bg-accent-tint px-2.5 font-medium text-accent hover:opacity-85"
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
                    className="inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full border border-accent/30 bg-accent-tint px-2.5 font-medium tabular-nums text-accent hover:opacity-85"
                  >
                    <span>
                      {dateFrom || 'Start'} – {dateTo || 'Present'}
                    </span>
                    <span aria-hidden="true">×</span>
                    <span className="visually-hidden">
                      Remove date range filter
                    </span>
                  </button>
                ) : null}
              </div>
            ) : null}

            {/* Expandable More Filters Panel */}
            {moreFiltersOpen ? (
              <div
                id="sub-more-filters"
                className="-mx-5 mt-3 -mb-3 grid grid-cols-1 gap-3 border-t border-rule bg-surface-subtle/60 px-5 py-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,16rem)_minmax(0,22rem)_1fr] lg:items-end"
              >
                <div className="flex flex-col gap-1">
                  <label
                    htmlFor="sub-supervisor"
                    className="whitespace-nowrap text-xs font-medium text-ink-muted"
                  >
                    Supervisor
                  </label>
                  <div className="relative">
                    <select
                      id="sub-supervisor"
                      value={supervisorFilter}
                      onChange={(e) => {
                        setSupervisorFilter(e.target.value)
                        setPage(1)
                      }}
                      className="ledger-control ledger-select h-9 w-full ps-3 text-xs text-ink"
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
                    <ChevronDownIcon className="ledger-select-chevron absolute end-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-muted" />
                  </div>
                </div>

                <fieldset className="m-0 min-w-0 border-0 p-0">
                  <legend className="mb-1 whitespace-nowrap text-xs font-medium text-ink-muted">
                    Date range
                  </legend>
                  <div className="date-range-group is-subtle">
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
                      –
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
                      Reset secondary filters
                    </button>
                  ) : (
                    <span className="whitespace-nowrap text-xs text-ink-muted">
                      Filters stay active across tabs.
                    </span>
                  )}
                </div>
              </div>
            ) : null}
          </search>

          <span role="status" className="visually-hidden">
            {sortAnnouncement}
          </span>

          {/* 4. Tab-Specific Data Table */}
          {paginatedRows.length === 0 ? (
            <div className="flex flex-col items-start justify-between gap-3 px-5 py-10 sm:flex-row sm:items-center">
              <div>
                <p className="text-sm font-medium text-ink">
                  {tabStatusBreakdown.total === 0
                    ? `No ${activeTabLabel.toLowerCase()} logged yet`
                    : 'No submissions match your filters'}
                </p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {tabStatusBreakdown.total === 0
                    ? 'New intern submissions will appear here automatically.'
                    : 'Adjust your search query or clear the active filters to see all records.'}
                </p>
              </div>
              {activeFilterCount > 0 ? (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="ledger-control inline-flex h-8 shrink-0 items-center justify-center px-3 text-xs font-medium text-ink hover:bg-surface-subtle"
                >
                  Clear filters
                </button>
              ) : null}
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
                      <col className="w-44" />
                      <col className="w-34" />
                      <col />
                      <col className="w-28" />
                      <col className="w-30" />
                      <col className="w-22" />
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
                          label="Date"
                          sortKey={sortKey}
                          sortDir={sortDir}
                          onSort={handleSort}
                        />
                        <th scope="col" className="whitespace-nowrap">
                          Time In – Out
                        </th>
                        <SortableHeader
                          columnKey="hours"
                          label="Rendered"
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
                          <InternRowHeader item={item} />
                          <td
                            data-label="Date"
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
                            data-label="Rendered"
                            className="whitespace-nowrap text-xs tabular-nums text-ink"
                          >
                            {item.renderedMinutes !== null ? (
                              <span
                                className="font-medium"
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
                            <RowViewButton
                              item={item}
                              onSelect={setSelectedSubmission}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                ) : activeTab === 'accomplishments' ? (
                  <>
                    <colgroup>
                      <col className="w-44" />
                      <col />
                      <col className="w-42" />
                      <col className="w-30" />
                      <col className="w-30" />
                      <col className="w-22" />
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
                      {paginatedRows.map((item) => {
                        const excerpt = collapseOneLine(item.row.description)
                        return (
                          <tr key={item.key}>
                            <InternRowHeader item={item} />
                            <td data-label="Accomplishment">
                              <div className="min-w-0">
                                <div className="flex min-w-0 items-center gap-1.5">
                                  <p
                                    title={item.row.title}
                                    className="min-w-0 truncate whitespace-nowrap text-[13px] font-medium text-ink"
                                  >
                                    {item.row.title}
                                  </p>
                                  {item.row.attachment_url ? (
                                    <PaperclipIcon className="size-3 shrink-0 text-accent" />
                                  ) : null}
                                </div>
                                {excerpt ? (
                                  <p
                                    title={excerpt}
                                    className="mt-0.5 truncate whitespace-nowrap text-[11px] text-ink-muted"
                                  >
                                    {excerpt}
                                  </p>
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
                              data-label="Submitted"
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
                              <RowViewButton
                                item={item}
                                onSelect={setSelectedSubmission}
                              />
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </>
                ) : (
                  <>
                    <colgroup>
                      <col className="w-44" />
                      <col />
                      <col className="w-30" />
                      <col className="w-30" />
                      <col className="w-30" />
                      <col className="w-22" />
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
                          label="Task"
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
                        const priorityMeta =
                          PRIORITY_TEXT_META[item.row.priority] ??
                          PRIORITY_TEXT_META.medium

                        return (
                          <tr key={item.key}>
                            <InternRowHeader item={item} />
                            <td data-label="Task">
                              <div className="min-w-0">
                                <p
                                  title={item.row.title}
                                  className="truncate whitespace-nowrap text-[13px] font-medium text-ink"
                                >
                                  {item.row.title}
                                </p>
                                <div className="mt-0.5 flex flex-nowrap items-center gap-2 overflow-hidden text-[11px]">
                                  <span
                                    className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap ${priorityMeta.textClass}`}
                                  >
                                    <span
                                      aria-hidden="true"
                                      className={`size-1.5 rounded-full ${priorityMeta.dotClass}`}
                                    />
                                    <span>{priorityMeta.label}</span>
                                  </span>
                                  {item.row.submission_attachment_url ? (
                                    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-accent">
                                      <PaperclipIcon className="size-3" />
                                      <span>Attachment</span>
                                    </span>
                                  ) : null}
                                  {item.row.reviewer_remarks?.trim() ? (
                                    <span className="shrink-0 whitespace-nowrap text-ink-muted">
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
                              data-label="Submitted"
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
                              <RowViewButton
                                item={item}
                                onSelect={setSelectedSubmission}
                              />
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

          {/* 5. Slim Pagination Footer */}
          {tabSubmissions.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule bg-surface-subtle/50 px-5 py-2.5 text-xs text-ink-muted">
              <div className="flex items-center gap-2">
                <label
                  htmlFor="sub-page-size"
                  className="whitespace-nowrap"
                >
                  Rows per page
                </label>
                <div className="relative">
                  <select
                    id="sub-page-size"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value))
                      setPage(1)
                    }}
                    className="ledger-control ledger-select h-7.5 ps-2.5 text-xs tabular-nums text-ink"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                  <ChevronDownIcon className="ledger-select-chevron absolute end-2 top-1/2 size-3 -translate-y-1/2 text-ink-muted" />
                </div>
              </div>

              <div className="flex items-center gap-2 whitespace-nowrap tabular-nums">
                <span className="me-1 whitespace-nowrap">
                  Page <strong className="font-medium text-ink">{safePage}</strong> of{' '}
                  {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="ledger-control inline-flex h-7.5 items-center whitespace-nowrap px-2.5 font-medium text-ink hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="ledger-control inline-flex h-7.5 items-center whitespace-nowrap px-2.5 font-medium text-ink hover:bg-surface-subtle disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </div>
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
