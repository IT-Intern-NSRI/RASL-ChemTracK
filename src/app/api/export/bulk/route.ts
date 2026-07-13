// src/app/api/export/bulk/route.ts
//
// POST -> a ZIP containing one PDF per (non-archived) chemical for the
// requested date range. No-skip rule: chemicals with zero activity in
// the range are still included, per project decision.

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { dateRangeSchema } from '@/lib/validation';
import { generateBulkExportZip } from '@/lib/zip/bulkExport';
import { jsonError } from '@/lib/apiHelpers';

// def POST(): Input is one NextRequest whose JSON body matches
// DateRangeInput ({ startDate, endDate }). Output is a Promise resolving
// to one NextResponse whose body is raw ZIP bytes, with headers
// Content-Type: application/zip and Content-Disposition: attachment.
// Pseudocode:
//   1. Require auth.
//   2. Parse + validate the body with dateRangeSchema; 400 on failure.
//   3. Call generateBulkExportZip(startDate, endDate) — no chemicalIds
//      filter, so every non-archived chemical is included.
//   4. Build a NextResponse from the returned Buffer with the appropriate
//      headers (filename like "chemical-export_<start>_<end>.zip").
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await requireAuth())) {
    return jsonError('Unauthorized', 401);
  }

  const body = await request.json().catch(() => null);
  const parsed = dateRangeSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.message, 400);
  }

  const { startDate, endDate } = parsed.data;
  const zipBuffer = await generateBulkExportZip(startDate, endDate);

  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="chemical-export_${startDate}_${endDate}.zip"`,
    },
  });
}
