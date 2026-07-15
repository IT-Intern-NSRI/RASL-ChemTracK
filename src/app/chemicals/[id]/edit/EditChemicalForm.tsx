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
    if (!form) return;

    const payload = {
      name: form.name,
      cpecsDescriptor: form.cpecsDescriptor,
      category: form.category,
      unit: form.unit,
      lowStockThreshold:
        form.lowStockThreshold === '' || form.lowStockThreshold === null
          ? undefined
          : Number(form.lowStockThreshold),
    };

    const response = await fetch(`/api/chemicals/${chemicalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
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

  if (!form) return <p className="loading-state">Loading…</p>;

  return (
    <div className="page page--narrow">
      <div className="page-header">
        <h1>Edit Chemical</h1>
      </div>
      <div className="card">
        <form onSubmit={handleSubmit} className="form">
          <label className="field">
            Name
            <input
              type="text"
              value={(form.name as string) ?? ''}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </label>
          <label className="field">
            CPECS Descriptor
            <input
              type="text"
              value={(form.cpecsDescriptor as string) ?? ''}
              onChange={(e) => setForm({ ...form, cpecsDescriptor: e.target.value })}
              required
            />
          </label>
          <label className="field">
            Category
            <input
              type="text"
              value={(form.category as string) ?? ''}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
            />
          </label>
          <label className="field">
            Unit
            <input
              type="text"
              value={(form.unit as string) ?? ''}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
            />
          </label>
          <label className="field">
            Low-stock threshold
            <input
              type="number"
              step="any"
              value={(form.lowStockThreshold as number | string) ?? ''}
              onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Save
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => setConfirmingArchive(true)}
            >
              Archive this chemical
            </button>
          </div>
        </form>
      </div>
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
    </div>
  );
}
