// src/app/api/auth/logout/route.ts

import { NextResponse } from 'next/server';
import { logout } from '@/lib/auth';

// def POST(): Input is none. Output is a Promise resolving to one
// NextResponse { success: true }, with the session cookie cleared.
// Pseudocode:
//   1. Call logout() from lib/auth.
//   2. Return 200 { success: true }.
export async function POST(): Promise<NextResponse> {
  await logout();
  return NextResponse.json({ success: true });
}
