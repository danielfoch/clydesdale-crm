"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createNewsletterDraftFromPost, importRssSource } from "@/lib/content";
import { intakeLead } from "@/lib/intake";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspaceId } from "@/lib/workspace";
import { writeAudit } from "@/lib/audit";
import { generateClientForLifeCheckin } from "@/lib/ai";
import { generateCampaignRecipeWithAi } from "@/lib/campaign-ai";
import { coreCampaignTypes, defaultCampaignRecipe, isCoreCampaignType, runDueCampaignSteps, upsertCampaignRecipe } from "@/lib/campaigns";
import { executeContactAction } from "@/lib/contact-actions";
import { loopTaskType } from "@/lib/loop-checklists";
import { approveAndSendMessage, createMessageDraft, startTwilioVoiceCall } from "@/lib/messages";
import { encryptSecret } from "@/lib/secrets";

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

export async function submitMotivationQuoteAction(formData: FormData) {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const text = requiredString(formData, "text");
  const source = optionalString(formData, "source") ?? "User";
  const submittedBy = optionalString(formData, "submittedBy") ?? "CRM user";
  const quote = await db.motivationQuote.upsert({
    where: { workspaceId_text: { workspaceId, text } },
    create: { workspaceId, text, source, submittedBy },
    update: { isActive: true },
  });
  await writeAudit({ workspaceId, actorType: "user", action: "motivation_quote.submitted", targetType: "motivation_quote", targetId: quote.id }, db);
  revalidatePath("/today");
}

export async function voteMotivationQuoteAction(formData: FormData) {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const quoteId = requiredString(formData, "quoteId");
  const direction = requiredString(formData, "direction");
  if (direction !== "up" && direction !== "down") {
    throw new Error("direction must be up or down");
  }
  const existingQuote = await db.motivationQuote.findFirst({
    where: { id: quoteId, workspaceId },
    select: { id: true },
  });
  if (!existingQuote) {
    throw new Error("Quote not found");
  }
  const quote = await db.motivationQuote.update({
    where: { id: quoteId },
    data: direction === "up" ? { upvotes: { increment: 1 } } : { downvotes: { increment: 1 } },
  });
  await writeAudit({ workspaceId, actorType: "user", action: `motivation_quote.${direction === "up" ? "upvoted" : "downvoted"}`, targetType: "motivation_quote", targetId: quote.id }, db);
  revalidatePath("/today");
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
  revalidatePath("/pipeline");
  revalidatePath("/deals");
  if (contactId) revalidatePath(`/people/${contactId}`);
}

export async function createDealAction(formData: FormData) {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const contactId = requiredString(formData, "contactId");
  const stage = formData.get("stage")?.toString() || "met_with_client";
  const deal = await db.deal.create({
    data: {
      workspaceId,
      type: requiredString(formData, "type") as never,
      name: requiredString(formData, "name"),
      stage,
      valueCents: Number(formData.get("valueCents") ?? 0),
      primaryContactId: contactId,
      nextAction: formData.get("nextAction")?.toString() || "Confirm client update and next milestone",
      nextActionDueAt: formData.get("nextActionDueAt") ? new Date(requiredString(formData, "nextActionDueAt")) : new Date(Date.now() + 24 * 60 * 60 * 1000),
      deadline: formData.get("deadline") ? new Date(requiredString(formData, "deadline")) : undefined,
      riskLevel: formData.get("riskLevel")?.toString() || "normal",
      participants: { create: { contactId, role: "client" } },
      stageHistory: { create: { toStage: stage } },
    },
  });
  await db.contact.update({
    where: { id: contactId },
    data: {
      stage: "active_client",
      nextAction: "Work this relationship from the Deals pipeline",
      nextActionType: "deal",
      nextActionDueAt: deal.nextActionDueAt,
      nextActionReason: "Converted to client deal",
    },
  });
  await writeAudit({ workspaceId, actorType: "user", action: "deal.created", targetType: "deal", targetId: deal.id }, db);
  revalidatePath("/pipeline");
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
  await runDueCampaignSteps(workspaceId, db, enrollment.id);
  await writeAudit({ workspaceId, actorType: "user", action: "campaign.enrolled", targetType: "campaign_enrollment", targetId: enrollment.id }, db);
  revalidatePath(`/people/${contactId}`);
}

