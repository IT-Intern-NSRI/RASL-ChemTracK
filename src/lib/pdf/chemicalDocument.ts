// src/lib/pdf/chemicalDocument.ts
//
// Builds the pdfmake "document definition" for one chemical's exported
// register page, matching the layout of the reference PDEA Register 2-13
// paper form as closely as possible. There are two independent
// pagination/balance strategies, chosen via `options.rangeType`:
//
// - rangeType: 'date' (the original layout, still used by callers with an
//   arbitrary — not necessarily month-aligned — date range, e.g. the
//   5-year purge's backup ZIP; see lib/purge.ts). Rows are chunked into
//   fixed-size pages of ROWS_PER_PAGE (23) each, blank-padded so every
//   page shows exactly 23 rows. The IN/OUT/Initial Stock/Balance
//   Forwarded summary figures are constant across the whole document,
//   computed once for the entire requested range.
//
// - rangeType: 'month' (what every export entry point in the app now
//   uses — MonthRangePicker only ever produces whole-month ranges). Each
//   calendar month gets its own page (spilling onto further physical
//   pages only if that month alone has more rows than fit on one page),
//   with its OWN IN/OUT/Initial Stock/Balance Forwarded figures
//   (pre-computed per month by pdfGenerator.ts's buildMonthlyFigures()).
//   Every day of the month gets at least one row: days with no STOCK_IN/
//   USAGE activity (REPLENISH-only or fully idle days both count as
//   "nothing happened", consistent with REPLENISH already being fully
//   invisible elsewhere in this export) get a synthesized "No usage" row
//   with Quantity Used = 0 and Balance (Out) carried forward from the
//   last known value. There is no blank-row padding in this mode — the
//   per-day fill already guarantees a minimum of daysInMonth rows.
//
// Both modes share:
//   - A per-page header (repeats on EVERY physical page, via pdfmake's
//     `header` callback): the register label + boilerplate subtitle on
//     the left, "Page No." + the covered date range on the right (this
//     date-range text is ALWAYS derived from the overall requested
//     startDate/endDate — see `dateLabel` below — never from an
//     individual month, even in 'month' mode where each page covers only
//     one month's rows); below that the chemical's full CPECS descriptor
//     (bold, centered), a full-width rule, the "CPECS (name, form,
//     purity, packaging)" caption (italic, centered), and the four-figure
//     summary row, positioned so each figure sits directly above the
//     table column it corresponds to. Because this whole block lives in
//     the `header` callback, it is reprinted in full on every physical
//     page, not just the column header row.
//   - An 11-column transaction table with a fully ruled grid, white
//     background, and centered column headers. REPLENISH transactions
//     are excluded from ever populating a row (they still affect the Out
//     Balance chain other rows carry, just aren't shown as their own
//     row) — per project decision, replenish logs never appear in the
//     exported PDF.
//   - A signature footer: the signatory's name (with credentials
//     appended on the same line, bold) directly above a short rule, and
//     the signatory's title directly below the rule in italics.
//
// Summary-row definitions (each confirmed against a real reference
// export spanning several months; in 'month' mode, apply per-month
// instead of per-whole-range):
//   - "IN (L)": sum of quantityReceived across STOCK_IN rows in
//     range/month.
//   - "OUT (L)": NOT a sum of usage. It's the Current Out Balance as of
//     immediately before this page's covered range/month — the same
//     figure carries unchanged across a whole page if no USAGE/REPLENISH
//     occurred within it.
//   - "Initial Stock (L)": the Current Balance (total inventory) as of
//     immediately before this page's covered range/month.
//   - "Balance Forwarded (L)": the Current Balance (total inventory) as
//     of immediately AFTER this page's covered range/month — i.e. the
//     currentBalanceAfter of the last transaction in range/month (any
//     type, including REPLENISH), or "Initial Stock (L)" unchanged if
//     there were no transactions in range/month. This is what "Initial
//     Stock" becomes on the *next* page/month.

