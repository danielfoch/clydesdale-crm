import { NextResponse } from "next/server";
import { executeAgentCommand } from "@/lib/agent-commands";

export async function POST(request: Request) {
  try {
    const result = await executeAgentCommand(await request.json());
    return NextResponse.json({ ok: true, commandId: result.command.id, result: result.result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Invalid agent command" },
      { status: 400 },
    );
  }
}
