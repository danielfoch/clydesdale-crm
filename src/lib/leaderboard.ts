import type { AuditLog } from "@prisma/client";
import type { DbClient } from "./prisma";

type LeaderboardCategory = "checkboxes" | "calls" | "texts" | "emails" | "other";

export type LeaderboardRow = {
  userId: string;
  name: string;
  email: string;
  role: string;
  checkboxes: number;
  calls: number;
  texts: number;
  emails: number;
  other: number;
  total: number;
  last7Days: number;
  lastActionAt: string | null;
};

const excludedActions = new Set([
  "motivation_quote.upvoted",
  "motivation_quote.downvoted",
  "motivation_quote.submitted",
  "ai_provider.saved",
  "ai_provider.key_removed",
]);

const checkboxActions = new Set(["task.completed", "loop_checklist.completed"]);
const callActions = new Set([
  "call.started_twilio",
  "call.logged",
  "contact_action.call_started",
  "contact_action.call_logged",
  "contact_action.voicemail_drop_queued",
  "contact_action.ai_isa_call_queued",
]);
const messageActions = new Set(["message.manual_sent", "message.approved", "contact_action.text_sent"]);
const otherActions = new Set([
  "note.created",
  "task.created",
  "deal.created",
  "deal.closed",
  "campaign.enrolled",
  "campaign_step.updated",
  "campaigns.run_due_steps",
  "contact.marked_past_client",
  "contact.snoozed",
  "contact.assigned",
  "contact.pipeline_stage_changed",
  "deal.snoozed",
  "deal.assigned",
  "deal.pipeline_stage_changed",
  "client_lifecycle.completed",
  "message.manual_draft_created",
  "recommended_action.updated",
]);

function classifyAction(log: AuditLog, messageChannel?: string | null): LeaderboardCategory | null {
  if (excludedActions.has(log.action)) return null;
  if (checkboxActions.has(log.action)) return "checkboxes";
  if (callActions.has(log.action)) return "calls";
  if (messageActions.has(log.action)) {
    if (messageChannel === "email") return "emails";
    if (messageChannel === "sms") return "texts";
    if (messageChannel === "call") return "calls";
    return log.action === "contact_action.text_sent" ? "texts" : "other";
  }
  if (otherActions.has(log.action)) return "other";
  return null;
}

export async function getLeaderboard(workspaceId: string, db: DbClient) {
  const members = await db.workspaceMember.findMany({
    where: { workspaceId },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });
  const userIds = new Set(members.map((member) => member.userId));
  const defaultUserId = members[0]?.userId;
  const rows = new Map<string, LeaderboardRow>();

  for (const member of members) {
    rows.set(member.userId, {
      userId: member.userId,
      name: member.user.name,
      email: member.user.email,
      role: member.role,
      checkboxes: 0,
      calls: 0,
      texts: 0,
      emails: 0,
      other: 0,
      total: 0,
      last7Days: 0,
      lastActionAt: null,
    });
  }

  const logs = await db.auditLog.findMany({
    where: {
      workspaceId,
      actorType: { in: ["user", "agent"] },
    },
    orderBy: { createdAt: "desc" },
    take: 5000,
  });

  const targetIdsByType = logs.reduce<Record<string, string[]>>((acc, log) => {
    if (!log.targetId) return acc;
    acc[log.targetType] ??= [];
    acc[log.targetType].push(log.targetId);
    return acc;
  }, {});

  const [contacts, messages, tasks, deals, lifecycleEvents, enrollments] = await Promise.all([
    db.contact.findMany({
      where: { id: { in: [...new Set(targetIdsByType.contact ?? [])] } },
      select: { id: true, ownerId: true },
    }),
    db.message.findMany({
      where: { id: { in: [...new Set(targetIdsByType.message ?? [])] } },
      select: { id: true, channel: true, contact: { select: { ownerId: true } } },
    }),
    db.task.findMany({
      where: { id: { in: [...new Set(targetIdsByType.task ?? [])] } },
      select: {
        id: true,
        assignedToId: true,
        contact: { select: { ownerId: true } },
        deal: { select: { primaryContact: { select: { ownerId: true } } } },
      },
    }),
    db.deal.findMany({
      where: { id: { in: [...new Set(targetIdsByType.deal ?? [])] } },
      select: { id: true, primaryContact: { select: { ownerId: true } } },
    }),
    db.clientLifecycleEvent.findMany({
      where: { id: { in: [...new Set(targetIdsByType.client_lifecycle_event ?? [])] } },
      select: { id: true, contact: { select: { ownerId: true } } },
    }),
    db.campaignEnrollment.findMany({
      where: { id: { in: [...new Set(targetIdsByType.campaign_enrollment ?? [])] } },
      select: { id: true, contact: { select: { ownerId: true } } },
    }),
  ]);

  const contactOwners = new Map(contacts.map((contact) => [contact.id, contact.ownerId]));
  const messageMap = new Map(messages.map((message) => [message.id, message]));
  const taskOwners = new Map(tasks.map((task) => [task.id, task.assignedToId ?? task.contact?.ownerId ?? task.deal?.primaryContact?.ownerId]));
  const dealOwners = new Map(deals.map((deal) => [deal.id, deal.primaryContact?.ownerId]));
  const lifecycleOwners = new Map(lifecycleEvents.map((event) => [event.id, event.contact.ownerId]));
  const enrollmentOwners = new Map(enrollments.map((enrollment) => [enrollment.id, enrollment.contact.ownerId]));
  const last7DaysCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

  function ownerFor(log: AuditLog) {
    if (log.actorId && userIds.has(log.actorId)) return log.actorId;
    if (!log.targetId) return defaultUserId;

    if (log.targetType === "contact") return contactOwners.get(log.targetId) ?? defaultUserId;
    if (log.targetType === "message") return messageMap.get(log.targetId)?.contact?.ownerId ?? defaultUserId;
    if (log.targetType === "task") return taskOwners.get(log.targetId) ?? defaultUserId;
    if (log.targetType === "deal") return dealOwners.get(log.targetId) ?? defaultUserId;
    if (log.targetType === "client_lifecycle_event") return lifecycleOwners.get(log.targetId) ?? defaultUserId;
    if (log.targetType === "campaign_enrollment") return enrollmentOwners.get(log.targetId) ?? defaultUserId;

    return defaultUserId;
  }

  for (const log of logs) {
    const channel = log.targetId && log.targetType === "message" ? messageMap.get(log.targetId)?.channel : undefined;
    const category = classifyAction(log, channel);
    if (!category) continue;

    const userId = ownerFor(log);
    if (!userId) continue;
    const row = rows.get(userId);
    if (!row) continue;

    row[category] += 1;
    row.total += 1;
    if (log.createdAt.getTime() >= last7DaysCutoff) row.last7Days += 1;
    if (!row.lastActionAt || log.createdAt.toISOString() > row.lastActionAt) {
      row.lastActionAt = log.createdAt.toISOString();
    }
  }

  return [...rows.values()].sort((a, b) => b.total - a.total || b.last7Days - a.last7Days || a.name.localeCompare(b.name));
}
