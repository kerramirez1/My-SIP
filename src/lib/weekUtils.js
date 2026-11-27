const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

function pad2(value) {
  return String(value).padStart(2, '0')
}

function formatParts({ year, month, day }) {
  return `${year}-${pad2(month)}-${pad2(day)}`
}

function parseIsoParts(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(isoDate ?? '').trim())
  if (!match) return null
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  }
}

/**
 * Returns today's calendar date as YYYY-MM-DD without UTC offset drift.
 * @returns {string}
 */
export function getTodayIsoDate() {
  if (typeof globalThis.Temporal?.Now?.plainDateISO === 'function') {
    return globalThis.Temporal.Now.plainDateISO().toString()
  }
  const now = new Date()
  return formatParts({
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  })
}

/**
 * Adds a signed number of days to an ISO calendar date (YYYY-MM-DD).
 * @param {string} isoDate
 * @param {number} deltaDays
 * @returns {string}
 */
export function shiftIsoDate(isoDate, deltaDays) {
  if (typeof globalThis.Temporal?.PlainDate?.from === 'function') {
    try {
      return globalThis.Temporal.PlainDate.from(isoDate)
        .add({ days: deltaDays })
        .toString()
    } catch {
      return isoDate
    }
  }

  const parts = parseIsoParts(isoDate)
  if (!parts) return isoDate

  // Pure UTC calendar math avoids local DST/timezone day shifts.
  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + deltaDays))
  return formatParts({
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
  })
}

/**
 * Computes the Monday (YYYY-MM-DD) of the week containing the given calendar date.
 * @param {string} isoDate
 * @returns {string}
 */
export function getMondayOfWeek(isoDate) {
  if (typeof globalThis.Temporal?.PlainDate?.from === 'function') {
    try {
      const plain = globalThis.Temporal.PlainDate.from(isoDate)
      // Temporal dayOfWeek: 1 = Monday ... 7 = Sunday
      return plain.subtract({ days: plain.dayOfWeek - 1 }).toString()
    } catch {
      return ''
    }
  }

  const parts = parseIsoParts(isoDate)
  if (!parts) return ''

  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day))
  const utcDay = utc.getUTCDay() // 0 = Sun, 1 = Mon ... 6 = Sat
  const diffFromMonday = utcDay === 0 ? 6 : utcDay - 1
  return shiftIsoDate(isoDate, -diffFromMonday)
}

/**
 * Formats an ISO calendar date (YYYY-MM-DD) concisely, e.g. "Nov 27, 2026".
 * @param {string} isoDate
 * @returns {string}
 */
export function formatCalendarDate(isoDate) {
  const parts = parseIsoParts(isoDate)
  if (!parts) return isoDate || ''
  const monthName = MONTH_NAMES[parts.month - 1] ?? ''
  return `${monthName} ${parts.day}, ${parts.year}`
}

/**
 * Formats a week span starting from its week_of Monday date.
 * Pass `spanDays = 5` for Monday–Saturday or `spanDays = 6` (default) for Monday–Sunday.
 * @param {string} weekOfIso
 * @param {number} [spanDays=6]
 * @returns {string}
 */
export function formatWeekRange(weekOfIso, spanDays = 6) {
  const monday = getMondayOfWeek(weekOfIso)
  if (!monday) return ''
  const endDate = shiftIsoDate(monday, spanDays)
  const monParts = parseIsoParts(monday)
  const endParts = parseIsoParts(endDate)
  if (!monParts || !endParts) return monday

  const monLabel =
    monParts.year === endParts.year
      ? `${MONTH_NAMES[monParts.month - 1]} ${monParts.day}`
      : `${MONTH_NAMES[monParts.month - 1]} ${monParts.day}, ${monParts.year}`
  const endLabel = `${MONTH_NAMES[endParts.month - 1]} ${endParts.day}, ${endParts.year}`

  return `${monLabel} – ${endLabel}`
}
