import { Outlet } from 'react-router-dom'
import { BrandMark } from '../components/BrandMark'
import { ThemeToggleButton } from '../components/ThemeToggleButton'

const PORTAL_ROLES = [
  {
    role: 'Student Interns',
    summary:
      'Log weekly attendance, record accomplishments, and submit assigned tasks.',
  },
  {
    role: 'Host Supervisors',
    summary:
      'Verify rendered hours, assign deliverables, and review intern submissions.',
  },
  {
    role: 'SIP Coordinators',
    summary:
      'Monitor cohort progress, audit program records, and manage portal accounts.',
  },
]

export function AuthLayout() {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas lg:grid lg:grid-cols-[minmax(25rem,44%)_1fr]">
      <aside
        aria-label="About My SIP Portal"
        className="auth-brand-panel hidden lg:flex lg:flex-col lg:justify-between lg:px-10 lg:py-10 xl:px-14 xl:py-12"
      >
        <BrandMark showSubtitle inverted />

        <div className="my-auto max-w-[28rem] space-y-8 py-10">
          <div className="space-y-3.5">
            <h2 className="text-[clamp(1.75rem,1.25rem+1.1vw,2.25rem)] font-semibold leading-[1.15] tracking-[-0.025em] text-white">
              Academic internship management, unified.
            </h2>
            <p className="text-sm leading-[1.65] text-white/75">
              One institutional workspace connecting students, host organization
              supervisors, and university coordinators from placement to
              completion.
            </p>
          </div>

          <dl className="divide-y divide-white/12 border-y border-white/12">
            {PORTAL_ROLES.map((item) => (
              <div key={item.role} className="py-3.5">
                <dt className="text-sm font-medium text-white">{item.role}</dt>
                <dd className="mt-1 text-xs leading-[1.55] text-white/70">
                  {item.summary}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="flex items-center justify-between gap-4 text-xs text-white/60">
          <span>Student Internship Program</span>
          <span>Role-based institutional access</span>
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 px-5 pt-[max(1rem,env(safe-area-inset-top,0px))] pb-3 sm:px-8 lg:justify-end lg:py-6">
          <div className="min-w-0 lg:hidden">
            <BrandMark showSubtitle />
          </div>
          <div className="shrink-0">
            <ThemeToggleButton compact />
          </div>
        </header>

        <main className="flex flex-1 items-start justify-center px-5 pt-4 pb-10 sm:px-8 lg:items-center lg:px-14 lg:pb-16">
          <div className="auth-card w-full max-w-[26.5rem] rounded-[12px] border border-rule bg-surface p-6 sm:p-8 lg:p-9">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
