import { notFound } from "next/navigation";
import {
  addNoteAction,
  approveDraftAction,
  assignContactAction,
  createDealAction,
  createTaskAction,
  draftContactMessageAction,
  enrollCampaignAction,
  logCallAction,
  markPastClientAction,
  sendContactMessageAction,
  snoozeContactAction,
} from "@/app/actions";
import { Badge, Button, inputClass, PageHeader, Panel } from "@/components/ui";
import { draftMessage } from "@/lib/ai";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function PersonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const [contact, campaigns] = await Promise.all([
    db.contact.findUnique({
      where: { id },
      include: {
        emails: true,
        phones: true,
        tags: true,
        consents: true,
        notes: true,
        leadEvents: true,
        messages: true,
        tasks: true,
        campaignEnrollments: { include: { campaign: true } },
        dealParticipants: { include: { deal: true } },
        lifecycleEvents: true,
      },
    }),
    db.campaign.findMany({ where: { workspaceId, isActive: true }, orderBy: { createdAt: "desc" } }),
  ]);
  if (!contact) notFound();

  const channel = contact.phones[0] ? "sms" : "email";
  const aiDraft = await draftMessage(contact, channel);
  const latestDrafts = contact.messages
    .filter((message) => message.status === "draft")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 3);
  const timeline = [
    ...contact.leadEvents.map((item) => ({ at: item.createdAt, label: "Lead event", body: item.source })),
    ...contact.messages.map((item) => ({ at: item.createdAt, label: `${item.channel} ${item.status}`, body: item.body })),
    ...contact.notes.map((item) => ({ at: item.createdAt, label: "Note", body: item.body })),
    ...contact.tasks.map((item) => ({ at: item.createdAt, label: `Task: ${item.status}`, body: item.title })),
    ...contact.dealParticipants.map((item) => ({ at: item.deal.updatedAt, label: "Deal", body: `${item.deal.name}: ${item.deal.nextAction}` })),
    ...contact.lifecycleEvents.map((item) => ({ at: item.dueAt, label: "Client-for-life", body: item.notes ?? item.eventType })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <>
      <PageHeader title={contact.name} subtitle={contact.aiSummary ?? "Relationship context"} />
      <div className="grid gap-4 xl:grid-cols-[300px_1fr_360px]">
        <Panel title="Person">
          <div className="space-y-3 text-sm">
            <div><span className="text-[#5f6a62]">Stage</span><div><Badge>{contact.stage}</Badge></div></div>
            <div><span className="text-[#5f6a62]">Intent</span><div><Badge>{contact.type}</Badge></div></div>
            <div><span className="text-[#5f6a62]">Email</span><div>{contact.emails[0]?.email ?? "None"}</div></div>
            <div><span className="text-[#5f6a62]">Phone</span><div>{contact.phones[0]?.phone ?? "None"}</div></div>
            <div><span className="text-[#5f6a62]">Tags</span><div className="mt-1 flex flex-wrap gap-2">{contact.tags.map((tag) => <Badge key={tag.id}>{tag.tag}</Badge>)}</div></div>
            <div><span className="text-[#5f6a62]">Consent</span><div className="mt-1 flex flex-wrap gap-2">{contact.consents.map((consent) => <Badge key={consent.id}>{consent.channel}: {consent.status}</Badge>)}</div></div>
          </div>
        </Panel>
        <Panel title="Timeline">
          <div className="space-y-4">
            {timeline.map((item, index) => (
              <div key={`${item.label}-${index}`} className="border-b border-[#edf0ea] pb-3 last:border-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{item.label}</span>
                  <time className="text-xs text-[#5f6a62]">{item.at.toLocaleString()}</time>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[#5f6a62]">{item.body}</p>
              </div>
            ))}
          </div>
        </Panel>
        <div className="space-y-4">
          <Panel title="Next action">
            <div className="space-y-3">
              <div>
                <div className="font-medium">{contact.nextAction}</div>
                <div className="text-sm text-[#5f6a62]">Due {contact.nextActionDueAt.toLocaleString()} · {contact.nextActionConfidence}% confidence</div>
                <p className="mt-2 text-sm text-[#5f6a62]">{contact.nextActionReason}</p>
              </div>
              <pre className="whitespace-pre-wrap rounded bg-[#f5f7f2] p-3 text-xs">{aiDraft}</pre>
            </div>
          </Panel>
          <Panel title="Call and text">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {contact.phones[0]?.phone ? (
                  <a className="rounded bg-[#17231d] px-3 py-2 text-sm font-medium text-white hover:bg-[#26382f]" href={`tel:${contact.phones[0].phone}`}>
                    Open Dialer
                  </a>
                ) : null}
                <form action={logCallAction}>
                  <input type="hidden" name="contactId" value={contact.id} />
                  <input type="hidden" name="body" value="Call logged from contact profile." />
                  <Button>Log Call</Button>
                </form>
                <form action={snoozeContactAction}>
                  <input type="hidden" name="contactId" value={contact.id} />
                  <input type="hidden" name="hours" value="24" />
                  <button className="rounded border border-[#cfd6ca] px-3 py-2 text-sm hover:bg-[#f5f7f2]">Snooze</button>
                </form>
                <form action={assignContactAction}>
                  <input type="hidden" name="contactId" value={contact.id} />
                  <button className="rounded border border-[#cfd6ca] px-3 py-2 text-sm hover:bg-[#f5f7f2]">Assign</button>
                </form>
              </div>
              <form action={sendContactMessageAction} className="space-y-2">
                <input type="hidden" name="contactId" value={contact.id} />
                <input type="hidden" name="channel" value="sms" />
                <textarea name="body" className={inputClass} defaultValue={channel === "sms" ? aiDraft : ""} placeholder="Text message" rows={4} required />
                <Button>Send SMS</Button>
              </form>
              <form action={draftContactMessageAction} className="space-y-2">
                <input type="hidden" name="contactId" value={contact.id} />
                <input type="hidden" name="channel" value="sms" />
                <textarea name="body" className={inputClass} defaultValue={channel === "sms" ? aiDraft : ""} placeholder="SMS draft" rows={3} required />
                <Button>Save SMS Draft</Button>
              </form>
              <form action={draftContactMessageAction} className="space-y-2">
                <input type="hidden" name="contactId" value={contact.id} />
                <input type="hidden" name="channel" value="email" />
                <input name="subject" className={inputClass} placeholder="Email subject" defaultValue="Quick follow-up" />
                <textarea name="body" className={inputClass} defaultValue={channel === "email" ? aiDraft : ""} placeholder="Email draft" rows={5} required />
                <Button>Save Email Draft</Button>
              </form>
              {latestDrafts.length ? (
                <div className="space-y-2">
                  <div className="text-sm font-medium">Drafts awaiting approval</div>
                  {latestDrafts.map((message) => (
                    <form key={message.id} action={approveDraftAction} className="rounded border border-[#e4e8df] p-2">
                      <input type="hidden" name="messageId" value={message.id} />
                      <div className="mb-2 line-clamp-2 text-xs text-[#5f6a62]">{message.body}</div>
                      <Button>Approve & Send {message.channel.toUpperCase()}</Button>
                    </form>
                  ))}
                </div>
              ) : null}
            </div>
          </Panel>
          <Panel title="Actions">
            <div className="space-y-4">
              <form action={addNoteAction} className="space-y-2">
                <input type="hidden" name="contactId" value={contact.id} />
                <textarea name="body" className={inputClass} placeholder="Add note" rows={3} required />
                <Button>Add note</Button>
              </form>
              <form action={createTaskAction} className="space-y-2">
                <input type="hidden" name="contactId" value={contact.id} />
                <input name="title" className={inputClass} placeholder="Task title" required />
                <input name="dueAt" className={inputClass} type="datetime-local" />
                <Button>Create task</Button>
              </form>
              <form action={enrollCampaignAction} className="space-y-2">
                <input type="hidden" name="contactId" value={contact.id} />
                <select name="campaignId" className={inputClass}>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select>
                <Button>Start campaign</Button>
              </form>
              <form action={createDealAction} className="space-y-2">
                <input type="hidden" name="contactId" value={contact.id} />
                <input name="name" className={inputClass} defaultValue={`${contact.name} opportunity`} />
                <select name="type" className={inputClass} defaultValue={["buyer", "tenant", "seller", "landlord"].includes(contact.type) ? contact.type : "buyer"}>
                  <option value="buyer">Buyer</option>
                  <option value="tenant">Tenant</option>
                  <option value="seller">Seller</option>
                  <option value="landlord">Landlord</option>
                </select>
                <input name="nextAction" className={inputClass} placeholder="Deal next action" />
                <Button>Create deal</Button>
              </form>
              <form action={markPastClientAction}>
                <input type="hidden" name="contactId" value={contact.id} />
                <Button>Mark past client</Button>
              </form>
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
