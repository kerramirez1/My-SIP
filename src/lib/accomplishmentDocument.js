import { escapeHtml } from './coordinatorExportUtils'
import {
  formatInternshipPeriod,
  resolveHostOrganizationName,
} from './schemaCompat'
import {
  getAttachmentDisplayName,
  isDraftAccomplishment,
} from './submissionHelpers'
import {
  formatCalendarDate,
  formatWeekRange,
  formatWeekdayCalendarDate,
  getTodayIsoDate,
} from './weekUtils'

export const INSTITUTION_HEADER = {
  university: 'Romblon State University',
  campus: 'Cajidiocan Campus',
  defaultProgram: 'Bachelor of Science in Information Technology',
  programLabel: 'Student Internship Program',
  documentTitle: 'Weekly Accomplishment Report',
}

const STATUS_DISPLAY_LABELS = {
  saved_not_submitted: 'Saved – Not Yet Submitted',
  approved: 'Approved',
  pending: 'Pending Supervisor Review',
  returned: 'Returned for Revision',
  rejected: 'Rejected',
}

const GENERIC_LEGACY_TITLES = new Set([
  'accomplishment',
  'weekly accomplishment',
  'weekly accomplishment report',
  'daily accomplishment',
])

function cleanText(value) {
  return String(value ?? '').trim()
}

function extractIsoDate(timestamp) {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(cleanText(timestamp))
  return match ? match[1] : ''
}

export function formatDocumentDateTime(isoTimestamp) {
  const raw = cleanText(isoTimestamp)
  if (!raw) return ''
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) {
    const datePart = extractIsoDate(raw)
    return datePart ? formatCalendarDate(datePart) : ''
  }
  const dateLabel = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(parsed)
  const timeLabel = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(parsed)
  return `${dateLabel}, ${timeLabel}`
}

export function formatAccomplishmentWeekRange(weekOf) {
  // Official reporting period covers Monday to Saturday (spanDays = 5).
  return weekOf ? formatWeekRange(weekOf, 5) : ''
}

function formatProgramForHeader(course) {
  const trimmed = cleanText(course)
  if (!trimmed) return INSTITUTION_HEADER.defaultProgram
  const lower = trimmed.toLowerCase()
  if (
    lower === 'bsit' ||
    lower === 'bs information technology' ||
    lower === 'b.s. information technology'
  ) {
    return INSTITUTION_HEADER.defaultProgram
  }
  return trimmed
}

/**
 * Deterministic unique document reference number shared across Intern,
 * Supervisor, and Coordinator for the same (intern, reporting week).
 */
export function buildWeeklyReportReferenceId({ internId, weekOf, fallbackRowId }) {
  const weekClean = cleanText(weekOf).replace(/-/g, '')
  const idSource = cleanText(internId || fallbackRowId)
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
  const shortCode = idSource.slice(0, 6)
  if (weekClean && shortCode) return `WAR-${weekClean}-${shortCode}`
  if (weekClean) return `WAR-${weekClean}`
  if (shortCode) return `WAR-${shortCode}`
  return ''
}

/**
 * Resolves the week's reflection fields cleanly:
 * - Prefers the dedicated weekly reflection record when present.
 * - Falls back to non-empty legacy reflection fields stored on accomplishment
 *   rows so historical reports never lose reflection data.
 */
export function resolveWeeklyReflection(weeklyReflection, weekRows = []) {
  const pickField = (fieldKey) => {
    const direct = String(weeklyReflection?.[fieldKey] ?? '')
    if (direct.trim()) return direct

    const seen = new Set()
    const parts = []
    for (const row of weekRows) {
      const raw = String(row?.[fieldKey] ?? '')
      const trimmed = raw.trim()
      if (!trimmed || seen.has(trimmed)) continue
      seen.add(trimmed)
      parts.push(raw)
    }
    return parts.join('\n\n')
  }

  return {
    skills_acquired: pickField('skills_acquired'),
    challenges_encountered: pickField('challenges_encountered'),
    lessons_learned: pickField('lessons_learned'),
  }
}

