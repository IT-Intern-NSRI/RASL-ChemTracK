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
}

// def handleConfirmClick(): Input is one callback (the onConfirm prop).
// Output is none (side effect: invokes it). Kept as a separate named
// function (rather than an inline arrow in JSX) so it's easy to extend
// later with e.g. a loading state or double-click guard.
// Pseudocode: call onConfirm().
function handleConfirmClick(onConfirm: () => void): void {
  onConfirm();
}

export function ConfirmDialog({ title, message, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="confirm-overlay">
      <div className="confirm-panel" role="dialog" aria-modal="true">
        <h2>{title}</h2>
        <p>{message}</p>
        <div>
          <button onClick={() => handleConfirmClick(onConfirm)}>Confirm</button>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
