import { useCallback, useEffect, useId, useRef } from 'react'
import {
  closeModalDialogAnimated,
  isPointerOutsideDialog,
  supportsDialogClosedBy,
} from '../lib/topLayerDialog'
import { CloseIcon } from './Icons'

export function SubmissionDialog({
  open,
  title,
  description,
  onClose,
  children,
}) {
  const dialogRef = useRef(null)
  const titleId = useId()
  const descId = useId()

  const requestClose = useCallback(() => {
    const dialog = dialogRef.current
    if (!dialog || !dialog.open) return
    void closeModalDialogAnimated(dialog)
  }, [])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (open) {
      if (!dialog.open) {
        dialog.removeAttribute('data-closing')
        dialog.showModal()
      }
    } else if (dialog.open) {
      void closeModalDialogAnimated(dialog)
    }
  }, [open])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return undefined

    let pressedOutside = false

    function handleClose() {
      dialog.removeAttribute('data-closing')
      dialog.returnValue = ''
      onClose?.()
    }

    function handleCancel(event) {
      if (event.cancelable) {
        event.preventDefault()
        requestClose()
      }
    }

    function handlePointerDown(event) {
      if (!supportsDialogClosedBy()) {
        pressedOutside = isPointerOutsideDialog(event, dialog)
      }
    }

    function handlePointerUp(event) {
      if (
        !supportsDialogClosedBy() &&
        pressedOutside &&
        isPointerOutsideDialog(event, dialog)
      ) {
        pressedOutside = false
        requestClose()
      } else {
        pressedOutside = false
      }
    }

    dialog.addEventListener('close', handleClose)
    dialog.addEventListener('cancel', handleCancel)
    dialog.addEventListener('pointerdown', handlePointerDown)
    dialog.addEventListener('pointerup', handlePointerUp)

    return () => {
      dialog.removeEventListener('close', handleClose)
      dialog.removeEventListener('cancel', handleCancel)
      dialog.removeEventListener('pointerdown', handlePointerDown)
      dialog.removeEventListener('pointerup', handlePointerUp)
    }
  }, [onClose, requestClose])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
      {...{ closedby: 'any' }}
      className="form-dialog"
    >
      <div className="flex items-start justify-between gap-4 border-b border-rule px-6 py-5">
        <div className="min-w-0">
          <h1
            id={titleId}
            className="text-lg font-semibold leading-snug tracking-[-0.015em] text-ink"
          >
            {title}
          </h1>
          {description ? (
            <p id={descId} className="mt-1 text-sm text-ink-muted">
              {description}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={requestClose}
          aria-label="Close dialog"
          className="inline-flex min-h-9 min-w-9 shrink-0 items-center justify-center rounded-[5px] border border-rule bg-surface text-ink-muted hover:bg-surface-subtle hover:text-ink"
        >
          <CloseIcon className="size-4" />
        </button>
      </div>

      <div className="px-6 py-5">{children}</div>
    </dialog>
  )
}
