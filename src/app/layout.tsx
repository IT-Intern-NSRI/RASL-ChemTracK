// src/app/layout.tsx
//
// PURE FRONTEND FILE — plain description:
// Root layout wrapping every page. Renders a persistent top nav bar with
// the ChemTrack wordmark, links to the Dashboard and Settings, and a
// Logout button, then renders whatever page is active below it. Also
// mounts <SplashScreen/>, a brief brand-reveal animation shown as an
// overlay on top of the app on every full page load. Imports the global
// stylesheet.

import './globals.css';
import Link from 'next/link';
import type { Viewport } from 'next';
import { LogoutButton } from '@/components/LogoutButton';
import { SplashScreen } from '@/components/SplashScreen';

export const metadata = {
  title: 'ChemTrack',
  description: 'Daily chemical inventory and usage ledger',
};

// Without this, mobile browsers fall back to a ~980px "desktop layout"
// viewport and zoom the whole page out to fit, which is why the table's
// existing @media (max-width: 640px) stacked-card CSS (see globals.css)
// never actually fired on real phones — the browser never reports a
// viewport narrower than 640px in the first place.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <SplashScreen />
        <nav className="navbar">
          <div className="navbar__left">
            <Link href="/" className="navbar__brand">
              <span>Chem</span>
              <span className="navbar__brand-accent">Track</span>
            </Link>
            <div className="navbar__links">
              <Link href="/">Dashboard</Link>
              <Link href="/admin/settings">Settings</Link>
            </div>
          </div>
          <LogoutButton />
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
