import type { Prisma } from "@prisma/client";
import { suggestNextAction } from "./ai";
import { writeAudit } from "./audit";
import { createMessageDraft } from "./messages";
import { getPrisma, type DbClient } from "./prisma";
import { fireOutboundWebhooks } from "./webhooks";

export const workflowTriggers = [
  "new_lead",
  "stage_changed",
  "message_received",
  "deal_stage_changed",
  "no_response_after_days",
  "task_overdue",
  "date_reached",
  "tag_added",
  "webhook_received",
  "client_checkin_due",
] as const;

export const workflowActions = [
  "create_task",
  "draft_email",
  "draft_sms",
  "send_sms_if_allowed",
  "assign_owner",
  "change_stage",
  "start_campaign",
  "stop_campaign",
  "call_ai",
  "fire_webhook",
  "create_deal",
  "create_client_lifecycle_event",
] as const;

export type WorkflowTrigger = (typeof workflowTriggers)[number];
export type WorkflowAction = (typeof workflowActions)[number];

type ActionPayload = {
  workspaceId: string;
  contactId?: string;
  dealId?: string;
  payload?: Record<string, unknown>;
};

function textFromConfig(config: Prisma.JsonValue, key: string, fallback: string) {
  if (config && typeof config === "object" && !Array.isArray(config) && key in config) {
    const value = (config as Record<string, unknown>)[key];
    return typeof value === "string" ? value : fallback;
  }
  return fallback;
}

export async function executeWorkflowAction(
  action: WorkflowAction,
  config: Prisma.JsonValue,
  context: ActionPayload,
  db: DbClient = getPrisma(),
) {
  switch (action) {
    case "create_task": {
      const task = await db.task.create({
        data: {
          workspaceId: context.workspaceId,
          contactId: context.contactId,
          title: textFromConfig(config, "title", "Follow up with lead"),
          body: textFromConfig(config, "body", "Created by workflow."),
          dueAt: new Date(Date.now() + Number(textFromConfig(config, "dueInHours", "4")) * 60 * 60 * 1000),
          priority: textFromConfig(config, "priority", "high"),
        },
      });
      await writeAudit(
        {
          workspaceId: context.workspaceId,
          actorType: "workflow",
          action: "task.created",
          targetType: "task",
          targetId: task.id,
          metadata: { workflowAction: action },
        },
        db,
      );
      return { taskId: task.id };
    }

    case "draft_email":
    case "draft_sms":
    case "send_sms_if_allowed": {
      if (!context.contactId) return { skipped: "missing_contact" };
      const channel = action === "draft_email" ? "email" : "sms";
      const body = textFromConfig(config, "body", "Quick follow-up from your real estate team.");
      const subject = channel === "email" ? textFromConfig(config, "subject", "Quick follow-up") : undefined;
      const message = await createMessageDraft(
        {
          workspaceId: context.workspaceId,
          contactId: context.contactId,
          channel,
          subject,
          body,
          aiGenerated: textFromConfig(config, "aiGenerated", "false") === "true",
          metadata: { workflowAction: action },
        },
        db,
      );
      return { messageId: message.id };
    }

    case "change_stage": {
      if (!context.contactId) return { skipped: "missing_contact" };
      const stage = textFromConfig(config, "stage", "nurturing");
      const contact = await db.contact.update({
        where: { id: context.contactId },
        data: {
          stage: stage as never,
          nextAction: textFromConfig(config, "nextAction", `Confirm next action for ${stage}`),
          nextActionDueAt: new Date(Date.now() + Number(textFromConfig(config, "dueInHours", "24")) * 60 * 60 * 1000),
          nextActionReason: "Workflow changed contact stage",
        },
      });
      return { contactId: contact.id, stage };
    }

    case "assign_owner":
      if (!context.contactId) return { skipped: "missing_contact" };
      await db.contact.update({
        where: { id: context.contactId },
        data: { ownerId: textFromConfig(config, "ownerId", "") || undefined },
      });
      return { assigned: true };

    case "start_campaign": {
      if (!context.contactId) return { skipped: "missing_contact" };
      const campaignId = textFromConfig(config, "campaignId", "");
      if (!campaignId) return { skipped: "missing_campaign" };
      const enrollment = await db.campaignEnrollment.upsert({
        where: { campaignId_contactId: { campaignId, contactId: context.contactId } },
        create: { campaignId, contactId: context.contactId },
        update: { status: "active" },
      });
      return { enrollmentId: enrollment.id };
    }

    case "stop_campaign":
      if (!context.contactId) return { skipped: "missing_contact" };
      await db.campaignEnrollment.updateMany({
        where: { contactId: context.contactId },
        data: { status: "stopped" },
      });
      return { stopped: true };

    case "call_ai": {
      const result = await db.agentCommand.create({
        data: {
          workspaceId: context.workspaceId,
          command: "request_human_approval",
          payload: { reason: textFromConfig(config, "prompt", "Review this lead."), context } as Prisma.InputJsonValue,
          status: "queued",
        },
      });
      await fireOutboundWebhooks(context.workspaceId, "workflow.ai_step_requested", { commandId: result.id }, db);
      return { agentCommandId: result.id };
    }

    case "fire_webhook":
      await fireOutboundWebhooks(context.workspaceId, "lead.received", { context, config }, db);
      return { fired: true };

    case "create_deal": {
      if (!context.contactId) return { skipped: "missing_contact" };
      const deal = await db.deal.create({
        data: {
          workspaceId: context.workspaceId,
          type: textFromConfig(config, "type", "buyer") as never,
          name: textFromConfig(config, "name", "New client opportunity"),
          stage: textFromConfig(config, "stage", "new"),
          primaryContactId: context.contactId,
          nextAction: textFromConfig(config, "nextAction", "Confirm deal next step"),
          nextActionDueAt: new Date(Date.now() + Number(textFromConfig(config, "dueInHours", "24")) * 60 * 60 * 1000),
          participants: {
            create: { contactId: context.contactId, role: "client" },
          },
        },
      });
      return { dealId: deal.id };
    }

    case "create_client_lifecycle_event": {
      if (!context.contactId) return { skipped: "missing_contact" };
      const event = await db.clientLifecycleEvent.create({
        data: {
          workspaceId: context.workspaceId,
          contactId: context.contactId,
          eventType: textFromConfig(config, "eventType", "quarterly_checkin"),
          dueAt: new Date(Date.now() + Number(textFromConfig(config, "dueInDays", "90")) * 24 * 60 * 60 * 1000),
          notes: await suggestNextAction({ name: "Past client", stage: "past_client" }),
        },
      });
      return { lifecycleEventId: event.id };
    }
  }
}

