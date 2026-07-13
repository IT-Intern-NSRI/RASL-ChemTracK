// src/app/api/auth/login/route.ts
//
// POST { password: string } -> sets the session cookie on success.

import { NextRequest, NextResponse } from 'next/server';
import { login } from '@/lib/auth';
import { jsonError } from '@/lib/apiHelpers';

// def POST(): Input is one NextRequest whose JSON body is
// { password: string } (the plaintext password typed into the login
// form). Output is a Promise resolving to one NextResponse:
// { success: true } with a Set-Cookie header on success, or a 401 JSON
// error on failure.
// Pseudocode:
//   1. Parse the JSON body; if `password` is missing or not a string,
//      return a 400 via jsonError('Password is required', 400).
//   2. Call login(password) from lib/auth.
//   3. If it returns true, respond 200 { success: true } (the cookie is
//      set as a side effect inside login()).
//   4. If it returns false, respond via
//      jsonError('Invalid password', 401).
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json().catch(() => null);
  const password = body?.password;

  if (!password || typeof password !== 'string') {
    return jsonError('Password is required', 400);
  }

  const success = await login(password);

  if (!success) {
    return jsonError('Invalid password', 401);
  }

  return NextResponse.json({ success: true });
}
