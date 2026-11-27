const STATUS_META = {
  pending: {
    label: 'Pending',
    className: 'border-rule bg-surface-subtle text-ink-muted',
    icon: (
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="size-3.5 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <circle cx="8" cy="8" r="5.5" />
        <path d="M8 5.25V8l2 1.25" strokeLinecap="square" />
      </svg>
    ),
  },
  approved: {
    label: 'Approved',
    className: 'border-success-border/45 bg-success-tint text-success',
    icon: (
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="size-3.5 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      >
        <path d="M3.5 8.5 6.5 11.5 12.5 5" strokeLinecap="square" />
      </svg>
    ),
  },
  returned: {
    label: 'Returned',
    className: 'border-error-border/50 bg-error-tint text-error',
    icon: (
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="size-3.5 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path d="M5 6.5 2.5 9 5 11.5" strokeLinecap="square" />
        <path d="M3 9h7.5a3 3 0 0 0 0-6H8" strokeLinecap="square" />
      </svg>
    ),
  },
  rejected: {
    label: 'Rejected',
    className: 'border-rejected-border bg-rejected-bg text-on-accent',
    icon: (
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="size-3.5 shrink-0"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.65"
      >
        <circle cx="8" cy="8" r="5.5" />
        <path d="M5.75 5.75 10.25 10.25M10.25 5.75 5.75 10.25" strokeLinecap="square" />
      </svg>
    ),
  },
}

export function StatusBadge({ status }) {
  const meta = STATUS_META[status] ?? STATUS_META.pending

  return (
    <span
      className={`status-badge inline-flex items-center gap-1.5 rounded-[5px] border px-2.5 py-1 text-xs font-medium leading-snug whitespace-nowrap ${meta.className}`}
    >
      {meta.icon}
      <span>{meta.label}</span>
    </span>
  )
}
