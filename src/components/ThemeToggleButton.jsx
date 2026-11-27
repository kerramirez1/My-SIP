import { useEffect } from 'react'
import { subscribeColorSchemeStorage, toggleColorScheme } from '../lib/theme'
import { MoonIcon, SunIcon } from './Icons'

export function ThemeToggleButton({ className = '', compact = false }) {
  useEffect(() => {
    return subscribeColorSchemeStorage()
  }, [])

  return (
    <button
      type="button"
      onClick={() => toggleColorScheme()}
      className={`${
        compact
          ? 'inline-flex min-h-9 w-auto items-center gap-2 rounded-[6px] border border-rule bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted shadow-[0_1px_2px_rgb(20_23_29/0.04)] transition-colors hover:border-input-border hover:bg-surface-subtle hover:text-ink'
          : 'flex min-h-10 w-full items-center gap-2.5 rounded-[5px] px-3 py-2 text-start text-sm font-medium text-ink-muted transition-colors hover:bg-surface hover:text-ink'
      } ${className}`}
    >
      <span
        className={`scheme-toggle-when-dark items-center ${compact ? 'gap-1.5' : 'gap-2.5'}`}
      >
        <SunIcon className={compact ? 'size-3.5 shrink-0' : 'size-4 shrink-0'} />
        <span aria-hidden="true">Light mode</span>
        <span className="visually-hidden">Switch to light theme</span>
      </span>
      <span
        className={`scheme-toggle-when-light items-center ${compact ? 'gap-1.5' : 'gap-2.5'}`}
      >
        <MoonIcon className={compact ? 'size-3.5 shrink-0' : 'size-4 shrink-0'} />
        <span aria-hidden="true">Dark mode</span>
        <span className="visually-hidden">Switch to dark theme</span>
      </span>
    </button>
  )
}