export async function updateCampaignStepAction(formData: FormData) {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const stepId = requiredString(formData, "stepId");
  const step = await db.campaignStep.update({
    where: { id: stepId },
    data: {
      delayDays: Number(formData.get("delayDays") ?? 0),
      channel: requiredString(formData, "channel") as never,
      title: optionalString(formData, "title"),
      subject: optionalString(formData, "subject"),
      body: requiredString(formData, "body"),
      isActive: formData.get("isActive") === "on",
      stopOnReply: formData.get("stopOnReply") === "on",
      requiresApproval: formData.get("requiresApproval") === "on",
    },
  });
  await writeAudit({ workspaceId, actorType: "user", action: "campaign_step.updated", targetType: "campaign_step", targetId: step.id }, db);
  revalidatePath("/campaigns");
}

export async function generateCampaignRecipeAction(formData: FormData) {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const contactType = requiredString(formData, "contactType");
  if (!isCoreCampaignType(contactType)) throw new Error("Unsupported campaign type");
  const prompt = [
    optionalString(formData, "goal") ? `Goal: ${optionalString(formData, "goal")}` : undefined,
    optionalString(formData, "tone") ? `Tone: ${optionalString(formData, "tone")}` : undefined,
    optionalString(formData, "numberOfSteps") ? `Number of steps: ${optionalString(formData, "numberOfSteps")}` : undefined,
    optionalString(formData, "totalDurationDays") ? `Total duration days: ${optionalString(formData, "totalDurationDays")}` : undefined,
    formData.getAll("channels").length ? `Channels: ${formData.getAll("channels").join(", ")}` : undefined,
    optionalString(formData, "prompt"),
  ].filter(Boolean).join("\n");
  const { recipe, provider, error } = await generateCampaignRecipeWithAi(workspaceId, contactType, prompt, db);
  const campaign = await upsertCampaignRecipe(workspaceId, recipe, db);
  await writeAudit(
    {
      workspaceId,
      actorType: provider === "openai" ? "ai" : "system",
      action: "campaign.ai_generated",
      targetType: "campaign",
      targetId: campaign.id,
      metadata: { contactType, provider, error },
    },
    db,
  );
  revalidatePath("/campaigns");
  revalidatePath("/settings");
}

export async function ensureCoreCampaignsAction() {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  for (const contactType of coreCampaignTypes) {
    const exists = await db.campaign.findFirst({ where: { workspaceId, contactType } });
    if (!exists) await upsertCampaignRecipe(workspaceId, defaultCampaignRecipe(contactType), db);
  }
  revalidatePath("/campaigns");
}

export async function runCampaignsNowAction() {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const result = await runDueCampaignSteps(workspaceId, db);
  await writeAudit({ workspaceId, actorType: "user", action: "campaigns.run_due_steps", targetType: "campaign", targetId: workspaceId, metadata: result }, db);
  revalidatePath("/campaigns");
  revalidatePath("/today");
}

export async function saveAiProviderSettingsAction(formData: FormData) {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const existing = await db.aiProviderSetting.findUnique({ where: { workspaceId_provider: { workspaceId, provider: "openai" } } });
  const apiKey = optionalString(formData, "apiKey");
  const setting = await db.aiProviderSetting.upsert({
    where: { workspaceId_provider: { workspaceId, provider: "openai" } },
    create: {
      workspaceId,
      provider: "openai",
      apiKey: apiKey ? encryptSecret(apiKey) : undefined,
      model: optionalString(formData, "model") ?? "gpt-4o-mini",
      baseUrl: optionalString(formData, "baseUrl"),
    },
    update: {
      apiKey: apiKey ? encryptSecret(apiKey) : existing?.apiKey,
      model: optionalString(formData, "model") ?? existing?.model ?? "gpt-4o-mini",
      baseUrl: optionalString(formData, "baseUrl"),
    },
  });
  await writeAudit({ workspaceId, actorType: "user", action: "ai_provider.saved", targetType: "ai_provider_setting", targetId: setting.id, metadata: { provider: "openai", hasApiKey: Boolean(setting.apiKey) } }, db);
  revalidatePath("/settings");
  revalidatePath("/campaigns");
}

