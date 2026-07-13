// src/components/ExportButton.tsx
//
// PURE FRONTEND FILE — plain description:
// A button that opens a small popover/dialog containing a
// <DateRangePicker/> and a "Download" button. In "single" mode it hits
// the per-chemical export endpoint; in "bulk" mode it hits the bulk ZIP
// export endpoint. Triggers a normal browser file download on success.

'use client';

import { useState } from 'react';
import { DateRangePicker } from './DateRangePicker';

interface ExportButtonProps {
  mode: 'single' | 'bulk';
  chemicalId?: string; // required when mode === 'single'
}

export function ExportButton({ mode, chemicalId }: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<{ startDate: string; endDate: string } | null>(null);

  // def handleExport(): Input is none (reads `range` from closure).
  // Output is none (side effect: fetches the appropriate export endpoint
  // and triggers a browser file download of the response).
  // Pseudocode:
  //   1. If `range` is incomplete, do nothing (button should already be
  //      disabled in that case).
  //   2. If mode === 'single': GET
  //      /api/chemicals/${chemicalId}/export?startDate=...&endDate=....
  //      If mode === 'bulk': POST /api/export/bulk with
  //      { startDate, endDate } as JSON.
  //   3. Read the response as a Blob.
  //   4. Create an object URL, a temporary <a> with `download` set to a
  //      sensible filename, click it, then revoke the URL.
  async function handleExport(): Promise<void> {
    if (!range?.startDate || !range?.endDate) {
      return;
    }

    let response: Response;
    let filename: string;

    if (mode === 'single') {
      response = await fetch(
        `/api/chemicals/${chemicalId}/export?startDate=${range.startDate}&endDate=${range.endDate}`
      );
      filename = `${chemicalId}_${range.startDate}_${range.endDate}.pdf`;
    } else {
      response = await fetch('/api/export/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(range),
      });
      filename = `chemical-export_${range.startDate}_${range.endDate}.zip`;
    }

    if (!response.ok) {
      return;
    }

    const disposition = response.headers.get('Content-Disposition');
    const match = disposition?.match(/filename="?([^"]+)"?/);
    if (match?.[1]) {
      filename = match[1];
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <button onClick={() => setOpen(true)}>Export</button>
      {open && (
        <div>
          <DateRangePicker onChange={setRange} />
          <button onClick={handleExport} disabled={!range?.startDate || !range?.endDate}>
            Download
          </button>
        </div>
      )}
    </div>
  );
}
