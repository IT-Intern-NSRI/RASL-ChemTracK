// src/components/EditTransactionDialog.tsx
//
// A modal form for editing a single existing transaction (stock-in,
// usage, or replenish) in place from the chemical detail page's history
// list. Opened from a small "Edit" button on <TransactionCard/>.
//
// Field layout mirrors the corresponding log form (StockInForm /
// UsageForm / ReplenishForm) for the transaction's type, pre-filled with
// its current values, plus the same editable "Balance (Out)" override
// field.
//
// IMPORTANT: this only ever sends the fields that actually changed (see
// buildDiffPayload()) via PATCH /api/transactions/[id], which routes to
// lib/balance.ts's editTransaction(). That function is what keeps every
// downstream computation correct:
//   - It validates the diff against the transaction's own type-specific
//     partial schema (stockInUpdateSchema / usageUpdateSchema /
//     replenishUpdateSchema).
//   - It records each changed field in editHistory (old -> new) rather
//     than silently overwriting, and sets edited = true.
//   - It calls recalculateChain() for every transaction at or after this
//     one (by sequenceNo), so Current Balance / Current Out Balance
//     chains, isOverdrawn flags, and everything downstream (dashboard
//     balances, the detail page's header figures, and every export's
//     IN / OUT / Initial Stock / Balance Forwarded figures) stay
//     consistent with the edit.
//   - Balance (Out) is only ever included in the payload if the user
//     actually changed the displayed value — editing an unrelated field
//     (say, Details of Usage) never accidentally forces a manual Out
//     Balance override on a row that didn't have one, which would
//     otherwise make that row "sticky" and stop auto-following the
//     chain (see recalculateChain()'s balanceOverridden handling).
// No client-side recomputation of balances happens here — the server is
// the sole source of truth for the recalculated chain, and the page is
// refreshed (router.refresh()) after a successful save so every figure
// on screen (including ones outside this dialog, like the page header's
// Current Balance / Current Out Balance) reflects the server's
// recalculation rather than a locally-guessed value.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TransactionDTO } from '@/types';

interface EditTransactionDialogProps {
  transaction: TransactionDTO;
  unit: string;
  onClose: () => void;
}

type FormState = Record<string, string>;

// def initialFormFor(): Input is one TransactionDTO. Output is one
// FormState (all values as strings, matching how <input> elements hold
// them) seeded from that transaction's current field values, one key set
// per type. balanceOut is always included (every type has one).
// Pseudocode:
//   1. Switch on transaction.type.
//   2. Map each relevant field to a string (null -> '', numbers via
//      String()).
function initialFormFor(t: TransactionDTO): FormState {
  if (t.type === 'STOCK_IN') {
    return {
      dateReceived: t.dateReceived ?? '',
      supplierInfo: t.supplierInfo ?? '',
      truckerCarrier: t.truckerCarrier ?? '',
      lotBatchNo: t.lotBatchNo ?? '',
      quantityReceived: t.quantityReceived !== null ? String(t.quantityReceived) : '',
      balanceOut: String(t.balanceOut),
    };
  }
  if (t.type === 'USAGE') {
    return {
      dateUsed: t.dateUsed ?? '',
      detailsOfUsage: t.detailsOfUsage ?? '',
      workOrderNo: t.workOrderNo ?? '',
      lotBatchNoUsed: t.lotBatchNoUsed ?? '',
      quantityUsed: t.quantityUsed !== null ? String(t.quantityUsed) : '',
      balanceOut: String(t.balanceOut),
    };
  }
  return {
    dateReplenished: t.dateReplenished ?? '',
    quantityReplenished: t.quantityReplenished !== null ? String(t.quantityReplenished) : '',
    replenishNotes: t.replenishNotes ?? '',
    balanceOut: String(t.balanceOut),
  };
}

const TYPE_TITLE: Record<TransactionDTO['type'], string> = {
  STOCK_IN: 'Stock-In',
  USAGE: 'Usage',
  REPLENISH: 'Replenish',
};

const FIELD_LABELS: Record<string, string> = {
  dateReceived: 'Date Received',
  supplierInfo: 'Supplier Information',
  truckerCarrier: 'Name of trucker/carrier',
  lotBatchNo: 'Lot/Batch No.',
  quantityReceived: 'Quantity Received',
  dateUsed: 'Date Used',
  detailsOfUsage: 'Details of Usage',
  workOrderNo: 'Work Order No.',
  lotBatchNoUsed: 'Lot/Batch No. of used CPECS',
  quantityUsed: 'Quantity Used',
  dateReplenished: 'Date Replenished',
  quantityReplenished: 'Quantity Replenished',
  replenishNotes: 'Notes',
  balanceOut: 'Balance (Out)',
};

// One row's worth of layout info: which fields to render, in order, for
// each transaction type, and which are required (mirrors
// StockInForm/UsageForm/ReplenishForm and lib/validation.ts's
// stockInSchema/usageSchema/replenishSchema).
const FIELDS_BY_TYPE: Record<
  TransactionDTO['type'],
  Array<{ key: string; type: 'date' | 'text' | 'number'; required?: boolean }>
