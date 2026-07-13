// src/lib/balance.ts
//
// The ledger core. This is the most important file in the app: it's what
// keeps Balance (Out) and each chemical's current balance correct as usage
// and stock-in instances are logged, edited, or deleted — including the
// case where a backdated entry is added out of chronological order.
//
// Design note: balanceOut is stored on every Transaction row at write-time
// (not derived live from the full history on every read). The chain of
// truth follows `sequenceNo` (insertion order), not `dateUsed`/
// `dateReceived` (which the user can freely edit/backdate). This is also
// what makes the 5-year purge safe: deleting old rows can't corrupt
// current balances, because every remaining row already carries its own
// correct balanceOut.

import { Prisma, TransactionType } from '@prisma/client';
import { prisma } from './prisma';
import { StockInInput, UsageInput, stockInUpdateSchema, usageUpdateSchema } from './validation';
import { getTodayManila, toManilaDateOnly } from './timezone';

// def computeNewBalance(): Input is one number (currentBalance, in liters),
// one TransactionType ('STOCK_IN' or 'USAGE'), and one number (quantity,
// in liters). Output is one number (the resulting balance).
// Pseudocode:
//   1. If type is 'STOCK_IN', return currentBalance + quantity.
//   2. If type is 'USAGE', return currentBalance - quantity.
export function computeNewBalance(
  currentBalance: number,
  type: TransactionType,
  quantity: number
): number {
  if (type === 'STOCK_IN') {
    return currentBalance + quantity;
  }
  return currentBalance - quantity;
}

// def recordTransaction(): Input is one chemical id (string), one
// validated input object (StockInInput or UsageInput), and one
// TransactionType. Output is a Promise resolving to the created
// Transaction row (as a plain object matching the Prisma Transaction
// model).
// Pseudocode:
//   1. Open a Prisma interactive transaction (prisma.$transaction) so
//      reading the chemical's current balance and writing the new row +
//      updated balance happen atomically. Lock the chemical row (e.g. via
//      a raw `SELECT ... FOR UPDATE` query inside the transaction) to
//      prevent a race between two concurrent submissions for the same
//      chemical.
//   2. Load the chemical row (currentBalance) inside that locked
//      transaction.
//   3. Determine the quantity to use: input.quantityReceived for
//      STOCK_IN, input.quantityUsed for USAGE.
//   4. Compute nextSequenceNo = (max existing sequenceNo for this
//      chemical, or 0) + 1.
//   5. If input.balanceOut was explicitly provided, treat it as a manual
//      override: balanceOverridden = true, balanceOut = input.balanceOut.
//      Otherwise compute balanceOut via computeNewBalance() and
//      balanceOverridden = false.
//   6. If type is USAGE and the resulting balanceOut < 0, set
//      isOverdrawn = true — but still allow the write (usage is flagged,
//      never blocked, per project decision).
//   7. Normalize the relevant date field: use the caller-supplied date if
//      present, otherwise default to getTodayManila(); pass any
//      caller-supplied date through toManilaDateOnly() to normalize it.
//   8. Insert the Transaction row with only the appropriate field group
//      populated (stock-in fields OR usage fields) and the rest left
//      null — this is what keeps a same-day stock-in and usage as two
//      independent rows.
//   9. Update chemical.currentBalance to the new balanceOut.
//   10. Commit the Prisma transaction and return the created row.
export async function recordTransaction(
  chemicalId: string,
  input: StockInInput | UsageInput,
  type: TransactionType
) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    // Lock the chemical row to prevent a race between concurrent writes.
    await tx.$queryRaw`SELECT id FROM "Chemical" WHERE id = ${chemicalId} FOR UPDATE`;

    const chemical = await tx.chemical.findUniqueOrThrow({ where: { id: chemicalId } });
    const currentBalance = Number(chemical.currentBalance);

    const quantity =
      type === 'STOCK_IN'
        ? (input as StockInInput).quantityReceived
        : (input as UsageInput).quantityUsed;

    const maxSeq = await tx.transaction.aggregate({
      where: { chemicalId },
      _max: { sequenceNo: true },
    });
    const nextSequenceNo = (maxSeq._max.sequenceNo ?? 0) + 1;

    let balanceOut: number;
    let balanceOverridden: boolean;
    if (input.balanceOut !== undefined && input.balanceOut !== null) {
      balanceOut = input.balanceOut;
      balanceOverridden = true;
    } else {
      balanceOut = computeNewBalance(currentBalance, type, quantity);
      balanceOverridden = false;
    }

    const isOverdrawn = type === 'USAGE' && balanceOut < 0;

    const data: Prisma.TransactionUncheckedCreateInput = {
      chemicalId,
      type,
      sequenceNo: nextSequenceNo,
      balanceOut,
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
    } else {
      const usage = input as UsageInput;
      const dateUsed = usage.dateUsed ? toManilaDateOnly(usage.dateUsed) : getTodayManila();
      data.dateUsed = new Date(`${dateUsed}T00:00:00.000Z`);
      data.detailsOfUsage = usage.detailsOfUsage;
      data.workOrderNo = usage.workOrderNo ?? null;
      data.lotBatchNoUsed = usage.lotBatchNoUsed ?? null;
      data.quantityUsed = usage.quantityUsed;
    }

    const created = await tx.transaction.create({ data });

    await tx.chemical.update({
      where: { id: chemicalId },
      data: { currentBalance: balanceOut },
    });

    return created;
  });
}

