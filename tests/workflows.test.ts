import { describe, expect, it, vi } from "vitest";
import { executeWorkflowAction } from "@/lib/workflows";

describe("workflow action execution", () => {
  it("can create a follow-up task from a workflow action", async () => {
    const db = {
      task: { create: vi.fn().mockResolvedValue({ id: "task_1" }) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: "audit_1" }) },
    };

    const output = await executeWorkflowAction(
      "create_task",
      { title: "Call lead", body: "Speed to lead", dueInHours: "1", priority: "urgent" },
      { workspaceId: "workspace_1", contactId: "contact_1" },
      db as never,
    );

    expect(output).toEqual({ taskId: "task_1" });
    expect(db.task.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ title: "Call lead", contactId: "contact_1", priority: "urgent" }),
      }),
    );
  });
});
