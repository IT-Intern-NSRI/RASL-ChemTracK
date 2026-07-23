// src/lib/balance.ts
//
// The ledger core. This is the most important file in the app: it's what
// keeps two independent running balances correct as stock-in, usage, and
// replenish instances are logged, edited, or deleted — including the case
// where a backdated entry is added out of chronological order.
//
// TWO independent balances are tracked per chemical:
//   - "Current Balance" (Chemical.currentBalance / Transaction.
//     currentBalanceAfter): total inventory on hand. += STOCK_IN's
//     quantityReceived, -= USAGE's quantityUsed, UNCHANGED by REPLENISH
//     (replenish only moves already-counted stock between the bulk
//     container and the smaller working container — it doesn't change
//     how much you have in total).
//   - "Current Out Balance" (Chemical.currentOutBalance / Transaction.
//     balanceOut): the amount currently decanted into the smaller
//     day-to-day working container. += REPLENISH's quantityReplenished,
//     -= USAGE's quantityUsed, UNCHANGED by STOCK_IN (newly received bulk
//     stock doesn't automatically top up the working container).
// USAGE is the only transaction type that touches both at once, since a
// real withdrawal is drawn from the working container and also depletes
// total inventory.
//
// Design note: both balances are stored on every Transaction row at
// write-time (not derived live from the full history on every read). The
// chain of truth follows `sequenceNo` (insertion order), not
// `dateUsed`/`dateReceived`/`dateReplenished` (which the user can freely
// edit/backdate). This is also what makes the 5-year purge safe: deleting
// old rows can't corrupt current balances, because every remaining row
// already carries its own correct balances.
//
// Only "Current Out Balance" (balanceOut) supports the manual-override
// mechanism (the "Balance (Out)" field exposed on the stock-in/usage/
// replenish forms) — "Current Balance" (currentBalanceAfter) is always
// purely computed, since there's no UI for overriding it.

import { Prisma, TransactionType } from '@prisma/client';
import { prisma } from './prisma';
import {
  StockInInput,
  UsageInput,
  ReplenishInput,
  stockInUpdateSchema,
  usageUpdateSchema,
  replenishUpdateSchema,
} from './validation';
import { getTodayManila, toManilaDateOnly } from './timezone';

type AnyInput = StockInInput | UsageInput | ReplenishInput;

// def computeNewCurrentBalance(): Input is one number (currentBalance, in
// liters), one TransactionType, and one number (quantity, in liters).
// Output is one number (the resulting Current Balance / total-inventory
// figure).
// Pseudocode:
//   1. If type is 'STOCK_IN', return currentBalance + quantity.
//   2. If type is 'USAGE', return currentBalance - quantity.
//   3. If type is 'REPLENISH', return currentBalance unchanged.
export function computeNewCurrentBalance(
  currentBalance: number,
  type: TransactionType,
  quantity: number
): number {
  if (type === 'STOCK_IN') {
    return currentBalance + quantity;
  }
  if (type === 'USAGE') {
    return currentBalance - quantity;
  }
  return currentBalance;
}

// def computeNewOutBalance(): Input is one number (outBalance, in
// liters), one TransactionType, and one number (quantity, in liters).
// Output is one number (the resulting Current Out Balance figure).
// Pseudocode:
//   1. If type is 'REPLENISH', return outBalance + quantity.
//   2. If type is 'USAGE', return outBalance - quantity.
//   3. If type is 'STOCK_IN', return outBalance unchanged.
export function computeNewOutBalance(
  outBalance: number,
  type: TransactionType,
  quantity: number
): number {
  if (type === 'REPLENISH') {
    return outBalance + quantity;
  }
  if (type === 'USAGE') {
    return outBalance - quantity;
  }
  return outBalance;
}

function quantityFor(type: TransactionType, input: AnyInput): number {
  if (type === 'STOCK_IN') return (input as StockInInput).quantityReceived;
  if (type === 'USAGE') return (input as UsageInput).quantityUsed;
  return (input as ReplenishInput).quantityReplenished;
}

