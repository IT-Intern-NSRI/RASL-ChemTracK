// src/app/api/transactions/[id]/route.ts
//
// PATCH  -> edit an existing transaction (cascades a balance
//           recalculation).
// DELETE -> remove a transaction (cascades a balance recalculation).

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { editTransaction, deleteTransaction } from '@/lib/balance';
import { jsonError, jsonOk } from '@/lib/apiHelpers';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// def PATCH(): Input is one NextRequest (JSON body of the fields being
// changed — a subset of the transaction's stock-in or usage fields,
// and/or a manual balanceOut override) and the transaction id route
// param. Output is a Promise resolving to the updated Transaction row.
// Pseudocode:
//   1. Require auth.
//   2. Parse the JSON body (validation against the transaction's own
//      type happens inside editTransaction, since this route doesn't
//      know the type ahead of the DB lookup).
//   3. Call editTransaction(params.id, body).
//   4. Return the updated row.
export async function PATCH(request: NextRequest, { params: paramsPromise }: RouteParams): Promise<NextResponse> {
  const params = await paramsPromise;
  if (!(await requireAuth())) {
    return jsonError('Unauthorized', 401);
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return jsonError('Invalid request body', 400);
  }

  try {
    const updated = await editTransaction(params.id, body as Record<string, unknown>);
    return jsonOk(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to edit transaction';
    return jsonError(message, message === 'Transaction not found' ? 404 : 400);
  }
}

// def DELETE(): Input is one NextRequest and the transaction id route
// param. Output is a Promise resolving to { success: true }.
// Pseudocode:
//   1. Require auth.
//   2. Call deleteTransaction(params.id).
//   3. Return { success: true }.
export async function DELETE(request: NextRequest, { params: paramsPromise }: RouteParams): Promise<NextResponse> {
  const params = await paramsPromise;
  if (!(await requireAuth())) {
    return jsonError('Unauthorized', 401);
  }

  try {
    await deleteTransaction(params.id);
    return jsonOk({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to delete transaction';
    return jsonError(message, message === 'Transaction not found' ? 404 : 400);
  }
}
