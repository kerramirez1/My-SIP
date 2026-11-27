import { useEffect } from 'react'

function linkError(el, shown) {
  const errorId = el.dataset.error
  if (!errorId) return
  const ids = (el.getAttribute('aria-describedby') || '')
    .split(/\s+/)
    .filter((id) => id && id !== errorId)
  if (shown) ids.push(errorId)
  if (ids.length) el.setAttribute('aria-describedby', ids.join(' '))
  else el.removeAttribute('aria-describedby')
}

function spokenText(node) {
  const copy = node.cloneNode(true)
  copy.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove())
  copy.querySelectorAll('[role="img"][aria-label]').forEach((n) => {
    n.replaceWith(`${n.getAttribute('aria-label')}: `)
  })
  return copy.textContent.replace(/\s+/g, ' ').trim()
}

function getSharedAnnouncer() {
  let announcer = document.getElementById('form-validation-announcer')
  if (!announcer) {
    announcer = document.createElement('div')
    announcer.id = 'form-validation-announcer'
    announcer.setAttribute('aria-live', 'polite')
    announcer.className = 'visually-hidden'
    document.body.append(announcer)
  }
  return announcer
}

/**
 * Synchronizes native :user-invalid validation state with aria-invalid,
 * dynamic aria-describedby error linking, centralized polite live announcements,
 * and :user-invalid / :has() progressive-enhancement fallbacks.
 *
 * @param {React.RefObject<HTMLFormElement | null>} formRef
 */
export function useFormValidationSync(formRef) {
  useEffect(() => {
    const form = formRef.current
    if (!form || typeof window === 'undefined') return undefined

    const supportsUserInvalid = Boolean(
      window.CSS?.supports?.('selector(:user-invalid)'),
    )
    const supportsHas = Boolean(window.CSS?.supports?.('selector(:has(a))'))

    const announcer = getSharedAnnouncer()
    const flagged = new WeakSet()
    const announced = new WeakSet()
    const dirtyState = new WeakMap()
    let announceTimer = null
    let announcedField = null

    function announceError(el) {
      const errorId = el.dataset.error
      if (!errorId) return
      const errorEl = document.getElementById(errorId)
      if (!errorEl) return
      const label = el.labels?.[0] ? `${spokenText(el.labels[0])}: ` : ''
      clearTimeout(announceTimer)
      announcer.textContent = ''
      announcedField = el
      announceTimer = window.setTimeout(() => {
        announcer.textContent = label + spokenText(errorEl)
      }, 500)
    }

    function syncParentFallback(el) {
      if (supportsHas) return
      const group = el.closest('.field-group')
      if (!group) return
      const hasInvalid = Boolean(
        group.querySelector(
          supportsUserInvalid
            ? ':is(:user-invalid, .user-invalid-fallback)'
            : '.user-invalid-fallback',
        ),
      )
      group.classList.toggle('has-error-fallback', hasInvalid)
    }

    function isFieldUserInvalid(el) {
      if (supportsUserInvalid) {
        return el.matches(':user-invalid')
      }
      return el.classList.contains('user-invalid-fallback')
    }

    function syncAria(el, announce = false) {
      if (!el?.matches?.('input, select, textarea')) return
      const invalid = isFieldUserInvalid(el)

      if (invalid) {
        if (announce && !announced.has(el)) {
          announceError(el)
          announced.add(el)
        }
        el.setAttribute('aria-invalid', 'true')
        linkError(el, true)
        flagged.add(el)
      } else if (flagged.has(el) || el.getAttribute('aria-invalid') !== 'true') {
        el.setAttribute('aria-invalid', 'false')
        linkError(el, false)
        flagged.delete(el)
        announced.delete(el)
        if (announcedField === el) {
          clearTimeout(announceTimer)
          announcer.textContent = ''
        }
      }

      syncParentFallback(el)
    }

    function updateFallbackValidity(el) {
      if (supportsUserInvalid || !el?.validity) return
      const valid = el.validity.valid
      el.classList.toggle('user-invalid-fallback', !valid)
      el.classList.toggle('user-valid-fallback', valid)
    }

    form
      .querySelectorAll('input, select, textarea')
      .forEach((el) => syncAria(el))

    function onBlur(event) {
      const target = event.target
      if (!target?.matches?.('input, select, textarea')) return
      if (!supportsUserInvalid) {
        const state = dirtyState.get(target) || {
          hasInteracted: false,
          hasBlurred: false,
        }
        state.hasBlurred = true
        dirtyState.set(target, state)
        if (state.hasInteracted) updateFallbackValidity(target)
      }
      syncAria(target, true)
    }

    function onInput(event) {
      const target = event.target
      if (!target?.matches?.('input, select, textarea')) return
      if (!supportsUserInvalid) {
        const state = dirtyState.get(target) || {
          hasInteracted: false,
          hasBlurred: false,
        }
        state.hasInteracted = true
        dirtyState.set(target, state)
        if (state.hasBlurred) updateFallbackValidity(target)
      }
      if (target.hasAttribute('aria-invalid')) syncAria(target)
    }

    function onChange(event) {
      const target = event.target
      if (!target?.matches?.('input, select, textarea')) return
      if (!supportsUserInvalid) {
        const state = dirtyState.get(target) || {
          hasInteracted: false,
          hasBlurred: false,
        }
        state.hasInteracted = true
        dirtyState.set(target, state)
        if (state.hasBlurred) updateFallbackValidity(target)
      }
      syncAria(target, true)
    }

    function onInvalid(event) {
      const target = event.target
      if (!target?.matches?.('input, select, textarea')) return
      if (!supportsUserInvalid) {
        dirtyState.set(target, { hasInteracted: true, hasBlurred: true })
        updateFallbackValidity(target)
      }
      announced.add(target)
      syncAria(target)
    }

    function onReset() {
      window.setTimeout(() => {
        form.querySelectorAll('input, select, textarea').forEach((el) => {
          dirtyState.delete(el)
          el.classList.remove('user-invalid-fallback', 'user-valid-fallback')
          syncAria(el)
        })
      })
    }

    form.addEventListener('blur', onBlur, true)
    form.addEventListener('input', onInput)
    form.addEventListener('change', onChange, true)
    form.addEventListener('invalid', onInvalid, true)
    form.addEventListener('reset', onReset, true)

    return () => {
      clearTimeout(announceTimer)
      form.removeEventListener('blur', onBlur, true)
      form.removeEventListener('input', onInput)
      form.removeEventListener('change', onChange, true)
      form.removeEventListener('invalid', onInvalid, true)
      form.removeEventListener('reset', onReset, true)
    }
  }, [formRef])
}
