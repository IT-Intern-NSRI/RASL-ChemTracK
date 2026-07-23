// src/components/ConfirmDialog.tsx
//
// PURE FRONTEND FILE — plain description:
// A generic reusable confirmation modal: title, message, Confirm and
// Cancel buttons. Used for archiving a chemical, deleting a transaction,
// and confirming the record purge — anywhere a destructive action needs
// a deliberate second step.

interface ConfirmDialogProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  // Optional: true while an async onConfirm (e.g. an in-flight DELETE
  // request) is running. Disables both buttons and swaps the Confirm
  // label to confirmingLabel, as a double-click/double-submit guard.
  // Omitted (undefined/false) by callers with a synchronous or
  // fire-and-forget onConfirm — fully backward compatible.
  confirming?: boolean;
  confirmLabel?: string;
  confirmingLabel?: string;
}

// def handleConfirmClick(): Input is one callback (the onConfirm prop)
// and one boolean (confirming — whether a confirm is already in flight).
// Output is none (side effect: invokes the callback, but only if a
// confirm isn't already running, guarding against a double click firing
// two overlapping requests).
// Pseudocode: if not confirming, call onConfirm().
function handleConfirmClick(onConfirm: () => void, confirming: boolean): void {
  if (confirming) return;
  onConfirm();
}

export function ConfirmDialog({
  title,
  message,
  onConfirm,
  onCancel,
  confirming = false,
  confirmLabel = 'Confirm',
  confirmingLabel = 'Working…',
}: ConfirmDialogProps) {
  return (
    <div className="dialog-backdrop" onClick={onCancel}>
      <div role="dialog" className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <p>{message}</p>
        <div className="dialog__actions">
          <button onClick={onCancel} className="btn btn-secondary" disabled={confirming}>
            Cancel
          </button>
          <button
            onClick={() => handleConfirmClick(onConfirm, confirming)}
            className="btn btn-danger"
            disabled={confirming}
          >
            {confirming ? confirmingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
