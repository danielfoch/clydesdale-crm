import Link from "next/link";
import {
  assignDealAction,
  closeDealAction,
  draftContactMessageAction,
  logCallAction,
  markTaskDoneAction,
  sendContactMessageAction,
  snoozeDealAction,
  updateDealPipelineStageAction,
} from "@/app/actions";
import { Button, inputClass, PageHeader, Panel } from "@/components/ui";
import {
  contactTypeBadgeClass,
  contactTypeLabel,
  dealPipelineStages,
  formatDue,
  stageLabel,
  urgencyBadgeClass,
  urgencyLabel,
} from "@/lib/display";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type PipelineDeal = Awaited<ReturnType<typeof getDeals>>[number];

function SecondaryButton({ children }: { children: React.ReactNode }) {
  return <button className="rounded border border-[#cfd6ca] px-3 py-2 text-sm hover:bg-[#f5f7f2]">{children}</button>;
}

function BadgePill({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`rounded px-2 py-1 text-xs font-medium ${className}`}>{children}</span>;
}

function MoveDealButtons({ dealId, currentStage }: { dealId: string; currentStage: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {dealPipelineStages.map((stage) => (
        <form key={stage.key} action={updateDealPipelineStageAction}>
          <input type="hidden" name="dealId" value={dealId} />
          <input type="hidden" name="stage" value={stage.key} />
          <button
            className={`rounded border px-2.5 py-1.5 text-xs ${
              stage.dealStages.includes(currentStage as never)
                ? "border-[#17231d] bg-[#17231d] text-white"
                : "border-[#cfd6ca] hover:bg-[#f5f7f2]"
            }`}
          >
            {stage.label}
          </button>
        </form>
      ))}
    </div>
  );
}

