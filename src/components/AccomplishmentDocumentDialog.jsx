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
  row,
  internName,
  studentIdNo,
  course,
  schoolName,
  companyName,
  supervisorName,
}) {
  const [printError, setPrintError] = useState('')

  const doc = row
    ? getAccomplishmentDocumentFields({
        row,
        internName,
        studentIdNo,
        course,
        schoolName,
        companyName,
        supervisorName,
      })
    : null

  function handleClose() {
    setPrintError('')
    onClose?.()
  }

  function handlePrint() {
    if (!row) return
    setPrintError('')

    const html = buildAccomplishmentDocumentHtml({
      row,
      internName,
      studentIdNo,
      course,
      schoolName,
      companyName,
      supervisorName,
    })

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
      open={Boolean(open && row)}
      title="Weekly Accomplishment Document"
      description="Formatted internship accomplishment report ready to print or save as PDF."
      onClose={handleClose}
    >
      {row && doc ? (
        <div className="accomplishment-document-dialog-body space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {row.status ? <StatusBadge status={row.status} /> : null}
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
                <h2>Weekly Accomplishment Report</h2>
                {doc.reportTitle ? (
                  <p className="accomplishment-document-title">
                    {doc.reportTitle}
                  </p>
                ) : null}
                <p className="accomplishment-document-week">{doc.weekLine}</p>
              </header>

              <div className="accomplishment-document-info">
                {doc.infoRows.map((entry) => (
                  <p key={entry.label}>
                    <strong>{entry.label}:</strong> {entry.value}
                  </p>
                ))}
              </div>

              {doc.sections.map((section) => (
                <section
                  key={section.key}
                  className="accomplishment-document-section"
                >
                  <h3>{section.heading}</h3>
                  <p>{section.text}</p>
                </section>
              ))}

              <p className="accomplishment-document-attachment">
                <strong>Attachment:</strong> {doc.attachmentLabel}
              </p>

              <div className="accomplishment-document-signatures">
                <div className="accomplishment-document-signature-col">
                  <p className="accomplishment-document-signature-label">
                    Prepared by:
                  </p>
                  <div
                    aria-hidden="true"
                    className="accomplishment-document-signature-line"
                  />
                  <p className="accomplishment-document-signature-name">
                    {doc.preparedByName}
                  </p>
                </div>

                <div className="accomplishment-document-signature-col">
                  <p className="accomplishment-document-signature-label">
                    Noted by:
                  </p>
                  <div
                    aria-hidden="true"
                    className="accomplishment-document-signature-line"
                  />
                  <p className="accomplishment-document-signature-name">
                    {doc.notedByName}
                  </p>
                </div>
              </div>
            </article>
          </div>
        </div>
      ) : null}
    </SubmissionDialog>
  )
}
