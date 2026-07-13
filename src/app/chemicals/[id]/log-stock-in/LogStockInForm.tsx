// src/app/chemicals/[id]/log-stock-in/LogStockInForm.tsx
//
// Client component holding the actual log-stock-in form and its handler.
// Split out from page.tsx because in Next.js 15, a route's `params` prop
// is a Promise that only a Server Component can `await` directly —
// Client Components ('use client') can't be async, so the Server
// Component in page.tsx awaits params and passes the resolved chemicalId
// down here as a plain string prop.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { StockInForm } from '@/components/StockInForm';

interface LogStockInFormProps {
  chemicalId: string;
}

export function LogStockInForm({ chemicalId }: LogStockInFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(payload: unknown): Promise<void> {
    const response = await fetch(`/api/chemicals/${chemicalId}/stock-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      router.push(`/chemicals/${chemicalId}`);
    } else {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? 'Failed to log stock-in');
    }
  }

  return (
    <div className="page page--narrow">
      <div className="page-header">
        <h1>Log Stock-In</h1>
      </div>
      <div className="card">
        <StockInForm chemicalId={chemicalId} onSubmit={handleSubmit} />
        {error && <p role="alert">{error}</p>}
      </div>
    </div>
  );
}
