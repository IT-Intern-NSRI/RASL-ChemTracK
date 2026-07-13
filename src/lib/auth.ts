// src/lib/auth.ts
//
// Single-user authentication: password hashing + a signed, HTTP-only
// session cookie (via iron-session). There are no roles or multiple
// accounts — one password protects the whole app, since it's reachable
// over the public internet 24/7.

import bcrypt from 'bcryptjs';
import { getIronSession } from 'iron-session';
import { cookies } from 'next/headers';
import { prisma } from './prisma';

export interface SessionData {
  isLoggedIn: boolean;
}

export const sessionOptions = {
  password: process.env.SESSION_SECRET as string,
  cookieName: 'chem-tracker-session',
  cookieOptions: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax' as const,
  },
};

// def hashPassword(): Input is one string (plaintext password typed by the
// user on the login/setup screen). Output is a Promise resolving to one
// string (the bcrypt hash to persist in AppSettings.passwordHash).
// Pseudocode:
//   1. Generate a bcrypt salt (bcrypt.genSalt(10) or similar rounds).
//   2. Hash the plaintext password with that salt (bcrypt.hash).
//   3. Return the resulting hash string.
export async function hashPassword(plainPassword: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plainPassword, salt);
}

// def verifyPassword(): Input is two strings (plaintext password submitted
// on the login form, and the stored bcrypt hash from AppSettings). Output
// is a Promise resolving to one boolean (true if they match).
// Pseudocode:
//   1. Call bcrypt.compare(plainPassword, hash).
//   2. Return the boolean result.
export async function verifyPassword(plainPassword: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plainPassword, hash);
}

// def getSession(): Input is none (reads the current request's cookies via
// next/headers). Output is a Promise resolving to one IronSession<SessionData>
// object, which the caller can read (session.isLoggedIn) or mutate + save
// (session.save()) / clear (session.destroy()).
// Pseudocode:
//   1. Call getIronSession<SessionData>(cookies(), sessionOptions).
//   2. Return the session object as-is (iron-session lazily initializes
//      isLoggedIn as undefined/false for a fresh visitor).
export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions);
}

// def login(): Input is one string (the plaintext password submitted on
// the login form). Output is a Promise resolving to one boolean (true if
// the password matched and a session cookie was set, false otherwise).
// Pseudocode:
//   1. Load the single AppSettings row (id=1) from Prisma.
//   2. If no row exists, return false (app hasn't been seeded/set up yet —
//      run `npm run seed`).
//   3. Call verifyPassword(submittedPassword, appSettings.passwordHash).
//   4. If valid: get the session via getSession(), set
//      session.isLoggedIn = true, call await session.save(), return true.
//   5. If invalid: return false.
export async function login(submittedPassword: string): Promise<boolean> {
  const appSettings = await prisma.appSettings.findUnique({ where: { id: 1 } });
  if (!appSettings) {
    return false;
  }

  const valid = await verifyPassword(submittedPassword, appSettings.passwordHash);
  if (!valid) {
    return false;
  }

  const session = await getSession();
  session.isLoggedIn = true;
  await session.save();
  return true;
}

// def logout(): Input is none. Output is a Promise resolving to none (side
// effect: destroys the current session cookie).
// Pseudocode:
//   1. Get the session via getSession().
//   2. Call session.destroy().
export async function logout(): Promise<void> {
  const session = await getSession();
  session.destroy();
}

// def requireAuth(): Input is none. Output is a Promise resolving to one
// boolean (true if the current request has a valid logged-in session).
// Called at the top of every protected API route handler.
// Pseudocode:
//   1. Get the session via getSession().
//   2. Return session.isLoggedIn === true.
export async function requireAuth(): Promise<boolean> {
  const session = await getSession();
  return session.isLoggedIn === true;
}
