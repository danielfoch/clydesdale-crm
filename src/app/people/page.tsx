import Link from "next/link";
import { createDealAction, manualLeadAction } from "@/app/actions";
import { Badge, Button, inputClass, PageHeader, Panel } from "@/components/ui";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const filters = ["New", "Hot", "No reply", "Needs follow-up", "Active client", "Past client", "Opted out"];

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
      <PageHeader title="People" subtitle="Every relationship in one list. If there is no next action, it is broken." />
      <div className="mb-4 flex flex-wrap gap-2">{filters.map((filter) => <Badge key={filter}>{filter}</Badge>)}</div>
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Panel title="Fast lead add">
          <form action={manualLeadAction} className="space-y-3">
            <input name="name" className={inputClass} placeholder="Name" required />
            <input name="email" className={inputClass} placeholder="Email" type="email" />
            <input name="phone" className={inputClass} placeholder="Phone" />
            <input name="source" className={inputClass} placeholder="Source" defaultValue="manual" />
            <textarea name="message" className={inputClass} placeholder="What do they want?" rows={4} />
            <Button>Create lead</Button>
          </form>
        </Panel>
        <Panel title="Relationships">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-[#e4e8df] text-xs uppercase text-[#5f6a62]">
                <tr>
                  <th className="py-2 pr-3">Person</th>
                  <th className="py-2 pr-3">Intent</th>
                  <th className="py-2 pr-3">Stage</th>
                  <th className="py-2 pr-3">Urgency</th>
                  <th className="py-2 pr-3">Next action</th>
                  <th className="py-2 pr-3">Due</th>
                  <th className="py-2 pr-3">Convert</th>
                </tr>
              </thead>
              <tbody>
                {people.map((person) => {
                  const optedOut = person.consents.some((consent) => consent.status === "opted_out");
                  return (
                    <tr key={person.id} className="border-b border-[#edf0ea] align-top">
                      <td className="py-3 pr-3">
                        <Link href={`/people/${person.id}`} className="font-medium hover:underline">{person.name}</Link>
                        <div className="text-xs text-[#5f6a62]">{person.emails[0]?.email ?? person.phones[0]?.phone ?? "No contact info"}</div>
                      </td>
                      <td className="py-3 pr-3"><Badge>{person.type}</Badge></td>
                      <td className="py-3 pr-3">{person.stage}</td>
                      <td className="py-3 pr-3">{person.urgencyScore}</td>
                      <td className="max-w-[320px] py-3 pr-3">
                        <div className="font-medium">{optedOut ? "Opted out" : person.nextAction}</div>
                        <div className="text-xs text-[#5f6a62]">{person.nextActionReason ?? person.aiSummary}</div>
                      </td>
                      <td className="py-3 pr-3">{person.nextActionDueAt.toLocaleString()}</td>
                      <td className="py-3 pr-3">
                        {["new", "attempting_contact", "nurturing", "appointment_set"].includes(person.stage) ? (
                          <form action={createDealAction}>
                            <input type="hidden" name="contactId" value={person.id} />
                            <input type="hidden" name="name" value={`${person.name} opportunity`} />
                            <input type="hidden" name="type" value={["buyer", "tenant", "seller", "landlord"].includes(person.type) ? person.type : "buyer"} />
                            <button className="rounded bg-[#17231d] px-2 py-1 text-xs text-white">Deal</button>
                          </form>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </>
  );
}
