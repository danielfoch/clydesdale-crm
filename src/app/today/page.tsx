import Link from "next/link";
import { CheckCircle2, Clock, MessageSquareText, ShieldAlert, UserRound } from "lucide-react";
import {
  approveDraftAction,
  assignContactAction,
  assignDealAction,
  completeLifecycleTouchAction,
  createDealAction,
  createTaskAction,
  logCallAction,
  markTaskDoneAction,
  snoozeContactAction,
  snoozeDealAction,
} from "@/app/actions";
import { Badge, Button, inputClass, PageHeader, Panel } from "@/components/ui";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

function SecondaryButton({ children }: { children: React.ReactNode }) {
  return <button className="rounded border border-[#cfd6ca] px-3 py-2 text-sm hover:bg-[#f5f7f2]">{children}</button>;
}

function ContactDropdown({
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
    <details className="relative ml-auto [&>summary::-webkit-details-marker]:hidden">
      <summary className="cursor-pointer rounded border border-[#cfd6ca] px-3 py-2 text-sm hover:bg-[#f5f7f2]">Actions</summary>
      <div className="absolute right-0 z-20 mt-2 w-[min(92vw,420px)] space-y-3 rounded-md border border-[#d9ded5] bg-white p-4 shadow-xl">
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
        <form action={createTaskAction} className="space-y-2">
          <input type="hidden" name="contactId" value={contactId} />
          <input name="title" className={inputClass} placeholder="Open a task" required />
          <input name="dueAt" className={inputClass} type="datetime-local" />
          <Button>Create task</Button>
        </form>
      </div>
    </details>
  );
}

function DealDropdown({ dealId }: { dealId: string }) {
  return (
    <details className="relative ml-auto [&>summary::-webkit-details-marker]:hidden">
      <summary className="cursor-pointer rounded border border-[#cfd6ca] px-3 py-2 text-sm hover:bg-[#f5f7f2]">Actions</summary>
      <div className="absolute right-0 z-20 mt-2 flex w-[min(92vw,320px)] flex-wrap gap-2 rounded-md border border-[#d9ded5] bg-white p-4 shadow-xl">
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
    </details>
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
      <PageHeader title="Today" subtitle="What should I do now?" />
      <Panel title="Action queue">
        <div className="divide-y divide-[#edf0ea]">
          {newLeads.map((lead) => (
            <article key={`lead-${lead.id}`} className="grid gap-3 py-4 md:grid-cols-[1.3fr_1fr_auto] md:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <UserRound size={16} />
                  <Link href={`/people/${lead.id}`} className="font-medium hover:underline">{lead.name}</Link>
                  <Badge>new lead</Badge>
                  <Badge>{lead.urgencyScore}/100</Badge>
                </div>
                <p className="mt-1 text-xs text-[#5f6a62]">{lead.emails[0]?.email ?? lead.phones[0]?.phone ?? "No contact info"}</p>
              </div>
              <div>
                <p className="text-sm font-medium">{lead.nextAction}</p>
                <p className="mt-1 text-xs text-[#5f6a62]">{lead.nextActionReason}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {lead.nextActionType !== "call" && lead.messages[0] ? (
                  <form action={approveDraftAction}>
                    <input type="hidden" name="messageId" value={lead.messages[0].id} />
                    <Button>Approve & Send</Button>
                  </form>
                ) : null}
                <ContactDropdown contactId={lead.id} contactName={lead.name} contactType={lead.type} />
              </div>
            </article>
          ))}

          {overdueTasks.map((task) => (
            <article key={`task-${task.id}`} className="grid gap-3 py-4 md:grid-cols-[1.3fr_1fr_auto] md:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <Clock size={16} />
                  <span className="font-medium">{task.title}</span>
                  <Badge>task due</Badge>
                </div>
                <p className="mt-1 text-xs text-[#5f6a62]">{task.contact ? task.contact.name : "No contact linked"}</p>
              </div>
              <p className="text-sm text-[#5f6a62]">{task.body ?? "Open task from the menu or mark it done."}</p>
              <div className="flex flex-wrap items-center gap-2">
                <form action={markTaskDoneAction}>
                  <input type="hidden" name="taskId" value={task.id} />
                  <Button>Mark Done</Button>
                </form>
                {task.contactId ? (
                  <ContactDropdown contactId={task.contactId} contactName={task.contact?.name ?? "Contact"} contactType={task.contact?.type ?? "buyer"} />
                ) : null}
              </div>
            </article>
          ))}

          {drafts.map((draft) => (
            <article key={`draft-${draft.id}`} className="grid gap-3 py-4 md:grid-cols-[1.3fr_1fr_auto] md:items-center">
              <div>
                <Link href={draft.contact ? `/people/${draft.contact.id}` : "/people"} className="flex items-center gap-2 font-medium hover:underline">
                  <MessageSquareText size={16} /> {draft.contact?.name ?? "Unknown contact"}
                </Link>
                <p className="mt-1 text-xs text-[#5f6a62]">AI draft waiting for approval</p>
              </div>
              <p className="line-clamp-2 text-sm text-[#5f6a62]">{draft.body}</p>
              <form action={approveDraftAction}>
                <input type="hidden" name="messageId" value={draft.id} />
                <Button>Approve & Send</Button>
              </form>
            </article>
          ))}

          {deals.map((deal) => (
            <article key={`deal-${deal.id}`} className="grid gap-3 py-4 md:grid-cols-[1.3fr_1fr_auto] md:items-center">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <ShieldAlert size={16} />
                  <span className="font-medium">{deal.name}</span>
                  <Badge>{deal.riskLevel}</Badge>
                </div>
                <p className="mt-1 text-xs text-[#5f6a62]">Deal at risk</p>
              </div>
              <p className="text-sm text-[#5f6a62]">{deal.nextAction}</p>
              <DealDropdown dealId={deal.id} />
            </article>
          ))}

          {lifecycle.map((event) => (
            <article key={`life-${event.id}`} className="grid gap-3 py-4 md:grid-cols-[1.3fr_1fr_auto] md:items-center">
              <div>
                <Link href={`/people/${event.contactId}`} className="flex items-center gap-2 font-medium hover:underline">
                  <CheckCircle2 size={16} /> {event.contact.name}
                </Link>
                <p className="mt-1 text-xs text-[#5f6a62]">Past client touch due</p>
              </div>
              <p className="text-sm text-[#5f6a62]">{event.notes ?? "Quarterly home valuation or check-in due."}</p>
              <div className="flex flex-wrap items-center gap-2">
                <form action={completeLifecycleTouchAction}>
                  <input type="hidden" name="eventId" value={event.id} />
                  <Button>Approve & Send</Button>
                </form>
                <ContactDropdown contactId={event.contactId} contactName={event.contact.name} contactType={event.contact.type} />
              </div>
            </article>
          ))}
        </div>
      </Panel>
    </>
  );
}
