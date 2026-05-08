CREATE TABLE "motivation_quotes" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'User',
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "downvotes" INTEGER NOT NULL DEFAULT 0,
    "submittedBy" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "motivation_quotes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "motivation_quotes_workspaceId_text_key" ON "motivation_quotes"("workspaceId", "text");
CREATE INDEX "motivation_quotes_workspaceId_isActive_idx" ON "motivation_quotes"("workspaceId", "isActive");

ALTER TABLE "motivation_quotes" ADD CONSTRAINT "motivation_quotes_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
