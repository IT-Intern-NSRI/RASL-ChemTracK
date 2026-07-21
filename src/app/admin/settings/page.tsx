// src/app/admin/settings/page.tsx
//
// PURE FRONTEND FILE — plain description:
// Global settings form: Organization Name, Register Label (e.g. "PDEA P
// Register 2-13"), Signatory Name, Signatory Credentials (e.g. "Ph.D.,
// R.Ch."), Signatory Title (e.g. "Pollution Control Officer, NSRI"), and
// an E-Signature upload — these print on every exported document's
// footer, with the signature image appearing over the signatory name.
// Also includes a "Change Password" section. A link to the purge admin
// page lives here too.

'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

const MAX_SIGNATURE_BYTES = 1_500_000; // ~1.5MB, comfortably under the API's cap once base64-encoded

// def readFileAsDataUrl(): Input is one File. Output is a Promise
// resolving to that file's contents as a base64 data URL string.
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function SettingsPage() {
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [signatureError, setSignatureError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // def loadSettings(): Input is none. Output is none (side effect:
  // fetches GET /api/settings and calls setForm() with the result). Runs
  // once on mount via useEffect.
  // Pseudocode:
  //   1. Fetch GET /api/settings.
  //   2. Parse JSON, call setForm(parsed).
  async function loadSettings(): Promise<void> {
    const response = await fetch('/api/settings');
    const parsed = await response.json();
    setForm(parsed);
  }

  useEffect(() => {
    loadSettings();
  }, []);

  // def handleSignatureFileChange(): Input is one file input change event.
  // Output is none (side effect: reads the selected image as a base64 data
  // URL and stores it on form.signatureImage, or sets signatureError if the
  // file isn't an image or is too large).
  // Pseudocode:
  //   1. Grab the selected file; bail if none.
  //   2. Reject non-image files and files over MAX_SIGNATURE_BYTES.
  //   3. Read the file as a data URL and store it on form.signatureImage.
  async function handleSignatureFileChange(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    setSignatureError(null);

    if (!file.type.startsWith('image/')) {
      setSignatureError('Please upload an image file (PNG or JPG).');
      return;
    }
    if (file.size > MAX_SIGNATURE_BYTES) {
      setSignatureError('Image is too large. Please upload a file under 1.5MB.');
      return;
    }

    const dataUrl = await readFileAsDataUrl(file);
    setForm((prev) => (prev ? { ...prev, signatureImage: dataUrl } : prev));
  }

  // def handleRemoveSignature(): Input is none. Output is none (side
  // effect: clears form.signatureImage so the next Save removes it).
  function handleRemoveSignature(): void {
    setSignatureError(null);
    setForm((prev) => (prev ? { ...prev, signatureImage: null } : prev));
  }

  // def handleSubmit(): Input is one form submit event. Output is none
  // (side effect: PATCHes /api/settings with the form fields plus
  // newPassword if provided, then shows a success message).
  // Pseudocode:
  //   1. event.preventDefault().
  //   2. PATCH { ...form, newPassword: newPassword || undefined } as JSON
  //      to /api/settings.
  //   3. On success, setMessage('Saved.') and clear newPassword.
  //   4. On failure, setMessage with the error.
  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();

    const response = await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, newPassword: newPassword || undefined }),
    });

    if (response.ok) {
      setMessage('Saved.');
      setNewPassword('');
    } else {
      const body = await response.json().catch(() => null);
      setMessage(body?.error ?? 'Failed to save settings.');
    }
  }

  if (!form) return <p className="loading-state">Loading…</p>;

  return (
    <div className="page page--narrow">
      <div className="page-header">
        <h1>Settings</h1>
      </div>
      <div className="card">
        <form onSubmit={handleSubmit} className="form">
          <label className="field">
            Organization Name
            <input
              type="text"
              value={(form.organizationName as string) ?? ''}
              onChange={(e) => setForm({ ...form, organizationName: e.target.value })}
            />
          </label>
          <label className="field">
            Register Label
            <input
              type="text"
              value={(form.registerLabel as string) ?? ''}
              onChange={(e) => setForm({ ...form, registerLabel: e.target.value })}
            />
          </label>
          <label className="field">
            Signatory Name
            <input
              type="text"
              value={(form.signatoryName as string) ?? ''}
              onChange={(e) => setForm({ ...form, signatoryName: e.target.value })}
            />
          </label>
          <label className="field">
            Signatory Credentials
            <input
              type="text"
              value={(form.signatoryCredentials as string) ?? ''}
              onChange={(e) => setForm({ ...form, signatoryCredentials: e.target.value })}
            />
          </label>
          <label className="field">
            Signatory Title
            <input
              type="text"
              value={(form.signatoryTitle as string) ?? ''}
              onChange={(e) => setForm({ ...form, signatoryTitle: e.target.value })}
            />
          </label>
          <div className="field">
            E-Signature
            <p className="form-message" style={{ margin: '-0.15rem 0 0.25rem' }}>
              Appears over the signatory name on exported PDFs. PNG with a transparent
              background works best.
            </p>
            {form.signatureImage ? (
              <div className="signature-preview">
                <img src={form.signatureImage as string} alt="Uploaded e-signature" />
                <div className="signature-preview__actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={handleRemoveSignature}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                style={{ alignSelf: 'flex-start' }}
                onClick={() => fileInputRef.current?.click()}
              >
                Upload signature image
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              onChange={handleSignatureFileChange}
              style={{ display: 'none' }}
            />
            {signatureError && <p className="form-error">{signatureError}</p>}
          </div>
          <label className="field">
            New password (leave blank to keep current)
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </label>
          {message && <p className="form-message">{message}</p>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Save
            </button>
          </div>
        </form>
      </div>
      <p>
        <Link href="/admin/purge">Old-record cleanup →</Link>
      </p>
    </div>
  );
}
