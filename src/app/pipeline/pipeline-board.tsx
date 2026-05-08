"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Mail,
  MessageSquareText,
  Phone,
  Timer,
  UserRound,
} from "lucide-react";
import {
  assignContactAction,
  createDealAction,
  draftContactMessageAction,
  logCallAction,
  markTaskDoneAction,
  sendContactMessageAction,
  snoozeContactAction,
  updateContactPipelineStageAction,
} from "@/app/actions";
import { inputClass, Panel } from "@/components/ui";
import {
  contactTypeLabel,
  formatDue,
  formatDueDelta,
  leadPipelineStages,
  stageLabel,
  urgencyLabel,
} from "@/lib/display";

type PipelineTask = {
  id: string;
  title: string;
  status: string;
  dueAt: string | null;
};

export type PipelinePerson = {
  id: string;
  name: string;
  stage: string;
  type: string;
  urgencyScore: number;
  aiSummary: string | null;
  suggestedFirstResponse: string | null;
  source: string | null;
  lastTouchAt: string | null;
  nextAction: string;
  nextActionDueAt: string;
  nextActionReason: string | null;
  emails: { email: string }[];
  phones: { phone: string }[];
  notes: { body: string }[];
  tasks: PipelineTask[];
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

function urgencyClass(score: number) {
  if (score >= 75) return "bg-[#fef3c7] text-[#78350f]";
  if (score >= 40) return "bg-[#e0f2fe] text-[#075985]";
  return "bg-[#ecfdf5] text-[#166534]";
}

function urgencyShort(score: number) {
  if (score >= 75) return "H";
  if (score >= 40) return "M";
  return "L";
}

function dueClass(value: string) {
  if (value.startsWith("-")) return "bg-[#fee2e2] text-[#7f1d1d]";
  if (value === "0d") return "bg-[#fef3c7] text-[#78350f]";
  return "bg-[#eef2ea] text-[#46534b]";
}

function stageFormData(contactId: string, stage: string) {
  const formData = new FormData();
  formData.set("contactId", contactId);
  formData.set("stage", stage);
  return formData;
}

function MoveStageButtons({ contactId, currentStage }: { contactId: string; currentStage: string }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {leadPipelineStages.map((stage) => (
        <form key={stage.key} action={updateContactPipelineStageAction}>
          <input type="hidden" name="contactId" value={contactId} />
          <input type="hidden" name="stage" value={stage.moveToStage} />
          <button
            className={`w-full rounded border px-2 py-1.5 text-xs ${
              stage.contactStages.includes(currentStage as never)
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

function ContactCard({
  person,
  expanded,
  onToggle,
}: {
  person: PipelinePerson;
  expanded: boolean;
  onToggle: () => void;
}) {
  const primaryContact = person.emails[0]?.email ?? person.phones[0]?.phone ?? "No contact info";
  const latestNote = person.notes[0]?.body ?? person.aiSummary ?? "No notes yet.";
  const openTasks = person.tasks.filter((task) => task.status === "open").slice(0, 2);
  const dealType = ["buyer", "tenant", "seller", "landlord"].includes(person.type) ? person.type : "buyer";
  const dueDelta = formatDueDelta(person.nextActionDueAt);
  const dueTitle = `Due: ${formatDue(new Date(person.nextActionDueAt))}`;
  const lastTouch = person.lastTouchAt ? formatDueDelta(person.lastTouchAt) : "none";
  const typeLabel = contactTypeLabel(person.type);

  return (
    <article
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", person.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      title={typeLabel}
      className={`group rounded-md border border-l-4 border-[#e1e6dc] p-2 shadow-sm transition hover:-translate-y-px hover:shadow-md ${cardColorClass(person.type)}`}
    >
      <div className="flex items-start gap-1.5">
        <GripVertical className="mt-0.5 shrink-0 text-[#a0a99f]" size={12} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1.5">
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1.5">
                <Link href={`/people/${person.id}`} className="truncate text-xs font-semibold hover:underline">
                  {person.name}
                </Link>
                <IconChip label={dueTitle} className={dueClass(dueDelta)}>
                  {dueDelta}
                </IconChip>
                <IconChip label={`Urgency: ${urgencyLabel(person.urgencyScore)} (${person.urgencyScore}/100)`} className={urgencyClass(person.urgencyScore)}>
                  {urgencyShort(person.urgencyScore)}
                </IconChip>
              </div>
              <div className="mt-0.5 truncate text-[10px] text-[#68736a]" title={`${typeLabel} · ${primaryContact}`}>{typeLabel} · {primaryContact}</div>
            </div>
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              aria-label={expanded ? `Collapse ${person.name}` : `Expand ${person.name}`}
              className="grid size-6 shrink-0 place-items-center rounded border border-[#d9ded5] bg-white/70 text-[#46534b] hover:bg-white"
            >
              {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </button>
          </div>

          <p className="mt-1.5 line-clamp-2 text-[11px] leading-4 text-[#26352c]">{person.nextAction}</p>
        </div>
      </div>

      {expanded ? (
        <div className="mt-2.5 space-y-2.5 border-t border-[#edf0ea] pt-2.5">
          <div className="grid gap-1 rounded bg-white/70 p-2 text-xs text-[#5f6a62]">
            <div><span className="font-medium text-[#17231d]">Stage:</span> {stageLabel(person.stage)}</div>
            <div><span className="font-medium text-[#17231d]">Source:</span> {person.source ?? "Unknown"}</div>
            <div><span className="font-medium text-[#17231d]">Last touch:</span> {lastTouch}</div>
            <div><span className="font-medium text-[#17231d]">Why:</span> {person.nextActionReason ?? "Next best action"}</div>
            <div><span className="font-medium text-[#17231d]">Notes:</span> {latestNote}</div>
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

          <MoveStageButtons contactId={person.id} currentStage={person.stage} />

          <div className="flex flex-wrap gap-1.5">
            <form action={logCallAction}>
              <input type="hidden" name="contactId" value={person.id} />
              <input type="hidden" name="body" value="Call started from Pipeline." />
              <button className="grid size-8 place-items-center rounded bg-[#17231d] text-white hover:bg-[#26382f]" title="Call" aria-label="Call">
                <Phone size={14} />
              </button>
            </form>
            <form action={snoozeContactAction}>
              <input type="hidden" name="contactId" value={person.id} />
              <input type="hidden" name="hours" value="24" />
              <button className="grid size-8 place-items-center rounded border border-[#cfd6ca] hover:bg-[#f5f7f2]" title="Snooze" aria-label="Snooze">
                <Timer size={14} />
              </button>
            </form>
            <form action={assignContactAction}>
              <input type="hidden" name="contactId" value={person.id} />
              <button className="grid size-8 place-items-center rounded border border-[#cfd6ca] hover:bg-[#f5f7f2]" title="Assign" aria-label="Assign">
                <UserRound size={14} />
              </button>
            </form>
            <form action={createDealAction}>
              <input type="hidden" name="contactId" value={person.id} />
              <input type="hidden" name="name" value={`${person.name} client work`} />
              <input type="hidden" name="type" value={dealType} />
              <input type="hidden" name="stage" value="met_with_client" />
              <input type="hidden" name="nextAction" value="Confirm client criteria and deal plan" />
              <SecondaryButton>Convert</SecondaryButton>
            </form>
          </div>

          <form action={sendContactMessageAction} className="space-y-1.5">
            <input type="hidden" name="contactId" value={person.id} />
            <input type="hidden" name="channel" value="sms" />
            <textarea name="body" className={inputClass} defaultValue={person.suggestedFirstResponse ?? ""} placeholder="Text message" rows={2} required />
            <button className="inline-flex items-center gap-1.5 rounded bg-[#17231d] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#26382f]">
              <MessageSquareText size={13} /> Text
            </button>
          </form>

          <form action={draftContactMessageAction} className="space-y-1.5">
            <input type="hidden" name="contactId" value={person.id} />
            <input type="hidden" name="channel" value="email" />
            <input name="subject" className={inputClass} defaultValue="Quick follow-up" />
            <textarea name="body" className={inputClass} defaultValue={person.suggestedFirstResponse ?? ""} placeholder="Email draft" rows={2} required />
            <button className="inline-flex items-center gap-1.5 rounded border border-[#cfd6ca] px-2.5 py-1.5 text-xs font-medium hover:bg-[#f5f7f2]">
              <Mail size={13} /> Email
            </button>
          </form>
        </div>
      ) : null}
    </article>
  );
}

export function PipelineBoard({ people }: { people: PipelinePerson[] }) {
  const router = useRouter();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function moveContact(contactId: string, stage: string) {
    startTransition(async () => {
      await updateContactPipelineStageAction(stageFormData(contactId, stage));
      setDraggingId(null);
      setOverStage(null);
      router.refresh();
    });
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="grid min-w-[880px] grid-cols-4 gap-2.5">
        {leadPipelineStages.map((stage) => {
          const cards = people.filter((person) => stage.contactStages.includes(person.stage as never));
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
                const contactId = event.dataTransfer.getData("text/plain") || draggingId;
                if (contactId) moveContact(contactId, stage.moveToStage);
              }}
              className={isOver ? "rounded-md ring-2 ring-[#17231d]/25" : "rounded-md"}
            >
              <Panel title={`${stage.label} · ${cards.length}`}>
                <p className="mb-2 min-h-7 text-[10px] leading-4 text-[#68736a]">{stage.description}</p>
                <div className={`space-y-2 rounded-md transition ${isOver ? "bg-[#edf1e9] p-1.5" : ""}`}>
                  {cards.length ? cards.map((person) => (
                    <div key={person.id} onDragStart={() => setDraggingId(person.id)} onDragEnd={() => { setDraggingId(null); setOverStage(null); }}>
                      <ContactCard
                        person={person}
                        expanded={expandedId === person.id}
                        onToggle={() => setExpandedId(expandedId === person.id ? null : person.id)}
                      />
                    </div>
                  )) : (
                    <div className="rounded border border-dashed border-[#d9ded5] p-3 text-xs text-[#68736a]">
                      Drop cards here.
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
  );
}
