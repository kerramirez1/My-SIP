export function BrandMark({ showSubtitle = false, inverted = false }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <svg
        aria-hidden="true"
        viewBox="0 0 32 32"
        className="size-8.5 shrink-0 rounded-[6px]"
        fill="none"
      >
        <rect
          width="32"
          height="32"
          rx="6"
          fill={
            inverted ? 'rgb(255 255 255 / 0.14)' : 'var(--color-accent-solid)'
          }
        />
        {inverted ? (
          <rect
            x="0.5"
            y="0.5"
            width="31"
            height="31"
            rx="5.5"
            stroke="rgb(255 255 255 / 0.24)"
          />
        ) : null}
        <path
          d="M9 10.5H23M9 16H19M9 21.5H15"
          stroke={inverted ? '#FFFFFF' : 'var(--color-on-accent)'}
          strokeWidth="2.25"
          strokeLinecap="square"
        />
      </svg>
      <div className="min-w-0">
        <p
          className={`truncate py-0.5 text-[0.9375rem] font-semibold leading-snug tracking-[-0.01em] ${
            inverted ? 'text-white' : 'text-ink'
          }`}
        >
          My SIP Portal
        </p>
        {showSubtitle ? (
          <p
            className={`truncate text-xs leading-snug ${
              inverted ? 'text-white/75' : 'text-ink-muted'
            }`}
          >
            Student Internship Program
          </p>
        ) : null}
      </div>
    </div>
  )
}
