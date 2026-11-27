import { useEffect } from 'react'

/**
 * Keeps the browser document title synchronized with the active route.
 * @param {string} title - Page-specific title prefix.
 */
export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} | My SIP Portal` : 'My SIP Portal'
  }, [title])
}
