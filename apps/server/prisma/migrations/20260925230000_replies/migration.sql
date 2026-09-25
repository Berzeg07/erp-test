-- CreateTable
CREATE TABLE "InboundReply" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadCaseId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InboundReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagerTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadCaseId" TEXT NOT NULL,
    "replyId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManagerTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadCaseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadCaseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InboundReply_tenantId_leadCaseId_type_key" ON "InboundReply"("tenantId", "leadCaseId", "type");

-- CreateIndex
CREATE INDEX "InboundReply_tenantId_idx" ON "InboundReply"("tenantId");

-- CreateIndex
CREATE INDEX "InboundReply_leadCaseId_idx" ON "InboundReply"("leadCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "ManagerTask_tenantId_type_leadCaseId_key" ON "ManagerTask"("tenantId", "type", "leadCaseId");

-- CreateIndex
CREATE INDEX "ManagerTask_tenantId_idx" ON "ManagerTask"("tenantId");

-- CreateIndex
CREATE INDEX "ManagerTask_leadCaseId_idx" ON "ManagerTask"("leadCaseId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_tenantId_leadCaseId_key" ON "PaymentEvent"("tenantId", "leadCaseId");

-- CreateIndex
CREATE INDEX "PaymentEvent_tenantId_idx" ON "PaymentEvent"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingEvent_tenantId_leadCaseId_key" ON "MeetingEvent"("tenantId", "leadCaseId");

-- CreateIndex
CREATE INDEX "MeetingEvent_tenantId_idx" ON "MeetingEvent"("tenantId");

-- AddForeignKey
ALTER TABLE "InboundReply" ADD CONSTRAINT "InboundReply_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboundReply" ADD CONSTRAINT "InboundReply_leadCaseId_fkey" FOREIGN KEY ("leadCaseId") REFERENCES "LeadCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerTask" ADD CONSTRAINT "ManagerTask_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerTask" ADD CONSTRAINT "ManagerTask_leadCaseId_fkey" FOREIGN KEY ("leadCaseId") REFERENCES "LeadCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManagerTask" ADD CONSTRAINT "ManagerTask_replyId_fkey" FOREIGN KEY ("replyId") REFERENCES "InboundReply"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_leadCaseId_fkey" FOREIGN KEY ("leadCaseId") REFERENCES "LeadCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingEvent" ADD CONSTRAINT "MeetingEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingEvent" ADD CONSTRAINT "MeetingEvent_leadCaseId_fkey" FOREIGN KEY ("leadCaseId") REFERENCES "LeadCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
