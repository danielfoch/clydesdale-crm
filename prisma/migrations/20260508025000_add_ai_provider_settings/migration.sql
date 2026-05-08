CREATE TABLE "ai_provider_settings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'openai',
    "apiKey" TEXT,
    "model" TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    "baseUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ai_provider_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ai_provider_settings_workspaceId_provider_key" ON "ai_provider_settings"("workspaceId", "provider");

ALTER TABLE "ai_provider_settings" ADD CONSTRAINT "ai_provider_settings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
