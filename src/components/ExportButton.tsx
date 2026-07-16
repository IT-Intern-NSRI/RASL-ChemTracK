// src/components/ExportButton.tsx
//
// PURE FRONTEND FILE — plain description:
// A button that opens a small popover/dialog offering two export range
// modes: "Date Selection" (pick specific start/end dates, via
// <DateRangePicker/>) and "Month Selection" (pick a start/end month, via
// <MonthRangePicker/>). Month Selection is resolved client-side into
// concrete start/end dates (1st of the start month through the last day
// of the end month) before hitting the export endpoint, and the chosen
// mode is sent along as `rangeType` so the generated PDF's header prints
// an abbreviated month range (e.g. "Jan - Jun, 2024") instead of literal
// dates. In "single" mode this hits the per-chemical export endpoint; in
// "bulk" mode it hits the bulk ZIP export endpoint. Triggers a normal
// browser file download on success.

'use client';

import { useState } from 'react';
import { DateRangePicker } from './DateRangePicker';
import { MonthRangePicker } from './MonthRangePicker';

interface ExportButtonProps {
  mode: 'single' | 'bulk';
  chemicalId?: string; // required when mode === 'single'
}

type RangeMode = 'date' | 'month';

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
  const [rangeMode, setRangeMode] = useState<RangeMode>('date');
  const [dateRange, setDateRange] = useState<{ startDate: string; endDate: string } | null>(null);
  const [monthRange, setMonthRange] = useState<{ startMonth: string; endMonth: string } | null>(null);

  // The resolved, concrete { startDate, endDate } to actually send to the
  // server, regardless of which picker the user is using.
  const resolvedRange: { startDate: string; endDate: string } | null =
    rangeMode === 'date'
      ? dateRange
      : monthRange?.startMonth && monthRange?.endMonth
        ? { startDate: `${monthRange.startMonth}-01`, endDate: lastDayOfMonth(monthRange.endMonth) }
        : null;

  // def handleExport(): Input is none (reads `resolvedRange` and
  // `rangeMode` from closure). Output is none (side effect: fetches the
  // appropriate export endpoint and triggers a browser file download of
  // the response).
  // Pseudocode:
  //   1. If `resolvedRange` is incomplete, do nothing (button should
  //      already be disabled in that case).
  //   2. If mode === 'single': GET
  //      /api/chemicals/${chemicalId}/export?startDate=...&endDate=...&rangeType=....
  //      If mode === 'bulk': POST /api/export/bulk with
  //      { startDate, endDate, rangeType } as JSON.
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
        `/api/chemicals/${chemicalId}/export?startDate=${startDate}&endDate=${endDate}&rangeType=${rangeMode}`
      );
      filename = `${chemicalId}_${startDate}_${endDate}.pdf`;
    } else {
      response = await fetch('/api/export/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate, rangeType: rangeMode }),
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
          <div className="export__mode-toggle" role="radiogroup" aria-label="Export range mode">
            <button
              type="button"
              className={`btn btn-sm ${rangeMode === 'date' ? 'btn-primary' : 'btn-secondary'}`}
              aria-pressed={rangeMode === 'date'}
              onClick={() => setRangeMode('date')}
            >
              Date Selection
            </button>
            <button
              type="button"
              className={`btn btn-sm ${rangeMode === 'month' ? 'btn-primary' : 'btn-secondary'}`}
              aria-pressed={rangeMode === 'month'}
              onClick={() => setRangeMode('month')}
            >
              Month Selection
            </button>
          </div>
          {rangeMode === 'date' ? (
            <DateRangePicker onChange={setDateRange} />
          ) : (
            <MonthRangePicker onChange={setMonthRange} />
          )}
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