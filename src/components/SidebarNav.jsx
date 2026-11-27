import { NavLink } from 'react-router-dom'
import { ROLE_CONFIG } from '../lib/roleRoutes'
import { LogoutIcon, NavIcon } from './Icons'
import { ThemeToggleButton } from './ThemeToggleButton'

export function SidebarNav({ role, onNavigate, onLogout, loggingOut = false }) {
  const roleLinks = ROLE_CONFIG[role]?.navItems ?? []
  const workspaceLinks = roleLinks.filter((item) => item.group !== 'account')
  const accountLinks = roleLinks.filter((item) => item.group === 'account')

  return (
    <nav
      aria-label="Primary"
      className="flex flex-1 flex-col justify-between px-3 py-5"
    >
      <div className="space-y-5">
        <div>
          <p className="px-3 pb-2 text-xs font-medium text-ink-muted">
            Workspace
          </p>
          <ul className="space-y-1">
            {workspaceLinks.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className="nav-link flex min-h-10 items-center gap-2.5 border-s-[3px] border-transparent px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface hover:text-ink"
                >
                  <NavIcon name={item.icon} className="size-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>

        {accountLinks.length > 0 ? (
          <div>
            <p className="px-3 pb-2 text-xs font-medium text-ink-muted">
              Account
            </p>
            <ul className="space-y-1">
              {accountLinks.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className="nav-link flex min-h-10 items-center gap-2.5 border-s-[3px] border-transparent px-3 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface hover:text-ink"
                  >
                    <NavIcon name={item.icon} className="size-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="space-y-1 border-t border-rule pt-4">
        <ThemeToggleButton />
        <button
          type="button"
          disabled={loggingOut}
          onClick={onLogout}
          className="flex min-h-10 w-full items-center gap-2.5 rounded-[5px] px-3 py-2 text-start text-sm font-medium text-ink-muted transition-colors hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
        >
          <LogoutIcon className="size-4 shrink-0" />
          <span>{loggingOut ? 'Logging out…' : 'Log out'}</span>
        </button>
      </div>
    </nav>
  )
}
