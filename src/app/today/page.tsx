import Link from "next/link";
import { CheckCircle2, Clock, MessageSquareText, ShieldAlert } from "lucide-react";
import { approveDraftAction, markTaskDoneAction } from "@/app/actions";
import { Badge, Button, PageHeader, Panel } from "@/components/ui";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

function ItemActions({ primary = "Call" }: { primary?: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button>{primary}</Button>
      {["Snooze", "Assign"].map((label) => (
        <button key={label} className="rounded border border-[#cfd6ca] px-3 py-2 text-sm hover:bg-[#f5f7f2]">
          {label}
        </button>
      ))}
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
      include: { emails: true, phones: true },
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
                <ItemActions primary={lead.nextActionType === "call" ? "Call" : "Approve & Send"} />
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
                <form action={markTaskDoneAction} className="inline-block">
                  <input type="hidden" name="taskId" value={task.id} />
                  <Button>Mark Done</Button>
                </form>
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
                <ItemActions primary="Call" />
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
                <ItemActions primary="Approve & Send" />
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}
