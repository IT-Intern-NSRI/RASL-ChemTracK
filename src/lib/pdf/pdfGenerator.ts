// src/lib/pdf/pdfGenerator.ts
//
// Turns a pdfmake document definition into PDF bytes, and is the entry
// point the API routes call for single-chemical exports. Deliberately
// avoids a headless-browser renderer (Puppeteer/Playwright) because the
// planned free-tier host (Render) has ~512MB of RAM, which a full
// Chromium instance is a poor fit for — pdfmake renders directly to a
// buffer instead. See fonts/README.md for the font files this needs.

import PdfPrinter from 'pdfmake';
import { TDocumentDefinitions } from 'pdfmake/interfaces';
import { Transaction } from '@prisma/client';
import { prisma } from '../prisma';
import { buildChemicalDocDefinition, ChemicalDocMonthData } from './chemicalDocument';
import { formatMonthRangeLabel } from '../timezone';

// Font descriptors pdfmake needs — point these at the .ttf files described
// in fonts/README.md.
const fonts = {
  Roboto: {
    normal: 'fonts/Roboto-Regular.ttf',
    bold: 'fonts/Roboto-Medium.ttf',
    italics: 'fonts/Roboto-Italic.ttf',
    bolditalics: 'fonts/Roboto-MediumItalic.ttf',
  },
};

// def renderDocDefinitionToBuffer(): Input is one pdfmake
// TDocumentDefinitions object. Output is a Promise resolving to one
// Buffer containing the rendered PDF's bytes.
// Pseudocode:
//   1. Instantiate `new PdfPrinter(fonts)`.
//   2. Call printer.createPdfKitDocument(docDefinition) to get a PDFKit
//      document/stream.
//   3. Collect the stream's 'data' chunks into an array.
//   4. On the stream's 'end' event, resolve the Promise with
//      Buffer.concat(chunks).
//   5. Call doc.end() to flush the stream and trigger the above.
export function renderDocDefinitionToBuffer(docDefinition: TDocumentDefinitions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const printer = new PdfPrinter(fonts);
      const doc = printer.createPdfKitDocument(docDefinition);
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (err: Error) => reject(err));

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// def buildMonthlyFigures(): Input is one already-fetched, chronologically
// ordered (by sequenceNo) transaction list covering the whole requested
// export range (ALL types, including REPLENISH), the range's resolved
// "YYYY-MM-DD" startDate/endDate (assumed to already be whole-month
// boundaries — the 1st of the first month through the last day of the
// last month, which MonthRangePicker/ExportButton always produce), and
// the Current Balance / Current Out Balance as of strictly before
// startDate (0/0 if this chemical had no prior transaction). Output is
// one ChemicalDocMonthData[] array, one entry per calendar month spanned
// by the range, each carrying its own Initial Stock / OUT / Balance
// Forwarded / IN figures computed strictly from that month's slice of the
// ledger (see chemicalDocument.ts's module comment for the exact
// definitions) — this is what makes 'month' mode's per-page balances
// independent of the overall selected range.
// Pseudocode:
//   1. Enumerate every "YYYY-MM" key from startDate's month through
//      endDate's month, inclusive.
//   2. Bucket the transaction list by each row's own calendar month
//      (whichever of dateReceived/dateUsed/dateReplenished is populated),
//      preserving the incoming chronological order within each bucket.
//   3. Walk the enumerated months in order, carrying a running
//      { currentBalance, outBalance } baseline forward (seeded from the
//      priorCurrentBalance/priorOutBalance params):
//        a. initialCurrentBalance / initialOutBalance for this month =
//           the baseline as of just before this month.
//        b. totalIn = sum of quantityReceived across this month's
//           STOCK_IN rows.
//        c. If this month's bucket is non-empty: balanceForwarded = the
//           LAST row's (by chronological/sequenceNo order — the chain of
//           truth per lib/balance.ts) currentBalanceAfter; advance the
//           baseline to that row's currentBalanceAfter/balanceOut before
//           moving to the next month.
//        d. If this month's bucket is empty: balanceForwarded =
//           unchanged from initialCurrentBalance, and the baseline
//           carries forward untouched to the next month.
//   4. Return the resulting ChemicalDocMonthData[] array.
export function buildMonthlyFigures(
  transactions: Transaction[],
  startDate: string,
  endDate: string,
  priorCurrentBalance: number,
  priorOutBalance: number
): ChemicalDocMonthData[] {
  const monthKeys: string[] = [];
  let [year, month] = startDate.slice(0, 7).split('-').map(Number);
  const [endYear, endMonth] = endDate.slice(0, 7).split('-').map(Number);
  while (year < endYear || (year === endYear && month <= endMonth)) {
    monthKeys.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  const buckets = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const d = t.dateReceived ?? t.dateUsed ?? t.dateReplenished;
    if (!d) continue;
    const key = d.toISOString().slice(0, 7);
    const list = buckets.get(key) ?? [];
    list.push(t);
    buckets.set(key, list);
  }

  const months: ChemicalDocMonthData[] = [];
  let baselineCurrent = priorCurrentBalance;
  let baselineOut = priorOutBalance;

  for (const key of monthKeys) {
    const [yearStr, monthStr] = key.split('-');
    const monthTransactions = buckets.get(key) ?? [];

    const totalIn = monthTransactions
      .filter((t) => t.type === 'STOCK_IN')
      .reduce((sum, t) => sum + Number(t.quantityReceived ?? 0), 0);

    const initialCurrentBalance = baselineCurrent;
    const initialOutBalance = baselineOut;

    let balanceForwarded = baselineCurrent;
    if (monthTransactions.length > 0) {
      const last = monthTransactions[monthTransactions.length - 1];
      balanceForwarded = Number(last.currentBalanceAfter);
      baselineCurrent = balanceForwarded;
      baselineOut = Number(last.balanceOut);
    }

    months.push({
      year: Number(yearStr),
      month: Number(monthStr),
      transactions: monthTransactions,
      initialCurrentBalance,
      initialOutBalance,
      totalIn,
      balanceForwarded,
    });
  }

  return months;
}

