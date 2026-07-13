// src/app/api/chemicals/[id]/history/route.ts
//
// GET -> paginated transaction history for one chemical, newest first
// (the data source for the chemical detail / usage history page).

import { NextRequest, NextResponse } from 'next/server';
import { Transaction } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { jsonOk } from '@/lib/apiHelpers';
import { TransactionDTO } from '@/types';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// def GET(): Input is one NextRequest (search params: page?, pageSize?,
// startDate?, endDate?) and the chemical id route param. Output is a
// Promise resolving to one NextResponse whose JSON body is
// { items: TransactionDTO[], total: number }.
// Pseudocode:
//   1. Require auth.
//   2. Parse pagination params (default page=1, pageSize=25) and optional
//      date range filters from the search params.
//   3. Build a Prisma `where` clause: chemicalId = params.id, and if a
//      date range was given, dateUsed OR dateReceived falls within it.
//   4. Query transactions matching that where clause, ordered by
//      sequenceNo desc, with skip/take for pagination.
//   5. Also run a count query for `total`.
//   6. Map rows to TransactionDTO (converting Prisma Decimal fields to
//      plain numbers, Date fields to "YYYY-MM-DD" strings).
//   7. Return { items, total } via jsonOk.
export async function GET(request: NextRequest, { params: paramsPromise }: RouteParams): Promise<NextResponse> {
  const params = await paramsPromise;
  if (!(await requireAuth())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = Number(searchParams.get('page') ?? '1');
  const pageSize = Number(searchParams.get('pageSize') ?? '25');
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  const where: Record<string, unknown> = { chemicalId: params.id };

  if (startDate && endDate) {
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T23:59:59.999Z`);
    where.OR = [
      { dateUsed: { gte: start, lte: end } },
      { dateReceived: { gte: start, lte: end } },
    ];
  }

  const [items, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      orderBy: { sequenceNo: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.transaction.count({ where }),
  ]);

  const dtoItems: TransactionDTO[] = items.map((t: Transaction) => ({
    id: t.id,
    chemicalId: t.chemicalId,
    type: t.type,
    sequenceNo: t.sequenceNo,
    dateReceived: t.dateReceived ? t.dateReceived.toISOString().slice(0, 10) : null,
    supplierInfo: t.supplierInfo,
    truckerCarrier: t.truckerCarrier,
    lotBatchNo: t.lotBatchNo,
    quantityReceived: t.quantityReceived !== null ? Number(t.quantityReceived) : null,
    dateUsed: t.dateUsed ? t.dateUsed.toISOString().slice(0, 10) : null,
    detailsOfUsage: t.detailsOfUsage,
    workOrderNo: t.workOrderNo,
    lotBatchNoUsed: t.lotBatchNoUsed,
    quantityUsed: t.quantityUsed !== null ? Number(t.quantityUsed) : null,
    balanceOut: Number(t.balanceOut),
    balanceOverridden: t.balanceOverridden,
    isOverdrawn: t.isOverdrawn,
    isAnchor: t.isAnchor,
  }));

  return jsonOk({ items: dtoItems, total });
}
