// src/components/LogoutButton.tsx
//
// PURE FRONTEND FILE — plain description:
// A small nav-bar button reading "Log out". Clicking it ends the session
// and returns to the login screen. Split into its own client component
// because src/app/layout.tsx is a server component by default and can't
// hold onClick handlers itself.

'use client';

import { useRouter } from 'next/navigation';

export function LogoutButton() {
  const router = useRouter();

  // def handleLogout(): Input is none (button click). Output is none
  // (side effect: POSTs to /api/auth/logout, then redirects to /login).
  // Pseudocode:
  //   1. POST to /api/auth/logout.
  //   2. On success, router.push('/login').
  async function handleLogout(): Promise<void> {
    const response = await fetch('/api/auth/logout', { method: 'POST' });
    if (response.ok) {
      router.push('/login');
    }
  }

  return (
    <button onClick={handleLogout} className="btn btn-ghost btn-sm">
      Log out
    </button>
  );
}
