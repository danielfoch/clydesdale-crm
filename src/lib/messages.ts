import type { MessageChannel, Prisma } from "@prisma/client";
import { writeAudit } from "./audit";
import { getPrisma, type DbClient } from "./prisma";

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
