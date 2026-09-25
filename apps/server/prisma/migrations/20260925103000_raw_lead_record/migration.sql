-- CreateTable
CREATE TABLE "RawLeadRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "fixtureId" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RawLeadRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RawLeadRecord_tenantId_idx" ON "RawLeadRecord"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "RawLeadRecord_tenantId_source_externalId_key" ON "RawLeadRecord"("tenantId", "source", "externalId");

-- AddForeignKey
ALTER TABLE "RawLeadRecord" ADD CONSTRAINT "RawLeadRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
