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
  return `${contactTypeLabel(type)} Campaigns`;
}

function helpForType(type: CoreCampaignType) {
  return defaultCampaignRecipe(type).description;
}

function channelLabel(channel: string) {
  if (channel === "sms") return "Text";
  if (channel === "email") return "Email";
  if (channel === "call") return "Call Reminder";
  return "Task";
}

function defaultGoal(type: CoreCampaignType) {
  const goals: Record<CoreCampaignType, string> = {
    buyer: "Convert new buyer leads into appointments",
    seller: "Nurture seller leads toward a valuation call",
    tenant: "Move tenants toward showings",
    landlord: "Help landlords consider leasing or management",
  };
  return goals[type];
}

export default async function CampaignsPage() {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const [campaigns, posts, drafts, aiSetting] = await Promise.all([
    db.campaign.findMany({
      where: { workspaceId, contactType: { in: [...coreCampaignTypes] } },
      include: { steps: { orderBy: { position: "asc" } }, enrollments: true },
      orderBy: { contactType: "asc" },
    }),
    db.contentPost.findMany({ where: { workspaceId }, include: { source: true }, orderBy: { publishedAt: "desc" }, take: 8 }),
    db.newsletterDraft.findMany({ where: { workspaceId }, orderBy: { createdAt: "desc" }, take: 6 }),
    db.aiProviderSetting.findUnique({ where: { workspaceId_provider: { workspaceId, provider: "openai" } } }),
  ]);
  const campaignByType = new Map(campaigns.map((campaign) => [campaign.contactType, campaign]));

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <PageHeader title="Campaigns" subtitle="Warm up buyers, sellers, tenants, and landlords." />
        <div className="flex flex-wrap gap-2">
          <details className="relative [&>summary::-webkit-details-marker]:hidden">
            <summary className="cursor-pointer rounded bg-[#17231d] px-3 py-2 text-sm font-medium text-white hover:bg-[#26382f]">
              Create with AI
            </summary>
            <div className="absolute right-0 z-30 mt-2 w-[min(94vw,460px)] rounded-md border border-[#d9ded5] bg-white p-4 shadow-xl">
              <form action={generateCampaignRecipeAction} className="space-y-3">
                <select name="contactType" className={inputClass}>
                  {coreCampaignTypes.map((type) => <option key={type} value={type}>{contactTypeLabel(type)}</option>)}
                </select>
                <input name="goal" className={inputClass} placeholder="Goal" defaultValue="Convert leads into appointments" />
                <select name="tone" className={inputClass} defaultValue="direct">
                  <option value="direct">Direct</option>
                  <option value="warm">Warm</option>
                  <option value="luxury">Luxury</option>
                  <option value="casual">Casual</option>
                  <option value="professional">Professional</option>
                </select>
                <div className="grid grid-cols-2 gap-3">
                  <input name="numberOfSteps" className={inputClass} type="number" min={1} max={8} defaultValue={5} />
                  <input name="totalDurationDays" className={inputClass} type="number" min={0} max={90} defaultValue={14} />
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-[#5f6a62]">
                  {[
                    ["sms", "Text"],
                    ["email", "Email"],
                    ["note", "Task"],
                    ["call", "Call Reminder"],
                  ].map(([value, label]) => (
                    <label key={value} className="inline-flex items-center gap-2">
                      <input name="channels" type="checkbox" value={value} defaultChecked={value === "sms" || value === "email"} /> {label}
                    </label>
                  ))}
                </div>
                <textarea name="prompt" className={inputClass} placeholder="Extra notes. Example: luxury condo buyers, keep it casual, push to phone appointment." rows={3} />
                <Button>Generate Campaign</Button>
                <p className="text-xs leading-5 text-[#68736a]">
                  {aiSetting?.apiKey ? "Using your saved server-side LLM API key." : "Mock AI mode. Add an OpenAI API key in Settings for live generation."}
                </p>
              </form>
            </div>
          </details>

          <details className="relative [&>summary::-webkit-details-marker]:hidden">
            <summary className="cursor-pointer rounded border border-[#cfd6ca] bg-white px-3 py-2 text-sm font-medium text-[#17231d] hover:bg-[#f5f7f2]">
              AI Plugin
            </summary>
            <div className="absolute right-0 z-30 mt-2 w-[min(94vw,520px)] rounded-md border border-[#d9ded5] bg-white p-4 shadow-xl">
              <div className="space-y-3 text-sm text-[#5f6a62]">
                <div>
                  <h3 className="font-medium text-[#17231d]">Campaign generation API</h3>
                  <p className="mt-1">Use this from Codex, Claude, OpenClaw, or another agent to draft a buyer, seller, tenant, or landlord sequence.</p>
                </div>
                <pre className="overflow-auto rounded border border-[#e4e8df] bg-[#fbfcfa] p-3 text-xs text-[#26352c]">{`POST /api/ai/campaigns/generate
{
  "contactType": "buyer",
  "goal": "Convert buyer leads into appointments",
  "tone": "direct",
  "numberOfSteps": 5,
  "totalDurationDays": 14,
  "channels": ["sms", "email", "call"]
}`}</pre>
                <div className="grid gap-2 text-xs">
                  <div className="rounded border border-[#e4e8df] bg-[#fbfcfa] p-2">Returns structured JSON. It does not auto-send messages.</div>
                  <div className="rounded border border-[#e4e8df] bg-[#fbfcfa] p-2">Save an OpenAI API key in Settings for live generation. Without it, mock generation still works.</div>
                  <div className="rounded border border-[#e4e8df] bg-[#fbfcfa] p-2">Future ChatGPT App/MCP OAuth can connect here later; this V1 uses server-side API keys.</div>
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>

      <div className="space-y-3">
        {coreCampaignTypes.map((type) => {
          const campaign = campaignByType.get(type);
          const steps = campaign?.steps ?? [];
          return (
            <details key={type} className="rounded border border-[#e4e8df] bg-white shadow-sm [&>summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer items-center justify-between gap-3 p-4 hover:bg-[#f8faf6]">
                <div>
                  <h2 className="text-base font-semibold">{titleForType(type)}</h2>
                  <p className="mt-1 text-sm text-[#5f6a62]">{campaign?.description ?? helpForType(type)}</p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  <Badge>{steps.length} steps</Badge>
                  <Badge>{campaign?.enrollments.filter((item) => item.status === "active").length ?? 0} active</Badge>
                  <Badge>{campaign?.isActive === false ? "Paused" : "Active"}</Badge>
                </div>
              </summary>

              <div className="space-y-3 border-t border-[#edf0ea] p-4">
                {!campaign ? (
                  <form action={generateCampaignRecipeAction} className="rounded border border-dashed border-[#d9ded5] p-3">
                    <input type="hidden" name="contactType" value={type} />
                    <input type="hidden" name="goal" value={defaultGoal(type)} />
                    <p className="mb-3 text-sm text-[#5f6a62]">No campaign yet. Create one with AI or add a core recipe.</p>
                    <Button>Create this campaign</Button>
                  </form>
                ) : null}

                {campaign ? (
                  <div className="rounded bg-[#f8faf6] p-3 text-sm text-[#5f6a62]">
                    {campaign.name} · {steps.length} steps over {steps.at(-1)?.delayDays ?? 0} days
                  </div>
                ) : null}

                {steps.map((step, index) => (
                  <details key={step.id} className="rounded border border-[#e4e8df] bg-[#fbfcfa] [&>summary::-webkit-details-marker]:hidden">
                    <summary className="flex cursor-pointer items-center justify-between gap-3 p-3 hover:bg-white">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge>{index + 1}</Badge>
                          <Badge>Day {step.delayDays}</Badge>
                          <Badge>{channelLabel(step.channel)}</Badge>
                          {!step.isActive ? <Badge>Inactive</Badge> : null}
                        </div>
                        <p className="mt-2 line-clamp-1 text-sm font-medium text-[#26352c]">{step.title || step.subject || step.body}</p>
                        <p className="mt-1 line-clamp-1 text-xs text-[#68736a]">{step.body}</p>
                      </div>
                      <span className="text-xs text-[#68736a]">Edit</span>
                    </summary>

                    <form action={updateCampaignStepAction} className="grid gap-3 border-t border-[#edf0ea] p-3">
                      <input type="hidden" name="stepId" value={step.id} />
                      <div className="grid gap-3 sm:grid-cols-[90px_140px_1fr]">
                        <label className="text-xs text-[#5f6a62]">
                          Day
                          <input name="delayDays" className={inputClass} type="number" min={0} defaultValue={step.delayDays} />
                        </label>
                        <label className="text-xs text-[#5f6a62]">
                          Channel
                          <select name="channel" className={inputClass} defaultValue={step.channel}>
                            <option value="sms">Text</option>
                            <option value="email">Email</option>
                            <option value="note">Task</option>
                            <option value="call">Call Reminder</option>
                          </select>
                        </label>
                        <label className="text-xs text-[#5f6a62]">
                          Title
                          <input name="title" className={inputClass} defaultValue={step.title ?? ""} placeholder="First response" />
                        </label>
                      </div>
                      <label className="text-xs text-[#5f6a62]">
                        Email subject
                        <input name="subject" className={inputClass} defaultValue={step.subject ?? ""} placeholder="Only used for email" />
                      </label>
                      <label className="text-xs text-[#5f6a62]">
                        Message body
                        <textarea name="body" className={inputClass} defaultValue={step.body} rows={5} required />
                      </label>
                      <div className="rounded border border-[#e4e8df] bg-white p-2 text-xs text-[#68736a]">
                        Variables: {"{{first_name}}"}, {"{{agent_name}}"}, {"{{area}}"}, {"{{property_type}}"}, {"{{budget}}"}, {"{{timeline}}"}
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <label className="inline-flex items-center gap-2 text-xs text-[#5f6a62]">
                          <input name="isActive" type="checkbox" defaultChecked={step.isActive} /> Active
                        </label>
                        <label className="inline-flex items-center gap-2 text-xs text-[#5f6a62]">
                          <input name="requiresApproval" type="checkbox" defaultChecked={step.requiresApproval} /> Requires approval
                        </label>
                        <label className="inline-flex items-center gap-2 text-xs text-[#5f6a62]">
                          <input name="stopOnReply" type="checkbox" defaultChecked={step.stopOnReply} /> Stop on reply
                        </label>
                        <Button>Save</Button>
                      </div>
                    </form>
                  </details>
                ))}
              </div>
            </details>
          );
        })}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Automation">
          <form action={runCampaignsNowAction} className="space-y-3 text-sm text-[#5f6a62]">
            <p>New Pipeline leads auto-enroll by type. Due Text and Email steps create drafts; Task and Call Reminder steps create tasks. Converted clients exit lead nurture.</p>
            <Button>Run due campaign steps</Button>
          </form>
        </Panel>
        <Panel title="Core recipes">
          <form action={ensureCoreCampaignsAction} className="space-y-3 text-sm text-[#5f6a62]">
            <p>Create any missing Buyer, Seller, Tenant, or Landlord campaign.</p>
            <Button>Ensure core campaigns</Button>
          </form>
        </Panel>
      </div>

      <details className="mt-4 rounded border border-[#e4e8df] bg-white p-4 [&>summary::-webkit-details-marker]:hidden">
        <summary className="cursor-pointer text-sm font-medium">Advanced content tools</summary>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Panel title="RSS/Substack import">
            <form action={importRssAction} className="space-y-3">
              <input name="url" className={inputClass} placeholder="https://example.substack.com/feed" required />
              <Button>Import posts</Button>
            </form>
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
      </details>
    </>
  );
}
