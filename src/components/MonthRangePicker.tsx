// src/components/MonthRangePicker.tsx
//
// PURE FRONTEND FILE — plain description:
// Start month / End month selectors used by the export dialogs' "Month
// Selection" mode. Each side is two <select> dropdowns (Month, Year)
// rather than a native <input type="month">, since that input type isn't
// reliably supported across browsers (notably Safari, where it silently
// falls back to a plain text field) — which left the value permanently
// empty and made Month Selection export impossible to trigger in those
// browsers. Dropdowns work identically everywhere. Mirrors
// DateRangePicker's shape/behavior (inline validation if start is after
// end) but composes whole calendar months ("YYYY-MM") instead of specific
// days. The caller (ExportButton) is responsible for resolving the chosen
// months into concrete startDate/endDate day boundaries before hitting an
// export endpoint.

'use client';

import { useState } from 'react';

interface MonthRangePickerProps {
  onChange: (range: { startMonth: string; endMonth: string }) => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// How many years back (in addition to the current year) to offer in the
// Year dropdowns. Generous enough to cover any realistic export range
// without the list becoming unwieldy.
const YEARS_BACK = 10;

function currentYear(): number {
  return new Date().getFullYear();
}

function yearOptions(): number[] {
  const thisYear = currentYear();
  const years: number[] = [];
  for (let y = thisYear; y >= thisYear - YEARS_BACK; y--) {
    years.push(y);
  }
  return years;
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

// def combine(): Input is two strings (year, month — month may be '' if
// not yet chosen). Output is one "YYYY-MM" string, or '' if either part
// is missing.
function combine(year: string, month: string): string {
  if (!year || !month) {
    return '';
  }
  return `${year}-${month}`;
}

export function MonthRangePicker({ onChange }: MonthRangePickerProps) {
  const years = yearOptions();

  const [startYear, setStartYear] = useState('');
  const [startMonthNum, setStartMonthNum] = useState('');
  const [endYear, setEndYear] = useState('');
  const [endMonthNum, setEndMonthNum] = useState('');

  const startMonth = combine(startYear, startMonthNum);
  const endMonth = combine(endYear, endMonthNum);
  const valid = validateRange(startMonth, endMonth);

  function emit(next: {
    startYear: string;
    startMonthNum: string;
    endYear: string;
    endMonthNum: string;
  }) {
    onChange({
      startMonth: combine(next.startYear, next.startMonthNum),
      endMonth: combine(next.endYear, next.endMonthNum),
    });
  }

  return (
    <div className="date-range">
      <div className="date-range__row">
        <label className="field">
          Start month
          <select
            value={startMonthNum}
            onChange={(e) => {
              setStartMonthNum(e.target.value);
              emit({ startYear, startMonthNum: e.target.value, endYear, endMonthNum });
            }}
          >
            <option value="">Month</option>
            {MONTH_NAMES.map((name, i) => (
              <option key={name} value={String(i + 1).padStart(2, '0')}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Year
          <select
            value={startYear}
            onChange={(e) => {
              setStartYear(e.target.value);
              emit({ startYear: e.target.value, startMonthNum, endYear, endMonthNum });
            }}
          >
            <option value="">Year</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="date-range__row">
        <label className="field">
          End month
          <select
            value={endMonthNum}
            onChange={(e) => {
              setEndMonthNum(e.target.value);
              emit({ startYear, startMonthNum, endYear, endMonthNum: e.target.value });
            }}
          >
            <option value="">Month</option>
            {MONTH_NAMES.map((name, i) => (
              <option key={name} value={String(i + 1).padStart(2, '0')}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Year
          <select
            value={endYear}
            onChange={(e) => {
              setEndYear(e.target.value);
              emit({ startYear, startMonthNum, endYear: e.target.value, endMonthNum });
            }}
          >
            <option value="">Year</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!valid && <p role="alert">Start month must be before end month.</p>}
    </div>
  );
}