export async function runWorkflowTrigger(
  workspaceId: string,
  trigger: WorkflowTrigger,
  context: ActionPayload,
  db: DbClient = getPrisma(),
) {
  const workflows = await db.workflow.findMany({
    where: { workspaceId, isActive: true, versions: { some: { trigger, publishedAt: { not: null } } } },
    include: {
      versions: {
        where: { trigger, publishedAt: { not: null } },
        orderBy: { version: "desc" },
        take: 1,
        include: { steps: { orderBy: { position: "asc" } } },
      },
    },
  });

  const runs = [];
  for (const workflow of workflows) {
    const version = workflow.versions[0];
    if (!version) continue;

    const run = await db.workflowRun.create({
      data: {
        workspaceId,
        workflowId: workflow.id,
        workflowVersionId: version.id,
        trigger,
        payload: (context.payload ?? {}) as Prisma.InputJsonValue,
      },
    });

    for (const step of version.steps) {
      const stepRun = await db.workflowStepRun.create({
        data: { workflowRunId: run.id, workflowStepId: step.id },
      });
      try {
        const output = await executeWorkflowAction(step.action as WorkflowAction, step.config, { ...context, workspaceId }, db);
        await db.workflowStepRun.update({
          where: { id: stepRun.id },
          data: { status: "completed", output: output ?? {}, completedAt: new Date() },
        });
      } catch (error) {
        await db.workflowStepRun.update({
          where: { id: stepRun.id },
          data: {
            status: "failed",
            output: { error: error instanceof Error ? error.message : "Unknown workflow error" },
            completedAt: new Date(),
          },
        });
      }
    }

    runs.push(
      await db.workflowRun.update({
        where: { id: run.id },
        data: { status: "completed", completedAt: new Date() },
      }),
    );
  }

  return runs;
}
