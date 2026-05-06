import { NextResponse } from "next/server";
import { importRssSource } from "@/lib/content";
import { getDefaultWorkspaceId } from "@/lib/workspace";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body.url || typeof body.url !== "string") throw new Error("url is required");
    const workspaceId = await getDefaultWorkspaceId();
    const result = await importRssSource(workspaceId, body.url);
    return NextResponse.json({ ok: true, sourceId: result.source.id, imported: result.posts.length });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "RSS import failed" },
      { status: 400 },
    );
  }
}
