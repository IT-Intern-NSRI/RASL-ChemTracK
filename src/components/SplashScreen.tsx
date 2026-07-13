// src/components/SplashScreen.tsx
//
// A brief brand-reveal animation shown once per full page load, on top
// of the app (which mounts and initializes underneath it regardless).
// Builds the wordmark in stages — K -> TracK -> ChemTracK -> ChemTrack —
// each stage's newly-added letters sliding/fading in from the left, then
// fades the whole overlay out to reveal the app.

'use client';

import { useEffect, useState } from 'react';

// Each stage as { prefix, suffix }. `prefix` renders in the body text
// color, `suffix` in the accent color — together they always spell out
// the current stage of the wordmark. The final stage lowercases the
// trailing "k" to land on the real wordmark, "ChemTrack".
const STAGES: Array<{ prefix: string; suffix: string }> = [
  { prefix: '', suffix: 'K' },
  { prefix: '', suffix: 'TracK' },
  { prefix: 'Chem', suffix: 'TracK' },
  { prefix: 'Chem', suffix: 'Track' },
];

const STAGE_DURATION_MS = 480;
const HOLD_DURATION_MS = 500;
const FADE_DURATION_MS = 400;

export function SplashScreen() {
  const [stageIndex, setStageIndex] = useState(0);
  const [hidden, setHidden] = useState(false);
  const [removed, setRemoved] = useState(false);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];

    STAGES.forEach((_, index) => {
      if (index === 0) return;
      timers.push(
        setTimeout(() => setStageIndex(index), index * STAGE_DURATION_MS)
      );
    });

    const totalStageTime = (STAGES.length - 1) * STAGE_DURATION_MS;
    timers.push(setTimeout(() => setHidden(true), totalStageTime + HOLD_DURATION_MS));
    timers.push(
      setTimeout(
        () => setRemoved(true),
        totalStageTime + HOLD_DURATION_MS + FADE_DURATION_MS
      )
    );

    return () => timers.forEach(clearTimeout);
  }, []);

  if (removed) {
    return null;
  }

  const stage = STAGES[stageIndex];

  return (
    <div className="splash-overlay" data-hidden={hidden} aria-hidden="true">
      <span className="splash-word">
        <span className="splash-word__prefix">
          <Letters text={stage.prefix} keyPrefix={`prefix-${stageIndex}`} />
        </span>
        <span className="splash-word__suffix">
          <Letters text={stage.suffix} keyPrefix={`suffix-${stageIndex}`} />
        </span>
      </span>
    </div>
  );
}

function Letters({ text, keyPrefix }: { text: string; keyPrefix: string }) {
  return (
    <span className="splash-letters">
      {text.split('').map((char, i) => (
        <span
          key={`${keyPrefix}-${i}`}
          className="splash-letter"
          style={{ animationDelay: `${i * 0.02}s` }}
        >
          {char}
        </span>
      ))}
    </span>
  );
}
