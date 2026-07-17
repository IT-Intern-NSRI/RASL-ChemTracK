// src/components/ExportButton.tsx
//
// PURE FRONTEND FILE — plain description:
// A button that opens a small popover/dialog for exporting a chemical's
// (or, in "bulk" mode, every chemical's) usage register as a PDF. Only
// offers Month Selection (a start/end month, via <MonthRangePicker/>) —
// Date Selection was removed from the UI, though the underlying API and
// PDF generator both still fully support it (rangeType: 'date') for other
// callers, e.g. the 5-year purge's backup ZIP. The chosen months are
// resolved client-side into concrete start/end dates (1st of the start
// month through the last day of the end month) before hitting the export
// endpoint, with rangeType always sent as 'month' so the server generates
// one page per calendar month with per-month balances. In "single" mode
// this hits the per-chemical export endpoint; in "bulk" mode it hits the
// bulk ZIP export endpoint. Triggers a normal browser file download on
// success.

'use client';

import { useState } from 'react';
import { MonthRangePicker } from './MonthRangePicker';

interface ExportButtonProps {
  mode: 'single' | 'bulk';
  chemicalId?: string; // required when mode === 'single'
}

// def lastDayOfMonth(): Input is one string (yearMonth, "YYYY-MM").
// Output is one string ("YYYY-MM-DD") — the last calendar day of that
// month. Pure day-count arithmetic (new Date(year, month, 0).getDate()
// gives the day count of the *previous* month index when month is
// 1-indexed input + 0), no timezone conversion involved since this never
// touches an actual instant, just a day count.
// Pseudocode:
//   1. Split yearMonth into year, month (both numbers).
//   2. daysInMonth = new Date(year, month, 0).getDate().
//   3. Return `${yearMonth}-${daysInMonth, zero-padded}`.
function lastDayOfMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  return `${yearMonth}-${String(daysInMonth).padStart(2, '0')}`;
}

export function ExportButton({ mode, chemicalId }: ExportButtonProps) {
  const [open, setOpen] = useState(false);
  const [monthRange, setMonthRange] = useState<{ startMonth: string; endMonth: string } | null>(null);

  // The resolved, concrete { startDate, endDate } to actually send to the
  // server.
  const resolvedRange: { startDate: string; endDate: string } | null =
    monthRange?.startMonth && monthRange?.endMonth
      ? { startDate: `${monthRange.startMonth}-01`, endDate: lastDayOfMonth(monthRange.endMonth) }
      : null;

  // def handleExport(): Input is none (reads `resolvedRange` from
  // closure). Output is none (side effect: fetches the appropriate export
  // endpoint and triggers a browser file download of the response).
  // Pseudocode:
  //   1. If `resolvedRange` is incomplete, do nothing (button should
  //      already be disabled in that case).
  //   2. If mode === 'single': GET
  //      /api/chemicals/${chemicalId}/export?startDate=...&endDate=...&rangeType=month.
  //      If mode === 'bulk': POST /api/export/bulk with
  //      { startDate, endDate, rangeType: 'month' } as JSON.
  //   3. Read the response as a Blob.
  //   4. Create an object URL, a temporary <a> with `download` set to a
  //      sensible filename, click it, then revoke the URL.
  async function handleExport(): Promise<void> {
    if (!resolvedRange?.startDate || !resolvedRange?.endDate) {
      return;
    }

    const { startDate, endDate } = resolvedRange;

    let response: Response;
    let filename: string;

    if (mode === 'single') {
      response = await fetch(
        `/api/chemicals/${chemicalId}/export?startDate=${startDate}&endDate=${endDate}&rangeType=month`
      );
      filename = `${chemicalId}_${startDate}_${endDate}.pdf`;
    } else {
      response = await fetch('/api/export/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate, rangeType: 'month' }),
      });
      filename = `chemical-export_${startDate}_${endDate}.zip`;
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
    <div className="export">
      <button onClick={() => setOpen(true)} className="btn btn-secondary">
        Export
      </button>
      {open && (
        <div className="export__popover">
          <MonthRangePicker onChange={setMonthRange} />
          <button
            type="button"
            onClick={handleExport}
            disabled={!resolvedRange?.startDate || !resolvedRange?.endDate}
            className="btn btn-primary btn-sm"
          >
            Download
          </button>
        </div>
      )}
    </div>
  );
}
