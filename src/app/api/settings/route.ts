// src/app/api/settings/route.ts
//
// GET   -> current app settings (organization/signatory info), password
//          hash omitted from the response.
// PATCH -> update app settings, optionally including a password change.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, hashPassword } from '@/lib/auth';
import { appSettingsSchema } from '@/lib/validation';
import { jsonError, jsonOk } from '@/lib/apiHelpers';

// def GET(): Input is one NextRequest. Output is a Promise resolving to
// the single AppSettings row (id=1) with passwordHash stripped out.
// Pseudocode:
//   1. Require auth.
//   2. Fetch the AppSettings row (id=1), inside a try/catch so a database
//      error (e.g. a dropped/exhausted connection) surfaces as a
//      structured 500 JSON response and a server-side log line, instead
//      of an unhandled exception that Next.js turns into a bare HTML
//      error page the client can't parse.
//   3. Destructure out passwordHash before returning the rest via
//      jsonOk.
export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!(await requireAuth())) {
    return jsonError('Unauthorized', 401);
  }

  try {
    const settings = await prisma.appSettings.findUnique({ where: { id: 1 } });
    if (!settings) {
      return jsonError('Settings not found', 404);
    }

    const { passwordHash, ...rest } = settings;
    return jsonOk(rest);
  } catch (err) {
    console.error('GET /api/settings failed:', err);
    return jsonError('Failed to load settings', 500);
  }
}

// def PATCH(): Input is one NextRequest whose JSON body matches
// AppSettingsInput (organizationName?, registerLabel?, signatoryName?,
// signatoryCredentials?, signatoryTitle?, newPassword?). Output is a
// Promise resolving to the updated settings (password hash stripped).
// Pseudocode:
//   1. Require auth.
//   2. Validate the body with appSettingsSchema.
//   3. Inside a try/catch (so a hashing or database failure surfaces as
//      a structured 500 JSON response and a server-side log line,
//      instead of an unhandled exception that Next.js turns into a bare
//      HTML error page the client can't parse):
//        a. If newPassword is present, hash it via hashPassword() and
//           include passwordHash in the update payload; otherwise leave
//           the existing hash untouched.
//        b. Update the AppSettings row (id=1).
//        c. Return the updated row with passwordHash stripped.
export async function PATCH(request: NextRequest): Promise<NextResponse> {
  if (!(await requireAuth())) {
    return jsonError('Unauthorized', 401);
  }

  const body = await request.json().catch(() => null);
  const parsed = appSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.message, 400);
  }

  const { newPassword, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };

  try {
    if (newPassword) {
      data.passwordHash = await hashPassword(newPassword);
    }

    const updated = await prisma.appSettings.update({
      where: { id: 1 },
      data,
    });

    const { passwordHash, ...updatedRest } = updated;
    return jsonOk(updatedRest);
  } catch (err) {
    console.error('PATCH /api/settings failed:', err);
    return jsonError('Failed to save settings', 500);
  }
}