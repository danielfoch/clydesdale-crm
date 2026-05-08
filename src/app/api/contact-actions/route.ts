import { NextResponse } from "next/server";
import { z } from "zod";
import { executeContactAction } from "@/lib/contact-actions";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspaceId } from "@/lib/workspace";

const contactActionSchema = z.object({
  contactId: z.string().min(1),
  action: z.enum(["call", "send_text", "voicemail_drop", "ai_isa_call"]),
  body: z.string().optional(),
  subject: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const db = getPrisma();
    const workspaceId = await getDefaultWorkspaceId();
    const input = contactActionSchema.parse(await request.json());
    const result = await executeContactAction({ workspaceId, ...input }, db);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Invalid contact action" },
      { status: 400 },
    );
  }
}
