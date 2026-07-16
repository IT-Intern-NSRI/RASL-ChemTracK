// src/lib/pdf/chemicalDocument.ts
//
// Builds the pdfmake "document definition" for one chemical's exported
// register page, matching the layout of the reference PDEA Register 2-13
// paper form as closely as possible:
//   - A per-page header (repeats on EVERY page, via pdfmake's `header`
//     callback): the register label + boilerplate subtitle on the left,
//     "Page No." + the covered date range on the right; below that the
//     chemical's full CPECS descriptor (bold, centered), a full-width
//     rule, the "CPECS (name, form, purity, packaging)" caption (italic,
//     centered), and the four-figure IN / OUT / Initial Stock/Balance
//     Forwarded summary row, positioned so each figure sits directly
//     above the table column it corresponds to. Because this whole block
//     lives in the `header` callback, it is reprinted in full on every
//     spillover page, not just the column header row.
//   - The 11-column transaction table with a fully ruled grid, white
//     background, and centered column headers. Rows are chunked into
//     fixed-size pages of ROWS_PER_PAGE (23) each, padded with blank rows
//     when a chunk (almost always the last one) has fewer entries, so
//     every page — regardless of how many real entries it holds — shows
//     exactly 23 rows. REPLENISH transactions are excluded from this
//     table entirely (they still affect the Out Balance chain other rows
//     carry, just aren't shown as their own row) — per project decision,
//     replenish logs never appear in the exported PDF.
//   - A signature footer: the signatory's name (with credentials
//     appended on the same line, bold) directly above a short rule, and
//     the signatory's title directly below the rule in italics.
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

import { TDocumentDefinitions, ContentTable, ContentText } from 'pdfmake/interfaces';
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

// The fixed 11 columns, in order, matching the reference form. Column 1
// (index 1, "Supplier Information...") renders as three stacked lines
// with a short rule between the license-no. line and the "if imported"
// line, matching the paper form. REPLENISH transactions never populate a
// row in this table (see module comment).
const SUPPLIER_INFO_HEADER_LINES = [
  'Supplier Information: Name, address, PDEA license no.',
  'If imported, exporter name, country of origin, SP no. and date issued',
];

export const COLUMN_LABELS = [
  'Date Received',
  'Supplier Information',
  'Name of trucker/ carrier',
  'Lot/batch no',
  'Quantity Received',
  'Date Used',
  'Details of usage',
  'Work Order No. if any',
  'Lot/batch no. of used CPECS',
  'Quantity Used',
  'Balance (Out)',
] as const;

const NUM_COLS = COLUMN_LABELS.length;

// Fixed column widths (in points), measured proportionally off the
// reference paper form so each column's width matches its real-world
// counterpart instead of splitting the page evenly. Narrow date/quantity
// columns stay narrow; the free-text columns (Supplier Information,
// Details of usage, Name of trucker/carrier) get the extra room they
// need. Trimmed down from the initial measurement (Name of trucker/
// carrier -10, Lot/batch no -6, Quantity Received -4, Details of usage
// -4, Work Order No. if any -6, Quantity Used -4) after real-world
// testing showed the table still clipping on the right edge. Sums to
// FULL_WIDTH_RULE (914pt) so the grid lines up exactly under the
// full-width rule and the summary row above it.
const COLUMN_WIDTHS = [65, 220, 96, 69, 44, 60, 135, 63, 66, 47, 49];

// Columns whose values should be right-aligned, matching the reference
// form's numeric-column convention.
const RIGHT_ALIGNED_COLUMN_INDICES = new Set([4, 9, 10]);

const DEFAULT_REGISTER_LABEL = 'PDEA P Register 2-13';
const REGISTER_SUBTITLE = '(Records required of a P3/P5-IM/P6) license holders';

const GRID_LINE_WIDTH = 0.75;
const GRID_LINE_COLOR = '#000000';
const FULL_WIDTH_RULE = 914; // matches the sum of COLUMN_WIDTHS, so the rule lines up with the table's outer edges

// Every export page (including spillover pages) shows exactly this many
// entry rows, blank-padded when there are fewer real entries.
const ROWS_PER_PAGE = 23;

function headerCell(columnIndex: number, unit: string) {
  if (columnIndex === 1) {
    return {
      stack: [
        { text: SUPPLIER_INFO_HEADER_LINES[0], alignment: 'center' as const, fontSize: 6.5 },
        {
          canvas: [{ type: 'line' as const, x1: 0, y1: 0, x2: 100, y2: 0, lineWidth: 0.5 }],
          alignment: 'center' as const,
          margin: [0, 2, 0, 2] as [number, number, number, number],
        },
        { text: SUPPLIER_INFO_HEADER_LINES[1], alignment: 'center' as const, fontSize: 6.5 },
      ],
      style: 'tableHeader',
    };
  }
  const label = columnIndex === 4 ? `${COLUMN_LABELS[columnIndex]} (${unit})` : COLUMN_LABELS[columnIndex];
  return { text: label, alignment: 'center' as const, style: 'tableHeader' };
}

// Rounds to 4 decimal places (matching the schema's Decimal(14,4) columns)
// and strips trailing zeros, avoiding floating-point artifacts like
// "30.701999999999998" from showing up in the exported PDF.
function fmtNum(n: number): string {
  return parseFloat(n.toFixed(4)).toString();
}

