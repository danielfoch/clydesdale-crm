-- CreateTable
CREATE TABLE "recommended_actions" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "externalKey" TEXT NOT NULL,
    "contactId" TEXT,
    "dealId" TEXT,
    "taskId" TEXT,
    "actionType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "suggestedMessage" TEXT,
    "priority" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "confidence" INTEGER NOT NULL DEFAULT 75,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "snoozedUntil" TIMESTAMP(3),
    "dismissReason" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recommended_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recommended_actions_workspaceId_status_dueAt_idx" ON "recommended_actions"("workspaceId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "recommended_actions_workspaceId_score_idx" ON "recommended_actions"("workspaceId", "score");

-- CreateIndex
CREATE UNIQUE INDEX "recommended_actions_workspaceId_externalKey_key" ON "recommended_actions"("workspaceId", "externalKey");

-- AddForeignKey
ALTER TABLE "recommended_actions" ADD CONSTRAINT "recommended_actions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommended_actions" ADD CONSTRAINT "recommended_actions_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommended_actions" ADD CONSTRAINT "recommended_actions_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recommended_actions" ADD CONSTRAINT "recommended_actions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
