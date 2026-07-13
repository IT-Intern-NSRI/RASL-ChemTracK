// src/app/layout.tsx
//
// PURE FRONTEND FILE — plain description:
// Root layout wrapping every page. Loads the two brand typefaces (Space
// Grotesk for display/headings, IBM Plex Mono for ledger figures), shows
// the one-time startup wordmark animation via <SplashScreen/>, then
// renders a persistent top nav bar — brand wordmark, links to the
// Dashboard and Settings, and a Logout button — followed by whatever
// page is active below it.

import './globals.css';
import { Space_Grotesk, IBM_Plex_Mono } from 'next/font/google';
import Link from 'next/link';
import { LogoutButton } from '@/components/LogoutButton';
import { SplashScreen } from '@/components/SplashScreen';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display-family',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono-family',
  display: 'swap',
});

export const metadata = {
  title: 'ChemTrack',
  description: 'Daily chemical inventory and usage ledger',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${plexMono.variable}`}>
      <body>
        <SplashScreen>
          <nav>
            <Link href="/" className="wordmark" aria-label="ChemTrack — Dashboard">
              <span className="wordmark-chem">Chem</span>
              <span className="wordmark-track">Track</span>
            </Link>
            <Link href="/">Dashboard</Link>
            <Link href="/admin/settings">Settings</Link>
            <LogoutButton />
          </nav>
          <main>{children}</main>
        </SplashScreen>
      </body>
    </html>
  );
}
