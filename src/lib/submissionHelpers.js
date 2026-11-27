/**
 * Sanitizes a user-selected filename into a safe single-segment file name
 * prefixed with a UUID so it always uploads cleanly inside <intern_id>/<filename>.
 * @param {string} originalName
 * @returns {string}
 */
export function buildAttachmentFileName(originalName) {
  const cleaned = String(originalName ?? 'attachment')
    .replace(/[/\\]/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')

  const safeBase = cleaned || 'attachment'
  const uniquePrefix =
    typeof globalThis.crypto?.randomUUID === 'function'
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  return `${uniquePrefix}-${safeBase}`
}

/**
 * Extracts a readable filename from a stored attachment path (<intern_id>/<uuid>-<name>).
 * @param {string | null | undefined} objectPath
 * @returns {string}
 */
export function getAttachmentDisplayName(objectPath) {
  if (!objectPath) return ''
  const segments = String(objectPath).split('/')
  const fileSegment = segments[segments.length - 1] ?? objectPath
  return fileSegment.replace(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i,
    '',
  )
}

/**
 * Splits a filename into stem and extension so CSS truncation preserves the extension.
 * @param {string} fileName
 * @returns {{ stem: string, extension: string }}
 */
export function splitFilenameForDisplay(fileName) {
  const text = String(fileName ?? '')
  const lastDot = text.lastIndexOf('.')
  if (lastDot <= 0 || lastDot === text.length - 1) {
    return { stem: text, extension: '' }
  }
  return {
    stem: text.slice(0, lastDot),
    extension: text.slice(lastDot),
  }
}

/**
 * Returns true if the intern can still edit or resubmit the row.
 * @param {string | undefined | null} status
 * @returns {boolean}
 */
export function isEditableSubmissionStatus(status) {
  return status === 'pending' || status === 'returned' || status === 'rejected'
}

/**
 * Returns true if the submission was sent back by a reviewer and carries remarks.
 * @param {string | undefined | null} status
 * @returns {boolean}
 */
export function hasReviewerFeedbackStatus(status) {
  return status === 'returned' || status === 'rejected'
}

/**
 * When a returned or rejected submission is edited and saved, reset review fields back to pending.
 * @param {string | undefined | null} previousStatus
 * @returns {Record<string, unknown>}
 */
export function getReviewResetPayload(previousStatus) {
  if (previousStatus === 'returned' || previousStatus === 'rejected') {
    return {
      status: 'pending',
      reviewed_by: null,
      reviewer_remarks: null,
      reviewed_at: null,
    }
  }
  return {}
}
