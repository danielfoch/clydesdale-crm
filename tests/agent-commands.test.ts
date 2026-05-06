import { describe, expect, it } from "vitest";
import { agentCommandSchema } from "@/lib/agent-commands";

describe("agent command validation", () => {
  it("rejects unsafe commands", () => {
    expect(() => agentCommandSchema.parse({ command: "delete_contact", contactId: "contact_1" })).toThrow();
    expect(() => agentCommandSchema.parse({ command: "bulk_send", contactId: "contact_1" })).toThrow();
  });

  it("accepts scoped safe commands", () => {
    expect(agentCommandSchema.parse({ command: "create_note", contactId: "contact_1", body: "Call booked" })).toMatchObject({
      command: "create_note",
    });
  });
});
