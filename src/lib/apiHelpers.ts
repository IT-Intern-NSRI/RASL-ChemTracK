// src/lib/apiHelpers.ts
//
// Small shared helpers for API route handlers. Fully implemented — these
// are thin, unambiguous wrappers, not business logic.

import { NextResponse } from 'next/server';

export function jsonError(message: string, status: number): NextResponse {
  return NextResponse.json({ error: message }, { status });
}

export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}
