// src/components/SplashScreen.tsx
//
// A brief brand-reveal animation shown once per full page load, on top
// of the app (which mounts and initializes underneath it regardless).
// Two beats:
//   1. "K" appears alone.
//   2. "Chemtrac" expands in from K's left edge (a clip-path reveal, not
//      a typewriter/letter-by-letter effect) to complete the wordmark.
// The whole word's layout box is reserved from the very first frame (the
// prefix is just visually clipped, not width:0/display:none), so K never
// jumps or repositions when the prefix reveals — only the reveal itself
// animates.

'use client';

import { useEffect, useState } from 'react';

const K_HOLD_MS = 500;
const REVEAL_DURATION_MS = 650;
const HOLD_AFTER_REVEAL_MS = 500;
const FADE_DURATION_MS = 400;

export function SplashScreen() {
  const [revealed, setRevealed] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    timers.push(setTimeout(() => setRevealed(true), K_HOLD_MS));
    timers.push(
      setTimeout(
        () => setHidden(true),
        K_HOLD_MS + REVEAL_DURATION_MS + HOLD_AFTER_REVEAL_MS
      )
    );
    timers.push(
      setTimeout(
        () => setRemoved(true),
        K_HOLD_MS + REVEAL_DURATION_MS + HOLD_AFTER_REVEAL_MS + FADE_DURATION_MS
      )
    );

    return () => timers.forEach(clearTimeout);
  }, []);

  if (removed) {
    return null;
  }

  return (
    <div className="splash-overlay" data-hidden={hidden} aria-hidden="true">
      <span className="splash-word">
        <span className="splash-word__prefix" data-revealed={revealed}>
          Chemtrac
        </span>
        <span className="splash-word__suffix">K</span>
      </span>
    </div>
  );
}
