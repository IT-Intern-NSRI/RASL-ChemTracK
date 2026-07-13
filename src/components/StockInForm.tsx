// src/components/StockInForm.tsx
//
// PURE FRONTEND FILE — plain description:
// Reusable field layout for logging a stock-in: Date Received (defaults
// to today, editable), Supplier Information, Name of trucker/carrier
// (optional), Lot/Batch No., Quantity Received, and a live-computed,
// editable Balance (Out) field. Calls the parent's onSubmit with the
// assembled payload; the parent page owns the actual POST request.

'use client';

import { useState, useEffect } from 'react';

interface StockInFormProps {
  chemicalId: string;
  onSubmit: (payload: Record<string, unknown>) => void;
}

// def computeLiveBalance(): Input is one number (currentBalance) and one
// number (quantityReceived). Output is one number (currentBalance +
// quantityReceived) — mirrors lib/balance.computeNewBalance for
// STOCK_IN, duplicated client-side purely for instant visual feedback as
// the user types; the server remains the source of truth on submit.
// Pseudocode: return currentBalance + quantityReceived.
function computeLiveBalance(currentBalance: number, quantityReceived: number): number {
  return currentBalance + quantityReceived;
}

export function StockInForm({ chemicalId, onSubmit }: StockInFormProps) {
  const [form, setForm] = useState({
    dateReceived: '', // pre-filled to today (Manila) on mount — see loadDefaults()
    supplierInfo: '',
    truckerCarrier: '',
    lotBatchNo: '',
    quantityReceived: '',
    balanceOut: '', // left blank until the user overrides; auto-computed for display
  });
  const [currentBalance, setCurrentBalance] = useState(0);
  const [balanceOverridden, setBalanceOverridden] = useState(false);

  // def loadDefaults(): Input is none. Output is none (side effect:
  // fetches the chemical's currentBalance and today's Manila date, and
  // seeds `form`/`currentBalance` accordingly). Runs once on mount via
  // useEffect.
  // Pseudocode:
  //   1. Fetch GET /api/chemicals/${chemicalId}; store currentBalance.
  //   2. Fetch (or receive as a prop/server default) today's date in
  //      Asia/Manila; set form.dateReceived to it.
  async function loadDefaults(): Promise<void> {
    const response = await fetch(`/api/chemicals/${chemicalId}`);
    if (response.ok) {
      const chemical = await response.json();
      setCurrentBalance(Number(chemical.currentBalance));
    }

    // Mirrors src/lib/timezone.ts's getTodayManila() on the client, since
    // this is a client component and can't import server-only code.
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
    setForm((prev) => ({ ...prev, dateReceived: prev.dateReceived || today }));
  }

  useEffect(() => {
    loadDefaults();
  }, []);

  // def handleChange(): Input is one field key (string) and one value
  // (string). Output is none (side effect: updates `form`; if the field
  // is quantityReceived and the user hasn't manually touched balanceOut,
  // recompute the displayed balanceOut via computeLiveBalance()).
  // Pseudocode:
  //   1. setForm({ ...form, [key]: value }).
  //   2. If key === 'quantityReceived' and !balanceOverridden, set
  //      form.balanceOut to computeLiveBalance(currentBalance,
  //      Number(value)).
  //   3. If key === 'balanceOut', setBalanceOverridden(true).
  function handleChange(key: string, value: string): void {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'quantityReceived' && !balanceOverridden) {
        const qty = Number(value);
        next.balanceOut = Number.isFinite(qty)
          ? String(computeLiveBalance(currentBalance, qty))
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
      dateReceived: form.dateReceived || undefined,
      supplierInfo: form.supplierInfo,
      truckerCarrier: form.truckerCarrier || undefined,
      lotBatchNo: form.lotBatchNo,
      quantityReceived: Number(form.quantityReceived),
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
        Date Received
        <input
          type="date"
          value={form.dateReceived}
          onChange={(e) => handleChange('dateReceived', e.target.value)}
        />
      </label>
      <label className="field">
        Supplier Information
        <input
          type="text"
          value={form.supplierInfo}
          onChange={(e) => handleChange('supplierInfo', e.target.value)}
          required
        />
      </label>
      <label className="field">
        Name of trucker/carrier
        <input
          type="text"
          value={form.truckerCarrier}
          onChange={(e) => handleChange('truckerCarrier', e.target.value)}
        />
      </label>
      <label className="field">
        Lot/Batch No.
        <input
          type="text"
          value={form.lotBatchNo}
          onChange={(e) => handleChange('lotBatchNo', e.target.value)}
          required
        />
      </label>
      <label className="field">
        Quantity Received
        <input
          type="number"
          step="any"
          value={form.quantityReceived}
          onChange={(e) => handleChange('quantityReceived', e.target.value)}
          required
        />
      </label>
      <label className="field">
        Balance (Out)
        <input
          type="number"
          step="any"
          value={form.balanceOut}
          onChange={(e) => handleChange('balanceOut', e.target.value)}
        />
      </label>
      <div className="form-actions">
        <button type="submit" className="btn btn-primary">
          Log Stock-In
        </button>
      </div>
    </form>
  );
}
