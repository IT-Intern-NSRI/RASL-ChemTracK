// src/app/api/chemicals/route.ts
//
// GET  -> list/search/filter chemicals (the dashboard's data source).
// POST -> create a new chemical.

import { NextRequest, NextResponse } from 'next/server';
import { Chemical } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { chemicalCreateSchema } from '@/lib/validation';
import { jsonError, jsonOk } from '@/lib/apiHelpers';
import { ChemicalSummary } from '@/types';

// def GET(): Input is one NextRequest whose URL search params may include
// `search` (substring match on name), `category`, `lowStockOnly`
// ("true"/"false"), and `includeArchived` ("true"/"false"). Output is a
// Promise resolving to one NextResponse whose JSON body is
// ChemicalSummary[].
// Pseudocode:
//   1. Require auth; if not logged in, return 401.
//   2. Parse the search params from request.nextUrl.searchParams.
//   3. Build a Prisma `where` clause: name contains `search`
//      (case-insensitive) if provided; category = `category` if
//      provided; isArchived = false unless includeArchived === 'true'.
//   4. Query chemicals matching that where clause, ordered by name asc.
//   5. For each chemical, find its latest transaction (max sequenceNo) to
//      derive lastActivityDate (null if it has none).
//   6. If lowStockOnly === 'true', filter the results down to chemicals
//      where lowStockThreshold is set and currentBalance <= threshold.
//   7. Map each row into a ChemicalSummary (converting Prisma Decimal
//      fields to plain numbers) and return the array via jsonOk().
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!(await requireAuth())) {
    return jsonError('Unauthorized', 401);
  }

  const params = request.nextUrl.searchParams;
  const search = params.get('search');
  const category = params.get('category');
  const lowStockOnly = params.get('lowStockOnly') === 'true';
  const includeArchived = params.get('includeArchived') === 'true';

  const where: Record<string, unknown> = {};
  if (search) {
    where.name = { contains: search, mode: 'insensitive' };
  }
  if (category) {
    where.category = category;
  }
  if (!includeArchived) {
    where.isArchived = false;
  }

  const chemicals = await prisma.chemical.findMany({
    where,
    orderBy: { name: 'asc' },
  });

  let summaries: ChemicalSummary[] = await Promise.all(
    chemicals.map(async (chemical: Chemical) => {
      const latest = await prisma.transaction.findFirst({
        where: { chemicalId: chemical.id },
        orderBy: { sequenceNo: 'desc' },
      });
      const lastActivityDate = latest
        ? (latest.dateUsed ?? latest.dateReceived)?.toISOString().slice(0, 10) ?? null
        : null;

      return {
        id: chemical.id,
        name: chemical.name,
        cpecsDescriptor: chemical.cpecsDescriptor,
        category: chemical.category,
        unit: chemical.unit,
        currentBalance: Number(chemical.currentBalance),
        lowStockThreshold:
          chemical.lowStockThreshold !== null ? Number(chemical.lowStockThreshold) : null,
        isArchived: chemical.isArchived,
        lastActivityDate,
      };
    })
  );

  if (lowStockOnly) {
    summaries = summaries.filter(
      (c) => c.lowStockThreshold !== null && c.currentBalance <= c.lowStockThreshold
    );
  }

  return jsonOk(summaries);
}

// def POST(): Input is one NextRequest whose JSON body matches
// ChemicalCreateInput (name, cpecsDescriptor, category?, unit,
// lowStockThreshold?). Output is a Promise resolving to one NextResponse
// containing the newly created chemical row (status 201).
// Pseudocode:
//   1. Require auth.
//   2. Parse + validate the body with chemicalCreateSchema; return 400 on
//      failure (include the zod error details).
//   3. Create the chemical row via Prisma with currentBalance defaulting
//      to 0 (bringing existing physical stock into the system should be
//      done via a subsequent stock-in transaction, not a starting-balance
//      field, per project decision).
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
    data: {
      ...parsed.data,
      currentBalance: 0,
    },
  });

  return jsonOk(created, 201);
}
