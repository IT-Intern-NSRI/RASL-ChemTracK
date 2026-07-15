// src/components/ReplenishForm.tsx
//
// PURE FRONTEND FILE — plain description:
// Reusable field layout for logging a replenish (topping up the smaller
// day-to-day working container from bulk stock): Date Replenished
// (defaults to today, editable), Quantity Replenished, optional Notes,
// and a live-computed, editable Balance (Out) field. Calls the parent's
// onSubmit with the assembled payload; the parent page owns the actual
// POST request. Replenish logs never appear in the exported PDF.

'use client';

import { useState, useEffect } from 'react';

interface ReplenishFormProps {
  chemicalId: string;
  onSubmit: (payload: Record<string, unknown>) => void;
}

// def computeLiveBalance(): Input is one number (currentOutBalance) and
// one number (quantityReplenished). Output is one number
// (currentOutBalance + quantityReplenished) — client-side mirror of
// lib/balance.computeNewOutBalance for REPLENISH, for instant visual
// feedback only.
// Pseudocode: return currentOutBalance + quantityReplenished.
function computeLiveBalance(currentOutBalance: number, quantityReplenished: number): number {
  return currentOutBalance + quantityReplenished;
}

export function ReplenishForm({ chemicalId, onSubmit }: ReplenishFormProps) {
  const [form, setForm] = useState({
    dateReplenished: '', // pre-filled to today (Manila) on mount — see loadDefaults()
    quantityReplenished: '',
    replenishNotes: '',
    balanceOut: '', // left blank until the user overrides; auto-computed for display
  });
  const [currentOutBalance, setCurrentOutBalance] = useState(0);
  const [balanceOverridden, setBalanceOverridden] = useState(false);

  // def loadDefaults(): mirrors StockInForm.loadDefaults — fetches the
  // chemical's currentOutBalance and seeds form.dateReplenished to today
  // (Manila).
  async function loadDefaults(): Promise<void> {
    const response = await fetch(`/api/chemicals/${chemicalId}`);
    if (response.ok) {
      const chemical = await response.json();
      setCurrentOutBalance(Number(chemical.currentOutBalance));
    }

    // Mirrors src/lib/timezone.ts's getTodayManila() on the client, since
    // this is a client component and can't import server-only code.
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
    setForm((prev) => ({ ...prev, dateReplenished: prev.dateReplenished || today }));
  }

  useEffect(() => {
    loadDefaults();
  }, []);

  // def handleChange(): mirrors StockInForm.handleChange, recomputing
  // balanceOut via computeLiveBalance() when quantityReplenished changes
  // and the user hasn't manually overridden balanceOut.
  function handleChange(key: string, value: string): void {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'quantityReplenished' && !balanceOverridden) {
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
      dateReplenished: form.dateReplenished || undefined,
      quantityReplenished: Number(form.quantityReplenished),
      replenishNotes: form.replenishNotes || undefined,
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
        Date Replenished
        <input
          type="date"
          value={form.dateReplenished}
          onChange={(e) => handleChange('dateReplenished', e.target.value)}
        />
      </label>
      <label className="field">
        Quantity Replenished
        <input
          type="number"
          step="any"
          value={form.quantityReplenished}
          onChange={(e) => handleChange('quantityReplenished', e.target.value)}
          required
        />
      </label>
      <label className="field">
        Notes
        <input
          type="text"
          value={form.replenishNotes}
          onChange={(e) => handleChange('replenishNotes', e.target.value)}
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
          Log Replenish
        </button>
      </div>
    </form>
  );
}
