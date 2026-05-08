"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, ChevronDown, ChevronRight, GripVertical, Mail, MessageSquareText, Phone, Timer, UserRound } from "lucide-react";
import {
  assignDealAction,
  completeLoopChecklistItemAction,
  closeDealAction,
  draftContactMessageAction,
  logCallAction,
  markTaskDoneAction,
  sendContactMessageAction,
  snoozeDealAction,
  uncompleteLoopChecklistItemAction,
  updateDealPipelineStageAction,
} from "@/app/actions";
import { inputClass, Panel } from "@/components/ui";
import {
  contactTypeLabel,
  dealPipelineStages,
  formatDue,
  formatDueDelta,
  stageLabel,
  urgencyLabel,
} from "@/lib/display";
import { getDealLoopItems, loopTaskType } from "@/lib/loop-checklists";

type DealTask = {
  id: string;
  title: string;
  type: string;
  status: string;
  dueAt: string | null;
  completedAt: string | null;
};

type DealContact = {
  id: string;
  name: string;
  urgencyScore?: number;
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
  return <button className="rounded border border-[#cfd6ca] px-2.5 py-1.5 text-xs hover:bg-[#f5f7f2]">{children}</button>;
}

function IconChip({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span title={label} aria-label={label} className={`inline-flex h-5 min-w-6 items-center justify-center rounded px-1 text-[10px] font-bold leading-none transition hover:scale-105 ${className}`}>
      {children}
    </span>
  );
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
  { key: "buyer", label: "Buyer", className: "border-l-[#7aa7d9] bg-[#f7fbff]" },
  { key: "tenant", label: "Tenant", className: "border-l-[#6bbac8] bg-[#f5fcfd]" },
  { key: "seller", label: "Seller", className: "border-l-[#d98a7a] bg-[#fff8f7]" },
  { key: "landlord", label: "Landlord", className: "border-l-[#d8aa55] bg-[#fffaf0]" },
  { key: "unknown", label: "Unknown", className: "border-l-[#aab2aa] bg-white" },
] as const;

type CardTypeFilter = (typeof legendItems)[number]["key"] | "all";

function normalizedCardType(type: string): CardTypeFilter {
  return ["buyer", "tenant", "seller", "landlord"].includes(type) ? (type as CardTypeFilter) : "unknown";
}

function DealColorLegend({
  activeType,
  onChange,
  deals,
}: {
  activeType: CardTypeFilter;
  onChange: (type: CardTypeFilter) => void;
  deals: BoardDeal[];
}) {
  const countFor = (type: CardTypeFilter) =>
    type === "all" ? deals.length : deals.filter((deal) => normalizedCardType(deal.type) === type).length;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-[#68736a]" aria-label="Deal card color filters">
      <span className="font-medium text-[#46534b]">Show</span>
      <button
        type="button"
        onClick={() => onChange("all")}
        aria-pressed={activeType === "all"}
        className={`inline-flex items-center rounded border px-2 py-1 transition hover:bg-[#f5f7f2] ${
          activeType === "all" ? "border-[#17231d] bg-[#17231d] text-white" : "border-[#d9ded5] bg-white"
        }`}
      >
        All · {countFor("all")}
      </button>
      {legendItems.map((item) => {
        const active = activeType === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onChange(active ? "all" : item.key)}
            aria-pressed={active}
            title={`Show only ${item.label.toLowerCase()} cards`}
            className={`inline-flex items-center rounded border border-l-4 px-2 py-1 transition hover:-translate-y-px hover:shadow-sm ${item.className} ${
              active ? "border-[#17231d] ring-2 ring-[#17231d]/20" : "border-[#d9ded5]"
            }`}
          >
            {item.label} · {countFor(item.key)}
          </button>
        );
      })}
    </div>
  );
}

function stageFormData(dealId: string, stage: string) {
  const formData = new FormData();
  formData.set("dealId", dealId);
  formData.set("stage", stage);
  return formData;
}

function urgencyClass(score: number) {
  if (score >= 75) return "bg-[#fef3c7] text-[#78350f]";
  if (score >= 40) return "bg-[#e0f2fe] text-[#075985]";
  return "bg-[#ecfdf5] text-[#166534]";
}

