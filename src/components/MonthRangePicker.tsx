// src/components/MonthRangePicker.tsx
//
// PURE FRONTEND FILE — plain description:
// Two month inputs (Start month, End month) used by the export dialogs'
// "Month Selection" mode. Mirrors DateRangePicker's shape/behavior
// (inline validation if start is after end) but works in whole calendar
// months ("YYYY-MM") instead of specific days. The caller (ExportButton)
// is responsible for resolving the chosen months into concrete
// startDate/endDate day boundaries before hitting an export endpoint.

'use client';

import { useState } from 'react';

interface MonthRangePickerProps {
  onChange: (range: { startMonth: string; endMonth: string }) => void;
}

// def validateRange(): Input is two strings (startMonth, endMonth, both
// "YYYY-MM"). Output is one boolean (true if the range is valid, i.e.
// startMonth <= endMonth, or either is empty/not yet filled in).
// Pseudocode:
//   1. If either month is empty, return true (incomplete, not invalid
//      yet).
//   2. "YYYY-MM" strings compare correctly lexicographically, so just
//      return startMonth <= endMonth.
function validateRange(startMonth: string, endMonth: string): boolean {
  if (!startMonth || !endMonth) {
    return true;
  }
  return startMonth <= endMonth;
}

export function MonthRangePicker({ onChange }: MonthRangePickerProps) {
  const [startMonth, setStartMonth] = useState('');
  const [endMonth, setEndMonth] = useState('');
  const valid = validateRange(startMonth, endMonth);

  return (
    <div className="date-range">
      <div className="date-range__row">
        <label className="field">
          Start month
          <input
            type="month"
            value={startMonth}
            onChange={(e) => {
              setStartMonth(e.target.value);
              onChange({ startMonth: e.target.value, endMonth });
            }}
          />
        </label>
        <label className="field">
          End month
          <input
            type="month"
            value={endMonth}
            onChange={(e) => {
              setEndMonth(e.target.value);
              onChange({ startMonth, endMonth: e.target.value });
            }}
          />
        </label>
      </div>
      {!valid && <p role="alert">Start month must be before end month.</p>}
    </div>
  );
}