> = {
  STOCK_IN: [
    { key: 'dateReceived', type: 'date' },
    { key: 'supplierInfo', type: 'text', required: true },
    { key: 'truckerCarrier', type: 'text' },
    { key: 'lotBatchNo', type: 'text', required: true },
    { key: 'quantityReceived', type: 'number', required: true },
  ],
  USAGE: [
    { key: 'dateUsed', type: 'date' },
    { key: 'detailsOfUsage', type: 'text', required: true },
    { key: 'workOrderNo', type: 'text' },
    { key: 'lotBatchNoUsed', type: 'text' },
    { key: 'quantityUsed', type: 'number', required: true },
  ],
  REPLENISH: [
    { key: 'dateReplenished', type: 'date' },
    { key: 'quantityReplenished', type: 'number', required: true },
    { key: 'replenishNotes', type: 'text' },
  ],
};

export function EditTransactionDialog({ transaction, unit, onClose }: EditTransactionDialogProps) {
  const router = useRouter();
  const { type } = transaction;

  const [form, setForm] = useState<FormState>(() => initialFormFor(transaction));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function handleChange(key: string, value: string): void {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // def buildDiffPayload(): Input is none (reads `form` and `transaction`
  // from closure). Output is one Record<string, unknown> containing only
  // the fields whose current form value differs from the transaction's
  // original value — string fields compared as strings (empty string ===
  // null/omitted), number fields compared numerically. balanceOut is only
  // included if its typed value differs from the transaction's existing
  // balanceOut (an explicit override), never just because another field
  // changed.
  // Pseudocode:
  //   1. For each field in FIELDS_BY_TYPE[type], compare form[key]
  //      against the transaction's original value; include it in the
  //      payload only if different.
  //   2. Same comparison for balanceOut against transaction.balanceOut.
  //   3. Return the resulting partial payload.
  function buildDiffPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    const original = transaction as unknown as Record<string, unknown>;

    for (const field of FIELDS_BY_TYPE[type]) {
      const value = form[field.key];
      if (field.type === 'number') {
        const originalNum = original[field.key] as number | null;
        const num = Number(value);
        if (value !== '' && !Number.isNaN(num) && num !== (originalNum ?? Number.NaN)) {
          payload[field.key] = num;
        }
      } else {
        const originalStr = (original[field.key] as string | null) ?? '';
        if (value !== originalStr) {
          payload[field.key] = value;
        }
      }
    }

    const balanceOutValue = form.balanceOut;
    if (balanceOutValue !== '') {
      const num = Number(balanceOutValue);
      if (!Number.isNaN(num) && num !== transaction.balanceOut) {
        payload.balanceOut = num;
      }
    }

    return payload;
  }

  // def handleSubmit(): Input is one form submit event. Output is none
  // (side effects: PATCHes /api/transactions/[id] with only the changed
  // fields; on success, refreshes the current route's server data via
  // router.refresh() so every dependent figure on the page — this row,
  // later rows' Balance (Out) values, and the page header's Current
  // Balance / Current Out Balance — reflects the server's recalculated
  // chain, then closes the dialog; on failure, shows the server's error
  // message inline without closing).
  // Pseudocode:
  //   1. event.preventDefault().
  //   2. Build the diff payload; if empty (nothing actually changed),
  //      just close without making a request.
  //   3. PATCH the diff to /api/transactions/${transaction.id}.
  //   4. On response.ok: router.refresh(), then onClose().
  //   5. Else: parse the error body and setError().
  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);

    const payload = buildDiffPayload();
    if (Object.keys(payload).length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/transactions/${transaction.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        router.refresh();
        onClose();
      } else {
        const body = await response.json().catch(() => null);
        setError(body?.error ?? 'Failed to save changes');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="dialog-backdrop"
      onClick={(e) => {
        // The dialog is rendered inside <TransactionCard/>'s own
        // onClick={onToggle} container — without stopping propagation
        // here, a click on the backdrop (to dismiss the dialog) would
        // also bubble up and toggle the card's expand/collapse state
        // underneath it.
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        role="dialog"
        aria-label="Edit transaction"
        className="dialog dialog--form"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Edit {TYPE_TITLE[type]} Entry</h2>
        <form onSubmit={handleSubmit} className="form">
          {FIELDS_BY_TYPE[type].map((field) => (
            <label className="field" key={field.key}>
              {FIELD_LABELS[field.key]}
              {field.type === 'number' ? ` (${unit})` : ''}
              <input
                type={field.type}
                step={field.type === 'number' ? 'any' : undefined}
                value={form[field.key] ?? ''}
                onChange={(e) => handleChange(field.key, e.target.value)}
                required={field.required}
              />
            </label>
          ))}
          <label className="field">
            {FIELD_LABELS.balanceOut} ({unit})
            <input
              type="number"
              step="any"
              value={form.balanceOut}
              onChange={(e) => handleChange('balanceOut', e.target.value)}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
