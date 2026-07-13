// src/components/SplashScreen.tsx
//
// One-time startup animation that builds the "ChemTrack" wordmark the
// same way the ledger builds a balance: link by link, in sequence. Each
// stage prepends the next fragment (K -> TracK -> ChemTracK), then the
// final stage swaps the capital anchor K for a lowercase k as the
// wordmark "settles" into its resting form — mirroring how a chain
// transaction settles once recalculateChain finishes running.
//
// Shows once per browser session (sessionStorage-gated) and is skipped
// entirely for prefers-reduced-motion. Client component: it reads
// sessionStorage/matchMedia, neither of which exist during SSR, so the
// splash is only ever mounted after the initial client render — the
// server and first client render always agree (no splash), avoiding a
// hydration mismatch.

'use client';

import { useEffect, useState } from 'react';

interface WordmarkStage {
  chem: string;
  track: string;
}

const STAGES: WordmarkStage[] = [
  { chem: '', track: 'K' },
  { chem: '', track: 'TracK' },
  { chem: 'Chem', track: 'TracK' },
  { chem: 'Chem', track: 'Track' },
];

const STEP_MS = 420; // time between each stage advancing
const HOLD_MS = 550; // pause on the finished wordmark before dismissing
const EXIT_MS = 480; // must match the CSS transition duration on .splash

export function SplashScreen({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    let alreadySeen = false;
    try {
      alreadySeen = sessionStorage.getItem('chemtrack:splash-seen') === '1';
    } catch {
      // sessionStorage can throw in some privacy modes — treat as unseen.
    }

    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (alreadySeen || reducedMotion) {
      return;
    }

    setVisible(true);
    try {
      sessionStorage.setItem('chemtrack:splash-seen', '1');
    } catch {
      // Non-fatal — the splash will just replay on the next load.
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i < STAGES.length; i++) {
      timers.push(setTimeout(() => setStageIndex(i), i * STEP_MS));
    }
    const revealDoneAt = (STAGES.length - 1) * STEP_MS;
    timers.push(setTimeout(() => setExiting(true), revealDoneAt + HOLD_MS));
    timers.push(setTimeout(() => setVisible(false), revealDoneAt + HOLD_MS + EXIT_MS));

    return () => timers.forEach(clearTimeout);
  }, []);

  const stage = STAGES[stageIndex];

  return (
    <>
      {visible && (
        <div className={`splash${exiting ? ' splash--exit' : ''}`} role="presentation" aria-hidden="true">
          <div className="splash__mark wordmark wordmark--animated">
            <span className="wordmark-chem" key={`chem-${stage.chem}`}>
              {stage.chem}
            </span>
            <span className="wordmark-track" key={`track-${stage.track}`}>
              {stage.track}
            </span>
          </div>
        </div>
      )}
      {children}
    </>
  );
}
