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
//     caption underneath (italic, centered), a full-width rule, then the
//     IN / OUT / Initial-Balance-Forwarded summary row.
//   - The 11-column transaction table with a fully ruled grid, white
//     background, and centered column headers, repeating across pages.
//   - A signature footer: a rule, the signatory's name (with credentials
//     appended on the same line) sitting on the rule, and the signatory's
//     title directly below in italics.
//
// OPEN ITEM: the reference form's "Initial Stock/Balance Forwarded"
// section showed two numbers whose exact meaning wasn't confirmed (see
// project notes). This function still only computes a single
// balance-as-of-range-start figure (`initialBalance` below).

import { TDocumentDefinitions, ContentTable } from 'pdfmake/interfaces';
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

// def buildChemicalDocDefinition(): Input is one ChemicalDocOptions object
// (the chemical record, its in-range transactions in chronological order,
// the export date range, the pre-computed opening balance, and the global
// app settings/signatory info). Output is one pdfmake
// TDocumentDefinitions object, ready to hand to
// renderDocDefinitionToBuffer().
export function buildChemicalDocDefinition(options: ChemicalDocOptions): TDocumentDefinitions {
  const { chemical, transactions, startDate, endDate, initialBalance, settings } = options;

  const totalIn = transactions
    .filter((t) => t.type === 'STOCK_IN')
    .reduce((sum, t) => sum + Number(t.quantityReceived ?? 0), 0);

  const totalOut = transactions
    .filter((t) => t.type === 'USAGE')
    .reduce((sum, t) => sum + Number(t.quantityUsed ?? 0), 0);

  const fmtDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '');

  const tableBody: any[] = [
    COLUMN_LABELS.map((label, i) => cell(label, i, true)),
  ];

  for (const t of transactions) {
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
            { text: `Date: ${startDate} to ${endDate}`, fontSize: 8 },
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
          {
            width: 'auto',
            columns: [
              { text: `IN (${chemical.unit})`, bold: true, italics: true, width: 'auto' },
              { text: String(totalIn), width: 'auto', margin: [6, 0, 0, 0] },
            ],
          },
          {
            width: 'auto',
            columns: [
              { text: `OUT (${chemical.unit})`, bold: true, italics: true, width: 'auto' },
              { text: String(totalOut), width: 'auto', margin: [6, 0, 0, 0] },
            ],
          },
          {
            width: '*',
            columns: [
              {
                text: `Initial Stock/Balance\nForwarded: (${chemical.unit})`,
                bold: true,
                italics: true,
                width: 'auto',
              },
              { text: String(initialBalance), width: 'auto', margin: [6, 0, 0, 0] },
            ],
          },
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
