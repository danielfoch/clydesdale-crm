import { PrismaClient } from "@prisma/client";
import { classifyLead, draftFirstResponse, summarizeContact, suggestNextAction } from "../src/lib/ai";

const prisma = new PrismaClient();
const hour = 60 * 60 * 1000;
const day = 24 * hour;

const contactRows = [
  ["Avery Stone", "avery@example.com", "+14165550101", "buyer", "active_client", "pre-approved buyer looking downtown"],
  ["Maya Chen", "maya@example.com", "+14165550102", "seller", "appointment_set", "wants a listing valuation"],
  ["Lucas Grant", "lucas@example.com", "+14165550103", "tenant", "nurturing", "lease starting in 60 days"],
  ["Nora Patel", "nora@example.com", "+14165550104", "landlord", "active_client", "needs tenant placement"],
  ["Theo Brooks", "theo@example.com", "+14165550105", "investor", "nurturing", "asking about cap rates"],
  ["Elena Rossi", "elena@example.com", "+14165550106", "past_client", "past_client", "closed last year"],
  ["Samir Ali", "samir@example.com", "+14165550107", "past_client", "past_client", "closed two years ago"],
  ["Priya Singh", "priya@example.com", "+14165550108", "past_client", "past_client", "quarterly valuation due"],
  ["Daniel Kim", "daniel@example.com", "+14165550109", "buyer", "under_contract", "condition deadline soon"],
  ["Grace Miller", "grace@example.com", "+14165550110", "seller", "attempting_contact", "warm listing lead"],
] as const;

const newLeadRows = [
  ["Jane Doe", "jane@example.com", "+15555555555", "facebook", "Looking to buy downtown today and I am pre-approved"],
  ["Omar Reed", "omar@example.com", "+15555555556", "website", "Need to sell my condo and buy a bigger place"],
  ["Lina Park", "lina@example.com", "+15555555557", "substack", "Just browsing townhomes for later this year"],
  ["Ben Walsh", "ben@example.com", "+15555555558", "email_parser", "Need a rental near transit ASAP"],
  ["Chloe Davis", "chloe@example.com", "+15555555559", "meta", "Can someone call me about a valuation?"],
] as const;

async function clear() {
  await prisma.auditLog.deleteMany();
  await prisma.agentCommand.deleteMany();
  await prisma.webhookEvent.deleteMany();
  await prisma.webhookDelivery.deleteMany();
  await prisma.webhookEndpoint.deleteMany();
  await prisma.newsletterSend.deleteMany();
  await prisma.newsletterDraft.deleteMany();
  await prisma.contentPost.deleteMany();
  await prisma.contentSource.deleteMany();
  await prisma.homeValuationRequest.deleteMany();
  await prisma.clientLifecycleEvent.deleteMany();
  await prisma.clientLifecyclePlan.deleteMany();
  await prisma.dealTask.deleteMany();
  await prisma.dealStageHistory.deleteMany();
  await prisma.dealParticipant.deleteMany();
  await prisma.deal.deleteMany();
  await prisma.workflowStepRun.deleteMany();
  await prisma.workflowRun.deleteMany();
  await prisma.workflowStep.deleteMany();
  await prisma.workflowVersion.deleteMany();
  await prisma.workflow.deleteMany();
  await prisma.campaignEnrollment.deleteMany();
  await prisma.campaignStep.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.task.deleteMany();
  await prisma.message.deleteMany();
  await prisma.messageThread.deleteMany();
  await prisma.leadEvent.deleteMany();
  await prisma.leadSource.deleteMany();
  await prisma.contactConsent.deleteMany();
  await prisma.contactNote.deleteMany();
  await prisma.contactTag.deleteMany();
  await prisma.contactPhone.deleteMany();
  await prisma.contactEmail.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.workspaceMember.deleteMany();
  await prisma.user.deleteMany();
  await prisma.workspace.deleteMany();
}

