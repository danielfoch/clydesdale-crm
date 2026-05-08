import { stageLabel } from "@/lib/display";
import type { DbClient } from "@/lib/prisma";
import { getRevenueEstimate, type RevenueEstimate } from "@/lib/revenue-estimates";

const sentStatuses = ["sent", "sent_mock", "initiated", "logged"] as const;
const answeredCallStatuses = ["answered", "completed", "connected"] as const;

type ChartPoint = {
  label: string;
  actions: number;
  calls: number;
  texts: number;
  emails: number;
};

type StageMetric = {
  key: string;
  label: string;
  count: number;
  valueCents: number;
};

export type SalesAnalytics = {
  revenue: RevenueEstimate;
  generatedAt: string;
  scorecards: {
    totalContacts: number;
    newLeads30d: number;
    activePipeline: number;
    activeDeals: number;
    closedDeals30d: number;
    openRecommendedActions: number;
    overdueTasks: number;
    nextActionCoverage: number;
  };
  sales: {
    leadToClientRate: number;
    clientToTransactionRate: number;
    dealCloseRate: number;
    averageActiveDealValueCents: number;
    weightedCommissionCents: number;
    annualizedCommissionCents: number;
  };
  communication: {
    callsMade30d: number;
    answeredCalls30d: number;
    pickupRate: number;
    textsSent30d: number;
    emailsSent30d: number;
    outboundContacts30d: number;
    replyingContacts30d: number;
    responseRate: number;
    inboundReplies30d: number;
    failedMessages30d: number;
    aiDraftsWaiting: number;
  };
  activity: {
    actions30d: number;
    actions7d: number;
    tasksCompleted30d: number;
    checklistBoxes30d: number;
    notesCreated30d: number;
    campaignsEnrolled30d: number;
    messagesSent30d: number;
  };
  funnel: StageMetric[];
  dealStages: StageMetric[];
  actionChart: ChartPoint[];
  topOpportunities: Array<{
    id: string;
    name: string;
    kind: "Pipeline" | "Deal";
    stage: string;
    nextAction: string;
    valueCents: number;
    dueAt: string;
  }>;
};

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function shortDay(date: Date) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function percentage(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function stageBucket(stage: string) {
  if (stage === "new" || stage === "attempting_contact") return "lead";
  if (stage === "nurturing") return "relationship";
  if (stage === "appointment_set") return "prospect";
  if (stage === "active_client") return "client";
  return stage;
}

function dealStageBucket(stage: string) {
  if (["new", "consultation", "valuation", "met_with_client"].includes(stage)) return "met_with_client";
  if (["sending_listings", "searching", "preparing"].includes(stage)) return "sending_listings";
  if (["active_client", "listed", "showings", "out_looking"].includes(stage)) return "active_client";
  if (["transaction", "under_contract", "applications", "offer", "lease_process"].includes(stage)) return "transaction";
  return stage;
}

function actionKind(action: string, channel?: string | null) {
  if (action.includes("call")) return "calls";
  if (channel === "sms" || action.includes("text")) return "texts";
  if (channel === "email") return "emails";
  return "actions";
}

export async function getSalesAnalytics(workspaceId: string, db: DbClient): Promise<SalesAnalytics> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const chartStart = startOfDay(new Date(now.getTime() - 13 * 24 * 60 * 60 * 1000));

  const [
    revenue,
    contacts,
    deals,
    messages30d,
    tasks30d,
    auditLogs30d,
    recommendedActions,
    campaignEnrollments30d,
  ] = await Promise.all([
    getRevenueEstimate(db, workspaceId),
    db.contact.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        stage: true,
        estimatedDealValueCents: true,
        nextAction: true,
        nextActionDueAt: true,
        createdAt: true,
        lastReplyAt: true,
      },
    }),
    db.deal.findMany({
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        stage: true,
        valueCents: true,
        nextAction: true,
        nextActionDueAt: true,
        closedAt: true,
      },
    }),
    db.message.findMany({
      where: { workspaceId, createdAt: { gte: thirtyDaysAgo } },
      select: {
        id: true,
        contactId: true,
        channel: true,
        direction: true,
        status: true,
        createdAt: true,
        sentAt: true,
        aiGenerated: true,
        approvedByUser: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    db.task.findMany({
      where: { workspaceId, OR: [{ createdAt: { gte: thirtyDaysAgo } }, { completedAt: { gte: thirtyDaysAgo } }, { status: "open" }] },
      select: { id: true, status: true, type: true, dueAt: true, completedAt: true },
    }),
    db.auditLog.findMany({
      where: { workspaceId, createdAt: { gte: thirtyDaysAgo } },
      select: { id: true, action: true, targetType: true, targetId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 5000,
    }),
    db.recommendedAction.findMany({
      where: { workspaceId, status: "open" },
      select: { id: true, priority: true },
    }),
    db.campaignEnrollment.findMany({
      where: { campaign: { workspaceId }, createdAt: { gte: thirtyDaysAgo } },
      select: { id: true },
    }),
  ]);

  const messageIds = auditLogs30d.filter((log) => log.targetType === "message" && log.targetId).map((log) => log.targetId!);
  const auditMessages = messageIds.length
    ? await db.message.findMany({
        where: { id: { in: [...new Set(messageIds)] } },
        select: { id: true, channel: true },
      })
    : [];
  const channelByMessage = new Map(auditMessages.map((message) => [message.id, message.channel]));

  const activeContacts = contacts.filter((contact) => !["closed", "past_client", "unqualified", "archived"].includes(contact.stage));
  const activeDeals = deals.filter((deal) => !["closed", "lost"].includes(deal.stage));
  const closedDeals = deals.filter((deal) => deal.stage === "closed" || deal.closedAt);
  const closedDeals30d = closedDeals.filter((deal) => deal.closedAt && deal.closedAt >= thirtyDaysAgo);
  const transactionDeals = deals.filter((deal) => dealStageBucket(deal.stage) === "transaction");
  const clients = contacts.filter((contact) => ["active_client", "under_contract", "closed", "past_client"].includes(contact.stage));
  const pipelineContacts = contacts.filter((contact) => ["new", "attempting_contact", "nurturing", "appointment_set", "active_client"].includes(contact.stage));
  const contactsWithNextAction = activeContacts.filter((contact) => contact.nextAction && contact.nextActionDueAt);

  const outboundMessages = messages30d.filter((message) => message.direction === "outbound" && sentStatuses.includes(message.status as never));
  const outboundTexts = outboundMessages.filter((message) => message.channel === "sms");
  const outboundEmails = outboundMessages.filter((message) => message.channel === "email");
  const callMessages = messages30d.filter((message) => message.channel === "call" && message.direction === "outbound");
  const answeredCalls = callMessages.filter((message) => answeredCallStatuses.includes(message.status as never));
  const inboundMessages = messages30d.filter((message) => message.direction === "inbound");
  const outboundContactIds = new Set(outboundMessages.map((message) => message.contactId).filter(Boolean));
  const replyingContactIds = new Set([
    ...inboundMessages.map((message) => message.contactId).filter(Boolean),
    ...contacts.filter((contact) => contact.lastReplyAt && contact.lastReplyAt >= thirtyDaysAgo).map((contact) => contact.id),
  ]);

  const completedTasks = tasks30d.filter((task) => task.status === "done" && task.completedAt && task.completedAt >= thirtyDaysAgo);
  const overdueTasks = tasks30d.filter((task) => task.status === "open" && task.dueAt && task.dueAt < now);
  const checklistBoxes = completedTasks.filter((task) => task.type.startsWith("loop:"));
  const notesCreated30d = auditLogs30d.filter((log) => log.action === "note.created").length;
  const actions7d = auditLogs30d.filter((log) => log.createdAt >= sevenDaysAgo).length;

  const stageCounts = new Map<string, StageMetric>();
  for (const contact of pipelineContacts) {
    const key = stageBucket(contact.stage);
    const current = stageCounts.get(key) ?? { key, label: stageLabel(key), count: 0, valueCents: 0 };
    current.count += 1;
    current.valueCents += contact.estimatedDealValueCents;
    stageCounts.set(key, current);
  }

  const dealStageCounts = new Map<string, StageMetric>();
  for (const deal of activeDeals) {
    const key = dealStageBucket(deal.stage);
    const current = dealStageCounts.get(key) ?? { key, label: stageLabel(key), count: 0, valueCents: 0 };
    current.count += 1;
    current.valueCents += deal.valueCents;
    dealStageCounts.set(key, current);
  }

  const points = new Map<string, ChartPoint>();
  for (let index = 0; index < 14; index += 1) {
    const date = new Date(chartStart.getTime() + index * 24 * 60 * 60 * 1000);
    points.set(dayKey(date), { label: shortDay(date), actions: 0, calls: 0, texts: 0, emails: 0 });
  }

  for (const log of auditLogs30d.filter((log) => log.createdAt >= chartStart)) {
    const point = points.get(dayKey(log.createdAt));
    if (!point) continue;
    point.actions += 1;
    const kind = actionKind(log.action, log.targetId ? channelByMessage.get(log.targetId) : undefined);
    if (kind === "calls") point.calls += 1;
    if (kind === "texts") point.texts += 1;
    if (kind === "emails") point.emails += 1;
  }

  const topPipeline = contacts
    .filter((contact) => contact.estimatedDealValueCents > 0 && !["closed", "past_client", "unqualified", "archived"].includes(contact.stage))
    .map((contact) => ({
      id: contact.id,
      name: contact.name,
      kind: "Pipeline" as const,
      stage: stageLabel(contact.stage),
      nextAction: contact.nextAction,
      valueCents: contact.estimatedDealValueCents,
      dueAt: contact.nextActionDueAt.toISOString(),
    }));
  const topDeals = activeDeals.map((deal) => ({
    id: deal.id,
    name: deal.name,
    kind: "Deal" as const,
    stage: stageLabel(deal.stage),
    nextAction: deal.nextAction,
    valueCents: deal.valueCents,
    dueAt: deal.nextActionDueAt.toISOString(),
  }));

  return {
    revenue,
    generatedAt: now.toISOString(),
    scorecards: {
      totalContacts: contacts.length,
      newLeads30d: contacts.filter((contact) => contact.createdAt >= thirtyDaysAgo && ["new", "attempting_contact"].includes(contact.stage)).length,
      activePipeline: pipelineContacts.length,
      activeDeals: activeDeals.length,
      closedDeals30d: closedDeals30d.length,
      openRecommendedActions: recommendedActions.length,
      overdueTasks: overdueTasks.length,
      nextActionCoverage: percentage(contactsWithNextAction.length, activeContacts.length),
    },
    sales: {
      leadToClientRate: percentage(clients.length, contacts.length),
      clientToTransactionRate: percentage(transactionDeals.length, Math.max(clients.length, activeDeals.length)),
      dealCloseRate: percentage(closedDeals.length, deals.length),
      averageActiveDealValueCents: activeDeals.length ? Math.round(activeDeals.reduce((sum, deal) => sum + deal.valueCents, 0) / activeDeals.length) : 0,
      weightedCommissionCents: revenue.weightedRevenueCents,
      annualizedCommissionCents: revenue.annualizedRevenueCents,
    },
    communication: {
      callsMade30d: callMessages.length,
      answeredCalls30d: answeredCalls.length,
      pickupRate: percentage(answeredCalls.length, callMessages.length),
      textsSent30d: outboundTexts.length,
      emailsSent30d: outboundEmails.length,
      outboundContacts30d: outboundContactIds.size,
      replyingContacts30d: replyingContactIds.size,
      responseRate: percentage(replyingContactIds.size, outboundContactIds.size),
      inboundReplies30d: inboundMessages.length,
      failedMessages30d: messages30d.filter((message) => message.status.includes("failed") || message.status.includes("blocked")).length,
      aiDraftsWaiting: messages30d.filter((message) => message.aiGenerated && !message.approvedByUser && message.status === "draft").length,
    },
    activity: {
      actions30d: auditLogs30d.length,
      actions7d,
      tasksCompleted30d: completedTasks.length,
      checklistBoxes30d: checklistBoxes.length,
      notesCreated30d,
      campaignsEnrolled30d: campaignEnrollments30d.length,
      messagesSent30d: outboundMessages.length,
    },
    funnel: ["lead", "relationship", "prospect", "client"].map((key) => stageCounts.get(key) ?? { key, label: stageLabel(key), count: 0, valueCents: 0 }),
    dealStages: ["met_with_client", "sending_listings", "active_client", "transaction"].map((key) => dealStageCounts.get(key) ?? { key, label: stageLabel(key), count: 0, valueCents: 0 }),
    actionChart: [...points.values()],
    topOpportunities: [...topPipeline, ...topDeals].sort((a, b) => b.valueCents - a.valueCents).slice(0, 8),
  };
}
