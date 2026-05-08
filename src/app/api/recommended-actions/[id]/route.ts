import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspaceId } from "@/lib/workspace";

const patchRecommendedActionSchema = z.object({
  status: z.enum(["open", "snoozed", "done", "dismissed", "stale"]).optional(),
  snoozedUntil: z.string().datetime().optional().nullable(),
  dismissReason: z.string().optional().nullable(),
  title: z.string().min(1).optional(),
  reason: z.string().min(1).optional(),
  evidence: z.array(z.string()).optional(),
  suggestedMessage: z.string().optional().nullable(),
  priority: z.enum(["High", "Medium", "Low"]).optional(),
  score: z.number().int().min(0).max(100).optional(),
  confidence: z.number().int().min(0).max(100).optional(),
  dueAt: z.string().datetime().optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = getPrisma();
    const workspaceId = await getDefaultWorkspaceId();
    const input = patchRecommendedActionSchema.parse(await request.json());
    const resolved = input.status && ["done", "dismissed", "stale"].includes(input.status);

    const action = await db.recommendedAction.update({
      where: { id },
      data: {
        status: input.status,
        snoozedUntil: input.snoozedUntil ? new Date(input.snoozedUntil) : input.snoozedUntil,
        dismissReason: input.dismissReason,
        title: input.title,
        reason: input.reason,
        evidence: input.evidence,
        suggestedMessage: input.suggestedMessage,
        priority: input.priority,
        score: input.score,
        confidence: input.confidence,
        dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
        resolvedAt: resolved ? new Date() : input.status === "open" ? null : undefined,
      },
    });

    await writeAudit(
      {
        workspaceId,
        actorType: "agent",
        action: "recommended_action.updated",
        targetType: "recommended_action",
        targetId: action.id,
        metadata: { status: action.status, externalKey: action.externalKey },
      },
      db,
    );

    return NextResponse.json({ ok: true, action });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Invalid recommended action update" },
      { status: 400 },
    );
  }
}
