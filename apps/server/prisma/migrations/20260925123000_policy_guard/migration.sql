-- CreateEnum
CREATE TYPE "ProcessingBasis" AS ENUM ('CONSENT', 'DOCUMENTED_LEGITIMATE_INTEREST', 'UNKNOWN', 'PROHIBITED');

-- AlterTable
ALTER TABLE "LeadCase" ADD COLUMN "deliveryGuardReason" TEXT;
ALTER TABLE "LeadCase" ADD COLUMN "processingBasis" "ProcessingBasis" NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "LeadCase" ADD COLUMN "processingBasisEvidenceRefs" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "LeadCase" ADD COLUMN "sourcePurpose" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "SuppressionEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SuppressionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SuppressionEntry_tenantId_idx" ON "SuppressionEntry"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SuppressionEntry_tenantId_emailNormalized_key" ON "SuppressionEntry"("tenantId", "emailNormalized");

-- AddForeignKey
ALTER TABLE "SuppressionEntry" ADD CONSTRAINT "SuppressionEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
