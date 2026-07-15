// src/app/api/export/bulk/route.ts
//
// POST -> a ZIP containing one PDF per (non-archived) chemical for the
// requested date range. No-skip rule: chemicals with zero activity in
// the range are still included, per project decision.

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { exportRangeSchema } from '@/lib/validation';
import { generateBulkExportZip } from '@/lib/zip/bulkExport';
import { formatMonthRangeLabel } from '@/lib/timezone';
import { jsonError } from '@/lib/apiHelpers';

// def POST(): Input is one NextRequest whose JSON body matches
// ExportRangeInput ({ startDate, endDate, rangeType? }). In "Month
// Selection" mode the client has already resolved the chosen months into
// concrete startDate/endDate boundaries before calling this endpoint;
// rangeType is only used here to pick each PDF's header label format.
// Output is a Promise resolving to one NextResponse whose body is raw ZIP
// bytes, with headers Content-Type: application/zip and
// Content-Disposition: attachment.
// Pseudocode:
//   1. Require auth.
//   2. Parse + validate the body with exportRangeSchema; 400 on failure.
//   3. Call generateBulkExportZip(startDate, endDate, undefined,
//      rangeType) — no chemicalIds filter, so every non-archived chemical
//      is included.
//   4. Build a NextResponse from the returned Buffer with the appropriate
//      headers (filename like "chemical-export_<start>_<end>.zip" in date
//      mode, or "chemical-export_<abbreviated-month-range>.zip" in month
//      mode).
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await requireAuth())) {
    return jsonError('Unauthorized', 401);
  }

  const body = await request.json().catch(() => null);
  const parsed = exportRangeSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.message, 400);
  }

  const { startDate, endDate, rangeType } = parsed.data;
  const zipBuffer = await generateBulkExportZip(startDate, endDate, undefined, rangeType);

  const rangePart =
    rangeType === 'month'
      ? formatMonthRangeLabel(startDate, endDate).replace(/[^a-zA-Z0-9]+/g, '_')
      : `${startDate}_${endDate}`;

  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="chemical-export_${rangePart}.zip"`,
    },
  });
}
