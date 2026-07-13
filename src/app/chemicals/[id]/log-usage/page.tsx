// src/app/chemicals/[id]/log-usage/page.tsx
//
// PURE FRONTEND FILE — plain description:
// Log-usage form for one chemical. Fields: Date Used (defaults to today,
// editable), Details of Usage, Work Order No. (optional), Lot/Batch No.
// of used CPECS (optional), Quantity Used, and Balance (Out) — shown live
// as (current balance - quantity used) while the user types, editable if
// they want to override it. Submitting posts the usage transaction and
// returns to the chemical detail page. Uses <UsageForm/> for the field
// layout.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UsageForm } from '@/components/UsageForm';

interface LogUsagePageProps {
  params: { id: string };
}

export default function LogUsagePage({ params }: LogUsagePageProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  // def handleSubmit(): Input is one usage form payload (matching
  // UsageInput). Output is none (side effect: POSTs to
  // /api/chemicals/[id]/usage, then navigates back to the chemical detail
  // page on success, or sets `error` on failure).
  // Pseudocode:
  //   1. POST `payload` as JSON to /api/chemicals/${params.id}/usage.
  //   2. If response.ok, router.push(`/chemicals/${params.id}`).
  //   3. Else, set error from the response body.
  async function handleSubmit(payload: unknown): Promise<void> {
    const response = await fetch(`/api/chemicals/${params.id}/usage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      router.push(`/chemicals/${params.id}`);
    } else {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? 'Failed to log usage');
    }
  }

  return (
    <div>
      <h1>Log Usage</h1>
      <UsageForm chemicalId={params.id} onSubmit={handleSubmit} />
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
