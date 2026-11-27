import { useEffect } from 'react'
import { subscribeColorSchemeStorage, toggleColorScheme } from '../lib/theme'
import { MoonIcon, SunIcon } from './Icons'

export function ThemeToggleButton({ className = '' }) {
  useEffect(() => {
    return subscribeColorSchemeStorage()
  }, [])

  return (
    <button
      type="button"
      onClick={() => toggleColorScheme()}
      className={`flex min-h-10 w-full items-center gap-2.5 rounded-[5px] px-3 py-2 text-start text-sm font-medium text-ink-muted transition-colors hover:bg-surface hover:text-ink ${className}`}
    >
      <span className="scheme-toggle-when-dark items-center gap-2.5">
        <SunIcon className="size-4 shrink-0" />
        <span aria-hidden="true">Light mode</span>
        <span className="visually-hidden">Switch to light theme</span>
      </span>
      <span className="scheme-toggle-when-light items-center gap-2.5">
        <MoonIcon className="size-4 shrink-0" />
        <span aria-hidden="true">Dark mode</span>
        <span className="visually-hidden">Switch to dark theme</span>
      </span>
    </button>
  )
}
