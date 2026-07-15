// src/lib/timezone.ts
//
// All "today" auto-fill and the purge cutoff calculation must use the lab's
// local calendar date (Asia/Manila), not the server's or the browser's
// timezone, so "today" doesn't shift by a day depending on who/what is
// asking. APP_TIMEZONE is read from env so this can be changed in one
// place if the lab ever relocates.

import { formatInTimeZone } from 'date-fns-tz';
import { subYears } from 'date-fns';

const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Manila';

// def getTodayManila(): Input is none. Output is one string in
// "YYYY-MM-DD" format representing today's calendar date in Asia/Manila,
// right now. Used to auto-fill Date Received / Date Used fields on the
// logging forms.
// Pseudocode:
//   1. Get the current instant: `const now = new Date()`.
//   2. Convert it to the APP_TIMEZONE wall-clock date:
//      `formatInTimeZone(now, APP_TIMEZONE, 'yyyy-MM-dd')`.
//   3. Return that string.
export function getTodayManila(): string {
  const now = new Date();
  return formatInTimeZone(now, APP_TIMEZONE, 'yyyy-MM-dd');
}

// def getCutoffDateManila(): Input is one number (yearsAgo, e.g. 5 for the
// purge feature). Output is one string in "YYYY-MM-DD" format representing
// (today in Asia/Manila) minus that many years.
// Pseudocode:
//   1. Get today's Manila date via getTodayManila() and parse it back into
//      a Date.
//   2. Subtract `yearsAgo` years from it via date-fns's subYears().
//   3. Format the result as "yyyy-MM-dd" and return it.
export function getCutoffDateManila(yearsAgo: number): string {
  const today = new Date(`${getTodayManila()}T00:00:00Z`);
  const cutoff = subYears(today, yearsAgo);
  return formatInTimeZone(cutoff, 'UTC', 'yyyy-MM-dd');
}

// def toManilaDateOnly(): Input is one Date or ISO string representing any
// timestamp. Output is one string "YYYY-MM-DD" — that timestamp's calendar
// date as seen in Asia/Manila. Used when normalizing user-submitted dates
// and when formatting dates for display/export.
// Pseudocode:
//   1. Convert the input to a Date if it's a string (`new Date(input)`).
//   2. Format it in APP_TIMEZONE as 'yyyy-MM-dd' via formatInTimeZone().
//   3. Return the string.
export function toManilaDateOnly(input: Date | string): string {
  const date = typeof input === 'string' ? new Date(input) : input;
  return formatInTimeZone(date, APP_TIMEZONE, 'yyyy-MM-dd');
}

const MONTH_ABBREVIATIONS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// def formatMonthRangeLabel(): Input is two strings (startDate, endDate,
// both "YYYY-MM-DD" — the resolved calendar-day boundaries of a
// month-mode export, i.e. the 1st of the start month and the last day of
// the end month). Output is one abbreviated month-range label string,
// e.g. "Jan - Jun, 2024" when both months fall in the same year, or
// "Nov 2023 - Feb 2024" when the range spans a year boundary. Used to
// replace the "Date: <start> to <end>" header on exports generated in
// "Month Selection" mode.
// Pseudocode:
//   1. Parse the year and month out of each date string directly (no
//      Date object / timezone conversion needed — these are already
//      plain "YYYY-MM-DD" calendar strings).
//   2. Look up each month's abbreviation from MONTH_ABBREVIATIONS.
//   3. If both years match, return "<startAbbr> - <endAbbr>, <year>".
//      Otherwise return "<startAbbr> <startYear> - <endAbbr> <endYear>".
export function formatMonthRangeLabel(startDate: string, endDate: string): string {
  const [startYear, startMonth] = startDate.split('-').map(Number);
  const [endYear, endMonth] = endDate.split('-').map(Number);

  const startAbbr = MONTH_ABBREVIATIONS[startMonth - 1];
  const endAbbr = MONTH_ABBREVIATIONS[endMonth - 1];

  if (startYear === endYear) {
    return `${startAbbr} - ${endAbbr}, ${startYear}`;
  }
  return `${startAbbr} ${startYear} - ${endAbbr} ${endYear}`;
}
