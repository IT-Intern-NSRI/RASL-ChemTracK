// src/app/chemicals/[id]/log-replenish/page.tsx
//
// PURE FRONTEND FILE — plain description:
// Log-replenish form for one chemical: moving quantity from bulk stock
// into the smaller day-to-day working container. Fields: Date
// Replenished (defaults to today, editable), Quantity Replenished, an
// optional Notes field, and Balance (Out) — shown live as (current Out
// Balance + quantity replenished) while the user types, editable if they
// want to override it. Submitting posts the replenish transaction and
// returns to the chemical detail page. Distinct from Stock-In (newly
// purchased/received stock) — a Replenish only affects the "Current Out
// Balance", never the "Current Balance" (total inventory), and never
// appears in the exported PDF. Uses <ReplenishForm/> for the field
// layout.
//
// This file is a Server Component so it can `await` the route's params
// Promise (Next.js 15). The interactive form lives in
// LogReplenishForm.tsx (a Client Component), which receives the resolved
// id as a plain prop.

import { LogReplenishForm } from './LogReplenishForm';

interface LogReplenishPageProps {
  params: Promise<{ id: string }>;
}

export default async function LogReplenishPage({ params }: LogReplenishPageProps) {
  const { id } = await params;
  return <LogReplenishForm chemicalId={id} />;
}
