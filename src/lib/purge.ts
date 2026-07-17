// src/lib/purge.ts
//
// The 5-year manual purge feature. Two-step prepare/confirm flow so
// nothing is deleted without a downloaded backup in hand first. Render's
// free tier has an ephemeral filesystem, so the backup can't just be
// saved server-side — it's handed directly to the caller as a download,
// and only the *plan* for what to delete is persisted (in
// PurgePreparation) until confirmed or it expires.
//
// Anchor-row rule: for each chemical, the single most recent transaction
// dated before the cutoff is retained even though it's older than the
// cutoff, so that any future export's "Initial Stock/Balance Forwarded"
// figure for dates after the cutoff still resolves correctly. Everything
// strictly older than that anchor row is eligible for deletion.

import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { getCutoffDateManila } from './timezone';
import { generateBulkExportZip } from './zip/bulkExport';

const PURGE_TOKEN_TTL_MINUTES = 15;
export const DEFAULT_PURGE_YEARS = 5;

export interface PurgePlanSummary {
  cutoffDate: string;
  chemicalsAffected: number;
  totalRowsToDelete: number;
  perChemical: Array<{ chemicalId: string; chemicalName: string; rowsToDelete: number }>;
}

// def preparePurge(): Input is one optional string (cutoffDate override,
// "YYYY-MM-DD"; defaults to DEFAULT_PURGE_YEARS years before today in
// Asia/Manila). Output is a Promise resolving to one object:
// { purgeToken: string, zipBuffer: Buffer, summary: PurgePlanSummary }.
// Nothing is deleted by this function.
// Pseudocode:
//   1. Resolve cutoffDate = input ?? getCutoffDateManila(DEFAULT_PURGE_YEARS).
//   2. For every chemical, find its anchor row: the most recent
//      transaction dated strictly before cutoffDate (checking whichever
//      of dateReceived/dateUsed/dateReplenished is populated). If none
//      exists, there's nothing to purge for that chemical — skip it.
//   3. Collect the ids of every OTHER transaction for that chemical dated
//      strictly before cutoffDate (i.e. excluding the anchor) — these are
//      the deletion candidates.
//   4. Build a summary: per-chemical row counts + totals across all
//      affected chemicals.
//   5. Call generateBulkExportZip(), scoped to the affected chemical ids
//      and a date range spanning from the earliest affected transaction
//      through the day before cutoffDate — this is the backup the caller
//      must download before confirming. Explicitly pass rangeType:
//      'date' — this range is an arbitrary historical span, not
//      necessarily aligned to whole calendar months, so it can't safely
//      use 'month' mode's page-per-month/empty-day-fill layout (that
//      layout assumes whole-month boundaries; generateBulkExportZip now
//      defaults to 'month' since that's what the UI always sends, but
//      this call site isn't UI-driven).
//   6. Generate a purgeToken via randomUUID().
//   7. Persist a PurgePreparation row: token, cutoffDate,
//      transactionIdsToDelete (JSON array of ids), anchorTransactionIds
//      (JSON array of ids), and expiresAt = now + PURGE_TOKEN_TTL_MINUTES.
//   8. Return { purgeToken, zipBuffer, summary }.
export async function preparePurge(
  cutoffDate?: string
): Promise<{ purgeToken: string; zipBuffer: Buffer; summary: PurgePlanSummary }> {
  const resolvedCutoffDate = cutoffDate ?? getCutoffDateManila(DEFAULT_PURGE_YEARS);
  const cutoff = new Date(`${resolvedCutoffDate}T00:00:00.000Z`);

  const chemicals = await prisma.chemical.findMany();

  const perChemical: Array<{ chemicalId: string; chemicalName: string; rowsToDelete: number }> =
    [];
  const affectedChemicalIds: string[] = [];
  const allDeletionIds: string[] = [];
  const allAnchorIds: string[] = [];
  let earliestDate: Date | null = null;

  for (const chemical of chemicals) {
    const beforeCutoff = await prisma.transaction.findMany({
      where: {
        chemicalId: chemical.id,
        OR: [
          { dateReceived: { lt: cutoff } },
          { dateUsed: { lt: cutoff } },
          { dateReplenished: { lt: cutoff } },
        ],
      },
      orderBy: { sequenceNo: 'desc' },
    });

    if (beforeCutoff.length === 0) {
      continue;
    }

    const anchor = beforeCutoff[0];
    const toDelete = beforeCutoff.slice(1);

    if (toDelete.length === 0) {
      continue;
    }

    affectedChemicalIds.push(chemical.id);
    allAnchorIds.push(anchor.id);
    allDeletionIds.push(...toDelete.map((t: { id: string }) => t.id));

    perChemical.push({
      chemicalId: chemical.id,
      chemicalName: chemical.name,
      rowsToDelete: toDelete.length,
    });

    for (const row of toDelete) {
      const rowDate = row.dateReceived ?? row.dateUsed ?? row.dateReplenished;
      if (rowDate && (!earliestDate || rowDate < earliestDate)) {
        earliestDate = rowDate;
      }
    }
  }

  const summary: PurgePlanSummary = {
    cutoffDate: resolvedCutoffDate,
    chemicalsAffected: affectedChemicalIds.length,
    totalRowsToDelete: allDeletionIds.length,
    perChemical,
  };

  const dayBeforeCutoff = new Date(cutoff.getTime() - 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const backupStartDate = earliestDate
    ? earliestDate.toISOString().slice(0, 10)
    : dayBeforeCutoff;

  const zipBuffer = await generateBulkExportZip(
    backupStartDate,
    dayBeforeCutoff,
    affectedChemicalIds,
    'date'
  );

  const purgeToken = randomUUID();
  const expiresAt = new Date(Date.now() + PURGE_TOKEN_TTL_MINUTES * 60 * 1000);

  await prisma.purgePreparation.create({
    data: {
      token: purgeToken,
      cutoffDate: cutoff,
      transactionIdsToDelete: allDeletionIds,
      anchorTransactionIds: allAnchorIds,
      expiresAt,
    },
  });

  return { purgeToken, zipBuffer, summary };
}

// def confirmPurge(): Input is one string (purgeToken from
// preparePurge()). Output is a Promise resolving to one object
// summarizing what was deleted (same shape as PurgePlanSummary, plus a
// performedAt timestamp).
// Pseudocode:
//   1. Look up the PurgePreparation row by token.
//   2. If missing, or expiresAt is in the past, throw an error ("purge
//      token expired or invalid — re-run prepare and download a fresh
//      backup").
//   3. Within a Prisma transaction:
//        a. Set isAnchor = true on every transaction id in
//           anchorTransactionIds (so they're visibly flagged as
//           purge-retained rows if ever inspected).
//        b. Delete every transaction id in transactionIdsToDelete.
//        c. Insert a PurgeLog row (cutoffDate, performedAt = now,
//           summary = the per-chemical counts computed at prepare time).
//        d. Delete the PurgePreparation row (token consumed, one-time
//           use).
//   4. Return the summary plus performedAt.
export async function confirmPurge(
  purgeToken: string
): Promise<PurgePlanSummary & { performedAt: string }> {
  const preparation = await prisma.purgePreparation.findUnique({ where: { token: purgeToken } });

  if (!preparation || preparation.expiresAt < new Date()) {
    throw new Error('purge token expired or invalid — re-run prepare and download a fresh backup');
  }

  const transactionIdsToDelete = preparation.transactionIdsToDelete as string[];
  const anchorTransactionIds = preparation.anchorTransactionIds as string[];
  const cutoffDate = preparation.cutoffDate.toISOString().slice(0, 10);

  const rowsToDelete = await prisma.transaction.findMany({
    where: { id: { in: transactionIdsToDelete } },
    include: { chemical: true },
  });

  const perChemicalMap = new Map<string, { chemicalName: string; rowsToDelete: number }>();
  for (const row of rowsToDelete) {
    const existing = perChemicalMap.get(row.chemicalId);
    if (existing) {
      existing.rowsToDelete += 1;
    } else {
      perChemicalMap.set(row.chemicalId, {
        chemicalName: row.chemical.name,
        rowsToDelete: 1,
      });
    }
  }

  const perChemical = Array.from(perChemicalMap.entries()).map(([chemicalId, v]) => ({
    chemicalId,
    chemicalName: v.chemicalName,
    rowsToDelete: v.rowsToDelete,
  }));

  const summary: PurgePlanSummary = {
    cutoffDate,
    chemicalsAffected: perChemical.length,
    totalRowsToDelete: transactionIdsToDelete.length,
    perChemical,
  };

  const performedAt = new Date();

  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (anchorTransactionIds.length > 0) {
      await tx.transaction.updateMany({
        where: { id: { in: anchorTransactionIds } },
        data: { isAnchor: true },
      });
    }

    if (transactionIdsToDelete.length > 0) {
      await tx.transaction.deleteMany({
        where: { id: { in: transactionIdsToDelete } },
      });
    }

    await tx.purgeLog.create({
      data: {
        cutoffDate: preparation.cutoffDate,
        performedAt,
        summary: summary as unknown as object,
      },
    });

    await tx.purgePreparation.delete({ where: { token: purgeToken } });
  });

  return { ...summary, performedAt: performedAt.toISOString() };
}
