import type { CampaignStep, ContactType, MessageChannel, Prisma } from "@prisma/client";
import { writeAudit } from "./audit";
import { createMessageDraft } from "./messages";
import { getPrisma, type DbClient } from "./prisma";

export const coreCampaignTypes = ["buyer", "seller", "tenant", "landlord"] as const;
export type CoreCampaignType = (typeof coreCampaignTypes)[number];

export type CampaignRecipeStep = {
  delayDays: number;
  channel: "sms" | "email";
  subject?: string;
  body: string;
  stopOnReply?: boolean;
  requiresApproval?: boolean;
};

export type CampaignRecipe = {
  name: string;
  contactType: CoreCampaignType;
  description: string;
  steps: CampaignRecipeStep[];
};

export function isCoreCampaignType(type?: string | null): type is CoreCampaignType {
  return Boolean(type && coreCampaignTypes.includes(type as CoreCampaignType));
}

export function defaultCampaignRecipe(contactType: CoreCampaignType, prompt?: string): CampaignRecipe {
  const notes = prompt ? ` Agent notes: ${prompt}` : "";
  const recipes: Record<CoreCampaignType, CampaignRecipe> = {
    buyer: {
      name: "Buyer nurture",
      contactType: "buyer",
      description: `Turn buyer leads into appointments with fast response, criteria, listings, and a meeting ask.${notes}`,
      steps: [
        { delayDays: 0, channel: "sms", body: "Hi {{first_name}}, saw your note about buying. Are you free for a quick call today so I can narrow down area, budget, and timing?" },
        { delayDays: 1, channel: "email", subject: "A simple buying plan", body: "Hi {{first_name}},\n\nHere is the clean path: confirm budget, pick target areas, shortlist the best fits, then book showings. What area should I focus on first?" },
        { delayDays: 3, channel: "sms", body: "{{first_name}}, should I send a short list of homes that match what you are looking for?" },
        { delayDays: 7, channel: "email", subject: "Want me to set up listings?", body: "Hi {{first_name}},\n\nI can set up a focused search so you only see useful listings. Reply with your ideal area and budget range and I will build it." },
      ],
    },
    seller: {
      name: "Seller nurture",
      contactType: "seller",
      description: `Move seller leads toward valuation, CMA, prep plan, and listing appointment.${notes}`,
      steps: [
        { delayDays: 0, channel: "sms", body: "Hi {{first_name}}, saw your note about selling. Want me to send a quick valuation range and the key prep items before you list?" },
        { delayDays: 1, channel: "email", subject: "Quick seller game plan", body: "Hi {{first_name}},\n\nThe first step is a realistic value range, timing, and a prep plan. If you send the address, I can put together the useful numbers." },
        { delayDays: 3, channel: "sms", body: "{{first_name}}, should I put together a quick CMA for your place?" },
        { delayDays: 7, channel: "email", subject: "What buyers will care about", body: "Hi {{first_name}},\n\nBefore listing, buyers usually care most about price, presentation, and timing. Want me to walk you through what matters for your property?" },
      ],
    },
    tenant: {
      name: "Tenant nurture",
      contactType: "tenant",
      description: `Move tenant leads from inquiry to criteria, showings, application prep, and lease decision.${notes}`,
      steps: [
        { delayDays: 0, channel: "sms", body: "Hi {{first_name}}, saw your rental inquiry. What move-in date, budget, and area should I focus on?" },
        { delayDays: 1, channel: "email", subject: "Rental search checklist", body: "Hi {{first_name}},\n\nTo move quickly, we need budget, area, move-in date, employment docs, and references ready. Want me to send options that fit?" },
        { delayDays: 3, channel: "sms", body: "{{first_name}}, are you still looking for a rental this week?" },
        { delayDays: 5, channel: "email", subject: "Application prep", body: "Hi {{first_name}},\n\nGood rentals move fast. I can help you prep the application package before the right place appears." },
      ],
    },
    landlord: {
      name: "Landlord nurture",
      contactType: "landlord",
      description: `Move landlord leads toward rent estimate, tenant placement, screening, and lease execution.${notes}`,
      steps: [
        { delayDays: 0, channel: "sms", body: "Hi {{first_name}}, saw your landlord inquiry. Want a quick rent estimate and tenant placement plan?" },
        { delayDays: 1, channel: "email", subject: "Landlord next step", body: "Hi {{first_name}},\n\nThe useful first step is rent range, property readiness, tenant profile, and timeline. Send the address and I can help map it out." },
        { delayDays: 3, channel: "sms", body: "{{first_name}}, should I send a quick rental valuation for your property?" },
        { delayDays: 7, channel: "email", subject: "Tenant placement plan", body: "Hi {{first_name}},\n\nA clean tenant placement plan reduces vacancy and avoids weak applications. Want me to outline the next steps?" },
      ],
    },
  };

  return recipes[contactType];
}

