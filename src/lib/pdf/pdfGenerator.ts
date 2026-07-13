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

// def generateChemicalPdf(): Input is one chemical id (string) and one
// export date range (startDate, endDate as "YYYY-MM-DD" strings). Output
// is a Promise resolving to one Buffer (the finished PDF for that
// chemical).
// Pseudocode:
//   1. Fetch the chemical by id from Prisma; throw a "not found" error if
//      missing.
//   2. Fetch its transactions within [startDate, endDate] (matching on
//      dateReceived for STOCK_IN rows, dateUsed for USAGE rows), ordered
//      chronologically (falling back to sequenceNo to order same-day
//      entries consistently).
//   3. Fetch the single AppSettings row (id=1) for the signature block.
//   4. Compute initialBalance: query the balanceOut of the last
//      transaction for this chemical dated strictly before startDate
//      (across both dateReceived and dateUsed); default to 0 if none
//      exists.
//   5. Call buildChemicalDocDefinition() with all of the above assembled
//      into a ChemicalDocOptions object.
//   6. Call renderDocDefinitionToBuffer() on the result and return it.
export async function generateChemicalPdf(
  chemicalId: string,
  startDate: string,
  endDate: string
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
      ],
    },
    orderBy: [{ dateReceived: 'asc' }, { dateUsed: 'asc' }, { sequenceNo: 'asc' }],
  });

  const settings = await prisma.appSettings.findUniqueOrThrow({ where: { id: 1 } });

  const priorTransaction = await prisma.transaction.findFirst({
    where: {
      chemicalId,
      OR: [{ dateReceived: { lt: start } }, { dateUsed: { lt: start } }],
    },
    orderBy: { sequenceNo: 'desc' },
  });
  const initialBalance = priorTransaction ? Number(priorTransaction.balanceOut) : 0;

  const docDefinition = buildChemicalDocDefinition({
    chemical,
    transactions,
    startDate,
    endDate,
    initialBalance,
    settings,
  });

  return renderDocDefinitionToBuffer(docDefinition);
}
