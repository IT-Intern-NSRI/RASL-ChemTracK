// src/app/api/chemicals/[id]/usage/route.ts
//
// POST -> log a usage instance for this chemical.

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { usageSchema } from '@/lib/validation';
import { recordTransaction } from '@/lib/balance';
import { jsonError, jsonOk } from '@/lib/apiHelpers';

interface RouteParams {
  params: { id: string };
}

// def POST(): Input is one NextRequest (JSON body matching UsageInput)
// and the chemical id route param. Output is a Promise resolving to the
// created Transaction row (status 201). A usage that would drive the
// balance negative is still recorded and flagged (isOverdrawn), never
// blocked, per project decision.
// Pseudocode:
//   1. Require auth.
//   2. Parse + validate the body with usageSchema; 400 on failure.
//   3. Call recordTransaction(params.id, validatedBody, 'USAGE').
//   4. Return the created row with status 201.
export async function POST(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  if (!(await requireAuth())) {
    return jsonError('Unauthorized', 401);
  }

  const body = await request.json().catch(() => null);
  const parsed = usageSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.message, 400);
  }

  const created = await recordTransaction(params.id, parsed.data, 'USAGE');

  return jsonOk(created, 201);
}
