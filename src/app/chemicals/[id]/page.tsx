// src/app/chemicals/[id]/page.tsx
//
// PURE FRONTEND FILE — plain description:
// The chemical detail page. Shows the chemical's name/CPECS descriptor,
// current balance, links to Log Stock-In / Log Usage / Edit, a
// single-chemical <ExportButton mode="single"/>, and the
// <UsageHistoryList/> of its transactions (most recent 25, newest
// first — the same data the /api/chemicals/[id]/history endpoint
// serves, fetched directly here for the initial render).
//
// This file is a Server Component so it can `await` the route's params
// Promise (Next.js 15) and query the database directly.

import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/lib/auth';
import { ExportButton } from '@/components/ExportButton';
import { UsageHistoryList } from '@/components/UsageHistoryList';
import { TransactionDTO } from '@/types';

interface ChemicalDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ChemicalDetailPage({ params }: ChemicalDetailPageProps) {
  if (!(await requireAuth())) {
    redirect('/login');
  }

  const { id } = await params;

  const chemical = await prisma.chemical.findUnique({ where: { id } });
  if (!chemical) {
    notFound();
  }

  const transactions = await prisma.transaction.findMany({
    where: { chemicalId: id },
    orderBy: { sequenceNo: 'desc' },
    take: 25,
  });

  const transactionDTOs: TransactionDTO[] = transactions.map((t) => ({
    id: t.id,
    chemicalId: t.chemicalId,
    type: t.type,
    sequenceNo: t.sequenceNo,
    dateReceived: t.dateReceived ? t.dateReceived.toISOString().slice(0, 10) : null,
    supplierInfo: t.supplierInfo,
    truckerCarrier: t.truckerCarrier,
    lotBatchNo: t.lotBatchNo,
    quantityReceived: t.quantityReceived !== null ? Number(t.quantityReceived) : null,
    dateUsed: t.dateUsed ? t.dateUsed.toISOString().slice(0, 10) : null,
    detailsOfUsage: t.detailsOfUsage,
    workOrderNo: t.workOrderNo,
    lotBatchNoUsed: t.lotBatchNoUsed,
    quantityUsed: t.quantityUsed !== null ? Number(t.quantityUsed) : null,
    balanceOut: Number(t.balanceOut),
    balanceOverridden: t.balanceOverridden,
    isOverdrawn: t.isOverdrawn,
    isAnchor: t.isAnchor,
  }));

  return (
    <div>
      <h1>{chemical.name}</h1>
      <p>{chemical.cpecsDescriptor}</p>
      <p>
        Current Balance: {Number(chemical.currentBalance)} {chemical.unit}
      </p>
      <div>
        <Link href={`/chemicals/${id}/log-stock-in`}>Log Stock-In</Link>
        <Link href={`/chemicals/${id}/log-usage`}>Log Usage</Link>
        <Link href={`/chemicals/${id}/edit`}>Edit</Link>
        <ExportButton mode="single" chemicalId={id} />
      </div>
      <UsageHistoryList transactions={transactionDTOs} unit={chemical.unit} />
    </div>
  );
}