async function main() {
  await clear();

  const workspace = await prisma.workspace.create({
    data: { name: "Warhorse Realty" },
  });
  const user = await prisma.user.create({
    data: { name: "Daniel Agent", email: "agent@warhorse.local" },
  });
  await prisma.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, role: "owner" } });

  const campaign1 = await prisma.campaign.create({
    data: {
      workspaceId: workspace.id,
      name: "New buyer onboarding",
      contactType: "buyer",
      description: "Fast first response, search setup, and appointment prompt.",
      steps: {
        create: [
          { position: 1, delayDays: 0, channel: "email", subject: "Next step", body: "Thanks for reaching out. Let us narrow the search." },
          { position: 2, delayDays: 2, channel: "sms", body: "Still want help shortlisting homes this week?" },
        ],
      },
    },
  });
  const campaign2 = await prisma.campaign.create({
    data: {
      workspaceId: workspace.id,
      name: "Past client quarterly check-in",
      contactType: "past_client",
      description: "Client-for-life valuation and referral cadence.",
      steps: {
        create: [
          { position: 1, delayDays: 0, channel: "email", subject: "Quarterly home update", body: "Want a fresh valuation and neighborhood update?" },
          { position: 2, delayDays: 7, channel: "sms", body: "Should I send your quick home value update?" },
        ],
      },
    },
  });
  for (const recipe of [
    ["Seller lead nurture", "seller", "Valuation offer, CMA prompt, listing timeline."],
    ["Tenant lead nurture", "tenant", "Availability check, showing task, application prep."],
    ["Landlord lead nurture", "landlord", "Rent estimate, tenant placement, management next step."],
    ["Referral ask", "past_client", "Simple ask after a successful touch or home update."],
  ] as const) {
    await prisma.campaign.create({
      data: {
        workspaceId: workspace.id,
        name: recipe[0],
        contactType: recipe[1],
        description: recipe[2],
        steps: {
          create: [
            { position: 1, delayDays: 0, channel: "sms", body: "Quick check-in from your real estate team. Want help with the next step?", template: "intro", stopOnReply: true, requiresApproval: true },
            { position: 2, delayDays: 3, channel: "email", subject: "Useful next step", body: "Sharing a practical next step based on your goals.", template: "nurture", stopOnReply: true, requiresApproval: true },
          ],
        },
      },
    });
  }

  const leadSources = await Promise.all(
    ["manual", "facebook", "website", "email_parser", "meta", "substack"].map((name) =>
      prisma.leadSource.create({ data: { workspaceId: workspace.id, name, kind: name === "manual" ? "manual" : "webhook" } }),
    ),
  );

  const contacts = [];
  for (const [name, email, phone, type, stage, context] of contactRows) {
    const summary = await summarizeContact({ name, type, stage });
    const nextAction = await suggestNextAction({ name, type, stage });
    contacts.push(
      await prisma.contact.create({
        data: {
          workspaceId: workspace.id,
          ownerId: user.id,
          name,
          type,
          stage,
          source: "manual",
          urgencyScore: stage === "attempting_contact" ? 78 : 45,
          aiSummary: `${summary} Context: ${context}.`,
          aiSuggestedAction: nextAction,
          suggestedFirstResponse: await draftFirstResponse({ name, type }, "email"),
          nextAction,
          nextActionType: stage === "past_client" ? "email" : "call",
          nextActionDueAt: new Date(Date.now() + (stage === "past_client" ? -2 * day : 4 * hour)),
          nextActionReason: stage === "past_client" ? "Past client is due for client-for-life touch" : context,
          nextActionConfidence: stage === "attempting_contact" ? 88 : 76,
          lastTouchAt: new Date(Date.now() - 7 * day),
          emails: { create: { email } },
          phones: { create: { phone } },
          tags: { create: [{ tag: type }, { tag: stage === "past_client" ? "client-for-life" : "active" }] },
          consents: { create: [{ channel: "email", status: "opted_in" }, { channel: "sms", status: "opted_in" }] },
          notes: { create: { body: context, createdBy: "seed" } },
        },
      }),
    );
  }

  for (const [name, email, phone, source, message] of newLeadRows) {
    const classification = await classifyLead({ name, email, phone, source, message });
    const contact = await prisma.contact.create({
      data: {
        workspaceId: workspace.id,
        name,
        type: classification.contactType,
        stage: classification.suggestedStage,
        source,
        urgencyScore: classification.urgencyScore,
        aiSummary: classification.summary,
        aiSuggestedAction: classification.urgencyScore >= 75 ? "Call within 5 minutes" : "Send first response today",
        suggestedFirstResponse: classification.suggestedFirstResponse,
        nextAction: classification.nextAction,
        nextActionType: classification.nextActionType,
        nextActionDueAt: new Date(Date.now() + (classification.urgencyScore >= 75 ? 5 * 60 * 1000 : hour)),
        nextActionReason: classification.nextActionReason,
        nextActionConfidence: classification.nextActionConfidence,
        emails: { create: { email } },
        phones: { create: { phone } },
        tags: { create: classification.tags.map((tag) => ({ tag })) },
        consents: { create: [{ channel: "email", status: "unknown" }, { channel: "sms", status: "unknown" }] },
      },
    });
    const sourceRecord = leadSources.find((item) => item.name === source) ?? leadSources[0];
    await prisma.leadEvent.create({
      data: { workspaceId: workspace.id, contactId: contact.id, leadSourceId: sourceRecord.id, source, payload: { source, name, email, phone, message, raw: {} }, aiClass: classification },
    });
    await prisma.task.create({
      data: { workspaceId: workspace.id, contactId: contact.id, type: "speed_to_lead", title: classification.urgencyScore >= 75 ? "Call hot lead now" : "Follow up with new lead", dueAt: new Date(Date.now() - 30 * 60 * 1000), priority: "high", createdByAi: true },
    });
    await prisma.message.create({
      data: { workspaceId: workspace.id, contactId: contact.id, channel: "sms", status: "draft", body: classification.suggestedFirstResponse, aiGenerated: true },
    });
  }

  await prisma.deal.create({
    data: {
      workspaceId: workspace.id,
      type: "buyer",
      primaryContactId: contacts[0].id,
      name: "Avery downtown purchase",
      stage: "showings",
      valueCents: 125000000,
      nextAction: "Book second showing and review offer range.",
      nextActionDueAt: new Date(Date.now() + 8 * hour),
      deadline: new Date(Date.now() + 2 * day),
      riskLevel: "normal",
      participants: { create: { contactId: contacts[0].id } },
      tasks: { create: { title: "Send shortlist", dueAt: new Date(Date.now() + 24 * 60 * 60 * 1000) } },
      stageHistory: { create: { toStage: "showings" } },
    },
  });
  await prisma.deal.create({
    data: {
      workspaceId: workspace.id,
      type: "seller",
      primaryContactId: contacts[1].id,
      name: "Maya listing prep",
      stage: "valuation",
      valueCents: 95000000,
      nextAction: "Prepare CMA and listing timeline.",
      nextActionDueAt: new Date(Date.now() + 12 * hour),
      deadline: new Date(Date.now() + day),
      riskLevel: "high",
      participants: { create: { contactId: contacts[1].id } },
      stageHistory: { create: { toStage: "valuation" } },
    },
  });
  await prisma.deal.create({
    data: {
      workspaceId: workspace.id,
      type: "tenant",
      primaryContactId: contacts[2].id,
      name: "Lucas lease search",
      stage: "applications",
      valueCents: 3600000,
      nextAction: "Collect employment letter.",
      nextActionDueAt: new Date(Date.now() + 6 * hour),
      deadline: new Date(Date.now() + 3 * day),
      riskLevel: "stalled",
      participants: { create: { contactId: contacts[2].id } },
      stageHistory: { create: { toStage: "applications" } },
    },
  });

  await prisma.campaignEnrollment.create({ data: { campaignId: campaign1.id, contactId: contacts[0].id } });
  await prisma.campaignEnrollment.create({ data: { campaignId: campaign2.id, contactId: contacts[5].id } });

  const workflow1 = await prisma.workflow.create({
    data: {
      workspaceId: workspace.id,
      name: "New lead speed-to-lead",
      versions: {
        create: {
          version: 1,
          trigger: "new_lead",
          publishedAt: new Date(),
          steps: {
            create: [
              { position: 1, action: "create_task", config: { title: "Call new lead", body: "Created by workflow.", dueInHours: "1", priority: "urgent" } },
              { position: 2, action: "draft_sms", config: { body: "Thanks for reaching out. Are you free for a quick call today?", aiGenerated: "true" } },
            ],
          },
        },
      },
    },
  });
  await prisma.workflow.create({
    data: {
      workspaceId: workspace.id,
      name: "Quarterly client-for-life check-in",
      versions: {
        create: {
          version: 1,
          trigger: "client_checkin_due",
          publishedAt: new Date(),
          steps: { create: { position: 1, action: "create_task", config: { title: "Send quarterly valuation check-in", dueInHours: "24" } } },
        },
      },
    },
  });

  const plan = await prisma.clientLifecyclePlan.create({
    data: { workspaceId: workspace.id, name: "Client for life", cadenceDays: 90 },
  });
  for (const contact of contacts.slice(5, 8)) {
    await prisma.clientLifecycleEvent.create({
      data: { workspaceId: workspace.id, planId: plan.id, contactId: contact.id, eventType: "quarterly_checkin", dueAt: new Date(Date.now() - 24 * 60 * 60 * 1000), notes: "Quarterly valuation/check-in due." },
    });
    await prisma.homeValuationRequest.create({
      data: { workspaceId: workspace.id, contactId: contact.id, property: "Past client home", dueAt: new Date(), status: "requested" },
    });
  }

  const source = await prisma.contentSource.create({
    data: { workspaceId: workspace.id, name: "Warhorse Market Notes", url: "https://example.substack.com/feed", kind: "rss", lastFetchedAt: new Date() },
  });
  for (const title of ["Spring inventory is rising", "What buyers should watch this week", "Rental market check-in"]) {
    await prisma.contentPost.create({
      data: { workspaceId: workspace.id, sourceId: source.id, title, url: `https://example.com/${title.toLowerCase().replaceAll(" ", "-")}`, excerpt: `${title}: practical notes for local clients.`, publishedAt: new Date() },
    });
  }

  await prisma.webhookEndpoint.create({
    data: {
      workspaceId: workspace.id,
      name: "External AI agent",
      url: "http://localhost:43111/warhorse-agent",
      secret: "seed-secret",
      events: ["lead.received", "lead.hot", "workflow.ai_step_requested", "newsletter.ready"],
    },
  });
  await prisma.workflowRun.create({
      data: { workspaceId: workspace.id, workflowId: workflow1.id, workflowVersionId: (await prisma.workflowVersion.findFirstOrThrow({ where: { workflowId: workflow1.id } })).id, trigger: "new_lead", status: "completed", completedAt: new Date() },
  });
  await prisma.auditLog.create({
    data: { workspaceId: workspace.id, actorType: "system", action: "seed.completed", targetType: "workspace", targetId: workspace.id, metadata: { contacts: 15 } },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
