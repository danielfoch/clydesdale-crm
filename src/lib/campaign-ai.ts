import { defaultCampaignRecipe, type CampaignRecipe, type CoreCampaignType } from "./campaigns";
import type { DbClient } from "./prisma";
import { decryptSecret } from "./secrets";

type AiSetting = {
  provider: string;
  apiKey: string | null;
  model: string;
  baseUrl: string | null;
};

function extractOutputText(response: unknown) {
  if (!response || typeof response !== "object") return "";
  const data = response as { output_text?: string; output?: Array<{ content?: Array<{ text?: string }> }> };
  if (typeof data.output_text === "string") return data.output_text;
  return data.output?.flatMap((item) => item.content ?? []).map((content) => content.text).filter(Boolean).join("\n") ?? "";
}

function parseRecipe(text: string, fallback: CampaignRecipe): CampaignRecipe {
  try {
    const parsed = JSON.parse(text) as CampaignRecipe;
    if (!parsed.name || !parsed.description || !Array.isArray(parsed.steps) || parsed.steps.length === 0) return fallback;
    return {
      ...fallback,
      name: parsed.name,
      description: parsed.description,
      steps: parsed.steps.slice(0, 8).map((step, index) => ({
        delayDays: Number.isFinite(Number(step.delayDays)) ? Number(step.delayDays) : index,
        channel: ["email", "note", "call"].includes(step.channel) ? step.channel : "sms",
        title: step.title || `Step ${index + 1}`,
        subject: step.channel === "email" ? step.subject || "Quick follow-up" : undefined,
        body: String(step.body || fallback.steps[Math.min(index, fallback.steps.length - 1)]?.body || "Quick follow-up."),
        isActive: step.isActive ?? true,
        stopOnReply: step.stopOnReply ?? true,
        requiresApproval: step.requiresApproval ?? true,
      })),
    };
  } catch {
    return fallback;
  }
}

export async function getAiSetting(workspaceId: string, db: DbClient): Promise<AiSetting | null> {
  return db.aiProviderSetting.findUnique({ where: { workspaceId_provider: { workspaceId, provider: "openai" } } });
}

export async function generateCampaignRecipeWithAi(
  workspaceId: string,
  contactType: CoreCampaignType,
  prompt: string | undefined,
  db: DbClient,
) {
  const fallback = defaultCampaignRecipe(contactType, prompt);
  const setting = await getAiSetting(workspaceId, db);
  const apiKey = decryptSecret(setting?.apiKey) || process.env.OPENAI_API_KEY;
  if (!apiKey) return { recipe: fallback, provider: "mock" };

  const model = setting?.model || "gpt-4o-mini";
  const baseUrl = setting?.baseUrl || "https://api.openai.com/v1";
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions: "You create simple real estate CRM campaigns. Return only valid JSON. No markdown.",
      input: `Create a ${contactType} lead nurture campaign for Warhorse CRM. It must be simple, numbered by days, draft-only, and designed to move the lead toward an appointment. Valid channels: sms, email, note for a task, call for a call reminder. User notes: ${prompt || "none"}`,
      text: {
        format: {
          type: "json_schema",
          name: "campaign_recipe",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["name", "contactType", "description", "steps"],
            properties: {
              name: { type: "string" },
              contactType: { type: "string", enum: ["buyer", "seller", "tenant", "landlord"] },
              description: { type: "string" },
              steps: {
                type: "array",
                minItems: 3,
                maxItems: 6,
                items: {
                  type: "object",
                  additionalProperties: false,
                  required: ["delayDays", "channel", "title", "subject", "body", "isActive", "stopOnReply", "requiresApproval"],
                  properties: {
                    delayDays: { type: "integer" },
                    channel: { type: "string", enum: ["sms", "email", "note", "call"] },
                    title: { type: "string" },
                    subject: { type: "string" },
                    body: { type: "string" },
                    isActive: { type: "boolean" },
                    stopOnReply: { type: "boolean" },
                    requiresApproval: { type: "boolean" },
                  },
                },
              },
            },
          },
        },
      },
    }),
  });

  if (!response.ok) return { recipe: fallback, provider: "mock", error: await response.text() };
  const json = await response.json();
  return { recipe: parseRecipe(extractOutputText(json), fallback), provider: "openai" };
}
