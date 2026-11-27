import { Outlet } from 'react-router-dom'
import { BrandMark } from '../components/BrandMark'
import { ThemeToggleButton } from '../components/ThemeToggleButton'

export function AuthLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface lg:grid lg:grid-cols-[22rem_1fr]">
      <header className="flex flex-col justify-between gap-6 border-b border-rule bg-canvas px-6 pt-[max(1.25rem,env(safe-area-inset-top,0px))] pb-5 lg:border-b-0 lg:border-e lg:px-8 lg:py-10">
        <div className="flex items-start justify-between gap-6 lg:block">
          <div className="min-w-0 space-y-6">
            <BrandMark showSubtitle />
            <p className="hidden max-w-[28ch] text-sm leading-[1.6] text-ink-muted lg:block">
              Academic internship placement, daily task logging, supervisor
              review, and program coordination portal.
            </p>
          </div>
          <div className="shrink-0 lg:hidden">
            <ThemeToggleButton />
          </div>
        </div>
        <div className="hidden lg:block">
          <div className="-mx-3 border-t border-rule pt-4">
            <ThemeToggleButton />
          </div>
        </div>
      </header>

      <main className="flex min-w-0 flex-1 items-start justify-center px-6 py-10 sm:px-12 lg:items-center lg:px-20">
        <div className="w-full max-w-[25rem]">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
