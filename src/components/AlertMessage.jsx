export function AlertMessage({ message, variant = 'error' }) {
  const isSuccess = variant === 'success'
  const role = isSuccess ? 'status' : 'alert'

  return (
    <div
      role={role}
      aria-live={isSuccess ? 'polite' : 'assertive'}
      aria-atomic="true"
      className={
        message
          ? `flex items-start gap-2.5 rounded-[5px] border px-3.5 py-3 text-sm ${
              isSuccess
                ? 'border-accent/40 bg-accent-tint text-accent'
                : 'border-error-border/60 bg-error-tint text-error'
            }`
          : 'visually-hidden'
      }
    >
      {message ? (
        <>
          {isSuccess ? (
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className="mt-0.5 size-4 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
            >
              <circle cx="10" cy="10" r="8" />
              <path d="M6.75 10.25 9 12.5l4.25-4.75" strokeLinecap="square" />
            </svg>
          ) : (
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className="mt-0.5 size-4 shrink-0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
            >
              <circle cx="10" cy="10" r="8" />
              <path d="M10 6v4.5M10 13.75h.01" strokeLinecap="square" />
            </svg>
          )}
          <span>{message}</span>
        </>
      ) : null}
    </div>
  )
}
