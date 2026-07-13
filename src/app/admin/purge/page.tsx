// src/app/admin/purge/page.tsx
//
// PURE FRONTEND FILE — plain description:
// The manual 5-year record-purge utility. Shows explanatory text. Step 1:
// a "Prepare & Download Backup" button that calls the prepare endpoint,
// triggers a browser download of the returned backup ZIP, and reveals the
// plan summary (chemicals affected, row counts). Step 2: a "Confirm
// Deletion" button, disabled until step 1 has completed, which finalizes
// the purge after a final confirmation dialog. A results panel shows the
// outcome after confirming.

'use client';

import { useState } from 'react';
import { ConfirmDialog } from '@/components/ConfirmDialog';

export default function PurgePage() {
  const [purgeToken, setPurgeToken] = useState<string | null>(null);
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDeletion, setConfirmingDeletion] = useState(false);

  // def handlePrepare(): Input is none (button click). Output is none
  // (side effects: POSTs /api/admin/purge/prepare, triggers a browser
  // file download of the ZIP response body, and stores the returned
  // X-Purge-Token / X-Purge-Summary headers into state).
  // Pseudocode:
  //   1. POST to /api/admin/purge/prepare (empty body -> default 5-year
  //      cutoff).
  //   2. Read the X-Purge-Token and X-Purge-Summary response headers;
  //      JSON.parse the summary header.
  //   3. Read the response body as a Blob and trigger a download (create
  //      an <a> with a blob URL, click it, revoke the URL).
  //   4. Store purgeToken and summary in state.
  //   5. On failure, set `error`.
  async function handlePrepare(): Promise<void> {
    setError(null);
    const response = await fetch('/api/admin/purge/prepare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? 'Failed to prepare purge');
      return;
    }

    const token = response.headers.get('X-Purge-Token');
    const summaryHeader = response.headers.get('X-Purge-Summary');
    const parsedSummary = summaryHeader ? JSON.parse(summaryHeader) : null;

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `purge-backup_${parsedSummary?.cutoffDate ?? 'backup'}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setPurgeToken(token);
    setSummary(parsedSummary);
  }

  // def handleConfirm(): Input is none (button click). Output is none
  // (side effect: POSTs /api/admin/purge/confirm with the stored
  // purgeToken, stores the result summary, and clears purgeToken so the
  // button disables again).
  // Pseudocode:
  //   1. Require purgeToken to be set (button should already be disabled
  //      otherwise).
  //   2. Show a final "are you sure" confirmation (e.g. <ConfirmDialog/>)
  //      before proceeding, since this is destructive.
  //   3. POST { purgeToken } as JSON to /api/admin/purge/confirm.
  //   4. On success, setResult(parsed summary), clear purgeToken.
  //   5. On failure (e.g. 410 expired token), set `error` instructing the
  //      user to prepare again.
  async function submitConfirm(): Promise<void> {
    if (!purgeToken) return;

    setError(null);
    const response = await fetch('/api/admin/purge/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purgeToken }),
    });

    if (response.ok) {
      const parsed = await response.json();
      setResult(parsed);
      setPurgeToken(null);
    } else {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? 'Purge token expired or invalid — please prepare again.');
    }
  }

  async function handleConfirm(): Promise<void> {
    if (!purgeToken) return;
    setConfirmingDeletion(true);
  }

  return (
    <div className="page page--narrow">
      <div className="page-header">
        <h1>Old-Record Cleanup</h1>
      </div>
      <div className="card">
        <p>
          Removes transactions older than 5 years from the live database,
          after generating a full backup ZIP of exactly what will be
          deleted. This must be run manually — nothing is deleted
          automatically.
        </p>
        <div className="form-actions">
          <button onClick={handlePrepare} className="btn btn-primary">
            Prepare &amp; Download Backup
          </button>
        </div>
        {summary && (
          <div>
            <h2>Purge Plan</h2>
            <p>Cutoff date: {String(summary.cutoffDate)}</p>
            <p>Chemicals affected: {String(summary.chemicalsAffected)}</p>
            <p>Total rows to delete: {String(summary.totalRowsToDelete)}</p>
            <ul className="summary-list">
              {(summary.perChemical as Array<Record<string, unknown>>)?.map((row) => (
                <li key={String(row.chemicalId)}>
                  {String(row.chemicalName)}: {String(row.rowsToDelete)} row(s)
                </li>
              ))}
            </ul>
            <div className="form-actions">
              <button onClick={handleConfirm} disabled={!purgeToken} className="btn btn-danger">
                Confirm Deletion
              </button>
            </div>
          </div>
        )}
        {result && (
          <div>
            <h2>Purge Complete</h2>
            <p>Purge completed at {String(result.performedAt)}.</p>
            <p>Cutoff date: {String(result.cutoffDate)}</p>
            <p>Chemicals affected: {String(result.chemicalsAffected)}</p>
            <p>Total rows deleted: {String(result.totalRowsToDelete)}</p>
          </div>
        )}
        {error && <p role="alert">{error}</p>}
      </div>
      {confirmingDeletion && (
        <ConfirmDialog
          title="Delete these records?"
          message="This permanently removes the transactions listed above from the live database. Make sure you've downloaded and kept the backup ZIP first."
          onConfirm={() => {
            setConfirmingDeletion(false);
            submitConfirm();
          }}
          onCancel={() => setConfirmingDeletion(false)}
        />
      )}
    </div>
  );
}
