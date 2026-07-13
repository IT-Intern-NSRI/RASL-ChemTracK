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
    <div onClick={onToggle} data-overdrawn={transaction.isOverdrawn}>
      <span>{date}</span>
      <span>{isStockIn ? 'Stock-In' : 'Usage'}</span>
      <span>
        {isStockIn ? '+' : '-'}
        {quantity} {unit}
      </span>
      <span>
        Balance: {transaction.balanceOut} {unit}
      </span>
      {expanded && (
        <div>
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
