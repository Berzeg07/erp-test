-- AlterTable
ALTER TABLE "LeadCase" ADD COLUMN "score" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "LeadCase" ADD COLUMN "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "LeadCase" ADD COLUMN "policyVersion" TEXT NOT NULL DEFAULT 'rules-v1';

-- CreateTable
CREATE TABLE "DecisionRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadCaseId" TEXT NOT NULL,
    "policyVersion" TEXT NOT NULL,
    "status" "LeadCaseStatus" NOT NULL,
    "deliveryGuard" "DeliveryGuard" NOT NULL,
    "deliveryGuardReason" TEXT,
    "score" INTEGER NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "reasons" JSONB NOT NULL,
    "evidenceRefs" JSONB NOT NULL,
    "ruleOutput" JSONB NOT NULL,
    "llmOutput" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DecisionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DecisionRecord_leadCaseId_key" ON "DecisionRecord"("leadCaseId");

-- CreateIndex
CREATE INDEX "DecisionRecord_tenantId_idx" ON "DecisionRecord"("tenantId");

-- AddForeignKey
ALTER TABLE "DecisionRecord" ADD CONSTRAINT "DecisionRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecisionRecord" ADD CONSTRAINT "DecisionRecord_leadCaseId_fkey" FOREIGN KEY ("leadCaseId") REFERENCES "LeadCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
