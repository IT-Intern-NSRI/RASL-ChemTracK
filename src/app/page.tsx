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
  searchParams: Promise<{ search?: string; category?: string; lowStockOnly?: string }>;
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
  searchParams: Awaited<DashboardPageProps['searchParams']>
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
  const resolvedSearchParams = await searchParams;
  const chemicals = await fetchChemicalList(resolvedSearchParams);
  return (
    <div className="page">
      <div className="page-header">
        <h1>Chemicals</h1>
      </div>
      <div className="toolbar">
        <ChemicalSearchFilterBar />
        <div className="toolbar__spacer" />
        <Link href="/chemicals/new" className="btn btn-secondary">
          Add Chemical
        </Link>
        <ExportButton mode="bulk" />
      </div>
      {chemicals.length === 0 ? (
        <div className="empty-state">No chemicals match your filters yet.</div>
      ) : (
        <ChemicalListTable chemicals={chemicals} />
      )}
    </div>
  );
}
