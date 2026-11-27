export async function extractEdgeFunctionError(error, fallback) {
  const response = error?.context
  if (response) {
    if (typeof response.clone === 'function') {
      try {
        const parsed = await response.clone().json()
        if (parsed && typeof parsed.error === 'string' && parsed.error.trim()) {
          return {
            message: parsed.error.trim(),
            code: parsed.code ?? '',
            record_summary: parsed.record_summary ?? null,
          }
        }
      } catch {
        // Fall through to text fallback
      }
      try {
        const text = (await response.clone().text())?.trim()
        if (text) return { message: text, code: '', record_summary: null }
      } catch {
        // Fall through to generic message
      }
    } else if (typeof response.json === 'function') {
      try {
        const parsed = await response.json()
        if (parsed && typeof parsed.error === 'string' && parsed.error.trim()) {
          return {
            message: parsed.error.trim(),
            code: parsed.code ?? '',
            record_summary: parsed.record_summary ?? null,
          }
        }
      } catch {
        // Fall through to generic message
      }
    }
  }
  return {
    message: error?.message || fallback,
    code: '',
    record_summary: null,
  }
}
