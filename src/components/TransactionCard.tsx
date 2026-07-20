// src/components/TransactionCard.tsx
//
// PURE FRONTEND FILE — plain description:
// A single collapsible card representing one transaction. Collapsed
// state shows: date, a type badge ("Stock-In" in green / "Usage" in blue
// / "Replenish" in purple), the quantity delta (+X or -X, blank delta
// symbol for replenish since it's an internal transfer rather than
// inventory in/out), the resulting Out Balance, and a small "Edit"
// button. Expanded state additionally shows whichever fields are
// populated for that type (supplier info / trucker / lot-batch /
// quantity received for stock-in; details of usage / work order /
// lot-batch used / quantity used for usage; quantity replenished / notes
// for replenish). An overdrawn usage entry is visually flagged via the
// [data-overdrawn] CSS hook in globals.css.
//
// Mostly presentational, plus the one bit of local state needed to open
// <EditTransactionDialog/> (see that component's header comment for how
// an edit here safely cascades through every dependent balance
// computation). The edit button stops the click from bubbling to the
// card's own onToggle handler, so opening the editor doesn't also
// expand/collapse the card underneath it.

import { useState } from 'react';
import { TransactionDTO } from '@/types';
import { EditTransactionDialog } from './EditTransactionDialog';

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
  const [editing, setEditing] = useState(false);

  // def handleEditClick(): Input is one mouse event (the Edit button's
  // click). Output is none (side effects: stops the click from bubbling
  // up to the card's own onToggle handler, then opens the edit dialog).
  // Pseudocode:
  //   1. event.stopPropagation() — otherwise the click would also fire
  //      the card's onClick and toggle expand/collapse underneath the
  //      dialog.
  //   2. setEditing(true).
  function handleEditClick(event: React.MouseEvent): void {
    event.stopPropagation();
    setEditing(true);
  }

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
        <button
          type="button"
          className="btn btn-ghost btn-sm tx-card__edit"
          onClick={handleEditClick}
          aria-label="Edit this entry"
        >
          Edit
        </button>
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
      {editing && (
        <EditTransactionDialog
          transaction={transaction}
          unit={unit}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}
