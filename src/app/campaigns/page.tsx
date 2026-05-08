import { createWorkflowAction, draftNewsletterAction, importRssAction } from "@/app/actions";
import { Badge, Button, inputClass, PageHeader, Panel } from "@/components/ui";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspaceId } from "@/lib/workspace";
import { workflowActions, workflowTriggers } from "@/lib/workflows";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const [campaigns, workflows, posts, drafts] = await Promise.all([
    db.campaign.findMany({ where: { workspaceId }, include: { steps: { orderBy: { position: "asc" } }, enrollments: true } }),
    db.workflow.findMany({
      where: { workspaceId },
      include: { versions: { include: { steps: { orderBy: { position: "asc" } }, runs: true }, orderBy: { version: "desc" } } },
      orderBy: { createdAt: "desc" },
    }),
    db.contentPost.findMany({ where: { workspaceId }, include: { source: true }, orderBy: { publishedAt: "desc" }, take: 12 }),
    db.newsletterDraft.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);

  return (
    <>
      <PageHeader title="Campaigns" subtitle="Who am I warming up at scale?" />
      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <Panel title="Workflow sentence">
            <form action={createWorkflowAction} className="space-y-3">
              <input name="name" className={inputClass} placeholder="Workflow name" required />
              <select name="trigger" className={inputClass}>{workflowTriggers.map((trigger) => <option key={trigger} value={trigger}>When {trigger}</option>)}</select>
              <select name="action" className={inputClass}>{workflowActions.map((action) => <option key={action} value={action}>Then {action}</option>)}</select>
              <input name="taskTitle" className={inputClass} placeholder="Task title or action title" />
              <textarea name="body" className={inputClass} placeholder="Message body or task notes" rows={3} />
              <Button>Create workflow</Button>
            </form>
          </Panel>
          <Panel title="RSS/Substack import">
            <form action={importRssAction} className="space-y-3">
              <input name="url" className={inputClass} placeholder="https://example.substack.com/feed" required />
              <Button>Import posts</Button>
            </form>
          </Panel>
        </div>
        <div className="space-y-4">
          <Panel title="Campaign recipes">
            <div className="grid gap-3 md:grid-cols-2">
              {campaigns.map((campaign) => (
                <article key={campaign.id} className="rounded border border-[#e4e8df] p-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-medium">{campaign.name}</h3>
                    <Badge>{campaign.steps.length} steps</Badge>
                  </div>
                  <p className="mt-1 text-sm text-[#5f6a62]">{campaign.description}</p>
                  <div className="mt-2 flex flex-wrap gap-2"><Badge>{campaign.contactType ?? "all"}</Badge><Badge>{campaign.status}</Badge><Badge>{campaign.enrollments.length} enrolled</Badge></div>
                </article>
              ))}
            </div>
          </Panel>
          <Panel title="Workflows">
            <div className="space-y-3">
              {workflows.map((workflow) => {
                const version = workflow.versions[0];
                return (
                  <div key={workflow.id} className="rounded border border-[#e4e8df] p-3">
                    <div className="flex items-center justify-between gap-3"><h3 className="font-medium">{workflow.name}</h3><Badge>{workflow.isActive ? "active" : "paused"}</Badge></div>
                    <p className="mt-1 text-sm text-[#5f6a62]">When {version?.trigger ?? "draft"} then {version?.steps.map((step) => step.action).join(", ")}</p>
                  </div>
                );
              })}
            </div>
          </Panel>
          <Panel title="Content repurposing">
            <div className="space-y-3">
              {posts.map((post) => (
                <article key={post.id} className="rounded border border-[#e4e8df] p-3">
                  <h3 className="font-medium">{post.title}</h3>
                  <p className="mt-1 text-sm text-[#5f6a62]">{post.excerpt}</p>
                  <form action={draftNewsletterAction} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
                    <input type="hidden" name="postId" value={post.id} />
                    <input name="tag" className={inputClass} placeholder="Audience tag" />
                    <input name="stage" className={inputClass} placeholder="Stage" />
                    <input name="type" className={inputClass} placeholder="Type" />
                    <Button>Draft</Button>
                  </form>
                </article>
              ))}
            </div>
          </Panel>
          <Panel title="Newsletter drafts">
            <div className="space-y-3">
              {drafts.map((draft) => <pre key={draft.id} className="max-h-44 overflow-auto whitespace-pre-wrap rounded border border-[#e4e8df] p-3 text-xs">{draft.body}</pre>)}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
