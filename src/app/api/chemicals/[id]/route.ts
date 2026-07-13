// src/app/api/chemicals/[id]/route.ts
//
// GET    -> a single chemical's metadata.
// PATCH  -> edit a chemical's metadata.
// DELETE -> soft-delete (archive) a chemical.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { chemicalUpdateSchema } from '@/lib/validation';
import { jsonError, jsonOk } from '@/lib/apiHelpers';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// def GET(): Input is one NextRequest and one route param (chemical id).
// Output is a Promise resolving to one NextResponse with the chemical
// row, or a 404 if it doesn't exist.
// Pseudocode:
//   1. Require auth.
//   2. Fetch the chemical by id via Prisma.
//   3. If not found, return 404 via jsonError.
//   4. Return the row via jsonOk.
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

// def PATCH(): Input is one NextRequest (JSON body matching
// ChemicalUpdateInput) and the chemical id route param. Output is a
// Promise resolving to the updated chemical row.
// Pseudocode:
//   1. Require auth.
//   2. Validate the body with chemicalUpdateSchema (all fields optional).
//   3. Update the chemical row via Prisma; 404 if it doesn't exist.
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

// def DELETE(): Input is one NextRequest and the chemical id route param.
// Output is a Promise resolving to { success: true }. Never hard-deletes
// — sets isArchived = true so exportable history is preserved.
// Pseudocode:
//   1. Require auth.
//   2. Update the chemical row: isArchived = true.
//   3. Return { success: true }.
export async function DELETE(request: NextRequest, { params: paramsPromise }: RouteParams): Promise<NextResponse> {
  const params = await paramsPromise;
  if (!(await requireAuth())) {
    return jsonError('Unauthorized', 401);
  }

  await prisma.chemical.update({
    where: { id: params.id },
    data: { isArchived: true },
  });

  return jsonOk({ success: true });
}
