import type { MessageChannel } from "@prisma/client";
import { contactTypeLabel, stageLabel } from "./display";
import { type DbClient } from "./prisma";

type Priority = "High" | "Medium" | "Low";
type RecommendedActionType = "call" | "text" | "email" | "approve" | "task" | "deal" | "check_in" | "move_stage";

export type TodayRecommendation = {
  id: string;
  title: string;
  reason: string;
  evidence: string[];
  suggestedMessage?: string;
  priority: Priority;
  score: number;
  confidence: number;
  dueAt: Date;
  actionType: RecommendedActionType;
  contact?: {
    id: string;
    name: string;
    type: string;
    stage: string;
    email?: string;
    phone?: string;
  };
  deal?: {
    id: string;
    name: string;
    stage: string;
    type: string;
  };
  taskId?: string;
  messageId?: string;
  lifecycleEventId?: string;
};

function priorityFromScore(score: number): Priority {
  if (score >= 75) return "High";
  if (score >= 45) return "Medium";
  return "Low";
}

function scoreDue(date: Date) {
  const hours = (date.getTime() - Date.now()) / (60 * 60 * 1000);
  if (hours <= 0) return 25;
  if (hours <= 4) return 20;
  if (hours <= 24) return 12;
  return 4;
}

function safeContact(contact: {
  id: string;
  name: string;
  type: string;
  stage: string;
  emails?: { email: string }[];
  phones?: { phone: string }[];
}) {
  return {
    id: contact.id,
    name: contact.name,
    type: contact.type,
    stage: contact.stage,
    email: contact.emails?.[0]?.email,
    phone: contact.phones?.[0]?.phone,
  };
}

function consentAllows(consents: { channel: MessageChannel; status: string }[], channel: "sms" | "email") {
  return !consents.some((consent) => consent.channel === channel && consent.status === "opted_out");
}

function evidenceArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export async function getTodayRecommendations(db: DbClient, workspaceId: string) {
  const now = new Date();
  const soon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const [storedActions, contacts, overdueTasks, drafts, deals, lifecycle] = await Promise.all([
    db.recommendedAction.findMany({
      where: {
        workspaceId,
        OR: [
          { status: "open" },
          { status: "snoozed", snoozedUntil: { lte: now } },
          { status: { in: ["done", "dismissed", "stale"] } },
        ],
      },
      include: {
        contact: { include: { emails: true, phones: true } },
        deal: true,
      },
      orderBy: [{ score: "desc" }, { dueAt: "asc" }],
      take: 80,
    }),
    db.contact.findMany({
      where: {
        workspaceId,
        stage: { notIn: ["archived", "unqualified", "closed"] },
      },
      include: {
        emails: { select: { email: true } },
        phones: { select: { phone: true } },
        consents: { select: { channel: true, status: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 8 },
        primaryDeals: { where: { stage: { not: "closed" } }, take: 1 },
      },
      orderBy: [{ nextActionDueAt: "asc" }, { urgencyScore: "desc" }],
      take: 60,
    }),
    db.task.findMany({
      where: { workspaceId, status: "open", dueAt: { lt: now } },
      include: { contact: { include: { emails: true, phones: true } }, deal: true },
      orderBy: { dueAt: "asc" },
      take: 10,
    }),
    db.message.findMany({
      where: { workspaceId, status: "draft", aiGenerated: true, approvedByUser: false },
      include: { contact: { include: { emails: true, phones: true, consents: true } } },
      orderBy: { createdAt: "asc" },
      take: 12,
    }),
    db.deal.findMany({
      where: {
        workspaceId,
        stage: { not: "closed" },
        OR: [{ riskLevel: { in: ["high", "stalled"] } }, { deadline: { lte: soon } }, { nextActionDueAt: { lte: soon } }],
      },
      include: { primaryContact: { include: { emails: true, phones: true } }, participants: { include: { contact: { include: { emails: true, phones: true } } } } },
      orderBy: [{ nextActionDueAt: "asc" }, { updatedAt: "desc" }],
      take: 12,
    }),
    db.clientLifecycleEvent.findMany({
      where: { workspaceId, status: "due", dueAt: { lte: soon } },
      include: { contact: { include: { emails: true, phones: true } } },
      orderBy: { dueAt: "asc" },
      take: 10,
    }),
  ]);

  const recommendations = new Map<string, TodayRecommendation>();
  const suppressedKeys = new Set(
    storedActions
      .filter((action) => ["done", "dismissed", "stale"].includes(action.status) || (action.status === "snoozed" && action.snoozedUntil && action.snoozedUntil > now))
      .map((action) => action.externalKey),
  );

  for (const action of storedActions) {
    if (action.status !== "open" && !(action.status === "snoozed" && action.snoozedUntil && action.snoozedUntil <= now)) continue;
    recommendations.set(action.externalKey, {
      id: action.externalKey,
      title: action.title,
      reason: action.reason,
      evidence: evidenceArray(action.evidence),
      suggestedMessage: action.suggestedMessage ?? undefined,
      priority: action.priority as Priority,
      score: action.score,
      confidence: action.confidence,
      dueAt: action.dueAt,
      actionType: action.actionType as RecommendedActionType,
      contact: action.contact ? safeContact(action.contact) : undefined,
      deal: action.deal ? { id: action.deal.id, name: action.deal.name, stage: action.deal.stage, type: action.deal.type } : undefined,
      taskId: action.taskId ?? undefined,
    });
  }

  function setGenerated(key: string, action: TodayRecommendation) {
    if (!suppressedKeys.has(key)) recommendations.set(key, action);
  }

  for (const contact of contacts) {
    const callCount = contact.messages.filter((message) => message.channel === "call").length;
    const sentCount = contact.messages.filter((message) => ["sent", "sent_mock", "initiated", "logged"].includes(message.status)).length;
    const base = contact.urgencyScore + scoreDue(contact.nextActionDueAt);
    const contactInfo = safeContact(contact);

    if (["new", "attempting_contact"].includes(contact.stage) && callCount === 0) {
      const score = Math.min(100, base + 25);
      setGenerated(`lead-contact-${contact.id}`, {
        id: `lead-contact-${contact.id}`,
        title: contact.urgencyScore >= 75 ? `Call ${contact.name}` : `Respond to ${contact.name}`,
        reason: contact.urgencyScore >= 75
          ? "Hot lead. No completed call is logged yet."
          : "You have their contact information but no clear first-touch completion is logged.",
        evidence: [
          `${stageLabel(contact.stage)} stage`,
          `${contact.urgencyScore}/100 urgency`,
          callCount === 0 ? "No call logged" : "Call logged",
          sentCount === 0 ? "No outbound touch logged" : "Outbound touch exists",
        ],
        suggestedMessage: contact.suggestedFirstResponse ?? undefined,
        priority: priorityFromScore(score),
        score,
        confidence: contact.nextActionConfidence,
        dueAt: contact.nextActionDueAt,
        actionType: contact.phones[0] ? "call" : "email",
        contact: contactInfo,
      });
    }

    if (contact.stage === "nurturing" && contact.nextActionDueAt <= soon) {
      const score = Math.min(92, base + 12);
      setGenerated(`relationship-${contact.id}`, {
        id: `relationship-${contact.id}`,
        title: `Keep ${contact.name} moving`,
        reason: "They are engaged, but no client-work has started.",
        evidence: [stageLabel(contact.stage), contact.nextActionReason ?? "Next action is due", contactTypeLabel(contact.type)],
        suggestedMessage: contact.suggestedFirstResponse ?? `Quick check-in. Should I send listings, a CMA, or a market update based on what you are considering?`,
        priority: priorityFromScore(score),
        score,
        confidence: contact.nextActionConfidence,
        dueAt: contact.nextActionDueAt,
        actionType: contact.phones[0] && consentAllows(contact.consents, "sms") ? "text" : "email",
        contact: contactInfo,
      });
    }

    if (contact.stage === "appointment_set" && contact.nextActionDueAt <= soon) {
      const score = Math.min(96, base + 18);
      setGenerated(`prospect-${contact.id}`, {
        id: `prospect-${contact.id}`,
        title: `Set appointment with ${contact.name}`,
        reason: "They are receiving value and should be moved toward a client meeting.",
        evidence: [stageLabel(contact.stage), contact.nextActionReason ?? "Prospect next action is due", contactTypeLabel(contact.type)],
        suggestedMessage: contact.suggestedFirstResponse ?? "Are you free today or tomorrow to lock in the next step?",
        priority: priorityFromScore(score),
        score,
        confidence: contact.nextActionConfidence,
        dueAt: contact.nextActionDueAt,
        actionType: "call",
        contact: contactInfo,
      });
    }

    if (contact.stage === "active_client" && contact.primaryDeals.length === 0) {
      setGenerated(`client-without-deal-${contact.id}`, {
        id: `client-without-deal-${contact.id}`,
        title: `Move ${contact.name} to Deals`,
        reason: "They converted to client but do not have an active deal yet.",
        evidence: [stageLabel(contact.stage), "No active deal found"],
        priority: "High",
        score: 88,
        confidence: 90,
        dueAt: contact.nextActionDueAt,
        actionType: "deal",
        contact: contactInfo,
      });
    }
  }

  for (const draft of drafts) {
    if (!draft.contact) continue;
    if ((draft.channel === "sms" || draft.channel === "email") && !consentAllows(draft.contact.consents, draft.channel)) continue;
    const score = draft.contact.urgencyScore >= 75 ? 94 : 78;
    setGenerated(`draft-${draft.id}`, {
      id: `draft-${draft.id}`,
      title: `Approve ${draft.channel.toUpperCase()} to ${draft.contact.name}`,
      reason: "AI drafted a response and it is waiting for human approval.",
      evidence: [stageLabel(draft.contact.stage), `${draft.contact.urgencyScore}/100 urgency`, "Draft not approved yet"],
      suggestedMessage: draft.body,
      priority: priorityFromScore(score),
      score,
      confidence: 84,
      dueAt: draft.createdAt,
      actionType: "approve",
      contact: safeContact(draft.contact),
      messageId: draft.id,
    });
  }

  for (const task of overdueTasks) {
    const score = task.priority === "urgent" ? 91 : task.priority === "high" ? 82 : 64;
    setGenerated(`task-${task.id}`, {
      id: `task-${task.id}`,
      title: task.title,
      reason: "This task is overdue and still open.",
      evidence: [task.body ?? "No task notes", task.priority ? `${task.priority} priority` : "Normal priority"],
      priority: priorityFromScore(score),
      score,
      confidence: 80,
      dueAt: task.dueAt ?? task.createdAt,
      actionType: "task",
      contact: task.contact ? safeContact(task.contact) : undefined,
      deal: task.deal ? { id: task.deal.id, name: task.deal.name, stage: task.deal.stage, type: task.deal.type } : undefined,
      taskId: task.id,
    });
  }

  for (const deal of deals) {
    const contact = deal.primaryContact ?? deal.participants[0]?.contact;
    const score = deal.riskLevel === "stalled" ? 92 : deal.riskLevel === "high" ? 86 : 70 + scoreDue(deal.nextActionDueAt);
    setGenerated(`deal-${deal.id}`, {
      id: `deal-${deal.id}`,
      title: deal.riskLevel === "stalled" ? `Unstall ${deal.name}` : `Move ${deal.name} forward`,
      reason: deal.riskLevel === "stalled" ? "Deal is marked stalled and needs the next blocking item cleared." : "Deal has a deadline or next action coming due.",
      evidence: [stageLabel(deal.stage), `Risk: ${deal.riskLevel}`, deal.deadline ? `Deadline ${deal.deadline.toLocaleDateString()}` : "No deadline set"],
      priority: priorityFromScore(score),
      score,
      confidence: 82,
      dueAt: deal.nextActionDueAt,
      actionType: "deal",
      suggestedMessage: deal.nextAction,
      contact: contact ? safeContact(contact) : undefined,
      deal: { id: deal.id, name: deal.name, stage: deal.stage, type: deal.type },
    });
  }

  for (const event of lifecycle) {
    const score = event.dueAt <= now ? 76 : 58;
    setGenerated(`lifecycle-${event.id}`, {
      id: `lifecycle-${event.id}`,
      title: `Check in with ${event.contact.name}`,
      reason: "Past client is due for a client-for-life touch.",
      evidence: [event.notes ?? event.eventType, "Past clients stay out of Pipeline until they need attention"],
      suggestedMessage: event.messageDraft ?? undefined,
      priority: priorityFromScore(score),
      score,
      confidence: 78,
      dueAt: event.dueAt,
      actionType: "check_in",
      contact: safeContact(event.contact),
      lifecycleEventId: event.id,
    });
  }

  return [...recommendations.values()]
    .sort((a, b) => b.score - a.score || a.dueAt.getTime() - b.dueAt.getTime())
    .slice(0, 12);
}
