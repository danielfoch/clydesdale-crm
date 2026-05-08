import Link from "next/link";
import { assignDealAction, closeDealAction, logCallAction, snoozeDealAction } from "@/app/actions";
import { Badge, Button, PageHeader, Panel } from "@/components/ui";
import { getPrisma } from "@/lib/prisma";
import { getDefaultWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const types = ["buyer", "tenant", "seller", "landlord"] as const;

export default async function DealsPage() {
  const db = getPrisma();
  const workspaceId = await getDefaultWorkspaceId();
  const deals = await db.deal.findMany({
    where: { workspaceId },
    include: { participants: { include: { contact: true } }, tasks: true },
    orderBy: [{ riskLevel: "desc" }, { nextActionDueAt: "asc" }],
  });

  return (
    <>
      <PageHeader title="Deals" subtitle="Every active deal has one next action, a deadline, and a risk level. No silent stalls." />
      <div className="grid gap-4 xl:grid-cols-4">
        {types.map((type) => (
          <Panel key={type} title={`${type[0].toUpperCase()}${type.slice(1)} pipeline`}>
            <div className="space-y-3">
              {deals.filter((deal) => deal.type === type).map((deal) => (
                  <article key={deal.id} className="space-y-2 rounded border border-[#e4e8df] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-medium">{deal.name}</h3>
                      <Badge>{deal.stage}</Badge>
                    </div>
                    <p className="text-sm text-[#5f6a62]">{deal.participants[0]?.contact ? (
                      <Link href={`/people/${deal.participants[0].contactId}`} className="hover:underline">{deal.participants[0].contact.name}</Link>
                    ) : "No contact"}</p>
                    <p className="text-sm text-[#5f6a62]">{deal.nextAction}</p>
                    <div className="text-xs text-[#5f6a62]">
                      Value: ${(deal.valueCents / 100).toLocaleString()} · Due: {deal.nextActionDueAt.toLocaleDateString()} · Risk: {deal.riskLevel}
                    </div>
                    {deal.stage !== "closed" ? (
                      <div className="flex flex-wrap gap-2">
                        <form action={logCallAction}>
                          <input type="hidden" name="dealId" value={deal.id} />
                          <input type="hidden" name="body" value="Deal call logged from Deals screen." />
                          <Button>Call</Button>
                        </form>
                        <form action={snoozeDealAction}>
                          <input type="hidden" name="dealId" value={deal.id} />
                          <input type="hidden" name="hours" value="24" />
                          <button className="rounded border border-[#cfd6ca] px-3 py-2 text-sm hover:bg-[#f5f7f2]">Snooze</button>
                        </form>
                        <form action={assignDealAction}>
                          <input type="hidden" name="dealId" value={deal.id} />
                          <button className="rounded border border-[#cfd6ca] px-3 py-2 text-sm hover:bg-[#f5f7f2]">Assign</button>
                        </form>
                        <form action={closeDealAction}>
                          <input type="hidden" name="dealId" value={deal.id} />
                          <Button>Close deal</Button>
                        </form>
                      </div>
                    ) : null}
                  </article>
                ))}
            </div>
          </Panel>
        ))}
      </div>
    </>
  );
}
