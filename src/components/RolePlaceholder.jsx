import { Link } from 'react-router-dom'
import { NavIcon } from './Icons'

export function RolePlaceholder({ role, summary, route, quickLinks = [] }) {
  return (
    <div className="max-w-5xl space-y-6">
      <header>
        <h1
          id="main-content"
          tabIndex={-1}
          className="ledger-title text-[clamp(1.5rem,1.25rem+0.75vw,1.875rem)] font-semibold leading-[1.2] tracking-[-0.02em] text-ink outline-none"
        >
          {role} Dashboard
        </h1>
        <p className="mt-2 max-w-[64ch] text-[0.9375rem] leading-[1.6] text-ink-muted">
          {summary}
        </p>
      </header>

      <section
        aria-label="Workspace overview"
        className="overflow-hidden rounded-[6px] border border-rule bg-surface"
      >
        <div className="border-b border-rule bg-surface-subtle px-5 py-3.5">
          <h2 className="text-sm font-semibold text-ink">Workspace details</h2>
        </div>
        <dl className="divide-y divide-rule">
          <div className="grid grid-cols-1 gap-1 px-5 py-3.5 sm:grid-cols-[12rem_1fr] sm:gap-4">
            <dt className="text-sm font-medium text-ink-muted">
              Assigned role
            </dt>
            <dd className="text-sm font-medium text-ink">{role}</dd>
          </div>
          <div className="grid grid-cols-1 gap-1 px-5 py-3.5 sm:grid-cols-[12rem_1fr] sm:gap-4">
            <dt className="text-sm font-medium text-ink-muted">Route path</dt>
            <dd className="text-sm tabular-nums text-ink">{route}</dd>
          </div>
          <div className="grid grid-cols-1 gap-1 px-5 py-3.5 sm:grid-cols-[12rem_1fr] sm:gap-4">
            <dt className="text-sm font-medium text-ink-muted">
              Workspace status
            </dt>
            <dd className="text-sm text-ink-muted">
              Active role workspace ready for internship modules
            </dd>
          </div>
        </dl>
      </section>

      {quickLinks.length > 0 ? (
        <section aria-labelledby="workspace-modules-heading">
          <h2
            id="workspace-modules-heading"
            className="mb-3 text-sm font-semibold text-ink"
          >
            Available modules
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {quickLinks.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="group flex items-start gap-3.5 rounded-[6px] border border-rule bg-surface px-5 py-4 transition-colors hover:border-accent/50 hover:bg-surface-subtle"
              >
                <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-[5px] border border-rule bg-surface-subtle text-ink-muted transition-colors group-hover:border-accent/35 group-hover:bg-accent-tint group-hover:text-accent">
                  <NavIcon name={item.icon} className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink group-hover:text-accent">
                    {item.title}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                    {item.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  )
}
