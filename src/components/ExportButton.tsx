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
//
// Hitting the "Download" button opens a second, blocking progress modal
// (separate from the month-picker popover, which closes) reading "Please
// wait while your download is being processed.", with a close ("×")
// button in its top-right corner and a visible 60-second countdown. Three
// ways this can resolve:
//   - The export finishes before the countdown reaches 0: the file
//     download triggers and the modal closes on its own.
//   - The countdown reaches 0 before the export finishes (slow network/a
//     large bulk export): the modal switches to a "still working — try
//     again?" prompt with a "Download Again" button, which restarts the
//     whole export from scratch (aborting whatever was still in flight).
//     If the original, now-abandoned request happens to finish anyway
//     after this point, its result is ignored.
//   - The user clicks the "×" close button at any point: the modal closes
//     immediately and the in-flight request (if any) is aborted.

'use client';

import { useEffect, useRef, useState } from 'react';
import { MonthRangePicker } from './MonthRangePicker';

interface ExportButtonProps {
  mode: 'single' | 'bulk';
  chemicalId?: string; // required when mode === 'single'
}

const COUNTDOWN_SECONDS = 60;

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

  // 'idle': no progress modal. 'processing': modal open, counting down.
  // 'timedOut': countdown hit 0 before the export finished; showing the
  // "Download Again" prompt.
  const [progressState, setProgressState] = useState<'idle' | 'processing' | 'timedOut'>('idle');
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);

  const abortControllerRef = useRef<AbortController | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clears the countdown interval, if any is running. Does not touch the
  // in-flight request or progressState — callers decide those separately.
  function stopCountdown(): void {
    if (countdownIntervalRef.current !== null) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }

  // Aborts whatever export request is currently in flight (a no-op if
  // none is), so a stale response can't trigger a download after the
  // user has moved on (closed the modal, or started a fresh attempt via
  // "Download Again").
  function abortInFlightExport(): void {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }

  // def handleCloseProgress(): Input is none. Output is none (side
  // effects: stops the countdown, aborts any in-flight export request,
  // and closes the progress modal).
  function handleCloseProgress(): void {
    stopCountdown();
    abortInFlightExport();
    setProgressState('idle');
  }

  // The resolved, concrete { startDate, endDate } to actually send to the
  // server.
  const resolvedRange: { startDate: string; endDate: string } | null =
    monthRange?.startMonth && monthRange?.endMonth
      ? { startDate: `${monthRange.startMonth}-01`, endDate: lastDayOfMonth(monthRange.endMonth) }
      : null;

  // def performExport(): Input is none (reads `resolvedRange` from
  // closure). Output is none (side effects: opens the progress modal and
  // starts its 60-second countdown, fetches the appropriate export
  // endpoint, and — if that request wins the race against the countdown
  // and against being aborted — triggers a browser file download and
  // closes the modal).
  // Pseudocode:
  //   1. If `resolvedRange` is incomplete, do nothing (the Download
  //      button should already be disabled in that case).
  //   2. Abort any export already in flight (e.g. this is a "Download
  //      Again" retry), then start a fresh AbortController for this
  //      attempt.
  //   3. Close the month-picker popover, open the progress modal in its
  //      'processing' state, and reset the countdown to 60.
  //   4. Start a 1-second interval decrementing the countdown; when it
  //      reaches 0, stop the interval and switch the modal to
  //      'timedOut' (leaving the request itself running in the
  //      background — see module comment).
  //   5. If mode === 'single': GET
  //      /api/chemicals/${chemicalId}/export?startDate=...&endDate=...&rangeType=month.
  //      If mode === 'bulk': POST /api/export/bulk with
  //      { startDate, endDate, rangeType: 'month' } as JSON. Both carry
  //      this attempt's AbortSignal.
  //   6. On success: read the response as a Blob, create an object URL, a
  //      temporary <a> with `download` set to a sensible filename, click
  //      it, then revoke the URL. Stop the countdown and close the
  //      progress modal (regardless of whether it had already switched to
  //      'timedOut').
  //   7. On failure: if it's an AbortError (this attempt was superseded
  //      or the user closed the modal), do nothing further. Otherwise,
  //      stop the countdown and switch to the 'timedOut' prompt so the
  //      user has a way to retry instead of the modal silently hanging.
  async function performExport(): Promise<void> {
    if (!resolvedRange?.startDate || !resolvedRange?.endDate) {
      return;
    }

    const { startDate, endDate } = resolvedRange;

    abortInFlightExport();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setOpen(false);
    setProgressState('processing');
    setSecondsLeft(COUNTDOWN_SECONDS);

    stopCountdown();
    countdownIntervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          stopCountdown();
          setProgressState('timedOut');
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    try {
      let response: Response;
      let filename: string;

      if (mode === 'single') {
        response = await fetch(
          `/api/chemicals/${chemicalId}/export?startDate=${startDate}&endDate=${endDate}&rangeType=month`,
          { signal: controller.signal }
        );
        filename = `${chemicalId}_${startDate}_${endDate}.pdf`;
      } else {
        response = await fetch('/api/export/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ startDate, endDate, rangeType: 'month' }),
          signal: controller.signal,
        });
        filename = `chemical-export_${startDate}_${endDate}.zip`;
      }

      if (!response.ok) {
        throw new Error('Export failed');
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

      stopCountdown();
      abortControllerRef.current = null;
      setProgressState('idle');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      stopCountdown();
      setProgressState('timedOut');
    }
  }

  // Guards against a leaked interval / dangling request if the component
  // unmounts mid-export (e.g. the user navigates away).
  useEffect(() => {
    return () => {
      stopCountdown();
      abortInFlightExport();
    };
  }, []);

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
            onClick={performExport}
            disabled={!resolvedRange?.startDate || !resolvedRange?.endDate}
            className="btn btn-primary btn-sm"
          >
            Download
          </button>
        </div>
      )}

      {progressState !== 'idle' && (
        <div className="dialog-backdrop">
          <div role="dialog" className="dialog dialog--progress">
            <button
              type="button"
              onClick={handleCloseProgress}
              className="btn btn-ghost dialog__close"
              aria-label="Close"
            >
              ×
            </button>

            {progressState === 'processing' ? (
              <>
                <p className="export-progress__message">
                  Please wait while your download is being processed.
                </p>
                <div className="export-progress__timer">{secondsLeft}s</div>
              </>
            ) : (
              <>
                <p className="export-progress__message">
                  Please wait while your download is being processed.
                </p>
                <p className="export-progress__retry-message">
                  This is taking longer than expected.
                </p>
                <button type="button" onClick={performExport} className="btn btn-primary">
                  Download Again
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
