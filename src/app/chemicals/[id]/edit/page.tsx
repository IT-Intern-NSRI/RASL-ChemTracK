// src/app/chemicals/[id]/edit/page.tsx
//
// PURE FRONTEND FILE — plain description:
// A form pre-filled with the chemical's current metadata (Name, CPECS
// descriptor, Category, Unit, Low-stock threshold), with a Save button
// and a separate "Archive this chemical" action (soft-delete — hides it
// from the default dashboard view but keeps its full history for
// export).

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ConfirmDialog } from '@/components/ConfirmDialog';

interface EditChemicalPageProps {
  params: { id: string };
}

export default function EditChemicalPage({ params }: EditChemicalPageProps) {
  const router = useRouter();
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingArchive, setConfirmingArchive] = useState(false);

  // def loadChemical(): Input is none (reads params.id from closure).
  // Output is none (side effect: fetches GET /api/chemicals/[id] and
  // calls setForm() with the result). Intended to run once on mount via
  // useEffect.
  // Pseudocode:
  //   1. Fetch GET /api/chemicals/${params.id}.
  //   2. Parse the JSON and call setForm(parsed).
  async function loadChemical(): Promise<void> {
    const response = await fetch(`/api/chemicals/${params.id}`);
    const parsed = await response.json();
    setForm(parsed);
  }

  useEffect(() => {
    loadChemical();
  }, []);

  // def handleSubmit(): Input is one form submit event. Output is none
  // (side effect: PATCHes /api/chemicals/[id], then navigates back to the
  // detail page on success).
  // Pseudocode:
  //   1. event.preventDefault().
  //   2. PATCH `form` as JSON to /api/chemicals/${params.id}.
  //   3. If response.ok, router.push(`/chemicals/${params.id}`).
  //   4. Else, set error from the response body.
  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();

    const response = await fetch(`/api/chemicals/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });

    if (response.ok) {
      router.push(`/chemicals/${params.id}`);
    } else {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? 'Failed to save changes');
    }
  }

  // def handleArchive(): Input is none (button click). Output is none
  // (side effect: DELETEs /api/chemicals/[id] — a soft-delete/archive —
  // then navigates to the dashboard "/").
  // Pseudocode:
  //   1. Confirm with the user (e.g. via <ConfirmDialog/>).
  //   2. DELETE /api/chemicals/${params.id}.
  //   3. On success, router.push('/').
  async function handleArchive(): Promise<void> {
    const response = await fetch(`/api/chemicals/${params.id}`, { method: 'DELETE' });
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
