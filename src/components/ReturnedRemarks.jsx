export function ReturnedRemarks({ remarks }) {
  return (
    <div className="mt-2.5 rounded-e-[4px] border-s-2 border-error-border bg-error-tint px-3 py-2 text-xs leading-[1.5]">
      <p className="font-semibold text-error">Reviewer remarks</p>
      <p className="mt-0.5 text-ink">
        {remarks?.trim() ? remarks : 'Returned for revision.'}
      </p>
    </div>
  )
}
