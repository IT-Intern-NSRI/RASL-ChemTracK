// src/components/TransactionCard.tsx
//
// PURE FRONTEND FILE — plain description:
// A single collapsible card representing one transaction. Collapsed
// state shows: date, a type badge ("Stock-In" in green / "Usage" in blue
// / "Replenish" in purple), the quantity delta (+X or -X, blank delta
// symbol for replenish since it's an internal transfer rather than
// inventory in/out), the resulting Out Balance, and small "Edit"/"Delete"
// buttons. Expanded state additionally shows whichever fields are
// populated for that type (supplier info / trucker / lot-batch /
// quantity received for stock-in; details of usage / work order /
// lot-batch used / quantity used for usage; quantity replenished / notes
// for replenish). An overdrawn usage entry is visually flagged via the
// [data-overdrawn] CSS hook in globals.css.
//
// Local state covers opening <EditTransactionDialog/> (see that
// component's header comment for how an edit here safely cascades
// through every dependent balance computation) and the delete flow (see
// handleConfirmDelete() below — deletion cascades through the exact same
// server-side recalculateChain() as an edit, via DELETE
// /api/transactions/[id] -> lib/balance.ts's deleteTransaction()). The
// edit/delete buttons stop their clicks from bubbling to the card's own
// onToggle handler, so opening the editor/confirm dialog doesn't also
// expand/collapse the card underneath it.
//
// Anchor rows (transaction.isAnchor === true — the single pre-cutoff row
// per chemical retained by a past 5-year purge, see lib/purge.ts) can't
// be deleted: the server's deleteTransaction() rejects it outright,
// because that row is the only remaining evidence of the chemical's
// balance right before the purge cutoff, and losing it would silently
// reset every later Current Balance / Current Out Balance (and every
// export's Initial Stock / Balance Forwarded figures) to a wrong,
// zeroed-out starting point. The Delete button is disabled up front for
// these rows (with an explanatory title tooltip) so this is normally
// never even attempted, but handleConfirmDelete() still surfaces the
// server's error message if it somehow is (e.g. a purge completing in
// another tab between page load and the click).

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { TransactionDTO } from '@/types';
import { EditTransactionDialog } from './EditTransactionDialog';
import { ConfirmDialog } from './ConfirmDialog';

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
  const router = useRouter();
  const { type } = transaction;
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  // def handleDeleteClick(): Input is one mouse event (the Delete
  // button's click). Output is none (side effects: stops the click from
  // bubbling up to the card's own onToggle handler, clears any stale
  // error from a previous attempt, then opens the confirm dialog).
  // Pseudocode:
  //   1. event.stopPropagation().
  //   2. setDeleteError(null).
  //   3. setConfirmingDelete(true).
  function handleDeleteClick(event: React.MouseEvent): void {
    event.stopPropagation();
    setDeleteError(null);
    setConfirmingDelete(true);
  }

  // def handleConfirmDelete(): Input is none (reads transaction.id from
  // closure). Output is a Promise resolving to none (side effects: DELETEs
  // /api/transactions/[id]; on success, closes the confirm dialog and
  // calls router.refresh() so every dependent figure on the page — this
  // card's removal, later cards' Balance (Out) values recalculated by the
  // server's recalculateChain(), and the page header's Current Balance /
  // Current Out Balance — reflects the server's recalculated chain; on
  // failure (e.g. this turned out to be an anchor row, or the row was
  // already deleted elsewhere), keeps the confirm dialog open and shows
  // the server's error message inline instead of silently closing).
  // Pseudocode:
  //   1. setDeleting(true); setDeleteError(null).
  //   2. DELETE /api/transactions/${transaction.id}.
  //   3. On response.ok: setConfirmingDelete(false), router.refresh().
  //   4. Else: parse the error body and setDeleteError() (dialog stays
  //      open so the message is visible next to the Confirm/Cancel
  //      buttons).
  //   5. Always setDeleting(false) at the end.
  async function handleConfirmDelete(): Promise<void> {
    setDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/transactions/${transaction.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setConfirmingDelete(false);
        router.refresh();
      } else {
        const body = await response.json().catch(() => null);
        setDeleteError(body?.error ?? 'Failed to delete this entry');
      }
    } finally {
      setDeleting(false);
    }
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
        <button
          type="button"
          className="btn btn-danger btn-sm tx-card__delete"
          onClick={handleDeleteClick}
          disabled={transaction.isAnchor}
          title={
            transaction.isAnchor
              ? 'This entry preserves the opening balance from before a past purge and cannot be deleted.'
              : undefined
          }
          aria-label="Delete this entry"
        >
          Delete
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
      {confirmingDelete && (
        <div onClick={(e) => e.stopPropagation()}>
          <ConfirmDialog
            title="Delete this entry?"
            message={
              deleteError ??
              `This permanently removes this ${BADGE_LABEL[type].toLowerCase()} entry and recalculates every later Balance (Out) / Current Balance figure for this chemical. This can't be undone.`
            }
            confirming={deleting}
            confirmLabel="Delete"
            confirmingLabel="Deleting…"
            onConfirm={handleConfirmDelete}
            onCancel={() => {
              setConfirmingDelete(false);
              setDeleteError(null);
            }}
          />
        </div>
      )}
    </div>
  );
}
