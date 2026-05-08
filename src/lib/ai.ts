export type LeadInput = {
  name: string;
  email?: string | null;
  phone?: string | null;
  message?: string | null;
  source?: string | null;
};

export type LeadClassification = {
  contactType: "buyer" | "tenant" | "seller" | "landlord" | "investor" | "past_client" | "unknown";
  urgencyScore: number;
  summary: string;
  suggestedStage: "new" | "attempting_contact" | "nurturing" | "appointment_set";
  suggestedFirstResponse: string;
  nextAction: string;
  nextActionType: "call" | "sms" | "email" | "task";
  nextActionReason: string;
  nextActionConfidence: number;
  requiresHumanApproval: boolean;
  tags: string[];
};

function inferType(text: string): LeadClassification["contactType"] {
  const lower = text.toLowerCase();
  if (lower.includes("lease") || lower.includes("rent") || lower.includes("tenant")) return "tenant";
  if (lower.includes("sell") || lower.includes("listing") || lower.includes("valuation")) return "seller";
  if (lower.includes("landlord")) return "landlord";
  if (lower.includes("invest") || lower.includes("cap rate")) return "investor";
  if (lower.includes("buy") || lower.includes("purchase") || lower.includes("house") || lower.includes("condo")) return "buyer";
  return "unknown";
}

function inferUrgency(text: string) {
  const lower = text.toLowerCase();
  let score = 45;
  if (lower.includes("today") || lower.includes("asap") || lower.includes("urgent")) score += 35;
  if (lower.includes("pre-approved") || lower.includes("approved")) score += 20;
  if (lower.includes("downtown") || lower.includes("showing")) score += 10;
  if (lower.includes("just browsing")) score -= 20;
  return Math.max(0, Math.min(100, score));
}

export async function classifyLead(lead: LeadInput): Promise<LeadClassification> {
  const text = `${lead.name} ${lead.source ?? ""} ${lead.message ?? ""}`;
  const contactType = inferType(text);
  const urgencyScore = inferUrgency(text);
  const firstName = lead.name.split(" ")[0] || "there";
  const sourceLabel = lead.source ? ` from ${lead.source}` : "";

  return {
    contactType,
    urgencyScore,
    summary: `${lead.name}${sourceLabel} looks like a ${contactType.replace("_", " ")} lead. Main context: ${
      lead.message || "No message provided."
    }`,
    suggestedStage: urgencyScore >= 75 ? "attempting_contact" : "new",
    suggestedFirstResponse: `Hi ${firstName}, thanks for reaching out. I saw your note${
      lead.message ? ` about "${lead.message}"` : ""
    }. What is the best time today for a quick call?`,
    nextAction: urgencyScore >= 75 ? "Call now, then approve the drafted SMS" : "Approve and send the drafted first response",
    nextActionType: urgencyScore >= 75 ? "call" : lead.phone ? "sms" : "email",
    nextActionReason: urgencyScore >= 75 ? "Hot lead detected from intent, timing, or pre-approval language" : "New lead needs first touch",
    nextActionConfidence: urgencyScore >= 75 ? 92 : 78,
    requiresHumanApproval: true,
    tags: [contactType, urgencyScore >= 75 ? "hot-lead" : "nurture"].filter((tag) => tag !== "unknown"),
  };
}

export async function draftFirstResponse(contact: { name: string; type?: string | null }, channel: "email" | "sms") {
  const firstName = contact.name.split(" ")[0] || "there";
  if (channel === "sms") {
    return `Hi ${firstName}, it is Clydesdale CRM. I can help with your ${contact.type ?? "real estate"} search. Are you free for a quick call today?`;
  }

  return `Hi ${firstName},\n\nThanks for reaching out. I can help with your ${
    contact.type ?? "real estate"
  } plans and I have a couple of quick questions so I can point you in the right direction.\n\nWhat timing are you working toward, and what area should we focus on first?\n\nBest,\nClydesdale CRM`;
}

export async function draftMessage(contact: { name: string; type?: string | null }, channel: "email" | "sms", purpose = "next action") {
  if (purpose === "client_for_life") return generateClientForLifeCheckin(contact);
  return draftFirstResponse(contact, channel);
}

export async function summarizeContact(contact: { name: string; stage?: string | null; type?: string | null }) {
  return `${contact.name} is a ${contactTypeLabel(contact.type).toLowerCase()} currently in ${stageLabel(contact.stage)}. Keep the next action simple and timely.`;
}

export async function suggestNextAction(contact: { name: string; stage?: string | null; type?: string | null }) {
  if (contact.stage === "past_client") return `Send ${contact.name} a quarterly check-in and offer an updated home valuation.`;
  if (contact.stage === "new") return `Call ${contact.name}, then send the drafted first response if there is no answer.`;
  if (contact.stage === "nurturing") return `Keep ${contact.name}'s conversation moving and identify whether they need listings, a CMA, or a market update.`;
  if (contact.stage === "appointment_set") return `Set or confirm ${contact.name}'s appointment and move them toward becoming a client.`;
  if (contact.stage === "active_client") return `Move ${contact.name} into Deals so client work is tracked clearly.`;
  return `Confirm ${contact.name}'s timeline, motivation, and next appointment.`;
}

export async function draftNewsletter(contentPost: { title: string; excerpt?: string | null; url?: string | null }) {
  return {
    title: `Market note: ${contentPost.title}`,
    body: `Subject: ${contentPost.title}\n\nHere is a quick market note worth your attention.\n\n${contentPost.excerpt ?? "I pulled together the most useful points for clients watching the market."}\n\nRead more: ${contentPost.url ?? ""}\n\nReply if you want to talk about how this affects your plans.`,
    smsTeaser: `Quick market note: ${contentPost.title}. Want me to send the details?`,
    socialPost: `${contentPost.title}\n\nA useful read for anyone planning a move this year. ${contentPost.url ?? ""}`,
  };
}

export async function suggestDealNextStep(deal: { name: string; stage?: string | null; type?: string | null }) {
  return `Move ${deal.name} forward by confirming the next ${contactTypeLabel(deal.type).toLowerCase()} milestone in ${stageLabel(deal.stage)}.`;
}

export async function generateClientForLifeCheckin(contact: { name: string }) {
  const firstName = contact.name.split(" ")[0] || "there";
  return `Hi ${firstName}, just checking in for your quarterly home update. Would you like a fresh valuation and a quick read on what has changed nearby?`;
}
import { contactTypeLabel, stageLabel } from "./display";
