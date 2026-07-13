// src/app/api/chemicals/[id]/route.ts
//
// GET -> a single chemical's metadata (for the detail/edit pages).
// PATCH -> update a chemical's metadata.
// DELETE -> archive (soft-delete) a chemical.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { chemicalUpdateSchema } from '@/lib/validation';
import { jsonError, jsonOk } from '@/lib/apiHelpers';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// def GET(): Input is the chemical id route param. Output is a Promise
// resolving to the Chemical row (404 if not found).
// Pseudocode:
//   1. Require auth.
//   2. Look up the chemical by id.
//   3. 404 if not found, else return it.
export async function GET(request: NextRequest, { params: paramsPromise }: RouteParams): Promise<NextResponse> {
  const params = await paramsPromise;
  if (!(await requireAuth())) {
    return jsonError('Unauthorized', 401);
  }

  const chemical = await prisma.chemical.findUnique({ where: { id: params.id } });
  if (!chemical) {
    return jsonError('Chemical not found', 404);
  }

  return jsonOk(chemical);
}

// def PATCH(): Input is one NextRequest (JSON body matching a partial
// ChemicalUpdateInput) and the chemical id route param. Output is a
// Promise resolving to the updated Chemical row.
// Pseudocode:
//   1. Require auth.
//   2. Parse + validate the body with chemicalUpdateSchema; 400 on
//      failure.
//   3. Update the chemical row with the validated fields; 404 if it
//      doesn't exist.
//   4. Return the updated row.
export async function PATCH(request: NextRequest, { params: paramsPromise }: RouteParams): Promise<NextResponse> {
  const params = await paramsPromise;
  if (!(await requireAuth())) {
    return jsonError('Unauthorized', 401);
  }

  const body = await request.json().catch(() => null);
  const parsed = chemicalUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.message, 400);
  }

  const existing = await prisma.chemical.findUnique({ where: { id: params.id } });
  if (!existing) {
    return jsonError('Chemical not found', 404);
  }

  const updated = await prisma.chemical.update({
    where: { id: params.id },
    data: parsed.data,
  });

  return jsonOk(updated);
}

// def DELETE(): Input is the chemical id route param. Output is a
// Promise resolving to an empty success response. This is a soft-delete
// (sets isArchived = true) — nothing is ever hard-deleted except via the
// manual 5-year purge, per project decision.
// Pseudocode:
//   1. Require auth.
//   2. Set isArchived = true on the chemical row; 404 if it doesn't
//      exist.
//   3. Return success.
export async function DELETE(request: NextRequest, { params: paramsPromise }: RouteParams): Promise<NextResponse> {
  const params = await paramsPromise;
  if (!(await requireAuth())) {
    return jsonError('Unauthorized', 401);
  }

  const existing = await prisma.chemical.findUnique({ where: { id: params.id } });
  if (!existing) {
    return jsonError('Chemical not found', 404);
  }

  await prisma.chemical.update({
    where: { id: params.id },
    data: { isArchived: true },
  });

  return jsonOk({ success: true });
}
