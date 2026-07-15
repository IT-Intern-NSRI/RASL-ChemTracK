/*
  Warnings:

  - Added the required column `currentBalanceAfter` to the `Transaction` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "TransactionType" ADD VALUE 'REPLENISH';

-- AlterTable
ALTER TABLE "Chemical" ADD COLUMN     "currentOutBalance" DECIMAL(14,4) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "currentBalanceAfter" DECIMAL(14,4) NOT NULL,
ADD COLUMN     "dateReplenished" DATE,
ADD COLUMN     "quantityReplenished" DECIMAL(14,4),
ADD COLUMN     "replenishNotes" TEXT;

-- CreateIndex
CREATE INDEX "Transaction_chemicalId_dateReplenished_idx" ON "Transaction"("chemicalId", "dateReplenished");
