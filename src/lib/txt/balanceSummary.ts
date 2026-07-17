// src/lib/txt/balanceSummary.ts
//
// Renders the bulk-export "balance summary" as a simple, fixed-width
// plain-text table (bundled into the bulk export ZIP alongside the
// per-chemical PDFs — see src/lib/zip/bulkExport.ts). One row per
// chemical:
//
//   Chemical Name | Beginning Balance | Sold/Used | End Balance
//
// - Beginning Balance: that chemical's Current Balance (total inventory)
//   exactly prior to the export's date range.
// - End Balance: that chemical's Current Balance exactly after the
//   export's date range.
// - Sold/Used: the sum of every USAGE row's quantity within the export's
//   date range. Does NOT net against any STOCK_IN in the same range, so
//   it will not, in general, equal End Balance - Beginning Balance.
//
// See src/lib/balance.ts's computeChemicalBalanceSummary() for how each
// row's figures are actually computed.

import { ChemicalBalanceSummary } from '../balance';

const COLUMN_HEADERS = ['Chemical Name', 'Beginning Balance', 'Sold/Used', 'End Balance'];

// def formatQuantity(): Input is one number (a balance figure, in the
// chemical's own unit) and one string (that chemical's unit, e.g. "L").
// Output is one display string, fixed to 4 decimal places (matching the
// schema's Decimal(14, 4) precision) with the unit appended, e.g.
// "120.0000 L".
// Pseudocode:
//   1. Call value.toFixed(4).
//   2. Return `${fixed} ${unit}`.
function formatQuantity(value: number, unit: string): string {
  return `${value.toFixed(4)} ${unit}`;
}

// def buildBalanceSummaryText(): Input is one array of
// ChemicalBalanceSummary (one per chemical included in the bulk export,
// in the same order as the ZIP's PDFs), and one range label string (e.g.
// "Jan - Jun, 2024", from formatMonthRangeLabel — used only in the
// document's title line, not the table itself). Output is one string:
// the complete plain-text table, ready to write out as a .txt file.
// Pseudocode:
//   1. Build each row's four display strings: chemical.chemicalName as-is;
//      the other three via formatQuantity(value, chemical.unit).
//   2. For each column, compute its width as the max length across its
//      header and every row's value in that column (so columns line up
//      regardless of how long any chemical's name or numbers are).
//   3. Render a title line ("Chemical Balance Summary" + the range
//      label), a blank line, the header row (each cell left-padded... no,
//      left-aligned/padded to its column width), a separator line of
//      dashes spanning the full table width, then one row per chemical
//      (in the same order as input), each cell padded to its column
//      width and separated by " | ".
//   4. Join everything with newlines and return.
export function buildBalanceSummaryText(
  summaries: ChemicalBalanceSummary[],
  rangeLabel: string
): string {
  const rows = summaries.map((s) => [
    s.chemicalName,
    formatQuantity(s.beginningBalance, s.unit),
    formatQuantity(s.soldUsed, s.unit),
    formatQuantity(s.endBalance, s.unit),
  ]);

  const columnWidths = COLUMN_HEADERS.map((header, colIndex) =>
    Math.max(header.length, ...rows.map((row) => row[colIndex].length))
  );

  function renderRow(cells: string[]): string {
    return cells.map((cell, i) => cell.padEnd(columnWidths[i])).join(' | ');
  }

  const headerLine = renderRow(COLUMN_HEADERS);
  const separatorLine = '-'.repeat(
    columnWidths.reduce((sum, w) => sum + w, 0) + 3 * (columnWidths.length - 1)
  );

  const lines = [
    'Chemical Balance Summary',
    `Range: ${rangeLabel}`,
    '',
    headerLine,
    separatorLine,
    ...rows.map((row) => renderRow(row)),
  ];

  return lines.join('\n');
}
