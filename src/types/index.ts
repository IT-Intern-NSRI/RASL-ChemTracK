// src/types/index.ts
//
// Shared TypeScript types used across API routes and frontend components.
// Fully written (declarative) — these mirror decisions already made
// elsewhere in the project, not open business logic.

export interface ChemicalSummary {
  id: string;
  name: string;
  cpecsDescriptor: string;
  category: string | null;
  unit: string;
  currentBalance: number;
  currentOutBalance: number;
  lowStockThreshold: number | null;
  isArchived: boolean;
  lastActivityDate: string | null; // "YYYY-MM-DD", derived from the latest transaction
}

export interface TransactionDTO {
  id: string;
  chemicalId: string;
  type: 'STOCK_IN' | 'USAGE' | 'REPLENISH';
  sequenceNo: number;
  dateReceived: string | null;
  supplierInfo: string | null;
  truckerCarrier: string | null;
  lotBatchNo: string | null;
  quantityReceived: number | null;
  dateUsed: string | null;
  detailsOfUsage: string | null;
  workOrderNo: string | null;
  lotBatchNoUsed: string | null;
  quantityUsed: number | null;
  dateReplenished: string | null;
  quantityReplenished: number | null;
  replenishNotes: string | null;
  balanceOut: number; // running "Current Out Balance" after this row
  currentBalanceAfter: number; // running "Current Balance" (total inventory) after this row
  balanceOverridden: boolean;
  isOverdrawn: boolean;
  isAnchor: boolean;
}

export interface ExportDateRange {
  startDate: string; // "YYYY-MM-DD"
  endDate: string;
}

export interface PurgePreparationResponse {
  purgeToken: string;
  summary: {
    cutoffDate: string;
    chemicalsAffected: number;
    totalRowsToDelete: number;
    perChemical: Array<{ chemicalId: string; chemicalName: string; rowsToDelete: number }>;
  };
}
