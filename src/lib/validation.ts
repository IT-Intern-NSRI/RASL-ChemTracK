// src/lib/validation.ts
//
// Zod schemas encoding the field requirements already agreed on for this
// project: stock-in and usage each require a different subset of the
// shared 11-column schema. These are fully written (not stubs) since
// they're a direct, unambiguous translation of already-decided
// requirements, the same way the Prisma schema is fully written. The
// business logic that *uses* these schemas (lib/balance.ts, the API
// routes) is left as pseudocode for you to fill in.

import { z } from 'zod';

// Stock-in: Date Received, Supplier Information, Lot/Batch No., and
// Quantity Received are required. Trucker/carrier is optional. Date Used
// is NOT required for stock-in. Balance (Out) is optional — omitting it
// means "auto-compute server-side"; providing it means the user is
// manually overriding the computed figure.
export const stockInSchema = z.object({
  dateReceived: z.string().date().optional(), // defaults to today (Manila) if omitted
  supplierInfo: z.string().min(1),
  truckerCarrier: z.string().optional(),
  lotBatchNo: z.string().min(1),
  quantityReceived: z.number().positive(),
  balanceOut: z.number().optional(),
});
export type StockInInput = z.infer<typeof stockInSchema>;

// Usage: Date Used, Details of Usage, and Quantity Used are required. Work
// Order No. and Lot/Batch No. of used CPECS are optional. Balance (Out) is
// optional — omitting it means "auto-compute as current balance minus
// quantity used"; providing it means a manual override.
export const usageSchema = z.object({
  dateUsed: z.string().date().optional(), // defaults to today (Manila) if omitted
  detailsOfUsage: z.string().min(1),
  workOrderNo: z.string().optional(),
  lotBatchNoUsed: z.string().optional(),
  quantityUsed: z.number().positive(),
  balanceOut: z.number().optional(),
});
export type UsageInput = z.infer<typeof usageSchema>;

// Partial variants, used when editing an existing transaction (only the
// fields being changed are sent).
export const stockInUpdateSchema = stockInSchema.partial();
export const usageUpdateSchema = usageSchema.partial();

export const chemicalCreateSchema = z.object({
  name: z.string().min(1),
  cpecsDescriptor: z.string().min(1),
  category: z.string().optional(),
  unit: z.string().default('L'),
  lowStockThreshold: z.number().nonnegative().optional(),
});
export type ChemicalCreateInput = z.infer<typeof chemicalCreateSchema>;

export const chemicalUpdateSchema = chemicalCreateSchema.partial();
export type ChemicalUpdateInput = z.infer<typeof chemicalUpdateSchema>;

export const appSettingsSchema = z.object({
  organizationName: z.string().optional(),
  registerLabel: z.string().optional(),
  signatoryName: z.string().optional(),
  signatoryCredentials: z.string().optional(),
  signatoryTitle: z.string().optional(),
  newPassword: z.string().min(8).optional(),
});
export type AppSettingsInput = z.infer<typeof appSettingsSchema>;

export const dateRangeSchema = z
  .object({
    startDate: z.string().date(),
    endDate: z.string().date(),
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: 'startDate must be before or equal to endDate',
  });
export type DateRangeInput = z.infer<typeof dateRangeSchema>;
