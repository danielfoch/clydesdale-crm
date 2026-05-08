import {
  draftNewsletterAction,
  ensureCoreCampaignsAction,
  generateCampaignRecipeAction,
  importRssAction,
  runCampaignsNowAction,
  updateCampaignStepAction,
} from "@/app/actions";
import { Badge, Button, inputClass, PageHeader, Panel } from "@/components/ui";
import { coreCampaignTypes, defaultCampaignRecipe, type CoreCampaignType } from "@/lib/campaigns";
import { contactTypeLabel } from "@/lib/display";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

function titleForType(type: CoreCampaignType) {
  return `${contactTypeLabel(type)} campaign`;
}

function helpForType(type: CoreCampaignType) {
  return defaultCampaignRecipe(type).description;
}

export default async function CampaignsPage() {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const [campaigns, workflows, posts, drafts, aiSetting] = await Promise.all([
    db.campaign.findMany({
      where: { workspaceId, contactType: { in: [...coreCampaignTypes] } },
      include: { steps: { orderBy: { position: "asc" } }, enrollments: true },
      orderBy: { contactType: "asc" },
    }),
    db.workflow.findMany({
      where: { workspaceId },
      include: { versions: { include: { steps: { orderBy: { position: "asc" } }, runs: true }, orderBy: { version: "desc" } } },
      orderBy: { createdAt: "desc" },
    }),
    db.contentPost.findMany({ where: { workspaceId }, include: { source: true }, orderBy: { publishedAt: "desc" }, take: 8 }),
    db.newsletterDraft.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 6 }),
    db.aiProviderSetting.findUnique({ where: { workspaceId_provider: { workspaceId, provider: "openai" } } }),
  ]);
  const campaignByType = new Map(campaigns.map((campaign) => [campaign.contactType, campaign]));

  return (
    <>
      <PageHeader title="Campaigns" subtitle="Who am I warming up at scale?" />

      <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
        <div className="space-y-4">
          <Panel title="AI campaign builder">
            <form action={generateCampaignRecipeAction} className="space-y-3">
              <select name="contactType" className={inputClass}>
                {coreCampaignTypes.map((type) => <option key={type} value={type}>{titleForType(type)}</option>)}
              </select>
              <textarea name="prompt" className={inputClass} placeholder="Tell the AI what you want. Example: luxury condo buyers, keep it casual, push to phone appointment." rows={4} />
              <Button>Build campaign with AI</Button>
              <p className="text-xs leading-5 text-[#68736a]">
                {aiSetting?.apiKey ? "Using your saved OpenAI API key." : "Mock AI mode. Add an OpenAI API key in Settings for live LLM generation."}
              </p>
            </form>
          </Panel>

          <Panel title="Campaign engine">
            <form action={runCampaignsNowAction} className="space-y-3 text-sm text-[#5f6a62]">
              <p>New buyer, seller, tenant, and landlord leads auto-enroll in the matching campaign. Due steps create message drafts for approval.</p>
              <Button>Run due campaign steps</Button>
            </form>
          </Panel>

          <Panel title="Core recipes">
            <form action={ensureCoreCampaignsAction} className="space-y-3 text-sm text-[#5f6a62]">
              <p>Create any missing buyer, seller, tenant, or landlord campaigns.</p>
              <Button>Ensure core campaigns</Button>
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
            <div className="space-y-3">
              {coreCampaignTypes.map((type) => {
                const campaign = campaignByType.get(type);
                return (
                  <details key={type} className="rounded border border-[#e4e8df] bg-white [&>summary::-webkit-details-marker]:hidden">
                    <summary className="flex cursor-pointer items-center justify-between gap-3 p-4 hover:bg-[#f8faf6]">
                      <div>
                        <h3 className="font-medium">{campaign?.name ?? titleForType(type)}</h3>
                        <p className="mt-1 text-sm text-[#5f6a62]">{campaign?.description ?? helpForType(type)}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-2">
                        <Badge>{campaign?.steps.length ?? 0} steps</Badge>
                        <Badge>{campaign?.enrollments.length ?? 0} enrolled</Badge>
                        <Badge>{campaign?.isActive === false ? "paused" : "active"}</Badge>
                      </div>
                    </summary>

                    <div className="space-y-3 border-t border-[#edf0ea] p-4">
                      {!campaign ? (
                        <form action={generateCampaignRecipeAction} className="rounded border border-dashed border-[#d9ded5] p-3">
                          <input type="hidden" name="contactType" value={type} />
                          <p className="mb-3 text-sm text-[#5f6a62]">No {contactTypeLabel(type).toLowerCase()} campaign yet.</p>
                          <Button>Create this campaign</Button>
                        </form>
                      ) : null}

                      {campaign?.steps.map((step, index) => (
                        <details key={step.id} className="rounded border border-[#e4e8df] bg-[#fbfcfa] [&>summary::-webkit-details-marker]:hidden">
                          <summary className="flex cursor-pointer items-center justify-between gap-3 p-3 hover:bg-white">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <Badge>#{index + 1}</Badge>
                                <Badge>Day {step.delayDays}</Badge>
                                <Badge>{step.channel}</Badge>
                              </div>
                              <p className="mt-2 line-clamp-1 text-sm font-medium text-[#26352c]">{step.subject || step.body}</p>
                            </div>
                            <span className="text-xs text-[#68736a]">Edit</span>
                          </summary>

                          <form action={updateCampaignStepAction} className="grid gap-3 border-t border-[#edf0ea] p-3">
                            <input type="hidden" name="stepId" value={step.id} />
                            <div className="grid gap-3 sm:grid-cols-[110px_130px_1fr]">
                              <label className="text-xs text-[#5f6a62]">
                                Days
                                <input name="delayDays" className={inputClass} type="number" min={0} defaultValue={step.delayDays} />
                              </label>
                              <label className="text-xs text-[#5f6a62]">
                                Channel
                                <select name="channel" className={inputClass} defaultValue={step.channel}>
                                  <option value="sms">SMS</option>
                                  <option value="email">Email</option>
                                </select>
                              </label>
                              <label className="text-xs text-[#5f6a62]">
                                Subject
                                <input name="subject" className={inputClass} defaultValue={step.subject ?? ""} placeholder="Email subject" />
                              </label>
                            </div>
                            <label className="text-xs text-[#5f6a62]">
                              Message
                              <textarea name="body" className={inputClass} defaultValue={step.body} rows={5} required />
                            </label>
                            <div className="flex flex-wrap items-center gap-3">
                              <label className="inline-flex items-center gap-2 text-xs text-[#5f6a62]">
                                <input name="requiresApproval" type="checkbox" defaultChecked={step.requiresApproval} /> Requires approval
                              </label>
                              <label className="inline-flex items-center gap-2 text-xs text-[#5f6a62]">
                                <input name="stopOnReply" type="checkbox" defaultChecked={step.stopOnReply} /> Stop on reply
                              </label>
                              <Button>Save step</Button>
                            </div>
                          </form>
                        </details>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          </Panel>

          <Panel title="Lead automation">
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
