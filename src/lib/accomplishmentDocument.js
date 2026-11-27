import { escapeHtml } from './coordinatorExportUtils'
import { getAttachmentDisplayName } from './submissionHelpers'
import { formatWeekRange } from './weekUtils'

export const ACCOMPLISHMENT_DOCUMENT_SECTIONS = [
  {
    key: 'description',
    heading: 'Activities Performed',
    emptyText: 'No activities recorded.',
  },
  {
    key: 'skills_acquired',
    heading: 'Skills Acquired',
    emptyText: 'No skills recorded.',
  },
  {
    key: 'challenges_encountered',
    heading: 'Challenges Encountered',
    emptyText: 'No challenges recorded.',
  },
  {
    key: 'lessons_learned',
    heading: 'Lessons Learned',
    emptyText: 'No lessons recorded.',
  },
]

export function normalizeDocumentValue(value) {
  const trimmed = String(value ?? '').trim()
  return trimmed || '—'
}

export function formatAccomplishmentWeekLine(weekOf) {
  const range = weekOf ? formatWeekRange(weekOf) : ''
  return `Week of ${range || '—'}`
}

export function getAccomplishmentAttachmentLabel(attachmentUrl) {
  if (!attachmentUrl) return 'None'
  return getAttachmentDisplayName(attachmentUrl) || 'None'
}

export function getAccomplishmentDocumentFields({
  row,
  internName,
  studentIdNo,
  course,
  schoolName,
  companyName,
  supervisorName,
}) {
  const reportTitle = String(row?.title ?? '').trim()
  const weekLine = formatAccomplishmentWeekLine(row?.week_of)
  const normalizedInternName = normalizeDocumentValue(internName)
  const normalizedSupervisorName = normalizeDocumentValue(supervisorName)

  const infoRows = [
    { label: 'Name of Intern', value: normalizedInternName },
    { label: 'Student ID No.', value: normalizeDocumentValue(studentIdNo) },
    { label: 'Course', value: normalizeDocumentValue(course) },
    { label: 'School', value: normalizeDocumentValue(schoolName) },
    { label: 'Company', value: normalizeDocumentValue(companyName) },
    { label: 'Supervisor', value: normalizedSupervisorName },
  ]

  const sections = ACCOMPLISHMENT_DOCUMENT_SECTIONS.map((section) => {
    const rawValue = String(row?.[section.key] ?? '')
    const hasContent = Boolean(rawValue.trim())
    return {
      key: section.key,
      heading: section.heading,
      text: hasContent ? rawValue : section.emptyText,
      isEmpty: !hasContent,
    }
  })

  const attachmentLabel = getAccomplishmentAttachmentLabel(row?.attachment_url)

  return {
    reportTitle,
    weekLine,
    infoRows,
    sections,
    attachmentLabel,
    preparedByName: normalizedInternName,
    notedByName: normalizedSupervisorName,
  }
}

/**
 * Generates a complete standalone HTML document for printing or saving as PDF
 * matching the on-screen Weekly Accomplishment Report sheet (A4, 1-inch margins,
 * Arial 12pt, double-spaced justified narrative).
 */
export function buildAccomplishmentDocumentHtml({
  row,
  internName,
  studentIdNo,
  course,
  schoolName,
  companyName,
  supervisorName,
}) {
  const doc = getAccomplishmentDocumentFields({
    row,
    internName,
    studentIdNo,
    course,
    schoolName,
    companyName,
    supervisorName,
  })

  const pageTitle = doc.reportTitle
    ? `Weekly Accomplishment Report - ${doc.reportTitle}`
    : 'Weekly Accomplishment Report'

  const infoHtml = doc.infoRows
    .map(
      (entry) =>
        `<p class="info-line"><strong>${escapeHtml(entry.label)}:</strong> ${escapeHtml(entry.value)}</p>`,
    )
    .join('\n      ')

  const sectionsHtml = doc.sections
    .map(
      (section) => `<section class="doc-section">
        <h2 class="section-heading">${escapeHtml(section.heading)}</h2>
        <p class="section-body">${escapeHtml(section.text)}</p>
      </section>`,
    )
    .join('\n      ')

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(pageTitle)}</title>
  <style>
    @page {
      size: A4;
      margin: 1in;
    }

    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      padding: 0;
      background: #ffffff;
      color: #000000;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 12pt;
      line-height: 2;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .doc-sheet {
      width: 100%;
      max-width: 100%;
      margin: 0 auto;
      background: #ffffff;
      color: #000000;
    }

    .doc-header {
      text-align: center;
      margin-bottom: 1.5rem;
    }

    .doc-header h1 {
      margin: 0;
      font-size: 14pt;
      font-weight: 700;
      line-height: 1.4;
      color: #000000;
    }

    .doc-title {
      margin: 0.25rem 0 0;
      font-size: 12pt;
      font-weight: 700;
      line-height: 1.5;
      color: #000000;
    }

    .doc-week {
      margin: 0.2rem 0 0;
      font-size: 12pt;
      font-weight: 400;
      line-height: 1.5;
      color: #000000;
    }

    .info-block {
      margin: 1.5rem 0;
      line-height: 1.5;
    }

    .info-line {
      margin: 0.15rem 0;
      line-height: 1.5;
      overflow-wrap: break-word;
    }

    .doc-section {
      margin-top: 1.25rem;
    }

    .section-heading {
      margin: 0 0 0.25rem;
      font-size: 12pt;
      font-weight: 700;
      line-height: 1.5;
      color: #000000;
      break-after: avoid;
      page-break-after: avoid;
    }

    .section-body {
      margin: 0;
      font-size: 12pt;
      line-height: 2;
      text-align: justify;
      white-space: pre-wrap;
      overflow-wrap: break-word;
    }

    .attachment-line {
      margin: 1.5rem 0 0;
      line-height: 1.6;
      overflow-wrap: break-word;
    }

    .signature-block {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 3rem;
      margin-top: 3.5rem;
      line-height: 1.5;
      break-inside: avoid;
      page-break-inside: avoid;
    }

    .signature-col {
      min-width: 0;
    }

    .signature-label {
      margin: 0;
      font-size: 12pt;
      font-weight: 400;
      line-height: 1.5;
    }

    .signature-line {
      height: 2.75rem;
      border-bottom: 1px solid #000000;
    }

    .signature-name {
      margin: 0.35rem 0 0;
      font-size: 12pt;
      font-weight: 700;
      line-height: 1.4;
      overflow-wrap: break-word;
    }
  </style>
</head>
<body>
  <article class="doc-sheet">
    <header class="doc-header">
      <h1>Weekly Accomplishment Report</h1>
      ${doc.reportTitle ? `<p class="doc-title">${escapeHtml(doc.reportTitle)}</p>` : ''}
      <p class="doc-week">${escapeHtml(doc.weekLine)}</p>
    </header>

    <div class="info-block">
      ${infoHtml}
    </div>

    ${sectionsHtml}

    <p class="attachment-line"><strong>Attachment:</strong> ${escapeHtml(doc.attachmentLabel)}</p>

    <div class="signature-block">
      <div class="signature-col">
        <p class="signature-label">Prepared by:</p>
        <div class="signature-line"></div>
        <p class="signature-name">${escapeHtml(doc.preparedByName)}</p>
      </div>
      <div class="signature-col">
        <p class="signature-label">Noted by:</p>
        <div class="signature-line"></div>
        <p class="signature-name">${escapeHtml(doc.notedByName)}</p>
      </div>
    </div>
  </article>
</body>
</html>`
}
