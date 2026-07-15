// src/app/api/chemicals/[id]/replenish/route.ts
//
// POST -> log a replenish instance for this chemical (moving quantity
// from bulk stock into the smaller day-to-day working container).
// Distinct from Stock-In (newly purchased/received stock) — a replenish
// only affects "Current Out Balance", never "Current Balance". Replenish
// rows are never shown in the exported PDF (see src/lib/pdf/pdfGenerator.ts).

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { replenishSchema } from '@/lib/validation';
import { recordTransaction } from '@/lib/balance';
import { jsonError, jsonOk } from '@/lib/apiHelpers';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// def POST(): Input is one NextRequest (JSON body matching
// ReplenishInput) and the chemical id route param. Output is a Promise
// resolving to the created Transaction row (status 201).
// Pseudocode:
//   1. Require auth.
//   2. Parse + validate the body with replenishSchema; 400 on failure.
//   3. Call recordTransaction(params.id, validatedBody, 'REPLENISH').
//   4. Return the created row with status 201.
export async function POST(
  request: NextRequest,
  { params: paramsPromise }: RouteParams
): Promise<NextResponse> {
  const params = await paramsPromise;
  if (!(await requireAuth())) {
    return jsonError('Unauthorized', 401);
  }

  const body = await request.json().catch(() => null);
  const parsed = replenishSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.message, 400);
  }

  const created = await recordTransaction(params.id, parsed.data, 'REPLENISH');

  return jsonOk(created, 201);
}