function DealCard({ deal }: { deal: PipelineDeal }) {
  const contact = deal.primaryContact ?? deal.participants[0]?.contact;
  const contactInfo = contact?.emails[0]?.email ?? contact?.phones[0]?.phone ?? "No contact info";
  const openTasks = deal.crmTasks.filter((task) => task.status === "open").slice(0, 3);
  const urgencyScore = deal.riskLevel === "high" || deal.riskLevel === "stalled" ? 82 : 48;
  const value = deal.valueCents ? `$${(deal.valueCents / 100).toLocaleString()}` : "Not set";

  return (
    <article className="rounded-md border border-[#e1e6dc] bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-medium">{contact?.name ?? deal.name}</div>
          <div className="mt-1 truncate text-xs text-[#68736a]">{deal.propertyAddress ?? deal.name}</div>
        </div>
        <BadgePill className={contactTypeBadgeClass(deal.type)}>{contactTypeLabel(deal.type)}</BadgePill>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <BadgePill className="bg-[#e9efe6] text-[#304037]">{stageLabel(deal.stage)}</BadgePill>
        <BadgePill className={urgencyBadgeClass(urgencyScore)}>{urgencyLabel(urgencyScore)}</BadgePill>
        <BadgePill className={deal.nextActionDueAt < new Date() ? "bg-[#fee2e2] text-[#7f1d1d]" : "bg-[#eef2ea] text-[#46534b]"}>
          {formatDue(deal.nextActionDueAt)}
        </BadgePill>
      </div>
      <p className="mt-3 line-clamp-2 text-sm text-[#26352c]">{deal.nextAction}</p>
      <details className="mt-3 border-t border-[#edf0ea] pt-3 [&>summary::-webkit-details-marker]:hidden">
        <summary className="cursor-pointer text-sm font-medium text-[#17231d]">Open deal</summary>
        <div className="mt-3 space-y-4">
          <div className="grid gap-2 rounded bg-[#f6f7f4] p-3 text-sm text-[#5f6a62]">
            <div><span className="font-medium text-[#17231d]">Client:</span> {contact ? <Link href={`/people/${contact.id}`} className="hover:underline">{contact.name}</Link> : "No linked contact"}</div>
            <div><span className="font-medium text-[#17231d]">Contact:</span> {contactInfo}</div>
            <div><span className="font-medium text-[#17231d]">Stage:</span> {stageLabel(deal.stage)}</div>
            <div><span className="font-medium text-[#17231d]">Value:</span> {value}</div>
            <div><span className="font-medium text-[#17231d]">Notes:</span> {deal.notes ?? "No notes yet."}</div>
            <div><span className="font-medium text-[#17231d]">Missing items:</span> {openTasks.length ? openTasks.map((task) => task.title).join(", ") : "None logged."}</div>
          </div>

          {openTasks.length ? (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-normal text-[#68736a]">Open tasks</div>
              {openTasks.map((task) => (
                <form key={task.id} action={markTaskDoneAction} className="flex items-center justify-between gap-2 rounded border border-[#e4e8df] p-2">
                  <input type="hidden" name="taskId" value={task.id} />
                  <span className="text-sm">{task.title}</span>
                  <button className="rounded bg-[#dcfce7] px-2 py-1 text-xs font-medium text-[#14532d]">Done</button>
                </form>
              ))}
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-normal text-[#68736a]">Move stage</div>
            <MoveDealButtons dealId={deal.id} currentStage={deal.stage} />
          </div>

          <div className="flex flex-wrap gap-2">
            <form action={logCallAction}>
              <input type="hidden" name="dealId" value={deal.id} />
              <input type="hidden" name="body" value="Deal call started from Deals board." />
              <Button>Call</Button>
            </form>
            <form action={snoozeDealAction}>
              <input type="hidden" name="dealId" value={deal.id} />
              <input type="hidden" name="hours" value="24" />
              <SecondaryButton>Snooze</SecondaryButton>
            </form>
            <form action={assignDealAction}>
              <input type="hidden" name="dealId" value={deal.id} />
              <SecondaryButton>Assign</SecondaryButton>
            </form>
            <form action={closeDealAction}>
              <input type="hidden" name="dealId" value={deal.id} />
              <Button>Close Deal</Button>
            </form>
          </div>

          {contact ? (
            <>
              <form action={sendContactMessageAction} className="space-y-2">
                <input type="hidden" name="contactId" value={contact.id} />
                <input type="hidden" name="channel" value="sms" />
                <textarea name="body" className={inputClass} placeholder="Text message" rows={3} required />
                <Button>Send Text</Button>
              </form>
              <form action={draftContactMessageAction} className="space-y-2">
                <input type="hidden" name="contactId" value={contact.id} />
                <input type="hidden" name="channel" value="email" />
                <input name="subject" className={inputClass} defaultValue="Quick deal update" />
                <textarea name="body" className={inputClass} placeholder="Email draft" rows={3} required />
                <Button>Draft Email</Button>
              </form>
            </>
          ) : null}
        </div>
      </details>
    </article>
  );
}

async function getDeals() {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  return db.deal.findMany({
    where: { workspaceId, stage: { not: "closed" } },
    include: {
      primaryContact: { include: { emails: true, phones: true } },
      participants: { include: { contact: { include: { emails: true, phones: true } } } },
      crmTasks: { orderBy: { dueAt: "asc" }, take: 5 },
    },
    orderBy: [{ riskLevel: "desc" }, { nextActionDueAt: "asc" }],
  });
}

export default async function DealsPage() {
  const deals = await getDeals();

  return (
    <>
      <PageHeader title="Deals" subtitle="Who is already a client and what stage are they in?" />
      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[1120px] grid-cols-4 gap-4">
          {dealPipelineStages.map((stage) => {
            const cards = deals.filter((deal) => stage.dealStages.includes(deal.stage as never));
            return (
              <Panel key={stage.key} title={`${stage.label} · ${cards.length}`}>
                <p className="mb-3 min-h-10 text-xs text-[#68736a]">{stage.description}</p>
                <div className="space-y-3">
                  {cards.length ? cards.map((deal) => <DealCard key={deal.id} deal={deal} />) : (
                    <div className="rounded border border-dashed border-[#d9ded5] p-4 text-sm text-[#68736a]">No deals here.</div>
                  )}
                </div>
              </Panel>
            );
          })}
        </div>
      </div>
    </>
  );
}
