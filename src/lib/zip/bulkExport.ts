// src/lib/zip/bulkExport.ts
//
// Builds the bulk-export ZIP: one PDF per chemical (via
// generateChemicalPdf), covering every non-archived chemical in the
// requested date range. Per project decision, chemicals with zero
// activity in the range are still included (their document just shows an
// empty table + zeroed IN/OUT) — this is the "no skip" rule.

import archiver from 'archiver';
import { PassThrough } from 'stream';
import { prisma } from '../prisma';
import { generateChemicalPdf } from '../pdf/pdfGenerator';

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

// def generateBulkExportZip(): Input is one export date range (startDate,
// endDate as "YYYY-MM-DD" strings — always already-resolved concrete
// calendar-day boundaries, even in "Month Selection" mode), one optional
// array of chemical ids (if omitted, every non-archived chemical is
// included), and one rangeType ('date' | 'month', default 'month' — every
// export entry point in the app only offers Month Selection now;
// forwarded unchanged to each PDF so its header/pagination match). Callers
// with a date range that isn't month-aligned (the 5-year purge's backup —
// see lib/purge.ts) must explicitly pass 'date' to get the original
// fixed-23-rows-per-page layout instead.
// Output is a Promise resolving to one Buffer containing the ZIP file's
// bytes.
// Pseudocode:
//   1. Determine the target chemical list: if chemicalIds was provided,
//      fetch exactly those; otherwise fetch all chemicals where
//      isArchived = false.
//   2. Create an archiver('zip') instance, piped into an in-memory buffer
//      collector (e.g. a PassThrough stream whose 'data' chunks are
//      collected into an array, resolving a Promise on 'end'/archive's
//      'close' event).
//   3. For each chemical in the target list (sequentially, or with
//      bounded concurrency to avoid spiking memory on the free-tier
//      host):
//        a. Call generateChemicalPdf(chemical.id, startDate, endDate,
//           rangeType).
//        b. archive.append(pdfBuffer, { name: `${sanitizedName}.pdf` })
//           where sanitizedName strips characters that are unsafe in
//           filenames from chemical.name.
//   4. Call archive.finalize().
//   5. Await the buffer collector resolving and return the completed
//      Buffer.
export async function generateBulkExportZip(
  startDate: string,
  endDate: string,
  chemicalIds?: string[],
  rangeType: 'date' | 'month' = 'month'
): Promise<Buffer> {
  const chemicals = chemicalIds
    ? await prisma.chemical.findMany({ where: { id: { in: chemicalIds } } })
    : await prisma.chemical.findMany({ where: { isArchived: false } });

  const archive = archiver('zip');
  const passthrough = new PassThrough();
  const chunks: Buffer[] = [];

  const bufferPromise = new Promise<Buffer>((resolve, reject) => {
    passthrough.on('data', (chunk: Buffer) => chunks.push(chunk));
    passthrough.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', (err) => reject(err));
  });

  archive.pipe(passthrough);

  for (const chemical of chemicals) {
    const pdfBuffer = await generateChemicalPdf(chemical.id, startDate, endDate, rangeType);
    archive.append(pdfBuffer, { name: `${sanitizeFilename(chemical.name)}.pdf` });
  }

  await archive.finalize();

  return bufferPromise;
}