/**
 * Computes the official overall review status of a Weekly Accomplishment Report.
 * A weekly report is Approved ONLY when all of its daily entries are submitted
 * and approved. Saved unsubmitted daily entries (`submitted_at === null`) are
 * tracked separately in `draftCount` and are NEVER counted as `pendingCount`.
 */
export function computeWeeklyReviewStatus(weekRows = []) {
  const totalCount = weekRows.length
  if (totalCount === 0) {
    return {
      statusKey: 'saved_not_submitted',
      statusLabel: STATUS_DISPLAY_LABELS.saved_not_submitted,
      isApproved: false,
      isSubmitted: false,
      hasUnsubmittedEntries: false,
      totalCount: 0,
      draftCount: 0,
      submittedCount: 0,
      approvedCount: 0,
      pendingCount: 0,
      returnedCount: 0,
      rejectedCount: 0,
      progressNote: '',
      latestReviewedAt: '',
      latestSubmittedAt: '',
    }
  }

  let draftCount = 0
  let approvedCount = 0
  let pendingCount = 0
  let returnedCount = 0
  let rejectedCount = 0
  let latestReviewedAt = ''
  let latestSubmittedAt = ''

  for (const row of weekRows) {
    if (isDraftAccomplishment(row)) {
      draftCount += 1
    } else {
      const status = cleanText(row?.status).toLowerCase() || 'pending'
      if (status === 'approved') approvedCount += 1
      else if (status === 'returned') returnedCount += 1
      else if (status === 'rejected') rejectedCount += 1
      else pendingCount += 1

      const submittedTs = cleanText(row?.submitted_at || row?.created_at)
      if (
        submittedTs &&
        (!latestSubmittedAt || submittedTs > latestSubmittedAt)
      ) {
        latestSubmittedAt = submittedTs
      }
    }

    const reviewedTs = cleanText(row?.reviewed_at)
    if (reviewedTs && (!latestReviewedAt || reviewedTs > latestReviewedAt)) {
      latestReviewedAt = reviewedTs
    }
  }

  const submittedCount = totalCount - draftCount
  const allApproved =
    totalCount > 0 && approvedCount === totalCount && draftCount === 0
  const hasUnsubmittedEntries = draftCount > 0

  let statusKey = 'pending'
  if (allApproved) {
    statusKey = 'approved'
  } else if (returnedCount > 0) {
    statusKey = 'returned'
  } else if (rejectedCount > 0) {
    statusKey = 'rejected'
  } else if (submittedCount === 0 && draftCount > 0) {
    statusKey = 'saved_not_submitted'
  }

  let progressNote = ''
  if (!allApproved && (totalCount > 1 || draftCount > 0)) {
    const parts = []
    if (draftCount > 0) parts.push(`${draftCount} saved (not submitted)`)
    if (approvedCount > 0) parts.push(`${approvedCount} approved`)
    if (pendingCount > 0) parts.push(`${pendingCount} pending review`)
    if (returnedCount > 0) parts.push(`${returnedCount} returned`)
    if (rejectedCount > 0) parts.push(`${rejectedCount} rejected`)
    progressNote = `${parts.join(', ')} of ${totalCount} ${totalCount === 1 ? 'daily entry' : 'daily entries'}`
  }

  return {
    statusKey,
    statusLabel:
      STATUS_DISPLAY_LABELS[statusKey] || STATUS_DISPLAY_LABELS.pending,
    isApproved: allApproved,
    isSubmitted: submittedCount > 0 && draftCount === 0,
    hasUnsubmittedEntries,
    totalCount,
    draftCount,
    submittedCount,
    approvedCount,
    pendingCount,
    returnedCount,
    rejectedCount,
    progressNote,
    latestReviewedAt,
    latestSubmittedAt,
  }
}

/**
 * Computes the overall weekly display status for the intern's Accomplishments
 * header while preserving individual entry review statuses:
 * - Draft: no entries logged yet
 * - Saved – Not Yet Submitted: daily entries saved, weekly report not yet submitted
 * - Approved: all entries submitted and approved
 * - Needs Revision: at least one entry has been returned (or rejected)
 * - In Progress – Unsubmitted Entries: mix of submitted entries and new unsubmitted drafts
 * - Partially Reviewed: some submitted entries are approved while others remain pending
 * - Awaiting Review: all entries submitted and awaiting supervisor review
 */