export async function removeAiProviderKeyAction() {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const setting = await db.aiProviderSetting.update({
    where: { workspaceId_provider: { workspaceId, provider: "openai" } },
    data: { apiKey: null },
  });
  await writeAudit({ workspaceId, actorType: "user", action: "ai_provider.key_removed", targetType: "ai_provider_setting", targetId: setting.id, metadata: { provider: "openai" } }, db);
  revalidatePath("/settings");
  revalidatePath("/campaigns");
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
  revalidatePath("/pipeline");
  revalidatePath("/today");
}

export async function markTaskDoneAction(formData: FormData) {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const taskId = requiredString(formData, "taskId");
  const task = await db.task.update({ where: { id: taskId }, data: { status: "done", completedAt: new Date() } });
  await writeAudit({ workspaceId, actorType: "user", action: "task.completed", targetType: "task", targetId: taskId }, db);
  revalidatePath("/today");
  revalidatePath("/pipeline");
  revalidatePath("/deals");
  if (task.contactId) revalidatePath(`/people/${task.contactId}`);
}

export async function completeLoopChecklistItemAction(formData: FormData) {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const scope = requiredString(formData, "scope") as "pipeline" | "deal";
  const itemKey = requiredString(formData, "itemKey");
  const stage = requiredString(formData, "stage");
  const label = requiredString(formData, "label");
  const contactId = optionalString(formData, "contactId");
  const dealId = optionalString(formData, "dealId");
  const type = loopTaskType(scope, stage, itemKey);

  if (!contactId && !dealId) throw new Error("contactId or dealId is required");

  const existing = await db.task.findFirst({
    where: {
      workspaceId,
      type,
      contactId: contactId ?? undefined,
      dealId: dealId ?? undefined,
    },
  });

  if (existing?.status === "done") {
    revalidatePath("/today");
    revalidatePath("/pipeline");
    revalidatePath("/deals");
    if (contactId) revalidatePath(`/people/${contactId}`);
    return;
  }

  const task = existing
    ? await db.task.update({ where: { id: existing.id }, data: { status: "done", completedAt: new Date() } })
    : await db.task.create({
        data: {
          workspaceId,
          contactId: contactId ?? undefined,
          dealId: dealId ?? undefined,
          type,
          title: label,
          status: "done",
          completedAt: new Date(),
          createdByAi: true,
        },
      });

  const deal = dealId ? await db.deal.findUnique({ where: { id: dealId }, include: { participants: true } }) : null;
  const scoreContactId = contactId ?? deal?.primaryContactId ?? deal?.participants[0]?.contactId;
  if (scoreContactId) {
    const completedCount = await db.task.count({
      where: {
        workspaceId,
        contactId: scoreContactId,
        type: { startsWith: "loop:" },
        status: "done",
      },
    });
    await db.contact.update({
      where: { id: scoreContactId },
      data: {
        urgencyScore: { increment: 5 },
        nextActionConfidence: Math.min(95, 70 + completedCount * 4),
        nextActionReason: `Loop progress: ${label}`,
      },
    });
    const updated = await db.contact.findUnique({ where: { id: scoreContactId }, select: { urgencyScore: true } });
    if (updated && updated.urgencyScore > 100) {
      await db.contact.update({ where: { id: scoreContactId }, data: { urgencyScore: 100 } });
    }
  }

  if (dealId) {
    await db.deal.update({
      where: { id: dealId },
      data: {
        riskLevel: "normal",
        nextAction: `Next checklist step after: ${label}`,
        nextActionDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  }

  await writeAudit({ workspaceId, actorType: "user", action: "loop_checklist.completed", targetType: "task", targetId: task.id, metadata: { scope, stage, itemKey, label, contactId, dealId } }, db);
  revalidatePath("/today");
  revalidatePath("/pipeline");
  revalidatePath("/deals");
  if (scoreContactId) revalidatePath(`/people/${scoreContactId}`);
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
  const phone = contact?.phones[0]?.phone;
  let callMetadata: Record<string, string | null> = { source: "crm", phone: phone ?? null, provider: "log" };
  let status = "logged";

  if (phone) {
    try {
      const twilioCall = await startTwilioVoiceCall(phone);
      if (twilioCall) {
        status = "initiated";
        callMetadata = {
          source: "crm",
          phone,
          provider: "twilio",
          twilioCallSid: twilioCall.sid,
          twilioStatus: twilioCall.status,
        };
      }
    } catch (error) {
      status = "failed_twilio";
      callMetadata = {
        source: "crm",
        phone,
        provider: "twilio",
        error: error instanceof Error ? error.message : "Unknown Twilio Voice error",
      };
    }
  }

  const message = await db.message.create({
    data: {
      workspaceId,
      contactId: contact?.id,
      channel: "call",
      direction: "outbound",
      status,
      body,
      sentAt: new Date(),
      metadata: callMetadata,
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

  await writeAudit({ workspaceId, actorType: "user", action: status === "initiated" ? "call.started_twilio" : "call.logged", targetType: "message", targetId: message.id }, db);
  revalidatePath("/today");
  revalidatePath("/pipeline");
  if (contact?.id) revalidatePath(`/people/${contact.id}`);
  if (dealId) revalidatePath("/deals");
}

export async function queueVoicemailDropAction(formData: FormData) {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const contactId = requiredString(formData, "contactId");
  await executeContactAction(
    {
      workspaceId,
      contactId,
      action: "voicemail_drop",
      body: optionalString(formData, "body") ?? "Voicemail drop queued from CRM.",
    },
    db,
  );
  revalidatePath("/today");
  revalidatePath("/pipeline");
  revalidatePath(`/people/${contactId}`);
}

export async function queueAiIsaCallAction(formData: FormData) {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const contactId = requiredString(formData, "contactId");
  await executeContactAction(
    {
      workspaceId,
      contactId,
      action: "ai_isa_call",
      body: optionalString(formData, "body") ?? "AI ISA call queued from CRM.",
    },
    db,
  );
  revalidatePath("/today");
  revalidatePath("/pipeline");
  revalidatePath(`/people/${contactId}`);
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
  revalidatePath("/pipeline");
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
  revalidatePath("/pipeline");
  revalidatePath(`/people/${contactId}`);
}

export async function updateContactPipelineStageAction(formData: FormData) {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const contactId = requiredString(formData, "contactId");
  const stage = requiredString(formData, "stage");
  const nextActionByStage: Record<string, { nextAction: string; nextActionType: string; reason: string }> = {
    new: {
      nextAction: "Send first response",
      nextActionType: "sms",
      reason: "Moved to Lead",
    },
    nurturing: {
      nextAction: "Continue the conversation and confirm motivation",
      nextActionType: "follow_up",
      reason: "Moved to Relationship",
    },
    appointment_set: {
      nextAction: "Push toward appointment or signed client plan",
      nextActionType: "call",
      reason: "Moved to Prospect",
    },
    active_client: {
      nextAction: "Create or update the deal",
      nextActionType: "deal",
      reason: "Moved to Client",
    },
  };
  const next = nextActionByStage[stage] ?? nextActionByStage.nurturing;

  const contact = await db.contact.update({
    where: { id: contactId },
    data: {
      stage: stage as never,
      nextAction: next.nextAction,
      nextActionType: next.nextActionType,
      nextActionDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      nextActionReason: next.reason,
    },
    include: { primaryDeals: { where: { stage: { not: "closed" } }, take: 1 } },
  });
  if (stage === "active_client" && contact.primaryDeals.length === 0) {
    const dealType = ["buyer", "tenant", "seller", "landlord"].includes(contact.type) ? contact.type : "buyer";
    await db.deal.create({
      data: {
        workspaceId,
        type: dealType as never,
        primaryContactId: contact.id,
        name: `${contact.name} client work`,
        stage: "met_with_client",
        nextAction: "Confirm client criteria and deal plan",
        nextActionDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        participants: { create: { contactId: contact.id, role: "client" } },
        stageHistory: { create: { toStage: "met_with_client" } },
      },
    });
  }
  if (stage === "active_client") {
    await db.campaignEnrollment.updateMany({
      where: { contactId, status: "active", campaign: { workspaceId, contactType: { in: [...coreCampaignTypes] } } },
      data: { status: "exited", exitedAt: new Date() },
    });
  }
  await writeAudit({ workspaceId, actorType: "user", action: "contact.pipeline_stage_changed", targetType: "contact", targetId: contactId, metadata: { stage } }, db);
  revalidatePath("/pipeline");
  revalidatePath("/deals");
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

export async function updateDealPipelineStageAction(formData: FormData) {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const dealId = requiredString(formData, "dealId");
  const stage = requiredString(formData, "stage");
  const current = await db.deal.findUnique({ where: { id: dealId } });
  const nextActionByStage: Record<string, string> = {
    met_with_client: "Confirm criteria, motivation, and next milestone",
    sending_listings: "Send the next useful listing, CMA, or market update",
    active_client: "Confirm the next showing, listing, or client update",
    transaction: "Clear the next transaction deadline",
  };

  await db.deal.update({
    where: { id: dealId },
    data: {
      stage,
      nextAction: nextActionByStage[stage] ?? "Confirm next deal step",
      nextActionDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      riskLevel: stage === "transaction" ? "high" : "normal",
      stageHistory: { create: { fromStage: current?.stage, toStage: stage } },
    },
  });
  await writeAudit({ workspaceId, actorType: "user", action: "deal.pipeline_stage_changed", targetType: "deal", targetId: dealId, metadata: { stage } }, db);
  revalidatePath("/deals");
  revalidatePath("/today");
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

export async function draftContactMessageAction(formData: FormData) {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const contactId = requiredString(formData, "contactId");
  const channel = requiredString(formData, "channel") as "sms" | "email";
  const subject = optionalString(formData, "subject");
  const body = requiredString(formData, "body");

  const message = await createMessageDraft(
    {
      workspaceId,
      contactId,
      channel,
      subject,
      body,
      aiGenerated: false,
      metadata: { source: "contact_profile" },
    },
    db,
  );

  await db.contact.update({
    where: { id: contactId },
    data: {
      nextAction: channel === "sms" ? "Approve and send drafted SMS" : "Approve and send drafted email",
      nextActionType: channel,
      nextActionDueAt: new Date(),
      nextActionReason: "Manual message drafted from contact profile",
    },
  });
  await writeAudit({ workspaceId, actorType: "user", action: "message.manual_draft_created", targetType: "message", targetId: message.id }, db);
  revalidatePath("/today");
  revalidatePath("/pipeline");
  revalidatePath("/deals");
  revalidatePath(`/people/${contactId}`);
}

export async function sendContactMessageAction(formData: FormData) {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const contactId = requiredString(formData, "contactId");
  const channel = requiredString(formData, "channel") as "sms" | "email";
  const subject = optionalString(formData, "subject");
  const body = requiredString(formData, "body");

  const draft = await createMessageDraft(
    {
      workspaceId,
      contactId,
      channel,
      subject,
      body,
      aiGenerated: false,
      metadata: { source: "contact_profile_send" },
    },
    db,
  );
  const sent = await approveAndSendMessage(draft.id, db);

  await db.contact.update({
    where: { id: contactId },
    data: {
      lastTouchAt: new Date(),
      nextAction: "Wait for reply; follow up if no response",
      nextActionType: "task",
      nextActionDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      nextActionReason: sent.status === "failed_twilio" ? "Text failed in Twilio; review provider settings" : sent.status === "sent" ? "Message sent from contact profile" : "Message logged from contact profile",
    },
  });
  await writeAudit({ workspaceId, actorType: "user", action: "message.manual_sent", targetType: "message", targetId: sent.id }, db);
  revalidatePath("/today");
  revalidatePath("/pipeline");
  revalidatePath("/deals");
  revalidatePath(`/people/${contactId}`);
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
        nextActionReason: message.status === "failed_twilio" ? "Text failed in Twilio; review provider settings" : "Approved message sent",
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
