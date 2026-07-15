// src/lib/pdf/chemicalDocument.ts
//
// Builds the pdfmake "document definition" for one chemical's exported
// register page, matching the layout of the reference PDEA Register 2-13
// paper form as closely as possible:
//   - A per-page header (repeats on every page): the register label +
//     boilerplate subtitle on the left, "Page No." + the covered date
//     range on the right.
//   - A one-time content header: the chemical's full CPECS descriptor
//     (bold, centered) with its "CPECS (name, form, purity, packaging)"
//     caption underneath (italic, centered), a full-width rule, then a
//     four-figure IN / OUT / Initial Stock / Balance Forwarded summary
//     row (see the definitions below — confirmed against a real
//     reference export).
//   - The 11-column transaction table with a fully ruled grid, white
//     background, and centered column headers, repeating across pages.
//     REPLENISH transactions are excluded from this table entirely (they
//     still affect the Out Balance chain other rows carry, just aren't
//     shown as their own row) — per project decision, replenish logs
//     never appear in the exported PDF.
//   - A signature footer: a rule, the signatory's name (with credentials
//     appended on the same line) sitting on the rule, and the signatory's
//     title directly below in italics.
//
// Summary-row definitions (each confirmed against a real reference
// export spanning several months):
//   - "IN (L)": sum of quantityReceived across STOCK_IN rows in range.
//   - "OUT (L)": NOT a sum of usage. It's the Current Out Balance as of
//     immediately before this report's date range (i.e.
//     options.initialOutBalance) — the same figure carries unchanged
//     across a whole report if no USAGE/REPLENISH occurred in range.
//   - "Initial Stock (L)": the Current Balance (total inventory) as of
//     immediately before this report's date range
//     (options.initialCurrentBalance).
//   - "Balance Forwarded (L)": IN + (the last transaction in range's
//     Balance (Out), of ANY type including REPLENISH, or "OUT (L)" if
//     there were no transactions in range) + "Initial Stock (L)" -
//     "OUT (L)". This is what "Initial Stock" becomes on the *next*
//     report.

import { TDocumentDefinitions, ContentTable } from 'pdfmake/interfaces';
import { Chemical, Transaction, AppSettings } from '@prisma/client';

export interface ChemicalDocOptions {
  chemical: Chemical;
  transactions: Transaction[]; // pre-filtered to the export date range, chronological order, ALL types (including REPLENISH — needed for the Balance Forwarded figure even though replenish rows aren't individually displayed)
  startDate: string; // "YYYY-MM-DD"
  endDate: string; // "YYYY-MM-DD"
  dateLabel?: string; // when the export was requested in "Month Selection" mode, this is the pre-formatted abbreviated month-range label (e.g. "Jan - Jun, 2024") to print in the header instead of the literal startDate/endDate
  initialCurrentBalance: number; // currentBalanceAfter of the last transaction dated before startDate (0 if none) — "Initial Stock"
  initialOutBalance: number; // balanceOut of the last transaction dated before startDate (0 if none) — the top "OUT (L)" figure
  settings: AppSettings;
}

// The fixed 11 columns, in order, matching the reference form. REPLENISH
// transactions never populate a row in this table (see module comment).
export const COLUMN_LABELS = [
  'Date Received',
  'Supplier Information',
  'Name of trucker/carrier',
  'Lot/Batch No.',
  'Quantity Received (L)',
  'Date Used',
  'Details of Usage',
  'Work Order No.',
  'Lot/Batch No. of used CPECS',
  'Quantity Used',
  'Balance (Out)',
] as const;

// Columns whose values should be right-aligned, matching the reference
// form's numeric-column convention.
const RIGHT_ALIGNED_COLUMN_INDICES = new Set([4, 9, 10]);

const DEFAULT_REGISTER_LABEL = 'PDEA P Register 2-13';
const REGISTER_SUBTITLE = '(Records required of a P3/P5-IM/P6) license holders';

const GRID_LINE_WIDTH = 0.75;
const GRID_LINE_COLOR = '#000000';

function cell(value: string, columnIndex: number, isHeader = false) {
  return {
    text: value,
    alignment: isHeader ? 'center' : RIGHT_ALIGNED_COLUMN_INDICES.has(columnIndex) ? 'right' : 'left',
    style: isHeader ? 'tableHeader' : undefined,
  };
}

function summaryField(label: string, value: number) {
  return {
    width: 'auto' as const,
    columns: [
      { text: label, bold: true, italics: true, width: 'auto' as const },
      { text: String(value), width: 'auto' as const, margin: [6, 0, 0, 0] as [number, number, number, number] },
    ],
  };
}

