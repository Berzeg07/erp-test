-- CreateTable
CREATE TABLE "CrmCompany" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmContact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "emailNormalized" TEXT NOT NULL,
    "displayName" TEXT,
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmDeal" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadCaseId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmDeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadCaseId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmOutbox" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadCaseId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastFault" TEXT,
    "companyId" TEXT,
    "contactId" TEXT,
    "dealId" TEXT,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DlqItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "outboxId" TEXT NOT NULL,
    "leadCaseId" TEXT NOT NULL,
    "fault" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DlqItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CrmCompany_tenantId_domain_key" ON "CrmCompany"("tenantId", "domain");

-- CreateIndex
CREATE INDEX "CrmCompany_tenantId_idx" ON "CrmCompany"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmContact_tenantId_emailNormalized_key" ON "CrmContact"("tenantId", "emailNormalized");

-- CreateIndex
CREATE INDEX "CrmContact_tenantId_idx" ON "CrmContact"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmDeal_tenantId_leadCaseId_key" ON "CrmDeal"("tenantId", "leadCaseId");

-- CreateIndex
CREATE INDEX "CrmDeal_tenantId_idx" ON "CrmDeal"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmTask_tenantId_type_leadCaseId_key" ON "CrmTask"("tenantId", "type", "leadCaseId");

-- CreateIndex
CREATE INDEX "CrmTask_tenantId_idx" ON "CrmTask"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CrmOutbox_leadCaseId_key" ON "CrmOutbox"("leadCaseId");

-- CreateIndex
CREATE INDEX "CrmOutbox_tenantId_idx" ON "CrmOutbox"("tenantId");

-- CreateIndex
CREATE INDEX "DlqItem_tenantId_idx" ON "DlqItem"("tenantId");

-- CreateIndex
CREATE INDEX "DlqItem_outboxId_idx" ON "DlqItem"("outboxId");

-- AddForeignKey
ALTER TABLE "CrmCompany" ADD CONSTRAINT "CrmCompany_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmContact" ADD CONSTRAINT "CrmContact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmContact" ADD CONSTRAINT "CrmContact_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CrmCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_leadCaseId_fkey" FOREIGN KEY ("leadCaseId") REFERENCES "LeadCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "CrmCompany"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmDeal" ADD CONSTRAINT "CrmDeal_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "CrmContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_leadCaseId_fkey" FOREIGN KEY ("leadCaseId") REFERENCES "LeadCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmOutbox" ADD CONSTRAINT "CrmOutbox_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmOutbox" ADD CONSTRAINT "CrmOutbox_leadCaseId_fkey" FOREIGN KEY ("leadCaseId") REFERENCES "LeadCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DlqItem" ADD CONSTRAINT "DlqItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DlqItem" ADD CONSTRAINT "DlqItem_outboxId_fkey" FOREIGN KEY ("outboxId") REFERENCES "CrmOutbox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
