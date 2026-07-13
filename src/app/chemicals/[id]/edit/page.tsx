// src/app/chemicals/[id]/edit/page.tsx
//
// PURE FRONTEND FILE — plain description:
// A form pre-filled with the chemical's current metadata (Name, CPECS
// descriptor, Category, Unit, Low-stock threshold), with a Save button
// and a separate "Archive this chemical" action (soft-delete — hides it
// from the default dashboard view but keeps its full history for
// export).
//
// This file is a Server Component so it can `await` the route's params
// Promise (Next.js 15). The interactive form lives in EditChemicalForm.tsx
// (a Client Component), which receives the resolved id as a plain prop.

import { EditChemicalForm } from './EditChemicalForm';

interface EditChemicalPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditChemicalPage({ params }: EditChemicalPageProps) {
  const { id } = await params;
  return <EditChemicalForm chemicalId={id} />;
}