import { TDocumentDefinitions, ContentTable, ContentText } from 'pdfmake/interfaces';
import { Chemical, Transaction, AppSettings } from '@prisma/client';

interface ChemicalDocCommonOptions {
  chemical: Chemical;
  startDate: string; // "YYYY-MM-DD" — the overall requested range's start
  endDate: string; // "YYYY-MM-DD" — the overall requested range's end
  // Pre-formatted abbreviated range label (e.g. "Jan - Jun, 2024") shown
  // in the header's top-right "Date:" line, computed once from the
  // OVERALL requested range regardless of pagination mode — this never
  // changes per-page, even in 'month' mode where each page's rows only
  // cover one month. Undefined falls back to the literal
  // "Date: <startDate> to <endDate>" text.
  dateLabel?: string;
  settings: AppSettings;
}

export interface ChemicalDocDateOptions extends ChemicalDocCommonOptions {
  rangeType: 'date';
  transactions: Transaction[]; // pre-filtered to the export date range, chronological order, ALL types (including REPLENISH — needed for the Balance Forwarded figure even though replenish rows aren't individually displayed)
  initialCurrentBalance: number; // currentBalanceAfter of the last transaction dated before startDate (0 if none) — "Initial Stock"
  initialOutBalance: number; // balanceOut of the last transaction dated before startDate (0 if none) — the top "OUT (L)" figure
}

// One calendar month's worth of pre-computed export data, produced by
// pdfGenerator.ts's buildMonthlyFigures(). Each one becomes exactly one
// "logical" page (though it may span more than one physical PDF page if
// it has enough rows) in the exported document.
export interface ChemicalDocMonthData {
  year: number;
  month: number; // 1-12
  transactions: Transaction[]; // this month's transactions only, chronological order, ALL types (including REPLENISH — needed for the Balance Forwarded figure even though replenish rows aren't individually displayed)
  initialCurrentBalance: number; // Current Balance strictly before this month — this page's "Initial Stock"
  initialOutBalance: number; // Current Out Balance strictly before this month — this page's top "OUT (L)" figure
  totalIn: number; // sum of quantityReceived across this month's STOCK_IN rows — this page's "IN (L)" figure
  balanceForwarded: number; // Current Balance as of the end of this month
}

export interface ChemicalDocMonthOptions extends ChemicalDocCommonOptions {
  rangeType: 'month';
  months: ChemicalDocMonthData[]; // one entry per calendar month spanned by [startDate, endDate], in chronological order
}

export type ChemicalDocOptions = ChemicalDocDateOptions | ChemicalDocMonthOptions;

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

// Column index of each field referenced by name elsewhere in this module
// (empty-day synthetic rows, right-alignment rules).
const COL_DATE_USED = 5;
const COL_DETAILS_OF_USAGE = 6;
const COL_QUANTITY_USED = 9;
const COL_BALANCE_OUT = 10;

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
const RIGHT_ALIGNED_COLUMN_INDICES = new Set([4, COL_QUANTITY_USED, COL_BALANCE_OUT]);

const DEFAULT_REGISTER_LABEL = 'PDEA P Register 2-13';
const REGISTER_SUBTITLE = '(Records required of a P3/P5-IM/P6) license holders';

const GRID_LINE_WIDTH = 0.75;
const GRID_LINE_COLOR = '#000000';
const FULL_WIDTH_RULE = 914; // matches the sum of COLUMN_WIDTHS, so the rule lines up with the table's outer edges

// Every date-mode export page (including spillover pages) shows exactly
// this many entry rows, blank-padded when there are fewer real entries.
// Only used by rangeType: 'date'.
const ROWS_PER_PAGE = 23;

