// src/app/login/page.tsx
//
// PURE FRONTEND FILE — plain description:
// A single centered form with one password field and a submit button. On
// successful login, redirects to the dashboard ("/"). On failure, shows
// an inline error message ("Incorrect password") without navigating away.

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // def handleSubmit(): Input is one form submit event. Output is none
  // (side effect: navigates to "/" on success, or sets `error` on
  // failure).
  // Pseudocode:
  //   1. event.preventDefault().
  //   2. POST { password } as JSON to /api/auth/login.
  //   3. If response.ok, router.push('/').
  //   4. Else, set error to a friendly message ("Incorrect password").
  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });

    if (response.ok) {
      router.push('/');
    } else {
      setError('Incorrect password');
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>
          Chem<span style={{ color: 'var(--color-accent)' }}>Track</span>
        </h1>
        <form onSubmit={handleSubmit} className="form">
          <label className="field">
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <div className="form-actions">
            <button type="submit" className="btn btn-primary">
              Log in
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
