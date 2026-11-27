let cachedSupportsDisplayTransition

/**
 * Probes whether the browser genuinely animates discrete display transitions
 * (guards against Firefox parsing transition-behavior without transitioning display).
 */
export function canTransitionDisplay() {
  if (cachedSupportsDisplayTransition !== undefined) {
    return cachedSupportsDisplayTransition
  }
  if (
    typeof window === 'undefined' ||
    !window.CSS?.supports?.('transition-behavior', 'allow-discrete') ||
    !document.body
  ) {
    return false
  }

  const probe = document.createElement('div')
  probe.style.cssText =
    'transition: display 1s allow-discrete !important; display: block;'
  document.body.appendChild(probe)
  void window.getComputedStyle(probe).display
  probe.style.display = 'none'
  cachedSupportsDisplayTransition =
    window.getComputedStyle(probe).display === 'block'
  probe.remove()
  return cachedSupportsDisplayTransition
}

/**
 * Evaluates lazily whether native top-layer exit transitions (overlay + discrete display) work.
 */
export function supportsTopLayerExit() {
  return Boolean(
    typeof window !== 'undefined' &&
      window.CSS?.supports?.('overlay', 'auto') &&
      canTransitionDisplay(),
  )
}

/**
 * Closes a modal <dialog> cleanly, playing the CSS exit transition via data-closing
 * before calling .close() in browsers that lack native overlay/display exit support.
 *
 * @param {HTMLDialogElement | null} dialog
 */
export async function closeModalDialogAnimated(dialog) {
  if (!dialog || !dialog.open) return

  if (!supportsTopLayerExit()) {
    if (dialog.hasAttribute('data-closing')) return
    dialog.setAttribute('data-closing', '')
    const animations = dialog.getAnimations({ subtree: true })
    if (animations.length > 0) {
      await Promise.race([
        Promise.allSettled(animations.map((animation) => animation.finished)),
        new Promise((resolve) => window.setTimeout(resolve, 600)),
      ])
    }
    if (!dialog.hasAttribute('data-closing')) return
    dialog.removeAttribute('data-closing')
  }

  if (dialog.open) {
    dialog.close()
  }
}

/**
 * Returns true if the browser natively supports <dialog closedby="any">.
 */
export function supportsDialogClosedBy() {
  return (
    typeof window !== 'undefined' &&
    typeof window.HTMLDialogElement !== 'undefined' &&
    'closedBy' in window.HTMLDialogElement.prototype
  )
}

/**
 * Checks whether a pointer coordinate landed outside the dialog's visible border box.
 * Used with pointerdown + pointerup fallback so text selection drags ending on the
 * backdrop never dismiss the dialog accidentally.
 *
 * @param {PointerEvent | MouseEvent} event
 * @param {HTMLDialogElement} dialog
 * @returns {boolean}
 */
export function isPointerOutsideDialog(event, dialog) {
  const rect = dialog.getBoundingClientRect()
  return (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  )
}
