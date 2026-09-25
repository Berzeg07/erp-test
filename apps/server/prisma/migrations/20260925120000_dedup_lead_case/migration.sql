-- CreateEnum
CREATE TYPE "LeadCaseStatus" AS ENUM ('QUALIFY', 'REJECT', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "DeliveryGuard" AS ENUM ('CLEAR', 'BLOCKED');

-- CreateTable
CREATE TABLE "Person" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "identityKey" TEXT NOT NULL,
    "emailNormalized" TEXT,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Person_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameNormalized" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyDomain" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,

    CONSTRAINT "CompanyDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyExternalId" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,

    CONSTRAINT "CompanyExternalId_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyContact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadCase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "companyContactId" TEXT NOT NULL,
    "status" "LeadCaseStatus" NOT NULL DEFAULT 'MANUAL_REVIEW',
    "deliveryGuard" "DeliveryGuard" NOT NULL DEFAULT 'CLEAR',
    "mergeBy" TEXT NOT NULL DEFAULT 'none',
    "conflicts" JSONB NOT NULL,
    "reasons" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadCase_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "RawLeadRecord" ADD COLUMN "leadCaseId" TEXT;

-- CreateIndex
CREATE INDEX "Person_tenantId_idx" ON "Person"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Person_tenantId_identityKey_key" ON "Person"("tenantId", "identityKey");

-- CreateIndex
CREATE INDEX "Company_tenantId_idx" ON "Company"("tenantId");

-- CreateIndex
CREATE INDEX "Company_tenantId_nameNormalized_idx" ON "Company"("tenantId", "nameNormalized");

-- CreateIndex
CREATE INDEX "CompanyDomain_companyId_idx" ON "CompanyDomain"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyDomain_tenantId_domain_key" ON "CompanyDomain"("tenantId", "domain");

-- CreateIndex
CREATE INDEX "CompanyExternalId_tenantId_externalId_idx" ON "CompanyExternalId"("tenantId", "externalId");

-- CreateIndex
CREATE INDEX "CompanyExternalId_companyId_idx" ON "CompanyExternalId"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyExternalId_tenantId_source_externalId_key" ON "CompanyExternalId"("tenantId", "source", "externalId");

-- CreateIndex
CREATE INDEX "CompanyContact_tenantId_idx" ON "CompanyContact"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyContact_tenantId_personId_companyId_key" ON "CompanyContact"("tenantId", "personId", "companyId");

-- CreateIndex
CREATE INDEX "LeadCase_tenantId_idx" ON "LeadCase"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "LeadCase_tenantId_personId_companyId_key" ON "LeadCase"("tenantId", "personId", "companyId");

-- CreateIndex
CREATE INDEX "RawLeadRecord_leadCaseId_idx" ON "RawLeadRecord"("leadCaseId");

-- AddForeignKey
ALTER TABLE "Person" ADD CONSTRAINT "Person_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyDomain" ADD CONSTRAINT "CompanyDomain_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyExternalId" ADD CONSTRAINT "CompanyExternalId_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyContact" ADD CONSTRAINT "CompanyContact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyContact" ADD CONSTRAINT "CompanyContact_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyContact" ADD CONSTRAINT "CompanyContact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCase" ADD CONSTRAINT "LeadCase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCase" ADD CONSTRAINT "LeadCase_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCase" ADD CONSTRAINT "LeadCase_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadCase" ADD CONSTRAINT "LeadCase_companyContactId_fkey" FOREIGN KEY ("companyContactId") REFERENCES "CompanyContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawLeadRecord" ADD CONSTRAINT "RawLeadRecord_leadCaseId_fkey" FOREIGN KEY ("leadCaseId") REFERENCES "LeadCase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
