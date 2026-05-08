import { NextResponse } from "next/server";
import { z } from "zod";
import { generateCampaignRecipeWithAi } from "@/lib/campaign-ai";
import { isCoreCampaignType } from "@/lib/campaigns";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspaceId } from "@/lib/workspace";

const schema = z.object({
  contactType: z.string(),
  goal: z.string().optional(),
  tone: z.string().optional(),
  numberOfSteps: z.number().optional(),
  totalDurationDays: z.number().optional(),
  channels: z.array(z.string()).optional(),
  prompt: z.string().optional(),
});

export async function POST(request: Request) {
  const body = schema.parse(await request.json());
  if (!isCoreCampaignType(body.contactType)) {
    return NextResponse.json({ error: "Unsupported campaign type" }, { status: 400 });
  }

  const workspaceId = await getDefaultWorkspaceId();
  const db = getPrisma();
  const prompt = [
    body.goal ? `Goal: ${body.goal}` : undefined,
    body.tone ? `Tone: ${body.tone}` : undefined,
    body.numberOfSteps ? `Number of steps: ${body.numberOfSteps}` : undefined,
    body.totalDurationDays ? `Total duration days: ${body.totalDurationDays}` : undefined,
    body.channels?.length ? `Channels: ${body.channels.join(", ")}` : undefined,
    body.prompt,
  ].filter(Boolean).join("\n");
  const result = await generateCampaignRecipeWithAi(workspaceId, body.contactType, prompt, db);
  return NextResponse.json(result);
}
