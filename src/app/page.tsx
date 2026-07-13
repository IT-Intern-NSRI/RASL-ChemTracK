// src/app/chemicals/[id]/log-stock-in/page.tsx
//
// PURE FRONTEND FILE — plain description:
// Log-stock-in form for one chemical. Fields: Date Received (defaults to
// today, editable), Supplier Information, Name of trucker/carrier
// (optional), Lot/Batch No., Quantity Received, and Balance (Out) — shown
// live as (current balance + quantity received), editable if overridden.
// Submitting posts the stock-in transaction and returns to the chemical
// detail page. Uses <StockInForm/> for the field layout.
//
// This file is a Server Component so it can `await` the route's params
// Promise (Next.js 15). The interactive form lives in
// LogStockInForm.tsx (a Client Component), which receives the resolved
// id as a plain prop.

import { LogStockInForm } from './LogStockInForm';

interface LogStockInPageProps {
  params: Promise<{ id: string }>;
}

export default async function LogStockInPage({ params }: LogStockInPageProps) {
  const { id } = await params;
  return <LogStockInForm chemicalId={id} />;
}
