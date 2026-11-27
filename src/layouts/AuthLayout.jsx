import { Outlet } from 'react-router-dom'
import { BrandMark } from '../components/BrandMark'
import { ThemeToggleButton } from '../components/ThemeToggleButton'

const PROGRAM_STEPS = [
  { number: '01', text: 'Log your attendance and accomplishments' },
  { number: '02', text: 'Your supervisor reviews and approves' },
  { number: '03', text: 'The coordinator monitors your rendered hours' },
]

export function AuthLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-surface lg:grid lg:grid-cols-[22rem_1fr]">
      <header className="auth-panel relative flex flex-col justify-between gap-6 overflow-hidden border-b border-accent-solid bg-accent-solid px-6 pt-[max(1.25rem,env(safe-area-inset-top,0px))] pb-5 text-on-accent lg:border-b-0 lg:border-e lg:px-8 lg:py-10">
        <svg
          aria-hidden="true"
          viewBox="0 0 32 32"
          fill="none"
          className="pointer-events-none absolute -bottom-6 -right-4 h-44 w-44 text-on-accent/10 lg:-bottom-14 lg:-right-8 lg:h-96 lg:w-96"
        >
          <path
            d="M9 10.5H23M9 16H19M9 21.5H15"
            stroke="currentColor"
            strokeWidth="2.25"
            strokeLinecap="square"
          />
        </svg>

        <div className="auth-panel-fade relative flex items-start justify-between gap-6 lg:block">
          <div className="min-w-0 space-y-10">
            <div className="space-y-6">
              <BrandMark showSubtitle tone="onAccent" />
              <p className="hidden max-w-[28ch] text-sm leading-[1.6] text-on-accent/75 lg:block">
                Academic internship placement, daily task logging, supervisor
                review, and program coordination portal.
              </p>
            </div>

            <ol className="hidden max-w-[19rem] divide-y divide-on-accent/15 lg:block">
              {PROGRAM_STEPS.map((step) => (
                <li key={step.number} className="flex gap-4 py-3.5 first:pt-0 last:pb-0">
                  <span className="text-sm font-medium leading-[1.55] text-on-accent/55">
                    {step.number}
                  </span>
                  <span className="text-sm leading-[1.55] text-on-accent/90">
                    {step.text}
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="shrink-0 lg:hidden">
            <ThemeToggleButton />
          </div>
        </div>

        <div className="auth-panel-fade relative hidden lg:block">
          <div className="-mx-3 border-t border-on-accent/20 pt-4">
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
