import { Outlet } from 'react-router-dom'
import { BrandMark } from '../components/BrandMark'
import { ThemeToggleButton } from '../components/ThemeToggleButton'

export function AuthLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface lg:grid lg:grid-cols-[22rem_1fr]">
      <header className="flex flex-col justify-between gap-6 border-b border-rule bg-canvas px-6 pt-[max(1.25rem,env(safe-area-inset-top,0px))] pb-5 lg:border-b-0 lg:border-e lg:px-8 lg:py-10">
        <BrandMark showSubtitle />
        <div className="hidden space-y-6 lg:block">
          <p className="max-w-[28ch] text-sm leading-[1.6] text-ink-muted">
            Academic internship placement, daily task logging, supervisor
            review, and program coordination portal.
          </p>
          <div className="-mx-3 border-t border-rule pt-4">
            <ThemeToggleButton />
          </div>
        </div>
      </header>

      <main className="flex min-w-0 flex-1 items-start px-6 py-10 sm:px-12 lg:items-center lg:px-20">
        <div className="w-full max-w-[25rem] rounded-[6px] border border-rule bg-surface p-7 sm:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
