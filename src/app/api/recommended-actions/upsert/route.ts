import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspaceId } from "@/lib/workspace";

const upsertRecommendedActionSchema = z.object({
  externalKey: z.string().min(1),
  contactId: z.string().optional().nullable(),
  dealId: z.string().optional().nullable(),
  taskId: z.string().optional().nullable(),
  actionType: z.string().min(1),
  title: z.string().min(1),
  reason: z.string().min(1),
  evidence: z.array(z.string()).default([]),
  suggestedMessage: z.string().optional().nullable(),
  priority: z.enum(["High", "Medium", "Low"]).default("Medium"),
  score: z.number().int().min(0).max(100),
  confidence: z.number().int().min(0).max(100).default(75),
  dueAt: z.string().datetime(),
  status: z.enum(["open", "snoozed", "done", "dismissed", "stale"]).default("open"),
  snoozedUntil: z.string().datetime().optional().nullable(),
  dismissReason: z.string().optional().nullable(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export async function POST(request: Request) {
  try {
    const db = getPrisma();
    const workspaceId = await getDefaultWorkspaceId();
    const input = upsertRecommendedActionSchema.parse(await request.json());
    const action = await db.recommendedAction.upsert({
      where: { workspaceId_externalKey: { workspaceId, externalKey: input.externalKey } },
      create: {
        workspaceId,
        externalKey: input.externalKey,
        contactId: input.contactId ?? undefined,
        dealId: input.dealId ?? undefined,
        taskId: input.taskId ?? undefined,
        actionType: input.actionType,
        title: input.title,
        reason: input.reason,
        evidence: input.evidence,
        suggestedMessage: input.suggestedMessage ?? undefined,
        priority: input.priority,
        score: input.score,
        confidence: input.confidence,
        dueAt: new Date(input.dueAt),
        status: input.status,
        snoozedUntil: input.snoozedUntil ? new Date(input.snoozedUntil) : undefined,
        dismissReason: input.dismissReason ?? undefined,
        metadata: input.metadata as Prisma.InputJsonValue,
        resolvedAt: ["done", "dismissed", "stale"].includes(input.status) ? new Date() : undefined,
      },
      update: {
        contactId: input.contactId ?? undefined,
        dealId: input.dealId ?? undefined,
        taskId: input.taskId ?? undefined,
        actionType: input.actionType,
        title: input.title,
        reason: input.reason,
        evidence: input.evidence,
        suggestedMessage: input.suggestedMessage ?? undefined,
        priority: input.priority,
        score: input.score,
        confidence: input.confidence,
        dueAt: new Date(input.dueAt),
        status: input.status,
        snoozedUntil: input.snoozedUntil ? new Date(input.snoozedUntil) : null,
        dismissReason: input.dismissReason ?? null,
        metadata: input.metadata as Prisma.InputJsonValue,
        resolvedAt: ["done", "dismissed", "stale"].includes(input.status) ? new Date() : null,
      },
    });

    await writeAudit(
      {
        workspaceId,
        actorType: "agent",
        action: "recommended_action.upserted",
        targetType: "recommended_action",
        targetId: action.id,
        metadata: { externalKey: action.externalKey, status: action.status },
      },
      db,
    );

    return NextResponse.json({ ok: true, action });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Invalid recommended action payload" },
      { status: 400 },
    );
  }
}
