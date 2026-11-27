const PREFS_STORAGE_KEY = 'sip-coordinator-prefs'

const VALID_PAGE_SIZES = new Set([10, 25, 50])
const VALID_SUBMISSION_TABS = new Set(['attendance', 'accomplishments', 'tasks'])

export const DEFAULT_COORDINATOR_PREFS = {
  defaultPageSize: 10,
  defaultSubmissionsTab: 'attendance',
}

export function getCoordinatorPrefs() {
  if (typeof window === 'undefined') return { ...DEFAULT_COORDINATOR_PREFS }
  try {
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_COORDINATOR_PREFS }
    const parsed = JSON.parse(raw)
    const defaultPageSize = VALID_PAGE_SIZES.has(Number(parsed?.defaultPageSize))
      ? Number(parsed.defaultPageSize)
      : DEFAULT_COORDINATOR_PREFS.defaultPageSize
    const defaultSubmissionsTab = VALID_SUBMISSION_TABS.has(
      parsed?.defaultSubmissionsTab,
    )
      ? parsed.defaultSubmissionsTab
      : DEFAULT_COORDINATOR_PREFS.defaultSubmissionsTab
    return { defaultPageSize, defaultSubmissionsTab }
  } catch {
    return { ...DEFAULT_COORDINATOR_PREFS }
  }
}

export function saveCoordinatorPrefs(partial) {
  const current = getCoordinatorPrefs()
  const next = {
    defaultPageSize: VALID_PAGE_SIZES.has(Number(partial?.defaultPageSize))
      ? Number(partial.defaultPageSize)
      : current.defaultPageSize,
    defaultSubmissionsTab: VALID_SUBMISSION_TABS.has(
      partial?.defaultSubmissionsTab,
    )
      ? partial.defaultSubmissionsTab
      : current.defaultSubmissionsTab,
  }
  try {
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // Ignore storage errors in restricted environments.
  }
  return next
}