function dueClass(value: string) {
  if (value.startsWith("-")) return "bg-[#fee2e2] text-[#7f1d1d]";
  if (value === "0d") return "bg-[#fef3c7] text-[#78350f]";
  return "bg-[#eef2ea] text-[#46534b]";
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
  const openTasks = deal.tasks.filter((task) => task.status === "open").slice(0, 2);
  const loopItems = getDealLoopItems(deal.stage);
  const completedLoopCount = loopItems.filter((item) =>
    deal.tasks.some((task) => task.type === loopTaskType("deal", deal.stage, item.key) && task.status === "done"),
  ).length;
  const urgencyScore = deal.riskLevel === "high" || deal.riskLevel === "stalled" ? 82 : 48;
  const clientScore = contact?.urgencyScore ?? urgencyScore;
  const value = deal.valueCents ? `$${(deal.valueCents / 100).toLocaleString()}` : "Not set";
  const dueDelta = formatDueDelta(deal.nextActionDueAt);
  const dueTitle = `Due: ${formatDue(new Date(deal.nextActionDueAt))}`;
  const typeLabel = contactTypeLabel(deal.type);

  return (
    <article
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", deal.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      title={typeLabel}
      className={`group rounded-md border border-l-4 border-[#e1e6dc] p-2 shadow-sm transition hover:-translate-y-px hover:shadow-md ${cardColorClass(deal.type)}`}
    >
      <div className="flex items-start gap-1.5">
        <GripVertical className="mt-0.5 shrink-0 text-[#a0a99f]" size={12} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1.5">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1.5">
                <div className="truncate text-xs font-semibold">{contact?.name ?? deal.name}</div>
                <IconChip label={dueTitle} className={dueClass(dueDelta)}>
                  {dueDelta}
                </IconChip>
                <IconChip label={`Client score: ${urgencyLabel(clientScore)} (${clientScore}/100). Completing loop boxes adds +5.`} className={urgencyClass(clientScore)}>
                  {clientScore}
                </IconChip>
                <IconChip label={`Loop progress: ${completedLoopCount}/${loopItems.length}`} className="bg-[#e9efe6] text-[#304037]">
                  {completedLoopCount}/{loopItems.length}
                </IconChip>
              </div>
              <div className="mt-0.5 truncate text-[10px] text-[#68736a]" title={`${typeLabel} · ${deal.propertyAddress ?? deal.name}`}>
                {typeLabel} · {deal.propertyAddress ?? deal.name}
              </div>
            </div>
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              aria-label={expanded ? `Collapse ${deal.name}` : `Expand ${deal.name}`}
              className="grid size-6 shrink-0 place-items-center rounded border border-[#d9ded5] bg-white/70 text-[#46534b] hover:bg-white"
            >
              {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          </div>

          <p className="mt-1.5 line-clamp-2 text-[11px] leading-4 text-[#26352c]">{deal.nextAction}</p>
        </div>
      </div>

      {expanded ? (
        <div className="mt-2.5 space-y-2.5 border-t border-[#edf0ea] pt-2.5">
          <div className="grid gap-1 rounded bg-white/70 p-2 text-xs text-[#5f6a62]">
            <div><span className="font-medium text-[#17231d]">Client:</span> {contact ? <Link href={`/people/${contact.id}`} className="hover:underline">{contact.name}</Link> : "No linked contact"}</div>
            <div><span className="font-medium text-[#17231d]">Contact:</span> {contactInfo}</div>
            <div><span className="font-medium text-[#17231d]">Stage:</span> {stageLabel(deal.stage)}</div>
            <div><span className="font-medium text-[#17231d]">Value:</span> {value}</div>
            <div><span className="font-medium text-[#17231d]">Notes:</span> {deal.notes ?? "No notes yet."}</div>
            <div><span className="font-medium text-[#17231d]">Missing items:</span> {openTasks.length ? openTasks.map((task) => task.title).join(", ") : "None logged."}</div>
          </div>

          {openTasks.length ? (
            <div className="space-y-1.5">
              {openTasks.map((task) => (
                <form key={task.id} action={markTaskDoneAction} className="flex items-center justify-between gap-2 rounded border border-[#e4e8df] p-2">
                  <input type="hidden" name="taskId" value={task.id} />
                  <span className="line-clamp-1 text-xs">{task.title}</span>
                  <button aria-label={`Mark ${task.title} done`} className="grid size-7 place-items-center rounded bg-[#dcfce7] text-[#14532d]">
                    <CheckCircle2 size={14} />
                  </button>
                </form>
              ))}
            </div>
          ) : null}

          <div className="space-y-1.5">
            <div className="text-[10px] font-semibold uppercase tracking-normal text-[#68736a]">Loop checklist · +5 score per box</div>
            {loopItems.map((item) => {
              const type = loopTaskType("deal", deal.stage, item.key);
              const done = deal.tasks.some((task) => task.type === type && task.status === "done");
              return (
                <form key={item.key} action={done ? uncompleteLoopChecklistItemAction : completeLoopChecklistItemAction} className="flex items-center justify-between gap-2 rounded border border-[#e4e8df] bg-white/70 p-2">
                  <input type="hidden" name="scope" value="deal" />
                  <input type="hidden" name="dealId" value={deal.id} />
                  {contact ? <input type="hidden" name="contactId" value={contact.id} /> : null}
                  <input type="hidden" name="stage" value={deal.stage} />
                  <input type="hidden" name="itemKey" value={item.key} />
                  <input type="hidden" name="label" value={item.label} />
                  <span className={`line-clamp-1 text-xs ${done ? "text-[#68736a] line-through" : "text-[#26352c]"}`}>{item.label}</span>
                  <button
                    className={`grid size-7 place-items-center rounded ${done ? "bg-[#dcfce7] text-[#14532d]" : "border border-[#cfd6ca] bg-white hover:bg-[#f5f7f2]"}`}
                    aria-label={done ? `Uncheck ${item.label}` : `Complete ${item.label}`}
                    title={done ? "Uncheck" : "Complete"}
                  >
                    <CheckCircle2 size={14} />
                  </button>
                </form>
              );
            })}
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-normal text-[#68736a]">Move stage</div>
            <MoveDealButtons dealId={deal.id} currentStage={deal.stage} />
          </div>

          <div className="flex flex-wrap gap-1.5">
            <form action={logCallAction}>
              <input type="hidden" name="dealId" value={deal.id} />
              <input type="hidden" name="body" value="Deal call started from Deals board." />
              <button className="grid size-8 place-items-center rounded bg-[#17231d] text-white hover:bg-[#26382f]" title="Call" aria-label="Call">
                <Phone size={14} />
              </button>
            </form>
            <form action={snoozeDealAction}>
              <input type="hidden" name="dealId" value={deal.id} />
              <input type="hidden" name="hours" value="24" />
              <button className="grid size-8 place-items-center rounded border border-[#cfd6ca] hover:bg-[#f5f7f2]" title="Snooze" aria-label="Snooze">
                <Timer size={14} />
              </button>
            </form>
            <form action={assignDealAction}>
              <input type="hidden" name="dealId" value={deal.id} />
              <button className="grid size-8 place-items-center rounded border border-[#cfd6ca] hover:bg-[#f5f7f2]" title="Assign" aria-label="Assign">
                <UserRound size={14} />
              </button>
            </form>
            <form action={closeDealAction}>
              <input type="hidden" name="dealId" value={deal.id} />
              <SecondaryButton>Close</SecondaryButton>
            </form>
          </div>

          {contact ? (
            <>
              <form action={sendContactMessageAction} className="space-y-1.5">
                <input type="hidden" name="contactId" value={contact.id} />
                <input type="hidden" name="channel" value="sms" />
                <textarea name="body" className={inputClass} placeholder="Text message" rows={2} required />
                <button className="inline-flex items-center gap-1.5 rounded bg-[#17231d] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#26382f]">
                  <MessageSquareText size={13} /> Text
                </button>
              </form>
              <form action={draftContactMessageAction} className="space-y-1.5">
                <input type="hidden" name="contactId" value={contact.id} />
                <input type="hidden" name="channel" value="email" />
                <input name="subject" className={inputClass} defaultValue="Quick deal update" />
                <textarea name="body" className={inputClass} placeholder="Email draft" rows={2} required />
                <button className="inline-flex items-center gap-1.5 rounded border border-[#cfd6ca] px-2.5 py-1.5 text-xs font-medium hover:bg-[#f5f7f2]">
                  <Mail size={13} /> Email
                </button>
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
  const [typeFilter, setTypeFilter] = useState<CardTypeFilter>("all");
  const [isPending, startTransition] = useTransition();
  const visibleDeals = typeFilter === "all" ? deals : deals.filter((deal) => normalizedCardType(deal.type) === typeFilter);

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
      <DealColorLegend activeType={typeFilter} onChange={setTypeFilter} deals={deals} />
      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[980px] grid-cols-4 gap-3">
          {dealPipelineStages.map((stage) => {
            const cards = visibleDeals.filter((deal) => stage.dealStages.includes(deal.stage as never));
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
                <Panel title={<span title={stage.description} className="cursor-help">{stage.label} · {cards.length}</span>}>
                  <p className="mb-2 min-h-8 text-[11px] leading-4 text-[#68736a]">{stage.description}</p>
                  <div className={`space-y-2 rounded-md transition ${isOver ? "bg-[#edf1e9] p-1.5" : ""}`}>
                    {cards.length ? cards.map((deal) => (
                      <div key={deal.id} onDragStart={() => setDraggingId(deal.id)} onDragEnd={() => { setDraggingId(null); setOverStage(null); }}>
                        <DealCard
                          deal={deal}
                          expanded={expandedId === deal.id}
                          onToggle={() => setExpandedId(expandedId === deal.id ? null : deal.id)}
                        />
                      </div>
                    )) : (
                      <div className="rounded border border-dashed border-[#d9ded5] p-4 text-sm text-[#68736a]">
                        {typeFilter === "all" ? "Drop deals here." : `No ${contactTypeLabel(typeFilter).toLowerCase()} deals here.`}
                      </div>
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
