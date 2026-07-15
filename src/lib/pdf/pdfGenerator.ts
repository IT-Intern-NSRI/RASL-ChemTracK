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
import { prisma } from '../prisma';
import { buildChemicalDocDefinition } from './chemicalDocument';
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

// def generateChemicalPdf(): Input is one chemical id (string), one
// export date range (startDate, endDate as "YYYY-MM-DD" strings — always
// already-resolved concrete calendar-day boundaries, even in "Month
// Selection" mode, where the caller resolves the chosen months into the
// 1st of the start month and the last day of the end month before
// calling this), and one rangeType ('date' | 'month', default 'date').
// Output is a Promise resolving to one Buffer (the finished PDF for that
// chemical).
// Pseudocode:
//   1. Fetch the chemical by id from Prisma; throw a "not found" error if
//      missing.
//   2. Fetch its transactions within [startDate, endDate] (matching on
//      dateReceived for STOCK_IN rows, dateUsed for USAGE rows,
//      dateReplenished for REPLENISH rows), ordered chronologically
//      (falling back to sequenceNo to order same-day entries
//      consistently). REPLENISH rows are included here even though
//      they're excluded from the table itself (see
//      chemicalDocument.ts) — they still affect the Out Balance chain,
//      so the *last* transaction in range needs to be the true last one
//      of any type.
//   3. Fetch the single AppSettings row (id=1) for the signature block.
//   4. Compute two distinct "as of the day before startDate" figures from
//      the last transaction (of any type) dated strictly before
//      startDate:
//        - initialCurrentBalance (its currentBalanceAfter): shown as
//          "Initial Stock" — the Current Balance prior to this report's
//          first entry.
//        - initialOutBalance (its balanceOut): shown as the top "OUT (L)"
//          figure — the Current Out Balance prior to this report's first
//          entry, NOT a sum of usage within the range.
//      Both default to 0 if no prior transaction exists.
//   5. If rangeType === 'month', compute dateLabel via
//      formatMonthRangeLabel(startDate, endDate) (e.g. "Jan - Jun,
//      2024"); otherwise leave dateLabel undefined so the header falls
//      back to the literal "Date: <start> to <end>" text.
//   6. Call buildChemicalDocDefinition() with all of the above assembled
//      into a ChemicalDocOptions object.
//   7. Call renderDocDefinitionToBuffer() on the result and return it.
export async function generateChemicalPdf(
  chemicalId: string,
  startDate: string,
  endDate: string,
  rangeType: 'date' | 'month' = 'date'
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
    orderBy: [
      { dateReceived: 'asc' },
      { dateUsed: 'asc' },
      { dateReplenished: 'asc' },
      { sequenceNo: 'asc' },
    ],
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
  const initialCurrentBalance = priorTransaction ? Number(priorTransaction.currentBalanceAfter) : 0;
  const initialOutBalance = priorTransaction ? Number(priorTransaction.balanceOut) : 0;

  const dateLabel = rangeType === 'month' ? formatMonthRangeLabel(startDate, endDate) : undefined;

  const docDefinition = buildChemicalDocDefinition({
    chemical,
    transactions,
    startDate,
    endDate,
    dateLabel,
    initialCurrentBalance,
    initialOutBalance,
    settings,
  });

  return renderDocDefinitionToBuffer(docDefinition);
}
