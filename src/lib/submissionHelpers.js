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
 * Returns true when an accomplishment row has been saved by the intern as a
 * daily entry but its weekly report has not yet been officially submitted.
 *
 * Uses strict `=== null` so legacy/pre-migration rows where `submitted_at` is
 * `undefined` continue to be treated as officially submitted.
 *
 * @param {Record<string, unknown> | null | undefined} row
 * @returns {boolean}
 */
export function isDraftAccomplishment(row) {
  return Boolean(row && row.status === 'pending' && row.submitted_at === null)
}

/**
 * Returns true when an accomplishment row has been officially submitted for
 * supervisor review (or already reviewed).
 *
 * @param {Record<string, unknown> | null | undefined} row
 * @returns {boolean}
 */
export function isSubmittedAccomplishment(row) {
  return Boolean(row) && !isDraftAccomplishment(row)
}

/**
 * Returns true when an accomplishment row is officially submitted and awaiting
 * formal supervisor review (never true for unsubmitted saved daily entries).
 *
 * @param {Record<string, unknown> | null | undefined} row
 * @returns {boolean}
 */
export function isPendingReviewAccomplishment(row) {
  return Boolean(row && row.status === 'pending' && !isDraftAccomplishment(row))
}

/**
 * Returns true if the intern can still edit the accomplishment row:
 * - Unsubmitted daily draft (`status === 'pending' && submitted_at === null`), OR
 * - Returned / rejected by supervisor for revision.
 * Once officially submitted and awaiting review (or approved), editing is locked.
 *
 * @param {Record<string, unknown> | null | undefined} row
 * @returns {boolean}
 */
export function isEditableAccomplishment(row) {
  if (!row) return false
  if ('submitted_at' in row) {
    return isDraftAccomplishment(row) || hasReviewerFeedbackStatus(row.status)
  }
  return isEditableSubmissionStatus(row.status)
}

/**
 * Returns true if the intern can delete their own daily accomplishment entry.
 * Only unsubmitted saved daily entries can be deleted by the intern.
 *
 * @param {Record<string, unknown> | null | undefined} row
 * @returns {boolean}
 */
export function isDeletableAccomplishment(row) {
  return isDraftAccomplishment(row)
}

/**
 * Returns the UI status badge key for an accomplishment row.
 * @param {Record<string, unknown> | null | undefined} row
 * @returns {string}
 */
export function getAccomplishmentDisplayStatus(row) {
  if (isDraftAccomplishment(row)) return 'saved_draft'
  return String(row?.status || 'pending')
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
