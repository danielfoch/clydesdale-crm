"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createNewsletterDraftFromPost, importRssSource } from "@/lib/content";
import { intakeLead } from "@/lib/intake";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspaceId } from "@/lib/workspace";
import { writeAudit } from "@/lib/audit";
import { generateClientForLifeCheckin } from "@/lib/ai";
import { approveAndSendMessage } from "@/lib/messages";

function requiredString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required`);
  return value.trim();
}

function optionalString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function getDefaultOwnerId(workspaceId: string) {
  const db = getPrisma();
  const member = await db.workspaceMember.findFirst({
    where: { workspaceId },
    include: { user: true },
    orderBy: { createdAt: "asc" },
  });

  return member?.userId;
}

export async function addNoteAction(formData: FormData) {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const contactId = requiredString(formData, "contactId");
  const note = await db.contactNote.create({
    data: { contactId, body: requiredString(formData, "body"), createdBy: "local-user" },
  });
  await writeAudit({ workspaceId, actorType: "user", action: "note.created", targetType: "contact_note", targetId: note.id }, db);
  revalidatePath(`/people/${contactId}`);
}

export async function createTaskAction(formData: FormData) {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const contactId = formData.get("contactId")?.toString();
  const task = await db.task.create({
    data: {
      workspaceId,
      contactId: contactId || undefined,
      title: requiredString(formData, "title"),
      body: formData.get("body")?.toString(),
      dueAt: formData.get("dueAt") ? new Date(requiredString(formData, "dueAt")) : undefined,
    },
  });
  await writeAudit({ workspaceId, actorType: "user", action: "task.created", targetType: "task", targetId: task.id }, db);
  revalidatePath("/today");
  if (contactId) revalidatePath(`/people/${contactId}`);
}

export async function createDealAction(formData: FormData) {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const contactId = requiredString(formData, "contactId");
  const deal = await db.deal.create({
    data: {
      workspaceId,
      type: requiredString(formData, "type") as never,
      name: requiredString(formData, "name"),
      stage: formData.get("stage")?.toString() || "new",
      valueCents: Number(formData.get("valueCents") ?? 0),
      primaryContactId: contactId,
      nextAction: formData.get("nextAction")?.toString() || "Confirm client update and next milestone",
      nextActionDueAt: formData.get("nextActionDueAt") ? new Date(requiredString(formData, "nextActionDueAt")) : new Date(Date.now() + 24 * 60 * 60 * 1000),
      deadline: formData.get("deadline") ? new Date(requiredString(formData, "deadline")) : undefined,
      riskLevel: formData.get("riskLevel")?.toString() || "normal",
      participants: { create: { contactId, role: "client" } },
      stageHistory: { create: { toStage: formData.get("stage")?.toString() || "new" } },
    },
  });
  await writeAudit({ workspaceId, actorType: "user", action: "deal.created", targetType: "deal", targetId: deal.id }, db);
  revalidatePath("/deals");
  revalidatePath(`/people/${contactId}`);
}

export async function enrollCampaignAction(formData: FormData) {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const contactId = requiredString(formData, "contactId");
  const campaignId = requiredString(formData, "campaignId");
  const enrollment = await db.campaignEnrollment.upsert({
    where: { campaignId_contactId: { campaignId, contactId } },
    create: { campaignId, contactId },
    update: { status: "active" },
  });
  await writeAudit({ workspaceId, actorType: "user", action: "campaign.enrolled", targetType: "campaign_enrollment", targetId: enrollment.id }, db);
  revalidatePath(`/people/${contactId}`);
}

export async function markPastClientAction(formData: FormData) {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const contactId = requiredString(formData, "contactId");
  await db.contact.update({
    where: { id: contactId },
    data: {
      stage: "past_client",
      type: "past_client",
      nextAction: "Send 30-day post-close check-in",
      nextActionType: "email",
      nextActionDueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      nextActionReason: "Client moved into client-for-life plan",
    },
  });
  await createClientForLifeEvents(workspaceId, contactId, db);
  await writeAudit({ workspaceId, actorType: "user", action: "contact.marked_past_client", targetType: "contact", targetId: contactId }, db);
  revalidatePath("/today");
  revalidatePath(`/people/${contactId}`);
}

export async function closeDealAction(formData: FormData) {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const dealId = requiredString(formData, "dealId");
  const deal = await db.deal.update({
    where: { id: dealId },
    data: {
      stage: "closed",
      closedAt: new Date(),
      nextAction: "Move client into client-for-life plan",
      nextActionDueAt: new Date(),
      riskLevel: "closed",
      stageHistory: { create: { toStage: "closed" } },
    },
    include: { participants: true },
  });
  for (const participant of deal.participants) {
    await db.contact.update({
      where: { id: participant.contactId },
      data: {
        stage: "past_client",
        type: "past_client",
        nextAction: "Send 30-day post-close check-in",
        nextActionType: "email",
        nextActionDueAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        nextActionReason: "Deal closed",
      },
    });
    await createClientForLifeEvents(workspaceId, participant.contactId, db);
  }
  await writeAudit({ workspaceId, actorType: "user", action: "deal.closed", targetType: "deal", targetId: dealId }, db);
  revalidatePath("/deals");
  revalidatePath("/today");
}

export async function createWorkflowAction(formData: FormData) {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const name = requiredString(formData, "name");
  const trigger = requiredString(formData, "trigger");
  const action = requiredString(formData, "action");
  const workflow = await db.workflow.create({
    data: {
      workspaceId,
      name,
      versions: {
        create: {
          version: 1,
          trigger,
          publishedAt: new Date(),
          steps: {
            create: {
              position: 1,
              action,
              config: {
                title: formData.get("taskTitle")?.toString() || "Workflow follow-up",
                body: formData.get("body")?.toString() || "Created by simple workflow builder.",
              },
            },
          },
        },
      },
    },
  });
  await writeAudit({ workspaceId, actorType: "user", action: "workflow.created", targetType: "workflow", targetId: workflow.id }, db);
  revalidatePath("/campaigns");
}

export async function importRssAction(formData: FormData) {
  const workspaceId = await getDefaultWorkspaceId();
  await importRssSource(workspaceId, requiredString(formData, "url"));
  revalidatePath("/campaigns");
}

export async function draftNewsletterAction(formData: FormData) {
  const workspaceId = await getDefaultWorkspaceId();
  await createNewsletterDraftFromPost(workspaceId, requiredString(formData, "postId"), {
    tag: formData.get("tag")?.toString() || "all",
    stage: formData.get("stage")?.toString() || "all",
    type: formData.get("type")?.toString() || "all",
  });
  revalidatePath("/campaigns");
}

export async function goToContactAction(formData: FormData) {
  redirect(`/people/${requiredString(formData, "contactId")}`);
}

export async function manualLeadAction(formData: FormData) {
  await intakeLead({
    source: formData.get("source")?.toString() || "manual",
    name: requiredString(formData, "name"),
    email: formData.get("email")?.toString() || undefined,
    phone: formData.get("phone")?.toString() || undefined,
    message: formData.get("message")?.toString() || undefined,
    raw: { entry: "manual" },
  });
  revalidatePath("/people");
  revalidatePath("/today");
}

export async function markTaskDoneAction(formData: FormData) {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const taskId = requiredString(formData, "taskId");
  const task = await db.task.update({ where: { id: taskId }, data: { status: "done", completedAt: new Date() } });
  await writeAudit({ workspaceId, actorType: "user", action: "task.completed", targetType: "task", targetId: taskId }, db);
  revalidatePath("/today");
  if (task.contactId) revalidatePath(`/people/${task.contactId}`);
}

export async function logCallAction(formData: FormData) {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const contactId = optionalString(formData, "contactId");
  const dealId = optionalString(formData, "dealId");
  const body = optionalString(formData, "body") ?? "Call action logged from Today.";
  if (!contactId && !dealId) throw new Error("contactId or dealId is required");

  const contact =
    contactId
      ? await db.contact.findUnique({ where: { id: contactId }, include: { phones: true } })
      : dealId
        ? (await db.deal.findUnique({
            where: { id: dealId },
            include: { participants: { include: { contact: { include: { phones: true } } } } },
          }))?.participants[0]?.contact
        : null;

  const message = await db.message.create({
    data: {
      workspaceId,
      contactId: contact?.id,
      channel: "call",
      direction: "outbound",
      status: "logged",
      body,
      sentAt: new Date(),
      metadata: { source: "today", phone: contact?.phones[0]?.phone ?? null },
    },
  });

  if (contact?.id) {
    await db.contact.update({
      where: { id: contact.id },
      data: {
        lastTouchAt: new Date(),
        nextAction: "Send follow-up message after call attempt",
        nextActionType: "sms",
        nextActionDueAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
        nextActionReason: "Call was logged from Today",
      },
    });
  }

  if (dealId) {
    await db.deal.update({
      where: { id: dealId },
      data: {
        nextAction: "Send client update after call attempt",
        nextActionDueAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
        riskLevel: "normal",
      },
    });
  }

  await writeAudit({ workspaceId, actorType: "user", action: "call.logged", targetType: "message", targetId: message.id }, db);
  revalidatePath("/today");
  if (contact?.id) revalidatePath(`/people/${contact.id}`);
  if (dealId) revalidatePath("/deals");
}

export async function snoozeContactAction(formData: FormData) {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const contactId = requiredString(formData, "contactId");
  const hours = Number(formData.get("hours") ?? 24);
  await db.contact.update({
    where: { id: contactId },
    data: {
      nextActionDueAt: new Date(Date.now() + hours * 60 * 60 * 1000),
      nextActionReason: `Snoozed for ${hours} hours`,
    },
  });
  await writeAudit({ workspaceId, actorType: "user", action: "contact.snoozed", targetType: "contact", targetId: contactId, metadata: { hours } }, db);
  revalidatePath("/today");
  revalidatePath(`/people/${contactId}`);
}

export async function assignContactAction(formData: FormData) {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const contactId = requiredString(formData, "contactId");
  const ownerId = optionalString(formData, "ownerId") ?? (await getDefaultOwnerId(workspaceId));
  if (!ownerId) throw new Error("No workspace user available to assign");

  await db.contact.update({
    where: { id: contactId },
    data: {
      ownerId,
      nextActionReason: "Assigned from Today",
    },
  });
  await writeAudit({ workspaceId, actorType: "user", actorId: ownerId, action: "contact.assigned", targetType: "contact", targetId: contactId }, db);
  revalidatePath("/today");
  revalidatePath(`/people/${contactId}`);
}

export async function snoozeDealAction(formData: FormData) {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const dealId = requiredString(formData, "dealId");
  const hours = Number(formData.get("hours") ?? 24);
  await db.deal.update({
    where: { id: dealId },
    data: {
      nextActionDueAt: new Date(Date.now() + hours * 60 * 60 * 1000),
      riskLevel: "normal",
    },
  });
  await writeAudit({ workspaceId, actorType: "user", action: "deal.snoozed", targetType: "deal", targetId: dealId, metadata: { hours } }, db);
  revalidatePath("/today");
  revalidatePath("/deals");
}

export async function assignDealAction(formData: FormData) {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const dealId = requiredString(formData, "dealId");
  const ownerId = optionalString(formData, "ownerId") ?? (await getDefaultOwnerId(workspaceId));
  if (!ownerId) throw new Error("No workspace user available to assign");

  const deal = await db.deal.findUnique({
    where: { id: dealId },
    include: { participants: true },
  });
  const contactId = deal?.primaryContactId ?? deal?.participants[0]?.contactId;
  if (contactId) {
    await db.contact.update({ where: { id: contactId }, data: { ownerId } });
  }
  await writeAudit({ workspaceId, actorType: "user", actorId: ownerId, action: "deal.assigned", targetType: "deal", targetId: dealId, metadata: { contactId } }, db);
  revalidatePath("/today");
  revalidatePath("/deals");
  if (contactId) revalidatePath(`/people/${contactId}`);
}

export async function completeLifecycleTouchAction(formData: FormData) {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const eventId = requiredString(formData, "eventId");
  const event = await db.clientLifecycleEvent.findUniqueOrThrow({
    where: { id: eventId },
    include: { contact: { include: { emails: true, phones: true } } },
  });
  const body = event.messageDraft ?? (await generateClientForLifeCheckin(event.contact));
  const channel = event.contact.phones[0] ? "sms" : "email";

  const message = await db.message.create({
    data: {
      workspaceId,
      contactId: event.contactId,
      channel,
      status: "sent_mock",
      body,
      aiGenerated: true,
      approvedByUser: true,
      sentAt: new Date(),
      metadata: { provider: "mock", lifecycleEventId: event.id },
    },
  });

  await db.clientLifecycleEvent.update({
    where: { id: eventId },
    data: { status: "done" },
  });
  await db.contact.update({
    where: { id: event.contactId },
    data: {
      lastTouchAt: new Date(),
      nextAction: "Next quarterly client-for-life touch",
      nextActionType: "email",
      nextActionDueAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      nextActionReason: "Client-for-life touch completed",
    },
  });
  await writeAudit({ workspaceId, actorType: "user", action: "client_lifecycle.completed", targetType: "client_lifecycle_event", targetId: eventId, metadata: { messageId: message.id } }, db);
  revalidatePath("/today");
  revalidatePath(`/people/${event.contactId}`);
}

export async function approveDraftAction(formData: FormData) {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const messageId = requiredString(formData, "messageId");
  const message = await approveAndSendMessage(messageId, db);
  if (message.contactId) {
    await db.contact.update({
      where: { id: message.contactId },
      data: {
        lastTouchAt: new Date(),
        nextAction: "Wait for reply; follow up if no response",
        nextActionType: "task",
        nextActionDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        nextActionReason: "Approved message sent",
      },
    });
  }
  await writeAudit({ workspaceId, actorType: "user", action: "message.approved", targetType: "message", targetId: messageId }, db);
  revalidatePath("/today");
}

async function createClientForLifeEvents(workspaceId: string, contactId: string, db: ReturnType<typeof getPrisma>) {
  const day = 24 * 60 * 60 * 1000;
  await db.clientLifecycleEvent.createMany({
    data: [
      { workspaceId, contactId, eventType: "30_day_checkin", dueAt: new Date(Date.now() + 30 * day), notes: "30-day post-close check-in." },
      { workspaceId, contactId, eventType: "90_day_checkin", dueAt: new Date(Date.now() + 90 * day), notes: "90-day check-in." },
      { workspaceId, contactId, eventType: "quarterly_valuation", dueAt: new Date(Date.now() + 90 * day), notes: "Quarterly value and market update." },
      { workspaceId, contactId, eventType: "annual_referral_ask", dueAt: new Date(Date.now() + 365 * day), notes: "Annual referral ask." },
      { workspaceId, contactId, eventType: "home_anniversary", dueAt: new Date(Date.now() + 365 * day), notes: "Home anniversary touch." },
    ],
  });
}
