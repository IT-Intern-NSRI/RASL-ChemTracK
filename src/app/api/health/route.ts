// src/app/api/health/route.ts
//
// Trivial, unauthenticated health-check endpoint. Fully implemented.
// Useful for an external uptime pinger (see README) to keep the Render
// free-tier instance warm and avoid its cold-start delay, if that becomes
// annoying.

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
