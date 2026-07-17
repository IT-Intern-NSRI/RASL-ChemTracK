// src/app/api/chemicals/[id]/export/route.ts
//
// GET -> a single chemical's usage-history document as a downloadable
// PDF.

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { exportRangeSchema } from '@/lib/validation';
import { generateChemicalPdf } from '@/lib/pdf/pdfGenerator';
import { formatMonthRangeLabel } from '@/lib/timezone';
import { prisma } from '@/lib/prisma';
import { jsonError } from '@/lib/apiHelpers';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// def GET(): Input is one NextRequest (search params: startDate, endDate,
// both "YYYY-MM-DD", plus an optional rangeType of 'date' | 'month' —
// omitted/anything else defaults to 'month' (see exportRangeSchema). In
// "Month Selection" mode (the only mode the UI exposes) the client has
// already resolved the chosen months into concrete startDate/endDate
// boundaries before calling this endpoint; rangeType is forwarded as-is
// to generateChemicalPdf(), which uses it to pick both the PDF's
// pagination/balance strategy and the header's date-label format) and
// the chemical id route param. Output is a Promise resolving to one
// NextResponse whose body is raw PDF bytes, with headers Content-Type:
// application/pdf and Content-Disposition: attachment.
// Pseudocode:
//   1. Require auth.
//   2. Parse + validate startDate/endDate/rangeType (from search params)
//      with exportRangeSchema; 400 on failure (including startDate >
//      endDate).
//   3. Call generateChemicalPdf(params.id, startDate, endDate, rangeType).
//   4. Build a NextResponse from the returned Buffer with the appropriate
//      headers, including a filename like
//      "<chemical-name>_<start>_<end>.pdf" (date mode) or
//      "<chemical-name>_<abbreviated-month-range>.pdf" (month mode).
export async function GET(request: NextRequest, { params: paramsPromise }: RouteParams): Promise<NextResponse> {
  const params = await paramsPromise;
  if (!(await requireAuth())) {
    return jsonError('Unauthorized', 401);
  }

  const searchParams = request.nextUrl.searchParams;
  const parsed = exportRangeSchema.safeParse({
    startDate: searchParams.get('startDate'),
    endDate: searchParams.get('endDate'),
    rangeType: searchParams.get('rangeType') ?? undefined,
  });

  if (!parsed.success) {
    return jsonError(parsed.error.message, 400);
  }

  const chemical = await prisma.chemical.findUnique({ where: { id: params.id } });
  if (!chemical) {
    return jsonError('Chemical not found', 404);
  }

  const { startDate, endDate, rangeType } = parsed.data;
  const pdfBuffer = await generateChemicalPdf(params.id, startDate, endDate, rangeType);

  const rangePart =
    rangeType === 'month'
      ? formatMonthRangeLabel(startDate, endDate).replace(/[^a-zA-Z0-9]+/g, '_')
      : `${startDate}_${endDate}`;
  const filename = `${chemical.name.replace(/[^a-zA-Z0-9._-]+/g, '_')}_${rangePart}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
