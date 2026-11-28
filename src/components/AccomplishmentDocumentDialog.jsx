import { useState } from 'react'
import {
  buildAccomplishmentDocumentHtml,
  getAccomplishmentDocumentFields,
} from '../lib/accomplishmentDocument'
import { AlertMessage } from './AlertMessage'
import { StatusBadge } from './StatusBadge'
import { SubmissionDialog } from './SubmissionDialog'

function PrintIcon({ className = 'size-4 shrink-0' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
    >
      <path
        d="M6 7V3.5h8V7M6 13.5H4.5a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v4.5a1 1 0 0 1-1 1H14M6 11.5h8v5H6z"
        strokeLinecap="square"
      />
    </svg>
  )
}

export function AccomplishmentDocumentDialog({
  open,
  onClose,
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
}) {
  const [printError, setPrintError] = useState('')

  const hasData = Boolean(
    (Array.isArray(rows) && rows.length > 0) || row || weeklyReflection,
  )

  const docParams = {
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
  }

  const doc = hasData ? getAccomplishmentDocumentFields(docParams) : null

  function handleClose() {
    setPrintError('')
    onClose?.()
  }

  function handlePrint() {
    if (!hasData) return
    setPrintError('')

    const html = buildAccomplishmentDocumentHtml(docParams)

    const win = window.open('', '_blank', 'width=960,height=820')
    if (!win) {
      setPrintError(
        'Pop-up blocked by your browser. Allow pop-ups for this site to print or save this document as PDF.',
      )
      return
    }

    win.document.open()
    win.document.write(html)
    win.document.close()
    win.focus()
    window.setTimeout(() => {
      win.print()
    }, 250)
  }

  return (
    <SubmissionDialog
      open={Boolean(open && hasData)}
      title="Weekly Accomplishment Report"
      description="Official Student Internship Program document ready for review, printing, or saving as PDF."
      onClose={handleClose}
    >
      {hasData && doc ? (
        <div className="accomplishment-document-dialog-body space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={doc.documentMeta.statusKey} />
              {doc.reviewRecord.progressNote ? (
                <span className="text-xs text-ink-muted">
                  {doc.reviewRecord.progressNote}
                </span>
              ) : null}
            </div>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-[5px] bg-accent-solid px-3.5 text-xs font-medium text-on-accent hover:bg-accent-solid-hover"
            >
              <PrintIcon className="size-3.5" />
              <span>Print / Save as PDF</span>
            </button>
          </div>

          {printError ? (
            <AlertMessage message={printError} variant="error" />
          ) : null}

          <div className="rounded-[6px] border border-rule bg-canvas p-3 sm:p-5">
            <article
              aria-label="Weekly Accomplishment Report"
              className="accomplishment-document-sheet"
            >
              <header className="accomplishment-document-header">
                <p className="accomplishment-document-univ">
                  {doc.header.university}
                </p>
                <p className="accomplishment-document-campus">
                  {doc.header.campus}
                </p>
                <p className="accomplishment-document-program">
                  {doc.header.program}
                </p>
                <p className="accomplishment-document-sip">
                  {doc.header.programLabel}
                </p>
              </header>

              <div className="accomplishment-document-title-band">
                <h2>{doc.header.documentTitle}</h2>
                {doc.header.reportingPeriod ? (
                  <p className="accomplishment-document-period">
                    Reporting Period: {doc.header.reportingPeriod}
                  </p>
                ) : null}
              </div>

              <div className="accomplishment-document-meta-strip">
                {doc.documentMeta.referenceId ? (
                  <div>
                    <strong>Document Ref.:</strong>{' '}
                    <span>{doc.documentMeta.referenceId}</span>
                  </div>
                ) : null}
                {doc.documentMeta.reportingPeriod ? (
                  <div>
                    <strong>Reporting Period:</strong>{' '}
                    <span>{doc.documentMeta.reportingPeriod}</span>
                  </div>
                ) : null}
                <div>
                  <strong>Status:</strong>{' '}
                  <span>{doc.documentMeta.statusLabel}</span>
                </div>
                <div>
                  <strong>Generated:</strong>{' '}
                  <span>{doc.documentMeta.generatedDate}</span>
                </div>
              </div>

              <section className="accomplishment-document-block">
                <h3 className="accomplishment-document-block-title">
                  Intern and Placement Information
                </h3>
                <div className="accomplishment-document-table-scroll">
                  <table className="accomplishment-document-info-table">
                    <tbody>
                      {doc.infoTableRows.map((infoRow) => (
                        <tr key={infoRow.leftLabel}>
                          <th scope="row">{infoRow.leftLabel}</th>
                          <td>{infoRow.leftValue}</td>
                          <th scope="row">{infoRow.rightLabel}</th>
                          <td>{infoRow.rightValue}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="accomplishment-document-block">
                <h3 className="accomplishment-document-block-title">
                  Weekly Accomplishments
                </h3>
                <div className="accomplishment-document-table-scroll">
                  <table className="accomplishment-document-daily-table">
                    <thead>
                      <tr>
                        <th scope="col" className="col-date">
                          Date
                        </th>
                        <th scope="col" className="col-activity">
                          Activities Performed
                        </th>
                        <th scope="col" className="col-output">
                          Output / Result
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {doc.dailyEntries.length > 0 ? (
                        doc.dailyEntries.map((entry) => (
                          <tr key={entry.id}>
                            <td className="col-date">
                              <span className="accomplishment-document-date-primary">
                                {entry.dateLabel}
                              </span>
                              {entry.dateSubLabel ? (
                                <span className="accomplishment-document-date-sub">
                                  {entry.dateSubLabel}
                                </span>
                              ) : null}
                            </td>
                            <td className="col-activity">
                              {entry.activityHeading ? (
                                <div className="accomplishment-document-activity-heading">
                                  {entry.activityHeading}
                                </div>
                              ) : null}
                              <div className="accomplishment-document-pre">
                                {entry.activityBody}
                              </div>
                            </td>
                            <td className="col-output">
                              <div
                                className={`accomplishment-document-pre${
                                  entry.isOutputMissing ? ' is-empty' : ''
                                }`}
                              >
                                {entry.outputText}
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td
                            colSpan={3}
                            className="accomplishment-document-empty-cell"
                          >
                            No daily accomplishments recorded for this reporting
                            period.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {doc.attachments.length > 0 ? (
                  <div className="accomplishment-document-attachments-strip">
                    <strong>Supporting Attachments:</strong>{' '}
                    <span>
                      {doc.attachments
                        .map((file) =>
                          file.dateLabel
                            ? `${file.fileName} (${file.dateLabel})`
                            : file.fileName,
                        )
                        .join('; ')}
                    </span>
                  </div>
                ) : null}
              </section>

              <section className="accomplishment-document-block">
                <h3 className="accomplishment-document-block-title">
                  Learning and Reflection
                </h3>
                <div className="accomplishment-document-reflection-grid">
                  <div className="accomplishment-document-reflection-box">
                    <h4>{doc.reflection.skills.label}</h4>
                    <p
                      className={
                        doc.reflection.skills.isEmpty ? 'is-empty' : ''
                      }
                    >
                      {doc.reflection.skills.text}
                    </p>
                  </div>
                  <div className="accomplishment-document-reflection-box">
                    <h4>{doc.reflection.challenges.label}</h4>
                    <p
                      className={
                        doc.reflection.challenges.isEmpty ? 'is-empty' : ''
                      }
                    >
                      {doc.reflection.challenges.text}
                    </p>
                  </div>
                </div>
                <div className="accomplishment-document-reflection-box is-full">
                  <h4>{doc.reflection.lessons.label}</h4>
                  <p
                    className={
                      doc.reflection.lessons.isEmpty ? 'is-empty' : ''
                    }
                  >
                    {doc.reflection.lessons.text}
                  </p>
                </div>
              </section>

              <section className="accomplishment-document-block">
                <h3 className="accomplishment-document-block-title">
                  Submission and Review Record
                </h3>
                <div className="accomplishment-document-verify-grid">
                  <div className="accomplishment-document-verify-col">
                    <p className="accomplishment-document-verify-heading">
                      Prepared and Submitted By
                    </p>
                    <p className="accomplishment-document-verify-name">
                      {doc.submissionRecord.internName}
                    </p>
                    <p className="accomplishment-document-verify-role">
                      {doc.submissionRecord.role}
                    </p>
                    {doc.submissionRecord.submittedAt ? (
                      <p className="accomplishment-document-verify-detail">
                        <strong>Submission Date:</strong>{' '}
                        {doc.submissionRecord.submittedAt}
                      </p>
                    ) : null}
                  </div>

                  <div className="accomplishment-document-verify-col">
                    <p className="accomplishment-document-verify-heading">
                      Reviewed and Approved By
                    </p>
                    <p className="accomplishment-document-verify-name">
                      {doc.reviewRecord.supervisorName}
                    </p>
                    <p className="accomplishment-document-verify-role">
                      {doc.reviewRecord.role}
                    </p>
                    <p className="accomplishment-document-verify-status">
                      Review Status: {doc.reviewRecord.statusLabel}
                    </p>
                    {doc.reviewRecord.isApproved &&
                    doc.reviewRecord.approvedAt ? (
                      <p className="accomplishment-document-verify-detail">
                        <strong>Approval Date:</strong>{' '}
                        {doc.reviewRecord.approvedAt}
                      </p>
                    ) : null}
                    {!doc.reviewRecord.isApproved &&
                    doc.reviewRecord.reviewedAt ? (
                      <p className="accomplishment-document-verify-detail">
                        <strong>Last Reviewed:</strong>{' '}
                        {doc.reviewRecord.reviewedAt}
                      </p>
                    ) : null}
                    {doc.reviewRecord.progressNote ? (
                      <p className="accomplishment-document-verify-note">
                        {doc.reviewRecord.progressNote}
                      </p>
                    ) : null}
                  </div>
                </div>
              </section>

              <footer className="accomplishment-document-footer">
                <span>{doc.portalFooter}</span>
                <span>
                  {[
                    doc.documentMeta.referenceId,
                    `Generated ${doc.documentMeta.generatedDate}`,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </footer>
            </article>
          </div>
        </div>
      ) : null}
    </SubmissionDialog>
  )
}
