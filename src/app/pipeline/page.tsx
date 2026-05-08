import { manualLeadAction } from "@/app/actions";
import { Button, inputClass } from "@/components/ui";
import { leadPipelineStages } from "@/lib/display";
import { getMotivationQuotes } from "@/lib/motivation-quotes";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspaceId } from "@/lib/workspace";
import { MotivationRotator } from "@/app/today/motivation-rotator";
import { PipelineBoard, type PipelinePerson } from "./pipeline-board";

export const dynamic = "force-dynamic";

function AddLeadPopover() {
  return (
    <details className="relative inline-block self-start [&>summary::-webkit-details-marker]:hidden">
      <summary className="inline-flex cursor-pointer items-center rounded bg-[#17231d] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[#26382f]">
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

async function getPipelineContacts(): Promise<PipelinePerson[]> {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const people = await db.contact.findMany({
    where: {
      workspaceId,
      stage: { in: leadPipelineStages.flatMap((stage) => [...stage.contactStages]) as never },
      primaryDeals: { none: { stage: { not: "closed" } } },
    },
    include: {
      emails: { select: { email: true } },
      phones: { select: { phone: true } },
      notes: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true } },
      tasks: { orderBy: { createdAt: "asc" }, take: 20, select: { id: true, title: true, type: true, status: true, dueAt: true, completedAt: true } },
    },
    orderBy: [{ urgencyScore: "desc" }, { nextActionDueAt: "asc" }],
  });

  return people.map((person) => ({
    id: person.id,
    name: person.name,
    stage: person.stage,
    type: person.type,
    urgencyScore: person.urgencyScore,
    aiSummary: person.aiSummary,
    suggestedFirstResponse: person.suggestedFirstResponse,
    source: person.source,
    lastTouchAt: person.lastTouchAt?.toISOString() ?? null,
    nextAction: person.nextAction,
    nextActionDueAt: person.nextActionDueAt.toISOString(),
    nextActionReason: person.nextActionReason,
    emails: person.emails,
    phones: person.phones,
    notes: person.notes,
    tasks: person.tasks.map((task) => ({
      id: task.id,
      title: task.title,
      type: task.type,
      status: task.status,
      dueAt: task.dueAt?.toISOString() ?? null,
      completedAt: task.completedAt?.toISOString() ?? null,
    })),
  }));
}

export default async function PipelinePage() {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const [people, motivationQuotes] = await Promise.all([
    getPipelineContacts(),
    getMotivationQuotes(workspaceId, db),
  ]);

  return (
    <>
      <div className="mb-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(420px,560px)] lg:items-start">
        <div className="flex items-start justify-between gap-3">
          <header className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-normal text-[#17231d]">Pipeline</h1>
            <p className="max-w-3xl text-sm text-[#5f6a62]">Who am I turning into a client?</p>
          </header>
          <AddLeadPopover />
        </div>
        <MotivationRotator quotes={motivationQuotes.map((quote) => ({
          id: quote.id,
          source: quote.source,
          text: quote.text,
          upvotes: quote.upvotes,
          downvotes: quote.downvotes,
        }))} />
      </div>
      <PipelineBoard people={people} />
    </>
  );
}
