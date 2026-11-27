export function NavIcon({ name, className = 'size-4 shrink-0' }) {
  switch (name) {
    case 'attendance':
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={className}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.65"
        >
          <rect x="3.5" y="4.5" width="13" height="12" />
          <path
            d="M6.75 2.75v2.5M13.25 2.75v2.5M3.5 8h13M10 10.25v2.5l1.75 1"
            strokeLinecap="square"
          />
        </svg>
      )
    case 'accomplishments':
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={className}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.65"
        >
          <path d="M5 3.5h10v13H5z" />
          <path d="M7.75 7.5h4.5M7.75 10.5h4.5M7.75 13.5h2.75" strokeLinecap="square" />
        </svg>
      )
    case 'tasks':
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={className}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.65"
        >
          <path d="M4.25 6.5 5.75 8l2.5-2.75" strokeLinecap="square" />
          <path d="M10.25 6.75h5.5M4.25 13.25l1.5 1.5 2.5-2.75M10.25 13.5h5.5" strokeLinecap="square" />
        </svg>
      )
    case 'interns':
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={className}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.65"
        >
          <circle cx="7.75" cy="6.75" r="2.5" />
          <path
            d="M3.25 16.25c0-2.5 2-4.25 4.5-4.25s4.5 1.75 4.5 4.25"
            strokeLinecap="square"
          />
          <path
            d="M13.25 4.75a2.25 2.25 0 0 1 0 4.5M14.25 12.25c1.85.4 3 1.75 3 4"
            strokeLinecap="square"
          />
        </svg>
      )
    case 'history':
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={className}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.65"
        >
          <path d="M4.75 5.25v3h3" strokeLinecap="square" />
          <path
            d="M4.95 8.1A5.75 5.75 0 1 1 6.1 13.7"
            strokeLinecap="square"
          />
          <path d="M10.5 7v3.25l2.25 1.5" strokeLinecap="square" />
        </svg>
      )
    case 'monitoring':
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={className}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.65"
        >
          <path
            d="M3.5 16h13M5.75 16v-4.5M10 16V7.5M14.25 16V4.5"
            strokeLinecap="square"
          />
        </svg>
      )
    case 'profile':
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={className}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.65"
        >
          <circle cx="10" cy="6.75" r="2.75" />
          <path
            d="M4.25 16.25c0-2.75 2.5-4.5 5.75-4.5s5.75 1.75 5.75 4.5"
            strokeLinecap="square"
          />
        </svg>
      )
    case 'dashboard':
    default:
      return (
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          className={className}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.65"
        >
          <rect x="3.5" y="3.5" width="5.5" height="5.5" />
          <rect x="11" y="3.5" width="5.5" height="5.5" />
          <rect x="3.5" y="11" width="5.5" height="5.5" />
          <rect x="11" y="11" width="5.5" height="5.5" />
        </svg>
      )
  }
}

export function PlusIcon({ className = 'size-4 shrink-0' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
    >
      <path d="M10 4.5v11M4.5 10h11" strokeLinecap="square" />
    </svg>
  )
}

export function EditIcon({ className = 'size-3.5 shrink-0' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
    >
      <path d="M13.5 4.25 15.75 6.5 7 15.25H4.75V13L13.5 4.25Z" />
    </svg>
  )
}

export function PaperclipIcon({ className = 'size-3.5 shrink-0' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
    >
      <path
        d="M14.25 8.5 8.5 14.25a2.5 2.5 0 0 1-3.54-3.54l6.36-6.36a1.75 1.75 0 0 1 2.48 2.48l-6.01 6a.95.95 0 0 1-1.34-1.35l5.3-5.3"
        strokeLinecap="square"
      />
    </svg>
  )
}

export function ChevronLeftIcon({ className = 'size-4 shrink-0' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
    >
      <path d="M12.25 5.25 7.5 10l4.75 4.75" strokeLinecap="square" />
    </svg>
  )
}

export function ChevronRightIcon({ className = 'size-4 shrink-0' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
    >
      <path d="M7.75 5.25 12.5 10l-4.75 4.75" strokeLinecap="square" />
    </svg>
  )
}

export function CloseIcon({ className = 'size-4 shrink-0' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
    >
      <path d="M5 5l10 10M15 5 5 15" strokeLinecap="square" />
    </svg>
  )
}

export function MenuIcon({ className = 'size-4 shrink-0' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
    >
      <path d="M3 5.5h14M3 10h14M3 14.5h14" strokeLinecap="square" />
    </svg>
  )
}

export function SunIcon({ className = 'size-4 shrink-0' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
    >
      <circle cx="10" cy="10" r="3.25" />
      <path
        d="M10 3v1.5M10 15.5V17M3 10h1.5M15.5 10H17M5.05 5.05l1.06 1.06M13.89 13.89l1.06 1.06M14.95 5.05l-1.06 1.06M6.11 13.89l-1.06 1.06"
        strokeLinecap="square"
      />
    </svg>
  )
}

export function MoonIcon({ className = 'size-4 shrink-0' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
    >
      <path d="M15.75 12.25A6 6 0 0 1 7.75 4.25a6.25 6.25 0 1 0 8 8Z" />
    </svg>
  )
}

export function LogoutIcon({ className = 'size-4 shrink-0' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
    >
      <path d="M8.5 3.75H4.75v12.5H8.5" strokeLinecap="square" />
      <path d="M12.25 6.5 15.75 10l-3.5 3.5M15.25 10H8" strokeLinecap="square" />
    </svg>
  )
}
