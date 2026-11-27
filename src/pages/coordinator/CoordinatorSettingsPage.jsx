import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertMessage } from '../../components/AlertMessage'
import {
  getCoordinatorPrefs,
  saveCoordinatorPrefs,
} from '../../lib/coordinatorPrefs'
import {
  getStoredScheme,
  setColorSchemePreference,
  subscribeColorSchemeStorage,
} from '../../lib/theme'
import { INACTIVE_DAYS_THRESHOLD } from '../../lib/useCoordinatorData'
import { useDocumentTitle } from '../../lib/useDocumentTitle'

const THEME_OPTIONS = [
  {
    value: 'system',
    label: 'Follow system',
    description: 'Matches your operating system light or dark appearance.',
  },
  {
    value: 'light',
    label: 'Light mode',
    description: 'High-clarity white and neutral slate workspace.',
  },
  {
    value: 'dark',
    label: 'Dark mode',
    description: 'Low-glare charcoal canvas with adaptive cobalt accents.',
  },
]

export function CoordinatorSettingsPage() {
  useDocumentTitle('Settings')

  const [themeMode, setThemeMode] = useState(() => getStoredScheme() ?? 'system')
  const [prefs, setPrefs] = useState(() => getCoordinatorPrefs())
  const [savedBanner, setSavedBanner] = useState('')

  useEffect(() => {
    return subscribeColorSchemeStorage((nextScheme) => {
      setThemeMode(nextScheme ?? 'system')
    })
  }, [])

  function handleThemeChange(mode) {
    setThemeMode(mode)
    setColorSchemePreference(mode)
    setSavedBanner(`Appearance preference updated to ${mode} mode.`)
  }

  function handlePrefsChange(partial) {
    const updated = saveCoordinatorPrefs(partial)
    setPrefs(updated)
    setSavedBanner('Workspace display preferences saved for this browser.')
  }

  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <h1
          id="main-content"
          tabIndex={-1}
          className="ledger-title text-[clamp(1.375rem,1.2rem+0.6vw,1.75rem)] font-semibold leading-[1.2] tracking-[-0.02em] text-ink outline-none"
        >
          Settings
        </h1>
        <p className="mt-1.5 max-w-[64ch] text-sm leading-[1.55] text-ink-muted">
          Configure appearance, submission table defaults, and review active
          monitoring rules for your Coordinator workspace.
        </p>
      </header>

      {savedBanner ? (
        <AlertMessage message={savedBanner} variant="success" />
      ) : null}

      {/* Appearance */}
      <section
        aria-labelledby="settings-appearance-heading"
        className="overflow-hidden rounded-[6px] border border-rule bg-surface"
      >
        <div className="border-b border-rule bg-surface-subtle px-5 py-3.5">
          <h2
            id="settings-appearance-heading"
            className="text-sm font-semibold text-ink"
          >
            Appearance
          </h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Synchronized with the sidebar theme toggle across all open tabs
          </p>
        </div>

        <fieldset className="p-5">
          <legend className="visually-hidden">Theme preference</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {THEME_OPTIONS.map((option) => {
              const active = themeMode === option.value
              return (
                <label
                  key={option.value}
                  className={`flex cursor-pointer flex-col gap-1 rounded-[5px] border p-3.5 transition-colors ${
                    active
                      ? 'border-accent bg-accent-tint/50'
                      : 'border-rule bg-surface hover:bg-surface-subtle'
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-ink">
                    <input
                      type="radio"
                      name="theme-mode"
                      value={option.value}
                      checked={active}
                      onChange={() => handleThemeChange(option.value)}
                      className="size-4 accent-accent-solid"
                    />
                    <span>{option.label}</span>
                  </span>
                  <span className="ps-6 text-xs leading-[1.45] text-ink-muted">
                    {option.description}
                  </span>
                </label>
              )
            })}
          </div>
        </fieldset>
      </section>

      {/* Workspace Defaults */}
      <section
        aria-labelledby="settings-workspace-heading"
        className="overflow-hidden rounded-[6px] border border-rule bg-surface"
      >
        <div className="border-b border-rule bg-surface-subtle px-5 py-3.5">
          <h2
            id="settings-workspace-heading"
            className="text-sm font-semibold text-ink"
          >
            Workspace Defaults
          </h2>
          <p className="mt-0.5 text-xs text-ink-muted">
            Personal preferences saved locally for your Submissions &amp;
            Reviews workspace
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 p-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="pref-default-tab"
              className="text-sm font-medium text-ink"
            >
              Default Submissions &amp; Reviews tab
            </label>
            <select
              id="pref-default-tab"
              value={prefs.defaultSubmissionsTab}
              onChange={(e) =>
                handlePrefsChange({ defaultSubmissionsTab: e.target.value })
              }
              className="min-h-10 w-full rounded-[5px] border border-input-border bg-surface px-3 text-sm text-ink hover:border-ink"
            >
              <option value="attendance">Weekly Attendance</option>
              <option value="accomplishments">Weekly Accomplishments</option>
              <option value="tasks">Task Submissions</option>
            </select>
            <p className="text-xs text-ink-muted">
              Selected automatically when opening Submissions &amp; Reviews.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="pref-page-size"
              className="text-sm font-medium text-ink"
            >
              Default table rows per page
            </label>
            <select
              id="pref-page-size"
              value={prefs.defaultPageSize}
              onChange={(e) =>
                handlePrefsChange({ defaultPageSize: Number(e.target.value) })
              }
              className="min-h-10 w-full rounded-[5px] border border-input-border bg-surface px-3 text-sm text-ink hover:border-ink"
            >
              <option value={10}>10 rows</option>
              <option value={25}>25 rows</option>
              <option value={50}>50 rows</option>
            </select>
            <p className="text-xs text-ink-muted">
              Controls initial pagination density on submission tables.
            </p>
          </div>
        </div>
      </section>

      {/* Monitoring & Governance Standards */}
      <section
        aria-labelledby="settings-policy-heading"
        className="overflow-hidden rounded-[6px] border border-rule bg-surface"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-surface-subtle px-5 py-3.5">
          <div>
            <h2
              id="settings-policy-heading"
              className="text-sm font-semibold text-ink"
            >
              Program Monitoring Rules
            </h2>
            <p className="mt-0.5 text-xs text-ink-muted">
              Active system definitions applied across Monitoring, Submissions,
              and Analytics
            </p>
          </div>
          <Link
            to="/coordinator/profile"
            className="text-xs font-medium text-accent underline-offset-4 hover:underline"
          >
            Manage password &amp; profile →
          </Link>
        </div>

        <dl className="divide-y divide-rule text-xs">
          <div className="grid grid-cols-1 gap-1 px-5 py-3 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-4">
            <dt className="font-medium text-ink-muted">
              Approved hours calculation
            </dt>
            <dd className="text-ink">
              Counted strictly from supervisor-approved attendance records with
              lunch breaks deducted.
            </dd>
          </div>
          <div className="grid grid-cols-1 gap-1 px-5 py-3 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-4">
            <dt className="font-medium text-ink-muted">
              Pending supervisor reviews
            </dt>
            <dd className="text-ink">
              Includes only submitted records awaiting approval. Assigned tasks
              not yet submitted are tracked separately.
            </dd>
          </div>
          <div className="grid grid-cols-1 gap-1 px-5 py-3 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-4">
            <dt className="font-medium text-ink-muted">
              Inactive intern threshold
            </dt>
            <dd className="tabular-nums text-ink">
              {INACTIVE_DAYS_THRESHOLD} days without a new submission (applied
              only after an intern&apos;s start date).
            </dd>
          </div>
          <div className="grid grid-cols-1 gap-1 px-5 py-3 sm:grid-cols-[14rem_minmax(0,1fr)] sm:gap-4">
            <dt className="font-medium text-ink-muted">
              Historical record protection
            </dt>
            <dd className="text-ink">
              Approved records are locked from direct deletion to preserve
              official internship hour audit trails.
            </dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
