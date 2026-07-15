// src/components/TransactionCard.tsx
//
// PURE FRONTEND FILE — plain description:
// A single collapsible card representing one transaction. Collapsed
// state shows: date, a type badge ("Stock-In" in green / "Usage" in blue
// / "Replenish" in purple), the quantity delta (+X or -X, blank delta
// symbol for replenish since it's an internal transfer rather than
// inventory in/out), and the resulting Out Balance. Expanded state
// additionally shows whichever fields are populated for that type
// (supplier info / trucker / lot-batch / quantity received for
// stock-in; details of usage / work order / lot-batch used / quantity
// used for usage; quantity replenished / notes for replenish). An
// overdrawn usage entry is visually flagged via the [data-overdrawn] CSS
// hook in globals.css. Fully presentational — no data fetching, just
// prop rendering.

import { TransactionDTO } from '@/types';

interface TransactionCardProps {
  transaction: TransactionDTO;
  unit: string;
  expanded: boolean;
  onToggle: () => void;
}

const BADGE_CLASS: Record<TransactionDTO['type'], string> = {
  STOCK_IN: 'badge-stock-in',
  USAGE: 'badge-usage',
  REPLENISH: 'badge-replenish',
};

const BADGE_LABEL: Record<TransactionDTO['type'], string> = {
  STOCK_IN: 'Stock-In',
  USAGE: 'Usage',
  REPLENISH: 'Replenish',
};

export function TransactionCard({ transaction, unit, expanded, onToggle }: TransactionCardProps) {
  const { type } = transaction;

  const date =
    type === 'STOCK_IN'
      ? transaction.dateReceived
      : type === 'USAGE'
        ? transaction.dateUsed
        : transaction.dateReplenished;

  const quantity =
    type === 'STOCK_IN'
      ? transaction.quantityReceived
      : type === 'USAGE'
        ? transaction.quantityUsed
        : transaction.quantityReplenished;

  const qtySign = type === 'USAGE' ? '-' : type === 'STOCK_IN' ? '+' : '+';
  const qtyClass = type === 'USAGE' ? 'tx-card__qty--out' : 'tx-card__qty--in';

  return (
    <div className="tx-card" onClick={onToggle} data-overdrawn={transaction.isOverdrawn}>
      <div className="tx-card__row">
        <span className="tx-card__date">{date}</span>
        <span className={`badge ${BADGE_CLASS[type]}`}>{BADGE_LABEL[type]}</span>
        <span className={`tx-card__qty ${qtyClass}`}>
          {qtySign}
          {quantity} {unit}
        </span>
        <span className="tx-card__balance">
          Out Balance: {transaction.balanceOut} {unit}
        </span>
      </div>
      {expanded && (
        <div className="tx-card__details">
          {type === 'STOCK_IN' && (
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
          )}
          {type === 'USAGE' && (
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
          {type === 'REPLENISH' && (
            <div>
              <strong>Notes:</strong> {transaction.replenishNotes ?? '—'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
