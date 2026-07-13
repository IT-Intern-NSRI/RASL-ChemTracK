// src/app/chemicals/[id]/log-usage/LogUsageForm.tsx
//
// Client component holding the actual log-usage form and its handler.
// Split out from page.tsx because in Next.js 15, a route's `params` prop
// is a Promise that only a Server Component can `await` directly —
// Client Components ('use client') can't be async, so the Server
// Component in page.tsx awaits params and passes the resolved chemicalId
// down here as a plain string prop.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { UsageForm } from '@/components/UsageForm';

interface LogUsageFormProps {
  chemicalId: string;
}

export function LogUsageForm({ chemicalId }: LogUsageFormProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(payload: unknown): Promise<void> {
    const response = await fetch(`/api/chemicals/${chemicalId}/usage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      router.push(`/chemicals/${chemicalId}`);
    } else {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? 'Failed to log usage');
    }
  }

  return (
    <div className="page page--narrow">
      <div className="page-header">
        <h1>Log Usage</h1>
      </div>
      <div className="card">
        <UsageForm chemicalId={chemicalId} onSubmit={handleSubmit} />
        {error && <p role="alert">{error}</p>}
      </div>
    </div>
  );
}
