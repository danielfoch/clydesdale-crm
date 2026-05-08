"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronDown, ChevronRight, GripVertical } from "lucide-react";
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
import { Button, inputClass, Panel } from "@/components/ui";
import {
  contactTypeBadgeClass,
  contactTypeLabel,
  dealPipelineStages,
  formatDue,
  stageLabel,
  urgencyBadgeClass,
  urgencyLabel,
} from "@/lib/display";

type DealTask = {
  id: string;
  title: string;
  status: string;
  dueAt: string | null;
};

type DealContact = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
};

export type BoardDeal = {
  id: string;
  name: string;
  type: string;
  stage: string;
  valueCents: number;
  propertyAddress: string | null;
  nextAction: string;
  nextActionDueAt: string;
  riskLevel: string;
  notes: string | null;
  primaryContact: DealContact | null;
  contact: DealContact | null;
  tasks: DealTask[];
};

function SecondaryButton({ children }: { children: React.ReactNode }) {
  return <button className="rounded border border-[#cfd6ca] px-3 py-2 text-sm hover:bg-[#f5f7f2]">{children}</button>;
}

function BadgePill({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`rounded px-2 py-1 text-xs font-medium ${className}`}>{children}</span>;
}

function cardColorClass(type: string) {
  switch (type) {
    case "buyer":
      return "border-l-[#7aa7d9] bg-[#f7fbff]";
    case "tenant":
      return "border-l-[#6bbac8] bg-[#f5fcfd]";
    case "seller":
      return "border-l-[#d98a7a] bg-[#fff8f7]";
    case "landlord":
      return "border-l-[#d8aa55] bg-[#fffaf0]";
    default:
      return "border-l-[#aab2aa] bg-white";
  }
}

const legendItems = [
  { label: "Buyer", className: "border-l-[#7aa7d9] bg-[#f7fbff]" },
  { label: "Tenant", className: "border-l-[#6bbac8] bg-[#f5fcfd]" },
  { label: "Seller", className: "border-l-[#d98a7a] bg-[#fff8f7]" },
  { label: "Landlord", className: "border-l-[#d8aa55] bg-[#fffaf0]" },
  { label: "Unknown", className: "border-l-[#aab2aa] bg-white" },
];

function DealColorLegend() {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[#68736a]" aria-label="Deal card color legend">
      <span className="font-medium text-[#46534b]">Card colors</span>
      {legendItems.map((item) => (
        <span key={item.label} className={`inline-flex items-center rounded border border-[#d9ded5] border-l-4 px-2 py-1 ${item.className}`}>
          {item.label}
        </span>
      ))}
    </div>
  );
}

function stageFormData(dealId: string, stage: string) {
  const formData = new FormData();
  formData.set("dealId", dealId);
  formData.set("stage", stage);
  return formData;
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

function DealCard({
  deal,
  expanded,
  onToggle,
}: {
  deal: BoardDeal;
  expanded: boolean;
  onToggle: () => void;
}) {
  const contact = deal.primaryContact ?? deal.contact;
  const contactInfo = contact?.email ?? contact?.phone ?? "No contact info";
  const openTasks = deal.tasks.filter((task) => task.status === "open").slice(0, 3);
  const urgencyScore = deal.riskLevel === "high" || deal.riskLevel === "stalled" ? 82 : 48;
  const value = deal.valueCents ? `$${(deal.valueCents / 100).toLocaleString()}` : "Not set";
  const dueAt = new Date(deal.nextActionDueAt);

  return (
    <article
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", deal.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      className={`rounded-md border border-l-4 border-[#e1e6dc] p-3 shadow-sm transition hover:-translate-y-px hover:shadow-md ${cardColorClass(deal.type)}`}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 shrink-0 text-[#a0a99f]" size={14} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-medium">{contact?.name ?? deal.name}</div>
              <div className="mt-1 truncate text-xs text-[#68736a]">{deal.propertyAddress ?? deal.name}</div>
            </div>
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              aria-label={expanded ? `Collapse ${deal.name}` : `Expand ${deal.name}`}
              className="grid size-7 shrink-0 place-items-center rounded border border-[#d9ded5] text-[#46534b] hover:bg-[#f5f7f2]"
            >
              {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <BadgePill className={contactTypeBadgeClass(deal.type)}>{contactTypeLabel(deal.type)}</BadgePill>
            <BadgePill className="bg-[#e9efe6] text-[#304037]">{stageLabel(deal.stage)}</BadgePill>
            <BadgePill className={urgencyBadgeClass(urgencyScore)}>{urgencyLabel(urgencyScore)}</BadgePill>
            <BadgePill className={dueAt < new Date() ? "bg-[#fee2e2] text-[#7f1d1d]" : "bg-[#eef2ea] text-[#46534b]"}>
              {formatDue(dueAt)}
            </BadgePill>
          </div>
          <p className="mt-3 line-clamp-2 text-sm text-[#26352c]">{deal.nextAction}</p>
        </div>
      </div>

      {expanded ? (
        <div className="mt-3 space-y-4 border-t border-[#edf0ea] pt-3">
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
      ) : null}
    </article>
  );
}

export function DealsBoard({ deals }: { deals: BoardDeal[] }) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function moveDeal(dealId: string, stage: string) {
    startTransition(async () => {
      await updateDealPipelineStageAction(stageFormData(dealId, stage));
      setDraggingId(null);
      setOverStage(null);
      router.refresh();
    });
  }

  return (
    <>
      <DealColorLegend />
      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[1120px] grid-cols-4 gap-4">
          {dealPipelineStages.map((stage) => {
            const cards = deals.filter((deal) => stage.dealStages.includes(deal.stage as never));
            const isOver = overStage === stage.key;
            return (
              <div
                key={stage.key}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setOverStage(stage.key);
                }}
                onDragLeave={() => setOverStage(null)}
                onDrop={(event) => {
                  event.preventDefault();
                  const dealId = event.dataTransfer.getData("text/plain") || draggingId;
                  if (dealId) moveDeal(dealId, stage.key);
                }}
                className={isOver ? "rounded-md ring-2 ring-[#17231d]/25" : "rounded-md"}
              >
                <Panel title={`${stage.label} · ${cards.length}`}>
                  <p className="mb-3 min-h-10 text-xs text-[#68736a]">{stage.description}</p>
                  <div className={`space-y-3 rounded-md transition ${isOver ? "bg-[#edf1e9] p-1.5" : ""}`}>
                    {cards.length ? cards.map((deal) => (
                      <div key={deal.id} onDragStart={() => setDraggingId(deal.id)} onDragEnd={() => { setDraggingId(null); setOverStage(null); }}>
                        <DealCard
                          deal={deal}
                          expanded={expandedId === deal.id}
                          onToggle={() => setExpandedId(expandedId === deal.id ? null : deal.id)}
                        />
                      </div>
                    )) : (
                      <div className="rounded border border-dashed border-[#d9ded5] p-4 text-sm text-[#68736a]">Drop deals here.</div>
                    )}
                  </div>
                  {isPending ? <div className="mt-2 text-[11px] text-[#68736a]">Moving...</div> : null}
                </Panel>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
