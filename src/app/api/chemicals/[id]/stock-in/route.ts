// src/app/api/chemicals/[id]/stock-in/route.ts
//
// POST -> log a stock-in instance for this chemical.

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { stockInSchema } from '@/lib/validation';
import { recordTransaction } from '@/lib/balance';
import { jsonError, jsonOk } from '@/lib/apiHelpers';

interface RouteParams {
  params: { id: string };
}

// def POST(): Input is one NextRequest (JSON body matching StockInInput)
// and the chemical id route param. Output is a Promise resolving to the
// created Transaction row (status 201).
// Pseudocode:
//   1. Require auth.
//   2. Parse + validate the body with stockInSchema; 400 on failure.
//   3. Call recordTransaction(params.id, validatedBody, 'STOCK_IN').
//   4. Return the created row with status 201.
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  if (!(await requireAuth())) {
    return jsonError('Unauthorized', 401);
  }

  const body = await request.json().catch(() => null);
  const parsed = stockInSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.message, 400);
  }

  const created = await recordTransaction(params.id, parsed.data, 'STOCK_IN');

  return jsonOk(created, 201);
}
