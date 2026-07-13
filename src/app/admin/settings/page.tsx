// src/app/admin/settings/page.tsx
//
// PURE FRONTEND FILE — plain description:
// Global settings form: Organization Name, Register Label (e.g. "PDEA P
// Register 2-13"), Signatory Name, Signatory Credentials (e.g. "Ph.D.,
// R.Ch."), Signatory Title (e.g. "Pollution Control Officer, NSRI") —
// these print on every exported document's footer. Also includes a
// "Change Password" section. A link to the purge admin page lives here
// too.

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function SettingsPage() {
  const [form, setForm] = useState<Record<string, unknown> | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);

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

  if (!form) return <p>Loading…</p>;

  return (
    <form onSubmit={handleSubmit}>
      <h1>Settings</h1>
      <label>
        Organization Name
        <input
          type="text"
          value={(form.organizationName as string) ?? ''}
          onChange={(e) => setForm({ ...form, organizationName: e.target.value })}
        />
      </label>
      <label>
        Register Label
        <input
          type="text"
          value={(form.registerLabel as string) ?? ''}
          onChange={(e) => setForm({ ...form, registerLabel: e.target.value })}
        />
      </label>
      <label>
        Signatory Name
        <input
          type="text"
          value={(form.signatoryName as string) ?? ''}
          onChange={(e) => setForm({ ...form, signatoryName: e.target.value })}
        />
      </label>
      <label>
        Signatory Credentials
        <input
          type="text"
          value={(form.signatoryCredentials as string) ?? ''}
          onChange={(e) => setForm({ ...form, signatoryCredentials: e.target.value })}
        />
      </label>
      <label>
        Signatory Title
        <input
          type="text"
          value={(form.signatoryTitle as string) ?? ''}
          onChange={(e) => setForm({ ...form, signatoryTitle: e.target.value })}
        />
      </label>
      <label>
        New password (leave blank to keep current)
        <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
      </label>
      {message && <p>{message}</p>}
      <button type="submit">Save</button>
      <p>
        <Link href="/admin/purge">Old-record cleanup →</Link>
      </p>
    </form>
  );
}
