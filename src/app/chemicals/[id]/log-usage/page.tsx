// src/app/chemicals/[id]/log-usage/page.tsx
//
// PURE FRONTEND FILE — plain description:
// Log-usage form for one chemical. Fields: Date Used (defaults to today,
// editable), Details of Usage, Work Order No. (optional), Lot/Batch No.
// of used CPECS (optional), Quantity Used, and Balance (Out) — shown live
// as (current balance - quantity used) while the user types, editable if
// they want to override it. Submitting posts the usage transaction and
// returns to the chemical detail page. Uses <UsageForm/> for the field
// layout.
//
// This file is a Server Component so it can `await` the route's params
// Promise (Next.js 15). The interactive form lives in LogUsageForm.tsx
// (a Client Component), which receives the resolved id as a plain prop.

import { LogUsageForm } from './LogUsageForm';

interface LogUsagePageProps {
  params: Promise<{ id: string }>;
}

export default async function LogUsagePage({ params }: LogUsagePageProps) {
  const { id } = await params;
  return <LogUsageForm chemicalId={id} />;
}
