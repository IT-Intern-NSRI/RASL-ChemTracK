// src/lib/pdf/chemicalDocument.ts
//
// Builds the pdfmake "document definition" for one chemical's exported
// register page, matching the layout of the reference PDEA Register 2-13
// form: a header block (register label, CPECS descriptor, page/date
// range, IN / OUT / Initial-Balance-Forwarded summary), the 11-column
// transaction table with repeating headers across pages, and a signature
// footer.
//
// OPEN ITEM: the reference form's "Initial Stock/Balance Forwarded"
// section showed two numbers whose exact meaning wasn't confirmed (see
// project notes). This function currently only computes a single
// balance-as-of-range-start figure (`initialBalance` below). Revisit the
// header layout once that's clarified.

import { TDocumentDefinitions } from 'pdfmake/interfaces';
import { Chemical, Transaction, AppSettings } from '@prisma/client';

export interface ChemicalDocOptions {
  chemical: Chemical;
  transactions: Transaction[]; // pre-filtered to the export date range, chronological order
  startDate: string; // "YYYY-MM-DD"
  endDate: string; // "YYYY-MM-DD"
  initialBalance: number; // balanceOut of the last transaction dated before startDate (0 if none)
  settings: AppSettings;
}

// The fixed 11 columns, in order, matching the reference form.
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

// def buildChemicalDocDefinition(): Input is one ChemicalDocOptions object
// (the chemical record, its in-range transactions in chronological order,
// the export date range, the pre-computed opening balance, and the global
// app settings/signatory info). Output is one pdfmake
// TDocumentDefinitions object, ready to hand to
// renderDocDefinitionToBuffer().
// Pseudocode:
//   1. Compute totalIn = sum of transactions[i].quantityReceived where
//      type === 'STOCK_IN'.
//   2. Compute totalOut = sum of transactions[i].quantityUsed where
//      type === 'USAGE'.
//   3. Build the header content: options.settings.registerLabel, a page
//      number placeholder (pdfmake exposes currentPage/pageCount inside a
//      `header` function for this), chemical.cpecsDescriptor as the title
//      line, "options.startDate to options.endDate" as the covered range,
//      and a small summary row: "IN (L): totalIn", "OUT (L): totalOut",
//      "Initial Stock/Balance Forwarded (L): options.initialBalance".
//   4. Build the table body: one header row using COLUMN_LABELS, then one
//      row per transaction in `transactions`, mapping:
//        - STOCK_IN rows populate columns 1-5 (Date Received through
//          Quantity Received) and leave columns 6-10 blank, column 11 is
//          balanceOut.
//        - USAGE rows leave columns 1-5 blank, populate columns 6-10
//          (Date Used through Quantity Used), column 11 is balanceOut.
//   5. Configure the table's `headerRows: 1` (pdfmake repeats this many
//      leading rows on every page automatically when the table splits).
//   6. Build the footer: a horizontal rule, then
//      settings.signatoryName / signatoryCredentials / signatoryTitle
//      stacked, with blank vertical space above the name left for a
//      physical/wet signature.
//   7. Assemble and return the TDocumentDefinitions object (pageSize:
//      'A4' or 'LEGAL' landscape given the column count, pageMargins,
//      header, content: [headerBlock, table], footer, styles dict for
//      table header/body fonts).
export function buildChemicalDocDefinition(options: ChemicalDocOptions): TDocumentDefinitions {
  const { chemical, transactions, startDate, endDate, initialBalance, settings } = options;

  const totalIn = transactions
    .filter((t) => t.type === 'STOCK_IN')
    .reduce((sum, t) => sum + Number(t.quantityReceived ?? 0), 0);

  const totalOut = transactions
    .filter((t) => t.type === 'USAGE')
    .reduce((sum, t) => sum + Number(t.quantityUsed ?? 0), 0);

  const fmtDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');

  const tableBody: any[] = [COLUMN_LABELS.map((label) => ({ text: label, style: 'tableHeader' }))];

  for (const t of transactions) {
    if (t.type === 'STOCK_IN') {
      tableBody.push([
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
      ]);
    } else {
      tableBody.push([
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
      ]);
    }
  }

  const docDefinition: TDocumentDefinitions = {
    pageSize: 'LEGAL',
    pageOrientation: 'landscape',
    pageMargins: [30, 60, 30, 60],
    header: (currentPage: number, pageCount: number) => ({
      text: `${settings.registerLabel ?? ''}    Page ${currentPage} of ${pageCount}`,
      alignment: 'right',
      margin: [0, 10, 30, 0],
      fontSize: 8,
    }),
    content: [
      { text: chemical.cpecsDescriptor, style: 'title' },
      { text: `${startDate} to ${endDate}`, style: 'subtitle' },
      {
        columns: [
          { text: `IN (${chemical.unit}): ${totalIn}` },
          { text: `OUT (${chemical.unit}): ${totalOut}` },
          { text: `Initial Stock/Balance Forwarded (${chemical.unit}): ${initialBalance}` },
        ],
        margin: [0, 5, 0, 10],
      },
      {
        table: {
          headerRows: 1,
          widths: Array(COLUMN_LABELS.length).fill('*'),
          body: tableBody,
        },
        layout: 'lightHorizontalLines',
      },
    ],
    footer: () => ({
      margin: [30, 0, 30, 0],
      stack: [
        { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 200, y2: 0, lineWidth: 1 }] },
        { text: settings.signatoryName ?? '', margin: [0, 20, 0, 0] },
        { text: settings.signatoryCredentials ?? '' },
        { text: settings.signatoryTitle ?? '' },
      ],
    }),
    styles: {
      title: { fontSize: 12, bold: true, margin: [0, 0, 0, 2] },
      subtitle: { fontSize: 9, margin: [0, 0, 0, 4] },
      tableHeader: { bold: true, fontSize: 7, fillColor: '#eeeeee' },
    },
    defaultStyle: {
      fontSize: 7,
    },
  };

  return docDefinition;
}