export function computeWeeklyHeaderStatus(weekRows = []) {
  const review = computeWeeklyReviewStatus(weekRows)

  if (review.totalCount === 0) {
    return { ...review, headerKey: 'draft', headerLabel: 'Draft' }
  }
  if (review.draftCount === review.totalCount) {
    return {
      ...review,
      headerKey: 'saved_not_submitted',
      headerLabel: 'Saved – Not Yet Submitted',
    }
  }
  if (review.isApproved) {
    return { ...review, headerKey: 'approved', headerLabel: 'Approved' }
  }
  if (review.returnedCount > 0 || review.rejectedCount > 0) {
    return {
      ...review,
      headerKey: 'needs_revision',
      headerLabel: 'Needs Revision',
    }
  }
  if (review.hasUnsubmittedEntries) {
    return {
      ...review,
      headerKey: 'in_progress',
      headerLabel: 'Saved – Not Yet Submitted',
    }
  }
  if (review.approvedCount > 0 && review.pendingCount > 0) {
    return {
      ...review,
      headerKey: 'partially_reviewed',
      headerLabel: 'Partially Reviewed',
    }
  }
  return {
    ...review,
    headerKey: 'awaiting_review',
    headerLabel: 'Awaiting Review',
  }
}

function sortDailyRowsChronologically(rows) {
  return [...rows].sort((a, b) => {
    const aDate = cleanText(a?.entry_date)
    const bDate = cleanText(b?.entry_date)
    if (aDate && bDate) {
      const cmp = aDate.localeCompare(bDate)
      if (cmp !== 0) return cmp
    } else if (aDate && !bDate) {
      return -1
    } else if (!aDate && bDate) {
      return 1
    }
    return cleanText(a?.created_at).localeCompare(cleanText(b?.created_at))
  })
}

function formatEntryActivity(row) {
  const description = String(row?.description ?? '')
  const title = String(row?.title ?? '')
  const descTrimmed = description.trim()
  const titleTrimmed = title.trim()

  if (row?.entry_date) {
    // New daily entries store the activity text in description.
    return {
      heading: '',
      body: descTrimmed ? description : title,
    }
  }

  // Legacy weekly entries may have both a custom title and a description.
  if (descTrimmed) {
    const hasDistinctTitle =
      titleTrimmed &&
      !GENERIC_LEGACY_TITLES.has(titleTrimmed.toLowerCase()) &&
      titleTrimmed.toLowerCase() !== descTrimmed.toLowerCase()
    return {
      heading: hasDistinctTitle ? titleTrimmed : '',
      body: description,
    }
  }

  return {
    heading: '',
    body: titleTrimmed ? title : 'No activities recorded.',
  }
}

