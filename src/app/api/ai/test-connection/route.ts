import { NextResponse } from "next/server";
import { getAiSetting } from "@/lib/campaign-ai";
import { getPrisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/secrets";
import { getDefaultWorkspaceId } from "@/lib/workspace";

export async function POST() {
  const workspaceId = await getDefaultWorkspaceId();
  const db = getPrisma();
  const setting = await getAiSetting(workspaceId, db);
  const apiKey = decryptSecret(setting?.apiKey) || process.env.OPENAI_API_KEY;
  return NextResponse.json({
    ok: Boolean(apiKey),
    provider: setting?.provider ?? "openai",
    model: setting?.model ?? "gpt-4o-mini",
    mode: apiKey ? "api_key_available" : "mock",
  });
}