// def recordTransaction(): Input is one chemical id (string), one
// validated input object (StockInInput, UsageInput, or ReplenishInput),
// and one TransactionType. Output is a Promise resolving to the created
// Transaction row (as a plain object matching the Prisma Transaction
// model).
// Pseudocode:
//   1. Open a Prisma interactive transaction (prisma.$transaction) so
//      reading the chemical's current balances and writing the new row +
//      updated balances happen atomically. Lock the chemical row (e.g.
//      via a raw `SELECT ... FOR UPDATE` query inside the transaction) to
//      prevent a race between two concurrent submissions for the same
//      chemical.
//   2. Load the chemical row (currentBalance, currentOutBalance) inside
//      that locked transaction.
//   3. Determine the quantity to use: quantityReceived for STOCK_IN,
//      quantityUsed for USAGE, quantityReplenished for REPLENISH.
//   4. Compute nextSequenceNo = (max existing sequenceNo for this
//      chemical, or 0) + 1.
//   5. Compute newCurrentBalance via computeNewCurrentBalance() —
//      this is never manually overridden (no UI field for it).
//   6. If input.balanceOut was explicitly provided, treat it as a manual
//      override of the Out Balance: balanceOverridden = true,
//      newOutBalance = input.balanceOut. Otherwise compute newOutBalance
//      via computeNewOutBalance() and balanceOverridden = false.
//   7. If type is USAGE and the resulting newOutBalance < 0, set
//      isOverdrawn = true — but still allow the write (usage is flagged,
//      never blocked, per project decision). Overdraw is judged against
//      the Out Balance (the working container someone would actually
//      notice running dry), not the total Current Balance.
//   8. Normalize the relevant date field: use the caller-supplied date if
//      present, otherwise default to getTodayManila(); pass any
//      caller-supplied date through toManilaDateOnly() to normalize it.
//   9. Insert the Transaction row with only the appropriate field group
//      populated (stock-in fields, usage fields, OR replenish fields) and
//      the rest left null — this is what keeps a same-day stock-in,
//      usage, and replenish as independent rows.
//   10. Update chemical.currentBalance to newCurrentBalance and
//       chemical.currentOutBalance to newOutBalance.
//   11. Commit the Prisma transaction and return the created row.
export async function recordTransaction(
  chemicalId: string,
  input: AnyInput,
  type: TransactionType
) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Lock the chemical row to prevent a race between concurrent writes.
    await tx.$queryRaw`SELECT id FROM "Chemical" WHERE id = ${chemicalId} FOR UPDATE`;

    const chemical = await tx.chemical.findUniqueOrThrow({ where: { id: chemicalId } });
    const currentBalance = Number(chemical.currentBalance);
    const currentOutBalance = Number(chemical.currentOutBalance);

    const quantity = quantityFor(type, input);

    const maxSeq = await tx.transaction.aggregate({
      where: { chemicalId },
      _max: { sequenceNo: true },
    });
    const nextSequenceNo = (maxSeq._max.sequenceNo ?? 0) + 1;

    const newCurrentBalance = computeNewCurrentBalance(currentBalance, type, quantity);

    let newOutBalance: number;
    let balanceOverridden: boolean;
    if (input.balanceOut !== undefined && input.balanceOut !== null) {
      newOutBalance = input.balanceOut;
      balanceOverridden = true;
    } else {
      newOutBalance = computeNewOutBalance(currentOutBalance, type, quantity);
      balanceOverridden = false;
    }

    const isOverdrawn = type === 'USAGE' && newOutBalance < 0;

    const data: Prisma.TransactionUncheckedCreateInput = {
      chemicalId,
      type,
      sequenceNo: nextSequenceNo,
      balanceOut: newOutBalance,
      currentBalanceAfter: newCurrentBalance,
      balanceOverridden,
      isOverdrawn,
    };

    if (type === 'STOCK_IN') {
      const stockIn = input as StockInInput;
      const dateReceived = stockIn.dateReceived
        ? toManilaDateOnly(stockIn.dateReceived)
        : getTodayManila();
      data.dateReceived = new Date(`${dateReceived}T00:00:00.000Z`);
      data.supplierInfo = stockIn.supplierInfo;
      data.truckerCarrier = stockIn.truckerCarrier ?? null;
      data.lotBatchNo = stockIn.lotBatchNo;
      data.quantityReceived = stockIn.quantityReceived;
    } else if (type === 'USAGE') {
      const usage = input as UsageInput;
      const dateUsed = usage.dateUsed ? toManilaDateOnly(usage.dateUsed) : getTodayManila();
      data.dateUsed = new Date(`${dateUsed}T00:00:00.000Z`);
      data.detailsOfUsage = usage.detailsOfUsage;
      data.workOrderNo = usage.workOrderNo ?? null;
      data.lotBatchNoUsed = usage.lotBatchNoUsed ?? null;
      data.quantityUsed = usage.quantityUsed;
    } else {
      const replenish = input as ReplenishInput;
      const dateReplenished = replenish.dateReplenished
        ? toManilaDateOnly(replenish.dateReplenished)
        : getTodayManila();
      data.dateReplenished = new Date(`${dateReplenished}T00:00:00.000Z`);
      data.quantityReplenished = replenish.quantityReplenished;
      data.replenishNotes = replenish.replenishNotes ?? null;
    }

    const created = await tx.transaction.create({ data });

    await tx.chemical.update({
      where: { id: chemicalId },
      data: { currentBalance: newCurrentBalance, currentOutBalance: newOutBalance },
    });

    return created;
  });
}

