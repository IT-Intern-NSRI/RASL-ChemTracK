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
    <div className="tx-card" onClick={onToggle} data-overdrawn={transaction.isOverdrawn}>
      <div className="tx-card__row">
        <span className="tx-card__date">{date}</span>
        <span className={`badge ${isStockIn ? 'badge-stock-in' : 'badge-usage'}`}>
          {isStockIn ? 'Stock-In' : 'Usage'}
        </span>
        <span className={`tx-card__qty ${isStockIn ? 'tx-card__qty--in' : 'tx-card__qty--out'}`}>
          {isStockIn ? '+' : '-'}
          {quantity} {unit}
        </span>
        <span className="tx-card__balance">
          Balance: {transaction.balanceOut} {unit}
        </span>
      </div>
      {expanded && (
        <div className="tx-card__details">
          {isStockIn ? (
            <>
              <div>
                <strong>Supplier:</strong> {transaction.supplierInfo ?? '—'}
              </div>
              <div>
                <strong>Trucker/Carrier:</strong> {transaction.truckerCarrier ?? '—'}
              </div>
              <div>
                <strong>Lot/Batch No.:</strong> {transaction.lotBatchNo ?? '—'}
              </div>
            </>
          ) : (
            <>
              <div>
                <strong>Details of Usage:</strong> {transaction.detailsOfUsage ?? '—'}
              </div>
              <div>
                <strong>Work Order No.:</strong> {transaction.workOrderNo ?? '—'}
              </div>
              <div>
                <strong>Lot/Batch No. used:</strong> {transaction.lotBatchNoUsed ?? '—'}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
