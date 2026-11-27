import { getUserInitials } from '../lib/roleRoutes'
import { Breadcrumbs } from './Breadcrumbs'
import { MenuIcon } from './Icons'

export function Topbar({
  breadcrumbs,
  userName,
  userRole,
  isMenuOpen,
  onOpenMenu,
}) {
  const displayName = userName || 'Signed-in user'
  const initials = getUserInitials(displayName)

  return (
    <div className="topbar-sticky-wrap shrink-0">
      <header className="topbar-shell flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onOpenMenu}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-nav-drawer"
            className="inline-flex min-h-10 items-center gap-2 rounded-[5px] border border-rule bg-surface px-3 text-sm font-medium text-ink hover:bg-surface-subtle md:hidden"
          >
            <MenuIcon className="size-4 shrink-0" />
            <span>Menu</span>
          </button>

          <Breadcrumbs items={breadcrumbs} />
        </div>

        <div className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden="true"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-[5px] border border-accent/25 bg-accent-tint text-xs font-semibold text-accent"
          >
            {initials}
          </span>
          <div className="flex min-w-0 flex-col leading-tight sm:flex-row sm:items-center sm:gap-2">
            <span className="truncate text-sm font-medium text-ink">
              {displayName}
            </span>
            {userRole ? (
              <span className="shrink-0 rounded-[4px] border border-rule bg-surface-subtle px-1.5 py-0.5 text-[0.6875rem] font-medium leading-none text-ink-muted">
                {userRole}
              </span>
            ) : null}
          </div>
        </div>
      </header>
    </div>
  )
}
