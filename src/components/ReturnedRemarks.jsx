export function ReturnedRemarks({ remarks, status = 'returned' }) {
  const defaultMessage =
    status === 'rejected'
      ? 'Rejected — please review and resubmit.'
      : 'Returned for revision.'

  return (
    <div className="mt-2.5 rounded-e-[4px] border-s-2 border-error-border bg-error-tint px-3 py-2 text-xs leading-[1.5]">
      <p className="font-semibold text-error">Reviewer remarks</p>
      <p className="mt-0.5 text-ink">
        {remarks?.trim() ? remarks : defaultMessage}
      </p>
    </div>
  )
}
