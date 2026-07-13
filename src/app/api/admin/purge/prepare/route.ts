// src/app/api/admin/purge/prepare/route.ts
//
// POST -> computes what a purge would delete, generates the backup ZIP
// covering exactly those records, and returns the ZIP as the response
// body with the purge token and summary attached as headers. Deletes
// nothing.

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { preparePurge } from '@/lib/purge';
import { jsonError } from '@/lib/apiHelpers';

// def POST(): Input is one NextRequest whose JSON body may optionally
// include { cutoffDate?: string }. Output is a Promise resolving to one
// NextResponse whose body is raw ZIP bytes (the backup), with custom
// headers X-Purge-Token (string) and X-Purge-Summary (a
// JSON-stringified PurgePlanSummary).
// Pseudocode:
//   1. Require auth.
//   2. Parse the optional cutoffDate override from the JSON body (empty
//      body is valid — defaults apply).
//   3. Call preparePurge(cutoffDate).
//   4. Build a NextResponse from the returned zipBuffer with
//      Content-Type: application/zip, Content-Disposition: attachment
//      (filename like "purge-backup_<cutoffDate>.zip"), plus the
//      X-Purge-Token and X-Purge-Summary headers (JSON.stringify the
//      summary for the header value).
export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!(await requireAuth())) {
    return jsonError('Unauthorized', 401);
  }

  const body = await request.json().catch(() => ({}));
  const cutoffDate = typeof body?.cutoffDate === 'string' ? body.cutoffDate : undefined;

  const { purgeToken, zipBuffer, summary } = await preparePurge(cutoffDate);

  return new NextResponse(new Uint8Array(zipBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="purge-backup_${summary.cutoffDate}.zip"`,
      'X-Purge-Token': purgeToken,
      'X-Purge-Summary': JSON.stringify(summary),
    },
  });
}