// def recalculateChain(): Input is one chemical id (string) and one number
// (fromSequenceNo — the sequenceNo of the transaction that was just
// edited or deleted). Output is a Promise resolving to none (side effect:
// rewrites both balance chains on every later transaction for that
// chemical, and updates chemical.currentBalance /
// chemical.currentOutBalance).
// Pseudocode:
//   1. Lock the chemical row (same concurrency concern as
//      recordTransaction step 1).
//   2. Find the transaction immediately before fromSequenceNo (the last
//      row with sequenceNo < fromSequenceNo) to use as the starting point
//      for BOTH chains. If none exists, both start at 0.
//   3. Fetch every transaction for this chemical with
//      sequenceNo >= fromSequenceNo, ordered ascending by sequenceNo.
//   4. Walk the list in order, tracking two running baselines (current
//      balance, out balance), starting from step 2's values. For each
//      row:
//        a. Current Balance is never overridden — always recompute
//           currentBalanceAfter = computeNewCurrentBalance(baseline,
//           row.type, its quantity field).
//        b. If row.balanceOverridden is true, do NOT recompute its
//           Out Balance (balanceOut) — treat its existing overridden
//           value as the new out-balance baseline and move on (an
//           override is sticky, it doesn't get silently undone by a
//           later edit elsewhere in the chain).
//        c. Otherwise, recompute balanceOut =
//           computeNewOutBalance(outBaseline, row.type, its quantity
//           field) and update isOverdrawn accordingly (true if type is
//           USAGE and the new balanceOut is negative).
//        d. Advance both baselines to this row's (possibly
//           just-recomputed) values before moving to the next row.
//   5. Persist all updated rows within the same Prisma transaction.
//   6. Set chemical.currentBalance / chemical.currentOutBalance to the
//      final row's values (or the step-2 baselines if the fetched list
//      was empty, i.e. this chemical has no transactions left at or
//      after fromSequenceNo).
//   7. Commit.
export async function recalculateChain(chemicalId: string, fromSequenceNo: number): Promise<void> {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$queryRaw`SELECT id FROM "Chemical" WHERE id = ${chemicalId} FOR UPDATE`;

    const previous = await tx.transaction.findFirst({
      where: { chemicalId, sequenceNo: { lt: fromSequenceNo } },
      orderBy: { sequenceNo: 'desc' },
    });
    let currentBaseline = previous ? Number(previous.currentBalanceAfter) : 0;
    let outBaseline = previous ? Number(previous.balanceOut) : 0;

    const rows = await tx.transaction.findMany({
      where: { chemicalId, sequenceNo: { gte: fromSequenceNo } },
      orderBy: { sequenceNo: 'asc' },
    });

    for (const row of rows) {
      const quantity =
        row.type === 'STOCK_IN'
          ? Number(row.quantityReceived)
          : row.type === 'USAGE'
            ? Number(row.quantityUsed)
            : Number(row.quantityReplenished);

      const newCurrentBalance = computeNewCurrentBalance(currentBaseline, row.type, quantity);

      let newOutBalance: number;
      let newIsOverdrawn: boolean;
      if (row.balanceOverridden) {
        newOutBalance = Number(row.balanceOut);
        newIsOverdrawn = row.isOverdrawn;
      } else {
        newOutBalance = computeNewOutBalance(outBaseline, row.type, quantity);
        newIsOverdrawn = row.type === 'USAGE' && newOutBalance < 0;
      }

      await tx.transaction.update({
        where: { id: row.id },
        data: {
          balanceOut: newOutBalance,
          currentBalanceAfter: newCurrentBalance,
          isOverdrawn: newIsOverdrawn,
        },
      });

      currentBaseline = newCurrentBalance;
      outBaseline = newOutBalance;
    }

    await tx.chemical.update({
      where: { id: chemicalId },
      data: { currentBalance: currentBaseline, currentOutBalance: outBaseline },
    });
  });
}

