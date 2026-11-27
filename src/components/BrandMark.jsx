export function BrandMark({ showSubtitle = false, tone = 'default' }) {
  const onAccent = tone === 'onAccent'
  return (
    <div className="flex min-w-0 items-center gap-3">
      <svg
        aria-hidden="true"
        viewBox="0 0 32 32"
        className={`size-8 shrink-0 rounded-[5px]${onAccent ? ' ring-1 ring-on-accent/40' : ''}`}
        fill="none"
      >
        <rect
          width="32"
          height="32"
          rx="5"
          fill="var(--color-accent-solid)"
        />
        <path
          d="M9 10.5H23M9 16H19M9 21.5H15"
          stroke="var(--color-on-accent)"
          strokeWidth="2.25"
          strokeLinecap="square"
        />
      </svg>
      <div className="min-w-0">
        <p
          className={`truncate py-0.5 text-[0.9375rem] font-semibold leading-snug tracking-[-0.01em] ${onAccent ? 'text-on-accent' : 'text-ink'}`}
        >
          My SIP Portal
        </p>
        {showSubtitle ? (
          <p
            className={`truncate text-xs leading-snug ${onAccent ? 'text-on-accent/70' : 'text-ink-muted'}`}
          >
            Student Internship Program
          </p>
        ) : null}
      </div>
    </div>
  )
}
