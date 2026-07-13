// src/app/chemicals/[id]/edit/EditChemicalForm.tsx
//
// Client component holding the actual edit-chemical form and its
// handlers. Split out from page.tsx because in Next.js 15, a route's
// `params` prop is a Promise that only a Server Component can `await`
// directly — Client Components ('use client') can't be async, so the
// Server Component in page.tsx awaits params and passes the resolved
// chemicalId down here as a plain string prop.

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface EditChemicalFormProps {
  chemicalId: string;
}

export function EditChemicalForm({ chemicalId }: EditChemicalFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingArchive, setConfirmingArchive] = useState(false);

  async function loadChemical(): Promise<void> {
    const response = await fetch(`/api/chemicals/${chemicalId}`);
    const parsed = await response.json();
    setForm(parsed);
  }

  useEffect(() => {
    loadChemical();
  }, []);

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();

    const response = await fetch(`/api/chemicals/${chemicalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });

    if (response.ok) {
      router.push(`/chemicals/${chemicalId}`);
    } else {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? 'Failed to save changes');
    }
  }

  async function handleArchive(): Promise<void> {
    const response = await fetch(`/api/chemicals/${chemicalId}`, { method: 'DELETE' });
    if (response.ok) {
      router.push('/');
    }
  }

  if (!form) return <p>Loading…</p>;

  return (
    <form onSubmit={handleSubmit}>
      <h1>Edit Chemical</h1>
      <label>
        Name
        <input
          type="text"
          value={(form.name as string) ?? ''}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
      </label>
      <label>
        CPECS Descriptor
        <input
          type="text"
          value={(form.cpecsDescriptor as string) ?? ''}
          onChange={(e) => setForm({ ...form, cpecsDescriptor: e.target.value })}
          required
        />
      </label>
      <label>
        Category
        <input
          type="text"
          value={(form.category as string) ?? ''}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        />
      </label>
      <label>
        Unit
        <input
          type="text"
          value={(form.unit as string) ?? ''}
          onChange={(e) => setForm({ ...form, unit: e.target.value })}
        />
      </label>
      <label>
        Low-stock threshold
        <input
          type="number"
          step="any"
          value={(form.lowStockThreshold as number | string) ?? ''}
          onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit">Save</button>
      <button type="button" onClick={() => setConfirmingArchive(true)}>
        Archive this chemical
      </button>
      {confirmingArchive && (
        <ConfirmDialog
          title="Archive this chemical?"
          message="This hides it from the default dashboard view but keeps its full history for export. You can't easily un-archive it from the UI yet."
          onConfirm={() => {
            setConfirmingArchive(false);
            handleArchive();
          }}
          onCancel={() => setConfirmingArchive(false)}
        />
      )}
    </form>
  );
}
