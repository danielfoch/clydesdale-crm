import Parser from "rss-parser";
import type { Prisma } from "@prisma/client";
import { draftNewsletter } from "./ai";
import { writeAudit } from "./audit";
import { getPrisma, type DbClient } from "./prisma";
import { fireOutboundWebhooks } from "./webhooks";

const parser = new Parser();

export async function importRssSource(
  workspaceId: string,
  url: string,
  db: DbClient = getPrisma(),
) {
  const feed = await parser.parseURL(url);
  const source = await db.contentSource.upsert({
    where: { workspaceId_url: { workspaceId, url } },
    create: { workspaceId, url, name: feed.title ?? "RSS source", kind: "rss", lastFetchedAt: new Date() },
    update: { name: feed.title ?? "RSS source", lastFetchedAt: new Date() },
  });

  const posts = [];
  for (const item of feed.items.slice(0, 10)) {
    const postUrl = item.link ?? `${url}#${encodeURIComponent(item.title ?? "post")}`;
    posts.push(
      await db.contentPost.upsert({
        where: { workspaceId_url: { workspaceId, url: postUrl } },
        create: {
          workspaceId,
          sourceId: source.id,
          title: item.title ?? "Untitled post",
          url: postUrl,
          excerpt: item.contentSnippet?.slice(0, 500) ?? item.content?.slice(0, 500),
          content: item.content ?? item.contentSnippet,
          publishedAt: item.isoDate ? new Date(item.isoDate) : undefined,
        },
        update: {
          title: item.title ?? "Untitled post",
          excerpt: item.contentSnippet?.slice(0, 500) ?? item.content?.slice(0, 500),
          content: item.content ?? item.contentSnippet,
          publishedAt: item.isoDate ? new Date(item.isoDate) : undefined,
        },
      }),
    );
  }

  await writeAudit(
    {
      workspaceId,
      actorType: "system",
      action: "content.rss_imported",
      targetType: "content_source",
      targetId: source.id,
      metadata: { imported: posts.length },
    },
    db,
  );

  return { source, posts };
}

export async function createNewsletterDraftFromPost(
  workspaceId: string,
  postId: string,
  audience: Record<string, unknown> = {},
  db: DbClient = getPrisma(),
) {
  const post = await db.contentPost.findUniqueOrThrow({ where: { id: postId } });
  const drafted = await draftNewsletter(post);
  const newsletter = await db.newsletterDraft.create({
    data: {
      workspaceId,
      postId,
      title: drafted.title,
      body: drafted.body,
      audience: audience as Prisma.InputJsonValue,
    },
  });

  await writeAudit(
    {
      workspaceId,
      actorType: "ai",
      action: "newsletter.drafted",
      targetType: "newsletter_draft",
      targetId: newsletter.id,
      metadata: { postId, smsTeaser: drafted.smsTeaser, socialPost: drafted.socialPost },
    },
    db,
  );
  await fireOutboundWebhooks(workspaceId, "newsletter.ready", { newsletterDraftId: newsletter.id }, db);

  return newsletter;
}
