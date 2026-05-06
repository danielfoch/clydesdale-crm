import { NextResponse } from "next/server";
import { intakeLead, leadPayloadSchema } from "@/lib/intake";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const payload = leadPayloadSchema.parse(json);
    const result = await intakeLead(payload);
    return NextResponse.json({
      ok: true,
      contactId: result.contact.id,
      leadEventId: result.leadEvent.id,
      taskId: result.task.id,
      draftId: result.draft.id,
      classification: result.classification,
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Invalid lead payload" },
      { status: 400 },
    );
  }
}
