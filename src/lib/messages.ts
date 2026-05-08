import type { MessageChannel, Prisma } from "@prisma/client";
import { writeAudit } from "./audit";
import { getPrisma, type DbClient } from "./prisma";

function hasTwilioSmsConfig() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
}

function hasTwilioVoiceConfig() {
  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER &&
      process.env.TWILIO_AGENT_NUMBER,
  );
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

async function sendTwilioSms(to: string, body: string) {
  const twilio = (await import("twilio")).default;
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  return client.messages.create({
    from: process.env.TWILIO_FROM_NUMBER,
    to,
    body,
  });
}

export async function startTwilioVoiceCall(to: string) {
  if (!hasTwilioVoiceConfig()) return null;

  const twilio = (await import("twilio")).default;
  const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  const from = process.env.TWILIO_FROM_NUMBER!;
  const agentNumber = process.env.TWILIO_AGENT_NUMBER!;

  return client.calls.create({
    to: agentNumber,
    from,
    twiml: `<Response><Say>Connecting your Clydesdale CRM call.</Say><Dial callerId="${escapeXml(from)}">${escapeXml(to)}</Dial></Response>`,
  });
}

export async function canSendMarketing(contactId: string, channel: MessageChannel, db: DbClient = getPrisma()) {
  const consent = await db.contactConsent.findUnique({
    where: { contactId_channel: { contactId, channel } },
  });

  return consent?.status !== "opted_out";
}

export async function createMessageDraft(
  input: {
    workspaceId: string;
    contactId?: string;
    channel: MessageChannel;
    subject?: string;
    body: string;
    aiGenerated?: boolean;
    metadata?: Prisma.InputJsonValue;
  },
  db: DbClient = getPrisma(),
) {
  const message = await db.message.create({
    data: {
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      channel: input.channel,
      subject: input.subject,
      body: input.body,
      aiGenerated: input.aiGenerated ?? false,
      metadata: input.metadata ?? {},
      status: "draft",
    },
  });

  await writeAudit(
    {
      workspaceId: input.workspaceId,
      actorType: input.aiGenerated ? "ai" : "system",
      action: "message.drafted",
      targetType: "message",
      targetId: message.id,
      metadata: { channel: input.channel, contactId: input.contactId },
    },
    db,
  );

  return message;
}

export async function approveAndSendMessage(messageId: string, db: DbClient = getPrisma()) {
  const message = await db.message.findUniqueOrThrow({
    where: { id: messageId },
    include: {
      contact: {
        include: {
          phones: true,
          consents: true,
        },
      },
    },
  });

  if (!message.contactId || !message.contact) {
    return db.message.update({
      where: { id: messageId },
      data: {
        approvedByUser: true,
        status: "sent_mock",
        sentAt: new Date(),
        metadata: { provider: "mock", reason: "no_contact" },
      },
    });
  }

  const consent = message.contact.consents.find((item) => item.channel === message.channel);
  if (consent?.status === "opted_out") {
    const blocked = await db.message.update({
      where: { id: messageId },
      data: {
        approvedByUser: true,
        status: "blocked_opt_out",
        metadata: { provider: "none", blockedReason: "opted_out" },
      },
    });

    await writeAudit(
      {
        workspaceId: message.workspaceId,
        actorType: "system",
        action: "message.blocked_opt_out",
        targetType: "message",
        targetId: message.id,
        metadata: { channel: message.channel, contactId: message.contactId },
      },
      db,
    );
    return blocked;
  }

  if (message.channel === "sms" && hasTwilioSmsConfig() && message.contact.phones[0]?.phone) {
    const sent = await sendTwilioSms(message.contact.phones[0].phone, message.body);
    const updated = await db.message.update({
      where: { id: messageId },
      data: {
        approvedByUser: true,
        status: "sent",
        sentAt: new Date(),
        metadata: {
          provider: "twilio",
          twilioSid: sent.sid,
          twilioStatus: sent.status,
        },
      },
    });

    await writeAudit(
      {
        workspaceId: message.workspaceId,
        actorType: "user",
        action: "message.sent_twilio",
        targetType: "message",
        targetId: message.id,
        metadata: { channel: message.channel, contactId: message.contactId, twilioSid: sent.sid },
      },
      db,
    );
    return updated;
  }

  const updated = await db.message.update({
    where: { id: messageId },
    data: {
      approvedByUser: true,
      status: "sent_mock",
      sentAt: new Date(),
      metadata: {
        provider: "mock",
        reason: message.channel === "sms" ? "missing_twilio_config_or_phone" : "email_provider_not_configured",
      },
    },
  });

  await writeAudit(
    {
      workspaceId: message.workspaceId,
      actorType: "user",
      action: "message.sent_mock",
      targetType: "message",
      targetId: message.id,
      metadata: { channel: message.channel, contactId: message.contactId },
    },
    db,
  );

  return updated;
}

export async function mockSendOrDraft(
  input: {
    workspaceId: string;
    contactId: string;
    channel: MessageChannel;
    subject?: string;
    body: string;
    marketing?: boolean;
    autoSend?: boolean;
    aiGenerated?: boolean;
  },
  db: DbClient = getPrisma(),
) {
  if (input.marketing && !(await canSendMarketing(input.contactId, input.channel, db))) {
    return createMessageDraft(
      {
        ...input,
        body: `[Consent blocked send]\n\n${input.body}`,
        metadata: { blockedReason: "opted_out" },
      },
      db,
    );
  }

  const message = await db.message.create({
    data: {
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      channel: input.channel,
      subject: input.subject,
      body: input.body,
      aiGenerated: input.aiGenerated ?? false,
      status: input.autoSend ? "sent_mock" : "draft",
      sentAt: input.autoSend ? new Date() : undefined,
      metadata: { provider: "mock" },
    },
  });

  await writeAudit(
    {
      workspaceId: input.workspaceId,
      actorType: input.aiGenerated ? "ai" : "system",
      action: input.autoSend ? "message.sent_mock" : "message.drafted",
      targetType: "message",
      targetId: message.id,
      metadata: { channel: input.channel, contactId: input.contactId },
    },
    db,
  );

  return message;
}
