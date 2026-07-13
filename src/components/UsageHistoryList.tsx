// src/components/UsageHistoryList.tsx
//
// PURE FRONTEND FILE — plain description:
// Mobile-first card list of a chemical's transaction history, newest
// first. Renders one <TransactionCard/> per transaction and manages which
// single card is currently expanded (an accordion, not independent
// toggles per card, to keep the mobile view compact).

'use client';

import { useState } from 'react';
import { TransactionDTO } from '@/types';
import { TransactionCard } from './TransactionCard';

interface UsageHistoryListProps {
  transactions: TransactionDTO[];
  unit: string;
}

export function UsageHistoryList({ transactions, unit }: UsageHistoryListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // def toggleExpand(): Input is one transaction id (string). Output is
  // none (side effect: sets expandedId to that id, or to null if it was
  // already expanded — a simple accordion toggle).
  // Pseudocode:
  //   1. If expandedId === id, setExpandedId(null).
  //   2. Else setExpandedId(id).
  function toggleExpand(id: string): void {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div>
      {transactions.map((transaction) => (
        <TransactionCard
          key={transaction.id}
          transaction={transaction}
          unit={unit}
          expanded={expandedId === transaction.id}
          onToggle={() => toggleExpand(transaction.id)}
        />
      ))}
    </div>
  );
}
