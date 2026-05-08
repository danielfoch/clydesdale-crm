ALTER TABLE "campaign_steps" ADD COLUMN "title" TEXT;
ALTER TABLE "campaign_steps" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "campaign_enrollments" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "campaign_enrollments" ADD COLUMN "pausedAt" TIMESTAMP(3);
ALTER TABLE "campaign_enrollments" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "campaign_enrollments" ADD COLUMN "exitedAt" TIMESTAMP(3);
