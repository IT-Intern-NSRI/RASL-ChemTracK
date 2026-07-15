// src/app/chemicals/[id]/log-replenish/LogReplenishForm.tsx
//
// Client component holding the actual log-replenish form and its
// handler. Split out from page.tsx because in Next.js 15, a route's
// `params` prop is a Promise that only a Server Component can `await`
// directly — Client Components ('use client') can't be async, so the
// Server Component in page.tsx awaits params and passes the resolved
// chemicalId down here as a plain string prop.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ReplenishForm } from '@/components/ReplenishForm';

interface LogReplenishFormProps {
  chemicalId: string;
}

export function LogReplenishForm({ chemicalId }: LogReplenishFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(payload: unknown): Promise<void> {
    const response = await fetch(`/api/chemicals/${chemicalId}/replenish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      router.push(`/chemicals/${chemicalId}`);
    } else {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? 'Failed to log replenish');
    }
  }

  return (
    <div className="page page--narrow">
      <div className="page-header">
        <h1>Log Replenish</h1>
      </div>
      <div className="card">
        <ReplenishForm chemicalId={chemicalId} onSubmit={handleSubmit} />
        {error && <p role="alert">{error}</p>}
      </div>
    </div>
  );
}
