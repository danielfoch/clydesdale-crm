import Link from "next/link";
import { CheckCircle2, Clock, MessageSquareText, ShieldAlert } from "lucide-react";
import {
  approveDraftAction,
  assignContactAction,
  assignDealAction,
  completeLifecycleTouchAction,
  createDealAction,
  logCallAction,
  markTaskDoneAction,
  snoozeContactAction,
  snoozeDealAction,
} from "@/app/actions";
import { Badge, Button, PageHeader, Panel } from "@/components/ui";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

function SecondaryButton({ children }: { children: React.ReactNode }) {
  return <button className="rounded border border-[#cfd6ca] px-3 py-2 text-sm hover:bg-[#f5f7f2]">{children}</button>;
}

function ContactActions({
  contactId,
  contactName,
  contactType,
}: {
  contactId: string;
  contactName: string;
  contactType: string;
}) {
  const dealType = ["buyer", "tenant", "seller", "landlord"].includes(contactType) ? contactType : "buyer";
  return (
    <div className="flex flex-wrap gap-2">
      <form action={logCallAction}>
        <input type="hidden" name="contactId" value={contactId} />
        <input type="hidden" name="body" value="Call logged from Today queue." />
        <Button>Call</Button>
      </form>
      <form action={snoozeContactAction}>
        <input type="hidden" name="contactId" value={contactId} />
        <input type="hidden" name="hours" value="24" />
        <SecondaryButton>Snooze</SecondaryButton>
      </form>
      <form action={assignContactAction}>
        <input type="hidden" name="contactId" value={contactId} />
        <SecondaryButton>Assign</SecondaryButton>
      </form>
      <form action={createDealAction}>
        <input type="hidden" name="contactId" value={contactId} />
        <input type="hidden" name="name" value={`${contactName} opportunity`} />
        <input type="hidden" name="type" value={dealType} />
        <input type="hidden" name="nextAction" value="Confirm client criteria and next milestone" />
        <SecondaryButton>Convert to Deal</SecondaryButton>
      </form>
    </div>
  );
}

function DealActions({ dealId }: { dealId: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <form action={logCallAction}>
        <input type="hidden" name="dealId" value={dealId} />
        <input type="hidden" name="body" value="Deal call logged from Today queue." />
        <Button>Call</Button>
      </form>
      <form action={snoozeDealAction}>
        <input type="hidden" name="dealId" value={dealId} />
        <input type="hidden" name="hours" value="24" />
        <SecondaryButton>Snooze</SecondaryButton>
      </form>
      <form action={assignDealAction}>
        <input type="hidden" name="dealId" value={dealId} />
        <SecondaryButton>Assign</SecondaryButton>
      </form>
    </div>
  );
}