function personalize(body: string, contact: { name: string }) {
  const firstName = contact.name.split(" ")[0] || "there";
  return body.replaceAll("{{first_name}}", firstName);
}

export async function upsertCampaignRecipe(
  workspaceId: string,
  recipe: CampaignRecipe,
  db: DbClient = getPrisma(),
) {
  const existing = await db.campaign.findFirst({ where: { workspaceId, contactType: recipe.contactType } });
  const campaign = existing
    ? await db.campaign.update({
        where: { id: existing.id },
        data: {
          name: recipe.name,
          description: recipe.description,
          status: "active",
          isActive: true,
          steps: { deleteMany: {}, create: recipe.steps.map((step, index) => ({ position: index + 1, ...step })) },
        },
      })
    : await db.campaign.create({
        data: {
          workspaceId,
          name: recipe.name,
          contactType: recipe.contactType,
          description: recipe.description,
          steps: { create: recipe.steps.map((step, index) => ({ position: index + 1, ...step })) },
        },
      });

  await writeAudit({ workspaceId, actorType: "ai", action: "campaign.recipe_upserted", targetType: "campaign", targetId: campaign.id, metadata: { contactType: recipe.contactType } }, db);
  return campaign;
}

export async function enrollContactInMatchingCampaign(
  workspaceId: string,
  contactId: string,
  contactType?: ContactType | string | null,
  db: DbClient = getPrisma(),
) {
  if (!isCoreCampaignType(contactType)) return null;
  let campaign = await db.campaign.findFirst({ where: { workspaceId, contactType, isActive: true }, orderBy: { createdAt: "asc" } });
  if (!campaign) {
    campaign = await upsertCampaignRecipe(workspaceId, defaultCampaignRecipe(contactType), db);
  }

  const enrollment = await db.campaignEnrollment.upsert({
    where: { campaignId_contactId: { campaignId: campaign.id, contactId } },
    create: { campaignId: campaign.id, contactId },
    update: { status: "active" },
  });

  await writeAudit({ workspaceId, actorType: "system", action: "campaign.auto_enrolled", targetType: "campaign_enrollment", targetId: enrollment.id, metadata: { campaignId: campaign.id, contactType } }, db);
  await runDueCampaignSteps(workspaceId, db, enrollment.id);
  return enrollment;
}

async function draftCampaignStep(
  workspaceId: string,
  contact: { id: string; name: string },
  step: Pick<CampaignStep, "id" | "channel" | "subject" | "body" | "campaignId" | "position">,
  db: DbClient,
) {
  return createMessageDraft(
    {
      workspaceId,
      contactId: contact.id,
      channel: step.channel as MessageChannel,
      subject: step.channel === "email" ? step.subject ?? "Quick follow-up" : undefined,
      body: personalize(step.body, contact),
      aiGenerated: true,
      metadata: { source: "campaign", campaignId: step.campaignId, campaignStepId: step.id, position: step.position } as Prisma.InputJsonValue,
    },
    db,
  );
}

export async function runDueCampaignSteps(
  workspaceId: string,
  db: DbClient = getPrisma(),
  enrollmentId?: string,
) {
  const enrollments = await db.campaignEnrollment.findMany({
    where: { id: enrollmentId, campaign: { workspaceId }, status: "active" },
    include: { contact: true, campaign: { include: { steps: { orderBy: { position: "asc" } } } } },
  });
  const now = Date.now();
  const drafted: string[] = [];

  for (const enrollment of enrollments) {
    const nextStep = enrollment.campaign.steps[enrollment.currentStep];
    if (!nextStep) {
      await db.campaignEnrollment.update({ where: { id: enrollment.id }, data: { status: "completed" } });
      continue;
    }
    const eligibleAt = enrollment.createdAt.getTime() + nextStep.delayDays * 24 * 60 * 60 * 1000;
    if (eligibleAt > now) continue;

    const draft = await draftCampaignStep(workspaceId, enrollment.contact, nextStep, db);
    drafted.push(draft.id);
    await db.campaignEnrollment.update({
      where: { id: enrollment.id },
      data: {
        currentStep: enrollment.currentStep + 1,
        status: enrollment.currentStep + 1 >= enrollment.campaign.steps.length ? "completed" : "active",
      },
    });
  }

  return { draftedCount: drafted.length, messageIds: drafted };
}
