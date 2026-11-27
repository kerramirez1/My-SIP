const STORAGE_KEY = 'color-scheme'

function getSchemeMeta() {
  if (typeof document === 'undefined') return null
  return document.querySelector('meta[name="color-scheme"]')
}

export function getSystemScheme() {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export function getStoredScheme() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : null
  } catch {
    return null
  }
}

export function applyColorScheme(scheme) {
  const meta = getSchemeMeta()
  if (!meta) return
  meta.content = scheme === 'light' || scheme === 'dark' ? scheme : 'light dark'
}

/**
 * Two-state toggle following modern dark-mode-toggle rules:
 * switches to the opposite of the currently rendered scheme; if that matches
 * the current OS preference, clears localStorage so the page follows the OS again.
 */
export function toggleColorScheme() {
  const system = getSystemScheme()
  const rendered = getStoredScheme() ?? system
  const target = rendered === 'dark' ? 'light' : 'dark'

  if (target === system) {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Apply in-memory even when storage is blocked.
    }
    applyColorScheme(null)
    return 'light dark'
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, target)
  } catch {
    // Apply in-memory even when storage is blocked.
  }
  applyColorScheme(target)
  return target
}

/**
 * Keeps the active <meta name="color-scheme"> synchronized across browser tabs.
 */
export function subscribeColorSchemeStorage(onChange) {
  if (typeof window === 'undefined') return () => {}

  function handleStorage(event) {
    if (event.key !== STORAGE_KEY && event.key !== null) return
    const next = getStoredScheme()
    applyColorScheme(next)
    onChange?.(next)
  }

  window.addEventListener('storage', handleStorage)
  return () => window.removeEventListener('storage', handleStorage)
}
