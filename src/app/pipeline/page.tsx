import { manualLeadAction } from "@/app/actions";
import { Button, inputClass, PageHeader } from "@/components/ui";
import { leadPipelineStages } from "@/lib/display";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspaceId } from "@/lib/workspace";
import { PipelineBoard, type PipelinePerson } from "./pipeline-board";

export const dynamic = "force-dynamic";

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
      tasks: { orderBy: { dueAt: "asc" }, take: 5, select: { id: true, title: true, status: true, dueAt: true } },
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
      status: task.status,
      dueAt: task.dueAt?.toISOString() ?? null,
    })),
  }));
}

export default async function PipelinePage() {
  const people = await getPipelineContacts();

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader title="Pipeline" subtitle="Who am I turning into a client?" />
        <AddLeadPopover />
      </div>
      <PipelineBoard people={people} />
    </>
  );
}
