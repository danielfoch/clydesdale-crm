import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { suggestNextAction } from "./ai";
import { writeAudit } from "./audit";
import { createMessageDraft } from "./messages";
import { getPrisma, type DbClient } from "./prisma";
import { getDefaultWorkspaceId } from "./workspace";

export const allowedAgentCommands = [
  "create_note",
  "draft_email",
  "draft_sms",
  "create_task",
  "update_stage",
  "start_campaign",
  "suggest_next_action",
  "request_human_approval",
] as const;

export const agentCommandSchema = z.object({
  command: z.enum(allowedAgentCommands),
  contactId: z.string().optional(),
  dealId: z.string().optional(),
  campaignId: z.string().optional(),
  body: z.string().optional(),
  title: z.string().optional(),
  subject: z.string().optional(),
  stage: z.string().optional(),
  dueAt: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function executeAgentCommand(
  raw: unknown,
  options: { workspaceId?: string; db?: DbClient } = {},
) {
  const db = options.db ?? getPrisma();
  const workspaceId = options.workspaceId ?? (await getDefaultWorkspaceId());
  const input = agentCommandSchema.parse(raw);
  let result: Record<string, unknown> = {};

  switch (input.command) {
    case "create_note": {
      if (!input.contactId || !input.body) throw new Error("contactId and body are required");
      const note = await db.contactNote.create({
        data: { contactId: input.contactId, body: input.body, createdBy: "agent" },
      });
      result = { noteId: note.id };
      break;
    }

    case "draft_email":
    case "draft_sms": {
      if (!input.contactId || !input.body) throw new Error("contactId and body are required");
      const message = await createMessageDraft(
        {
          workspaceId,
          contactId: input.contactId,
          channel: input.command === "draft_email" ? "email" : "sms",
          subject: input.subject,
          body: input.body,
          aiGenerated: true,
          metadata: { agentCommand: input.command },
        },
        db,
      );
      result = { messageId: message.id };
      break;
    }

    case "create_task": {
      if (!input.contactId || !input.title) throw new Error("contactId and title are required");
      const task = await db.task.create({
        data: {
          workspaceId,
          contactId: input.contactId,
          title: input.title,
          body: input.body,
          dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
        },
      });
      result = { taskId: task.id };
      break;
    }

    case "update_stage": {
      if (!input.stage) throw new Error("stage is required");
      if (input.contactId) {
        const contact = await db.contact.update({
          where: { id: input.contactId },
          data: {
            stage: input.stage as never,
            nextAction: input.body ?? `Confirm next action after stage changed to ${input.stage}`,
            nextActionDueAt: input.dueAt ? new Date(input.dueAt) : new Date(Date.now() + 24 * 60 * 60 * 1000),
            nextActionReason: "External agent updated stage",
          },
        });
        result = { contactId: contact.id, stage: contact.stage };
      } else if (input.dealId) {
        const current = await db.deal.findUniqueOrThrow({ where: { id: input.dealId } });
        const deal = await db.deal.update({
          where: { id: input.dealId },
          data: {
            stage: input.stage,
            nextAction: input.body ?? `Confirm next step for ${input.stage}`,
            nextActionDueAt: input.dueAt ? new Date(input.dueAt) : new Date(Date.now() + 24 * 60 * 60 * 1000),
            stageHistory: { create: { fromStage: current.stage, toStage: input.stage } },
          },
        });
        result = { dealId: deal.id, stage: deal.stage };
      } else {
        throw new Error("contactId or dealId is required");
      }
      break;
    }

    case "start_campaign": {
      if (!input.contactId || !input.campaignId) throw new Error("contactId and campaignId are required");
      const enrollment = await db.campaignEnrollment.upsert({
        where: { campaignId_contactId: { campaignId: input.campaignId, contactId: input.contactId } },
        create: { campaignId: input.campaignId, contactId: input.contactId },
        update: { status: "active" },
      });
      result = { enrollmentId: enrollment.id };
      break;
    }

    case "suggest_next_action": {
      if (!input.contactId) throw new Error("contactId is required");
      const contact = await db.contact.findUniqueOrThrow({ where: { id: input.contactId } });
      const nextAction = input.body ?? (await suggestNextAction(contact));
      await db.contact.update({
        where: { id: input.contactId },
        data: {
          nextAction,
          nextActionDueAt: input.dueAt ? new Date(input.dueAt) : new Date(Date.now() + 24 * 60 * 60 * 1000),
          nextActionReason: "External agent suggested next action",
          nextActionConfidence: 80,
        },
      });
      result = { contactId: input.contactId, nextAction };
      break;
    }

    case "request_human_approval":
      result = { approvalRequired: true, title: input.title ?? "Agent requested approval" };
      break;
  }

  const command = await db.agentCommand.create({
    data: {
      workspaceId,
      command: input.command,
      payload: input as Prisma.InputJsonValue,
      result: result as Prisma.InputJsonValue,
      status: "completed",
    },
  });

  await writeAudit(
    {
      workspaceId,
      actorType: "agent",
      action: `agent.${input.command}`,
      targetType: "agent_command",
      targetId: command.id,
      metadata: result as Prisma.InputJsonValue,
    },
    db,
  );

  return { command, result };
}
