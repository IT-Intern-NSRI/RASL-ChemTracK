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
import { computeChemicalBalanceSummary, ChemicalBalanceSummary } from '../balance';
import { buildBalanceSummaryText } from '../txt/balanceSummary';
import { formatMonthRangeLabel } from '../timezone';

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_');
}

// def generateBulkExportZip(): Input is one export date range (startDate,
// endDate as "YYYY-MM-DD" strings — always already-resolved concrete
// calendar-day boundaries, even in "Month Selection" mode), one optional
// array of chemical ids (if omitted, every non-archived chemical is
// included), one rangeType ('date' | 'month', default 'month' — every
// export entry point in the app only offers Month Selection now;
// forwarded unchanged to each PDF so its header/pagination match), and
// one includeSummary flag (default false). Callers with a date range that
// isn't month-aligned (the 5-year purge's backup — see lib/purge.ts) must
// explicitly pass 'date' to get the original fixed-23-rows-per-page
// layout instead, and leave includeSummary at its default so the purge
// backup's contents stay exactly what they were before this feature
// existed.
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
//        c. If includeSummary is true, also call
//           computeChemicalBalanceSummary(chemical.id, startDate,
//           endDate) and collect the result (same target chemical list,
//           same date range — no extra query for "which chemicals" is
//           needed).
//   4. If includeSummary is true and at least one summary was collected:
//      build the range label the same way generateChemicalPdf does
//      (formatMonthRangeLabel(startDate, endDate) in 'month' mode, else
//      the literal "<startDate> to <endDate>"), render it via
//      buildBalanceSummaryText(), and archive.append() it as
//      "balance-summary.txt" at the ZIP's root, alongside the per-chemical
//      PDFs.
//   5. Call archive.finalize().
//   6. Await the buffer collector resolving and return the completed
//      Buffer.
export async function generateBulkExportZip(
  startDate: string,
  endDate: string,
  chemicalIds?: string[],
  rangeType: 'date' | 'month' = 'month',
  includeSummary: boolean = false
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

  const summaries: ChemicalBalanceSummary[] = [];
  for (const chemical of chemicals) {
    const pdfBuffer = await generateChemicalPdf(chemical.id, startDate, endDate, rangeType);
    archive.append(pdfBuffer, { name: `${sanitizeFilename(chemical.name)}.pdf` });

    if (includeSummary) {
      summaries.push(await computeChemicalBalanceSummary(chemical.id, startDate, endDate));
    }
  }

  if (includeSummary && summaries.length > 0) {
    const rangeLabel =
      rangeType === 'month' ? formatMonthRangeLabel(startDate, endDate) : `${startDate} to ${endDate}`;
    const summaryText = buildBalanceSummaryText(summaries, rangeLabel);
    archive.append(summaryText, { name: 'balance-summary.txt' });
  }

  await archive.finalize();

  return bufferPromise;
}
