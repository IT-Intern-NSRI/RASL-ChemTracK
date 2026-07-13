// src/app/api/admin/purge/confirm/route.ts
//
// POST -> finalizes a previously prepared purge (deletes the identified
// transactions). Only proceeds with a valid, unexpired purge token.

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { confirmPurge } from '@/lib/purge';
import { jsonError, jsonOk } from '@/lib/apiHelpers';

// def POST(): Input is one NextRequest whose JSON body is
// { purgeToken: string }. Output is a Promise resolving to one
// NextResponse with the final purge summary (JSON), or a 410/400 error
// if the token is invalid/expired.
// Pseudocode:
//   1. Require auth.
//   2. Parse purgeToken from the body; 400 if missing.
//   3. Call confirmPurge(purgeToken); catch a "token expired/invalid"
//      error and translate it into a 410 response instructing the caller
//      to re-run /prepare.
//   4. Return the summary via jsonOk.
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await requireAuth())) {
    return jsonError('Unauthorized', 401);
  }

  const body = await request.json().catch(() => null);
  const purgeToken = body?.purgeToken;
  if (!purgeToken || typeof purgeToken !== 'string') {
    return jsonError('purgeToken is required', 400);
  }

  try {
    const result = await confirmPurge(purgeToken);
    return jsonOk(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to confirm purge';
    return jsonError(message, 410);
  }
}
