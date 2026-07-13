// src/app/layout.tsx
//
// PURE FRONTEND FILE — plain description:
// Root layout wrapping every page. Renders a persistent top nav bar with
// links to the Dashboard and Settings, and a Logout button, then renders
// whatever page is active below it. Imports the global stylesheet.

import './globals.css';
import Link from 'next/link';
import { LogoutButton } from '@/components/LogoutButton';

export const metadata = {
  title: 'Chemical Usage Tracker',
  description: 'Daily chemical inventory and usage ledger',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <Link href="/">Dashboard</Link>
          <Link href="/admin/settings">Settings</Link>
          <LogoutButton />
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
