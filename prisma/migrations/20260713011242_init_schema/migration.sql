-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('STOCK_IN', 'USAGE');

-- CreateTable
CREATE TABLE "Chemical" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cpecsDescriptor" TEXT NOT NULL,
    "category" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'L',
    "currentBalance" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "lowStockThreshold" DECIMAL(14,4),
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chemical_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "chemicalId" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "sequenceNo" INTEGER NOT NULL,
    "dateReceived" DATE,
    "supplierInfo" TEXT,
    "truckerCarrier" TEXT,
    "lotBatchNo" TEXT,
    "quantityReceived" DECIMAL(14,4),
    "dateUsed" DATE,
    "detailsOfUsage" TEXT,
    "workOrderNo" TEXT,
    "lotBatchNoUsed" TEXT,
    "quantityUsed" DECIMAL(14,4),
    "balanceOut" DECIMAL(14,4) NOT NULL,
    "balanceOverridden" BOOLEAN NOT NULL DEFAULT false,
    "isOverdrawn" BOOLEAN NOT NULL DEFAULT false,
    "isAnchor" BOOLEAN NOT NULL DEFAULT false,
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "editHistory" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "organizationName" TEXT,
    "registerLabel" TEXT,
    "signatoryName" TEXT,
    "signatoryCredentials" TEXT,
    "signatoryTitle" TEXT,
    "passwordHash" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurgeLog" (
    "id" TEXT NOT NULL,
    "cutoffDate" DATE NOT NULL,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" JSONB NOT NULL,

    CONSTRAINT "PurgeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurgePreparation" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "cutoffDate" DATE NOT NULL,
    "transactionIdsToDelete" JSONB NOT NULL,
    "anchorTransactionIds" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurgePreparation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Chemical_name_idx" ON "Chemical"("name");

-- CreateIndex
CREATE INDEX "Transaction_chemicalId_sequenceNo_idx" ON "Transaction"("chemicalId", "sequenceNo");

-- CreateIndex
CREATE INDEX "Transaction_chemicalId_dateUsed_idx" ON "Transaction"("chemicalId", "dateUsed");

-- CreateIndex
CREATE INDEX "Transaction_chemicalId_dateReceived_idx" ON "Transaction"("chemicalId", "dateReceived");

-- CreateIndex
CREATE UNIQUE INDEX "PurgePreparation_token_key" ON "PurgePreparation"("token");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_chemicalId_fkey" FOREIGN KEY ("chemicalId") REFERENCES "Chemical"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
