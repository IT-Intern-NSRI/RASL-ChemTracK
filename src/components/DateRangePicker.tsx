// src/components/DateRangePicker.tsx
//
// PURE FRONTEND FILE — plain description:
// Two date inputs (Start, End) used by the history filter and both
// export dialogs. Shows an inline validation message if the start date
// is after the end date.

'use client';

import { useState } from 'react';

interface DateRangePickerProps {
  onChange: (range: { startDate: string; endDate: string }) => void;
}

// def validateRange(): Input is two strings (startDate, endDate, both
// "YYYY-MM-DD"). Output is one boolean (true if the range is valid, i.e.
// startDate <= endDate, or either is empty/not yet filled in).
// Pseudocode:
//   1. If either date is empty, return true (incomplete, not invalid
//      yet).
//   2. Return new Date(startDate) <= new Date(endDate).
function validateRange(startDate: string, endDate: string): boolean {
  if (!startDate || !endDate) {
    return true;
  }
  return new Date(startDate) <= new Date(endDate);
}

export function DateRangePicker({ onChange }: DateRangePickerProps) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const valid = validateRange(startDate, endDate);

  return (
    <div className="date-range">
      <div className="date-range__row">
        <label className="field">
          Start
          <input
            type="date"
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              onChange({ startDate: e.target.value, endDate });
            }}
          />
        </label>
        <label className="field">
          End
          <input
            type="date"
            value={endDate}
            onChange={(e) => {
              setEndDate(e.target.value);
              onChange({ startDate, endDate: e.target.value });
            }}
          />
        </label>
      </div>
      {!valid && <p role="alert">Start date must be before end date.</p>}
    </div>
  );
}
