// src/app/chemicals/[id]/log-stock-in/page.tsx
//
// PURE FRONTEND FILE — plain description:
// Log-stock-in form for one chemical. Fields: Date Received (defaults to
// today, editable), Supplier Information, Name of trucker/carrier
// (optional), Lot/Batch No., Quantity Received, and Balance (Out) — shown
// live as (current balance + quantity received), editable if overridden.
// Submitting posts the stock-in transaction and returns to the chemical
// detail page. Uses <StockInForm/> for the field layout.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StockInForm } from '@/components/StockInForm';

interface LogStockInPageProps {
  params: { id: string };
}

export default function LogStockInPage({ params }: LogStockInPageProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  // def handleSubmit(): Input is one stock-in form payload (matching
  // StockInInput). Output is none (side effect: POSTs to
  // /api/chemicals/[id]/stock-in, then navigates back to the chemical
  // detail page on success, or sets `error` on failure).
  // Pseudocode: mirrors LogUsagePage.handleSubmit, posting to the
  // /stock-in endpoint instead.
  async function handleSubmit(payload: unknown): Promise<void> {
    const response = await fetch(`/api/chemicals/${params.id}/stock-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      router.push(`/chemicals/${params.id}`);
    } else {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? 'Failed to log stock-in');
    }
  }

  return (
    <div>
      <h1>Log Stock-In</h1>
      <StockInForm chemicalId={params.id} onSubmit={handleSubmit} />
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
