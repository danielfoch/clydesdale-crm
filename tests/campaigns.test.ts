import { describe, expect, it, vi } from "vitest";
import { defaultCampaignRecipe, enrollContactInMatchingCampaign } from "@/lib/campaigns";

function fakeCampaignDb(contact: Record<string, unknown>) {
  const campaign = { id: "campaign_1", contactType: "buyer", steps: [] };
  return {
    contact: { findUnique: vi.fn().mockResolvedValue(contact) },
    campaign: { findFirst: vi.fn().mockResolvedValue(campaign) },
    campaignEnrollment: {
      upsert: vi.fn().mockResolvedValue({ id: "enrollment_1", campaignId: campaign.id, contactId: "contact_1", currentStep: 0, createdAt: new Date(), campaign, contact }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    auditLog: { create: vi.fn().mockResolvedValue({ id: "audit_1" }) },
  };
}

describe("campaigns", () => {
  it("generates valid default buyer campaign steps", () => {
    const recipe = defaultCampaignRecipe("buyer");
    expect(recipe.contactType).toBe("buyer");
    expect(recipe.steps.length).toBeGreaterThanOrEqual(5);
    expect(recipe.steps.every((step, index) => step.delayDays >= (recipe.steps[index - 1]?.delayDays ?? 0))).toBe(true);
    expect(recipe.steps.every((step) => step.title && step.body)).toBe(true);
  });

  it("enrolls a buyer pipeline lead into the buyer campaign", async () => {
    const db = fakeCampaignDb({ id: "contact_1", name: "Jane", stage: "new", consents: [], primaryDeals: [] });
    const enrollment = await enrollContactInMatchingCampaign("workspace_1", "contact_1", "buyer", db as never);
    expect(enrollment?.id).toBe("enrollment_1");
    expect(db.campaignEnrollment.upsert).toHaveBeenCalledOnce();
  });

  it("does not enroll opted-out leads", async () => {
    const db = fakeCampaignDb({ id: "contact_1", name: "Jane", stage: "new", consents: [{ channel: "sms", status: "opted_out" }], primaryDeals: [] });
    const enrollment = await enrollContactInMatchingCampaign("workspace_1", "contact_1", "buyer", db as never);
    expect(enrollment).toBeNull();
    expect(db.campaignEnrollment.upsert).not.toHaveBeenCalled();
  });

  it("does not enroll converted clients", async () => {
    const db = fakeCampaignDb({ id: "contact_1", name: "Jane", stage: "active_client", consents: [], primaryDeals: [{ id: "deal_1" }] });
    const enrollment = await enrollContactInMatchingCampaign("workspace_1", "contact_1", "buyer", db as never);
    expect(enrollment).toBeNull();
    expect(db.campaignEnrollment.upsert).not.toHaveBeenCalled();
  });
});
