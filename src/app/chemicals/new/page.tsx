// src/app/chemicals/new/page.tsx
//
// PURE FRONTEND FILE — plain description:
// A form to register a new chemical: Name, CPECS descriptor (name, form,
// purity, packaging — the full regulatory descriptor used on exports),
// Category (optional), Unit (defaults to "L"), Low-stock threshold
// (optional). On submit, creates the chemical and redirects to its new
// detail page. Existing physical stock on hand should be entered
// afterward as a stock-in transaction on the chemical's detail page, not
// here.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewChemicalPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '',
    cpecsDescriptor: '',
    category: '',
    unit: 'L',
    lowStockThreshold: '',
  });
  const [error, setError] = useState<string | null>(null);

  // def handleSubmit(): Input is one form submit event. Output is none
  // (side effect: POSTs the new chemical to /api/chemicals, then
  // navigates to /chemicals/[newId] on success, or sets `error` on
  // failure).
  // Pseudocode:
  //   1. event.preventDefault().
  //   2. POST `form` (with lowStockThreshold parsed to a number, or
  //      omitted if blank) as JSON to /api/chemicals.
  //   3. If response.ok, parse the created chemical and
  //      router.push(`/chemicals/${created.id}`).
  //   4. Else, set error from the response body's error message.
  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();

    const payload = {
      ...form,
      lowStockThreshold: form.lowStockThreshold ? Number(form.lowStockThreshold) : undefined,
    };

    const response = await fetch('/api/chemicals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      const created = await response.json();
      router.push(`/chemicals/${created.id}`);
    } else {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? 'Failed to create chemical');
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Add Chemical</h1>
      <label>
        Name
        <input
          type="text"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />
      </label>
      <label>
        CPECS Descriptor
        <input
          type="text"
          value={form.cpecsDescriptor}
          onChange={(e) => setForm({ ...form, cpecsDescriptor: e.target.value })}
          required
        />
      </label>
      <label>
        Category
        <input
          type="text"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
        />
      </label>
      <label>
        Unit
        <input
          type="text"
          value={form.unit}
          onChange={(e) => setForm({ ...form, unit: e.target.value })}
        />
      </label>
      <label>
        Low-stock threshold
        <input
          type="number"
          step="any"
          value={form.lowStockThreshold}
          onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <button type="submit">Create</button>
    </form>
  );
}