// Month-mode's per-page row budget. A calendar month needs at least
// daysInMonth rows (28-31) shown on as few physical pages as possible —
// meaningfully more than date-mode's 23-row pages were tuned for — so
// month-mode tables use tighter cell padding/font size (see `tight` param
// on buildTableContentBlock) to fit more rows per physical page.
//
// 33 is not a rough estimate — it's the measured single-physical-page
// capacity for a Legal-landscape page at TIGHT_ROW_PADDING/
// TIGHT_ROW_FONT_SIZE below (confirmed by rendering real single-month
// documents with 28 through 40 rows and checking pdfinfo's page count: 33
// rows fit on one physical page, 34 forces pdfmake to split the table
// across two). This value MUST stay at or below that measured capacity —
// going over it doesn't just make a month spill onto an extra page as
// intended, it makes pdfmake internally auto-split a single `table`
// object across pages, which was observed to corrupt EARLIER pages in
// the same document (extra stroke/rect drawing operations appearing on
// pages that don't otherwise change) purely because a later table needed
// to split. Keeping every chunk we hand to pdfmake at or under this
// measured capacity means pdfmake never needs to auto-split a table
// itself — chunkRowsMaxSize() below always pre-splits for it, so a month
// with more real entries than fit on one page still spills onto
// additional physical pages, just via our own explicit chunk boundaries
// (each with its own forced pageBreak) rather than pdfmake's internal
// splitting.
const MAX_ROWS_PER_MONTH_PAGE = 33;
const TIGHT_ROW_PADDING = 1.5; // vs. 3 for date-mode
const TIGHT_ROW_FONT_SIZE = 6.5; // vs. the doc's defaultStyle 7

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
  return { text: label, alignment: 'center' as const, style: 'tableHeader', margin: [0, 5.5, 0, 0] };
}

// Rounds to 4 decimal places (matching the schema's Decimal(14,4) columns)
// and strips trailing zeros, avoiding floating-point artifacts like
// "30.701999999999998" from showing up in the exported PDF.
function fmtNum(n: number): string {
  return parseFloat(n.toFixed(4)).toString();
}

