import { writeAudit } from "./audit";
import { approveAndSendMessage, createMessageDraft, startTwilioVoiceCall } from "./messages";
import { type DbClient } from "./prisma";

export type ContactActionKind = "call" | "send_text" | "voicemail_drop" | "ai_isa_call";

export async function executeContactAction(
  input: {
    workspaceId: string;
    contactId: string;
    action: ContactActionKind;
    body?: string;
    subject?: string;
  },
  db: DbClient,
) {
  const contact = await db.contact.findUniqueOrThrow({
    where: { id: input.contactId },
    include: { phones: true, emails: true },
  });
  const phone = contact.phones[0]?.phone;

  if (input.action === "send_text") {
    const draft = await createMessageDraft(
      {
        workspaceId: input.workspaceId,
        contactId: contact.id,
        channel: "sms",
        body: input.body ?? `Hi ${contact.name.split(" ")[0] || "there"}, quick check-in. Are you free for a quick call today?`,
        metadata: { source: "contact_action_api" },
      },
      db,
    );
    const message = await approveAndSendMessage(draft.id, db);
    await db.contact.update({
      where: { id: contact.id },
      data: {
        lastTouchAt: new Date(),
        nextAction: "Wait for reply; follow up if no response",
        nextActionType: "task",
        nextActionDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        nextActionReason: "Text sent from contact action",
      },
    });
    await writeAudit({ workspaceId: input.workspaceId, actorType: "agent", action: "contact_action.text_sent", targetType: "message", targetId: message.id }, db);
    return { ok: true, message, providerStatus: message.status };
  }

  if (input.action === "voicemail_drop" || input.action === "ai_isa_call") {
    const isVoicemail = input.action === "voicemail_drop";
    const message = await db.message.create({
      data: {
        workspaceId: input.workspaceId,
        contactId: contact.id,
        channel: "call",
        direction: "outbound",
        status: isVoicemail ? "queued_voicemail_drop" : "queued_ai_isa_call",
        body: input.body ?? (isVoicemail ? "Voicemail drop queued." : "AI ISA call queued."),
        metadata: {
          provider: isVoicemail ? "slybroadcast_placeholder" : "vapi_placeholder",
          phone: phone ?? null,
        },
      },
    });
    await db.contact.update({
      where: { id: contact.id },
      data: {
        lastTouchAt: new Date(),
        nextAction: isVoicemail ? "Review voicemail drop outcome" : "Review AI ISA call outcome",
        nextActionType: "task",
        nextActionDueAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        nextActionReason: isVoicemail ? "Voicemail drop queued" : "AI ISA call queued",
      },
    });
    await writeAudit(
      {
        workspaceId: input.workspaceId,
        actorType: "agent",
        action: isVoicemail ? "contact_action.voicemail_drop_queued" : "contact_action.ai_isa_call_queued",
        targetType: "message",
        targetId: message.id,
      },
      db,
    );
    return { ok: true, message, providerStatus: message.status };
  }

  let status = "logged";
  let metadata: Record<string, string | null> = { source: "contact_action_api", phone: phone ?? null, provider: "log" };

  if (phone) {
    try {
      const call = await startTwilioVoiceCall(phone);
      if (call) {
        status = "initiated";
        metadata = {
          source: "contact_action_api",
          phone,
          provider: "twilio",
          twilioCallSid: call.sid,
          twilioStatus: call.status,
        };
      }
    } catch (error) {
      status = "failed_twilio";
      metadata = {
        source: "contact_action_api",
        phone,
        provider: "twilio",
        error: error instanceof Error ? error.message : "Unknown Twilio Voice error",
      };
    }
  }

  const message = await db.message.create({
    data: {
      workspaceId: input.workspaceId,
      contactId: contact.id,
      channel: "call",
      direction: "outbound",
      status,
      body: input.body ?? "Call started from contact action.",
      sentAt: new Date(),
      metadata,
    },
  });
  await db.contact.update({
    where: { id: contact.id },
    data: {
      lastTouchAt: new Date(),
      nextAction: "Send follow-up message after call attempt",
      nextActionType: "sms",
      nextActionDueAt: new Date(Date.now() + 4 * 60 * 60 * 1000),
      nextActionReason: "Call started from contact action",
    },
  });
  await writeAudit({ workspaceId: input.workspaceId, actorType: "agent", action: status === "initiated" ? "contact_action.call_started" : "contact_action.call_logged", targetType: "message", targetId: message.id }, db);
  return { ok: true, message, providerStatus: status };
}