// One chemical's beginning/end balance summary over a date range, as
// shown on the bulk-export summary .txt (see src/lib/txt/balanceSummary.ts
// and src/lib/zip/bulkExport.ts).
//
// beginningBalance / endBalance are "Current Balance" (total inventory,
// currentBalanceAfter) — NOT "Current Out Balance" — since the summary is
// meant to answer "how much of this chemical did we have, and how much is
// left, across this range," regardless of how much was decanted into the
// working container along the way.
//
// soldUsed is a pure sum of USAGE's quantityUsed within the range — it
// deliberately does NOT net against any STOCK_IN that also happened in
// range (so it does not, in general, equal endBalance - beginningBalance;
// that difference would also fold in stock received during the range).
export interface ChemicalBalanceSummary {
  chemicalId: string;
  chemicalName: string;
  unit: string;
  beginningBalance: number;
  soldUsed: number;
  endBalance: number;
}

// def computeChemicalBalanceSummary(): Input is one chemical id (string)
// and one date range (startDate, endDate as "YYYY-MM-DD" strings,
// inclusive on both ends). Output is a Promise resolving to one
// ChemicalBalanceSummary.
// Pseudocode:
//   1. Load the chemical (name, unit); throw "not found" if missing.
//   2. Beginning Balance = currentBalanceAfter of the last transaction (by
//      sequenceNo — the chain of truth, same convention as
//      pdfGenerator.ts's priorTransaction lookup) dated strictly before
//      startDate, across all transaction types (checking whichever of
//      dateReceived/dateUsed/dateReplenished is populated). 0 if none.
//   3. End Balance = currentBalanceAfter of the last transaction dated on
//      or before endDate. Falls back to Beginning Balance if there's no
//      such transaction (nothing happened in or before the range).
//   4. Sold/Used = sum of quantityUsed across every USAGE row whose
//      dateUsed falls within [startDate, endDate] (inclusive). This is a
//      separate query from steps 2-3 — it only looks at USAGE rows, and
//      does NOT net against STOCK_IN, so it does not have to equal
//      End Balance - Beginning Balance.
//   5. Return { chemicalId, chemicalName, unit, beginningBalance,
//      soldUsed, endBalance }.
export async function computeChemicalBalanceSummary(
  chemicalId: string,
  startDate: string,
  endDate: string
): Promise<ChemicalBalanceSummary> {
  const chemical = await prisma.chemical.findUniqueOrThrow({ where: { id: chemicalId } });

  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T23:59:59.999Z`);

  const beforeRange = await prisma.transaction.findFirst({
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
  const beginningBalance = beforeRange ? Number(beforeRange.currentBalanceAfter) : 0;

  const throughRange = await prisma.transaction.findFirst({
    where: {
      chemicalId,
      OR: [
        { dateReceived: { lte: end } },
        { dateUsed: { lte: end } },
        { dateReplenished: { lte: end } },
      ],
    },
    orderBy: { sequenceNo: 'desc' },
  });
  const endBalance = throughRange ? Number(throughRange.currentBalanceAfter) : beginningBalance;

  const usageInRange = await prisma.transaction.aggregate({
    where: {
      chemicalId,
      type: 'USAGE',
      dateUsed: { gte: start, lte: end },
    },
    _sum: { quantityUsed: true },
  });
  const soldUsed = Number(usageInRange._sum.quantityUsed ?? 0);

  return {
    chemicalId,
    chemicalName: chemical.name,
    unit: chemical.unit,
    beginningBalance,
    soldUsed,
    endBalance,
  };
}

function schemaForType(type: TransactionType) {
  if (type === 'STOCK_IN') return stockInUpdateSchema;
  if (type === 'USAGE') return usageUpdateSchema;
  return replenishUpdateSchema;
}

// def editTransaction(): Input is one transaction id (string) and one
// partial update object (a subset of StockInInput/UsageInput/
// ReplenishInput fields, and/or a manual balanceOut override). Output is
// a Promise resolving to the updated Transaction row.
// Pseudocode:
//   1. Load the existing transaction; throw a "not found" error if
//      missing.
//   2. Validate `updates` against the schema matching its existing `type`
//      (stockInUpdateSchema, usageUpdateSchema, or replenishUpdateSchema
//      from lib/validation.ts).
//   3. Compute a diff of changed fields (old value -> new value) and
//      append an entry to editHistory (a JSON array); set edited = true.
//   4. Apply the updates to the row's fields.
//   5. If `updates.balanceOut` was explicitly provided, set
//      balanceOverridden = true on this row.
//   6. Save the row.
//   7. Call recalculateChain(chemicalId, this row's sequenceNo) so every
//      later row picks up the change.
//   8. Return the updated row.
export async function editTransaction(transactionId: string, updates: Record<string, unknown>) {
  const existing = await prisma.transaction.findUnique({ where: { id: transactionId } });
  if (!existing) {
    throw new Error('Transaction not found');
  }

  const schema = schemaForType(existing.type);
  const validated = schema.parse(updates);

  const editHistory: Array<{ field: string; oldValue: unknown; newValue: unknown; editedAt: string }> =
    Array.isArray(existing.editHistory) ? (existing.editHistory as any[]) : [];
  const now = new Date().toISOString();

  const data: Prisma.TransactionUpdateInput = {};
  const dateFields = new Set(['dateReceived', 'dateUsed', 'dateReplenished']);

  for (const [field, value] of Object.entries(validated)) {
    if (value === undefined) continue;

    let oldValue: unknown = (existing as Record<string, unknown>)[field];
    let newValue: unknown = value;

    if (dateFields.has(field)) {
      const normalized = toManilaDateOnly(value as string);
      newValue = normalized;
      (data as Record<string, unknown>)[field] = new Date(`${normalized}T00:00:00.000Z`);
      const existingDate = existing[field as 'dateReceived' | 'dateUsed' | 'dateReplenished'];
      oldValue = existingDate ? toManilaDateOnly(existingDate as Date) : null;
    } else {
      (data as Record<string, unknown>)[field] = value;
    }

    editHistory.push({ field, oldValue, newValue, editedAt: now });
  }

  data.editHistory = editHistory as unknown as Prisma.InputJsonValue;
  data.edited = true;

  if (validated.balanceOut !== undefined) {
    data.balanceOverridden = true;
  }

  await prisma.transaction.update({
    where: { id: transactionId },
    data,
  });

  await recalculateChain(existing.chemicalId, existing.sequenceNo);

  return prisma.transaction.findUniqueOrThrow({ where: { id: transactionId } });
}

// def deleteTransaction(): Input is one transaction id (string). Output is
// a Promise resolving to none (side effect: removes the row and cascades
// a recalculation of both balance chains).
// Pseudocode:
//   1. Load the transaction; throw a "not found" error if missing.
//   2. If it's an anchor row (isAnchor === true), throw a descriptive
//      error and refuse to delete it. An anchor is, by construction, the
//      sole remaining row for its chemical whose currentBalanceAfter/
//      balanceOut encode everything that came before an earlier 5-year
//      purge (see lib/purge.ts's module comment). recalculateChain()
//      seeds its running baseline from "the transaction immediately
//      before fromSequenceNo" — if the anchor itself is deleted, that
//      lookup finds nothing (its own predecessors were already purged),
//      so the baseline would silently reset to 0/0 and every later
//      transaction's Current Balance / Current Out Balance (and any
//      export's Initial Stock / Balance Forwarded figures) would be
//      recomputed from a wrong, zeroed starting point. This is the one
//      deletion this function must never allow.
//   3. Note its chemicalId and sequenceNo.
//   4. Delete the row.
//   5. Call recalculateChain(chemicalId, sequenceNo) so every later row
//      (which now has one fewer predecessor) is recomputed. If this was
//      the last row for the chemical, recalculateChain naturally resets
//      chemical.currentBalance / chemical.currentOutBalance to the new
//      last row's values (or 0 if none remain).
export async function deleteTransaction(transactionId: string): Promise<void> {
  const existing = await prisma.transaction.findUnique({ where: { id: transactionId } });
  if (!existing) {
    throw new Error('Transaction not found');
  }

  if (existing.isAnchor) {
    throw new Error(
      'This entry is an anchor row retained by a prior 5-year purge. It preserves the correct opening balance for every later entry, so it cannot be deleted.'
    );
  }

  const { chemicalId, sequenceNo } = existing;

  await prisma.transaction.delete({ where: { id: transactionId } });

  await recalculateChain(chemicalId, sequenceNo);
}
