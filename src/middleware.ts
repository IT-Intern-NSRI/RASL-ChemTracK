// src/middleware.ts
//
// Route protection: every page and API route requires a logged-in session
// except /login, /api/auth/login, and /api/health (and Next.js's own
// static assets, excluded via the matcher below).

import { NextRequest, NextResponse } from 'next/server';
import { sessionOptions } from '@/lib/auth';

const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/health'];

// def middleware(): Input is one NextRequest. Output is one NextResponse
// (either NextResponse.next() to continue, or a redirect/401 to block).
// Pseudocode:
//   1. If request.nextUrl.pathname is in PUBLIC_PATHS, call
//      NextResponse.next() and return.
//   2. Read the session cookie directly from request.cookies, using
//      sessionOptions.cookieName from lib/auth.ts. Middleware runs on the
//      edge runtime and can't use the full iron-session/Prisma APIs the
//      way route handlers can, so this only checks whether the cookie is
//      *present* — full session validation (signature, isLoggedIn value)
//      happens via requireAuth() inside each route handler / server
//      component.
//   3. If the cookie is missing:
//        - for API paths (pathname starts with "/api/"), return a 401
//          JSON response.
//        - for page paths, redirect to /login.
//   4. Otherwise call NextResponse.next().
export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get(sessionOptions.cookieName);

  if (!sessionCookie) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
