// src/components/UsageForm.tsx
//
// PURE FRONTEND FILE — plain description:
// Reusable field layout for logging usage: Date Used (defaults to today,
// editable), Details of Usage, Work Order No. (optional), Lot/Batch No.
// of used CPECS (optional), Quantity Used, and a live-computed, editable
// Balance (Out) field. Calls the parent's onSubmit with the assembled
// payload; the parent page owns the actual POST request.

'use client';

import { useState, useEffect } from 'react';

interface UsageFormProps {
  chemicalId: string;
  onSubmit: (payload: Record<string, unknown>) => void;
}

// def computeLiveBalance(): Input is one number (currentOutBalance) and
// one number (quantityUsed). Output is one number (currentOutBalance -
// quantityUsed) — client-side mirror of
// lib/balance.computeNewOutBalance for USAGE, for instant visual
// feedback only. A usage draws from the smaller working container
// ("Current Out Balance"), which is what the "Balance (Out)" field
// tracks — not the total inventory ("Current Balance").
// Pseudocode: return currentOutBalance - quantityUsed.
function computeLiveBalance(currentOutBalance: number, quantityUsed: number): number {
  return currentOutBalance - quantityUsed;
}

export function UsageForm({ chemicalId, onSubmit }: UsageFormProps) {
  const [form, setForm] = useState({
    dateUsed: '',
    detailsOfUsage: '',
    workOrderNo: '',
    lotBatchNoUsed: '',
    quantityUsed: '',
    balanceOut: '',
  });
  const [currentOutBalance, setCurrentOutBalance] = useState(0);
  const [unit, setUnit] = useState('');
  const [balanceOverridden, setBalanceOverridden] = useState(false);

  // def loadDefaults(): mirrors StockInForm.loadDefaults — fetches the
  // chemical's currentOutBalance (the figure a usage actually draws
  // from) and unit (used to label the quantity/balance inputs, e.g.
  // "Quantity Used (L)"), and seeds form.dateUsed to today (Manila).
  async function loadDefaults(): Promise<void> {
    const response = await fetch(`/api/chemicals/${chemicalId}`);
    if (response.ok) {
      const chemical = await response.json();
      setCurrentOutBalance(Number(chemical.currentOutBalance));
      setUnit(chemical.unit);
    }

    // Mirrors src/lib/timezone.ts's getTodayManila() on the client, since
    // this is a client component and can't import server-only code.
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
    setForm((prev) => ({ ...prev, dateUsed: prev.dateUsed || today }));
  }

  useEffect(() => {
    loadDefaults();
  }, []);

  // def handleChange(): mirrors StockInForm.handleChange, recomputing
  // balanceOut via computeLiveBalance() when quantityUsed changes and the
  // user hasn't manually overridden balanceOut.
  function handleChange(key: string, value: string): void {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'quantityUsed' && !balanceOverridden) {
        const qty = Number(value);
        next.balanceOut = Number.isFinite(qty)
          ? String(computeLiveBalance(currentOutBalance, qty))
          : '';
      }
      return next;
    });

    if (key === 'balanceOut') {
      setBalanceOverridden(true);
    }
  }

  function buildPayload(): Record<string, unknown> {
    return {
      dateUsed: form.dateUsed || undefined,
      detailsOfUsage: form.detailsOfUsage,
      workOrderNo: form.workOrderNo || undefined,
      lotBatchNoUsed: form.lotBatchNoUsed || undefined,
      quantityUsed: Number(form.quantityUsed),
      balanceOut: balanceOverridden && form.balanceOut !== '' ? Number(form.balanceOut) : undefined,
    };
  }

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(buildPayload());
      }}
    >
      <label className="field">
        Date Used
        <input
          type="date"
          value={form.dateUsed}
          onChange={(e) => handleChange('dateUsed', e.target.value)}
        />
      </label>
      <label className="field">
        Details of Usage
        <input
          type="text"
          value={form.detailsOfUsage}
          onChange={(e) => handleChange('detailsOfUsage', e.target.value)}
          required
        />
      </label>
      <label className="field">
        Work Order No.
        <input
          type="text"
          value={form.workOrderNo}
          onChange={(e) => handleChange('workOrderNo', e.target.value)}
        />
      </label>
      <label className="field">
        Lot/Batch No. of used CPECS
        <input
          type="text"
          value={form.lotBatchNoUsed}
          onChange={(e) => handleChange('lotBatchNoUsed', e.target.value)}
        />
      </label>
      <label className="field">
        Quantity Used{unit ? ` (${unit})` : ''}
        <input
          type="number"
          step="any"
          value={form.quantityUsed}
          onChange={(e) => handleChange('quantityUsed', e.target.value)}
          required
        />
      </label>
      <label className="field">
        Balance (Out){unit ? ` (${unit})` : ''}
        <input
          type="number"
          step="any"
          value={form.balanceOut}
          onChange={(e) => handleChange('balanceOut', e.target.value)}
        />
      </label>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary">
          Log Usage
        </button>
      </div>
    </form>
  );
}
