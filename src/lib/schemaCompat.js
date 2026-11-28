/**
 * Helpers for graceful compatibility when the app runs before a schema
 * revision (such as schema-revision-9.sql) has been applied to Postgres.
 */
export function isMissingSchemaColumnError(error) {
  if (!error) return false
  const code = String(error.code ?? '')
  const message = String(error.message ?? '').toLowerCase()
  return (
    code === '42703' ||
    code === 'PGRST204' ||
    (message.includes('column') && message.includes('does not exist')) ||
    message.includes('could not find the')
  )
}

export function isMissingSchemaRelationError(error) {
  if (!error) return false
  const code = String(error.code ?? '')
  const message = String(error.message ?? '').toLowerCase()
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    (message.includes('relation') && message.includes('does not exist')) ||
    message.includes('could not find the table')
  )
}

/**
 * Runs a Supabase query using the latest schema columns and falls back to the
 * legacy query if Postgres reports a missing column (e.g. before migration).
 */
export async function runWithSchemaFallback(runLatest, runLegacy) {
  const result = await runLatest()
  if (result?.error && isMissingSchemaColumnError(result.error)) {
    return runLegacy()
  }
  return result
}

export const INTERNSHIP_TYPE_LABELS = {
  on_campus: 'On-campus',
  off_campus: 'Off-campus',
}

export function formatInternshipTypeLabel(internshipType) {
  const key = String(internshipType ?? '').trim().toLowerCase()
  return INTERNSHIP_TYPE_LABELS[key] || ''
}

export function formatInternshipPeriod(startDate, endDate, formatDateFn) {
  const start = String(startDate ?? '').trim()
  const end = String(endDate ?? '').trim()
  if (start && end) {
    return `${formatDateFn(start)} – ${formatDateFn(end)}`
  }
  if (start) {
    return `Starting ${formatDateFn(start)}`
  }
  if (end) {
    return `Until ${formatDateFn(end)}`
  }
  return ''
}

export function resolveHostOrganizationName(profileLike) {
  const hostOrg = String(profileLike?.company_name ?? '').trim()
  if (hostOrg) return hostOrg
  if (profileLike?.internship_type === 'on_campus') {
    return String(profileLike?.school_name ?? '').trim()
  }
  return ''
}