function cell(value: string, columnIndex: number) {
  return {
    text: value,
    alignment: RIGHT_ALIGNED_COLUMN_INDICES.has(columnIndex) ? ('right' as const) : ('left' as const),
  };
}

function summaryRowTable(
  unit: string,
  totalIn: number,
  initialOutBalance: number,
  initialCurrentBalance: number,
  balanceForwarded: number
): ContentTable {
  return {
    table: {
      widths: COLUMN_WIDTHS,
      body: [
        [
          { text: [{ text: `IN (${unit}) `, bold: true, italics: true }, { text: fmtNum(totalIn) }] },
          '',
          '',
          '',
          '',
          { text: [{ text: `OUT (${unit}) `, bold: true, italics: true }, { text: fmtNum(initialOutBalance) }] },
          '',
          {
            text: `Initial Stock/Balance Forwarded: (${unit})`,
            colSpan: 2,
            alignment: 'center',
            bold: true,
            italics: true,
          },
          {},
          { text: fmtNum(initialCurrentBalance), alignment: 'center' },
          { text: fmtNum(balanceForwarded), alignment: 'center' },
        ],
      ],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => 1,
      paddingRight: () => 1,
    },
    margin: [0, 40, 0, 0],
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

  const dataRows: string[][] = displayedTransactions.map((t) => {
    if (t.type === 'STOCK_IN') {
      return [
        fmtDate(t.dateReceived),
        t.supplierInfo ?? '',
        t.truckerCarrier ?? '',
        t.lotBatchNo ?? '',
        t.quantityReceived !== null ? fmtNum(Number(t.quantityReceived)) : '',
        '',
        '',
        '',
        '',
        '',
        fmtNum(Number(t.balanceOut)),
      ];
    }
    return [
      '',
      '',
      '',
      '',
      '',
      fmtDate(t.dateUsed),
      t.detailsOfUsage ?? '',
      t.workOrderNo ?? '',
      t.lotBatchNoUsed ?? '',
      t.quantityUsed !== null ? fmtNum(Number(t.quantityUsed)) : '',
      fmtNum(Number(t.balanceOut)),
    ];
  });

  // Chunk into fixed-size pages of ROWS_PER_PAGE, padding the final chunk
  // with blank rows so every page (including a lone, mostly-empty page)
  // always shows exactly ROWS_PER_PAGE rows.
  const rowChunks: string[][][] = [];
  for (let i = 0; i < dataRows.length; i += ROWS_PER_PAGE) {
    rowChunks.push(dataRows.slice(i, i + ROWS_PER_PAGE));
  }
  if (rowChunks.length === 0) {
    rowChunks.push([]);
  }
  const lastChunk = rowChunks[rowChunks.length - 1];
  while (lastChunk.length < ROWS_PER_PAGE) {
    lastChunk.push(Array(NUM_COLS).fill(''));
  }

  const signatoryLine = [settings.signatoryName, settings.signatoryCredentials]
    .filter(Boolean)
    .join(', ');

  const unit = chemical.unit;

  const content: any[] = rowChunks.map((chunkRows, idx) => {
    const tableBody: any[] = [Array.from({ length: NUM_COLS }, (_, i) => headerCell(i, unit))];
    for (const row of chunkRows) {
      tableBody.push(row.map((v, i) => cell(v, i)));
    }

    return {
      table: {
        headerRows: 1,
        widths: COLUMN_WIDTHS,
        body: tableBody,
      },
      layout: {
        hLineWidth: () => GRID_LINE_WIDTH,
        vLineWidth: () => GRID_LINE_WIDTH,
        hLineColor: () => GRID_LINE_COLOR,
        vLineColor: () => GRID_LINE_COLOR,
        paddingLeft: () => 1,
        paddingRight: () => 1,
        paddingTop: () => 3,
        paddingBottom: () => 3,
        fillColor: () => '#ffffff',
      },
      pageBreak: idx > 0 ? 'before' : undefined,
    } as ContentTable & { pageBreak?: 'before' };
  });

  const docDefinition: TDocumentDefinitions = {
    pageSize: 'LEGAL',
    pageOrientation: 'landscape',
    pageMargins: [30, 148, 30, 60],
    background: () => ({
      canvas: [{ type: 'rect', x: 0, y: 0, w: 2000, h: 2000, color: '#ffffff' }],
    }),
    // Repeats on every page — this is what makes spillover pages carry
    // the full format (register label, chemical/CPECS block, rule, and
    // summary row), not just the bare table column headers.
    header: (currentPage: number) => ({
      margin: [30, 14, 30, 0],
      stack: [
        {
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
        },
        { text: chemical.cpecsDescriptor, style: 'title', margin: [0, 6, 0, 0] },
        {
          canvas: [{ type: 'line', x1: 0, y1: 0, x2: FULL_WIDTH_RULE, y2: 0, lineWidth: 0.75 }],
          margin: [0, 3, 0, 3],
        },
        { text: 'CPECS (name, form, purity, packaging)', style: 'subtitle' },
        summaryRowTable(unit, totalIn, initialOutBalance, initialCurrentBalance, balanceForwarded),
      ],
    }),
    content,
    footer: () => ({
      margin: [30, 10, 30, 0],
      stack: [
        { text: signatoryLine, bold: true, margin: [0, 24, 0, 0] } as ContentText,
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.75 }], margin: [0, 2, 0, 2] },
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