export function getAccomplishmentDocumentFields({
  rows,
  row,
  weekOf,
  weeklyReflection,
  internName,
  studentIdNo,
  course,
  yearLevel,
  schoolName,
  internshipType,
  hostOrganization,
  companyName,
  departmentOffice,
  supervisorName,
  reviewerName,
  requiredHours,
  internshipStartDate,
  internshipEndDate,
  generatedAtIso,
}) {
  const rawWeekRows =
    Array.isArray(rows) && rows.length > 0 ? rows : row ? [row] : []
  const sortedRows = sortDailyRowsChronologically(rawWeekRows)
  const resolvedWeekOf =
    cleanText(weekOf) ||
    cleanText(sortedRows[0]?.week_of) ||
    cleanText(weeklyReflection?.week_of)
  const reportingPeriod = formatAccomplishmentWeekRange(resolvedWeekOf)
  const internId =
    cleanText(sortedRows[0]?.intern_id) ||
    cleanText(weeklyReflection?.intern_id)

  const referenceId = buildWeeklyReportReferenceId({
    internId,
    weekOf: resolvedWeekOf,
    fallbackRowId: sortedRows[0]?.id || weeklyReflection?.id,
  })
  const generatedDate = formatCalendarDate(generatedAtIso || getTodayIsoDate())

  const internNameClean = cleanText(internName)
  const studentIdClean = cleanText(studentIdNo)
  const courseClean = cleanText(course)
  const yearLevelClean = cleanText(yearLevel)
  const schoolClean = cleanText(schoolName)
  const hostOrgClean = resolveHostOrganizationName({
    company_name: hostOrganization ?? companyName,
    internship_type: internshipType,
    school_name: schoolName,
  })
  const officeDeptClean = cleanText(departmentOffice)
  const supervisorClean = cleanText(supervisorName)
  const reviewerClean = cleanText(reviewerName)
  const programAndYearLevel = [courseClean, yearLevelClean]
    .filter(Boolean)
    .join(' – ')

  const internshipPeriodLabel = formatInternshipPeriod(
    internshipStartDate,
    internshipEndDate,
    formatCalendarDate,
  )

  const infoTableRows = [
    {
      leftLabel: 'Intern Name',
      leftValue: internNameClean || '—',
      rightLabel: 'Host Organization / Institution',
      rightValue: hostOrgClean || '—',
    },
    {
      leftLabel: 'Student ID',
      leftValue: studentIdClean || '—',
      rightLabel: 'Office / Department',
      rightValue: officeDeptClean || '—',
    },
    {
      leftLabel: 'Program and Year Level',
      leftValue: programAndYearLevel || '—',
      rightLabel: 'Supervising Officer',
      rightValue: supervisorClean || '—',
    },
    {
      leftLabel: 'School',
      leftValue: schoolClean || '—',
      rightLabel: 'Internship Period',
      rightValue: internshipPeriodLabel || '—',
    },
  ]

  const dailyEntries = sortedRows.map((entry, idx) => {
    const entryDate = cleanText(entry?.entry_date)
    const isLegacy = !entryDate
    const activity = formatEntryActivity(entry)
    const rawOutput = String(entry?.output_result ?? '')
    const hasOutput = Boolean(rawOutput.trim())

    return {
      id: entry?.id || `row-${idx}`,
      entryDate,
      isLegacy,
      dateLabel: entryDate
        ? formatWeekdayCalendarDate(entryDate)
        : reportingPeriod || 'Reporting week',
      dateSubLabel: isLegacy ? 'Daily date not recorded' : '',
      activityHeading: activity.heading,
      activityBody: activity.body,
      outputText: hasOutput ? rawOutput : 'Not provided',
      isOutputMissing: !hasOutput,
      status: cleanText(entry?.status).toLowerCase() || 'pending',
    }
  })

  const attachments = []
  for (const entry of sortedRows) {
    if (!entry?.attachment_url) continue
    const fileName = getAttachmentDisplayName(entry.attachment_url)
    if (!fileName) continue
    attachments.push({
      id: entry.id || fileName,
      fileName,
      dateLabel: entry.entry_date
        ? formatWeekdayCalendarDate(entry.entry_date)
        : '',
    })
  }

  const reflection = resolveWeeklyReflection(weeklyReflection, sortedRows)
  const reviewSummary = computeWeeklyReviewStatus(sortedRows)
  const submittedAtIso = reviewSummary.latestSubmittedAt
  const submittedAtFormatted = submittedAtIso
    ? formatDocumentDateTime(submittedAtIso)
    : ''
  const approvedAtFormatted = reviewSummary.isApproved
    ? formatDocumentDateTime(reviewSummary.latestReviewedAt)
    : ''
  const reviewedAtFormatted =
    !reviewSummary.isApproved && reviewSummary.latestReviewedAt
      ? formatDocumentDateTime(reviewSummary.latestReviewedAt)
      : ''

  const approverDisplayName = reviewSummary.isApproved
    ? reviewerClean || supervisorClean
    : supervisorClean

  const parsedHours = Number(requiredHours)
  const requiredHoursLabel =
    Number.isFinite(parsedHours) && parsedHours > 0
      ? `${parsedHours.toLocaleString('en-US')} hours`
      : ''

  return {
    header: {
      university: INSTITUTION_HEADER.university,
      campus: INSTITUTION_HEADER.campus,
      program: formatProgramForHeader(courseClean),
      programLabel: INSTITUTION_HEADER.programLabel,
      documentTitle: INSTITUTION_HEADER.documentTitle,
      reportingPeriod,
    },
    documentMeta: {
      referenceId,
      reportingPeriod,
      generatedDate,
      statusKey: reviewSummary.statusKey,
      statusLabel: reviewSummary.statusLabel,
      requiredHoursLabel,
    },
    infoTableRows,
    dailyEntries,
    attachments,
    reflection: {
      skills: {
        label: 'Skills Acquired',
        text: reflection.skills_acquired.trim()
          ? reflection.skills_acquired
          : 'No skills recorded.',
        isEmpty: !reflection.skills_acquired.trim(),
      },
      challenges: {
        label: 'Challenges Encountered',
        text: reflection.challenges_encountered.trim()
          ? reflection.challenges_encountered
          : 'No challenges recorded.',
        isEmpty: !reflection.challenges_encountered.trim(),
      },
      lessons: {
        label: 'Lessons Learned / Next Steps',
        text: reflection.lessons_learned.trim()
          ? reflection.lessons_learned
          : 'No lessons recorded.',
        isEmpty: !reflection.lessons_learned.trim(),
      },
    },
    submissionRecord: {
      internName: internNameClean || '—',
      role: 'Student Intern',
      submittedAt: submittedAtFormatted,
    },
    reviewRecord: {
      isApproved: reviewSummary.isApproved,
      statusKey: reviewSummary.statusKey,
      statusLabel: reviewSummary.statusLabel,
      progressNote: reviewSummary.progressNote,
      supervisorName: approverDisplayName || '—',
      role: 'Supervising Officer',
      approvedAt: approvedAtFormatted,
      reviewedAt: reviewedAtFormatted,
    },
    portalFooter: 'Generated through My SIP Portal',
  }
}

