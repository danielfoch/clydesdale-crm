import { Badge, inputClass, PageHeader, Panel } from "@/components/ui";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const db = getPrisma();
  const workspace = await getDefaultWorkspace();
  const [leadSources, webhooks, campaigns] = await Promise.all([
    db.leadSource.findMany({ where: { workspaceId: workspace.id }, orderBy: { name: "asc" } }),
    db.webhookEndpoint.findMany({ where: { workspaceId: workspace.id }, orderBy: { name: "asc" } }),
    db.campaign.findMany({ where: { workspaceId: workspace.id }, include: { steps: true } }),
  ]);

  return (
    <>
      <PageHeader title="Settings" subtitle="How is the system configured?" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Workspace">
          <div className="space-y-3 text-sm">
            <label className="block"><span className="mb-1 block text-[#5f6a62]">Name</span><input className={inputClass} defaultValue={workspace.name} readOnly /></label>
            <div className="flex gap-2"><Badge>AI auto-send: {workspace.aiAutoSendEnabled ? "enabled" : "draft approval"}</Badge></div>
          </div>
        </Panel>
        <Panel title="Users">
          <div className="space-y-2 text-sm">
            {workspace.members.map((member) => (
              <div key={member.id} className="rounded border border-[#e4e8df] p-3">
                <div className="font-medium">{member.user.name}</div>
                <div className="text-[#5f6a62]">{member.user.email} · {member.role}</div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Lead sources">
          <div className="flex flex-wrap gap-2">{leadSources.map((source) => <Badge key={source.id}>{source.name}: {source.kind}</Badge>)}</div>
        </Panel>
        <Panel title="Gmail OAuth/settings placeholder">
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <input className={inputClass} placeholder="GMAIL_CLIENT_ID" readOnly />
            <input className={inputClass} placeholder="GMAIL_CLIENT_SECRET" readOnly />
          </div>
        </Panel>
        <Panel title="Twilio settings">
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <input className={inputClass} placeholder="TWILIO_ACCOUNT_SID" readOnly />
            <input className={inputClass} placeholder="TWILIO_AUTH_TOKEN" readOnly />
          </div>
        </Panel>
        <Panel title="AI provider settings">
          <div className="space-y-2 text-sm text-[#5f6a62]">
            <p>Provider abstraction is wired. Without API keys, deterministic mocked AI keeps demos working.</p>
            <Badge>Approval mode by default</Badge>
          </div>
        </Panel>
        <Panel title="Webhook endpoints">
          <div className="space-y-2 text-sm">
            {webhooks.map((webhook) => (
              <div key={webhook.id} className="rounded border border-[#e4e8df] p-3">
                <div className="font-medium">{webhook.name}</div>
                <div className="break-all text-[#5f6a62]">{webhook.url}</div>
                <div className="mt-2 flex flex-wrap gap-2">{webhook.events.map((event) => <Badge key={event}>{event}</Badge>)}</div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title="Campaign templates">
          <div className="space-y-2 text-sm">
            {campaigns.map((campaign) => <div key={campaign.id}>{campaign.name} · {campaign.steps.length} steps</div>)}
          </div>
        </Panel>
        <Panel title="Compliance/unsubscribe">
          <p className="text-sm text-[#5f6a62]">{workspace.unsubscribeFooter}</p>
          <div className="mt-3 flex flex-wrap gap-2"><Badge>Email consent required</Badge><Badge>SMS STOP placeholder</Badge><Badge>Marketing opt-out guard</Badge></div>
        </Panel>
      </div>
    </>
  );
}
