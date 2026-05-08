import Link from "next/link";
import {
  assignContactAction,
  createDealAction,
  createTaskAction,
  draftContactMessageAction,
  logCallAction,
  manualLeadAction,
  snoozeContactAction,
} from "@/app/actions";
import { Badge, Button, inputClass, PageHeader, Panel } from "@/components/ui";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const filters = ["New", "Hot", "No reply", "Needs follow-up", "Active client", "Past client", "Opted out"];

function SecondaryButton({ children }: { children: React.ReactNode }) {
  return <button className="rounded border border-[#cfd6ca] px-3 py-2 text-sm hover:bg-[#f5f7f2]">{children}</button>;
}

function LeadAddPopover() {
  return (
    <details className="relative [&>summary::-webkit-details-marker]:hidden">
      <summary className="cursor-pointer rounded bg-[#17231d] px-3 py-2 text-sm font-medium text-white hover:bg-[#26382f]">
        Add lead
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-[min(92vw,420px)] rounded-md border border-[#d9ded5] bg-white p-4 shadow-xl">
        <form action={manualLeadAction} className="space-y-3">
          <input name="name" className={inputClass} placeholder="Name" required />
          <input name="email" className={inputClass} placeholder="Email" type="email" />
          <input name="phone" className={inputClass} placeholder="Phone" />
          <input name="source" className={inputClass} placeholder="Source" defaultValue="manual" />
          <textarea name="message" className={inputClass} placeholder="Notes for AI CRM manager" rows={4} />
          <Button>Create lead</Button>
        </form>
      </div>
    </details>
  );
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
            <input type="hidden" name="body" value="Call logged from People list." />
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
          <input name="title" className={inputClass} placeholder="New task" required />
          <input name="dueAt" className={inputClass} type="datetime-local" />
          <Button>Create task</Button>
        </form>
        <form action={draftContactMessageAction} className="space-y-2">
          <input type="hidden" name="contactId" value={contactId} />
          <input type="hidden" name="channel" value="sms" />
          <textarea name="body" className={inputClass} placeholder="Text draft" rows={3} required />
          <Button>Save SMS draft</Button>
        </form>
      </div>
    </details>
  );
}

export default async function PeoplePage() {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const people = await db.contact.findMany({
    where: { workspaceId },
    include: { emails: true, phones: true, tags: true, owner: true, consents: true },
    orderBy: [{ nextActionDueAt: "asc" }, { urgencyScore: "desc" }],
    take: 80,
  });

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <PageHeader title="People" subtitle="Every relationship in one list. If there is no next action, it is broken." />
        <LeadAddPopover />
      </div>
      <div className="mb-4 flex flex-wrap gap-2">{filters.map((filter) => <Badge key={filter}>{filter}</Badge>)}</div>
      <Panel title="Relationships">
        <div className="divide-y divide-[#edf0ea]">
          {people.map((person) => {
            const optedOut = person.consents.some((consent) => consent.status === "opted_out");
            return (
              <article key={person.id} className="grid gap-3 py-4 md:grid-cols-[1.4fr_1fr_auto] md:items-center">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/people/${person.id}`} className="font-medium hover:underline">{person.name}</Link>
                    <Badge>{person.type}</Badge>
                    <Badge>{person.stage}</Badge>
                    {person.urgencyScore >= 75 ? <Badge>{person.urgencyScore}/100</Badge> : null}
                  </div>
                  <div className="mt-1 text-xs text-[#5f6a62]">{person.emails[0]?.email ?? person.phones[0]?.phone ?? "No contact info"}</div>
                </div>
                <div>
                  <div className="text-sm font-medium">{optedOut ? "Opted out" : person.nextAction}</div>
                  <div className="mt-1 text-xs text-[#5f6a62]">
                    Due {person.nextActionDueAt.toLocaleString()} · {person.nextActionReason ?? person.aiSummary}
                  </div>
                </div>
                <ContactDropdown contactId={person.id} contactName={person.name} contactType={person.type} />
              </article>
            );
          })}
        </div>
      </Panel>
    </>
  );
}
