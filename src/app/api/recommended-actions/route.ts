import { NextResponse } from "next/server";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspaceId } from "@/lib/workspace";

export async function GET(request: Request) {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status") ?? "open";

  const actions = await db.recommendedAction.findMany({
    where: { workspaceId, ...(status === "all" ? {} : { status }) },
    include: {
      contact: { include: { emails: true, phones: true } },
      deal: true,
      task: true,
    },
    orderBy: [{ score: "desc" }, { dueAt: "asc" }],
    take: 100,
  });

  return NextResponse.json({ ok: true, actions });
}
