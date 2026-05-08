import type { DbClient } from "@/lib/prisma";

const COMMISSION_RATE = 0.025;
const ANNUALIZATION_MULTIPLIER = 4;

const actionAuditEvents = [
  "call.logged",
  "call.started_twilio",
  "client_lifecycle.completed",
  "loop_checklist.completed",
  "message.manual_sent",
  "message.approved",
  "task.completed",
] as const;

type PipelineRecord = {
  valueCents: number;
  conversion: number;
  actionCount: number;
};

export type RevenueEstimate = {
  assignedDealValueCents: number;
  weightedRevenueCents: number;
  annualizedRevenueCents: number;
  actionsTaken30d: number;
  actionsToTarget: number;
  targetAnnualizedRevenueCents: number;
  conversionRate: number;
  opportunityCount: number;
};

function contactStageConversion(stage: string) {
  switch (stage) {
    case "new":
    case "attempting_contact":
      return 0.08;
    case "nurturing":
      return 0.18;
    case "appointment_set":
      return 0.34;
    case "active_client":
      return 0.52;
    case "under_contract":
      return 0.78;
    default:
      return 0;
  }
}

function dealStageConversion(stage: string) {
  switch (stage) {
    case "new":
    case "consultation":
    case "valuation":
    case "met_with_client":
      return 0.48;
    case "sending_listings":
    case "searching":
    case "preparing":
      return 0.58;
    case "active_client":
    case "listed":
    case "showings":
    case "out_looking":
      return 0.72;
    case "transaction":
    case "under_contract":
    case "applications":
    case "offer":
    case "lease_process":
      return 0.9;
    default:
      return 0.4;
  }
}

function conversionWithActionLift(baseConversion: number, actionCount: number) {
  return Math.min(0.95, baseConversion + Math.min(actionCount, 8) * 0.015);
}

function expectedRevenueCents(record: PipelineRecord) {
  const grossCommissionCents = record.valueCents * COMMISSION_RATE;
  const conversion = conversionWithActionLift(record.conversion, record.actionCount);
  return Math.round(grossCommissionCents * conversion);
}

export function formatRevenue(cents: number) {
  const dollars = Math.round(cents / 100);
  if (Math.abs(dollars) >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(dollars >= 10_000_000 ? 0 : 1)}M`;
  if (Math.abs(dollars) >= 100_000) return `$${Math.round(dollars / 1_000)}k`;
  return `$${dollars.toLocaleString()}`;
}

export function centsToDollarInput(cents: number) {
  return cents ? Math.round(cents / 100).toString() : "";
}

export async function getRevenueEstimate(db: DbClient, workspaceId: string): Promise<RevenueEstimate> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [contacts, deals, actionsTaken30d] = await Promise.all([
    db.contact.findMany({
      where: {
        workspaceId,
        estimatedDealValueCents: { gt: 0 },
        stage: { notIn: ["closed", "past_client", "unqualified", "archived"] },
        primaryDeals: { none: { stage: { notIn: ["closed", "lost"] } } },
      },
      select: {
        stage: true,
        estimatedDealValueCents: true,
        tasks: {
          where: { status: "done" },
          select: { id: true },
          take: 20,
        },
        messages: {
          where: {
            direction: "outbound",
            status: { in: ["sent", "sent_mock", "initiated", "logged"] },
          },
          select: { id: true },
          take: 20,
        },
      },
    }),
    db.deal.findMany({
      where: {
        workspaceId,
        valueCents: { gt: 0 },
        stage: { notIn: ["closed", "lost"] },
      },
      select: {
        stage: true,
        valueCents: true,
        tasks: {
          where: { status: "done" },
          select: { id: true },
          take: 20,
        },
      },
    }),
    db.auditLog.count({
      where: {
        workspaceId,
        createdAt: { gte: thirtyDaysAgo },
        action: { in: [...actionAuditEvents] },
      },
    }),
  ]);

  const records: PipelineRecord[] = [
    ...contacts.map((contact) => ({
      valueCents: contact.estimatedDealValueCents,
      conversion: contactStageConversion(contact.stage),
      actionCount: contact.tasks.length + contact.messages.length,
    })),
    ...deals.map((deal) => ({
      valueCents: deal.valueCents,
      conversion: dealStageConversion(deal.stage),
      actionCount: deal.tasks.length,
    })),
  ];

  const assignedDealValueCents = records.reduce((total, record) => total + record.valueCents, 0);
  const weightedRevenueCents = records.reduce((total, record) => total + expectedRevenueCents(record), 0);
  const annualizedRevenueCents = weightedRevenueCents * ANNUALIZATION_MULTIPLIER;
  const actionsToTarget = Math.max(3, Math.min(12, records.length ? Math.ceil(records.length * 1.5) : 3));
  const boostPerActionCents = Math.max(25_000, Math.round(Math.max(annualizedRevenueCents, 100_000) * 0.0125));
  const targetAnnualizedRevenueCents = annualizedRevenueCents + boostPerActionCents * actionsToTarget;

  return {
    assignedDealValueCents,
    weightedRevenueCents,
    annualizedRevenueCents,
    actionsTaken30d,
    actionsToTarget,
    targetAnnualizedRevenueCents,
    conversionRate: assignedDealValueCents > 0 ? weightedRevenueCents / (assignedDealValueCents * COMMISSION_RATE) : 0,
    opportunityCount: records.length,
  };
}
