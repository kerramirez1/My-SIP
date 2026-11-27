const TIME_REGEX = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/

function parseWallClockMinutes(timeStr) {
  const match = TIME_REGEX.exec(String(timeStr ?? '').trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null
  }
  return { hours, minutes, totalMinutes: hours * 60 + minutes }
}

/**
 * Formats a stored Postgres `time` (e.g. "08:30:00") into `HH:MM` for `<input type="time">`.
 * Uses Temporal.PlainTime when available instead of string slicing.
 * @param {string | null | undefined} timeStr
 * @returns {string}
 */
export function toTimeInputValue(timeStr) {
  if (!timeStr) return ''
  if (typeof globalThis.Temporal?.PlainTime?.from === 'function') {
    try {
      return globalThis.Temporal.PlainTime.from(timeStr).toString({
        smallestUnit: 'minute',
      })
    } catch {
      return ''
    }
  }
  const parsed = parseWallClockMinutes(timeStr)
  if (!parsed) return ''
  return `${String(parsed.hours).padStart(2, '0')}:${String(parsed.minutes).padStart(2, '0')}`
}

/**
 * Formats a wall-clock time string for table display (e.g. "8:00 AM").
 * @param {string | null | undefined} timeStr
 * @returns {string}
 */
export function formatWallClockTime(timeStr) {
  if (!timeStr) return '—'
  if (typeof globalThis.Temporal?.PlainTime?.from === 'function') {
    try {
      return globalThis.Temporal.PlainTime.from(timeStr).toLocaleString(
        'en-US',
        { hour: 'numeric', minute: '2-digit' },
      )
    } catch {
      return timeStr
    }
  }
  const parsed = parseWallClockMinutes(timeStr)
  if (!parsed) return timeStr
  const period = parsed.hours >= 12 ? 'PM' : 'AM'
  const hour12 = parsed.hours % 12 || 12
  return `${hour12}:${String(parsed.minutes).padStart(2, '0')} ${period}`
}

/**
 * Computes signed elapsed minutes between two wall-clock time strings (`timeOut - timeIn`).
 * Returns null if either value is missing or invalid; negative if timeOut is earlier than timeIn.
 * @param {string | null | undefined} timeIn
 * @param {string | null | undefined} timeOut
 * @returns {number | null}
 */
export function computeElapsedMinutes(timeIn, timeOut) {
  if (!timeIn || !timeOut) return null

  if (typeof globalThis.Temporal?.PlainTime?.from === 'function') {
    try {
      const start = globalThis.Temporal.PlainTime.from(timeIn)
      const end = globalThis.Temporal.PlainTime.from(timeOut)
      const diff = start.until(end, {
        largestUnit: 'minute',
        smallestUnit: 'minute',
      })
      return diff.minutes
    } catch {
      return null
    }
  }

  const start = parseWallClockMinutes(timeIn)
  const end = parseWallClockMinutes(timeOut)
  if (!start || !end) return null
  return end.totalMinutes - start.totalMinutes
}

/**
 * Formats a non-negative minute total using Intl.DurationFormat when available
 * (e.g. "8 hr, 30 min", "8 hr", "0 hr").
 * @param {number} totalMinutes
 * @returns {string}
 */
export function formatDurationMinutes(totalMinutes) {
  const safeMinutes = Math.max(0, Math.round(totalMinutes || 0))
  const hours = Math.floor(safeMinutes / 60)
  const minutes = safeMinutes % 60

  if (typeof globalThis.Intl?.DurationFormat === 'function') {
    if (hours === 0 && minutes === 0) {
      return new globalThis.Intl.DurationFormat('en-US', {
        style: 'short',
        hoursDisplay: 'always',
      }).format({ hours: 0 })
    }
    const formatter = new globalThis.Intl.DurationFormat('en-US', {
      style: 'short',
    })
    const parts = {}
    if (hours > 0) parts.hours = hours
    if (minutes > 0) parts.minutes = minutes
    return formatter.format(parts)
  }

  if (hours === 0 && minutes === 0) return '0 hr'
  if (hours > 0 && minutes > 0) return `${hours} hr, ${minutes} min`
  if (hours > 0) return `${hours} hr`
  return `${minutes} min`
}

/**
 * Formats total minutes as decimal hours (e.g. "8.50 hrs", "40.00 hrs").
 * @param {number} totalMinutes
 * @returns {string}
 */
export function formatDecimalHours(totalMinutes) {
  const safeMinutes = Math.max(0, totalMinutes || 0)
  const hours = safeMinutes / 60
  return `${hours.toFixed(2)} hrs`
}