// Renders as "MM/DD/YY" (e.g. "07/16/26"), matching the reference form's
// date convention. UTC-based (getUTC*, not the local-timezone get*
// equivalents) since the underlying date fields are stored as UTC
// midnight instants representing a plain calendar day (see
// lib/balance.ts / lib/timezone.ts) — using local getters here could
// shift the displayed day depending on the server's timezone.
function fmtDate(d: Date | null): string {
  if (!d) {
    return '';
  }
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

function cell(value: string, columnIndex: number, italics?: boolean, fontSize?: number) {
  return {
    text: value,
    alignment: RIGHT_ALIGNED_COLUMN_INDICES.has(columnIndex) ? ('right' as const) : ('left' as const),
    italics: italics || undefined,
    fontSize,
  };
}

// A single table row's 11 column values, plus which (if any) columns
// should render italicized — used for the "No usage" text in synthetic
// empty-day rows.
interface LogicalRow {
  values: string[]; // length NUM_COLS
  italicColumns?: Set<number>;
}

function blankRow(): LogicalRow {
  return { values: Array(NUM_COLS).fill('') };
}

function rowForTransaction(t: Transaction): LogicalRow {
  if (t.type === 'STOCK_IN') {
    return {
      values: [
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
      ],
    };
  }
  // USAGE (REPLENISH rows are filtered out before this is ever called)
  return {
    values: [
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
    ],
  };
}

// Synthesizes the "nothing happened this day" row for month-mode's
// per-day fill: Date Used = that date, Details of usage = "No usage"
// (italicized), Quantity Used = 0, Balance (Out) carried forward from the
// last known value (a day with only an invisible REPLENISH on it is
// treated the same as a fully idle day, consistent with REPLENISH being
// excluded from this export everywhere else).
function syntheticNoUsageRow(dateStr: string, carriedBalanceOut: number): LogicalRow {
  const values = Array(NUM_COLS).fill('');
  values[COL_DATE_USED] = dateStr;
  values[COL_DETAILS_OF_USAGE] = 'No usage';
  values[COL_QUANTITY_USED] = '0';
  values[COL_BALANCE_OUT] = fmtNum(carriedBalanceOut);
  return { values, italicColumns: new Set([COL_DETAILS_OF_USAGE]) };
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
          {
            text: [
              { text: `IN (${unit}) `, bold: true, italics: true },
              { text: fmtNum(totalIn) },
            ],
            fontSize: 10,
          },
          '',
          '',
          '',
          '',
          {
            text: [
              { text: `OUT (${unit}) `, bold: true, italics: true, noWrap: true },
              {
                text: fmtNum(initialOutBalance),
                margin: [12, 0, 0, 0],
                noWrap: true,
              },
            ],
            fontSize: 10,
            noWrap: true,
          },
          '',
          {
            stack: [
              { text: 'Initial Stock/Balance', bold: true, italics: true, fontSize: 10 },
              { text: `Forwarded: (${unit})`, bold: true, italics: true, fontSize: 10 },
            ],
            colSpan: 2,
            alignment: 'center',
          },
          {},
          { text: fmtNum(initialCurrentBalance), alignment: 'center', fontSize: 10 },
          { text: fmtNum(balanceForwarded), alignment: 'center', fontSize: 10 },
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

// Splits `rows` into pages of exactly `size` rows each, blank-padding the
// final chunk so every page (including a mostly-empty one) shows the same
// fixed row count. Used only by rangeType: 'date', which preserves the
// original fixed-page-size layout.
function chunkRowsFixedSize(rows: LogicalRow[], size: number): LogicalRow[][] {
  const chunks: LogicalRow[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  if (chunks.length === 0) {
    chunks.push([]);
  }
  const last = chunks[chunks.length - 1];
  while (last.length < size) {
    last.push(blankRow());
  }
  return chunks;
}

// Splits `rows` into pages of AT MOST `maxSize` rows each, with no
// padding — used by rangeType: 'month', where a month's row count is
// already guaranteed to be at least daysInMonth (via the per-day fill)
// and doesn't need artificial padding to a fixed count. Only produces
// more than one chunk if a single month has more real entries than fit on
// one physical page.
function chunkRowsMaxSize(rows: LogicalRow[], maxSize: number): LogicalRow[][] {
  if (rows.length === 0) {
    return [[]];
  }
  const chunks: LogicalRow[][] = [];
  for (let i = 0; i < rows.length; i += maxSize) {
    chunks.push(rows.slice(i, i + maxSize));
  }
  return chunks;
}

function buildTableContentBlock(
  rows: LogicalRow[],
  unit: string,
  pageBreakBefore: boolean,
  tight: boolean
) {
  const tableBody: unknown[][] = [Array.from({ length: NUM_COLS }, (_, i) => headerCell(i, unit))];
  for (const row of rows) {
    tableBody.push(
      row.values.map((v, i) =>
        cell(v, i, row.italicColumns?.has(i), tight ? TIGHT_ROW_FONT_SIZE : undefined)
      )
    );
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
      paddingTop: () => (tight ? TIGHT_ROW_PADDING : 3),
      paddingBottom: () => (tight ? TIGHT_ROW_PADDING : 3),
      fillColor: () => '#ffffff',
    },
    pageBreak: pageBreakBefore ? ('before' as const) : undefined,
  } as ContentTable & { pageBreak?: 'before' };
}

interface PageHeaderFigures {
  totalIn: number;
  initialOutBalance: number;
  initialCurrentBalance: number;
  balanceForwarded: number;
}

interface ModeContentResult {
  content: unknown[];
  // One entry per physical content chunk (== one physical PDF page, since
  // every chunk boundary forces a pageBreak) — the header callback looks
  // up `pageHeaderData[currentPage - 1]` to know which figures to print.
  pageHeaderData: PageHeaderFigures[];
}

function buildDateModeContent(options: ChemicalDocDateOptions, unit: string): ModeContentResult {
  const { transactions, initialCurrentBalance, initialOutBalance } = options;

  const totalIn = transactions
    .filter((t) => t.type === 'STOCK_IN')
    .reduce((sum, t) => sum + Number(t.quantityReceived ?? 0), 0);

  // "Balance Forwarded" is simply the total Current Balance (total
  // inventory) as of immediately AFTER this report's range — i.e. the
  // currentBalanceAfter of the last transaction (any type, including
  // REPLENISH, since REPLENISH still carries a currentBalanceAfter even
  // though it doesn't change it) dated within [startDate, endDate]. If
  // there were no transactions in range at all, nothing moved, so it's
  // just whatever "Initial Stock" already was.
  const lastTransactionInRange = transactions[transactions.length - 1];
  const balanceForwarded = lastTransactionInRange
    ? Number(lastTransactionInRange.currentBalanceAfter)
    : initialCurrentBalance;

  // Replenish rows affect the chain (already reflected in later rows'
  // Balance (Out) values) but are never shown as their own table row.
  const displayedTransactions = transactions.filter((t) => t.type !== 'REPLENISH');
  const dataRows: LogicalRow[] = displayedTransactions.map(rowForTransaction);

  const rowChunks = chunkRowsFixedSize(dataRows, ROWS_PER_PAGE);

  const headerData: PageHeaderFigures = {
    totalIn,
    initialOutBalance,
    initialCurrentBalance,
    balanceForwarded,
  };

  const content = rowChunks.map((chunkRows, idx) =>
    buildTableContentBlock(chunkRows, unit, idx > 0, false)
  );
  const pageHeaderData = rowChunks.map(() => headerData);

  return { content, pageHeaderData };
}

function buildMonthModeContent(options: ChemicalDocMonthOptions, unit: string): ModeContentResult {
  const content: unknown[] = [];
  const pageHeaderData: PageHeaderFigures[] = [];
  let globalChunkIndex = 0;

  for (const monthData of options.months) {
    const displayedTransactions = monthData.transactions.filter((t) => t.type !== 'REPLENISH');

    // Group real rows by day-of-month (UTC-based, matching how the date
    // fields are stored — see lib/balance.ts / lib/timezone.ts).
    const rowsByDay = new Map<number, LogicalRow[]>();
    for (const t of displayedTransactions) {
      const d = t.type === 'STOCK_IN' ? t.dateReceived : t.dateUsed;
      if (!d) continue;
      const day = d.getUTCDate();
      const list = rowsByDay.get(day) ?? [];
      list.push(rowForTransaction(t));
      rowsByDay.set(day, list);
    }

    const daysInMonth = new Date(monthData.year, monthData.month, 0).getDate();
    // "MM/YY" prefix for this month's synthetic empty-day rows, matching
    // fmtDate()'s "MM/DD/YY" convention.
    const monthPrefixMM = String(monthData.month).padStart(2, '0');
    const yearSuffixYY = String(monthData.year).slice(-2);

    const monthRows: LogicalRow[] = [];
    let carryBalanceOut = monthData.initialOutBalance;

    for (let day = 1; day <= daysInMonth; day++) {
      const real = rowsByDay.get(day);
      if (real && real.length > 0) {
        monthRows.push(...real);
        const lastBalanceOutText = real[real.length - 1].values[COL_BALANCE_OUT];
        const parsed = Number(lastBalanceOutText);
        if (!Number.isNaN(parsed)) {
          carryBalanceOut = parsed;
        }
      } else {
        const dateStr = `${monthPrefixMM}/${String(day).padStart(2, '0')}/${yearSuffixYY}`;
        monthRows.push(syntheticNoUsageRow(dateStr, carryBalanceOut));
        // carryBalanceOut is unchanged — nothing happened this day.
      }
    }

    const headerData: PageHeaderFigures = {
      totalIn: monthData.totalIn,
      initialOutBalance: monthData.initialOutBalance,
      initialCurrentBalance: monthData.initialCurrentBalance,
      balanceForwarded: monthData.balanceForwarded,
    };

    const chunks = chunkRowsMaxSize(monthRows, MAX_ROWS_PER_MONTH_PAGE);
    for (const chunkRows of chunks) {
      content.push(buildTableContentBlock(chunkRows, unit, globalChunkIndex > 0, true));
      pageHeaderData.push(headerData);
      globalChunkIndex++;
    }
  }

  return { content, pageHeaderData };
}

// def buildChemicalDocDefinition(): Input is one ChemicalDocOptions object
// (rangeType: 'date' — the chemical record, its in-range transactions of
// all types in chronological order, the export date range, the two
// pre-computed opening-balance figures, and the global app
// settings/signatory info; or rangeType: 'month' — the same chemical/
// settings/range info, plus one pre-computed ChemicalDocMonthData entry
// per calendar month spanned by the range). Output is one pdfmake
// TDocumentDefinitions object, ready to hand to
// renderDocDefinitionToBuffer().
export function buildChemicalDocDefinition(options: ChemicalDocOptions): TDocumentDefinitions {
  const { chemical, startDate, endDate, dateLabel, settings } = options;
  const unit = chemical.unit;

  const { content, pageHeaderData } =
    options.rangeType === 'month'
      ? buildMonthModeContent(options, unit)
      : buildDateModeContent(options, unit);

  const signatoryLine = [settings.signatoryName, settings.signatoryCredentials]
    .filter(Boolean)
    .join(', ');

  const docDefinition: TDocumentDefinitions = {
    pageSize: 'LEGAL',
    pageOrientation: 'landscape',
    pageMargins: [30, 148, 30, 60],
    background: () => ({
      canvas: [{ type: 'rect', x: 0, y: 0, w: 2000, h: 2000, color: '#ffffff' }],
    }),
    // Repeats on every physical page — this is what makes spillover pages
    // carry the full format (register label, chemical/CPECS block, rule,
    // and summary row), not just the bare table column headers. The
    // summary-row figures are looked up per physical page via
    // pageHeaderData, so in 'month' mode each month's page(s) show that
    // month's own Initial Stock/OUT/Balance Forwarded/IN figures, while
    // the "Date:" text always reflects the overall requested range
    // (dateLabel/startDate/endDate), never an individual month.
    header: (currentPage: number) => {
      const headerData =
        pageHeaderData[currentPage - 1] ?? pageHeaderData[pageHeaderData.length - 1];
      return {
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
          summaryRowTable(
            unit,
            headerData?.totalIn ?? 0,
            headerData?.initialOutBalance ?? 0,
            headerData?.initialCurrentBalance ?? 0,
            headerData?.balanceForwarded ?? 0
          ),
        ],
      };
    },
    content: content as TDocumentDefinitions['content'],
    footer: () => ({
      margin: [30, 0, 30, 0],
      stack: [
        // The uploaded e-signature (a base64 data URL) prints directly over
        // the signatory name, the way an ink signature sits above a printed
        // name on a paper form. A negative bottom margin pulls the name (and
        // its rule) up underneath the image so they visually overlap instead
        // of just stacking one above the other.
        ...(settings.signatureImage
          ? [
              {
                image: settings.signatureImage,
                width: 110,
                margin: [40, 2, 0, -22] as [number, number, number, number],
              },
            ]
          : []),
        { text: signatoryLine, bold: true, fontSize: 10, margin: [40, 6, 0, 0] } as ContentText,
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 0.75 }], margin: [0, 2, 0, 2] },
        { text: settings.signatoryTitle ?? '', italics: true, fontSize: 10, margin: [40, 0, 0, 0] },
      ],
    }),
    styles: {
      title: { fontSize: 10, bold: true, alignment: 'center', margin: [0, 0, 0, 1] },
      subtitle: { fontSize: 9, italics: true, alignment: 'center', margin: [0, 0, 0, 2] },
      tableHeader: { bold: true, fontSize: 7, fillColor: '#ffffff' },
    },
    defaultStyle: {
      fontSize: 7,
    },
  };

  return docDefinition;
}