// def buildChemicalDocDefinition(): Input is one ChemicalDocOptions object
// (the chemical record, its in-range transactions of all types in
// chronological order, the export date range, the two pre-computed
// opening-balance figures, and the global app settings/signatory info).
// Output is one pdfmake TDocumentDefinitions object, ready to hand to
// renderDocDefinitionToBuffer().
export function buildChemicalDocDefinition(options: ChemicalDocOptions): TDocumentDefinitions {
  const {
    chemical,
    transactions,
    startDate,
    endDate,
    dateLabel,
    initialCurrentBalance,
    initialOutBalance,
    settings,
  } = options;

  const totalIn = transactions
    .filter((t) => t.type === 'STOCK_IN')
    .reduce((sum, t) => sum + Number(t.quantityReceived ?? 0), 0);

  const lastTransactionInRange = transactions[transactions.length - 1];
  const finalEntryBalanceOut = lastTransactionInRange
    ? Number(lastTransactionInRange.balanceOut)
    : initialOutBalance;

  const balanceForwarded = totalIn + finalEntryBalanceOut + initialCurrentBalance - initialOutBalance;

  const fmtDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');

  // Replenish rows affect the chain (already reflected in later rows'
  // Balance (Out) values) but are never shown as their own table row.
  const displayedTransactions = transactions.filter((t) => t.type !== 'REPLENISH');

  const tableBody: any[] = [COLUMN_LABELS.map((label, i) => cell(label, i, true))];

  for (const t of displayedTransactions) {
    if (t.type === 'STOCK_IN') {
      tableBody.push(
        [
          fmtDate(t.dateReceived),
          t.supplierInfo ?? '',
          t.truckerCarrier ?? '',
          t.lotBatchNo ?? '',
          t.quantityReceived !== null ? Number(t.quantityReceived).toString() : '',
          '',
          '',
          '',
          '',
          '',
          Number(t.balanceOut).toString(),
        ].map((v, i) => cell(v, i))
      );
    } else {
      tableBody.push(
        [
          '',
          '',
          '',
          '',
          '',
          fmtDate(t.dateUsed),
          t.detailsOfUsage ?? '',
          t.workOrderNo ?? '',
          t.lotBatchNoUsed ?? '',
          t.quantityUsed !== null ? Number(t.quantityUsed).toString() : '',
          Number(t.balanceOut).toString(),
        ].map((v, i) => cell(v, i))
      );
    }
  }

  const signatoryLine = [settings.signatoryName, settings.signatoryCredentials]
    .filter(Boolean)
    .join(', ');

  const docDefinition: TDocumentDefinitions = {
    pageSize: 'LEGAL',
    pageOrientation: 'landscape',
    pageMargins: [30, 65, 30, 60],
    background: () => ({
      canvas: [{ type: 'rect', x: 0, y: 0, w: 2000, h: 2000, color: '#ffffff' }],
    }),
    header: (currentPage: number) => ({
      margin: [30, 14, 30, 0],
      columns: [
        {
          width: '*',
          stack: [
            { text: settings.registerLabel || DEFAULT_REGISTER_LABEL, bold: true, fontSize: 10 },
            { text: REGISTER_SUBTITLE, italics: true, fontSize: 8 },
          ],
        },
        {
          width: 'auto',
          alignment: 'right',
          stack: [
            { text: `Page No. ${currentPage}`, fontSize: 8 },
            { text: dateLabel ? `Date: ${dateLabel}` : `Date: ${startDate} to ${endDate}`, fontSize: 8 },
          ],
        },
      ],
    }),
    content: [
      { text: chemical.cpecsDescriptor, style: 'title' },
      { text: 'CPECS (name, form, purity, packaging)', style: 'subtitle' },
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 948, y2: 0, lineWidth: 0.75 }],
        margin: [0, 4, 0, 8],
      },
      {
        columns: [
          summaryField(`IN (${chemical.unit})`, totalIn),
          summaryField(`OUT (${chemical.unit})`, initialOutBalance),
          summaryField(`Initial Stock (${chemical.unit})`, initialCurrentBalance),
          summaryField(`Balance Forwarded (${chemical.unit})`, balanceForwarded),
        ],
        columnGap: 24,
        margin: [0, 0, 0, 10],
      },
      {
        table: {
          headerRows: 1,
          widths: Array(COLUMN_LABELS.length).fill('*'),
          body: tableBody,
        },
        layout: {
          hLineWidth: () => GRID_LINE_WIDTH,
          vLineWidth: () => GRID_LINE_WIDTH,
          hLineColor: () => GRID_LINE_COLOR,
          vLineColor: () => GRID_LINE_COLOR,
          paddingLeft: () => 4,
          paddingRight: () => 4,
          paddingTop: () => 3,
          paddingBottom: () => 3,
          fillColor: () => '#ffffff',
        },
      } as ContentTable,
    ],
    footer: () => ({
      margin: [30, 10, 30, 0],
      stack: [
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.75 }], margin: [0, 24, 0, 0] },
        { text: signatoryLine, bold: true, margin: [0, 2, 0, 0] },
        { text: settings.signatoryTitle ?? '', italics: true },
      ],
    }),
    styles: {
      title: { fontSize: 13, bold: true, alignment: 'center', margin: [0, 0, 0, 1] },
      subtitle: { fontSize: 9, italics: true, alignment: 'center', margin: [0, 0, 0, 2] },
      tableHeader: { bold: true, fontSize: 7, fillColor: '#ffffff' },
    },
    defaultStyle: {
      fontSize: 7,
    },
  };

  return docDefinition;
}
