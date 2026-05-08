import Link from "next/link";
import {
  assignContactAction,
  createDealAction,
  draftContactMessageAction,
  logCallAction,
  manualLeadAction,
  markTaskDoneAction,
  sendContactMessageAction,
  snoozeContactAction,
  updateContactPipelineStageAction,
} from "@/app/actions";
import { Button, inputClass, PageHeader, Panel } from "@/components/ui";
import {
  contactTypeBadgeClass,
  contactTypeLabel,
  formatDue,
  leadPipelineStages,
  stageLabel,
  urgencyBadgeClass,
  urgencyLabel,
} from "@/lib/display";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type PipelineContact = Awaited<ReturnType<typeof getPipelineContacts>>[number];

function SecondaryButton({ children }: { children: React.ReactNode }) {
  return <button className="rounded border border-[#cfd6ca] px-3 py-2 text-sm hover:bg-[#f5f7f2]">{children}</button>;
}

function StageBadge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <span className={`rounded px-2 py-1 text-xs font-medium ${className}`}>{children}</span>;
}

function AddLeadPopover() {
  return (
    <details className="relative [&>summary::-webkit-details-marker]:hidden">
      <summary className="cursor-pointer rounded bg-[#17231d] px-3 py-2 text-sm font-medium text-white hover:bg-[#26382f]">
        Add Person
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-[min(92vw,420px)] rounded-md border border-[#d9ded5] bg-white p-4 shadow-xl">
        <form action={manualLeadAction} className="space-y-3">
          <input name="name" className={inputClass} placeholder="Name" required />
          <input name="email" className={inputClass} placeholder="Email" type="email" />
          <input name="phone" className={inputClass} placeholder="Phone" />
          <input name="source" className={inputClass} placeholder="Source" defaultValue="manual" />
          <textarea name="message" className={inputClass} placeholder="Notes for AI CRM manager" rows={4} />
          <Button>Create Lead</Button>
        </form>
      </div>
    </details>
  );
}

function MoveContactButtons({ contactId, currentStage }: { contactId: string; currentStage: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {leadPipelineStages.map((stage) => (
        <form key={stage.key} action={updateContactPipelineStageAction}>
          <input type="hidden" name="contactId" value={contactId} />
          <input type="hidden" name="stage" value={stage.moveToStage} />
          <button
            className={`rounded border px-2.5 py-1.5 text-xs ${
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

function ContactCard({ person }: { person: PipelineContact }) {
  const primaryContact = person.emails[0]?.email ?? person.phones[0]?.phone ?? "No contact info";
  const latestNote = person.notes[0]?.body ?? person.aiSummary ?? "No notes yet.";
  const openTasks = person.tasks.filter((task) => task.status === "open").slice(0, 3);
  const dealType = ["buyer", "tenant", "seller", "landlord"].includes(person.type) ? person.type : "buyer";

  return (
    <article className="rounded-md border border-[#e1e6dc] bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/people/${person.id}`} className="block truncate font-medium hover:underline">
            {person.name}
          </Link>
          <div className="mt-1 truncate text-xs text-[#68736a]">{primaryContact}</div>
        </div>
        <StageBadge className={contactTypeBadgeClass(person.type)}>{contactTypeLabel(person.type)}</StageBadge>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <StageBadge className="bg-[#e9efe6] text-[#304037]">{stageLabel(person.stage)}</StageBadge>
        <StageBadge className={urgencyBadgeClass(person.urgencyScore)}>{urgencyLabel(person.urgencyScore)}</StageBadge>
        <StageBadge className={person.nextActionDueAt < new Date() ? "bg-[#fee2e2] text-[#7f1d1d]" : "bg-[#eef2ea] text-[#46534b]"}>
          {formatDue(person.nextActionDueAt)}
        </StageBadge>
      </div>
      <p className="mt-3 line-clamp-2 text-sm text-[#26352c]">{person.nextAction}</p>
      <details className="mt-3 border-t border-[#edf0ea] pt-3 [&>summary::-webkit-details-marker]:hidden">
        <summary className="cursor-pointer text-sm font-medium text-[#17231d]">Open actions</summary>
        <div className="mt-3 space-y-4">
          <div className="rounded bg-[#f6f7f4] p-3 text-sm text-[#5f6a62]">
            <div className="font-medium text-[#17231d]">Notes for AI CRM manager</div>
            <p className="mt-1 whitespace-pre-wrap">{latestNote}</p>
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
            <MoveContactButtons contactId={person.id} currentStage={person.stage} />
          </div>

          <div className="flex flex-wrap gap-2">
            <form action={logCallAction}>
              <input type="hidden" name="contactId" value={person.id} />
              <input type="hidden" name="body" value="Call started from Pipeline." />
              <Button>Call</Button>
            </form>
            <form action={snoozeContactAction}>
              <input type="hidden" name="contactId" value={person.id} />
              <input type="hidden" name="hours" value="24" />
              <SecondaryButton>Snooze</SecondaryButton>
            </form>
            <form action={assignContactAction}>
              <input type="hidden" name="contactId" value={person.id} />
              <SecondaryButton>Assign</SecondaryButton>
            </form>
            <form action={createDealAction}>
              <input type="hidden" name="contactId" value={person.id} />
              <input type="hidden" name="name" value={`${person.name} client work`} />
              <input type="hidden" name="type" value={dealType} />
              <input type="hidden" name="stage" value="met_with_client" />
              <input type="hidden" name="nextAction" value="Confirm client criteria and deal plan" />
              <SecondaryButton>Convert to Client</SecondaryButton>
            </form>
          </div>

          <form action={sendContactMessageAction} className="space-y-2">
            <input type="hidden" name="contactId" value={person.id} />
            <input type="hidden" name="channel" value="sms" />
            <textarea name="body" className={inputClass} defaultValue={person.suggestedFirstResponse ?? ""} placeholder="Text message" rows={3} required />
            <Button>Send Text</Button>
          </form>

          <form action={draftContactMessageAction} className="space-y-2">
            <input type="hidden" name="contactId" value={person.id} />
            <input type="hidden" name="channel" value="email" />
            <input name="subject" className={inputClass} defaultValue="Quick follow-up" />
            <textarea name="body" className={inputClass} defaultValue={person.suggestedFirstResponse ?? ""} placeholder="Email draft" rows={3} required />
            <Button>Draft Email</Button>
          </form>
        </div>
      </details>
    </article>
  );
}

async function getPipelineContacts() {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  return db.contact.findMany({
    where: {
      workspaceId,
      stage: { in: leadPipelineStages.flatMap((stage) => [...stage.contactStages]) as never },
      primaryDeals: { none: { stage: { not: "closed" } } },
    },
    include: {
      emails: true,
      phones: true,
      notes: { orderBy: { createdAt: "desc" }, take: 1 },
      tasks: { orderBy: { dueAt: "asc" }, take: 5 },
      consents: true,
    },
    orderBy: [{ urgencyScore: "desc" }, { nextActionDueAt: "asc" }],
  });
}

export default async function PipelinePage() {
  const people = await getPipelineContacts();

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader title="Pipeline" subtitle="Who am I turning into a client?" />
        <AddLeadPopover />
      </div>
      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[1120px] grid-cols-4 gap-4">
          {leadPipelineStages.map((stage) => {
            const cards = people.filter((person) => stage.contactStages.includes(person.stage as never));
            return (
              <Panel key={stage.key} title={`${stage.label} · ${cards.length}`}>
                <p className="mb-3 min-h-10 text-xs text-[#68736a]">{stage.description}</p>
                <div className="space-y-3">
                  {cards.length ? cards.map((person) => <ContactCard key={person.id} person={person} />) : (
                    <div className="rounded border border-dashed border-[#d9ded5] p-4 text-sm text-[#68736a]">No {stage.label.toLowerCase()}s here.</div>
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
