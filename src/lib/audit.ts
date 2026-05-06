import type { Prisma } from "@prisma/client";
import { getPrisma, type DbClient } from "./prisma";

type AuditInput = {
  workspaceId: string;
  actorType: string;
  actorId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
};

export async function writeAudit(input: AuditInput, db: DbClient = getPrisma()) {
  return db.auditLog.create({
    data: {
      workspaceId: input.workspaceId,
      actorType: input.actorType,
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata ?? {},
    },
  });
}