// def generateChemicalPdf(): Input is one chemical id (string), one
// export date range (startDate, endDate as "YYYY-MM-DD" strings — always
// already-resolved concrete calendar-day boundaries), and one rangeType
// ('date' | 'month', default 'month' — every export entry point in the
// app only offers Month Selection now; 'date' remains fully functional
// for callers with a non-month-aligned range, e.g. the 5-year purge's
// backup ZIP, which explicitly requests it). Output is a Promise
// resolving to one Buffer (the finished PDF for that chemical).
// Pseudocode:
//   1. Fetch the chemical by id from Prisma; throw a "not found" error if
//      missing.
//   2. Fetch its transactions within [startDate, endDate] (matching on
//      dateReceived for STOCK_IN rows, dateUsed for USAGE rows,
//      dateReplenished for REPLENISH rows), ordered chronologically
//      (falling back to sequenceNo to order same-day entries
//      consistently). REPLENISH rows are included here even though
//      they're excluded from the table itself — they still affect the
//      Out Balance chain, so the *last* transaction in any range/month
//      needs to be the true last one of any type.
//   3. Fetch the single AppSettings row (id=1) for the signature block.
//   4. Fetch the one prior transaction (of any type) dated strictly
//      before startDate, to seed the opening Current Balance / Current
//      Out Balance baseline (0/0 if none exists).
//   5. If rangeType === 'month': compute dateLabel via
//      formatMonthRangeLabel(startDate, endDate) — this is the header's
//      "Date:" text for EVERY page, regardless of which month that page
//      covers. Call buildMonthlyFigures() to get the per-month
//      Initial Stock/OUT/Balance Forwarded/IN breakdown, and call
//      buildChemicalDocDefinition() with rangeType: 'month' and that
//      breakdown.
//   6. If rangeType === 'date' (unchanged from before month-mode
//      existed): dateLabel stays undefined so the header falls back to
//      the literal "Date: <start> to <end>" text. Call
//      buildChemicalDocDefinition() with rangeType: 'date' and the flat
//      whole-range transactions/initialCurrentBalance/initialOutBalance
//      fields.
//   7. Call renderDocDefinitionToBuffer() on the result and return it.
export async function generateChemicalPdf(
  chemicalId: string,
  startDate: string,
  endDate: string,
  rangeType: 'date' | 'month' = 'month'
): Promise<Buffer> {
  const chemical = await prisma.chemical.findUnique({ where: { id: chemicalId } });
  if (!chemical) {
    throw new Error('Chemical not found');
  }

  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T23:59:59.999Z`);

  const transactions = await prisma.transaction.findMany({
    where: {
      chemicalId,
      OR: [
        { type: 'STOCK_IN', dateReceived: { gte: start, lte: end } },
        { type: 'USAGE', dateUsed: { gte: start, lte: end } },
        { type: 'REPLENISH', dateReplenished: { gte: start, lte: end } },
      ],
    },
    // Ordered by sequenceNo — the chain of truth for transaction order
    // (see lib/balance.ts). dateReceived/dateUsed/dateReplenished are
    // mutually exclusive nullable columns (only one is populated per
    // row, matching its type), so sorting by them in sequence bucket
    // rows by type rather than true chronological/entry order (NULLS
    // LAST pushes every USAGE/REPLENISH row after every STOCK_IN row,
    // regardless of actual date). sequenceNo has no such issue.
    orderBy: [{ sequenceNo: 'asc' }],
  });

  const settings = await prisma.appSettings.findUniqueOrThrow({ where: { id: 1 } });

  const priorTransaction = await prisma.transaction.findFirst({
    where: {
      chemicalId,
      OR: [
        { dateReceived: { lt: start } },
        { dateUsed: { lt: start } },
        { dateReplenished: { lt: start } },
      ],
    },
    orderBy: { sequenceNo: 'desc' },
  });
  const priorCurrentBalance = priorTransaction ? Number(priorTransaction.currentBalanceAfter) : 0;
  const priorOutBalance = priorTransaction ? Number(priorTransaction.balanceOut) : 0;

  if (rangeType === 'month') {
    const dateLabel = formatMonthRangeLabel(startDate, endDate);
    const months = buildMonthlyFigures(transactions, startDate, endDate, priorCurrentBalance, priorOutBalance);

    const docDefinition = buildChemicalDocDefinition({
      chemical,
      rangeType: 'month',
      startDate,
      endDate,
      dateLabel,
      settings,
      months,
    });

    return renderDocDefinitionToBuffer(docDefinition);
  }

  const docDefinition = buildChemicalDocDefinition({
    chemical,
    rangeType: 'date',
    startDate,
    endDate,
    dateLabel: undefined,
    settings,
    transactions,
    initialCurrentBalance: priorCurrentBalance,
    initialOutBalance: priorOutBalance,
  });

  return renderDocDefinitionToBuffer(docDefinition);
}
