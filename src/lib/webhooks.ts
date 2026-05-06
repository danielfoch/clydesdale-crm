import crypto from "node:crypto";
import type { Prisma } from "@prisma/client";
import { getPrisma, type DbClient } from "./prisma";

export type WebhookEvent =
  | "contact.created"
  | "lead.received"
  | "lead.hot"
  | "message.received"
  | "workflow.ai_step_requested"
  | "deal.stage_changed"
  | "task.overdue"
  | "deal.stalled"
  | "client.checkin_due"
  | "newsletter.ready";

export function signPayload(secret: string, body: string) {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

export async function fireOutboundWebhooks(
  workspaceId: string,
  event: WebhookEvent,
  payload: Record<string, unknown>,
  db: DbClient = getPrisma(),
) {
  await db.webhookEvent.create({
    data: {
      workspaceId,
      eventType: event,
      payload: payload as Prisma.InputJsonValue,
      status: "queued",
    },
  });

  const endpoints = await db.webhookEndpoint.findMany({
    where: { workspaceId, isActive: true, events: { has: event } },
  });

  if (endpoints.length === 0) {
    await db.webhookEvent.updateMany({
      where: { workspaceId, eventType: event, status: "queued" },
      data: { status: "skipped_no_endpoint" },
    });
    await db.webhookDelivery.create({
      data: {
        workspaceId,
        event,
        payload: payload as Prisma.InputJsonValue,
        status: "skipped_no_endpoint",
      },
    });
    return [];
  }

  const deliveries = [];
  for (const endpoint of endpoints) {
    const body = JSON.stringify({ event, payload, sentAt: new Date().toISOString() });
    const signature = signPayload(endpoint.secret, body);
    let status = "failed";
    let statusCode: number | undefined;
    let response = "";

    try {
      const result = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-clydesdale-signature": signature,
        },
        body,
      });
      statusCode = result.status;
      response = (await result.text()).slice(0, 500);
      status = result.ok ? "delivered" : "failed";
    } catch (error) {
      response = error instanceof Error ? error.message : "Unknown webhook delivery error";
    }

    deliveries.push(
      await db.webhookDelivery.create({
        data: {
          workspaceId,
          endpointId: endpoint.id,
          event,
          payload: payload as Prisma.InputJsonValue,
          signature,
          status,
          statusCode,
          response,
          attempts: 1,
          deliveredAt: status === "delivered" ? new Date() : undefined,
        },
      }),
    );
  }

  await db.webhookEvent.updateMany({
    where: { workspaceId, eventType: event, status: "queued" },
    data: { status: "logged", deliveredAt: new Date() },
  });

  return deliveries;
}
