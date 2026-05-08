import { NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { getPrisma } from "@/lib/prisma";
import { getTodayRecommendations } from "@/lib/recommended-actions";
import { getDefaultWorkspaceId } from "@/lib/workspace";

export async function POST() {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const recommendations = await getTodayRecommendations(db, workspaceId);

  const actions = await Promise.all(
    recommendations.map((item) =>
      db.recommendedAction.upsert({
        where: { workspaceId_externalKey: { workspaceId, externalKey: item.id } },
        create: {
          workspaceId,
          externalKey: item.id,
          contactId: item.contact?.id,
          dealId: item.deal?.id,
          taskId: item.taskId,
          actionType: item.actionType,
          title: item.title,
          reason: item.reason,
          evidence: item.evidence,
          suggestedMessage: item.suggestedMessage,
          priority: item.priority,
          score: item.score,
          confidence: item.confidence,
          dueAt: item.dueAt,
          status: "open",
          metadata: {
            source: "system_generator",
            messageId: item.messageId,
            lifecycleEventId: item.lifecycleEventId,
          },
        },
        update: {
          contactId: item.contact?.id,
          dealId: item.deal?.id,
          taskId: item.taskId,
          actionType: item.actionType,
          title: item.title,
          reason: item.reason,
          evidence: item.evidence,
          suggestedMessage: item.suggestedMessage,
          priority: item.priority,
          score: item.score,
          confidence: item.confidence,
          dueAt: item.dueAt,
          metadata: {
            source: "system_generator",
            messageId: item.messageId,
            lifecycleEventId: item.lifecycleEventId,
          },
        },
      }),
    ),
  );

  await writeAudit(
    {
      workspaceId,
      actorType: "system",
      action: "recommended_actions.generated",
      targetType: "recommended_action",
      metadata: { count: actions.length },
    },
    db,
  );

  return NextResponse.json({ ok: true, count: actions.length, actions });
}
