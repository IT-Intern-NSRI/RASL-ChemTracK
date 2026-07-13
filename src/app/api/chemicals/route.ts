// src/app/api/chemicals/route.ts
//
// GET -> the dashboard's chemical list (filterable by search/category/
// low-stock-only). POST -> register a new chemical.

import { NextRequest, NextResponse } from 'next/server';
import { Chemical } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { chemicalCreateSchema } from '@/lib/validation';
import { jsonError, jsonOk } from '@/lib/apiHelpers';
import { ChemicalSummary } from '@/types';

// def GET(): Input is one NextRequest (search params: search?, category?,
// lowStockOnly?, includeArchived?). Output is a Promise resolving to
// ChemicalSummary[], ordered by name.
// Pseudocode:
//   1. Require auth.
//   2. Build a Prisma `where` clause: isArchived = false unless
//      includeArchived=true; name contains `search` (case-insensitive)
//      if given; category equals `category` if given.
//   3. Query chemicals matching that where clause, including their most
//      recent transaction (orderBy sequenceNo desc, take 1) to derive
//      lastActivityDate.
//   4. Map rows to ChemicalSummary (Decimal -> number, most recent
//      transaction's date -> "YYYY-MM-DD" or null).
//   5. If lowStockOnly=true, filter the mapped list to rows where
//      lowStockThreshold is set and currentBalance <= it.
//   6. Return the list via jsonOk.
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!(await requireAuth())) {
    return jsonError('Unauthorized', 401);
  }

  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get('search');
  const category = searchParams.get('category');
  const lowStockOnly = searchParams.get('lowStockOnly') === 'true';
  const includeArchived = searchParams.get('includeArchived') === 'true';

  const where: Record<string, unknown> = {};
  if (!includeArchived) {
    where.isArchived = false;
  }
  if (search) {
    where.name = { contains: search, mode: 'insensitive' };
  }
  if (category) {
    where.category = category;
  }

  const chemicals = await prisma.chemical.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      transactions: {
        orderBy: { sequenceNo: 'desc' },
        take: 1,
      },
    },
  });

  let summaries: ChemicalSummary[] = chemicals.map(
    (chemical: Chemical & { transactions: { dateReceived: Date | null; dateUsed: Date | null }[] }) => {
      const latest = chemical.transactions[0];
      const latestDate = latest ? latest.dateUsed ?? latest.dateReceived : null;

      return {
        id: chemical.id,
        name: chemical.name,
        cpecsDescriptor: chemical.cpecsDescriptor,
        category: chemical.category,
        unit: chemical.unit,
        currentBalance: Number(chemical.currentBalance),
        lowStockThreshold: chemical.lowStockThreshold !== null ? Number(chemical.lowStockThreshold) : null,
        isArchived: chemical.isArchived,
        lastActivityDate: latestDate ? latestDate.toISOString().slice(0, 10) : null,
      };
    }
  );

  if (lowStockOnly) {
    summaries = summaries.filter(
      (chemical) => chemical.lowStockThreshold !== null && chemical.currentBalance <= chemical.lowStockThreshold
    );
  }

  return jsonOk(summaries);
}

// def POST(): Input is one NextRequest (JSON body matching
// ChemicalCreateInput). Output is a Promise resolving to the created
// Chemical row (status 201).
// Pseudocode:
//   1. Require auth.
//   2. Parse + validate the body with chemicalCreateSchema; 400 on
//      failure.
//   3. Create the chemical row (currentBalance defaults to 0).
//   4. Return the created row with status 201.
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await requireAuth())) {
    return jsonError('Unauthorized', 401);
  }

  const body = await request.json().catch(() => null);
  const parsed = chemicalCreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.message, 400);
  }

  const created = await prisma.chemical.create({
    data: parsed.data,
  });

  return jsonOk(created, 201);
}
