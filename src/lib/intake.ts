import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { classifyLead } from "./ai";
import { writeAudit } from "./audit";
import { createMessageDraft } from "./messages";
import { getPrisma, type DbClient } from "./prisma";
import { getDefaultWorkspaceId } from "./workspace";
import { fireOutboundWebhooks } from "./webhooks";
import { runWorkflowTrigger } from "./workflows";

export const leadPayloadSchema = z.object({
  source: z.string().default("manual"),
  name: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  message: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  budget: z.string().optional().nullable(),
  timeline: z.string().optional().nullable(),
  raw: z.record(z.string(), z.unknown()).default({}),
});

export type LeadPayload = z.infer<typeof leadPayloadSchema>;

function normalizePhone(phone?: string | null) {
  if (!phone) return undefined;
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return undefined;
  if (trimmed.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return trimmed;
}

function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() || undefined;
}

export async function intakeLead(
  input: LeadPayload,
  options: { workspaceId?: string; db?: DbClient } = {},
) {
  const db = options.db ?? getPrisma();
  const workspaceId = options.workspaceId ?? (await getDefaultWorkspaceId());
  const payload = leadPayloadSchema.parse(input);
  const email = normalizeEmail(payload.email);
  const phone = normalizePhone(payload.phone);
  const classification = await classifyLead(payload);

  const contact = await db.contact.create({
    data: {
      workspaceId,
      name: payload.name,
      source: payload.source,
      stage: classification.suggestedStage,
      type: classification.contactType,
      urgencyScore: classification.urgencyScore,
      aiSummary: classification.summary,
      aiSuggestedAction: classification.urgencyScore >= 75 ? "Call within 5 minutes" : "Send first response today",
      suggestedFirstResponse: classification.suggestedFirstResponse,
      nextAction: classification.nextAction,
      nextActionType: classification.nextActionType,
      nextActionDueAt: new Date(Date.now() + (classification.urgencyScore >= 75 ? 5 : 60) * 60 * 1000),
      nextActionReason: classification.nextActionReason,
      nextActionConfidence: classification.nextActionConfidence,
      emails: email ? { create: { email } } : undefined,
      phones: phone ? { create: { phone } } : undefined,
      consents: {
        create: [
          { channel: "email", status: email ? "unknown" : "opted_out", reason: "lead_intake" },
          { channel: "sms", status: phone ? "unknown" : "opted_out", reason: "lead_intake" },
        ],
      },
      tags: { create: classification.tags.map((tag) => ({ tag })) },
    },
    include: { emails: true, phones: true, tags: true },
  });

  const source = await db.leadSource.upsert({
    where: { workspaceId_name: { workspaceId, name: payload.source } },
    create: { workspaceId, name: payload.source, kind: "webhook" },
    update: {},
  });

  const leadEvent = await db.leadEvent.create({
    data: {
      workspaceId,
      contactId: contact.id,
      leadSourceId: source.id,
      source: payload.source,
      payload: { ...payload, raw: payload.raw } as Prisma.InputJsonValue,
      aiClass: classification as Prisma.InputJsonValue,
    },
  });

  const task = await db.task.create({
    data: {
      workspaceId,
      contactId: contact.id,
      title: classification.urgencyScore >= 75 ? "Call hot lead now" : "Follow up with new lead",
      body: classification.summary,
      dueAt: new Date(Date.now() + (classification.urgencyScore >= 75 ? 15 : 240) * 60 * 1000),
      priority: classification.urgencyScore >= 75 ? "urgent" : "high",
      type: "speed_to_lead",
      createdByAi: true,
    },
  });

  const draft = await createMessageDraft(
    {
      workspaceId,
      contactId: contact.id,
      channel: phone ? "sms" : "email",
      subject: phone ? undefined : "Thanks for reaching out",
      body: classification.suggestedFirstResponse,
      aiGenerated: true,
      metadata: { source: "lead_intake" },
    },
    db,
  );

  await writeAudit(
    {
      workspaceId,
      actorType: "system",
      action: "lead.received",
      targetType: "contact",
      targetId: contact.id,
      metadata: { leadEventId: leadEvent.id, taskId: task.id, draftId: draft.id },
    },
    db,
  );

  await fireOutboundWebhooks(workspaceId, "lead.received", { contactId: contact.id, leadEventId: leadEvent.id }, db);
  if (classification.urgencyScore >= 75) {
    await fireOutboundWebhooks(workspaceId, "lead.hot", { contactId: contact.id, score: classification.urgencyScore }, db);
  }

  await runWorkflowTrigger(
    workspaceId,
    "new_lead",
    { workspaceId, contactId: contact.id, payload: { leadEventId: leadEvent.id } },
    db,
  );

  return { contact, leadEvent, task, draft, classification };
}