export default async function TodayPage() {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const now = new Date();
  const soon = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
  const [newLeads, overdueTasks, drafts, deals, lifecycle] = await Promise.all([
    db.contact.findMany({
      where: { workspaceId, stage: { in: ["new", "attempting_contact"] } },
      include: { emails: true, phones: true, messages: { where: { status: "draft" }, orderBy: { createdAt: "asc" }, take: 1 } },
      orderBy: [{ nextActionDueAt: "asc" }, { urgencyScore: "desc" }],
      take: 5,
    }),
    db.task.findMany({ where: { workspaceId, status: "open", dueAt: { lt: now } }, include: { contact: true }, take: 5 }),
    db.message.findMany({
      where: { workspaceId, status: "draft", aiGenerated: true, approvedByUser: false },
      include: { contact: true },
      orderBy: { createdAt: "asc" },
      take: 5,
    }),
    db.deal.findMany({
      where: {
        workspaceId,
        stage: { not: "closed" },
        OR: [{ riskLevel: { in: ["high", "stalled"] } }, { deadline: { lte: soon } }],
      },
      include: { participants: { include: { contact: true } } },
      orderBy: [{ nextActionDueAt: "asc" }, { updatedAt: "desc" }],
      take: 5,
    }),
    db.clientLifecycleEvent.findMany({
      where: { workspaceId, status: "due", dueAt: { lte: now } },
      include: { contact: true },
      orderBy: { dueAt: "asc" },
      take: 5,
    }),
  ]);

  return (
    <>
      <PageHeader title="Today" subtitle="The whole business in one queue: respond, approve, follow up, de-risk deals, and keep past clients warm." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="New leads">
          <div className="space-y-4">
            {newLeads.map((lead) => (
              <div key={lead.id} className="space-y-2 border-b border-[#edf0ea] pb-4 last:border-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <Link href={`/people/${lead.id}`} className="font-medium hover:underline">{lead.name}</Link>
                  <Badge>{lead.urgencyScore}/100</Badge>
                </div>
                <p className="text-sm text-[#5f6a62]">{lead.nextAction} · {lead.nextActionReason}</p>
                <div className="flex flex-wrap gap-2">
                  {lead.nextActionType !== "call" && lead.messages[0] ? (
                    <form action={approveDraftAction}>
                      <input type="hidden" name="messageId" value={lead.messages[0].id} />
                      <Button>Approve & Send</Button>
                    </form>
                  ) : null}
                  <ContactActions contactId={lead.id} contactName={lead.name} contactType={lead.type} />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Due now">
          <div className="space-y-4">
            {overdueTasks.map((task) => (
              <div key={task.id} className="space-y-2 border-b border-[#edf0ea] pb-4 last:border-0 last:pb-0">
                <div className="flex items-center gap-2 font-medium"><Clock size={15} /> {task.title}</div>
                <p className="text-sm text-[#5f6a62]">{task.contact ? task.contact.name : "No contact linked"}</p>
                <div className="flex flex-wrap gap-2">
                  <form action={markTaskDoneAction}>
                    <input type="hidden" name="taskId" value={task.id} />
                    <Button>Mark Done</Button>
                  </form>
                  {task.contactId ? (
                    <ContactActions contactId={task.contactId} contactName={task.contact?.name ?? "Contact"} contactType={task.contact?.type ?? "buyer"} />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="AI drafts to approve">
          <div className="space-y-4">
            {drafts.map((draft) => (
              <div key={draft.id} className="space-y-2 border-b border-[#edf0ea] pb-4 last:border-0 last:pb-0">
                <Link href={draft.contact ? `/people/${draft.contact.id}` : "/people"} className="flex items-center gap-2 font-medium hover:underline">
                  <MessageSquareText size={15} /> {draft.contact?.name ?? "Unknown contact"}
                </Link>
                <p className="line-clamp-3 text-sm text-[#5f6a62]">{draft.body}</p>
                <form action={approveDraftAction} className="inline-block">
                  <input type="hidden" name="messageId" value={draft.id} />
                  <Button>Approve & Send</Button>
                </form>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Deals at risk">
          <div className="space-y-4">
            {deals.map((deal) => (
              <div key={deal.id} className="space-y-2 border-b border-[#edf0ea] pb-4 last:border-0 last:pb-0">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 font-medium"><ShieldAlert size={15} /> {deal.name}</span>
                  <Badge>{deal.riskLevel}</Badge>
                </div>
                <p className="text-sm text-[#5f6a62]">{deal.nextAction}</p>
                <DealActions dealId={deal.id} />
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Past clients due for quarterly check-in">
          <div className="space-y-4">
            {lifecycle.map((event) => (
              <div key={event.id} className="space-y-2 border-b border-[#edf0ea] pb-4 last:border-0 last:pb-0">
                <Link href={`/people/${event.contactId}`} className="flex items-center gap-2 font-medium hover:underline">
                  <CheckCircle2 size={15} /> {event.contact.name}
                </Link>
                <p className="text-sm text-[#5f6a62]">{event.notes ?? "Quarterly home valuation or check-in due."}</p>
                <div className="flex flex-wrap gap-2">
                  <form action={completeLifecycleTouchAction}>
                    <input type="hidden" name="eventId" value={event.id} />
                    <Button>Approve & Send</Button>
                  </form>
                  <form action={snoozeContactAction}>
                    <input type="hidden" name="contactId" value={event.contactId} />
                    <input type="hidden" name="hours" value="168" />
                    <SecondaryButton>Snooze</SecondaryButton>
                  </form>
                  <form action={assignContactAction}>
                    <input type="hidden" name="contactId" value={event.contactId} />
                    <SecondaryButton>Assign</SecondaryButton>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