// def recalculateChain(): Input is one chemical id (string) and one number
// (fromSequenceNo — the sequenceNo of the transaction that was just
// edited or deleted). Output is a Promise resolving to none (side effect:
// rewrites balanceOut on every later transaction for that chemical, and
// updates chemical.currentBalance).
// Pseudocode:
//   1. Lock the chemical row (same concurrency concern as
//      recordTransaction step 1).
//   2. Find the transaction immediately before fromSequenceNo (the last
//      row with sequenceNo < fromSequenceNo) to use as the starting
//      balance. If none exists, the starting balance is 0.
//   3. Fetch every transaction for this chemical with
//      sequenceNo >= fromSequenceNo, ordered ascending by sequenceNo.
//   4. Walk the list in order, tracking a running `baseline` balance
//      (starting from step 2's value). For each row:
//        a. If row.balanceOverridden is true, do NOT recompute its
//           balanceOut — treat its existing overridden value as the new
//           baseline and move on (an override is sticky, it doesn't get
//           silently undone by a later edit elsewhere in the chain).
//        b. Otherwise, recompute balanceOut = computeNewBalance(baseline,
//           row.type, its quantity field) and update isOverdrawn
//           accordingly (true if type is USAGE and the new balanceOut is
//           negative).
//        c. Set `baseline` to this row's (possibly just-recomputed)
//           balanceOut before moving to the next row.
//   5. Persist all updated rows within the same Prisma transaction.
//   6. Set chemical.currentBalance to the final row's balanceOut (or the
//      step-2 baseline if the fetched list was empty, i.e. this chemical
//      has no transactions left at or after fromSequenceNo).
//   7. Commit.
export async function recalculateChain(chemicalId: string, fromSequenceNo: number): Promise<void> {
  await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    await tx.$queryRaw`SELECT id FROM "Chemical" WHERE id = ${chemicalId} FOR UPDATE`;

    const previous = await tx.transaction.findFirst({
      where: { chemicalId, sequenceNo: { lt: fromSequenceNo } },
      orderBy: { sequenceNo: 'desc' },
    });
    let baseline = previous ? Number(previous.balanceOut) : 0;

    const rows = await tx.transaction.findMany({
      where: { chemicalId, sequenceNo: { gte: fromSequenceNo } },
      orderBy: { sequenceNo: 'asc' },
    });

    for (const row of rows) {
      let newBalanceOut: number;
      let newIsOverdrawn: boolean;

      if (row.balanceOverridden) {
        newBalanceOut = Number(row.balanceOut);
        newIsOverdrawn = row.isOverdrawn;
      } else {
        const quantity =
          row.type === 'STOCK_IN' ? Number(row.quantityReceived) : Number(row.quantityUsed);
        newBalanceOut = computeNewBalance(baseline, row.type, quantity);
        newIsOverdrawn = row.type === 'USAGE' && newBalanceOut < 0;
      }

      await tx.transaction.update({
        where: { id: row.id },
        data: { balanceOut: newBalanceOut, isOverdrawn: newIsOverdrawn },
      });

      baseline = newBalanceOut;
    }

    await tx.chemical.update({
      where: { id: chemicalId },
      data: { currentBalance: baseline },
    });
  });
}

// def editTransaction(): Input is one transaction id (string) and one
// partial update object (a subset of StockInInput/UsageInput fields,
// and/or a manual balanceOut override). Output is a Promise resolving to
// the updated Transaction row.
// Pseudocode:
//   1. Load the existing transaction; throw a "not found" error if
//      missing.
//   2. Validate `updates` against the schema matching its existing `type`
//      (stockInUpdateSchema or usageUpdateSchema from lib/validation.ts).
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

  const schema = existing.type === 'STOCK_IN' ? stockInUpdateSchema : usageUpdateSchema;
  const validated = schema.parse(updates);

  const editHistory: Array<{ field: string; oldValue: unknown; newValue: unknown; editedAt: string }> =
    Array.isArray(existing.editHistory) ? (existing.editHistory as any[]) : [];
  const now = new Date().toISOString();

  const data: Prisma.TransactionUpdateInput = {};

  for (const [field, value] of Object.entries(validated)) {
    if (value === undefined) continue;

    let oldValue: unknown = (existing as Record<string, unknown>)[field];
    let newValue: unknown = value;

    if (field === 'dateReceived' || field === 'dateUsed') {
      const normalized = toManilaDateOnly(value as string);
      newValue = normalized;
      (data as Record<string, unknown>)[field] = new Date(`${normalized}T00:00:00.000Z`);
      oldValue = existing[field as 'dateReceived' | 'dateUsed']
        ? toManilaDateOnly(existing[field as 'dateReceived' | 'dateUsed'] as Date)
        : null;
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

  const updated = await prisma.transaction.update({
    where: { id: transactionId },
    data,
  });

  await recalculateChain(existing.chemicalId, existing.sequenceNo);

  return prisma.transaction.findUniqueOrThrow({ where: { id: transactionId } });
}

// def deleteTransaction(): Input is one transaction id (string). Output is
// a Promise resolving to none (side effect: removes the row and cascades
// a balance recalculation).
// Pseudocode:
//   1. Load the transaction; throw a "not found" error if missing.
//   2. Note its chemicalId and sequenceNo.
//   3. Delete the row.
//   4. Call recalculateChain(chemicalId, sequenceNo) so every later row
//      (which now has one fewer predecessor) is recomputed. If this was
//      the last row for the chemical, recalculateChain naturally resets
//      chemical.currentBalance to the new last row's balanceOut (or 0 if
//      none remain).
export async function deleteTransaction(transactionId: string): Promise<void> {
  const existing = await prisma.transaction.findUnique({ where: { id: transactionId } });
  if (!existing) {
    throw new Error('Transaction not found');
  }

  const { chemicalId, sequenceNo } = existing;

  await prisma.transaction.delete({ where: { id: transactionId } });

  await recalculateChain(chemicalId, sequenceNo);
}
