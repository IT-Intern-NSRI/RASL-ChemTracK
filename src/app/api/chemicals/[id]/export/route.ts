// src/app/api/chemicals/[id]/export/route.ts
//
// GET -> a single chemical's usage-history document as a downloadable
// PDF.

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { dateRangeSchema } from '@/lib/validation';
import { generateChemicalPdf } from '@/lib/pdf/pdfGenerator';
import { prisma } from '@/lib/prisma';
import { jsonError } from '@/lib/apiHelpers';

interface RouteParams {
  params: { id: string };
}

// def GET(): Input is one NextRequest (search params: startDate, endDate,
// both "YYYY-MM-DD") and the chemical id route param. Output is a Promise
// resolving to one NextResponse whose body is raw PDF bytes, with headers
// Content-Type: application/pdf and Content-Disposition: attachment.
// Pseudocode:
//   1. Require auth.
//   2. Parse + validate startDate/endDate (from search params) with
//      dateRangeSchema; 400 on failure (including startDate > endDate).
//   3. Call generateChemicalPdf(params.id, startDate, endDate).
//   4. Build a NextResponse from the returned Buffer with the appropriate
//      headers, including a filename like
//      "<chemical-name>_<start>_<end>.pdf".
export async function GET(request: NextRequest, { params }: RouteParams): Promise<NextResponse> {
  if (!(await requireAuth())) {
    return jsonError('Unauthorized', 401);
  }

  const searchParams = request.nextUrl.searchParams;
  const parsed = dateRangeSchema.safeParse({
    startDate: searchParams.get('startDate'),
    endDate: searchParams.get('endDate'),
  });

  if (!parsed.success) {
    return jsonError(parsed.error.message, 400);
  }

  const chemical = await prisma.chemical.findUnique({ where: { id: params.id } });
  if (!chemical) {
    return jsonError('Chemical not found', 404);
  }

  const { startDate, endDate } = parsed.data;
  const pdfBuffer = await generateChemicalPdf(params.id, startDate, endDate);

  const filename = `${chemical.name.replace(/[^a-zA-Z0-9._-]+/g, '_')}_${startDate}_${endDate}.pdf`;

  return new NextResponse(new Uint8Array(pdfBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
