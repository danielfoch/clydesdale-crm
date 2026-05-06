"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createNewsletterDraftFromPost, importRssSource } from "@/lib/content";
import { intakeLead } from "@/lib/intake";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspaceId } from "@/lib/workspace";
import { writeAudit } from "@/lib/audit";

function requiredString(formData: FormData, key: string) {
  const value = formData.get(key);
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required`);
  return value.trim();
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

export async function approveDraftAction(formData: FormData) {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const messageId = requiredString(formData, "messageId");
  const message = await db.message.update({
    where: { id: messageId },
    data: { approvedByUser: true, status: "sent_mock", sentAt: new Date() },
  });
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
  await writeAudit({ workspaceId, actorType: "user", action: "message.approved_sent", targetType: "message", targetId: messageId }, db);
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
