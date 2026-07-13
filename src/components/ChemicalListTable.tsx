// src/components/ChemicalListTable.tsx
//
// PURE FRONTEND FILE — plain description:
// Read-only table listing chemical summaries: Name, Category, Current
// Balance, Last Activity. Each row links to /chemicals/[id]. Rows where
// currentBalance is at or below lowStockThreshold are visually flagged
// (via the [data-low-stock] CSS hook in globals.css).

import Link from 'next/link';
import { ChemicalSummary } from '@/types';

interface ChemicalListTableProps {
  chemicals: ChemicalSummary[];
}

// def isLowStock(): Input is one ChemicalSummary. Output is one boolean
// (true if lowStockThreshold is set and currentBalance <= it).
// Pseudocode:
//   1. If chemical.lowStockThreshold is null, return false.
//   2. Return chemical.currentBalance <= chemical.lowStockThreshold.
function isLowStock(chemical: ChemicalSummary): boolean {
  if (chemical.lowStockThreshold === null) {
    return false;
  }
  return chemical.currentBalance <= chemical.lowStockThreshold;
}

export function ChemicalListTable({ chemicals }: ChemicalListTableProps) {
  return (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Category</th>
          <th>Current Balance</th>
          <th>Last Activity</th>
        </tr>
      </thead>
      <tbody>
        {chemicals.map((chemical) => (
          <tr key={chemical.id} data-low-stock={isLowStock(chemical)}>
            <td data-label="Name">
              <Link href={`/chemicals/${chemical.id}`}>{chemical.name}</Link>
              {isLowStock(chemical) && <span className="badge badge-low-stock"> Low stock</span>}
            </td>
            <td data-label="Category">{chemical.category ?? '—'}</td>
            <td data-label="Current Balance">
              {chemical.currentBalance} {chemical.unit}
            </td>
            <td data-label="Last Activity">{chemical.lastActivityDate ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
