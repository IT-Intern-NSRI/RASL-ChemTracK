// src/app/page.tsx
//
// PURE FRONTEND FILE — plain description:
// The main dashboard. Shows a search/filter bar (name search, category
// dropdown, low-stock-only toggle) above a list/table of every chemical
// (name, current balance + unit, last activity date), each row linking to
// its detail page at /chemicals/[id]. Includes an "Add Chemical" button
// (-> /chemicals/new) and a "Bulk Export" button that opens a date-range
// picker and downloads a ZIP of every chemical's usage history.

import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { ChemicalListTable } from '@/components/ChemicalListTable';
import { ChemicalSearchFilterBar } from '@/components/ChemicalSearchFilterBar';
import { ExportButton } from '@/components/ExportButton';
import { ChemicalSummary } from '@/types';

interface DashboardPageProps {
  searchParams: { search?: string; category?: string; lowStockOnly?: string };
}

// def fetchChemicalList(): Input is one DashboardPageProps["searchParams"]
// object. Output is a Promise resolving to one ChemicalSummary[] array.
// Pseudocode:
//   1. Build a query string from the provided filters.
//   2. Call GET /api/chemicals?<query string> (server-side fetch, since
//      this is a server component — remember to forward the session
//      cookie, e.g. via the `cookies()` header, when fetching an internal
//      API route from a server component).
//   3. Parse and return the JSON array.
async function fetchChemicalList(
  searchParams: DashboardPageProps['searchParams']
): Promise<ChemicalSummary[]> {
  const params = new URLSearchParams();
  if (searchParams.search) params.set('search', searchParams.search);
  if (searchParams.category) params.set('category', searchParams.category);
  if (searchParams.lowStockOnly) params.set('lowStockOnly', searchParams.lowStockOnly);

  const host = (await headers()).get('host');
  const protocol = host?.startsWith('localhost') ? 'http' : 'https';

  const response = await fetch(`${protocol}://${host}/api/chemicals?${params.toString()}`, {
    headers: { cookie: (await cookies()).toString() },
    cache: 'no-store',
  });

  return response.json();
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const chemicals = await fetchChemicalList(searchParams);
  return (
    <div>
      <div>
        <ChemicalSearchFilterBar />
        <Link href="/chemicals/new">Add Chemical</Link>
        <ExportButton mode="bulk" />
      </div>
      <ChemicalListTable chemicals={chemicals} />
    </div>
  );
}
