// src/components/TransactionCard.tsx
//
// PURE FRONTEND FILE — plain description:
// A single collapsible card representing one transaction. Collapsed
// state shows: date, a type badge ("Stock-In" in green / "Usage" in
// blue), the quantity delta (+X or -X), and the resulting balance.
// Expanded state additionally shows whichever fields are populated for
// that type (supplier info / trucker / lot-batch / quantity received for
// stock-in; details of usage / work order / lot-batch used / quantity
// used for usage). An overdrawn usage entry is visually flagged via the
// [data-overdrawn] CSS hook in globals.css. Fully presentational — no
// data fetching, just prop rendering.

import { TransactionDTO } from '@/types';

interface TransactionCardProps {
  transaction: TransactionDTO;
  unit: string;
  expanded: boolean;
  onToggle: () => void;
}

export function TransactionCard({ transaction, unit, expanded, onToggle }: TransactionCardProps) {
  const isStockIn = transaction.type === 'STOCK_IN';
  const date = isStockIn ? transaction.dateReceived : transaction.dateUsed;
  const quantity = isStockIn ? transaction.quantityReceived : transaction.quantityUsed;

  return (
    <div>
      <div
        className="txn-card"
        onClick={onToggle}
        data-type={transaction.type}
        data-overdrawn={transaction.isOverdrawn}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onToggle();
        }}
      >
        <span className="txn-card__date">{date}</span>
        <span className="txn-card__badge">{isStockIn ? 'Stock-In' : 'Usage'}</span>
        <span className="txn-card__quantity">
          {isStockIn ? '+' : '\u2212'}
          {quantity} {unit}
        </span>
        <span className="txn-card__balance">
          Bal. {transaction.balanceOut} {unit}
        </span>
      </div>
      {expanded && (
        <div className="txn-card__detail">
          {isStockIn ? (
            <>
              <div>Supplier: {transaction.supplierInfo ?? '—'}</div>
              <div>Trucker/Carrier: {transaction.truckerCarrier ?? '—'}</div>
              <div>Lot/Batch No.: {transaction.lotBatchNo ?? '—'}</div>
            </>
          ) : (
            <>
              <div>Details of Usage: {transaction.detailsOfUsage ?? '—'}</div>
              <div>Work Order No.: {transaction.workOrderNo ?? '—'}</div>
              <div>Lot/Batch No. used: {transaction.lotBatchNoUsed ?? '—'}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
