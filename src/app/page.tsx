// src/app/page.tsx
//
// PURE FRONTEND FILE — plain description:
// The dashboard (root route). Shows the <ChemicalSearchFilterBar/>, a
// bulk <ExportButton mode="bulk"/>, a link to register a new chemical,
// and the <ChemicalListTable/> of matching chemicals. Reads
// search/category/lowStockOnly straight from the URL's query params
// (set by the filter bar) so this stays a Server Component that refetches
// on navigation rather than needing client-side state.
//
// This file is a Server Component so it can `await` the route's
// searchParams Promise (Next.js 15) and query the database directly.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { ChemicalListTable } from '@/components/ChemicalListTable';
import { ChemicalSearchFilterBar } from '@/components/ChemicalSearchFilterBar';
import { ExportButton } from '@/components/ExportButton';
import { ChemicalSummary } from '@/types';

interface DashboardPageProps {
  searchParams: Promise<{ search?: string; category?: string; lowStockOnly?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  if (!(await requireAuth())) {
    redirect('/login');
  }

  const { search, category, lowStockOnly } = await searchParams;

  const where: Record<string, unknown> = { isArchived: false };
  if (search) {
    where.name = { contains: search, mode: 'insensitive' };
  }
  if (category) {
    where.category = category;
  }

  const chemicals = await prisma.chemical.findMany({
    where,
    orderBy: { name: 'asc' },
    include: {
      transactions: {
        orderBy: { sequenceNo: 'desc' },
        take: 1,
      },
    },
  });

  let summaries: ChemicalSummary[] = chemicals.map((chemical) => {
    const latest = chemical.transactions[0];
    const latestDate = latest ? latest.dateUsed ?? latest.dateReceived : null;

    return {
      id: chemical.id,
      name: chemical.name,
      cpecsDescriptor: chemical.cpecsDescriptor,
      category: chemical.category,
      unit: chemical.unit,
      currentBalance: Number(chemical.currentBalance),
      lowStockThreshold: chemical.lowStockThreshold !== null ? Number(chemical.lowStockThreshold) : null,
      isArchived: chemical.isArchived,
      lastActivityDate: latestDate ? latestDate.toISOString().slice(0, 10) : null,
    };
  });

  if (lowStockOnly === 'true') {
    summaries = summaries.filter(
      (chemical) => chemical.lowStockThreshold !== null && chemical.currentBalance <= chemical.lowStockThreshold
    );
  }

  return (
    <div>
      <h1>Dashboard</h1>
      <div>
        <Link href="/chemicals/new">+ Add Chemical</Link>
        <ExportButton mode="bulk" />
      </div>
      <ChemicalSearchFilterBar />
      <ChemicalListTable chemicals={summaries} />
    </div>
  );
}
