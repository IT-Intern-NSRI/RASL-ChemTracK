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

// Replenish: moves quantity from bulk stock into the smaller day-to-day
// working container. Distinct from a Stock-In (newly purchased/received
// stock) — a Replenish only affects the "Current Out Balance", never the
// "Current Balance" (total inventory). Replenish logs are never shown in
// the exported PDF. Date Replenished and Quantity Replenished are
// required; Notes is optional. Balance (Out) is optional — omitting it
// means "auto-compute as current Out Balance plus quantity replenished";
// providing it means a manual override.
export const replenishSchema = z.object({
  dateReplenished: z.string().date().optional(), // defaults to today (Manila) if omitted
  quantityReplenished: z.number().positive(),
  replenishNotes: z.string().optional(),
  balanceOut: z.number().optional(),
});
export type ReplenishInput = z.infer<typeof replenishSchema>;

// Partial variants, used when editing an existing transaction (only the
// fields being changed are sent).
export const stockInUpdateSchema = stockInSchema.partial();
export const usageUpdateSchema = usageSchema.partial();
export const replenishUpdateSchema = replenishSchema.partial();

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

// Used by both export endpoints (single-chemical PDF and bulk ZIP).
// `startDate`/`endDate` are always resolved, concrete "YYYY-MM-DD"
// calendar-day boundaries by the time they reach the server — in "Month
// Selection" mode (the only mode the UI exposes) the client resolves the
// chosen start/end months into the 1st of the start month and the last
// day of the end month before sending the request. `rangeType` is
// carried through separately: it picks the PDF's whole pagination
// strategy (one page per calendar month, with per-month Initial
// Stock/OUT/Balance Forwarded figures and empty-day fill, for 'month';
// the original fixed-23-rows-per-page/range-wide-balances layout for
// 'date') as well as the header's date-range label format. Defaults to
// 'month' since every export entry point in the app now only offers
// Month Selection; 'date' is kept fully functional for other callers
// (the 5-year purge's backup ZIP explicitly requests it, since its date
// range isn't month-aligned — see lib/purge.ts).
export const exportRangeSchema = z
  .object({
    startDate: z.string().date(),
    endDate: z.string().date(),
    rangeType: z.enum(['date', 'month']).optional().default('month'),
  })
  .refine((data) => data.startDate <= data.endDate, {
    message: 'startDate must be before or equal to endDate',
  });
export type ExportRangeInput = z.infer<typeof exportRangeSchema>;
