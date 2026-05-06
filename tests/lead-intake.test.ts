import { describe, expect, it, vi } from "vitest";
import { intakeLead } from "@/lib/intake";

function fakeDb() {
  const contact = { id: "contact_1", name: "Jane Doe", emails: [], phones: [], tags: [] };
  return {
    contact: { create: vi.fn().mockResolvedValue(contact) },
    leadSource: { upsert: vi.fn().mockResolvedValue({ id: "source_1" }) },
    leadEvent: { create: vi.fn().mockResolvedValue({ id: "lead_event_1" }) },
    task: { create: vi.fn().mockResolvedValue({ id: "task_1" }) },
    message: { create: vi.fn().mockResolvedValue({ id: "message_1" }) },
    auditLog: { create: vi.fn().mockResolvedValue({ id: "audit_1" }) },
    webhookEvent: {
      create: vi.fn().mockResolvedValue({ id: "webhook_event_1" }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    webhookEndpoint: { findMany: vi.fn().mockResolvedValue([]) },
    webhookDelivery: { create: vi.fn().mockResolvedValue({ id: "delivery_1" }) },
    workflow: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

describe("lead intake", () => {
  it("normalizes a webhook lead, classifies it, and creates task/message artifacts", async () => {
    const db = fakeDb();
    const result = await intakeLead(
      {
        source: "facebook",
        name: "Jane Doe",
        email: "jane@example.com",
        phone: "+15555555555",
        message: "Looking to buy downtown today and I am pre-approved",
        raw: {},
      },
      { workspaceId: "workspace_1", db: db as never },
    );

    expect(result.classification.contactType).toBe("buyer");
    expect(result.classification.urgencyScore).toBeGreaterThanOrEqual(75);
    expect(db.contact.create).toHaveBeenCalledOnce();
    expect(db.task.create).toHaveBeenCalledOnce();
    expect(db.message.create).toHaveBeenCalledOnce();
  });
});
