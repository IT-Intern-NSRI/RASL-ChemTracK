// src/app/chemicals/[id]/page.tsx
//
// PURE FRONTEND FILE — plain description:
// The chemical detail / usage history page. Header shows the chemical's
// name, CPECS descriptor, current balance + unit, and buttons: "Log
// Usage" (-> /chemicals/[id]/log-usage), "Log Stock-In"
// (-> /chemicals/[id]/log-stock-in), "Export" (opens a date-range picker,
// downloads this chemical's PDF), and "Edit" (-> /chemicals/[id]/edit).
// Below that, a date-range filter, then <UsageHistoryList/> rendering the
// mobile-optimized, newest-first card list of stock-in/usage instances.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { ChemicalSummary, TransactionDTO } from '@/types';
import { UsageHistoryList } from '@/components/UsageHistoryList';
import { ExportButton } from '@/components/ExportButton';

interface ChemicalDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ startDate?: string; endDate?: string; page?: string }>;
}

// def fetchChemicalDetail(): Input is one chemical id (string). Output is
// a Promise resolving to one ChemicalSummary (or triggers Next.js's
// notFound() if it doesn't exist).
// Pseudocode:
//   1. Call GET /api/chemicals/[id] (server-side fetch).
//   2. If the response is a 404, call notFound() from next/navigation.
//   3. Parse and return the JSON.
async function fetchChemicalDetail(id: string): Promise<ChemicalSummary> {
  const host = (await headers()).get('host');
  const protocol = host?.startsWith('localhost') ? 'http' : 'https';

  const response = await fetch(`${protocol}://${host}/api/chemicals/${id}`, {
    headers: { cookie: (await cookies()).toString() },
    cache: 'no-store',
  });

  if (response.status === 404) {
    notFound();
  }

  return response.json();
}

// def fetchHistory(): Input is one chemical id (string) and one filters
// object ({ startDate?, endDate?, page? }). Output is a Promise resolving
// to { items: TransactionDTO[], total: number }.
// Pseudocode:
//   1. Build a query string from the filters.
//   2. Call GET /api/chemicals/[id]/history?<query string>.
//   3. Parse and return the JSON.
async function fetchHistory(
  id: string,
  filters: Awaited<ChemicalDetailPageProps['searchParams']>
): Promise<{ items: TransactionDTO[]; total: number }> {
  const params = new URLSearchParams();
  if (filters.startDate) params.set('startDate', filters.startDate);
  if (filters.endDate) params.set('endDate', filters.endDate);
  if (filters.page) params.set('page', filters.page);

  const host = (await headers()).get('host');
  const protocol = host?.startsWith('localhost') ? 'http' : 'https';

  const response = await fetch(
    `${protocol}://${host}/api/chemicals/${id}/history?${params.toString()}`,
    {
      headers: { cookie: (await cookies()).toString() },
      cache: 'no-store',
    }
  );

  return response.json();
}

export default async function ChemicalDetailPage({ params, searchParams }: ChemicalDetailPageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const chemical = await fetchChemicalDetail(resolvedParams.id);
  const history = await fetchHistory(resolvedParams.id, resolvedSearchParams);

  return (
    <div>
      <header>
        <h1>{chemical.name}</h1>
        <p>{chemical.cpecsDescriptor}</p>
        <p>
          Current balance: {chemical.currentBalance} {chemical.unit}
        </p>
        <Link href={`/chemicals/${chemical.id}/log-usage`}>Log Usage</Link>
        <Link href={`/chemicals/${chemical.id}/log-stock-in`}>Log Stock-In</Link>
        <ExportButton mode="single" chemicalId={chemical.id} />
        <Link href={`/chemicals/${chemical.id}/edit`}>Edit</Link>
      </header>
      <UsageHistoryList transactions={history.items} unit={chemical.unit} />
    </div>
  );
}