/**
 * Generates a standalone printable / Save-as-PDF A4 HTML document matching the
 * official Weekly Accomplishment Report format.
 */
export function buildAccomplishmentDocumentHtml(params) {
  const doc = getAccomplishmentDocumentFields(params)

  const pageTitle = doc.header.reportingPeriod
    ? `${doc.header.documentTitle} - ${doc.header.reportingPeriod}`
    : doc.header.documentTitle

  const infoRowsHtml = doc.infoTableRows
    .map(
      (r) => `<tr>
          <th>${escapeHtml(r.leftLabel)}</th>
          <td>${escapeHtml(r.leftValue)}</td>
          <th>${escapeHtml(r.rightLabel)}</th>
          <td>${escapeHtml(r.rightValue)}</td>
        </tr>`,
    )
    .join('\n        ')

  const dailyRowsHtml =
    doc.dailyEntries.length > 0
      ? doc.dailyEntries
          .map(
            (entry) => `<tr>
          <td class="col-date">
            <span class="date-primary">${escapeHtml(entry.dateLabel)}</span>
            ${
              entry.dateSubLabel
                ? `<span class="date-sub">${escapeHtml(entry.dateSubLabel)}</span>`
                : ''
            }
          </td>
          <td class="col-activity">
            ${
              entry.activityHeading
                ? `<div class="activity-heading">${escapeHtml(entry.activityHeading)}</div>`
                : ''
            }
            <div class="cell-pre">${escapeHtml(entry.activityBody)}</div>
          </td>
          <td class="col-output">
            <div class="cell-pre${entry.isOutputMissing ? ' is-muted-italic' : ''}">${escapeHtml(entry.outputText)}</div>
          </td>
        </tr>`,
          )
          .join('\n        ')
      : `<tr>
          <td colspan="3" class="empty-table-cell">No daily accomplishments recorded for this reporting period.</td>
        </tr>`

  const attachmentsHtml =
    doc.attachments.length > 0
      ? `<div class="attachments-strip">
        <span class="attachments-strip-label">Supporting Attachments:</span>
        <span>${doc.attachments
          .map((f) =>
            escapeHtml(
              f.dateLabel ? `${f.fileName} (${f.dateLabel})` : f.fileName,
            ),
          )
          .join('; ')}</span>
      </div>`
      : ''

  const footerLeftText = doc.documentMeta.referenceId
    ? `${doc.portalFooter} · ${doc.documentMeta.referenceId}`
    : doc.portalFooter

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(pageTitle)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 0.48in 0.6in 0.6in 0.6in;

      @bottom-left {
        content: "${escapeHtml(footerLeftText)}";
        font-family: Arial, Helvetica, sans-serif;
        font-size: 7.5pt;
        color: #4b5563;
      }

      @bottom-right {
        content: "Page " counter(page) " of " counter(pages);
        font-family: Arial, Helvetica, sans-serif;
        font-size: 7.5pt;
        color: #4b5563;
      }
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #111827;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 9.75pt;
      line-height: 1.48;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .doc-sheet {
      width: 100%;
      margin: 0 auto;
      background: #ffffff;
      color: #111827;
    }

    .letterhead {
      text-align: center;
      padding-bottom: 0.45rem;
      border-bottom: 2px solid #1e3a5f;
      position: relative;
    }

    .letterhead::after {
      content: "";
      display: block;
      position: absolute;
      left: 0;
      right: 0;
      bottom: -4px;
      border-bottom: 1px solid #1e3a5f;
    }

    .univ-name {
      margin: 0;
      font-size: 13pt;
      font-weight: 700;
      letter-spacing: 0.02em;
      color: #0f172a;
      line-height: 1.25;
    }

    .univ-campus {
      margin: 0.08rem 0 0;
      font-size: 9.75pt;
      color: #1f2937;
      line-height: 1.3;
    }

    .univ-program {
      margin: 0.1rem 0 0;
      font-size: 9.75pt;
      font-weight: 700;
      color: #111827;
      line-height: 1.3;
    }

    .univ-sip {
      margin: 0.08rem 0 0;
      font-size: 9pt;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: #1e3a5f;
      line-height: 1.3;
    }

    .title-band {
      margin-top: 0.55rem;
      padding: 0.48rem 0.75rem;
      background: #1e3a5f;
      color: #ffffff;
      text-align: center;
    }

    .title-band h1 {
      margin: 0;
      font-size: 11.5pt;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      line-height: 1.25;
    }

    .title-band-period {
      margin: 0.14rem 0 0;
      font-size: 9pt;
      font-weight: 400;
      color: #e2e8f0;
      line-height: 1.3;
    }

    .meta-strip {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: baseline;
      gap: 0.15rem 0.5rem;
      margin-top: 0.35rem;
      padding: 0.26rem 0.45rem;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      font-size: 7.4pt;
      color: #334155;
    }

    .meta-strip strong {
      color: #0f172a;
    }

    .section-block {
      margin-top: 0.55rem;
    }

    .section-title {
      margin: 0 0 0.26rem;
      padding: 0.18rem 0.45rem;
      background: #f1f5f9;
      border-left: 3px solid #1e3a5f;
      font-size: 8.5pt;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #0f172a;
      break-after: avoid;
      page-break-after: avoid;
    }

    .info-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.5pt;
      line-height: 1.34;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .info-table th,
    .info-table td {
      border: 1px solid #cbd5e1;
      padding: 0.24rem 0.42rem;
      text-align: left;
      vertical-align: top;
    }

    .info-table th {
      width: 19%;
      background: #f8fafc;
      font-weight: 700;
      color: #1e293b;
    }

    .info-table td {
      width: 31%;
      color: #0f172a;
      overflow-wrap: break-word;
    }

    .daily-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8.75pt;
      line-height: 1.4;
    }

    .daily-table thead {
      display: table-header-group;
    }

    .daily-table th,
    .daily-table td {
      border: 1px solid #cbd5e1;
      padding: 0.28rem 0.42rem;
      text-align: left;
      vertical-align: top;
    }

    .daily-table th {
      background: #f1f5f9;
      font-size: 8.5pt;
      font-weight: 700;
      color: #0f172a;
    }

    .daily-table tr {
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .col-date {
      width: 21%;
      white-space: nowrap;
    }

    .col-activity {
      width: 47%;
    }

    .col-output {
      width: 32%;
    }

    .date-primary {
      display: block;
      font-weight: 700;
      color: #0f172a;
      white-space: normal;
    }

    .date-sub {
      display: block;
      margin-top: 0.1rem;
      font-size: 7.75pt;
      font-style: italic;
      color: #64748b;
      white-space: normal;
    }

    .activity-heading {
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 0.12rem;
    }

    .cell-pre {
      white-space: pre-wrap;
      overflow-wrap: break-word;
      color: #111827;
    }

    .is-muted-italic {
      font-style: italic;
      color: #64748b;
    }

    .empty-table-cell {
      text-align: center;
      font-style: italic;
      color: #64748b;
      padding: 0.65rem;
    }

    .attachments-strip {
      margin-top: 0.35rem;
      padding: 0.3rem 0.5rem;
      border: 1px solid #cbd5e1;
      background: #f8fafc;
      font-size: 8.25pt;
      color: #334155;
      overflow-wrap: break-word;
    }

    .attachments-strip-label {
      font-weight: 700;
      color: #0f172a;
      margin-right: 0.3rem;
    }

    .reflection-two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.55rem;
    }

    .reflection-box {
      border: 1px solid #cbd5e1;
      padding: 0.38rem 0.5rem;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .reflection-box.is-full {
      margin-top: 0.45rem;
    }

    .reflection-box h3 {
      margin: 0 0 0.2rem;
      padding-bottom: 0.14rem;
      border-bottom: 1px solid #e2e8f0;
      font-size: 8.5pt;
      font-weight: 700;
      color: #0f172a;
    }

    .reflection-box p {
      margin: 0;
      font-size: 8.75pt;
      line-height: 1.42;
      white-space: pre-wrap;
      overflow-wrap: break-word;
      color: #111827;
    }

    .review-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.55rem;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .review-card {
      border: 1px solid #cbd5e1;
      padding: 0.4rem 0.52rem;
      min-width: 0;
    }

    .review-card-heading {
      margin: 0 0 0.22rem;
      font-size: 7.5pt;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #475569;
    }

    .review-card-name {
      margin: 0;
      font-size: 9.75pt;
      font-weight: 700;
      color: #0f172a;
      overflow-wrap: break-word;
    }

    .review-card-role {
      margin: 0.05rem 0 0;
      font-size: 8.25pt;
      color: #475569;
    }

    .review-card-detail {
      margin: 0.18rem 0 0;
      font-size: 8.25pt;
      color: #1e293b;
    }

    .review-card-status {
      margin: 0.18rem 0 0;
      font-size: 8.25pt;
      font-weight: 700;
      color: #0f172a;
    }

    .review-card-note {
      margin: 0.14rem 0 0;
      font-size: 7.75pt;
      color: #475569;
    }

    .doc-footer {
      margin-top: 0.55rem;
      padding-top: 0.32rem;
      border-top: 1px solid #cbd5e1;
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: 0.25rem 0.75rem;
      font-size: 7.5pt;
      color: #475569;
      break-inside: avoid;
      page-break-inside: avoid;
    }
  </style>
</head>
<body>
  <article class="doc-sheet">
    <header class="letterhead">
      <p class="univ-name">${escapeHtml(doc.header.university)}</p>
      <p class="univ-campus">${escapeHtml(doc.header.campus)}</p>
      <p class="univ-program">${escapeHtml(doc.header.program)}</p>
      <p class="univ-sip">${escapeHtml(doc.header.programLabel)}</p>
    </header>

    <div class="title-band">
      <h1>${escapeHtml(doc.header.documentTitle)}</h1>
      ${
        doc.header.reportingPeriod
          ? `<p class="title-band-period">Reporting Period: ${escapeHtml(doc.header.reportingPeriod)}</p>`
          : ''
      }
    </div>

    <div class="meta-strip">
      ${
        doc.documentMeta.referenceId
          ? `<span><strong>Document Ref.:</strong> ${escapeHtml(doc.documentMeta.referenceId)}</span>`
          : ''
      }
      ${
        doc.documentMeta.reportingPeriod
          ? `<span><strong>Reporting Period:</strong> ${escapeHtml(doc.documentMeta.reportingPeriod)}</span>`
          : ''
      }
      <span><strong>Status:</strong> ${escapeHtml(doc.documentMeta.statusLabel)}</span>
      <span><strong>Generated:</strong> ${escapeHtml(doc.documentMeta.generatedDate)}</span>
    </div>

    <section class="section-block">
      <h2 class="section-title">Intern and Placement Information</h2>
      <table class="info-table">
        <tbody>
        ${infoRowsHtml}
        </tbody>
      </table>
    </section>

    <section class="section-block">
      <h2 class="section-title">Weekly Accomplishments</h2>
      <table class="daily-table">
        <thead>
          <tr>
            <th scope="col" class="col-date">Date</th>
            <th scope="col" class="col-activity">Activities Performed</th>
            <th scope="col" class="col-output">Output / Result</th>
          </tr>
        </thead>
        <tbody>
        ${dailyRowsHtml}
        </tbody>
      </table>
      ${attachmentsHtml}
    </section>

    <section class="section-block">
      <h2 class="section-title">Learning and Reflection</h2>
      <div class="reflection-two-col">
        <div class="reflection-box">
          <h3>${escapeHtml(doc.reflection.skills.label)}</h3>
          <p class="${doc.reflection.skills.isEmpty ? 'is-muted-italic' : ''}">${escapeHtml(doc.reflection.skills.text)}</p>
        </div>
        <div class="reflection-box">
          <h3>${escapeHtml(doc.reflection.challenges.label)}</h3>
          <p class="${doc.reflection.challenges.isEmpty ? 'is-muted-italic' : ''}">${escapeHtml(doc.reflection.challenges.text)}</p>
        </div>
      </div>
      <div class="reflection-box is-full">
        <h3>${escapeHtml(doc.reflection.lessons.label)}</h3>
        <p class="${doc.reflection.lessons.isEmpty ? 'is-muted-italic' : ''}">${escapeHtml(doc.reflection.lessons.text)}</p>
      </div>
    </section>

    <section class="section-block">
      <h2 class="section-title">Submission and Review Record</h2>
      <div class="review-grid">
        <div class="review-card">
          <p class="review-card-heading">Prepared and Submitted By</p>
          <p class="review-card-name">${escapeHtml(doc.submissionRecord.internName)}</p>
          <p class="review-card-role">${escapeHtml(doc.submissionRecord.role)}</p>
          ${
            doc.submissionRecord.submittedAt
              ? `<p class="review-card-detail"><strong>Submission Date:</strong> ${escapeHtml(doc.submissionRecord.submittedAt)}</p>`
              : ''
          }
        </div>
        <div class="review-card">
          <p class="review-card-heading">Reviewed and Approved By</p>
          <p class="review-card-name">${escapeHtml(doc.reviewRecord.supervisorName)}</p>
          <p class="review-card-role">${escapeHtml(doc.reviewRecord.role)}</p>
          <p class="review-card-status">Review Status: ${escapeHtml(doc.reviewRecord.statusLabel)}</p>
          ${
            doc.reviewRecord.isApproved && doc.reviewRecord.approvedAt
              ? `<p class="review-card-detail"><strong>Approval Date:</strong> ${escapeHtml(doc.reviewRecord.approvedAt)}</p>`
              : ''
          }
          ${
            !doc.reviewRecord.isApproved && doc.reviewRecord.reviewedAt
              ? `<p class="review-card-detail"><strong>Last Reviewed:</strong> ${escapeHtml(doc.reviewRecord.reviewedAt)}</p>`
              : ''
          }
          ${
            doc.reviewRecord.progressNote
              ? `<p class="review-card-note">${escapeHtml(doc.reviewRecord.progressNote)}</p>`
              : ''
          }
        </div>
      </div>
    </section>

    <footer class="doc-footer">
      <span>${escapeHtml(doc.portalFooter)}</span>
      <span>${escapeHtml(
        [
          doc.documentMeta.referenceId,
          `Generated ${doc.documentMeta.generatedDate}`,
        ]
          .filter(Boolean)
          .join(' · '),
      )}</span>
    </footer>
  </article>
</body>
</html>`
}
